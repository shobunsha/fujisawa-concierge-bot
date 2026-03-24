export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { messagingApi, validateSignature, webhook, type Message } from "@line/bot-sdk";
import { lineClient } from "@/lib/line";
import { openai } from "@/lib/openai";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import {
  buildFlexMessage,
  buildFlexMessageEn,
  buildFlexMessageZh,
  InventJson
} from "@/lib/flex";
import gourmetData from "@/data/fujisawa-gourmet.json";

type GourmetSpot = {
  name: string;
  area: string;
  category: string;
  desc: string;
  tags: string[];
  url?: string;
};

const LANGUAGE_PREFIXES = ["ja|", "en|", "zh|"] as const;
const RETRY_PREFIXES = ["ja|more|", "en|more|", "zh|more|"] as const;
const AREA_KEYS = [
  "藤沢駅周辺",
  "江の島・片瀬",
  "辻堂",
  "湘南台",
  "鵠沼・本鵠沼",
  "エリア指定なし"
] as const;
const ROOT_MENU_KEYS = ["ランチ", "カフェ", "観光"] as const;
const AREA_MATCH_MAP = {
  "藤沢駅周辺": ["藤沢", "南藤沢"],
  "江の島・片瀬": ["江の島", "片瀬", "片瀬江ノ島"],
  辻堂: ["辻堂"],
  湘南台: ["湘南台"],
  "鵠沼・本鵠沼": ["鵠沼", "本鵠沼"],
  "エリア指定なし": []
} as const;
type AreaKey = (typeof AREA_KEYS)[number];
const DIRECTION_KEYWORDS = {
  おしゃれ: ["カフェ", "スイーツ", "雑貨", "静か", "海", "景色", "デート"],
  ゆったり: ["静か", "のんびり", "散歩", "公園", "海", "カフェ", "休憩"],
  がっつり: ["ランチ", "和食", "肉", "ラーメン", "中華", "定食", "名物"],
  "雨の日": ["屋内", "駅近", "水族館", "買い物", "カフェ", "観光", "静か"]
} as const;

const recentSpotsByQuery = new Map<string, string[]>();
const RANDOM_POOL_SIZE = 20;
const RECENT_HISTORY_LIMIT = 5;

function rememberRecentSpots(queryKey: string, spots: GourmetSpot[]) {
  const prev = recentSpotsByQuery.get(queryKey) ?? [];
  const next = [...spots.map((spot) => spot.name), ...prev];

  const deduped: string[] = [];
  for (const name of next) {
    if (!deduped.includes(name)) deduped.push(name);
  }

  recentSpotsByQuery.set(queryKey, deduped.slice(0, RECENT_HISTORY_LIMIT));
}

function getRecentSpotNames(queryKey: string): string[] {
  return recentSpotsByQuery.get(queryKey) ?? [];
}

function makeQueryKey(userText: string, scopeKey = "global"): string {
  return `${scopeKey}:${userText.trim().toLowerCase()}`;
}

function getHistoryScopeKey(event: webhook.Event): string {
  const source = event.source;

  if (!source) return "global";
  if ("userId" in source && source.userId) return `user:${source.userId}`;
  if ("groupId" in source && source.groupId) return `group:${source.groupId}`;
  if ("roomId" in source && source.roomId) return `room:${source.roomId}`;

  return source.type;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickWeightedRandomItems<T>(items: T[], limit: number): T[] {
  const pool = [...items];
  const picked: T[] = [];

  while (pool.length > 0 && picked.length < limit) {
    const weights = pool.map((_, index) => 1 / Math.sqrt(index + 1));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let threshold = Math.random() * totalWeight;

    let selectedIndex = 0;
    for (let i = 0; i < weights.length; i++) {
      threshold -= weights[i];
      if (threshold <= 0) {
        selectedIndex = i;
        break;
      }
    }

    picked.push(pool[selectedIndex]);
    pool.splice(selectedIndex, 1);
  }

  return picked;
}

function stripLanguagePrefix(text: string): string {
  for (const prefix of LANGUAGE_PREFIXES) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length);
    }
  }
  return text;
}

function extractRetryQuery(text: string): string | null {
  for (const prefix of RETRY_PREFIXES) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length).trim();
    }
  }

  return null;
}

function detectLanguage(text: string): "ja" | "en" | "zh" {
  if (text.startsWith("ja|")) return "ja";
  if (text.startsWith("en|")) return "en";
  if (text.startsWith("zh|")) return "zh";

  const normalizedText = stripLanguagePrefix(text).trim();

  if (
    (ROOT_MENU_KEYS as readonly string[]).includes(normalizedText) ||
    (AREA_KEYS as readonly string[]).includes(normalizedText) ||
    normalizedText
      .split("|")
      .some(
        (part) =>
          (ROOT_MENU_KEYS as readonly string[]).includes(part) ||
          (AREA_KEYS as readonly string[]).includes(part)
      )
  ) {
    return "ja";
  }

  if (/[ぁ-んァ-ヶー]/.test(normalizedText)) return "ja";
  if (/[a-zA-Z]/.test(normalizedText)) return "en";
  if (/[\u4e00-\u9fff]/.test(normalizedText)) return "zh";

  return "ja";
}

function getTokyoHour(): number {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "numeric",
    hour12: false
  }).formatToParts(new Date());

  const hourText = parts.find((part) => part.type === "hour")?.value ?? "0";
  return Number(hourText);
}

function getTimeOfDay(lang: "ja" | "en" | "zh" = "ja"): string {
  const hour = getTokyoHour();

  if (lang === "en") {
    if (hour < 11) return "morning";
    if (hour < 15) return "afternoon";
    if (hour < 18) return "evening";
    return "night";
  }

  if (lang === "zh") {
    if (hour < 11) return "早上";
    if (hour < 15) return "中午";
    if (hour < 18) return "下午";
    return "晚上";
  }

  if (hour < 11) return "朝";
  if (hour < 15) return "昼";
  if (hour < 18) return "午後";
  return "夜";
}

function getWeather(): string {
  // 仮実装。将来的にここだけAPI差し替え
  return "晴れ";
}

function localizeWeather(
  weather: string,
  lang: "ja" | "en" | "zh" = "ja"
): string {
  if (lang === "en") {
    if (weather === "晴れ") return "sunny";
    if (weather === "雨") return "rainy";
    if (weather === "曇り") return "cloudy";
    return weather;
  }

  if (lang === "zh") {
    if (weather === "晴れ") return "晴天";
    if (weather === "雨") return "雨天";
    if (weather === "曇り") return "阴天";
    return weather;
  }

  return weather;
}

function normalizeSpotName(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "")
    .replace(/　/g, "")
    .replace(/（.*?）/g, "")
    .replace(/\(.*?\)/g, "");
}

function findSelectedSpot(
  candidates: GourmetSpot[],
  spotName: string
): GourmetSpot | undefined {
  const normalizedTarget = normalizeSpotName(spotName);

  return candidates.find(
    (spot) => normalizeSpotName(spot.name) === normalizedTarget
  );
}

function buildStartMessage() {
  return {
    type: "flex",
    altText: "藤沢コンシェルジュ",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "藤沢コンシェルジュ",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "まずはエリアを選んでください",
            size: "md"
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "📍 藤沢駅周辺", text: "ja|藤沢駅周辺" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🌊 江の島・片瀬", text: "ja|江の島・片瀬" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🏖 辻堂", text: "ja|辻堂" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🚉 湘南台", text: "ja|湘南台" }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "🏡 鵠沼・本鵠沼", text: "ja|鵠沼・本鵠沼" }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "🗺 エリア指定なし", text: "ja|エリア指定なし" }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildStartMessageEn() {
  return {
    type: "flex",
    altText: "Fujisawa Concierge",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "Fujisawa Concierge",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "Choose an area first",
            size: "md"
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "📍 Fujisawa Station", text: "en|藤沢駅周辺" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🌊 Enoshima / Katase", text: "en|江の島・片瀬" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🏖 Tsujido", text: "en|辻堂" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🚉 Shonandai", text: "en|湘南台" }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "🏡 Kugenuma / Hongenuma", text: "en|鵠沼・本鵠沼" }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "🗺 Any area", text: "en|エリア指定なし" }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildStartMessageZh() {
  return {
    type: "flex",
    altText: "藤泽导览AI",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "藤泽导览AI",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "请先选择区域",
            size: "md"
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "📍 藤泽站周边", text: "zh|藤沢駅周辺" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🌊 江之岛・片濑", text: "zh|江の島・片瀬" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🏖 辻堂", text: "zh|辻堂" }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🚉 湘南台", text: "zh|湘南台" }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "🏡 鹄沼・本鹄沼", text: "zh|鵠沼・本鵠沼" }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "🗺 不指定区域", text: "zh|エリア指定なし" }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildCompanionMessage(baseText: string) {
  return {
    type: "flex",
    altText: "ジャンルを選んでください",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "ジャンルを選んでください",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "行きたいジャンルを選んでください",
            size: "sm",
            color: "#666666",
            wrap: true
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🍽 ランチ", text: `${baseText}|ランチ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "☕ カフェ", text: `${baseText}|カフェ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🎡 観光", text: `${baseText}|観光` }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildCompanionMessageEn(baseText: string) {
  return {
    type: "flex",
    altText: "Choose a category",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "Choose a category",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "Please choose what kind of place you want",
            size: "sm",
            color: "#666666",
            wrap: true
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🍽 Lunch", text: `${baseText}|ランチ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "☕ Cafe", text: `${baseText}|カフェ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🎡 Sightseeing", text: `${baseText}|観光` }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildCompanionMessageZh(baseText: string) {
  return {
    type: "flex",
    altText: "请选择类型",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "请选择类型",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "请选择您想去的类型",
            size: "sm",
            color: "#666666",
            wrap: true
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🍽 午餐", text: `${baseText}|ランチ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "☕ 咖啡", text: `${baseText}|カフェ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "🎡 观光", text: `${baseText}|観光` }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildMoodMessage(baseText: string) {
  return {
    type: "flex",
    altText: "どんな過ごし方？",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "どんな過ごし方？",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "気分に近いものを選んでください",
            size: "sm",
            color: "#666666",
            wrap: true
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "✨ おしゃれ", text: `${baseText}|おしゃれ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "😌 ゆったり", text: `${baseText}|ゆったり` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "💪 がっつり", text: `${baseText}|がっつり` }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "☔ 雨の日OK", text: `${baseText}|雨の日` }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildMoodMessageEn(baseText: string) {
  return {
    type: "flex",
    altText: "What kind of mood?",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "What kind of mood?",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "Choose the option closest to your mood",
            size: "sm",
            color: "#666666",
            wrap: true
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "✨ Stylish", text: `${baseText}|おしゃれ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "😌 Relaxing", text: `${baseText}|ゆったり` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "💪 Hearty", text: `${baseText}|がっつり` }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "☔ Rainy day OK", text: `${baseText}|雨の日` }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function buildMoodMessageZh(baseText: string) {
  return {
    type: "flex",
    altText: "想怎么度过？",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        contents: [
          {
            type: "text",
            text: "想怎么度过？",
            size: "xl",
            weight: "bold"
          },
          {
            type: "text",
            text: "请选择最接近您心情的选项",
            size: "sm",
            color: "#666666",
            wrap: true
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "✨ 时尚", text: `${baseText}|おしゃれ` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "😌 悠闲", text: `${baseText}|ゆったり` }
          },
          {
            type: "button",
            style: "primary",
            action: { type: "message", label: "💪 丰盛", text: `${baseText}|がっつり` }
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "message", label: "☔ 雨天也可以", text: `${baseText}|雨の日` }
          }
        ]
      }
    }
  } as const satisfies Message;
}

function safeJsonParse(text: string): InventJson | null {
  try {
    const cleaned = text
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (
      typeof parsed?.spot_name === "string" &&
      typeof parsed?.spot_area === "string" &&
      typeof parsed?.story_title === "string" &&
      typeof parsed?.story_text === "string" &&
      typeof parsed?.recommend_point === "string" &&
      typeof parsed?.concierge_message === "string"
    ) {
      return parsed as InventJson;
    }

    return null;
  } catch {
    return null;
  }
}

function isNgInput(userText: string) {
  const text = userText.trim();

  if (!text) return true;
  if (text.length <= 1) return true;
  if (/^[\s!-/:-@[-`{-~！-／：-＠［-｀｛-～]+$/.test(text)) return true;
  if (/^(.)\1+$/.test(text)) return true;

  const shortAmbiguousList = [
    "あ",
    "い",
    "う",
    "え",
    "お",
    "a",
    "aa",
    "ai",
    "1",
    "2",
    "3",
    "ん",
    "?",
    "？",
    "。",
    "…"
  ];

  if (text.length <= 2 && shortAmbiguousList.includes(text.toLowerCase())) {
    return true;
  }

  return false;
}

function extractKeywords(userText: string) {
  const text = userText.toLowerCase();
  const keywords: string[] = [];

  if (text.includes("ランチ")) keywords.push("ランチ");
  if (text.includes("lunch")) keywords.push("ランチ");
  if (text.includes("午餐")) keywords.push("ランチ");

  if (text.includes("カフェ")) keywords.push("カフェ");
  if (text.includes("cafe")) keywords.push("カフェ");
  if (text.includes("coffee")) keywords.push("カフェ");
  if (text.includes("咖啡")) keywords.push("カフェ");

  if (text.includes("観光")) keywords.push("観光");
  if (text.includes("sightseeing")) keywords.push("観光");
  if (text.includes("tour")) keywords.push("観光");
  if (text.includes("观光")) keywords.push("観光");
  if (text.includes("旅游")) keywords.push("観光");

  if (text.includes("デート")) keywords.push("デート");
  if (text.includes("date")) keywords.push("デート");
  if (text.includes("约会")) keywords.push("デート");

  if (text.includes("子連れ")) keywords.push("子連れ");
  if (text.includes("family")) keywords.push("子連れ");
  if (text.includes("kids")) keywords.push("子連れ");
  if (text.includes("child")) keywords.push("子連れ");
  if (text.includes("亲子")) keywords.push("子連れ");
  if (text.includes("孩子")) keywords.push("子連れ");
  if (text.includes("家庭")) keywords.push("子連れ");

  if (text.includes("雨")) keywords.push("雨の日");
  if (text.includes("rain")) keywords.push("雨の日");
  if (text.includes("雨天")) keywords.push("雨の日");

  if (text.includes("買い物")) keywords.push("買い物");
  if (text.includes("shopping")) keywords.push("買い物");
  if (text.includes("购物")) keywords.push("買い物");

  if (text.includes("公園")) keywords.push("公園");
  if (text.includes("park")) keywords.push("公園");
  if (text.includes("公园")) keywords.push("公園");

  if (text.includes("散歩")) keywords.push("散歩");
  if (text.includes("walk")) keywords.push("散歩");
  if (text.includes("散步")) keywords.push("散歩");

  if (text.includes("歴史")) keywords.push("歴史");
  if (text.includes("history")) keywords.push("歴史");
  if (text.includes("历史")) keywords.push("歴史");

  if (text.includes("のんびり")) keywords.push("のんびり");
  if (text.includes("relax")) keywords.push("のんびり");
  if (text.includes("悠闲")) keywords.push("のんびり");

  if (text.includes("駅近")) keywords.push("駅近");
  if (text.includes("near station")) keywords.push("駅近");

  if (text.includes("藤沢")) keywords.push("藤沢");
  if (text.includes("fujisawa")) keywords.push("藤沢");
  if (text.includes("藤泽")) keywords.push("藤沢");

  if (text.includes("辻堂")) keywords.push("辻堂");
  if (text.includes("tsujido")) keywords.push("辻堂");

  if (text.includes("江の島")) keywords.push("江の島");
  if (text.includes("enoshima")) keywords.push("江の島");
  if (text.includes("江之岛")) keywords.push("江の島");

  if (text.includes("湘南")) keywords.push("湘南");
  if (text.includes("shonan")) keywords.push("湘南");

  if (text.includes("おしゃれ")) keywords.push("おしゃれ");
  if (text.includes("stylish")) keywords.push("おしゃれ");
  if (text.includes("时尚")) keywords.push("おしゃれ");

  if (text.includes("ゆったり")) keywords.push("ゆったり");
  if (text.includes("relaxing")) keywords.push("ゆったり");
  if (text.includes("悠闲")) keywords.push("ゆったり");

  if (text.includes("がっつり")) keywords.push("がっつり");
  if (text.includes("hearty")) keywords.push("がっつり");
  if (text.includes("big meal")) keywords.push("がっつり");
  if (text.includes("丰盛")) keywords.push("がっつり");

  return keywords;
}

function scoreSpot(spot: GourmetSpot, userText: string) {
  const keywords = extractKeywords(userText);
  let score = 0;

  for (const keyword of keywords) {
    if (spot.category.includes(keyword)) score += 3;
    if (spot.area.includes(keyword)) score += 3;
    if (spot.name.includes(keyword)) score += 4;
    if (spot.desc.includes(keyword)) score += 2;
    if (spot.tags.some((tag) => tag.includes(keyword))) score += 3;
  }

  const text = userText.toLowerCase();
  const searchableText = [
    spot.name,
    spot.area,
    spot.category,
    spot.desc,
    ...spot.tags
  ]
    .join(" ")
    .toLowerCase();

  if ((text.includes("ランチ") || text.includes("lunch") || text.includes("午餐")) && spot.tags.includes("ランチ")) score += 4;
  if ((text.includes("デート") || text.includes("date") || text.includes("约会")) && spot.tags.includes("デート")) score += 4;
  if ((text.includes("子連れ") || text.includes("family") || text.includes("kids") || text.includes("亲子") || text.includes("家庭")) && spot.tags.includes("子連れ")) score += 4;
  if ((text.includes("雨") || text.includes("rain") || text.includes("雨天")) && spot.tags.includes("雨の日")) score += 4;
  if ((text.includes("カフェ") || text.includes("cafe") || text.includes("coffee") || text.includes("咖啡")) && spot.category === "カフェ") score += 4;
  if ((text.includes("観光") || text.includes("sightseeing") || text.includes("tour") || text.includes("观光") || text.includes("旅游")) && spot.category === "観光") score += 4;
  if ((text.includes("買い物") || text.includes("shopping") || text.includes("购物")) && spot.category === "買い物") score += 4;
  if ((text.includes("おしゃれ") || text.includes("stylish") || text.includes("时尚")) && spot.tags.includes("おしゃれ")) score += 4;
  if ((text.includes("ゆったり") || text.includes("relaxing") || text.includes("悠闲")) && spot.tags.includes("ゆったり")) score += 4;
  if ((text.includes("がっつり") || text.includes("hearty") || text.includes("丰盛")) && spot.tags.includes("がっつり")) score += 4;

  for (const [direction, relatedWords] of Object.entries(DIRECTION_KEYWORDS)) {
    if (!userText.includes(direction)) continue;

    if (spot.tags.includes(direction)) {
      score += 6;
    }

    for (const relatedWord of relatedWords) {
      if (spot.tags.some((tag) => tag.includes(relatedWord))) score += 2;
      if (searchableText.includes(relatedWord.toLowerCase())) score += 1;
    }
  }

  const selectedArea = AREA_KEYS.find((area) => userText.includes(area));

  if (selectedArea && selectedArea !== "エリア指定なし") {
    const areaTerms = AREA_MATCH_MAP[selectedArea as AreaKey];
    const isAreaMatch = areaTerms.some((term: string) => spot.area.includes(term));

    if (isAreaMatch) {
      score += 8;
    } else {
      score += 1;
    }
  }

  return score;
}

function pickRecommendedSpots(
  userText: string,
  scopeKey = "global",
  limit = 1
): GourmetSpot[] {
  const spots = gourmetData as GourmetSpot[];
  const queryKey = makeQueryKey(userText, scopeKey);
  const recentNames = getRecentSpotNames(queryKey);

  const scored = spots
    .map((spot) => ({
      spot,
      score: scoreSpot(spot, userText)
    }))
    .sort((a, b) => b.score - a.score);

  const positive = scored.filter((item) => item.score > 0);

  if (positive.length > 0) {
    const topPool = positive.slice(0, RANDOM_POOL_SIZE);
    const nonRecent = topPool.filter((item) => !recentNames.includes(item.spot.name));
    const sourcePool = nonRecent.length >= limit ? nonRecent : topPool;

    const picked = pickWeightedRandomItems(sourcePool, limit)
      .slice(0, limit)
      .map((item) => item.spot);

    rememberRecentSpots(queryKey, picked);
    return picked;
  }

  const fallbackPool = shuffleArray(
    spots.filter((spot) => !recentNames.includes(spot.name))
  );

  const picked =
    fallbackPool.length >= limit
      ? fallbackPool.slice(0, limit)
      : shuffleArray(spots).slice(0, limit);

  rememberRecentSpots(queryKey, picked);
  return picked;
}

async function generateTourStory(
  userRequest: string,
  candidates: GourmetSpot[],
  lang: "ja" | "en" | "zh" = "ja",
  timeOfDay?: string,
  weather?: string
): Promise<InventJson> {
  const candidateText =
    lang === "en"
      ? candidates
          .map(
            (spot, index) =>
              `${index + 1}. ${spot.name} (${spot.area} / ${spot.category})\nDescription: ${spot.desc}\nTags: ${spot.tags.join(", ")}`
          )
          .join("\n\n")
      : lang === "zh"
      ? candidates
          .map(
            (spot, index) =>
              `${index + 1}. ${spot.name}（${spot.area} / ${spot.category}）\n说明: ${spot.desc}\n标签: ${spot.tags.join("、")}`
          )
          .join("\n\n")
      : candidates
          .map(
            (spot, index) =>
              `${index + 1}. ${spot.name}（${spot.area} / ${spot.category}）\n説明: ${spot.desc}\nタグ: ${spot.tags.join("、")}`
          )
          .join("\n\n");

  const systemPrompt =
    lang === "en"
      ? `
${SYSTEM_PROMPT}

You are "Fujisawa Concierge AI".
You know Fujisawa, Enoshima, Tsujido, and the Shonan area well.
Be friendly, concise, and natural.

Choose the single best real spot from the candidates below.
Do not invent place names.
Do not use fictional settings.
Write the ENTIRE response in English.
All fields in the JSON must be written in English.
Keep it short and easy to read for LINE.
Consider time of day and weather in your recommendation.
Treat the provided time of day and weather as system-given conditions.
Do not say you cannot know the weather.
Use the spot name exactly as written in the candidate list.

Return ONLY this JSON:
{
  "spot_name": "name of the main spot",
  "spot_area": "area name",
  "story_title": "short title",
  "story_text": "short story-like recommendation in English",
  "recommend_point": "short reason in English",
  "concierge_message": "friendly closing line in English"
}
`
      : lang === "zh"
      ? `
${SYSTEM_PROMPT}

你是“藤泽观光导览AI”。
你非常熟悉藤泽、江之岛、辻堂和湘南地区。
请用自然、亲切、简洁的中文进行介绍。

请从下面候选地点中选出最适合用户的一个真实地点。
不要编造店名或景点。
不要使用虚构设定。
请全部使用中文回答。
所有 JSON 字段内容都必须是中文。
内容请简短，适合 LINE 阅读。
请结合时间段和天气进行推荐。
时间段和天气是系统提供的条件，请直接据此推荐。
不要写“无法判断天气”之类的表述。
景点名称必须与候选列表中的名称完全一致。

只返回以下 JSON：
{
  "spot_name": "主要地点名称",
  "spot_area": "地区名称",
  "story_title": "简短标题",
  "story_text": "简短且有画面感的中文介绍",
  "recommend_point": "简短推荐理由",
  "concierge_message": "亲切的结尾一句话"
}
`
      : `
${SYSTEM_PROMPT}

あなたは「藤沢の観光コンシェルジュAI」です。
地元（藤沢・江の島・辻堂・湘南）に詳しく、
親しみやすくフレンドリーに案内してください。

以下の候補スポットの中から、ユーザーの希望に最も合うものを1つ選び、
短いストーリー形式で紹介してください。

必ず候補の中にある実在スポット名だけを使ってください。
候補にない店名や観光地名は作らないでください。
空想の発明や架空設定は作らないでください。
回答はLINE向けに短く、わかりやすくしてください。
回答は3〜5行程度の読みやすい内容にしてください。
少しだけユーモアを入れてOKです。
回答は必ず日本語で書いてください。
時間帯や天気も考慮して最適な提案をしてください。
時間帯と天気はシステムから与えられた条件です。
「天気がわからない」「判断できない」とは書かず、その条件を前提に提案してください。
スポット名は候補にある名称を一字一句変えずに使ってください。

以下のJSON形式で必ず返してください。
{
  "spot_name": "紹介の中心となるスポット名",
  "spot_area": "エリア名",
  "story_title": "短いタイトル",
  "story_text": "情景が浮かぶ短いストーリー文",
  "recommend_point": "おすすめ理由を一言で",
  "concierge_message": "親しみやすい締めのひとこと"
}
`;

  const userPrompt =
    lang === "en"
      ? `User conditions:
${userRequest}
Time of day: ${timeOfDay ?? "unknown"}
Weather: ${weather ?? "unknown"}

Candidate spots:
${candidateText}`
      : lang === "zh"
      ? `用户条件:
${userRequest}
时间段: ${timeOfDay ?? "未知"}
天气: ${weather ?? "未知"}

候选地点:
${candidateText}`
      : `ユーザー条件:
${userRequest}
時間帯: ${timeOfDay ?? "不明"}
天気: ${weather ?? "不明"}

候補スポット:
${candidateText}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    max_tokens: 200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ]
  });

  const content = response.choices[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);

  if (!parsed) {
    const first = candidates[0];

    if (lang === "en") {
      return {
        spot_name: first.name,
        spot_area: first.area,
        story_title: `A good stop in Fujisawa: ${first.name}`,
        story_text: `${first.name} in ${first.area} is an easy place to visit during a walk around Fujisawa. ${first.desc}`,
        recommend_point: "A convenient and enjoyable option for this kind of outing.",
        concierge_message: "If you are not sure, this is a safe and pleasant choice."
      };
    }

    if (lang === "zh") {
      return {
        spot_name: first.name,
        spot_area: first.area,
        story_title: `${first.name}：藤泽不错的一站`,
        story_text: `${first.name}位于${first.area}，很适合在藤泽散步途中顺路前往。${first.desc}`,
        recommend_point: "这是一个轻松又方便的选择。",
        concierge_message: "如果拿不准，选这里通常不会出错。"
      };
    }

    return {
      spot_name: first.name,
      spot_area: first.area,
      story_title: `${first.name}で藤沢らしさをひと休み`,
      story_text: `${first.area}にある${first.name}は、${first.desc}。気負わず立ち寄りやすく、藤沢散策の途中にも組み込みやすいスポットです。`,
      recommend_point: `${first.category}目的でも立ち寄りやすく、会話のきっかけも作りやすいです。`,
      concierge_message: "迷ったらまずここで大丈夫ですぞ。いい流れを作りやすい一手です。"
    };
  }

  return parsed;
}

async function replyNgInput(
  replyToken: string,
  lang: "ja" | "en" | "zh" = "ja"
) {
  await lineClient.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text:
          lang === "en"
            ? "Please tell me a little more 😊\n\nHere are some examples:\n・Lunch in Fujisawa\n・Places to enjoy on a rainy day\n・Family-friendly spots\n・Places for a date"
            : lang === "zh"
            ? "请再具体一点告诉我 😊\n\n例如：\n・藤泽午餐\n・雨天也能去的地方\n・适合亲子的景点\n・适合约会的地方"
            : "もう少し具体的に教えてください😊\n\nおすすめの聞き方はこちらです。\n・藤沢でランチ\n・雨の日でも楽しめる場所\n・子連れで行けるスポット\n・デートにおすすめの場所"
      }
    ]
  });
}

async function handleEvent(event: webhook.Event) {
  if (event.type !== "message") return;
  if (event.message.type !== "text") return;

  const userText = event.message.text.trim();
  if (!userText) return;

  const lang = detectLanguage(userText);
  const normalizedText = stripLanguagePrefix(userText);
  const historyScopeKey = getHistoryScopeKey(event);
  const retryQuery = extractRetryQuery(userText);

  if (retryQuery) {
    const candidates = pickRecommendedSpots(retryQuery, historyScopeKey, 1);
    const timeOfDay = getTimeOfDay(lang);
    const weather = localizeWeather(getWeather(), lang);

    const tourData = await generateTourStory(
      retryQuery,
      candidates,
      lang,
      timeOfDay,
      weather
    );

    const selectedSpot = findSelectedSpot(candidates, tourData.spot_name);
    const retryText = `${lang}|more|${retryQuery}`;

    const flexMessage: messagingApi.Message =
      lang === "en"
        ? buildFlexMessageEn(tourData, retryText, selectedSpot?.url)
        : lang === "zh"
        ? buildFlexMessageZh(tourData, retryText, selectedSpot?.url)
        : buildFlexMessage(tourData, retryText, selectedSpot?.url);

    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [flexMessage]
    });
    return;
  }

  if (
    userText === "探す" ||
    userText.toLowerCase() === "search" ||
    userText === "en|search" ||
    userText === "zh|search" ||
    userText === "搜索"
  ) {
    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [
        lang === "en"
          ? buildStartMessageEn()
          : lang === "zh"
          ? buildStartMessageZh()
          : buildStartMessage()
      ]
    });
    return;
  }

  if ((AREA_KEYS as readonly string[]).includes(normalizedText)) {
    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [
        lang === "en"
          ? buildCompanionMessageEn(userText)
          : lang === "zh"
          ? buildCompanionMessageZh(userText)
          : buildCompanionMessage(userText)
      ]
    });
    return;
  }

  if (normalizedText.includes("|") && normalizedText.split("|").length === 2) {
    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [
        lang === "en"
          ? buildMoodMessageEn(userText)
          : lang === "zh"
          ? buildMoodMessageZh(userText)
          : buildMoodMessage(userText)
      ]
    });
    return;
  }

  if (normalizedText.split("|").length === 3) {
    const cleanedText = stripLanguagePrefix(userText);
    const query = cleanedText.replaceAll("|", " ");
    const candidates = pickRecommendedSpots(query, historyScopeKey, 1);
    const timeOfDay = getTimeOfDay(lang);
    const weather = localizeWeather(getWeather(), lang);

    const tourData = await generateTourStory(
      query,
      candidates,
      lang,
      timeOfDay,
      weather
    );

    const selectedSpot = findSelectedSpot(candidates, tourData.spot_name);
    const retryText = `${lang}|more|${query}`;

    const flexMessage: messagingApi.Message =
      lang === "en"
        ? buildFlexMessageEn(tourData, retryText, selectedSpot?.url)
        : lang === "zh"
        ? buildFlexMessageZh(tourData, retryText, selectedSpot?.url)
        : buildFlexMessage(tourData, retryText, selectedSpot?.url);

    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [flexMessage]
    });
    return;
  }

  if (isNgInput(userText)) {
    await replyNgInput(event.replyToken!, lang);
    return;
  }

  const candidates = pickRecommendedSpots(userText, historyScopeKey, 1);
  const timeOfDay = getTimeOfDay(lang);
  const weather = localizeWeather(getWeather(), lang);

  const tourData = await generateTourStory(
    userText,
    candidates,
    lang,
    timeOfDay,
    weather
  );

  const selectedSpot = findSelectedSpot(candidates, tourData.spot_name);
  const retryText = `${lang}|more|${userText}`;

  const flexMessage: messagingApi.Message =
    lang === "en"
      ? buildFlexMessageEn(tourData, retryText, selectedSpot?.url)
      : lang === "zh"
      ? buildFlexMessageZh(tourData, retryText, selectedSpot?.url)
      : buildFlexMessage(tourData, retryText, selectedSpot?.url);

  await lineClient.replyMessage({
    replyToken: event.replyToken!,
    messages: [flexMessage]
  });
}

export async function POST(req: NextRequest) {
  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      return NextResponse.json(
        { ok: false, error: "LINE_CHANNEL_SECRET が未設定です。" },
        { status: 500 }
      );
    }

    const signature = req.headers.get("x-line-signature");
    if (!signature) {
      return NextResponse.json(
        { ok: false, error: "x-line-signature がありません。" },
        { status: 400 }
      );
    }

    const bodyText = await req.text();
    const isValid = validateSignature(bodyText, channelSecret, signature);

    if (!isValid) {
      return NextResponse.json(
        { ok: false, error: "署名検証に失敗しました。" },
        { status: 401 }
      );
    }

    const body = JSON.parse(bodyText) as webhook.CallbackRequest;
    const events = body.events ?? [];

    await Promise.all(events.map(handleEvent));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { ok: false, error: "Webhook処理中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "LINE webhook endpoint is running."
  });
}
