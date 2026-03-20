import type { FlexMessage } from "@line/bot-sdk";

export type InventJson = {
  spot_name: string;
  spot_area: string;
  story_title: string;
  story_text: string;
  recommend_point: string;
  concierge_message: string;
};

export function buildFlexMessage(data: InventJson): FlexMessage {
  return {
    type: "flex",
    altText: `${data.spot_name}｜${data.story_title}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "藤沢コンシェルジュAI",
            size: "sm",
            color: "#1D4ED8",
            weight: "bold"
          },
          {
            type: "text",
            text: data.story_title,
            size: "xl",
            weight: "bold",
            wrap: true,
            color: "#111827"
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "スポット",
                size: "sm",
                color: "#6B7280",
                flex: 2
              },
              {
                type: "text",
                text: data.spot_name,
                size: "sm",
                color: "#111827",
                wrap: true,
                flex: 5,
                weight: "bold"
              }
            ]
          },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "エリア",
                size: "sm",
                color: "#6B7280",
                flex: 2
              },
              {
                type: "text",
                text: data.spot_area,
                size: "sm",
                color: "#111827",
                wrap: true,
                flex: 5
              }
            ]
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "text",
            text: "ストーリー",
            size: "sm",
            color: "#1D4ED8",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: data.story_text,
            size: "md",
            color: "#111827",
            wrap: true
          },
          {
            type: "text",
            text: "おすすめポイント",
            size: "sm",
            color: "#1D4ED8",
            weight: "bold",
            margin: "md"
          },
          {
            type: "text",
            text: data.recommend_point,
            size: "sm",
            color: "#111827",
            wrap: true
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "text",
            text: data.concierge_message,
            size: "sm",
            color: "#374151",
            wrap: true,
            margin: "md"
          }
        ],
        paddingAll: "20px"
      }
    } as const
  };
}