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
      typeof parsed?.item_name === "string" &&
      typeof parsed?.tech_background === "string" &&
      typeof parsed?.materials === "string" &&
      typeof parsed?.concierge_message === "string"
    ) {
      return parsed as InventJson;
    }

    return null;
  } catch {
    return null;
  }
}

async function generateInventIdea(userTrouble: string): Promise<InventJson> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.9,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `ユーザーの悩み: ${userTrouble}`
      }
    ]
  });

  const content = response.choices[0]?.message?.content ?? "";
  const parsed = safeJsonParse(content);

  if (!parsed) {
    return {
      item_name: "江の島式・ひらめき追い風ブースター",
      tech_background:
        "江の島の潮風と、いすゞ自動車や日本精工(NSK)のものづくり精神を掛け合わせ、悩みで止まりがちな気持ちを前へ進める架空技術として設計した発明品です。",
      materials:
        "片瀬の砂、江ノ電をイメージした回転パーツ、遊行寺の歴史に着想を得た落ち着きの繊維",
      concierge_message:
        "悩みがあるのは前に進もうとしている証拠ですな。藤沢の風に乗って、次の一歩を軽やかに踏み出すのですよ！"
    };
  }

  return parsed;
}

async function handleEvent(event: webhook.Event) {
  if (event.type !== "message") return;
  if (event.message.type !== "text") return;

  const userText = event.message.text.trim();
  if (!userText) return;

  const inventData = await generateInventIdea(userText);
  const flexMessage = buildFlexMessage(inventData);

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