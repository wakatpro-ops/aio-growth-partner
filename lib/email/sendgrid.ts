import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  templateKey: string;
  applicationId?: string | null;
};

export type SendEmailResult =
  | { ok: true; status: "sent"; providerMessageId: string | null }
  | { ok: false; status: "failed" | "skipped"; errorMessage: string };

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

function envValue(key: string) {
  return (process.env[key] ?? "").trim();
}

export function emailConfig() {
  return {
    apiKey: envValue("SENDGRID_API_KEY"),
    fromEmail: envValue("SENDGRID_FROM_EMAIL") || "info@aioboost.jp",
    fromName: envValue("SENDGRID_FROM_NAME") || "AIO boost",
    adminEmail: envValue("ADMIN_NOTIFICATION_EMAIL") || envValue("SENDGRID_FROM_EMAIL") || "info@aioboost.jp",
    appBaseUrl: envValue("APP_BASE_URL") || envValue("NEXT_PUBLIC_APP_URL") || "https://app.aioboost.jp"
  };
}

function textToHtml(text: string) {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .map((line) => line.length ? line.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;") : "&nbsp;")
    .map((line) => `<p>${line}</p>`)
    .join("");
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = emailConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      status: "skipped",
      errorMessage: "SENDGRID_API_KEY is not configured."
    };
  }

  const response = await fetch(SENDGRID_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: input.to }] }],
      from: { email: config.fromEmail, name: config.fromName },
      subject: input.subject,
      content: [
        { type: "text/plain", value: input.text },
        { type: "text/html", value: input.html ?? textToHtml(input.text) }
      ],
      categories: ["aio-growth-partner", input.templateKey],
      custom_args: {
        template_key: input.templateKey,
        application_id: input.applicationId ?? ""
      }
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ok: false,
      status: "failed",
      errorMessage: `SendGrid API error ${response.status}: ${body.slice(0, 500)}`
    };
  }

  return {
    ok: true,
    status: "sent",
    providerMessageId: response.headers.get("x-message-id")
  };
}
