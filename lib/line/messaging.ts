import "server-only";

type LineTextMessage = { type: "text"; text: string };

async function lineRequest(path: string, payload: Record<string, unknown>) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  const response = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  if (!response.ok) {
    const requestId = response.headers.get("x-line-request-id") ?? "unknown";
    throw new Error(`LINE Messaging API returned ${response.status} (request ${requestId}).`);
  }
}

function textMessage(text: string): LineTextMessage {
  return { type: "text", text: text.trim().slice(0, 5000) };
}

export async function replyLineText(replyToken: string, text: string) {
  if (!replyToken || !text.trim()) return;
  await lineRequest("reply", { replyToken, messages: [textMessage(text)] });
}

export async function pushLineText(to: string, text: string) {
  if (!to || !text.trim()) return;
  await lineRequest("push", { to, messages: [textMessage(text)] });
}

