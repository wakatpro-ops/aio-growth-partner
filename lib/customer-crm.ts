import "server-only";

import * as XLSX from "xlsx";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { generateWithAi } from "@/lib/openai/generate";
import { listCustomers } from "@/lib/phase2/business-data";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CustomerImportJob, CustomerMessageDraft, CustomerNote, CustomerSegmentSummary } from "@/types/customer-crm";
import type { Customer } from "@/types/phase2";

type ImportRow = Record<string, unknown>;

export const customerImportFields = [
  { key: "name", label: "名前", required: true, aliases: ["名前", "氏名", "顧客名", "name", "customer_name"] },
  { key: "company_name", label: "会社名・屋号", required: false, aliases: ["会社名", "屋号", "法人名", "company", "company_name"] },
  { key: "phone", label: "電話番号", required: true, aliases: ["電話番号", "電話", "携帯", "携帯電話", "tel", "phone"] },
  { key: "email", label: "メールアドレス", required: false, aliases: ["メールアドレス", "メール", "メアド", "email", "mail"] },
  { key: "address", label: "住所", required: false, aliases: ["住所", "所在地", "address"] },
  { key: "birth_date", label: "生年月日・誕生日", required: false, aliases: ["生年月日", "誕生日", "birthday", "birth_date"] },
  { key: "gender", label: "性別", required: false, aliases: ["性別", "gender", "sex"] },
  { key: "occupation", label: "職業", required: false, aliases: ["職業", "occupation", "job"] },
  { key: "assigned_staff_name", label: "担当者", required: false, aliases: ["担当者", "担当", "スタッフ", "staff", "assignee"] },
  { key: "line_account", label: "LINE", required: false, aliases: ["LINE", "LINEアカウント", "line", "line_account"] },
  { key: "instagram_account", label: "Instagram", required: false, aliases: ["Instagram", "インスタグラム", "インスタ", "instagram"] },
  { key: "facebook_account", label: "Facebook", required: false, aliases: ["Facebook", "フェイスブック", "facebook"] },
  { key: "last_visit_date", label: "最終来店日", required: false, aliases: ["最終来店日", "前回来店日", "last_visit", "last_visit_date"] },
  { key: "visit_count", label: "来店回数", required: false, aliases: ["来店回数", "利用回数", "visit_count", "visits"] },
  { key: "notes", label: "備考・会話メモ", required: false, aliases: ["備考", "メモ", "会話", "施術メモ", "notes", "memo"] },
  { key: "tags", label: "タグ", required: false, aliases: ["タグ", "分類", "tags", "segment"] },
  { key: "customer_code", label: "顧客番号", required: false, aliases: ["顧客番号", "顧客コード", "会員番号", "customer_code"] },
  { key: "preferred_channel", label: "希望連絡方法", required: false, aliases: ["希望連絡方法", "連絡方法", "preferred_channel"] },
  { key: "email_opt_in", label: "メール配信許可", required: false, aliases: ["メール配信許可", "メール許可", "email_opt_in"] },
  { key: "line_opt_in", label: "LINE配信許可", required: false, aliases: ["LINE配信許可", "LINE許可", "line_opt_in"] },
  { key: "social_opt_in", label: "SNS配信許可", required: false, aliases: ["SNS配信許可", "SNS許可", "social_opt_in"] },
  { key: "do_not_contact", label: "配信停止", required: false, aliases: ["配信停止", "連絡停止", "do_not_contact"] }
] as const;

export type CustomerImportFieldKey = typeof customerImportFields[number]["key"];

const segmentDefinitions = [
  { key: "all", label: "すべての顧客", description: "削除されていない顧客です。", recommendedAction: "店舗全体のお知らせを準備" },
  { key: "birthday_month", label: "今月が誕生日", description: "今月に誕生日を迎える顧客です。", recommendedAction: "誕生日のお祝い・特典を案内" },
  { key: "inactive_90", label: "90日以上来店なし", description: "最終来店から90日以上経過した顧客です。", recommendedAction: "負担にならない再来店案内を作成" },
  { key: "first_visit", label: "来店1回", description: "来店回数が1回の顧客です。", recommendedAction: "2回目の来店理由を案内" },
  { key: "repeat_10", label: "来店10回以上", description: "継続利用している大切な顧客です。", recommendedAction: "感謝と先行案内を準備" },
  { key: "line_ready", label: "LINE配信可能", description: "LINE情報と配信許可があり、配信停止でない顧客です。", recommendedAction: "短いLINE案内を作成" },
  { key: "email_ready", label: "メール配信可能", description: "メールアドレスと配信許可があり、配信停止でない顧客です。", recommendedAction: "メール案内を作成" },
  { key: "contact_missing", label: "配信先の確認が必要", description: "メール・LINEのどちらも登録されていない顧客です。", recommendedAction: "次回来店時に連絡方法を確認" },
  { key: "do_not_contact", label: "配信停止", description: "メッセージを送らない顧客です。", recommendedAction: "配信対象から必ず除外" }
] as const;

function text(value: unknown) {
  const next = String(value ?? "").trim();
  return next.length > 0 ? next : null;
}

export function normalizePhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/[^\d+]/g, "").replace(/^\+81/, "0");
  return normalized.replace(/\D/g, "");
}

function validPhone(value: string) {
  return /^\d{8,15}$/.test(value);
}

function validEmail(value: string | null) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeGender(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["女性", "女", "female", "woman"].includes(raw)) return "female";
  if (["男性", "男", "male", "man"].includes(raw)) return "male";
  if (["その他", "other", "non-binary", "nonbinary"].includes(raw)) return "other";
  if (["回答しない", "無回答", "prefer_not_to_say", "prefer not to say"].includes(raw)) return "prefer_not_to_say";
  return null;
}

function dateText(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/[年月.]/g, "-").replace(/日/g, "").replaceAll("/", "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function optionalBoolean(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (["1", "true", "yes", "y", "はい", "可", "許可", "希望", "配信する"].includes(raw)) return true;
  if (["0", "false", "no", "n", "いいえ", "不可", "停止", "配信しない"].includes(raw)) return false;
  return undefined;
}

function splitTags(value: unknown) {
  return String(value ?? "").split(/[、,;\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function normalizedHeader(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[\s_\-]/g, "");
}

function suggestMapping(headers: string[]) {
  const normalized = new Map(headers.map((header) => [normalizedHeader(header), header]));
  return Object.fromEntries(customerImportFields.map((field) => {
    const source = field.aliases.map((alias) => normalized.get(normalizedHeader(alias))).find(Boolean);
    return [field.key, source ?? ""];
  }));
}

function decodeCsv(buffer: Buffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("�")) return utf8.replace(/^\uFEFF/, "");
  return new TextDecoder("shift_jis", { fatal: false }).decode(buffer).replace(/^\uFEFF/, "");
}

function parseWorkbook(fileName: string, buffer: Buffer) {
  const lower = fileName.toLowerCase();
  const workbook = lower.endsWith(".csv")
    ? XLSX.read(decodeCsv(buffer), { type: "string", raw: false })
    : XLSX.read(buffer, { type: "buffer", cellDates: false, raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("取り込めるシートがありません。");
  const rows = XLSX.utils.sheet_to_json<ImportRow>(workbook.Sheets[firstSheetName], { defval: "", raw: false });
  if (rows.length === 0) throw new Error("顧客データがありません。1行目を見出し、2行目以降を顧客情報にしてください。");
  if (rows.length > 2000) throw new Error("一度に取り込める顧客は2,000件までです。ファイルを分けてください。");
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter(Boolean);
  return { rows, headers };
}

async function context(storeId: string) {
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

export async function createCustomerImportJobFromForm(storeId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId);
  const file = formData.get("customer_file");
  if (!(file instanceof File) || file.size === 0) throw new Error("CSVまたはExcelファイルを選択してください。");
  if (file.size > 10 * 1024 * 1024) throw new Error("ファイルは10MB以内にしてください。");
  const lower = file.name.toLowerCase();
  if (![".csv", ".xlsx", ".xls"].some((extension) => lower.endsWith(extension))) {
    throw new Error("CSV、XLSX、XLSファイルだけ取り込めます。");
  }
  const { rows, headers } = parseWorkbook(file.name, Buffer.from(await file.arrayBuffer()));
  const mapping = suggestMapping(headers);
  const { data, error } = await supabase.from("customer_import_jobs").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    original_filename: file.name,
    file_type: lower.endsWith(".csv") ? "csv" : "excel",
    status: "preview",
    source_headers: headers,
    mapping,
    preview_rows: rows.slice(0, 10),
    raw_rows: rows,
    row_count: rows.length,
    created_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`顧客ファイルを確認用に保存できませんでした: ${error?.message ?? ""}`);
  await logAuditEvent({
    storeId: store.id,
    actionType: "customer_import_uploaded",
    targetType: "customer_import",
    targetId: String(data.id),
    message: `顧客データ取込の確認を開始しました（${rows.length}件）。`,
    metadata: { row_count: rows.length, file_type: lower.endsWith(".csv") ? "csv" : "excel" }
  });
  return String(data.id);
}

export async function listCustomerImportJobs(storeId: string): Promise<CustomerImportJob[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("customer_import_jobs").select("*").eq("store_id", store.id).is("archived_at", null).order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(`顧客取込履歴を取得できませんでした: ${error.message}`);
  return (data ?? []) as CustomerImportJob[];
}

export async function getCustomerImportJob(storeId: string, importJobId: string): Promise<CustomerImportJob | null> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("customer_import_jobs").select("*").eq("store_id", store.id).eq("id", importJobId).is("archived_at", null).maybeSingle();
  if (error) throw new Error(`顧客取込を取得できませんでした: ${error.message}`);
  return data as CustomerImportJob | null;
}

function mapped(row: ImportRow, mapping: Record<string, string>, key: CustomerImportFieldKey) {
  const source = mapping[key];
  return source ? row[source] : undefined;
}

function importPayload(row: ImportRow, mapping: Record<string, string>) {
  const name = text(mapped(row, mapping, "name"));
  const phone = text(mapped(row, mapping, "phone"));
  const phoneNormalized = normalizePhone(phone);
  const email = text(mapped(row, mapping, "email"));
  if (!name) throw new Error("名前がありません。");
  if (!phone || !validPhone(phoneNormalized)) throw new Error("電話番号は8〜15桁で入力してください。");
  if (!validEmail(email)) throw new Error("メールアドレスの形式を確認してください。");
  const birthRaw = text(mapped(row, mapping, "birth_date"));
  const lastVisitRaw = text(mapped(row, mapping, "last_visit_date"));
  const birthDate = birthRaw ? dateText(birthRaw) : null;
  const lastVisitDate = lastVisitRaw ? dateText(lastVisitRaw) : null;
  if (birthRaw && !birthDate) throw new Error("生年月日の形式を確認してください。例: 1990-01-31");
  if (lastVisitRaw && !lastVisitDate) throw new Error("最終来店日の形式を確認してください。例: 2026-08-15");
  const visitRaw = text(mapped(row, mapping, "visit_count"));
  const visitCount = visitRaw ? Number(visitRaw.replace(/[^\d]/g, "")) : undefined;
  if (visitRaw && (!Number.isInteger(visitCount) || Number(visitCount) < 0)) throw new Error("来店回数は0以上の整数にしてください。");

  const payload: Record<string, unknown> = {
    name,
    phone,
    phone_normalized: phoneNormalized,
    company_name: text(mapped(row, mapping, "company_name")),
    email,
    address: text(mapped(row, mapping, "address")),
    birth_date: birthDate,
    gender: normalizeGender(mapped(row, mapping, "gender")),
    occupation: text(mapped(row, mapping, "occupation")),
    assigned_staff_name: text(mapped(row, mapping, "assigned_staff_name")),
    line_account: text(mapped(row, mapping, "line_account")),
    instagram_account: text(mapped(row, mapping, "instagram_account")),
    facebook_account: text(mapped(row, mapping, "facebook_account")),
    last_visit_date: lastVisitDate,
    customer_code: text(mapped(row, mapping, "customer_code")),
    preferred_channel: text(mapped(row, mapping, "preferred_channel")),
    tags: splitTags(mapped(row, mapping, "tags")),
    import_source: "customer_file"
  };
  if (visitCount !== undefined) payload.visit_count = visitCount;
  for (const key of ["email_opt_in", "line_opt_in", "social_opt_in", "do_not_contact"] as const) {
    const value = optionalBoolean(mapped(row, mapping, key));
    if (value !== undefined) payload[key] = value;
  }
  return { payload, note: text(mapped(row, mapping, "notes")) };
}

export async function executeCustomerImportFromForm(storeId: string, importJobId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId);
  const job = await getCustomerImportJob(store.id, importJobId);
  if (!job) throw new Error("顧客取込が見つかりません。");
  if (job.status === "completed") throw new Error("この顧客データはすでに取り込み済みです。");
  const mapping = Object.fromEntries(customerImportFields.map((field) => [field.key, String(formData.get(`mapping_${field.key}`) ?? "").trim()]));
  for (const field of customerImportFields.filter((item) => item.required)) {
    if (!mapping[field.key]) throw new Error(`${field.label}の列を選択してください。`);
  }
  const duplicateBehavior = String(formData.get("duplicate_behavior") ?? "skip") === "update" ? "update" : "skip";
  await supabase.from("customer_import_jobs").update({ status: "processing", mapping, duplicate_behavior: duplicateBehavior, updated_at: new Date().toISOString() }).eq("id", job.id).eq("store_id", store.id);

  const { data: existingRows } = await supabase.from("customers").select("id, phone, phone_normalized").eq("store_id", store.id).is("archived_at", null);
  const existingByPhone = new Map<string, string>();
  for (const existing of existingRows ?? []) {
    const normalized = String(existing.phone_normalized ?? "") || normalizePhone(existing.phone);
    if (normalized && !existingByPhone.has(normalized)) existingByPhone.set(normalized, String(existing.id));
  }

  let successCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors: Array<{ row: number; message: string }> = [];
  try {
    for (let index = 0; index < job.raw_rows.length; index += 1) {
      try {
        const { payload, note } = importPayload(job.raw_rows[index], mapping);
        const normalized = String(payload.phone_normalized);
        const existingId = existingByPhone.get(normalized);
        let customerId = existingId;
        if (existingId && duplicateBehavior === "skip") {
          skippedCount += 1;
          continue;
        }
        if (existingId) {
          const updatePayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== "" && (!Array.isArray(value) || value.length > 0)));
          const { error } = await supabase.from("customers").update({ ...updatePayload, updated_at: new Date().toISOString() }).eq("id", existingId).eq("store_id", store.id);
          if (error) throw new Error(error.message);
          updatedCount += 1;
        } else {
          const { data, error } = await supabase.from("customers").insert({ organization_id: store.organization_id, store_id: store.id, ...payload }).select("id").single();
          if (error || !data) throw new Error(error?.message ?? "顧客を保存できませんでした。");
          customerId = String(data.id);
          existingByPhone.set(normalized, customerId);
          successCount += 1;
        }
        if (note && customerId) {
          const { error } = await supabase.from("customer_notes").insert({
            organization_id: store.organization_id,
            store_id: store.id,
            customer_id: customerId,
            body: note,
            created_by: access.userId
          });
          if (error) throw new Error(`備考を保存できませんでした: ${error.message}`);
        }
      } catch (error) {
        errors.push({ row: index + 2, message: error instanceof Error ? error.message : "取り込みに失敗しました。" });
      }
    }
    await supabase.from("customer_import_jobs").update({
      status: "completed",
      mapping,
      raw_rows: [],
      success_count: successCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      error_count: errors.length,
      errors: errors.slice(0, 200),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", job.id).eq("store_id", store.id);
  } catch (error) {
    await supabase.from("customer_import_jobs").update({ status: "failed", errors: [{ row: 0, message: error instanceof Error ? error.message : "処理に失敗しました。" }], updated_at: new Date().toISOString() }).eq("id", job.id).eq("store_id", store.id);
    throw error;
  }
  await logAuditEvent({
    storeId: store.id,
    actionType: "customer_import_completed",
    targetType: "customer_import",
    targetId: job.id,
    message: `顧客データを取り込みました（新規${successCount}件、更新${updatedCount}件、スキップ${skippedCount}件、エラー${errors.length}件）。`,
    metadata: { success_count: successCount, updated_count: updatedCount, skipped_count: skippedCount, error_count: errors.length }
  });
}

export async function listCustomerNotes(storeId: string, customerId: string): Promise<CustomerNote[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("customer_notes").select("*").eq("store_id", store.id).eq("customer_id", customerId).is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw new Error(`顧客メモを取得できませんでした: ${error.message}`);
  return (data ?? []) as CustomerNote[];
}

export async function createCustomerNoteFromForm(storeId: string, customerId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId);
  const body = text(formData.get("body"));
  if (!body) throw new Error("会話・対応メモを入力してください。");
  const { data, error } = await supabase.from("customer_notes").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    customer_id: customerId,
    body,
    follow_up: text(formData.get("follow_up")),
    created_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`顧客メモを保存できませんでした: ${error?.message ?? ""}`);
  await logAuditEvent({ storeId: store.id, actionType: "customer_note_created", targetType: "customer_note", targetId: String(data.id), message: "顧客の会話・対応メモを追加しました。" });
}

export async function updateCustomerNoteFromForm(storeId: string, noteId: string, formData: FormData) {
  const { store, supabase } = await context(storeId);
  const body = text(formData.get("body"));
  if (!body) throw new Error("会話・対応メモを入力してください。");
  const { error } = await supabase.from("customer_notes").update({ body, follow_up: text(formData.get("follow_up")), updated_at: new Date().toISOString() }).eq("id", noteId).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`顧客メモを更新できませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "customer_note_updated", targetType: "customer_note", targetId: noteId, message: "顧客の会話・対応メモを更新しました。" });
}

export function customerMatchesSegment(customer: Customer, segmentKey: string, now = new Date()) {
  if (segmentKey === "all") return true;
  if (segmentKey === "birthday_month") return Boolean(customer.birth_date && Number(customer.birth_date.slice(5, 7)) === now.getMonth() + 1);
  if (segmentKey === "inactive_90") return Boolean(customer.last_visit_date && new Date(`${customer.last_visit_date}T00:00:00Z`).getTime() <= now.getTime() - 90 * 86400000);
  if (segmentKey === "first_visit") return Number(customer.visit_count ?? 0) === 1;
  if (segmentKey === "repeat_10") return Number(customer.visit_count ?? 0) >= 10;
  if (segmentKey === "line_ready") return Boolean(customer.line_account && customer.line_opt_in && !customer.do_not_contact);
  if (segmentKey === "email_ready") return Boolean(customer.email && customer.email_opt_in && !customer.do_not_contact);
  if (segmentKey === "contact_missing") return !customer.email && !customer.line_account;
  if (segmentKey === "do_not_contact") return Boolean(customer.do_not_contact);
  return false;
}

export async function getCustomerSegmentSummaries(storeId: string): Promise<CustomerSegmentSummary[]> {
  const customers = await listCustomers(storeId, 2000);
  return segmentDefinitions.map((segment) => ({ ...segment, count: customers.filter((customer) => customerMatchesSegment(customer, segment.key)).length }));
}

export async function listCustomersForSegment(storeId: string, segmentKey: string) {
  const customers = await listCustomers(storeId, 2000);
  return customers.filter((customer) => customerMatchesSegment(customer, segmentKey));
}

export function customerSegmentDefinition(segmentKey: string) {
  return segmentDefinitions.find((segment) => segment.key === segmentKey) ?? segmentDefinitions[0];
}

function customerCanReceiveChannel(customer: Customer, channel: string) {
  if (customer.do_not_contact) return false;
  if (channel === "email") return Boolean(customer.email && customer.email_opt_in);
  if (channel === "line") return Boolean(customer.line_account && customer.line_opt_in);
  if (channel === "instagram") return Boolean(customer.instagram_account && customer.social_opt_in);
  if (channel === "facebook") return Boolean(customer.facebook_account && customer.social_opt_in);
  return channel === "manual";
}

export async function listCustomerMessageDrafts(storeId: string): Promise<CustomerMessageDraft[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("customer_message_drafts").select("*, customer:customers(name)").eq("store_id", store.id).is("archived_at", null).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`顧客メッセージを取得できませんでした: ${error.message}`);
  return (data ?? []) as CustomerMessageDraft[];
}

export async function getCustomerMessageDraft(storeId: string, draftId: string): Promise<CustomerMessageDraft | null> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("customer_message_drafts").select("*, customer:customers(name)").eq("store_id", store.id).eq("id", draftId).is("archived_at", null).maybeSingle();
  if (error) throw new Error(`顧客メッセージを取得できませんでした: ${error.message}`);
  return data as CustomerMessageDraft | null;
}

export async function createCustomerMessageDraftFromForm(storeId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId);
  const segmentKey = String(formData.get("segment_key") ?? "all");
  const customerId = text(formData.get("customer_id"));
  const channel = String(formData.get("channel") ?? "email");
  const goal = text(formData.get("goal")) ?? "再来店のきっかけを作る";
  const scheduledAt = text(formData.get("scheduled_at"));
  const segment = customerSegmentDefinition(segmentKey);
  const supportedChannels = ["email", "line", "instagram", "facebook", "manual"];
  if (!supportedChannels.includes(channel)) throw new Error("利用する媒体を選び直してください。");
  const candidates = await listCustomersForSegment(store.id, segment.key);
  let audience = candidates.filter((customer) => customerCanReceiveChannel(customer, channel)).length;
  if (customerId) {
    const customer = (await listCustomers(store.id, 2000)).find((item) => item.id === customerId);
    if (!customer) throw new Error("選択した顧客が見つかりません。");
    if (!customerCanReceiveChannel(customer, channel)) {
      throw new Error("この顧客は、選択した媒体の配信許可または配信先を確認できないため対象にできません。");
    }
    audience = 1;
  }
  const result = await generateWithAi({
    store,
    templateKey: "customer_segment_message",
    input: {
      segment: { key: segment.key, label: segment.label, count: audience, description: segment.description },
      channel,
      goal,
      privacy_note: "顧客名、電話番号、メールアドレス、会話メモはAIへ送信していません。"
    },
    userId: access.userId
  });
  const output = result.output && typeof result.output === "object" ? result.output as Record<string, unknown> : {};
  const title = text(output.title) ?? `${segment.label}へのご案内`;
  const body = text(output.body) ?? `{{名前}}様\n\nいつも${store.name}をご利用いただきありがとうございます。${goal}ためのご案内です。内容をご確認のうえ、必要に応じてご利用ください。`;
  const { data, error } = await supabase.from("customer_message_drafts").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    customer_id: customerId,
    segment_key: segment.key,
    channel,
    goal,
    title,
    body,
    audience_count: audience,
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    status: scheduledAt ? "scheduled" : "draft",
    ai_reasoning: text(output.ai_reasoning),
    created_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`顧客メッセージを保存できませんでした: ${error?.message ?? ""}`);
  await logAuditEvent({ storeId: store.id, actionType: "customer_message_draft_created", targetType: "customer_message", targetId: String(data.id), message: "匿名化した顧客集計からメッセージ下書きを作成しました。", metadata: { segment_key: segment.key, channel, audience_count: audience, scheduled: Boolean(scheduledAt) } });
  return String(data.id);
}

export async function updateCustomerMessageDraftFromForm(storeId: string, draftId: string, formData: FormData) {
  const { store, supabase } = await context(storeId);
  const title = text(formData.get("title"));
  const body = text(formData.get("body"));
  if (!title || !body) throw new Error("件名と本文を入力してください。");
  const scheduledAt = text(formData.get("scheduled_at"));
  const { error } = await supabase.from("customer_message_drafts").update({
    title,
    body,
    scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    status: scheduledAt ? "scheduled" : "draft",
    updated_at: new Date().toISOString()
  }).eq("id", draftId).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`顧客メッセージを更新できませんでした: ${error.message}`);
  await logAuditEvent({ storeId: store.id, actionType: "customer_message_draft_updated", targetType: "customer_message", targetId: draftId, message: "顧客メッセージ下書きを更新しました。" });
}
