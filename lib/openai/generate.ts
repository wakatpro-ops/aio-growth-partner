import "server-only";
import OpenAI from "openai";
import { buildPrompt, getPromptTemplate } from "@/lib/openai/templates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AiLogRecord, AiTemplateKey, Store } from "@/types/domain";

function demoOutput(templateKey: AiTemplateKey, store: Store) {
  if (templateKey === "post_generation") {
    return {
      post: `${store.name}からのお知らせです。地域の皆さまに安心してご利用いただけるよう、わかりやすい情報発信を続けています。気になることがあればお気軽にご相談ください。`,
      short_post: `${store.name}へのご相談をお待ちしています。`,
      hashtags: ["#地域店舗", "#AIOGrowthPartner", "#相談歓迎"]
    };
  }

  if (templateKey === "review_reply") {
    return {
      reply: `このたびは${store.name}へ温かいお言葉をいただき、誠にありがとうございます。今後も安心してご利用いただけるよう、丁寧な対応を心がけてまいります。`
    };
  }

  if (templateKey === "instagram_draft_generation" || templateKey === "google_business_profile_draft") {
    const isAuto = store.industry_type_key === "auto_repair";
    const channel = templateKey === "instagram_draft_generation" ? "Instagram" : "Googleビジネスプロフィール";
    return {
      title: isAuto ? "安心点検のご案内" : "今月のおすすめ",
      caption: isAuto
        ? `${store.name}では、季節の変わり目に合わせた点検と部品交換のご相談を受け付けています。安全なカーライフのため、気になる症状は早めにご相談ください。`
        : `${store.name}から今月のおすすめをご紹介します。商品やサービスの魅力を分かりやすくお届けしますので、ぜひお気軽にご来店ください。`,
      short_caption: isAuto ? "点検・整備のご相談はお気軽にどうぞ。" : "今月のおすすめをぜひご覧ください。",
      hashtags: isAuto ? ["#自動車整備", "#点検", "#安全運転", "#地域密着"] : ["#地域店舗", "#おすすめ", "#来店歓迎"],
      call_to_action: isAuto ? "点検予約・修理相談はこちら" : "ご来店・お問い合わせをお待ちしています",
      recommended_image_idea: isAuto ? "整備中の手元、交換部品、点検風景" : "商品、店内、スタッフの自然な写真",
      ai_reasoning: `${channel}向けに、店舗データと月次の状況から来店・予約につながりやすいテーマを選びました。`
    };
  }

  if (templateKey === "ai_monthly_recommendations") {
    const isAuto = store.industry_type_key === "auto_repair";
    return {
      title: isAuto ? "整備工場向け 月次集客改善提案" : "店舗向け 月次集客改善提案",
      good_points: ["請求・見積データが蓄積され、投稿テーマに活用できます。"],
      cautions: isAuto ? ["在庫注意部品と点検需要を定期的に確認してください。"] : ["売れ筋商品と在庫状況を定期的に確認してください。"],
      next_actions: isAuto ? ["点検予約につながる投稿を週1回作成する", "在庫注意部品を確認する"] : ["おすすめ商品投稿を作成する", "口コミ促進の導線を整える"],
      posting_themes: isAuto ? ["季節点検", "部品交換", "安全運転"] : ["おすすめ商品", "サービス紹介", "口コミ紹介"],
      inventory_suggestions: isAuto ? ["発注点に近い部品を投稿テーマと合わせて確認する"] : ["在庫の多い商品を販促テーマにする"],
      customer_priorities: ["直近の見積・請求につながる顧客へのフォローを優先する"],
      ai_reasoning: "月次レポート、在庫、顧客、見積・請求データから、次月に実行しやすい施策を整理しました。"
    };
  }

  return {
    score: 78,
    summary: `${store.name}は基本情報が整理されています。AI検索に向けて、地域名、強み、具体的なサービス説明をさらに明確にすると効果的です。`,
    strengths: ["店舗情報が分かりやすい", "業態に合う説明がある"],
    issues: ["具体的な来店理由を増やせる", "地域キーワードを補強できる"],
    recommendations: ["プロフィールに地域名を含める", "よくある相談内容を追加する", "クチコミ返信の一貫性を高める"]
  };
}

export async function generateWithAi(params: {
  store: Store;
  templateKey: AiTemplateKey;
  input: Record<string, unknown>;
  userId?: string | null;
}) {
  const template = await getPromptTemplate(params.store.industry_type_key, params.templateKey);
  const prompt = buildPrompt(template, params.store, params.input);
  const model = template.model;
  const supabase = createSupabaseAdminClient();

  let output: Record<string, unknown> | string | null = null;
  let tokens: Record<string, unknown> | null = null;
  let status: AiLogRecord["status"] = "success";
  let errorMessage: string | null = null;

  try {
    if (!process.env.OPENAI_API_KEY) {
      output = demoOutput(params.templateKey, params.store);
    } else {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: template.systemPrompt },
          { role: "user", content: prompt }
        ]
      });

      const content = response.choices[0]?.message?.content ?? "{}";
      output = JSON.parse(content) as Record<string, unknown>;
      tokens = response.usage ? { ...response.usage } : null;
    }
  } catch (error) {
    status = "error";
    errorMessage = error instanceof Error ? error.message : "Unknown OpenAI error";
    output = null;
  }

  const logRecord: AiLogRecord = {
    user_id: params.userId ?? null,
    organization_id: params.store.organization_id,
    store_id: params.store.id,
    template_id: template.id,
    input: params.input,
    output,
    model,
    tokens,
    status,
    error_message: errorMessage
  };

  if (supabase) {
    await supabase.from("ai_generation_logs").insert(logRecord);
  }

  return { output, log: logRecord };
}
