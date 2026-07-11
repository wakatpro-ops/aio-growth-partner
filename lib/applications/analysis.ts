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

type AnalysisErrorCode =
  | "missing_openai_api_key"
  | "openai_model_not_found"
  | "openai_auth_error"
  | "openai_rate_limit"
  | "openai_response_parse_error"
  | "openai_api_error";

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

function getModelCandidates() {
  const configured = process.env.OPENAI_MODEL?.trim();
  return Array.from(new Set([configured || "gpt-4.1-mini", "gpt-4o-mini"].filter(Boolean)));
}

function classifyOpenAIError(error: unknown): { code: AnalysisErrorCode; message: string } {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof record.status === "number" ? record.status : null;
  const code = typeof record.code === "string" ? record.code : "";
  const message = error instanceof Error ? error.message : "OpenAI API request failed";
  const lower = message.toLowerCase();

  if (status === 401 || status === 403 || code.includes("auth")) {
    return { code: "openai_auth_error", message: "OpenAI API key authentication failed" };
  }
  if (status === 429) {
    return { code: "openai_rate_limit", message: "OpenAI API rate limit or quota reached" };
  }
  if (status === 404 || lower.includes("model") || lower.includes("does not exist")) {
    return { code: "openai_model_not_found", message: message.slice(0, 300) };
  }
  if (lower.includes("json") || lower.includes("parse")) {
    return { code: "openai_response_parse_error", message: "OpenAI response could not be parsed as JSON" };
  }
  return { code: "openai_api_error", message: message.slice(0, 300) };
}

async function requestAnalysis(client: OpenAI, input: PublicApplicationAnalysisInput, model: string) {
  const urlSignals = [
    input.websiteUrl ? `公式サイト: ${input.websiteUrl}` : "",
    input.googleMapsUrl ? `Googleマップ: ${input.googleMapsUrl}` : "",
    input.instagramUrl ? `Instagram: ${input.instagramUrl}` : "",
    input.lineUrl ? `LINE: ${input.lineUrl}` : "",
    input.otherSocialUrls.length ? `その他SNS: ${input.otherSocialUrls.join(" / ")}` : "",
    input.referenceUrls.length ? `参考URL: ${input.referenceUrls.join(" / ")}` : ""
  ].filter(Boolean);

  const response = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.35,
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content: [
          "あなたは店舗向け業務管理SaaSの導入前ヒアリングを支援するアシスタントです。",
          "入力された店舗名、業態、URL、利用中ツール、改善テーマ、困りごとから、導入相談に使える初期整理を作成してください。",
          "URLの中身を実際に閲覧したとは書かず、入力されたURLやSNS導線があることから読み取れる範囲で表現してください。",
          "業態ごとの言葉を使い、汎用的すぎる説明を避けてください。",
          "断定しすぎず、営業・導入相談で自然に見せられる前向きな表現にしてください。",
          "JSONのみで返してください。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction: {
            output_schema: {
              business_summary: "お店の概要を1文から2文で自然に要約。業態、課題、URL/SNSの有無を反映する。",
              growth_opportunities: ["AIOで活かせそうなポイントを4件。改善テーマ、利用中ツール、URL/SNS情報を具体的に反映する。"],
              recommended_setup_steps: ["最初に整えると良さそうな項目を6件。業態に合わせる。"],
              first_meeting_points: ["初回商談で確認すべきポイントを4件。入力内容から追加確認すべきことにする。"]
            }
          },
          store: {
            name: input.storeName,
            industry: input.industryLabel,
            pain_points: input.painPoints,
            message: input.message
          },
          urls: urlSignals,
          current_tools: input.currentTools,
          improvement_goals: input.improvementGoals
        }, null, 2)
      }
    ]
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  try {
    return normalizeAnalysis(JSON.parse(content) as Record<string, unknown>, input);
  } catch (error) {
    throw new Error(`JSON parse failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export async function analyzePublicApplication(input: PublicApplicationAnalysisInput) {
  const fallback = fallbackAnalysis(input);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      analysis: fallback,
      status: "fallback",
      error: "OPENAI_API_KEY is not configured",
      errorCode: "missing_openai_api_key" as AnalysisErrorCode,
      model: null
    };
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let lastError: { code: AnalysisErrorCode; message: string; model: string } | null = null;

  for (const model of getModelCandidates()) {
    try {
      return {
        analysis: await requestAnalysis(client, input, model),
        status: "success",
        error: null,
        errorCode: null,
        model
      };
    } catch (error) {
      const classified = classifyOpenAIError(error);
      lastError = { ...classified, model };
      if (classified.code !== "openai_model_not_found") break;
    }
  }

  return {
    analysis: fallback,
    status: "fallback",
    error: lastError ? `${lastError.model}: ${lastError.message}` : "AI analysis failed",
    errorCode: lastError?.code ?? "openai_api_error",
    model: lastError?.model ?? null
  };
}
