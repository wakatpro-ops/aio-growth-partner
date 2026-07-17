import "server-only";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type FreeeOAuthState = {
  storeId: string;
  nonce: string;
  createdAt: string;
  signature: string;
};

type FreeeTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  company_id?: number | string;
  external_cid?: string;
  error?: string;
  error_description?: string;
};

type FreeeCompany = {
  id?: number | string;
  name?: string;
  display_name?: string;
  role?: string;
};

type FreeeCompaniesResponse = {
  companies?: FreeeCompany[];
};

type FreeeAccountItem = {
  id?: number | string;
  name?: string;
};

type FreeeTaxCode = {
  code?: number | string;
  name?: string;
  rate?: number | string;
};

type FreeeIntegration = {
  id: string;
  organization_id: string;
  store_id: string;
  status: string;
  external_company_id: string | null;
  office_name: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

const demoStoreIds: Record<string, { organizationId: string; storeId: string }> = {
  "store-general-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000101"
  },
  "store-auto-demo": {
    organizationId: "00000000-0000-4000-8000-000000000001",
    storeId: "00000000-0000-4000-8000-000000000102"
  }
};

async function resolveStore(supabase: SupabaseClient, storeId: string) {
  const store = await getStore(storeId);
  const demo = demoStoreIds[store.id];
  return {
    organizationId: demo?.organizationId ?? store.organization_id,
    storeId: demo?.storeId ?? store.id,
    publicStoreId: store.id
  };
}

export function freeeRedirectUri(requestOrigin?: string) {
  if (process.env.FREEE_REDIRECT_URI) return process.env.FREEE_REDIRECT_URI;
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || requestOrigin;
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, "")}/api/freee/oauth/callback`;
}

function freeeEnvError(requestOrigin?: string) {
  const missing = [
    ["FREEE_CLIENT_ID", process.env.FREEE_CLIENT_ID],
    ["FREEE_CLIENT_SECRET", process.env.FREEE_CLIENT_SECRET]
  ].filter(([, value]) => !value).map(([key]) => key);
  const redirectUri = freeeRedirectUri(requestOrigin);
  if (!redirectUri) missing.push("APP_BASE_URL");
  if (missing.length === 0) return null;
  return `freee接続に必要な設定が未完了です: ${missing.join(", ")}。`;
}

export function isFreeeConnectEnvReady(requestOrigin?: string) {
  return freeeEnvError(requestOrigin) === null;
}

function stateSecret() {
  const secret = process.env.FREEE_CLIENT_SECRET;
  if (!secret) throw new Error("freee接続の検証に必要な設定が未完了です。");
  return secret;
}

function signStatePayload(storeId: string, nonce: string, createdAt: string) {
  return crypto
    .createHmac("sha256", stateSecret())
    .update(`${storeId}.${nonce}.${createdAt}`)
    .digest("base64url");
}

function encodeFreeeOAuthState(storeId: string) {
  const nonce = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload: FreeeOAuthState = {
    storeId,
    nonce,
    createdAt,
    signature: signStatePayload(storeId, nonce, createdAt)
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeFreeeOAuthState(state: string | null) {
  if (!state) throw new Error("freee接続の確認情報がありません。もう一度接続してください。");
  let payload: FreeeOAuthState;
  try {
    payload = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as FreeeOAuthState;
  } catch {
    throw new Error("freee接続の確認情報を読み取れませんでした。もう一度接続してください。");
  }
  if (!payload.storeId || !payload.nonce || !payload.createdAt || !payload.signature) {
    throw new Error("freee接続の確認情報が不足しています。もう一度接続してください。");
  }
  const created = Date.parse(payload.createdAt);
  if (!Number.isFinite(created) || Date.now() - created > 15 * 60 * 1000) {
    throw new Error("freee接続の有効期限が切れました。もう一度接続してください。");
  }
  const expected = signStatePayload(payload.storeId, payload.nonce, payload.createdAt);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(payload.signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error("freee接続の確認に失敗しました。もう一度接続してください。");
  }
  return { storeId: payload.storeId, nonce: payload.nonce, createdAt: payload.createdAt };
}

function encryptToken(value: string | null | undefined) {
  if (!value) return { encryptedValue: null, storageMode: "not_returned" };
  const secret = process.env.FREEE_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) return { encryptedValue: null, storageMode: "not_stored_missing_encryption_key" };
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedValue: `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`,
    storageMode: "encrypted"
  };
}

function decryptToken(value: string | null | undefined) {
  if (!value) return null;
  if (!value.startsWith("v1:")) {
    throw new Error("freee接続情報の形式を確認できませんでした。再接続してください。");
  }
  const secret = process.env.FREEE_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("freee送信に必要な暗号化設定が未完了です。管理者に確認してください。");
  }
  const [, ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("freee接続情報を読み取れませんでした。再接続してください。");
  }
  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final()
  ]).toString("utf8");
}

async function logFreeeIntegration(
  supabase: SupabaseClient,
  resolved: { organizationId: string; storeId: string },
  actionType: string,
  status: string,
  message: string,
  metadata: Record<string, unknown> = {}
) {
  await supabase.from("external_integration_logs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: "freee",
    action_type: actionType,
    status,
    message,
    metadata_json: metadata
  });
}

async function fetchFreeeCompanies(accessToken: string) {
  const response = await fetch("https://api.freee.co.jp/api/1/companies", {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return await response.json() as FreeeCompaniesResponse;
}

function configText(config: Record<string, unknown> | null | undefined, key: string) {
  const value = config?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function configNumber(config: Record<string, unknown> | null | undefined, key: string) {
  const value = configText(config, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "")) as Partial<T>;
}

function toYmd(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

async function pickFreeeAccountItem(
  supabase: SupabaseClient,
  integration: FreeeIntegration,
  companyId: number,
  type: "income" | "expense"
) {
  const configured = configNumber(integration.config, type === "income" ? "income_account_item_id" : "expense_account_item_id");
  if (configured) return configured;
  const response = await freeeApiRequest(supabase, integration, `/api/1/account_items?company_id=${companyId}`, { method: "GET" });
  const accountItems = Array.isArray(response?.account_items) ? response.account_items as FreeeAccountItem[] : [];
  const preferredNames = type === "income"
    ? ["売上高", "売上", "サービス売上"]
    : ["消耗品費", "仕入高", "仕入", "雑費"];
  const picked = accountItems.find((item) => preferredNames.some((name) => item.name === name || item.name?.includes(name)));
  const id = Number(picked?.id);
  if (Number.isFinite(id)) return id;
  throw new Error("freeeの勘定科目IDを自動判定できませんでした。freee設定画面で勘定科目IDを入力してください。");
}

async function pickFreeeTaxCode(
  supabase: SupabaseClient,
  integration: FreeeIntegration,
  type: "income" | "expense"
) {
  const configured = configNumber(integration.config, type === "income" ? "income_tax_code" : "expense_tax_code");
  if (configured) return configured;
  const response = await freeeApiRequest(supabase, integration, "/api/1/taxes/codes", { method: "GET" });
  const taxCodes = Array.isArray(response?.taxes) ? response.taxes as FreeeTaxCode[] : [];
  const picked = taxCodes.find((tax) => {
    const name = tax.name ?? "";
    const rate = String(tax.rate ?? "");
    if (!name.includes("10") && rate !== "10") return false;
    return type === "income"
      ? name.includes("課税売上") || name.includes("売上")
      : name.includes("課対仕入") || name.includes("課税仕入") || name.includes("仕入");
  }) ?? taxCodes.find((tax) => String(tax.rate ?? "").includes("10") || String(tax.name ?? "").includes("10"));
  const code = Number(picked?.code);
  if (Number.isFinite(code)) return code;
  throw new Error("freeeの税区分コードを自動判定できませんでした。freee設定画面で税区分コードを入力してください。");
}

async function resolveFreeeDealDefaults(
  supabase: SupabaseClient,
  integration: FreeeIntegration,
  companyId: number,
  type: "income" | "expense"
) {
  const [accountItemId, taxCode] = await Promise.all([
    pickFreeeAccountItem(supabase, integration, companyId, type),
    pickFreeeTaxCode(supabase, integration, type)
  ]);
  return { accountItemId, taxCode };
}

async function getConnectedFreeeIntegration(supabase: SupabaseClient, resolved: { storeId: string }) {
  const { data, error } = await supabase
    .from("store_accounting_integrations")
    .select("*")
    .eq("store_id", resolved.storeId)
    .eq("provider", "freee")
    .maybeSingle();
  if (error) throw new Error(`freee接続情報を確認できませんでした: ${error.message}`);
  const integration = data as FreeeIntegration | null;
  if (!integration || integration.status !== "connected") {
    throw new Error("freee事業所が未接続です。先にfreee設定画面で接続してください。");
  }
  if (!integration.external_company_id) {
    throw new Error("freee事業所IDを確認できません。freeeへ再接続してください。");
  }
  if (!integration.access_token_encrypted) {
    throw new Error("freee送信に必要な接続情報が保存されていません。freeeへ再接続してください。");
  }
  return integration;
}

async function refreshFreeeAccessToken(supabase: SupabaseClient, integration: FreeeIntegration) {
  const refreshToken = decryptToken(integration.refresh_token_encrypted);
  if (!refreshToken) throw new Error("freee接続の有効期限が切れています。freeeへ再接続してください。");
  const response = await fetch("https://accounts.secure.freee.co.jp/public_api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.FREEE_CLIENT_ID!,
      client_secret: process.env.FREEE_CLIENT_SECRET!,
      refresh_token: refreshToken
    }),
    cache: "no-store"
  });
  const token = await response.json() as FreeeTokenResponse;
  if (!response.ok || token.error || !token.access_token) {
    throw new Error("freee接続の更新に失敗しました。freeeへ再接続してください。");
  }
  const accessToken = encryptToken(token.access_token);
  const nextRefreshToken = encryptToken(token.refresh_token ?? refreshToken);
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
  await supabase.from("store_accounting_integrations").update({
    access_token_encrypted: accessToken.encryptedValue,
    refresh_token_encrypted: nextRefreshToken.encryptedValue,
    token_expires_at: expiresAt,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error_message: null
  }).eq("id", integration.id);
  return token.access_token;
}

async function getFreeeAccessToken(supabase: SupabaseClient, integration: FreeeIntegration) {
  const expiresAt = integration.token_expires_at ? Date.parse(integration.token_expires_at) : 0;
  if (expiresAt && expiresAt < Date.now() + 2 * 60 * 1000) {
    return await refreshFreeeAccessToken(supabase, integration);
  }
  return decryptToken(integration.access_token_encrypted);
}

async function freeeApiRequest(
  supabase: SupabaseClient,
  integration: FreeeIntegration,
  path: string,
  init: RequestInit
) {
  let accessToken = await getFreeeAccessToken(supabase, integration);
  if (!accessToken) throw new Error("freee送信に必要な接続情報を確認できませんでした。freeeへ再接続してください。");
  let response = await fetch(`https://api.freee.co.jp${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });
  if (response.status === 401) {
    accessToken = await refreshFreeeAccessToken(supabase, integration);
    response = await fetch(`https://api.freee.co.jp${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {})
      },
      cache: "no-store"
    });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(payload?.errors)
      ? payload.errors.flatMap((item: { messages?: string[] }) => item.messages ?? []).join(" / ")
      : payload?.message ?? payload?.error_description ?? payload?.error ?? "freeeへの送信に失敗しました。";
    throw new Error(message || "freeeへの送信に失敗しました。");
  }
  return payload;
}

function buildPaymentRows(config: Record<string, unknown> | null | undefined, date: string, amount: number) {
  const walletableType = configText(config, "walletable_type");
  const walletableId = configNumber(config, "walletable_id");
  if (!walletableType || !walletableId || amount <= 0) return [];
  return [{
    date,
    from_walletable_type: walletableType,
    from_walletable_id: walletableId,
    amount
  }];
}

export async function buildFreeeOAuthStartUrl(storeId: string, requestOrigin?: string) {
  const envError = freeeEnvError(requestOrigin);
  if (envError) throw new Error(envError);
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee接続を保存する準備ができていません。");
  const resolved = await resolveStore(supabase, storeId);
  const state = encodeFreeeOAuthState(storeId);
  await logFreeeIntegration(supabase, resolved, "freee_oauth_started", "ready", "freee接続を開始しました。");

  const url = new URL("https://accounts.secure.freee.co.jp/public_api/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.FREEE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", freeeRedirectUri(requestOrigin)!);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_company");
  return url.toString();
}

export async function handleFreeeOAuthCallback(url: URL) {
  const state = decodeFreeeOAuthState(url.searchParams.get("state"));
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee接続を保存する準備ができていません。");
  const resolved = await resolveStore(supabase, state.storeId);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const description = url.searchParams.get("error_description") ?? oauthError;
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", description, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "freee接続が完了しませんでした。もう一度お試しください。" };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", "freee接続コードがありません。", { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "freee接続情報を確認できませんでした。もう一度お試しください。" };
  }
  const envError = freeeEnvError(url.origin);
  if (envError) {
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", envError, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: envError };
  }

  const response = await fetch("https://accounts.secure.freee.co.jp/public_api/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.FREEE_CLIENT_ID!,
      client_secret: process.env.FREEE_CLIENT_SECRET!,
      code,
      redirect_uri: freeeRedirectUri(url.origin)!
    }),
    cache: "no-store"
  });
  const token = await response.json() as FreeeTokenResponse;
  if (!response.ok || token.error || !token.access_token) {
    const message = token.error_description ?? token.error ?? "freee接続情報の取得に失敗しました。";
    await logFreeeIntegration(supabase, resolved, "freee_oauth_failed", "error", message, { nonce: state.nonce });
    return { storeId: state.storeId, ok: false, message: "freee接続情報の取得に失敗しました。時間をおいて再度お試しください。" };
  }

  const companies = await fetchFreeeCompanies(token.access_token);
  const selectedCompanyId = token.company_id ? String(token.company_id) : null;
  const selectedCompany = companies?.companies?.find((company) => String(company.id) === selectedCompanyId) ?? companies?.companies?.[0] ?? null;
  const companyId = selectedCompanyId ?? (selectedCompany?.id ? String(selectedCompany.id) : null);
  const officeName = selectedCompany?.display_name ?? selectedCompany?.name ?? (companyId ? `freee事業所 ${companyId}` : "freee事業所");
  const accessToken = encryptToken(token.access_token);
  const refreshToken = encryptToken(token.refresh_token);
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;

  await supabase.from("store_accounting_integrations").upsert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    provider: "freee",
    status: "connected",
    external_company_id: companyId,
    office_name: officeName,
    scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : ["read", "write"],
    access_token_encrypted: accessToken.encryptedValue,
    refresh_token_encrypted: refreshToken.encryptedValue,
    token_expires_at: expiresAt,
    config: {
      export_template: "freee_csv",
      target_data: ["invoices", "payments", "sales_transactions"],
      connection_mode: "oauth",
      prompt: "select_company"
    },
    metadata: {
      operation_mode: "freee_oauth_accounting",
      token_type: token.token_type ?? null,
      external_cid: token.external_cid ?? null,
      access_token_storage: accessToken.storageMode,
      refresh_token_storage: refreshToken.storageMode,
      companies_returned: companies?.companies?.length ?? 0,
      connected_via: "freee_oauth"
    },
    error_message: null,
    last_synced_at: new Date().toISOString(),
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    updated_at: new Date().toISOString()
  }, { onConflict: "store_id,provider" });

  if (accessToken.storageMode === "not_stored_missing_encryption_key" || refreshToken.storageMode === "not_stored_missing_encryption_key") {
    await logFreeeIntegration(
      supabase,
      resolved,
      "freee_token_storage_warning",
      "warning",
      "暗号化キーが未設定のため、freee token本体は保存せず、事業所情報のみ保存しました。",
      { company_id: companyId, nonce: state.nonce }
    );
  }

  await logFreeeIntegration(supabase, resolved, "freee_oauth_connected", "success", "freee接続を保存しました。", {
    company_id: companyId,
    office_name: officeName,
    nonce: state.nonce
  });

  return { storeId: state.storeId, ok: true, message: "freee接続が完了しました。" };
}

export async function disconnectFreeeConnect(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee接続を更新する準備ができていません。");
  const resolved = await resolveStore(supabase, storeId);
  const { error } = await supabase
    .from("store_accounting_integrations")
    .update({
      status: "disconnected",
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null,
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        operation_mode: "freee_oauth_disconnected"
      }
    })
    .eq("store_id", resolved.storeId)
    .eq("provider", "freee");
  if (error) throw new Error(`freee接続を解除できませんでした: ${error.message}`);
  await logFreeeIntegration(supabase, resolved, "freee_oauth_disconnected", "success", "freee接続を解除しました。");
}

export async function sendInvoicesAndPaymentsToFreee(storeId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee送信の準備ができていません。時間をおいて再度お試しください。");
  const access = await getCurrentUserAccess();
  const resolved = await resolveStore(supabase, storeId);
  const integration = await getConnectedFreeeIntegration(supabase, resolved);
  const companyId = Number(integration.external_company_id);
  if (!Number.isFinite(companyId)) throw new Error("freee事業所IDが正しくありません。freeeへ再接続してください。");
  const { accountItemId, taxCode } = await resolveFreeeDealDefaults(supabase, integration, companyId, "income");

  const { data: existingJobs } = await supabase
    .from("accounting_export_jobs")
    .select("metadata")
    .eq("store_id", resolved.storeId)
    .eq("provider", "freee")
    .eq("export_type", "freee_deals")
    .eq("status", "completed")
    .limit(200);
  const sentInvoiceIds = new Set<string>();
  for (const job of existingJobs ?? []) {
    const metadata = job.metadata as Record<string, unknown> | null;
    const invoiceIds = Array.isArray(metadata?.invoice_ids) ? metadata?.invoice_ids : [];
    for (const id of invoiceIds) if (typeof id === "string") sentInvoiceIds.add(id);
  }

  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("*, customer:customers(name, company_name)")
    .eq("store_id", resolved.storeId)
    .order("issue_date", { ascending: true })
    .limit(50);
  if (error) throw new Error(`請求書を確認できませんでした: ${error.message}`);
  const targets = (invoices ?? []).filter((invoice) => !sentInvoiceIds.has(invoice.id));
  if (targets.length === 0) {
    throw new Error("freeeへ送信できる未送信の請求書がありません。");
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("*")
    .eq("store_id", resolved.storeId)
    .in("invoice_id", targets.map((invoice) => invoice.id));
  const paymentsByInvoice = new Map<string, Array<Record<string, unknown>>>();
  for (const payment of payments ?? []) {
    const invoiceId = String(payment.invoice_id ?? "");
    if (!invoiceId) continue;
    paymentsByInvoice.set(invoiceId, [...(paymentsByInvoice.get(invoiceId) ?? []), payment]);
  }

  const sentDeals: Array<{ invoice_id: string; document_number: string; deal_id: string | number | null }> = [];
  const failedDeals: Array<{ invoice_id: string; document_number: string; error: string }> = [];

  for (const invoice of targets) {
    const total = Math.round(Number(invoice.total ?? 0));
    const paidRows = (paymentsByInvoice.get(invoice.id) ?? []).filter((payment) => Number(payment.amount ?? 0) > 0);
    const paymentRows = paidRows.flatMap((payment) => buildPaymentRows(
      integration.config,
      toYmd(payment.payment_date),
      Math.round(Number(payment.amount ?? 0))
    ));
    const requestPayload = compactObject({
      company_id: companyId,
      issue_date: toYmd(invoice.transaction_date ?? invoice.issue_date),
      due_date: invoice.due_date ? toYmd(invoice.due_date) : "",
      type: "income",
      ref_number: invoice.document_number ?? "",
      details: [{
        account_item_id: accountItemId,
        tax_code: taxCode,
        amount: total,
        description: invoice.title ?? invoice.document_number ?? "AIO請求書"
      }],
      payments: paymentRows.length > 0 ? paymentRows : undefined
    });

    try {
      const response = await freeeApiRequest(supabase, integration, "/api/1/deals", {
        method: "POST",
        body: JSON.stringify(requestPayload)
      });
      sentDeals.push({
        invoice_id: invoice.id,
        document_number: invoice.document_number ?? invoice.id,
        deal_id: response?.deal?.id ?? null
      });
    } catch (sendError) {
      failedDeals.push({
        invoice_id: invoice.id,
        document_number: invoice.document_number ?? invoice.id,
        error: sendError instanceof Error ? sendError.message : "freeeへの送信に失敗しました。"
      });
    }
  }

  const status = failedDeals.length > 0 && sentDeals.length > 0 ? "partial_failed" : failedDeals.length > 0 ? "failed" : "completed";
  const { data: job } = await supabase.from("accounting_export_jobs").insert({
    organization_id: resolved.organizationId,
    store_id: resolved.storeId,
    accounting_integration_id: integration.id,
    provider: "freee",
    export_type: "freee_deals",
    status,
    row_count: sentDeals.length,
    request_payload: {
      source: "invoices_payments",
      invoice_count: targets.length,
      freee_company_id: integration.external_company_id
    },
    response_payload: { deals: sentDeals, failed: failedDeals },
    metadata: {
      invoice_ids: sentDeals.map((item) => item.invoice_id),
      failed_invoice_ids: failedDeals.map((item) => item.invoice_id),
      source: "invoices_payments"
    },
    error_message: failedDeals.length > 0 ? failedDeals.map((item) => `${item.document_number}: ${item.error}`).join("\n") : null,
    created_by: access?.userId ?? null,
    completed_at: new Date().toISOString()
  }).select("id").single();

  await logFreeeIntegration(
    supabase,
    resolved,
    "freee_deals_sent",
    status === "completed" ? "success" : status,
    `freeeへ請求書・入金データを${sentDeals.length}件送信しました。`,
    { job_id: job?.id ?? null, sent_count: sentDeals.length, failed_count: failedDeals.length }
  );
  await logAuditEvent({
    storeId,
    actionType: "freee_deals_sent",
    targetType: "accounting_export_job",
    targetId: job?.id ?? null,
    message: `freeeへ請求書・入金データを${sentDeals.length}件送信しました。`,
    metadata: { status, failed_count: failedDeals.length }
  });
  if (sentDeals.length === 0 && failedDeals.length > 0) {
    throw new Error(failedDeals[0]?.error ?? "freeeへの送信に失敗しました。");
  }
  return { sentCount: sentDeals.length, failedCount: failedDeals.length, jobId: job?.id ?? null };
}

export async function sendExpenseReceiptToFreee(storeId: string, receiptId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("freee送信の準備ができていません。時間をおいて再度お試しください。");
  const access = await getCurrentUserAccess();
  const resolved = await resolveStore(supabase, storeId);
  const integration = await getConnectedFreeeIntegration(supabase, resolved);
  const companyId = Number(integration.external_company_id);
  if (!Number.isFinite(companyId)) throw new Error("freee事業所IDが正しくありません。freeeへ再接続してください。");
  const { accountItemId, taxCode } = await resolveFreeeDealDefaults(supabase, integration, companyId, "expense");

  const { data: receipt, error } = await supabase
    .from("expense_receipts")
    .select("*")
    .eq("store_id", resolved.storeId)
    .eq("id", receiptId)
    .maybeSingle();
  if (error || !receipt) throw new Error(`レシートが見つかりません: ${error?.message ?? ""}`);
  if (receipt.freee_status === "sent") {
    throw new Error("このレシートはすでにfreeeへ送信済みです。");
  }

  const total = Math.round(Number(receipt.total_amount ?? 0));
  if (total <= 0) throw new Error("freeeへ送信する金額を確認できません。レシート内容を確認してください。");

  const issueDate = toYmd(receipt.receipt_date);
  const requestPayload = compactObject({
    company_id: companyId,
    issue_date: issueDate,
    due_date: "",
    type: "expense",
    ref_number: receipt.original_file_name ?? receipt.id,
    details: [{
      account_item_id: accountItemId,
      tax_code: taxCode,
      amount: total,
      description: [receipt.vendor_name, receipt.category_name, receipt.ai_summary].filter(Boolean).join(" / ") || "AIOレシート経費"
    }],
    payments: buildPaymentRows(integration.config, issueDate, total)
  });

  try {
    const response = await freeeApiRequest(supabase, integration, "/api/1/deals", {
      method: "POST",
      body: JSON.stringify(requestPayload)
    });
    await supabase.from("expense_receipts").update({
      accounting_integration_id: integration.id,
      freee_status: "sent",
      freee_payload: requestPayload,
      freee_response: response,
      freee_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", receiptId);
    const { data: job } = await supabase.from("accounting_export_jobs").insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      accounting_integration_id: integration.id,
      provider: "freee",
      export_type: "receipt_deal",
      status: "completed",
      row_count: 1,
      file_name: receipt.original_file_name,
      storage_path: receipt.storage_path,
      request_payload: requestPayload,
      response_payload: response,
      metadata: { expense_receipt_id: receiptId, source: "expense_receipt" },
      created_by: access?.userId ?? null,
      completed_at: new Date().toISOString()
    }).select("id").single();
    await logFreeeIntegration(supabase, resolved, "freee_receipt_sent", "success", "freeeへレシート経費を送信しました。", {
      job_id: job?.id ?? null,
      receipt_id: receiptId,
      deal_id: response?.deal?.id ?? null
    });
    await logAuditEvent({
      storeId,
      actionType: "freee_receipt_sent",
      targetType: "expense_receipt",
      targetId: receiptId,
      message: "freeeへレシート経費を送信しました。",
      metadata: { job_id: job?.id ?? null, deal_id: response?.deal?.id ?? null }
    });
    return { jobId: job?.id ?? null, dealId: response?.deal?.id ?? null };
  } catch (sendError) {
    const message = sendError instanceof Error ? sendError.message : "freeeへの送信に失敗しました。";
    await supabase.from("expense_receipts").update({
      accounting_integration_id: integration.id,
      freee_status: "error",
      freee_payload: requestPayload,
      freee_response: {},
      updated_at: new Date().toISOString()
    }).eq("id", receiptId);
    await supabase.from("accounting_export_jobs").insert({
      organization_id: resolved.organizationId,
      store_id: resolved.storeId,
      accounting_integration_id: integration.id,
      provider: "freee",
      export_type: "receipt_deal",
      status: "failed",
      row_count: 0,
      file_name: receipt.original_file_name,
      storage_path: receipt.storage_path,
      request_payload: requestPayload,
      response_payload: {},
      metadata: { expense_receipt_id: receiptId, source: "expense_receipt" },
      error_message: message,
      created_by: access?.userId ?? null,
      completed_at: new Date().toISOString()
    });
    await logFreeeIntegration(supabase, resolved, "freee_receipt_failed", "error", message, { receipt_id: receiptId });
    throw new Error(message);
  }
}
