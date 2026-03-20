import { messagingApi } from "@line/bot-sdk";

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!channelAccessToken) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKEN が設定されていません。");
}

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken
});