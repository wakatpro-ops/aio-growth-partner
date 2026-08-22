import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeFetchedStoreSite } from "@/lib/applications/store-analysis";
import { createPublicAnalysisToken, hashPublicAnalysisToken, publicRequestFingerprint } from "@/lib/applications/public-analysis-token";
import { fetchPublicStoreSite, normalizePublicUrl, PublicUrlError } from "@/lib/applications/url-safety";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ source_url: z.string().trim().min(3).max(2_000) });
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_REQUESTS = 8;

function publicError(error: unknown) {
  if (error instanceof PublicUrlError) return { code: error.code, message: error.message };
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return { code: "fetch_timeout", message: "ページの確認に時間がかかっています。別のURLを試すか、時間をおいてもう一度お試しください。" };
  }
  return { code: "fetch_failed", message: "ページを確認できませんでした。URLを確認するか、別の店舗ページをお試しください。" };
}

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, code: "invalid_url", error: "店舗を確認できるURLを入力してください。" }, { status: 400 });
  }

  let normalized: URL;
  try {
    normalized = normalizePublicUrl(parsed.data.source_url);
  } catch (error) {
    const safe = publicError(error);
    return NextResponse.json({ ok: false, code: safe.code, error: safe.message }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, code: "service_unavailable", error: "現在、診断を開始できません。時間をおいてもう一度お試しください。" }, { status: 503 });
  }

  const requestKey = publicRequestFingerprint(request);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from("public_store_analyses")
    .select("id", { count: "exact", head: true })
    .eq("rate_limit_key", requestKey)
    .gte("created_at", windowStart);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
    return NextResponse.json({ ok: false, code: "rate_limited", error: "短時間に多くの診断が行われました。15分ほど待ってからお試しください。" }, { status: 429 });
  }

  const token = createPublicAnalysisToken();
  const tokenHash = hashPublicAnalysisToken(token);
  const { data: draft, error: insertError } = await supabase
    .from("public_store_analyses")
    .insert({
      public_token_hash: tokenHash,
      source_url: normalized.toString(),
      status: "processing",
      rate_limit_key: requestKey
    })
    .select("id")
    .single();
  if (insertError || !draft) {
    return NextResponse.json({ ok: false, code: "service_unavailable", error: "現在、診断を保存できません。時間をおいてもう一度お試しください。" }, { status: 503 });
  }

  try {
    const fetched = await fetchPublicStoreSite(normalized.toString());
    const result = await analyzeFetchedStoreSite(fetched);
    const status = fetched.status === "partial" || result.ai.status === "fallback" ? "partial" : "success";
    const fetchSummary = {
      page_count: fetched.pages.length,
      pages: fetched.pages.map((page) => ({ url: page.url, title: page.title })),
      errors: fetched.errors,
      fetched_at: new Date().toISOString()
    };
    const { error: updateError } = await supabase.from("public_store_analyses").update({
      final_url: fetched.finalUrl,
      status,
      fetch_summary: fetchSummary,
      extracted_profile: result.profile,
      analysis_result: result.diagnosis,
      clarifying_questions: result.diagnosis.clarifying_questions,
      readiness_score: result.diagnosis.readiness_score,
      top_improvement: result.diagnosis.top_improvement,
      ai_status: result.ai.status,
      ai_model: result.ai.model,
      ai_error_code: result.ai.errorCode,
      updated_at: new Date().toISOString()
    }).eq("id", draft.id);
    if (updateError) {
      return NextResponse.json({ ok: false, code: "save_failed", error: "診断結果を保存できませんでした。もう一度お試しください。" }, { status: 503 });
    }

    return NextResponse.json({
      ok: true,
      analysis_token: token,
      status,
      source_url: normalized.toString(),
      final_url: fetched.finalUrl,
      profile: result.profile,
      diagnosis: result.diagnosis,
      ai_status: result.ai.status
    });
  } catch (error) {
    const safe = publicError(error);
    await supabase.from("public_store_analyses").update({
      status: "failed",
      ai_status: "not_started",
      ai_error_code: safe.code,
      fetch_summary: { error_code: safe.code, failed_at: new Date().toISOString() },
      updated_at: new Date().toISOString()
    }).eq("id", draft.id);
    return NextResponse.json({ ok: false, code: safe.code, error: safe.message }, { status: 422 });
  }
}
