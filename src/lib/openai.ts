import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY が設定されていません。");
}

export const openai = new OpenAI({
  apiKey
});