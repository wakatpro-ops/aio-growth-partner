import "server-only";
import crypto from "node:crypto";
import OpenAI from "openai";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { constrainCaption, detectImageType, SNS_CHANNELS, type SnsChannel } from "@/lib/phase5/sns-rules";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStore } from "@/lib/stores";

const demos: Record<string, { organizationId: string; storeId: string }> = {
  "store-general-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000101" },
  "store-auto-demo": { organizationId: "00000000-0000-4000-8000-000000000001", storeId: "00000000-0000-4000-8000-000000000102" }
};

type Caption = ReturnType<typeof constrainCaption> & { approval_status: string; approved_at?: string | null; approved_by?: string | null };
type JobResult = { analysis?: Record<string, unknown>; captions?: Partial<Record<SnsChannel, Caption>>; image_note?: string; product_context?: string };
type MetaOAuthState = { storeId: string; nonce: string; createdAt: string; signature: string };
type MetaPageCandidate = { id: string; name: string; instagramId: string | null };

const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish"
] as const;

async function context(storeId: string) {
  const store = await getStore(storeId);
  const persisted = demos[store.id] ?? { organizationId: store.organization_id, storeId: store.id };
  return { ...persisted, publicStoreId: store.id, store };
}

async function requireEditor(organizationId: string) {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");
  const role = access.organizationRoles[organizationId];
  if (!access.isPlatformAdmin && !["org_owner", "store_manager", "staff"].includes(role)) throw new Error("SNS投稿を変更する権限がありません。");
  return access;
}

function parseJson(value: string) {
  try { return JSON.parse(value) as Record<string, unknown>; } catch {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return {}; }
  }
}

function metaSecret() { return process.env.SNS_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.META_APP_SECRET || ""; }
function signMetaState(storeId: string, nonce: string, createdAt: string) {
  const secret = metaSecret();
  if (!secret) throw new Error("Meta接続用の暗号化キーが未設定です。");
  return crypto.createHmac("sha256", secret).update(`${storeId}.${nonce}.${createdAt}`).digest("base64url");
}
function encodeMetaState(storeId: string) {
  const nonce = crypto.randomUUID(); const createdAt = new Date().toISOString();
  return Buffer.from(JSON.stringify({ storeId, nonce, createdAt, signature: signMetaState(storeId, nonce, createdAt) })).toString("base64url");
}
export function decodeMetaState(value: string | null) {
  if (!value) throw new Error("Meta接続情報がありません。");
  let state: MetaOAuthState;
  try { state = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as MetaOAuthState; } catch { throw new Error("Meta接続情報を読み取れません。"); }
  if (!state.storeId || !state.nonce || !state.createdAt || !state.signature || Date.now() - Date.parse(state.createdAt) > 15 * 60_000) throw new Error("Meta接続の有効期限が切れました。もう一度接続してください。");
  const expected = Buffer.from(signMetaState(state.storeId, state.nonce, state.createdAt)); const actual = Buffer.from(state.signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error("Meta接続の安全性を確認できませんでした。");
  return state.storeId;
}
function encryptMetaToken(value: string) {
  const secret = metaSecret();
  if (!secret) throw new Error("SNS_TOKEN_ENCRYPTION_KEY が未設定です。");
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", crypto.createHash("sha256").update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

export async function getMetaOAuthUrl(storeId: string) {
  const resolved = await context(storeId); await requireEditor(resolved.organizationId);
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET || !process.env.META_REDIRECT_URI || !metaSecret()) throw new Error("Meta連携は準備中です。管理者がMetaアプリ情報を設定すると接続できます。");
  const query = new URLSearchParams({ client_id: process.env.META_APP_ID, redirect_uri: process.env.META_REDIRECT_URI, state: encodeMetaState(storeId), response_type: "code", scope: META_OAUTH_SCOPES.join(",") });
  return `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/dialog/oauth?${query}`;
}

async function getMetaPages(token: string): Promise<Array<MetaPageCandidate & { token: string }>> {
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const payload = await response.json() as { data?: Array<{ id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string } }>; error?: { message?: string } };
  if (!response.ok || payload.error) throw new Error(String(payload.error?.message ?? "Facebookページを取得できませんでした。").slice(0, 500));
  return (payload.data ?? []).filter((item) => item.id && item.access_token).map((item) => ({ id: String(item.id), name: String(item.name ?? "Facebookページ"), instagramId: item.instagram_business_account?.id ? String(item.instagram_business_account.id) : null, token: String(item.access_token) }));
}

export async function completeMetaOAuth(code: string, state: string | null) {
  const storeId = decodeMetaState(state); const resolved = await context(storeId); await requireEditor(resolved.organizationId);
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET || !process.env.META_REDIRECT_URI) throw new Error("Meta OAuth環境変数が未設定です。");
  const query = new URLSearchParams({ client_id: process.env.META_APP_ID, client_secret: process.env.META_APP_SECRET, redirect_uri: process.env.META_REDIRECT_URI, code });
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/oauth/access_token?${query}`, { cache: "no-store" });
  const tokenResult = await response.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!response.ok || !tokenResult.access_token) throw new Error(String(tokenResult.error?.message ?? "Meta認証を完了できませんでした。").slice(0, 500));
  const pages = await getMetaPages(tokenResult.access_token);
  const supabase = createSupabaseAdminClient(); if (!supabase) throw new Error("Meta接続を保存できません。");
  const expiresAt = tokenResult.expires_in ? new Date(Date.now() + tokenResult.expires_in * 1000).toISOString() : null;
  const { error } = await supabase.from("external_channel_accounts").upsert({ organization_id: resolved.organizationId, store_id: resolved.storeId, channel: "meta_oauth", external_provider: "meta", account_name: "Meta OAuth", connection_status: "selection_required", access_token_encrypted: encryptMetaToken(tokenResult.access_token), token_expires_at: expiresAt, scopes: [...META_OAUTH_SCOPES], connected_at: new Date().toISOString(), error_message: null, metadata: { candidate_count: pages.length }, updated_at: new Date().toISOString() }, { onConflict: "store_id,channel,external_provider" });
  if (error) throw new Error(`Meta接続を保存できませんでした: ${error.message}`);
  return storeId;
}

export async function getMetaConnectionState(storeId: string) {
  const supabase = createSupabaseAdminClient(); if (!supabase) return { envReady: false, oauthConnected: false, candidates: [] as MetaPageCandidate[], accounts: [] as Array<Record<string, unknown>> };
  const resolved = await context(storeId);
  const { data: oauth } = await supabase.from("external_channel_accounts").select("*").eq("store_id", resolved.storeId).eq("channel", "meta_oauth").eq("external_provider", "meta").maybeSingle();
  let candidates: MetaPageCandidate[] = [];
  if (oauth?.access_token_encrypted && (!oauth.token_expires_at || Date.parse(oauth.token_expires_at) > Date.now())) {
    try { candidates = (await getMetaPages(decryptMetaToken(oauth.access_token_encrypted))).map((item) => ({ id: item.id, name: item.name, instagramId: item.instagramId })); } catch { candidates = []; }
  }
  const { data: accounts } = await supabase.from("external_channel_accounts").select("id,channel,external_account_id,account_name,connection_status,token_expires_at,error_message").eq("store_id", resolved.storeId).in("channel", ["instagram", "facebook"]);
  return { envReady: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI && metaSecret()), oauthConnected: Boolean(oauth?.access_token_encrypted && oauth.connection_status !== "disconnected"), candidates, accounts: accounts ?? [] };
}

export async function disconnectMeta(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Meta連携を解除できませんでした。");
  const resolved = await context(storeId);
  const access = await requireEditor(resolved.organizationId);
  const { data: oauth } = await supabase.from("external_channel_accounts").select("access_token_encrypted").eq("store_id", resolved.storeId).eq("channel", "meta_oauth").eq("external_provider", "meta").maybeSingle();

  if (oauth?.access_token_encrypted) {
    try {
      const token = decryptMetaToken(oauth.access_token_encrypted);
      await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/me/permissions?access_token=${encodeURIComponent(token)}`, { method: "DELETE", cache: "no-store" });
    } catch {
      // Meta側の失効に失敗しても、保存済みトークンは必ず削除する。
    }
  }

  const disconnectedAt = new Date().toISOString();
  const { error } = await supabase.from("external_channel_accounts").update({
    connection_status: "disconnected",
    access_token_encrypted: null,
    token_expires_at: null,
    disconnected_at: disconnectedAt,
    error_message: null,
    updated_at: disconnectedAt
  }).eq("store_id", resolved.storeId).eq("external_provider", "meta").in("channel", ["meta_oauth", "facebook", "instagram"]);
  if (error) throw new Error(`Meta連携を解除できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "meta_disconnected", targetType: "external_channel_account", message: "利用者がMeta連携を解除し、保存済みアクセストークンを削除しました。", metadata: { disconnected_by: access.userId } });
}

export async function selectMetaPage(storeId: string, pageId: string) {
  const supabase = createSupabaseAdminClient(); if (!supabase) throw new Error("Meta接続を保存できません。");
  const resolved = await context(storeId); await requireEditor(resolved.organizationId);
  const { data: oauth } = await supabase.from("external_channel_accounts").select("*").eq("store_id", resolved.storeId).eq("channel", "meta_oauth").eq("external_provider", "meta").maybeSingle();
  if (!oauth?.access_token_encrypted) throw new Error("先にMetaへ接続してください。");
  const pages = await getMetaPages(decryptMetaToken(oauth.access_token_encrypted));
  const page = pages.find((candidate) => candidate.id === pageId); if (!page) throw new Error("選択したFacebookページを確認できませんでした。");
  const common = { organization_id: resolved.organizationId, store_id: resolved.storeId, external_provider: "meta", account_name: page.name, connection_status: "connected", access_token_encrypted: encryptMetaToken(page.token), token_expires_at: oauth.token_expires_at, scopes: oauth.scopes, connected_at: new Date().toISOString(), disconnected_at: null, error_message: null, updated_at: new Date().toISOString() };
  const rows: Array<Record<string, unknown>> = [{ ...common, channel: "facebook", external_account_id: page.id, metadata: { facebook_page_id: page.id } }];
  if (page.instagramId) rows.push({ ...common, channel: "instagram", external_account_id: page.instagramId, metadata: { facebook_page_id: page.id, instagram_business_account_id: page.instagramId } });
  const { error } = await supabase.from("external_channel_accounts").upsert(rows, { onConflict: "store_id,channel,external_provider" });
  if (error) throw new Error(`投稿先を保存できませんでした: ${error.message}`);
  await supabase.from("external_channel_accounts").update({ connection_status: "connected", metadata: { candidate_count: pages.length, selected_page_id: page.id }, updated_at: new Date().toISOString() }).eq("id", oauth.id);
  await logAuditEvent({ storeId, actionType: "meta_page_selected", targetType: "external_channel_account", message: "利用者がMetaの投稿先ページを選択しました。", metadata: { facebook_page_id: page.id, instagram_connected: Boolean(page.instagramId) } });
}

async function analyzeAndCaption(buffer: Buffer, mimeType: string, store: { name: string; address?: string | null; phone?: string | null }, action: Record<string, unknown>, productContext: string) {
  const fallbackAnalysis = { summary: "画像を保存しました。内容を確認し、投稿文を編集してください。", safety: "needs_human_review" };
  if (!process.env.OPENAI_API_KEY) return { analysis: fallbackAnalysis, captions: {} };
  const prompt = [
    `店舗: ${store.name}`, `所在地: ${store.address ?? "未設定"}`, `電話: ${store.phone ?? "未設定"}`,
    `投稿テーマ: ${String(action.title ?? "")}`, `目的: ${String(action.summary ?? "")}`,
    `商品・メニュー情報: ${productContext || "未指定"}`,
    "画像を分析し、写っている事実だけを使って日本語のSNS投稿案を作成してください。個人情報、顔、著作物、医療・誇大表現の懸念を指摘してください。",
    "JSON形式: analysis={summary,objects,scene,alt_text,safety_flags}, captions={instagram,facebook,x,line}。各媒体はbody,short_body,hashtags配列,cta。断定できない内容は書かないでください。"
  ].join("\n");
  const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini", response_format: { type: "json_object" }, messages: [
      { role: "system", content: "あなたは店舗SNSの安全な編集者です。公開は行わず、人が承認する下書きだけをJSONで作ります。" },
      { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${mimeType};base64,${buffer.toString("base64")}` } }] }
    ]
  });
  const raw = parseJson(response.choices[0]?.message?.content ?? "{}");
  const rawCaptions = raw.captions && typeof raw.captions === "object" ? raw.captions as Record<string, Record<string, unknown>> : {};
  const captions = Object.fromEntries(SNS_CHANNELS.map((channel) => [channel, { ...constrainCaption(channel, rawCaptions[channel] ?? {}), approval_status: "draft" }]));
  return { analysis: raw.analysis && typeof raw.analysis === "object" ? raw.analysis as Record<string, unknown> : fallbackAnalysis, captions };
}

export async function listSnsMedia(storeId: string, actionId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await context(storeId);
  const { data } = await supabase.from("image_caption_jobs").select("*").eq("store_id", resolved.storeId).eq("growth_action_id", actionId).is("archived_at", null).order("created_at", { ascending: false });
  return data ?? [];
}

export async function uploadSnsMedia(storeId: string, actionId: string, formData: FormData) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("画像を保存する準備ができていません。");
  const resolved = await context(storeId);
  const access = await requireEditor(resolved.organizationId);
  const file = formData.get("image_file");
  if (!(file instanceof File) || file.size === 0) throw new Error("JPG、PNG、WebP画像を選択してください。");
  if (file.size > 8 * 1024 * 1024) throw new Error("画像は8MB以内にしてください。");
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || detected !== file.type) throw new Error("画像の内容とファイル形式が一致しません。JPG、PNG、WebPを選択してください。");
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const { data: duplicate } = await supabase.from("image_caption_jobs").select("id").eq("store_id", resolved.storeId).eq("growth_action_id", actionId).eq("file_sha256", hash).is("archived_at", null).maybeSingle();
  if (duplicate?.id) return { id: String(duplicate.id), duplicate: true };
  const { data: action } = await supabase.from("growth_actions").select("id,title,summary").eq("store_id", resolved.storeId).eq("id", actionId).maybeSingle();
  if (!action) throw new Error("SNS投稿アクションが見つかりません。");
  const productContext = String(formData.get("product_context") ?? "").trim().slice(0, 2000);
  const ext = detected === "image/jpeg" ? "jpg" : detected === "image/png" ? "png" : "webp";
  const storagePath = `${resolved.storeId}/${actionId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("sns-media").upload(storagePath, buffer, { contentType: detected, upsert: false });
  if (uploadError) throw new Error(`画像を保存できませんでした: ${uploadError.message}`);
  try {
    const generated = await analyzeAndCaption(buffer, detected, resolved.store, action, productContext);
    const result: JobResult = { ...generated, product_context: productContext, image_note: String(formData.get("image_note") ?? "").trim() };
    const { data, error } = await supabase.from("image_caption_jobs").insert({ organization_id: resolved.organizationId, store_id: resolved.storeId, industry_type_key: resolved.store.industry_type_key,
      growth_action_id: actionId, storage_bucket: "sns-media", storage_path: storagePath, original_file_name: file.name.slice(0, 255), mime_type: detected, file_size: file.size,
      file_sha256: hash, image_url: null, status: "analyzed", result, analysis_json: generated.analysis, approval_status: "draft", created_by: access.userId }).select("id").single();
    if (error) throw new Error(`画像の解析結果を保存できませんでした: ${error.message}`);
    await logAuditEvent({ storeId, actionType: "sns_media_uploaded", targetType: "image_caption_job", targetId: data.id, message: "SNS画像を安全に取り込み、媒体別の下書きを作成しました。", metadata: { mime_type: detected, file_size: file.size } });
    return { id: String(data.id), duplicate: false };
  } catch (error) { await supabase.storage.from("sns-media").remove([storagePath]); throw error; }
}

async function getOwnedJob(storeId: string, actionId: string, jobId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("保存の準備ができていません。");
  const resolved = await context(storeId);
  const access = await requireEditor(resolved.organizationId);
  const { data } = await supabase.from("image_caption_jobs").select("*").eq("store_id", resolved.storeId).eq("growth_action_id", actionId).eq("id", jobId).is("archived_at", null).maybeSingle();
  if (!data) throw new Error("SNS画像が見つかりません。");
  return { supabase, resolved, access, job: data };
}

export async function approveSnsMedia(storeId: string, actionId: string, jobId: string, formData: FormData) {
  const { supabase, access, job } = await getOwnedJob(storeId, actionId, jobId);
  const confirmations = ["copyright_confirmed", "person_consent_confirmed", "privacy_confirmed"].map((key) => formData.get(key) === "on");
  if (!confirmations.every(Boolean)) throw new Error("著作権・人物の同意・個人情報の3項目をすべて確認してください。");
  const result = (job.result && typeof job.result === "object" ? job.result : {}) as JobResult;
  const captions = { ...(result.captions ?? {}) };
  for (const channel of SNS_CHANNELS) {
    const input = { body: formData.get(`${channel}_body`), short_body: formData.get(`${channel}_short_body`), hashtags: formData.get(`${channel}_hashtags`), cta: formData.get(`${channel}_cta`) };
    captions[channel] = { ...constrainCaption(channel, input), approval_status: formData.get(`${channel}_approved`) === "on" ? "approved" : "draft", approved_at: formData.get(`${channel}_approved`) === "on" ? new Date().toISOString() : null, approved_by: formData.get(`${channel}_approved`) === "on" ? access.userId : null };
  }
  const { error } = await supabase.from("image_caption_jobs").update({ result: { ...result, captions }, approval_status: "approved", approved_by: access.userId, approved_at: new Date().toISOString(), copyright_confirmed: true, person_consent_confirmed: true, privacy_confirmed: true, updated_at: new Date().toISOString() }).eq("id", job.id);
  if (error) throw new Error(`承認内容を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "sns_media_approved", targetType: "image_caption_job", targetId: job.id, message: "SNS画像と媒体別投稿文を人が確認しました。", metadata: { approved_channels: SNS_CHANNELS.filter((channel) => captions[channel]?.approval_status === "approved") } });
}

export async function archiveSnsMedia(storeId: string, actionId: string, jobId: string) {
  const { supabase, access, job } = await getOwnedJob(storeId, actionId, jobId);
  const { error } = await supabase.from("image_caption_jobs").update({ status: "archived", archived_at: new Date().toISOString(), archived_by: access.userId, updated_at: new Date().toISOString() }).eq("id", job.id);
  if (error) throw new Error(`画像を削除できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "sns_media_archived", targetType: "image_caption_job", targetId: job.id, message: "SNS画像を画面上から削除しました。公開履歴の証跡は保持します。" });
}

export async function getSnsMediaPreview(storeId: string, actionId: string, jobId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;
  const resolved = await context(storeId);
  const { data: job } = await supabase.from("image_caption_jobs").select("storage_bucket,storage_path").eq("store_id", resolved.storeId).eq("growth_action_id", actionId).eq("id", jobId).is("archived_at", null).maybeSingle();
  if (!job?.storage_path) return null;
  const { data } = await supabase.storage.from(job.storage_bucket || "sns-media").createSignedUrl(job.storage_path, 600);
  return data?.signedUrl ?? null;
}

export async function queueSnsPublish(storeId: string, actionId: string, jobId: string, formData: FormData) {
  const { supabase, resolved, job } = await getOwnedJob(storeId, actionId, jobId);
  const channel = String(formData.get("channel") ?? "instagram") as SnsChannel;
  if (!SNS_CHANNELS.includes(channel)) throw new Error("投稿先を確認してください。");
  if (job.approval_status !== "approved" || !job.copyright_confirmed || !job.person_consent_confirmed || !job.privacy_confirmed) throw new Error("画像の安全確認と承認を先に完了してください。");
  const result = (job.result && typeof job.result === "object" ? job.result : {}) as JobResult;
  const caption = result.captions?.[channel];
  if (!caption || caption.approval_status !== "approved") throw new Error(`${channel}の投稿文を確認し、「この文章を承認」にチェックしてください。`);
  const scheduledRaw = String(formData.get("scheduled_at") ?? "");
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : new Date();
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("予約日時を確認してください。");
  const provider = channel === "instagram" || channel === "facebook" ? "meta" : `manual_${channel}`;
  const accountQuery = supabase.from("external_channel_accounts").select("id,connection_status,external_account_id,access_token_encrypted,token_expires_at").eq("store_id", resolved.storeId).eq("channel", channel);
  const { data: account } = provider === "meta" ? await accountQuery.eq("external_provider", "meta").maybeSingle() : { data: null };
  const directReady = provider === "meta" && account?.connection_status === "connected" && account.access_token_encrypted && (!account.token_expires_at || Date.parse(account.token_expires_at) > Date.now());
  const idempotencyKey = crypto.createHash("sha256").update(`${job.id}:${channel}:${scheduledAt.toISOString()}:${caption.full_text}`).digest("hex");
  const { data: existing } = await supabase.from("external_publish_jobs").select("id,status").eq("store_id", resolved.storeId).eq("provider", provider).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return { jobId: String(existing.id), status: String(existing.status), duplicate: true };
  const status = directReady ? (scheduledAt.getTime() <= Date.now() ? "ready" : "scheduled") : "manual_required";
  const { data, error } = await supabase.from("external_publish_jobs").insert({ organization_id: resolved.organizationId, store_id: resolved.storeId, growth_action_id: actionId,
    channel, provider, target_id: account?.external_account_id ?? null, status, scheduled_at: scheduledAt.toISOString(), idempotency_key: idempotencyKey,
    payload_json: { image_caption_job_id: job.id, media_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://app.aioboost.jp"}/api/sns/media/${job.public_token}`, caption: caption.full_text, manual_fallback: !directReady },
    response_json: directReady ? {} : { manual: true, reason: provider === "meta" ? "Metaアカウント未接続または認証期限切れ" : "この媒体は手動公開対応" } }).select("id,status").single();
  if (error) throw new Error(`投稿予定を保存できませんでした: ${error.message}`);
  await logAuditEvent({ storeId, actionType: "sns_publish_queued", targetType: "external_publish_job", targetId: data.id, message: directReady ? "SNS投稿を予約しました。" : "手動投稿用の本文と画像を準備しました。", metadata: { channel, status } });
  return { jobId: String(data.id), status: String(data.status), duplicate: false };
}

export async function listSnsPublishJobs(storeId: string, actionId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const resolved = await context(storeId);
  const { data } = await supabase.from("external_publish_jobs").select("*").eq("store_id", resolved.storeId).eq("growth_action_id", actionId).in("channel", [...SNS_CHANNELS]).order("created_at", { ascending: false }).limit(30);
  return data ?? [];
}

function decryptMetaToken(value: string) {
  const secret = metaSecret();
  if (!secret) throw new Error("SNS_TOKEN_ENCRYPTION_KEY が未設定です。");
  const [version, ivValue, tagValue, encryptedValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("Meta認証情報を確認できません。再接続してください。");
  const decipher = crypto.createDecipheriv("aes-256-gcm", crypto.createHash("sha256").update(secret).digest(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
}

async function metaRequest(path: string, token: string, fields: Record<string, string>) {
  const body = new URLSearchParams({ ...fields, access_token: token });
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok || payload.error) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    throw new Error(String(error.message ?? `Meta API error (${response.status})`).slice(0, 500));
  }
  return payload;
}

async function metaGet(path: string, token: string, fields: string) {
  const query = new URLSearchParams({ fields, access_token: token });
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/${path}?${query}`, { cache: "no-store" });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok || payload.error) return {};
  return payload;
}

export async function executeSnsPublishJob(jobId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("公開処理を開始できません。");
  const { data: job } = await supabase.from("external_publish_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw new Error("公開ジョブが見つかりません。");
  if (["sent", "manual_required"].includes(job.status)) return { jobId, status: job.status };
  if (job.scheduled_at && Date.parse(job.scheduled_at) > Date.now()) return { jobId, status: "scheduled" };
  if (job.next_retry_at && Date.parse(job.next_retry_at) > Date.now()) return { jobId, status: "retry_wait" };
  const { data: account } = await supabase.from("external_channel_accounts").select("*").eq("store_id", job.store_id).eq("channel", job.channel).eq("external_provider", "meta").eq("connection_status", "connected").maybeSingle();
  if (!account?.access_token_encrypted || !account.external_account_id) throw new Error("Metaアカウントが未接続です。手動投稿をご利用ください。");
  if (account.token_expires_at && Date.parse(account.token_expires_at) <= Date.now()) throw new Error("Meta認証の期限が切れました。再接続してください。");
  const token = decryptMetaToken(account.access_token_encrypted);
  const payload = job.payload_json as { media_url?: string; caption?: string };
  if (!payload.media_url || !payload.caption) throw new Error("公開する画像または本文がありません。");
  await supabase.from("external_publish_jobs").update({ status: "sending", attempt_count: Number(job.attempt_count ?? 0) + 1, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id);
  try {
    let response: Record<string, unknown>;
    if (job.channel === "instagram") {
      const container = await metaRequest(`${account.external_account_id}/media`, token, { image_url: payload.media_url, caption: payload.caption });
      response = await metaRequest(`${account.external_account_id}/media_publish`, token, { creation_id: String(container.id ?? "") });
    } else if (job.channel === "facebook") {
      response = await metaRequest(`${account.external_account_id}/photos`, token, { url: payload.media_url, caption: payload.caption, published: "true" });
    } else throw new Error("この媒体は手動公開に対応しています。");
    const externalId = String(response.post_id ?? response.id ?? "");
    const details = externalId ? await metaGet(externalId, token, "permalink_url,permalink") : {};
    const publicUrl = String(details.permalink_url ?? details.permalink ?? "") || (job.channel === "facebook" && externalId ? `https://www.facebook.com/${externalId.replace("_", "/posts/")}` : null);
    await supabase.from("external_publish_jobs").update({ status: "sent", target_id: externalId || account.external_account_id, sent_at: new Date().toISOString(), error_message: null, next_retry_at: null, response_json: { external_post_id: externalId, public_url: publicUrl }, updated_at: new Date().toISOString() }).eq("id", job.id);
    await supabase.from("growth_actions").update({ status: "done", external_provider: "meta", external_account_id: account.external_account_id, external_post_id: externalId || null, external_status: "sent", published_at: new Date().toISOString(), failed_reason: null, updated_at: new Date().toISOString() }).eq("id", job.growth_action_id).eq("store_id", job.store_id);
    return { jobId, status: "sent", externalId, publicUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta APIへの公開に失敗しました。";
    const attempts = Number(job.attempt_count ?? 0) + 1;
    const retryable = attempts < 4;
    const nextRetry = retryable ? new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString() : null;
    await supabase.from("external_publish_jobs").update({ status: retryable ? "retry_wait" : "failed", error_message: message.slice(0, 500), next_retry_at: nextRetry, updated_at: new Date().toISOString() }).eq("id", job.id);
    throw new Error(`${message}${retryable ? " 自動再試行を予約しました。" : " 手動投稿をご利用ください。"}`);
  }
}

export async function processDueSnsPublishJobs() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { processed: 0, results: [] as Array<Record<string, unknown>> };
  const now = new Date().toISOString();
  const { data } = await supabase.from("external_publish_jobs").select("id").eq("provider", "meta").in("status", ["ready", "scheduled", "retry_wait"]).lte("scheduled_at", now).or(`next_retry_at.is.null,next_retry_at.lte.${now}`).limit(20);
  const results: Array<Record<string, unknown>> = [];
  for (const item of data ?? []) {
    try { results.push(await executeSnsPublishJob(String(item.id))); }
    catch (error) { results.push({ jobId: item.id, status: "error", message: error instanceof Error ? error.message : "failed" }); }
  }
  return { processed: results.length, results };
}
