import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzePublicApplication } from "@/lib/applications/analysis";
import { findPublicIndustryOption } from "@/lib/applications/options";
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

function cleanList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 20);
}

export async function POST(request: Request) {
  const json = await request.json();
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

    const result = await supabase.from("applications").insert(fullPayload).select("id").single();

    if (result.error) {
      const fallbackResult = await supabase
        .from("applications")
        .insert({
          ...basePayload,
          admin_checklist: {
            public_application_enrichment: enrichment
          }
        })
        .select("id")
        .single();

      if (fallbackResult.error) {
        return NextResponse.json({ ok: false, error: fallbackResult.error.message }, { status: 500 });
      }

      applicationId = fallbackResult.data?.id ?? null;
    } else {
      applicationId = result.data?.id ?? null;
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
