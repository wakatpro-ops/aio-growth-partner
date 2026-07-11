import "server-only";
import OpenAI from "openai";

export type PublicApplicationAnalysisInput = {
  storeName: string;
  industryLabel: string;
  websiteUrl?: string;
  googleMapsUrl?: string;
  instagramUrl?: string;
  lineUrl?: string;
  otherSocialUrls: string[];
  referenceUrls: string[];
  currentTools: string[];
  improvementGoals: string[];
  painPoints: string;
  message?: string;
};

export type PublicApplicationAnalysis = {
  business_summary: string;
  growth_opportunities: string[];
  recommended_setup_steps: string[];
  first_meeting_points: string[];
};

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 12);
}

function fallbackAnalysis(input: PublicApplicationAnalysisInput): PublicApplicationAnalysis {
  const goals = input.improvementGoals.length ? input.improvementGoals : ["集客", "請求・入金管理", "売上分析"];
  const tools = input.currentTools.length ? `現在お使いの${input.currentTools.join("、")}の情報` : "既存の店舗情報や売上データ";
  const isAuto = input.industryLabel.includes("自動車");

  return {
    business_summary: isAuto
      ? `${input.storeName}は、${input.industryLabel}として点検・整備・車検などの相談導線を整えることで、既存顧客の再来店や季節需要の案内に活かせそうです。`
      : `${input.storeName}は、${input.industryLabel}として店舗情報、商品・サービス、顧客接点を整理することで、集客と日常業務の効率化に活かせそうです。`,
    growth_opportunities: [
      `${goals[0]}に向けて、Google投稿やSNS投稿の下書きを作成しやすくします。`,
      "請求・入金・顧客情報をまとめて、日々の確認をしやすくします。",
      `${tools}を取り込み、月次レポートや改善提案に活かせます。`,
      isAuto ? "季節点検、車検前点検、部品交換の案内を作りやすくします。" : "商品・サービス紹介、口コミ促進、再来店案内を作りやすくします。"
    ],
    recommended_setup_steps: [
      "店舗プロフィール",
      "商品・サービスメニュー",
      "顧客リスト",
      "Googleビジネスプロフィール",
      "請求書設定",
      "SNS投稿テーマ"
    ],
    first_meeting_points: [
      "現在の集客経路と問い合わせ導線",
      "請求・入金管理で時間がかかっている作業",
      "売上データや顧客データの保管場所",
      "最初に改善したい優先テーマ"
    ]
  };
}

function normalizeAnalysis(value: unknown, input: PublicApplicationAnalysisInput): PublicApplicationAnalysis {
  const fallback = fallbackAnalysis(input);
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  return {
    business_summary: typeof record.business_summary === "string" && record.business_summary.trim()
      ? record.business_summary.trim()
      : fallback.business_summary,
    growth_opportunities: Array.isArray(record.growth_opportunities)
      ? uniqueList(record.growth_opportunities.map(String))
      : fallback.growth_opportunities,
    recommended_setup_steps: Array.isArray(record.recommended_setup_steps)
      ? uniqueList(record.recommended_setup_steps.map(String))
      : fallback.recommended_setup_steps,
    first_meeting_points: Array.isArray(record.first_meeting_points)
      ? uniqueList(record.first_meeting_points.map(String))
      : fallback.first_meeting_points
  };
}

export async function analyzePublicApplication(input: PublicApplicationAnalysisInput) {
  const fallback = fallbackAnalysis(input);

  if (!process.env.OPENAI_API_KEY) {
    return {
      analysis: fallback,
      status: "fallback",
      error: "OPENAI_API_KEY is not configured"
    };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "あなたは店舗向け業務管理SaaSの導入前ヒアリングを支援するアシスタントです。",
            "入力された店舗情報をもとに、導入前の初期整理を作成してください。",
            "断定しすぎず、営業・導入相談で自然に見せられる前向きな表現にしてください。",
            "JSONのみで返してください。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: {
              output_schema: {
                business_summary: "お店の概要を1文から2文で自然に要約",
                growth_opportunities: ["AIOで活かせそうなポイントを4件"],
                recommended_setup_steps: ["最初に整えると良さそうな項目を6件"],
                first_meeting_points: ["初回商談で確認すべきポイントを4件"]
              }
            },
            input
          }, null, 2)
        }
      ]
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      analysis: normalizeAnalysis(parsed, input),
      status: "success",
      error: null
    };
  } catch (error) {
    return {
      analysis: fallback,
      status: "fallback",
      error: error instanceof Error ? error.message : "AI analysis failed"
    };
  }
}
