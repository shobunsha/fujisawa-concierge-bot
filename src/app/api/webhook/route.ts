export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { validateSignature, webhook } from "@line/bot-sdk";
import { lineClient } from "@/lib/line";
import { openai } from "@/lib/openai";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { buildFlexMessage, InventJson } from "@/lib/flex";

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

  // 1文字は基本NG
  if (text.length <= 1) return true;

  // 記号だけ
  if (/^[\s!-/:-@[-`{-~！-／：-＠［-｀｛-～]+$/.test(text)) return true;

  // 同じ文字の繰り返し（ああ、aaa、111など）
  if (/^(.)\1+$/.test(text)) return true;

  // 2文字以下の曖昧入力
  const shortAmbiguousList = [
    "あ",
    "い",
    "う",
    "え",
    "お",
    "ai",
    "aa",
    "a",
    "1",
    "2",
    "3",
    "うー",
    "あー",
    "へ",
    "ほ",
    "ん",
    "？",
    "?",
    "。",
    "、、",
    "…"
  ];
  if (text.length <= 2 && shortAmbiguousList.includes(text.toLowerCase())) return true;

  return false;
}

async function generateTourStory(userRequest: string): Promise<InventJson> {
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

ユーザーの希望や気分に合わせて、
藤沢・江の島・辻堂・湘南エリアの実在する観光地やスポットを入れた
短いストーリー形式で紹介してください。

必ず日本語で回答してください。
空想の発明や架空設定は作らないでください。
実在する地名・観光地名を使ってください。
回答はLINE向けに短く、わかりやすくしてください。
回答は3〜5行程度の読みやすい内容にしてください。
少しだけユーモアを入れてOKです。

以下のJSON形式で必ず返してください。
{
  "spot_name": "紹介の中心となる観光地名",
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
        content: `ユーザーの希望・相談: ${userRequest}`
      }
    ]
  });

  const content = response.choices[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);

  if (!parsed) {
    return {
      spot_name: "江の島",
      spot_area: "片瀬海岸",
      story_title: "はじめての藤沢なら、まずはここ",
      story_text:
        "片瀬江ノ島駅から海風を感じながら江の島へ。参道で食べ歩きを楽しみ、のんびり景色を眺めるだけでも湘南気分がぐっと高まります。迷ったときに外しにくい王道コースです。",
      recommend_point:
        "海・散策・食べ歩きのバランスがよく、初めてでも楽しみやすいです。",
      concierge_message:
        "迷ったら江の島からで大丈夫ですぞ。藤沢らしさを気持ちよく味わえます。"
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

  if (isNgInput(userText)) {
    await replyNgInput(event.replyToken!);
    return;
  }

  const tourData = await generateTourStory(userText);
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