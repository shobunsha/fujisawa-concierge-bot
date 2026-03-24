import { messagingApi } from "@line/bot-sdk";

export type InventJson = {
  spot_name: string;
  spot_area: string;
  story_title: string;
  story_text: string;
  recommend_point: string;
  concierge_message: string;
};

function buildGoogleMapsUrl(query?: string): string | undefined {
  const normalizedQuery = query?.trim();
  if (!normalizedQuery) return undefined;

  return `https://www.google.com/maps?q=${encodeURIComponent(normalizedQuery)}`;
}

function buildFooter(
  detailLabel: string,
  mapLabel: string,
  spotName: string,
  url?: string
): messagingApi.FlexBox | undefined {
  const mapUrl = buildGoogleMapsUrl(spotName);

  if (!url && !mapUrl) return undefined;

  const contents: messagingApi.FlexButton[] = [];

  if (url) {
    contents.push({
      type: "button",
      style: "primary",
      height: "sm",
      color: "#1D4ED8",
      action: {
        type: "uri",
        label: detailLabel,
        uri: url
      }
    });
  }

  if (mapUrl) {
    contents.push({
      type: "button",
      style: url ? "secondary" : "primary",
      height: "sm",
      color: url ? undefined : "#1D4ED8",
      action: {
        type: "uri",
        label: mapLabel,
        uri: mapUrl
      }
    });
  }

  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents,
    paddingAll: "16px"
  };
}

export function buildFlexMessage(
  data: InventJson,
  url?: string
): messagingApi.FlexMessage {
  const footer = buildFooter("詳細を見る", "地図を見る", data.spot_name, url);

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
  const footer = buildFooter("View details", "View map", data.spot_name, url);

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
  const footer = buildFooter("查看详情", "查看地图", data.spot_name, url);

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
