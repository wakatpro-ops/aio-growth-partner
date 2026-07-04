import "server-only";
import { getIndustryConfig } from "@/config/industries";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  if (templateKey === "instagram_draft_generation") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは自動車整備工場のInstagram集客に詳しいマーケターです。整備、点検、部品、安全性、予約導線を重視してください。"
        : "あなたは地域店舗のInstagram集客に詳しいマーケターです。商品・サービスの魅力、来店促進、口コミ促進を重視してください。";

    return {
      id: `${industryTypeKey}-instagram-draft-generation-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\n業務データをもとに、caption、short_caption、hashtags、call_to_action、recommended_image_idea、title、ai_reasoningをJSONで返してください。`
    };
  }

  if (templateKey === "google_business_profile_draft") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは整備工場向けGoogleビジネスプロフィール投稿に詳しいローカルSEO編集者です。車検、点検、修理、地域名、予約導線を自然に含めてください。"
        : "あなたはGoogleビジネスプロフィール投稿に詳しいローカルSEO編集者です。検索されやすいキーワードを自然に含めてください。";

    return {
      id: `${industryTypeKey}-google-business-profile-draft-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\n投稿種別と業務データをもとに、caption、short_caption、hashtags、call_to_action、recommended_image_idea、title、ai_reasoningをJSONで返してください。`
    };
  }

  if (templateKey === "ai_monthly_recommendations") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは自動車整備工場の業務改善と地域集客に詳しいコンサルタントです。安全性、点検需要、部品在庫、予約導線を重視してください。"
        : "あなたは地域店舗の売上改善と集客施策に詳しいコンサルタントです。";

    return {
      id: `${industryTypeKey}-ai-monthly-recommendations-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\n月次レポート、商品、在庫、顧客情報をもとに、title、good_points、cautions、next_actions、posting_themes、inventory_suggestions、customer_priorities、ai_reasoningをJSONで返してください。`
    };
  }

  if (templateKey === "data_column_mapping_suggestion") {
    return {
      id: `${industryTypeKey}-data-column-mapping-suggestion-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt: "あなたはCSV/Excelの列名を標準データ項目へ対応付けるデータ整理アシスタントです。",
      userPromptTemplate: `${baseContext}\n列名とサンプル行をもとに、sale_date、item_name、quantity、gross_amountなどへのマッピング候補をJSONで返してください。`
    };
  }

  if (templateKey === "sales_monthly_commentary") {
    return {
      id: `${industryTypeKey}-sales-monthly-commentary-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt: "あなたは店舗売上データから月次コメントを作成する分析者です。",
      userPromptTemplate: `${baseContext}\n売上集計データをもとに、良かった点、注意点、来月の改善案をJSONで返してください。`
    };
  }

  if (templateKey === "sales_ai_monthly_report") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは自動車整備工場の売上分析と集客改善に詳しいコンサルタントです。オイル交換、タイヤ交換、車検、点検、部品在庫、リピート来店の観点で具体的に提案してください。"
        : "あなたは店舗オーナー向けに売上分析と販促改善を分かりやすく整理するコンサルタントです。";

    return {
      id: `${industryTypeKey}-sales-ai-monthly-report-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\n対象月の売上集計、商品ランキング、支払方法、異常値候補をもとに、title、good_points、cautions、growth_items、promotion_ideas、inventory_notes、next_actions、industry_advice、ai_reasoningをJSONで返してください。`
    };
  }

  if (templateKey === "demand_action_recommendations") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは自動車整備工場の需要予測、部品在庫、集客アクションに詳しい業務改善アドバイザーです。点検、オイル交換、タイヤ交換、車検前点検、部品交換、リピート来店の文脈で具体的に提案してください。"
        : "あなたは店舗の需要予測、在庫確認、販促アクションを分かりやすく整理する業務改善アドバイザーです。";

    return {
      id: `${industryTypeKey}-demand-action-recommendations-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\n需要予測、在庫アラート、業態情報をもとに、actions配列でInstagram投稿案、Google投稿案、店頭POP短文、既存顧客案内文、発注確認などをJSONで返してください。各actionはaction_type、title、body、item_name、priority、reasonを含めてください。`
    };
  }

  if (templateKey === "growth_action_draft_generation") {
    const systemPrompt =
      industryTypeKey === "auto_repair"
        ? "あなたは自動車整備工場の集客アクションを、すぐ使える下書きに変換する編集者です。点検、オイル交換、タイヤ交換、車検、部品交換、リピート来店の文脈で、信頼感と予約導線を重視してください。"
        : "あなたは店舗の集客アクションを、すぐ使える投稿・案内・返信の下書きに変換する編集者です。来店促進、口コミ促進、既存顧客フォローを重視してください。";

    return {
      id: `${industryTypeKey}-growth-action-draft-generation-fallback`,
      industryTypeKey,
      templateKey,
      model,
      systemPrompt,
      userPromptTemplate: `${baseContext}\n売上データ、AI月次レポート、需要予測、次アクション提案、店舗プロフィールをもとに、actions配列でGoogle投稿案、Instagram投稿案、クチコミ返信案、既存顧客案内文、店頭POP文、LINE配信用文章をJSONで返してください。各actionはtarget_channel、title、summary、priority、reason、recommended_date、draftを含め、draftはtitle、body、short_body、hashtags、call_to_actionを含めてください。`
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

export async function getPromptTemplate(industryTypeKey: IndustryTypeKey, templateKey: AiTemplateKey): Promise<PromptTemplate> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return getFallbackPromptTemplate(industryTypeKey, templateKey);

  const { data, error } = await supabase
    .from("ai_prompt_templates")
    .select("id, industry_type_key, template_key, model, system_prompt, user_prompt_template")
    .eq("industry_type_key", industryTypeKey)
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return getFallbackPromptTemplate(industryTypeKey, templateKey);

  return {
    id: String(data.id),
    industryTypeKey,
    templateKey,
    model: String(data.model ?? model),
    systemPrompt: String(data.system_prompt),
    userPromptTemplate: String(data.user_prompt_template)
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
