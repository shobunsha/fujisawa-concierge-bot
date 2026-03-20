import { messagingApi } from "@line/bot-sdk";

export type InventJson = {
  item_name: string;
  tech_background: string;
  materials: string;
  concierge_message: string;
};

export function buildFlexMessage(data: InventJson): messagingApi.FlexMessage {
  return {
    type: "flex",
    altText: `藤沢コンシェルジュ特選：${data.item_name}`,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0E7490",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "藤沢コンシェルジュ特選",
            color: "#FFFFFF",
            weight: "bold",
            size: "sm"
          },
          {
            type: "text",
            text: "発明証明書",
            color: "#FFFFFF",
            weight: "bold",
            size: "xl",
            margin: "sm"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "lg",
        paddingAll: "18px",
        contents: [
          {
            type: "text",
            text: data.item_name,
            weight: "bold",
            size: "xl",
            wrap: true,
            color: "#111827"
          },
          {
            type: "separator",
            margin: "md"
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: "【技術背景】",
                weight: "bold",
                size: "sm",
                color: "#0F766E"
              },
              {
                type: "text",
                text: `・${data.tech_background}`,
                wrap: true,
                size: "sm",
                color: "#374151"
              },
              {
                type: "text",
                text: "【使用素材】",
                weight: "bold",
                size: "sm",
                color: "#0F766E",
                margin: "md"
              },
              {
                type: "text",
                text: `・${data.materials}`,
                wrap: true,
                size: "sm",
                color: "#374151"
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#F0FDFA",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "md",
            contents: [
              {
                type: "text",
                text: "👨‍🔬",
                size: "xxl",
                flex: 0
              },
              {
                type: "box",
                layout: "vertical",
                contents: [
                  {
                    type: "text",
                    text: "コンシェルジュより",
                    weight: "bold",
                    size: "sm",
                    color: "#115E59"
                  },
                  {
                    type: "text",
                    text: data.concierge_message,
                    wrap: true,
                    size: "sm",
                    color: "#374151",
                    margin: "sm"
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  };
}