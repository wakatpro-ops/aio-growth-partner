import { NextResponse } from "next/server";
import { z } from "zod";
import { publicAnalysisPreview } from "@/lib/applications/analysis-presentation";
import { analyzeFetchedStoreSite, buildSelfReportedStore } from "@/lib/applications/store-analysis";
import { sourceIsExcluded } from "@/lib/applications/public-diagnosis";
import { createPublicAnalysisToken, hashPublicAnalysisToken, publicRequestFingerprint } from "@/lib/applications/public-analysis-token";
import { fetchPublicStoreSite, isRecoverableStoreFetchError, normalizePublicUrl, validatePublicUrl, PublicUrlError, type PublicSiteFetchResult } from "@/lib/applications/url-safety";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  source_url: z.string().trim().min(3).max(2_000),
  store_hint: z.string().trim().max(140).optional().default(""),
  area_hint: z.string().trim().max(140).optional().default(""),
  excluded_sources: z.array(z.string().url().max(2000)).max(12).default([]),
  manual_identity: z.boolean().default(false)
});
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
  if (parsed.data.manual_identity && (!parsed.data.store_hint || parsed.data.area_hint.length < 2)) {
    return NextResponse.json({ ok: false, code: "identity_required", error: "店舗名と地域を入力してください。" }, { status: 400 });
  }

  let normalized: URL;
  try {
    normalized = normalizePublicUrl(parsed.data.source_url);
    parsed.data.excluded_sources = parsed.data.excluded_sources.map(url => normalizePublicUrl(url).toString());
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
    let fetched: PublicSiteFetchResult;
    try {
      if (parsed.data.manual_identity || sourceIsExcluded(normalized.toString(), parsed.data.excluded_sources)) {
        await validatePublicUrl(normalized);
        fetched = { sourceUrl: normalized.toString(), finalUrl: normalized.toString(), pages: [], errors: [], status: "partial" };
      } else fetched = await fetchPublicStoreSite(normalized.toString());
    } catch (error) {
      if (!isRecoverableStoreFetchError(error)) throw error;
      // An inaccessible page contributes no business identity or checked source.
      fetched = { sourceUrl: normalized.toString(), finalUrl: normalized.toString(), pages: [],
        errors: [{ url: normalized.toString(), code: (error as PublicUrlError).code }], status: "partial" };
    }
    const result = parsed.data.manual_identity
      ? buildSelfReportedStore(normalized.toString(), parsed.data.store_hint, parsed.data.area_hint)
      : await analyzeFetchedStoreSite(fetched, parsed.data.store_hint, parsed.data.area_hint, parsed.data.excluded_sources);
    result.diagnosis.excluded_sources = parsed.data.excluded_sources;
    const status = fetched.status === "partial" || result.ai.status === "fallback" ? "partial" : "success";
    const fetchSummary = {
      page_count: fetched.pages.length,
      pages: fetched.pages.map((page) => ({ url: page.url, title: page.title })),
      errors: fetched.errors,
      user_hints: { store_name: parsed.data.store_hint, area: parsed.data.area_hint },
      fetched_at: new Date().toISOString()
    };
    const { error: updateError } = await supabase.from("public_store_analyses").update({
      final_url: fetched.finalUrl,
      status,
      fetch_summary: { ...fetchSummary, research_status: result.diagnosis.research_status, checked_sources: result.diagnosis.checked_sources },
      extracted_profile: result.profile,
      operating_model_draft: result.operatingModelDraft,
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

    if (!result.diagnosis.identification.identified) {
      const incompleteSearch = result.ai.status === "fallback" && !["openai_store_identity_mismatch", "openai_store_research_insufficient", "excluded_source_used"].includes(result.ai.errorCode ?? "");
      await supabase.from("public_store_analyses").update({
        status: "failed",
        updated_at: new Date().toISOString()
      }).eq("id", draft.id);
      return NextResponse.json({
        ok: false,
        code: "store_not_identified",
        needs_store_hint: true,
        needs_area_hint: true,
        searched_with_hints: Boolean(parsed.data.store_hint && parsed.data.area_hint),
        error: result.ai.errorCode === "excluded_source_used"
          ? "除外したページが検索結果に含まれたため、その情報を使った診断は採用しませんでした。別のURLで調べ直すか、入力した店舗情報で先へ進めます。"
          : incompleteSearch
          ? "公開情報の検索を完了できませんでした。店舗名・地域を補足して再調査するか、別のURLをお試しください。入力した店舗情報で進む場合も、公開情報は未確認として扱います。"
          : parsed.data.store_hint && parsed.data.area_hint
          ? "入力された店舗名・地域でも、一致を裏付ける公開情報が十分に見つかりませんでした。同じ内容を繰り返す必要はありません。情報を補足するか、入力した店舗情報で先へ進めます。"
          : "入力URLも検索しましたが、店舗の一致を確認できませんでした。店舗名と地域を教えてください。"
      }, { status: 422 });
    }

    const preview = publicAnalysisPreview({ profile: result.profile, diagnosis: result.diagnosis });
    return NextResponse.json({
      ok: true,
      analysis_token: token,
      status,
      profile: preview.profile,
      diagnosis: preview.diagnosis
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
    const recoverable = isRecoverableStoreFetchError(error);
    return NextResponse.json({ ok: false, code: safe.code,
      needs_store_hint: recoverable, needs_area_hint: recoverable,
      error: recoverable ? `${safe.code === "http_403" ? "掲載サイトからの取得が拒否され、このページを直接読み取れませんでした。" : safe.message} 店舗名と地域を教えてください。別の公開情報から調べ直せます。` : safe.message
    }, { status: 422 });
  }
}
