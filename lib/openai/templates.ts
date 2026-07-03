import "server-only";
import { getIndustryConfig } from "@/config/industries";
import type { AiTemplateKey, IndustryTypeKey, Store } from "@/types/domain";

export type PromptTemplate = {
  id: string;
  industryTypeKey: IndustryTypeKey;
  templateKey: AiTemplateKey;
  model: string;
  systemPrompt: string;
  userPromptTemplate: string;
};

const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

export function getFallbackPromptTemplate(industryTypeKey: IndustryTypeKey, templateKey: AiTemplateKey): PromptTemplate {
  const industry = getIndustryConfig(industryTypeKey);
  const baseContext = `業態: ${industry.name}\n店舗の文言: ${industry.profileLabel}`;

  if (templateKey === "post_generation") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは自動車整備工場の地域集客に詳しいマーケターです。信頼感、安全性、わかりやすさを重視してください。"
        : "あなたは地域店舗の集客支援に詳しいマーケターです。自然で来店につながる投稿文を作成してください。";

    return {
      id: `${industryTypeKey}-post-generation-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\n店舗情報と入力内容をもとに、投稿文、短縮版、ハッシュタグ案をJSONで返してください。`
    };
  }

  if (templateKey === "review_reply") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは自動車整備工場の店長を支援する返信作成者です。安心感、技術力、説明の丁寧さが伝わる返信にしてください。"
        : "あなたは地域店舗のクチコミ返信を支援する編集者です。丁寧で自然な返信にしてください。";

    return {
      id: `${industryTypeKey}-review-reply-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\nクチコミ本文と評価に対して、丁寧な返信文をJSONで返してください。`
    };
  }

  const systemPrompt =
    industryTypeKey === "auto_repair"
      ? "あなたは自動車修理・整備工場のAIO診断コンサルタントです。地域名、対応サービス、信頼性、予約導線を評価してください。"
      : "あなたは地域店舗のAIO診断コンサルタントです。AI検索で理解されやすい店舗情報かを評価してください。";

  return {
    id: `${industryTypeKey}-aio-diagnosis-fallback`,
    industryTypeKey,
    templateKey,
    model,
    systemPrompt,
    userPromptTemplate: `${baseContext}\n店舗プロフィールを診断し、score、summary、strengths、issues、recommendationsをJSONで返してください。`
  };
}

export function buildPrompt(template: PromptTemplate, store: Store, input: Record<string, unknown>) {
  return [
    template.userPromptTemplate,
    "",
    "店舗情報:",
    JSON.stringify(store, null, 2),
    "",
    "入力:",
    JSON.stringify(input, null, 2)
  ].join("\n");
}
