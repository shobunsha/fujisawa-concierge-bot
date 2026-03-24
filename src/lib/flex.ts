import { messagingApi } from "@line/bot-sdk";

export type InventJson = {
  spot_name: string;
  spot_area: string;
  story_title: string;
  story_text: string;
  recommend_point: string;
  concierge_message: string;
};

function buildFooter(label: string, url?: string): messagingApi.FlexBox | undefined {
  if (!url) return undefined;

  return {
    type: "box",
    layout: "vertical",
    spacing: "sm",
    contents: [
      {
        type: "button",
        style: "link",
        action: {
          type: "uri",
          label,
          uri: url
        }
      }
    ]
  };
}

export function buildFlexMessage(
  data: InventJson,
  url?: string
): messagingApi.FlexMessage {
  const footer = buildFooter("公式サイトを見る", url);

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
      },
      footer
    }
  } satisfies messagingApi.FlexMessage;
}

export function buildFlexMessageEn(
  data: InventJson,
  url?: string
): messagingApi.FlexMessage {
  const footer = buildFooter("Open website", url);

  return {
    type: "flex",
    altText: `${data.spot_name} | ${data.story_title}`,
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
            text: "Fujisawa Concierge AI",
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
                text: "Spot",
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
                text: "Area",
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
            text: "Story",
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
            text: "Why this place",
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
      },
      footer
    }
  } satisfies messagingApi.FlexMessage;
}

export function buildFlexMessageZh(
  data: InventJson,
  url?: string
): messagingApi.FlexMessage {
  const footer = buildFooter("查看官网", url);

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
            text: "藤泽导览AI",
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
                text: "地点",
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
                text: "区域",
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
            text: "推荐故事",
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
            text: "推荐理由",
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
      },
      footer
    }
  } satisfies messagingApi.FlexMessage;
}
