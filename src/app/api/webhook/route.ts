export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { validateSignature, webhook } from "@line/bot-sdk";
import { lineClient } from "@/lib/line";
import { openai } from "@/lib/openai";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { buildFlexMessage, InventJson } from "@/lib/flex";
import gourmetData from "@/data/fujisawa-gourmet.json";

type GourmetSpot = {
  name: string;
  area: string;
  category: string;
  desc: string;
  tags: string[];
};

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
  if (text.includes("カフェ")) keywords.push("カフェ");
  if (text.includes("観光")) keywords.push("観光");
  if (text.includes("デート")) keywords.push("デート");
  if (text.includes("子連れ")) keywords.push("子連れ");
  if (text.includes("雨")) keywords.push("雨の日");
  if (text.includes("買い物")) keywords.push("買い物");
  if (text.includes("公園")) keywords.push("公園");
  if (text.includes("散歩")) keywords.push("散歩");
  if (text.includes("歴史")) keywords.push("歴史");
  if (text.includes("のんびり")) keywords.push("のんびり");
  if (text.includes("駅近")) keywords.push("駅近");
  if (text.includes("藤沢")) keywords.push("藤沢");
  if (text.includes("辻堂")) keywords.push("辻堂");
  if (text.includes("江の島")) keywords.push("江の島");
  if (text.includes("湘南")) keywords.push("湘南");

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

  if (text.includes("ランチ") && spot.tags.includes("ランチ")) score += 4;
  if (text.includes("デート") && spot.tags.includes("デート")) score += 4;
  if (text.includes("子連れ") && spot.tags.includes("子連れ")) score += 4;
  if (text.includes("雨") && spot.tags.includes("雨の日")) score += 4;
  if (text.includes("カフェ") && spot.category === "カフェ") score += 4;
  if (text.includes("観光") && spot.category === "観光") score += 4;

  return score;
}

function pickRecommendedSpots(userText: string, limit = 3): GourmetSpot[] {
  const spots = gourmetData as GourmetSpot[];

  const scored = spots
    .map((spot) => ({
      spot,
      score: scoreSpot(spot, userText)
    }))
    .sort((a, b) => b.score - a.score);

  const positive = scored.filter((item) => item.score > 0).map((item) => item.spot);

  if (positive.length > 0) {
    return positive.slice(0, limit);
  }

  return spots.slice(0, limit);
}

async function generateTourStory(
  userRequest: string,
  candidates: GourmetSpot[]
): Promise<InventJson> {
  const candidateText = candidates
    .map(
      (spot, index) =>
        `${index + 1}. ${spot.name}（${spot.area} / ${spot.category}）\n説明: ${spot.desc}\nタグ: ${spot.tags.join("、")}`
    )
    .join("\n\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.8,
    max_tokens: 200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
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

以下のJSON形式で必ず返してください。
{
  "spot_name": "紹介の中心となるスポット名",
  "spot_area": "エリア名",
  "story_title": "短いタイトル",
  "story_text": "情景が浮かぶ短いストーリー文",
  "recommend_point": "おすすめ理由を一言で",
  "concierge_message": "親しみやすい締めのひとこと"
}
`
      },
      {
        role: "user",
        content: `ユーザーの希望・相談: ${userRequest}

候補スポット:
${candidateText}`
      }
    ]
  });

  const content = response.choices[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);

  if (!parsed) {
    const first = candidates[0];

    return {
      spot_name: first.name,
      spot_area: first.area,
      story_title: `${first.name}で藤沢らしさをひと休み`,
      story_text: `${first.area}にある${first.name}は、${first.desc}。気負わず立ち寄りやすく、藤沢散策の途中にも組み込みやすいスポットです。`,
      recommend_point: `${first.category}目的でも立ち寄りやすく、会話のきっかけも作りやすいです。`,
      concierge_message: `迷ったらまずここで大丈夫ですぞ。いい流れを作りやすい一手です。`
    };
  }

  return parsed;
}

async function replyNgInput(replyToken: string) {
  await lineClient.replyMessage({
    replyToken,
    messages: [
      {
        type: "text",
        text:
          "もう少し具体的に教えてください😊\n\nおすすめの聞き方はこちらです。\n・藤沢でランチ\n・雨の日でも楽しめる場所\n・子連れで行けるスポット\n・デートにおすすめの場所"
      }
    ]
  });
}

async function handleEvent(event: webhook.Event) {
  if (event.type !== "message") return;
  if (event.message.type !== "text") return;

  const userText = event.message.text.trim();
  if (!userText) return;

  // ① 1問目スタート
  if (userText === "はじめる" || userText === "探す") {
    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [
        {
          type: "text",
          text: "何をしたいですか？",
          quickReply: {
            items: [
              {
                type: "action",
                action: { type: "message", label: "🍽 ランチ", text: "ランチ" }
              },
              {
                type: "action",
                action: { type: "message", label: "☕ カフェ", text: "カフェ" }
              },
              {
                type: "action",
                action: { type: "message", label: "🎡 観光", text: "観光" }
              },
              {
                type: "action",
                action: { type: "message", label: "🛍 買い物", text: "買い物" }
              }
            ]
          }
        }
      ]
    });
    return;
  }

  // ② 2問目
  if (["ランチ", "カフェ", "観光", "買い物"].includes(userText)) {
    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [
        {
          type: "text",
          text: "誰と行きますか？",
          quickReply: {
            items: [
              {
                type: "action",
                action: { type: "message", label: "👤 ひとり", text: `${userText}|ひとり` }
              },
              {
                type: "action",
                action: { type: "message", label: "💑 デート", text: `${userText}|デート` }
              },
              {
                type: "action",
                action: { type: "message", label: "👨‍👩‍👧 子連れ", text: `${userText}|子連れ` }
              },
              {
                type: "action",
                action: { type: "message", label: "👥 友人", text: `${userText}|友人` }
              }
            ]
          }
        }
      ]
    });
    return;
  }

  // ③ 3問目
  if (userText.includes("|") && userText.split("|").length === 2) {
    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [
        {
          type: "text",
          text: "どんな過ごし方？",
          quickReply: {
            items: [
              {
                type: "action",
                action: { type: "message", label: "✨ おしゃれ", text: `${userText}|おしゃれ` }
              },
              {
                type: "action",
                action: { type: "message", label: "😌 ゆったり", text: `${userText}|ゆったり` }
              },
              {
                type: "action",
                action: { type: "message", label: "💪 がっつり", text: `${userText}|がっつり` }
              },
              {
                type: "action",
                action: { type: "message", label: "☔ 雨の日OK", text: `${userText}|雨の日` }
              }
            ]
          }
        }
      ]
    });
    return;
  }

  // ④ 3つ揃ったら検索
  if (userText.split("|").length === 3) {
    const query = userText.replaceAll("|", " ");

    const candidates = pickRecommendedSpots(query, 3);
    const tourData = await generateTourStory(query, candidates);
    const flexMessage = buildFlexMessage(tourData);

    await lineClient.replyMessage({
      replyToken: event.replyToken!,
      messages: [flexMessage as any]
    });
    return;
  }

  // ⑤ 従来の自由入力も残す
  if (isNgInput(userText)) {
    await replyNgInput(event.replyToken!);
    return;
  }

  const candidates = pickRecommendedSpots(userText, 3);
  const tourData = await generateTourStory(userText, candidates);
  const flexMessage = buildFlexMessage(tourData);

  await lineClient.replyMessage({
    replyToken: event.replyToken!,
    messages: [flexMessage as any]
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