import type { StoreEmailCategory } from "@/types/store-ai-inbox";

export type StoreEmailRuleInput = {
  subject: string;
  body: string;
  senderEmail?: string | null;
  now?: Date;
};

export type StoreEmailRuleResult = {
  category: StoreEmailCategory;
  confidence: number;
  reason: string;
  sensitive: boolean;
  knownTemplate: boolean;
  summary: string;
  extractedData: Record<string, string | number | boolean | null>;
};

const categoryRules: Array<{ category: StoreEmailCategory; pattern: RegExp; confidence: number; reason: string }> = [
  { category: "reservation", pattern: /予約(?:確定|受付|申込|内容|日時|番号|変更|キャンセル)|ご来店(?:日時|予約)|booking|reservation/iu, confidence: 0.94, reason: "予約を示す語句を確認しました。" },
  { category: "complaint", pattern: /クレーム|苦情|不満|返金|対応が悪|二度と|complaint|refund/iu, confidence: 0.91, reason: "苦情・返金相談を示す語句を確認しました。" },
  { category: "review", pattern: /口コミ|レビュー|評価|星[1-5]|review|rating/iu, confidence: 0.9, reason: "口コミ・評価を示す語句を確認しました。" },
  { category: "invoice_receipt", pattern: /請求書|領収書|支払明細|利用明細|invoice|receipt/iu, confidence: 0.92, reason: "請求・領収を示す語句を確認しました。" },
  { category: "purchasing", pattern: /発注|仕入|見積依頼|納品書|注文書|purchase order|quotation/iu, confidence: 0.9, reason: "仕入・発注を示す語句を確認しました。" },
  { category: "inventory_shipping", pattern: /入荷|出荷|発送|配送|在庫|欠品|追跡番号|shipping|delivery|stock/iu, confidence: 0.88, reason: "在庫・配送を示す語句を確認しました。" },
  { category: "platform_notice", pattern: /管理画面|掲載情報|店舗ページ|システム通知|メンテナンス|プラットフォーム|掲載サイト/iu, confidence: 0.83, reason: "利用サービスからの通知を示す語句を確認しました。" },
  { category: "advertising", pattern: /広告掲載|営業のご案内|キャンペーンのご案内|今だけ無料|特別オファー|unsubscribe|配信停止/iu, confidence: 0.88, reason: "広告・営業案内を示す語句を確認しました。" },
  { category: "inquiry", pattern: /問い合わせ|質問|教えてください|空きは|対応していますか|営業時間|アクセス|inquiry|question/iu, confidence: 0.82, reason: "お客様からの問い合わせを示す語句を確認しました。" }
];

const sensitivePatterns = [
  /パスワード(?:再設定|変更|リセット)|reset.{0,20}password/iu,
  /(?:認証|確認|セキュリティ|ワンタイム)[\s_-]*(?:コード|番号)|verification code|one[- ]time password|\botp\b|\bmfa\b|二段階認証/iu,
  /クレジットカード|カード番号|セキュリティコード|暗証番号|\bcvv\b|\bcvc\b/iu,
  /秘密保持|機密情報|秘密鍵|private key|api[ _-]?key|access[ _-]?token|client[ _-]?secret/iu,
  /本人確認書類|マイナンバー|運転免許証|パスポート/iu
];

function normalized(value: string) {
  return value.replace(/\u0000/gu, "").replace(/\s+/gu, " ").trim();
}

function safePreview(value: string) {
  return normalized(value)
    .replace(/https?:\/\/\S+/giu, "[URL]")
    .replace(/\b\d{13,19}\b/gu, "[番号を非表示]")
    .slice(0, 360);
}

function firstMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function labeledValue(text: string, labels: string[], maxLength = 200) {
  const label = labels.map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${label})[\\s　]*(?:[:：])[\\s　]*([^\\n\\r]+)`, "iu"));
  return match?.[1] ? normalized(match[1]).slice(0, maxLength) : null;
}

function extractEmail(text: string) {
  const labeled = labeledValue(text, ["メール", "メールアドレス", "E-mail", "Email"], 320);
  const candidate = labeled?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0]
    ?? text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0];
  return candidate?.toLowerCase() ?? null;
}

function extractPhone(text: string) {
  const labeled = labeledValue(text, ["電話", "電話番号", "TEL"], 50);
  return (labeled ?? text).match(/(?:\+81[-\s]?)?(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/u)?.[0]?.replace(/\s/gu, "") ?? null;
}

function toIsoInJapan(year: number, month: number, day: number, hour: number, minute: number) {
  const candidate = new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+09:00`);
  if (Number.isNaN(candidate.getTime())) return null;
  const check = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(candidate);
  const parts = Object.fromEntries(check.map((part) => [part.type, part.value]));
  if (Number(parts.year) !== year || Number(parts.month) !== month || Number(parts.day) !== day || Number(parts.hour) !== hour || Number(parts.minute) !== minute) return null;
  return candidate.toISOString();
}

function extractDateTime(text: string, now: Date) {
  const explicit = text.match(/(?:予約日時|来店日時|ご来店日時|日時|予約日)[\s　]*(?:[:：])?[\s　]*(?:(\d{4})[年\/-])?(\d{1,2})[月\/-](\d{1,2})日?(?:\([^)]*\))?[\s　]*(\d{1,2})[:時](\d{2})?/u);
  if (!explicit) return null;
  const currentYear = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric" }).format(now));
  const year = Number(explicit[1] ?? currentYear);
  const month = Number(explicit[2]);
  const day = Number(explicit[3]);
  const hour = Number(explicit[4]);
  const minute = Number(explicit[5] ?? 0);
  let result = toIsoInJapan(year, month, day, hour, minute);
  if (!explicit[1] && result && new Date(result).getTime() < now.getTime() - 24 * 60 * 60_000) {
    result = toIsoInJapan(year + 1, month, day, hour, minute);
  }
  return result;
}

function bookingExtraction(text: string, now: Date) {
  const startsAt = extractDateTime(text, now);
  const durationValue = labeledValue(text, ["所要時間", "利用時間"], 30)?.match(/\d{1,4}/u)?.[0];
  const durationMinutes = durationValue ? Math.min(1440, Math.max(5, Number(durationValue))) : 60;
  const endsAt = startsAt ? new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString() : null;
  return {
    reservation_id: labeledValue(text, ["予約番号", "予約ID", "受付番号"], 100),
    customer_name: labeledValue(text, ["お名前", "氏名", "予約者名", "お客様名"], 200),
    customer_email: extractEmail(text),
    customer_phone: extractPhone(text),
    service_name: labeledValue(text, ["メニュー", "コース", "予約内容", "サービス"], 200),
    starts_at: startsAt,
    ends_at: endsAt,
    duration_minutes: durationMinutes
  };
}

export function classifyStoreEmailByRules(input: StoreEmailRuleInput): StoreEmailRuleResult {
  const subject = normalized(input.subject).slice(0, 300) || "件名なし";
  const body = normalized(input.body).slice(0, 25_000);
  const combined = `${subject}\n${body}`;
  if (firstMatch(combined, sensitivePatterns)) {
    return {
      category: "sensitive",
      confidence: 1,
      reason: "認証情報・決済情報・重要な本人確認情報の可能性があるため自動処理から除外しました。",
      sensitive: true,
      knownTemplate: false,
      summary: "機密性の高い可能性があるメールです。件名・本文・添付は保存していません。元の受信箱で確認してください。",
      extractedData: {}
    };
  }

  const matched = categoryRules.find((rule) => rule.pattern.test(combined));
  const category = matched?.category ?? "unknown";
  const extractedData: Record<string, string | number | boolean | null> = category === "reservation"
    ? bookingExtraction(`${input.subject}\n${input.body}`, input.now ?? new Date())
    : {};
  const bookingLabels = category === "reservation"
    && Boolean(extractedData.customer_name)
    && Boolean(extractedData.starts_at)
    && /予約(?:番号|日時|内容)|来店日時|お名前|予約者名/iu.test(combined);
  const completeReservation = category === "reservation" && Boolean(extractedData.customer_name) && Boolean(extractedData.starts_at);
  const confidence = bookingLabels && completeReservation ? 0.99 : matched?.confidence ?? 0.45;
  return {
    category,
    confidence,
    reason: matched?.reason ?? "分類を確定できる十分な手掛かりがありません。",
    sensitive: false,
    knownTemplate: Boolean(bookingLabels),
    summary: safePreview(body || subject) || "本文を確認できませんでした。",
    extractedData
  };
}

export function emailCategoryLabel(category: StoreEmailCategory) {
  return ({
    reservation: "予約",
    inquiry: "問い合わせ",
    complaint: "クレーム・要対応",
    review: "口コミ・評価",
    invoice_receipt: "請求・領収",
    purchasing: "仕入・発注",
    inventory_shipping: "在庫・配送",
    platform_notice: "サービス通知",
    advertising: "広告・案内",
    sensitive: "自動処理対象外",
    unknown: "未分類"
  } as const)[category];
}
