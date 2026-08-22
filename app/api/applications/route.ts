import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzePublicApplication } from "@/lib/applications/analysis";
import { findPublicIndustryOption } from "@/lib/applications/options";
import { hashPublicAnalysisToken } from "@/lib/applications/public-analysis-token";
import { sendApplicationReceivedEmails } from "@/lib/admin/application-emails";
import type { SalesApplication } from "@/lib/admin/applications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const applicationSchema = z.object({
  industry_detail_key: z.string().default("other_service"),
  store_name: z.string().min(1),
  contact_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(""),
  store_count: z.coerce.number().int().positive().default(1),
  pain_points: z.string().min(1),
  message: z.string().optional().default(""),
  website_url: z.string().optional().default(""),
  google_maps_url: z.string().optional().default(""),
  instagram_url: z.string().optional().default(""),
  line_url: z.string().optional().default(""),
  other_social_urls: z.array(z.string()).optional().default([]),
  reference_urls: z.array(z.string()).optional().default([]),
  current_tools: z.array(z.string()).optional().default([]),
  improvement_goals: z.array(z.string()).optional().default([])
});

const urlFirstApplicationSchema = z.object({
  analysis_token: z.string().trim().min(32).max(128),
  contact_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(240),
  phone: z.string().trim().min(8).max(80),
  company_name: z.string().trim().max(160).optional().default(""),
  store_relationship: z.enum(["owner", "employee", "operator", "authorized_agent", "other"]),
  authority_confirmed: z.literal(true),
  message: z.string().trim().max(2_000).optional().default("")
});

function cleanList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function listValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

async function createUrlFirstApplication(json: unknown) {
  const parsed = urlFirstApplicationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "入力内容を確認してください。" }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "現在、申し込みを保存できません。時間をおいてもう一度お試しください。" }, { status: 503 });
  }

  const tokenHash = hashPublicAnalysisToken(parsed.data.analysis_token);
  const { data: draft } = await supabase
    .from("public_store_analyses")
    .select("*")
    .eq("public_token_hash", tokenHash)
    .maybeSingle();
  if (!draft) {
    return NextResponse.json({ ok: false, error: "診断結果を確認できません。URLからもう一度診断してください。" }, { status: 404 });
  }
  if (draft.converted_application_id) {
    return NextResponse.json({ ok: true, already_submitted: true });
  }
  if (!["success", "partial"].includes(draft.status) || new Date(draft.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ ok: false, error: "診断結果の有効期限が切れています。URLからもう一度診断してください。" }, { status: 410 });
  }
  if (!draft.verified_at || !draft.verification_name || !draft.verification_email) {
    return NextResponse.json({ ok: false, error: "先にメールアドレスの確認を完了してください。" }, { status: 403 });
  }
  if (parsed.data.contact_name !== draft.verification_name || parsed.data.email.toLowerCase() !== String(draft.verification_email).toLowerCase()) {
    return NextResponse.json({ ok: false, error: "確認済みの名前とメールアドレスを変更する場合は、もう一度メール確認を行ってください。" }, { status: 403 });
  }

  const profile = recordValue(draft.extracted_profile);
  const diagnosis = recordValue(draft.analysis_result);
  const clarifyingQuestions = Array.isArray(draft.clarifying_questions) ? draft.clarifying_questions : [];
  const industryOption = findPublicIndustryOption(String(profile.industry_key ?? "other_service"));
  const originalServices = listValue(profile.services);
  const services = cleanList(originalServices);
  const strengths = cleanList(listValue(profile.strengths));
  const targetCustomers = cleanList(listValue(profile.target_customers));
  const confirmedProfile = {
    ...profile,
    industry_key: industryOption.key,
    industry_label: industryOption.label,
    services,
    strengths,
    target_customers: targetCustomers,
    confirmed_by_applicant: false,
    pending_operator_review: true
  };
  const targetQuestions = listValue(diagnosis.target_questions).slice(0, 3);
  const recommendedModules = Array.isArray(diagnosis.recommended_modules) ? diagnosis.recommended_modules : [];
  const setupSteps = recommendedModules.map((item) => String(recordValue(item).label ?? "")).filter(Boolean);
  const growthOpportunities = recommendedModules.map((item) => String(recordValue(item).reason ?? "")).filter(Boolean);
  const topImprovement = recordValue(draft.top_improvement);
  const authorityConfirmedAt = new Date().toISOString();
  const intakeAnswers = {
    applicant_company_name: parsed.data.company_name,
    applicant_store_relationship: parsed.data.store_relationship,
    applicant_authority_confirmed: true,
    applicant_message: parsed.data.message
  };
  const enrichment = {
    source_analysis_id: draft.id,
    industry_detail_key: industryOption.key,
    industry_label: industryOption.label,
    website_url: draft.source_url,
    google_maps_url: null,
    social_urls: { other: listValue(profile.social_urls) },
    reference_urls: listValue(profile.source_urls),
    current_tools: [],
    improvement_goals: ["AIO改善"],
    intake_answers: intakeAnswers,
    ai_business_summary: String(diagnosis.business_summary ?? profile.description ?? ""),
    ai_recommended_setup_steps: setupSteps,
    ai_growth_opportunities: growthOpportunities,
    ai_first_meeting_points: clarifyingQuestions.map((item: unknown) => String(recordValue(item).question ?? "")).filter(Boolean),
    ai_target_questions: targetQuestions,
    ai_dashboard_plan: { recommended_modules: recommendedModules, top_improvement: topImprovement },
    ai_analysis_status: draft.ai_status,
    ai_analysis_error: null,
    ai_analysis_error_code: draft.ai_error_code,
    ai_analysis_model: draft.ai_model,
    ai_analyzed_at: draft.updated_at
  };
  const payload = {
    industry_type_key: industryOption.internalIndustryType,
    store_name: String(profile.store_name ?? "店舗名未確認"),
    contact_name: parsed.data.contact_name,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone,
    store_count: 1,
    pain_points: String(topImprovement.description ?? "AIOおすすめ準備度の改善"),
    message: parsed.data.message,
    status: "new",
    applicant_company_name: parsed.data.company_name || null,
    applicant_store_relationship: parsed.data.store_relationship,
    applicant_authority_confirmed_at: authorityConfirmedAt,
    intake_review_status: "pending",
    ...enrichment,
    admin_checklist: {
      public_application_enrichment: {
        ...enrichment,
        source_url: draft.source_url,
        final_url: draft.final_url,
        extracted_profile: confirmedProfile
      }
    }
  };
  const result = await supabase.from("applications").insert(payload).select("*").single();
  if (result.error) {
    const { data: existing } = await supabase
      .from("applications")
      .select("*")
      .eq("source_analysis_id", draft.id)
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true, already_submitted: true });
    return NextResponse.json({ ok: false, error: "申し込みを保存できませんでした。時間をおいてもう一度お試しください。" }, { status: 503 });
  }

  await supabase.from("public_store_analyses").update({
    status: "converted",
    converted_application_id: result.data.id,
    converted_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", draft.id).is("converted_application_id", null);
  await sendApplicationReceivedEmails(result.data as SalesApplication).catch(() => undefined);
  return NextResponse.json({ ok: true, already_submitted: false, review_status: "pending" });
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  if (json && typeof json === "object" && "analysis_token" in json) {
    return createUrlFirstApplication(json);
  }
  const parsed = applicationSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "入力内容を確認してください。" }, { status: 400 });
  }

  const industryOption = findPublicIndustryOption(parsed.data.industry_detail_key);
  const analysisInput = {
    storeName: parsed.data.store_name,
    industryLabel: industryOption.label,
    websiteUrl: parsed.data.website_url,
    googleMapsUrl: parsed.data.google_maps_url,
    instagramUrl: parsed.data.instagram_url,
    lineUrl: parsed.data.line_url,
    otherSocialUrls: cleanList(parsed.data.other_social_urls),
    referenceUrls: cleanList(parsed.data.reference_urls),
    currentTools: cleanList(parsed.data.current_tools),
    improvementGoals: cleanList(parsed.data.improvement_goals),
    painPoints: parsed.data.pain_points,
    message: parsed.data.message
  };
  const aiResult = await analyzePublicApplication(analysisInput);
  const socialUrls = {
    instagram: parsed.data.instagram_url.trim() || null,
    line: parsed.data.line_url.trim() || null,
    other: analysisInput.otherSocialUrls
  };
  const enrichment = {
    industry_detail_key: industryOption.key,
    industry_label: industryOption.label,
    website_url: parsed.data.website_url.trim() || null,
    google_maps_url: parsed.data.google_maps_url.trim() || null,
    social_urls: socialUrls,
    reference_urls: analysisInput.referenceUrls,
    current_tools: analysisInput.currentTools,
    improvement_goals: analysisInput.improvementGoals,
    ai_business_summary: aiResult.analysis.business_summary,
    ai_recommended_setup_steps: aiResult.analysis.recommended_setup_steps,
    ai_growth_opportunities: aiResult.analysis.growth_opportunities,
    ai_first_meeting_points: aiResult.analysis.first_meeting_points,
    ai_analysis_status: aiResult.status,
    ai_analysis_error: aiResult.error,
    ai_analysis_error_code: aiResult.errorCode,
    ai_analysis_model: aiResult.model,
    ai_analyzed_at: new Date().toISOString()
  };

  const supabase = createSupabaseAdminClient();
  let applicationId: string | null = null;
  let savedApplication: Record<string, unknown> | null = null;
  if (supabase) {
    const basePayload = {
      industry_type_key: industryOption.internalIndustryType,
      store_name: parsed.data.store_name,
      contact_name: parsed.data.contact_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      store_count: parsed.data.store_count,
      pain_points: parsed.data.pain_points,
      message: parsed.data.message,
      status: "new"
    };

    const fullPayload = {
      ...basePayload,
      ...enrichment,
      admin_checklist: {
        public_application_enrichment: enrichment
      }
    };

    const result = await supabase.from("applications").insert(fullPayload).select("*").single();

    if (result.error) {
      const fallbackResult = await supabase
        .from("applications")
        .insert({
          ...basePayload,
          admin_checklist: {
            public_application_enrichment: enrichment
          }
        })
        .select("*")
        .single();

      if (fallbackResult.error) {
        return NextResponse.json({ ok: false, error: fallbackResult.error.message }, { status: 500 });
      }

      applicationId = fallbackResult.data?.id ?? null;
      savedApplication = fallbackResult.data ?? null;
    } else {
      applicationId = result.data?.id ?? null;
      savedApplication = result.data ?? null;
    }

    if (applicationId && savedApplication) {
      await sendApplicationReceivedEmails(savedApplication as SalesApplication).catch(() => undefined);
    }
  }

  return NextResponse.json({
    ok: true,
    application_id: applicationId,
    analysis: {
      business_summary: aiResult.analysis.business_summary,
      growth_opportunities: aiResult.analysis.growth_opportunities,
      recommended_setup_steps: aiResult.analysis.recommended_setup_steps,
      first_meeting_points: aiResult.analysis.first_meeting_points,
      status: aiResult.status
    }
  });
}
