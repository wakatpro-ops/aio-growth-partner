import "server-only";
import OpenAI from "openai";
import { buildPrompt, getFallbackPromptTemplate } from "@/lib/openai/templates";
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
  const template = getFallbackPromptTemplate(params.store.industry_type_key, params.templateKey);
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
