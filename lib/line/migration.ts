import "server-only";

import { randomUUID } from "node:crypto";
import { canEditStore, getCurrentUserAccess } from "@/lib/auth/server";
import { parseJapanDateTimeLocal } from "@/lib/bookings/rules";
import { parseImportFile } from "@/lib/phase4/import-parser";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { analyzeLineMigrationRows } from "@/lib/line/migration-import";
import type {
  LineBookingMigration,
  LineMigrationImportRow,
  LineMigrationAdminAccess,
  LineMigrationDataStatus,
  LineMigrationExportMethod
} from "@/types/line-migration";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const exportMethods = new Set<LineMigrationExportMethod>(["api", "csv", "manual", "none", "unknown"]);
const adminAccessStatuses = new Set<LineMigrationAdminAccess>(["confirmed", "needs_owner", "unknown"]);
const dataStatuses = new Set<LineMigrationDataStatus>(["not_started", "export_ready", "manual_ready", "no_data"]);

function text(formData: FormData, key: string, maxLength = 1000) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function choice<T extends string>(formData: FormData, key: string, allowed: Set<T>, fallback: T) {
  const value = text(formData, key, 40) as T;
  return allowed.has(value) ? value : fallback;
}

function bookingCount(formData: FormData) {
  const raw = text(formData, "open_booking_count", 12);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) throw new Error("未消化予約数は0以上の整数で入力してください。");
  return value;
}

async function context(storeId: string) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access || !(await canEditStore(store.id, store.organization_id))) throw new Error("LINE予約の移行計画を変更する権限がありません。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

async function audit(supabase: SupabaseAdmin, input: {
  organizationId: string;
  storeId: string;
  actorUserId: string;
  actionType: string;
  migrationId: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    store_id: input.storeId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    target_type: "line_booking_migration",
    target_id: input.migrationId,
    message: input.message,
    metadata: input.metadata ?? {}
  });
  if (error) throw new Error(`操作履歴を記録できませんでした: ${error.message}`);
}

async function activeMigration(storeId: string) {
  const { store, access, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("line_booking_migrations")
    .select("*")
    .eq("store_id", store.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error?.code === "42P01") return { store, access, supabase, migration: null };
  if (error) throw new Error(`LINE予約の移行計画を取得できませんでした: ${error.message}`);
  return { store, access, supabase, migration: data as LineBookingMigration | null };
}

export async function listLineBookingMigrations(storeId: string) {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("line_booking_migrations")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false });
  if (error?.code === "42P01") return [];
  if (error) throw new Error(`LINE予約の移行計画を取得できませんでした: ${error.message}`);
  return (data ?? []) as LineBookingMigration[];
}

export async function listLineBookingMigrationImportRows(storeId: string, migrationId: string, limit = 40) {
  const { store, supabase } = await context(storeId);
  const { data: migration, error: migrationError } = await supabase.from("line_booking_migrations")
    .select("id, import_batch_id")
    .eq("id", migrationId)
    .eq("store_id", store.id)
    .is("archived_at", null)
    .maybeSingle();
  if (migrationError) {
    if (migrationError.code === "42P01") return [];
    throw new Error(`予約データの確認状況を取得できませんでした: ${migrationError.message}`);
  }
  if (!migration?.import_batch_id) return [];
  const { data, error } = await supabase.from("line_booking_migration_import_rows")
    .select("*")
    .eq("migration_id", migration.id)
    .eq("import_batch_id", migration.import_batch_id)
    .order("row_number")
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error?.code === "42P01") return [];
  if (error) throw new Error(`予約データのプレビューを取得できませんでした: ${error.message}`);
  return (data ?? []) as LineMigrationImportRow[];
}

function assessmentInput(formData: FormData) {
  const provider = text(formData, "current_provider_name", 200);
  if (!provider) throw new Error("現在利用している予約サービス名を入力してください。");
  return {
    current_provider_name: provider,
    official_account_name: text(formData, "official_account_name", 200) || null,
    official_account_basic_id: text(formData, "official_account_basic_id", 100) || null,
    admin_access_status: choice(formData, "admin_access_status", adminAccessStatuses, "unknown"),
    export_method: choice(formData, "export_method", exportMethods, "unknown"),
    open_booking_count: bookingCount(formData),
    notes: text(formData, "notes", 3000) || null
  };
}

export async function createLineBookingMigration(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (migration) throw new Error("進行中の移行計画があります。先に現在の計画を完了または削除してください。");
  const input = assessmentInput(formData);
  const { data, error } = await supabase.from("line_booking_migrations").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    ...input,
    stage: "data_preparation",
    created_by: access.userId,
    updated_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`移行計画を作成できませんでした: ${error?.message ?? "不明なエラー"}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_created",
    migrationId: String(data.id),
    message: `${input.current_provider_name}からのLINE予約移行計画を作成しました。`,
    metadata: { export_method: input.export_method, admin_access_status: input.admin_access_status }
  });
}

export async function updateLineBookingMigrationAssessment(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!migration) throw new Error("更新する移行計画がありません。");
  if (["completed", "rolled_back"].includes(migration.stage)) throw new Error("完了済みの計画は変更できません。");
  const input = assessmentInput(formData);
  const { error } = await supabase.from("line_booking_migrations").update({
    ...input,
    updated_by: access.userId,
    updated_at: new Date().toISOString()
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`移行前診断を保存できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_assessment_updated",
    migrationId: migration.id,
    message: "LINE予約の移行前診断を更新しました。",
    metadata: { export_method: input.export_method, admin_access_status: input.admin_access_status }
  });
}

export async function previewLineMigrationImport(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!migration) throw new Error("先に移行計画を作成してください。");
  if (["completed", "rolled_back"].includes(migration.stage)) throw new Error("完了済みの計画へファイルを追加できません。");
  const file = formData.get("reservation_file");
  if (!(file instanceof File) || !file.name || file.size === 0) throw new Error("予約データのCSVまたはExcelファイルを選択してください。");
  if (!/\.(csv|tsv|xlsx|xls|xlsm)$/iu.test(file.name)) throw new Error("予約データはCSV、TSV、Excel（XLSX・XLS・XLSM）で選択してください。");
  const parsed = await parseImportFile(file.name, await file.arrayBuffer());
  const analysis = analyzeLineMigrationRows(parsed.rows);
  const batchId = randomUUID();
  await supabase.from("line_booking_migration_import_rows").delete()
    .eq("migration_id", migration.id)
    .is("imported_booking_id", null);
  const records = analysis.rows.map((row) => ({
    migration_id: migration.id,
    organization_id: store.organization_id,
    store_id: store.id,
    import_batch_id: batchId,
    row_number: row.rowNumber,
    row_status: row.status,
    normalized_data: row.data,
    error_message: row.error
  }));
  for (let index = 0; index < records.length; index += 250) {
    const { error } = await supabase.from("line_booking_migration_import_rows").insert(records.slice(index, index + 250));
    if (error) throw new Error(`予約データのプレビューを保存できませんでした: ${error.message}`);
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_booking_migrations").update({
    import_file_name: file.name.slice(0, 240),
    import_batch_id: batchId,
    import_row_count: analysis.rows.length,
    import_valid_row_count: analysis.validRows,
    imported_booking_count: 0,
    export_method: "csv",
    data_preparation_status: "not_started",
    data_prepared_at: null,
    stage: "data_preparation",
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`予約データの解析結果を保存できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_import_previewed",
    migrationId: migration.id,
    message: `${file.name}を解析し、将来の予約${analysis.validRows}件を取り込み候補にしました。`,
    metadata: { row_count: analysis.rows.length, valid_row_count: analysis.validRows, recognized_columns: analysis.recognizedColumns }
  });
}

export async function importLineMigrationBookings(storeId: string) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!migration?.import_batch_id) throw new Error("先に予約ファイルを解析してください。");
  if (["completed", "rolled_back"].includes(migration.stage)) throw new Error("完了済みの計画へ予約を追加できません。");
  const { data: rows, error: rowsError } = await supabase.from("line_booking_migration_import_rows")
    .select("*")
    .eq("migration_id", migration.id)
    .eq("import_batch_id", migration.import_batch_id)
    .eq("row_status", "preview")
    .is("imported_booking_id", null)
    .order("row_number")
    .limit(100);
  if (rowsError) throw new Error(`取り込む予約を取得できませんでした: ${rowsError.message}`);
  if (!rows?.length) throw new Error("取り込み待ちの予約はありません。");
  const { data: services } = await supabase.from("booking_services").select("id,name")
    .eq("store_id", store.id).eq("is_bookable", true).is("archived_at", null);
  const serviceIds = new Map((services ?? []).map((service) => [String(service.name).trim(), String(service.id)]));
  let imported = 0;
  let expired = 0;
  for (const row of rows as LineMigrationImportRow[]) {
    const payload = row.normalized_data;
    if (new Date(payload.startsAt) <= new Date()) {
      await supabase.from("line_booking_migration_import_rows").update({ row_status: "invalid", error_message: "取込時点で過去になった予約です", updated_at: new Date().toISOString() }).eq("id", row.id);
      expired += 1;
      continue;
    }
    const notes = [payload.staffName ? `移行元担当: ${payload.staffName}` : "", payload.notes].filter(Boolean).join("\n");
    const { data: bookingId, error } = await supabase.rpc("create_store_booking", {
      p_organization_id: store.organization_id,
      p_store_id: store.id,
      p_customer_id: null,
      p_service_id: serviceIds.get(payload.serviceName) ?? null,
      p_status: "pending",
      p_source: "external",
      p_starts_at: payload.startsAt,
      p_ends_at: payload.endsAt,
      p_customer_name: payload.customerName,
      p_customer_phone: payload.customerPhone,
      p_customer_email: payload.customerEmail,
      p_service_name: payload.serviceName,
      p_notes: notes,
      p_resource_ids: [],
      p_actor_user_id: access.userId
    });
    if (error || !bookingId) throw new Error(`${row.row_number}行目を取り込めませんでした: ${error?.message ?? "不明なエラー"}`);
    const { error: updateError } = await supabase.from("line_booking_migration_import_rows").update({
      row_status: "imported",
      imported_booking_id: bookingId,
      updated_at: new Date().toISOString()
    }).eq("id", row.id).eq("store_id", store.id);
    if (updateError) throw new Error(`取り込み結果を記録できませんでした: ${updateError.message}`);
    imported += 1;
  }
  const { count: remaining } = await supabase.from("line_booking_migration_import_rows").select("id", { count: "exact", head: true })
    .eq("migration_id", migration.id).eq("import_batch_id", migration.import_batch_id).eq("row_status", "preview").is("imported_booking_id", null);
  const { count: importedTotal } = await supabase.from("line_booking_migration_import_rows").select("id", { count: "exact", head: true })
    .eq("migration_id", migration.id).eq("import_batch_id", migration.import_batch_id).eq("row_status", "imported");
  const finished = (remaining ?? 0) === 0;
  const now = new Date().toISOString();
  const { error: migrationError } = await supabase.from("line_booking_migrations").update({
    imported_booking_count: importedTotal ?? imported,
    data_preparation_status: finished ? "export_ready" : "not_started",
    data_prepared_at: finished ? now : null,
    stage: finished ? "test" : "data_preparation",
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (migrationError) throw new Error(`移行の進行状況を更新できませんでした: ${migrationError.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_bookings_imported",
    migrationId: migration.id,
    message: `将来の予約${imported}件を店舗確認待ちで取り込みました。`,
    metadata: { imported_count: imported, expired_count: expired, remaining_count: remaining ?? 0 }
  });
}

export async function markLineMigrationDataPrepared(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!migration) throw new Error("進行中の移行計画がありません。");
  if (["completed", "rolled_back"].includes(migration.stage)) throw new Error("完了済みの計画は変更できません。");
  const dataStatus = choice(formData, "data_preparation_status", dataStatuses, "not_started");
  if (dataStatus === "not_started") throw new Error("予約データをどの方法で準備したか選んでください。");
  if (formData.get("data_scope_confirmed") !== "on") throw new Error("未消化予約と顧客・メニューの対象範囲を確認してください。");
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_booking_migrations").update({
    data_preparation_status: dataStatus,
    data_prepared_at: now,
    stage: "test",
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`データ準備状況を保存できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_data_prepared",
    migrationId: migration.id,
    message: "移行する予約データの準備方法と対象範囲を確認しました。",
    metadata: { data_preparation_status: dataStatus }
  });
}

export async function confirmLineMigrationTest(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!migration?.data_prepared_at) throw new Error("先に予約データの準備方法を確認してください。");
  if (["completed", "rolled_back"].includes(migration.stage)) throw new Error("完了済みの計画は変更できません。");
  if (formData.get("test_booking_confirmed") !== "on" || formData.get("old_service_untouched") !== "on") {
    throw new Error("テスト予約と、旧サービスをまだ停止していないことを確認してください。");
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_booking_migrations").update({
    test_confirmed_at: now,
    stage: "cutover",
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`テスト結果を保存できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_test_confirmed",
    migrationId: migration.id,
    message: "AIO boost側のテスト予約と旧サービス継続を確認しました。"
  });
}

export async function requestLineMigrationCutover(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!migration?.test_confirmed_at) throw new Error("先にテスト予約を確認してください。");
  if (["completed", "rolled_back"].includes(migration.stage)) throw new Error("完了済みの計画は変更できません。");
  const rawCutoverAt = text(formData, "target_cutover_at", 32);
  if (!rawCutoverAt) throw new Error("切替希望日時を入力してください。");
  const targetCutoverAt = parseJapanDateTimeLocal(rawCutoverAt);
  if (new Date(targetCutoverAt).getTime() <= Date.now()) throw new Error("切替希望日時は現在より後にしてください。");
  const rollbackPlan = text(formData, "rollback_plan", 3000);
  if (!rollbackPlan) throw new Error("問題が起きた場合の戻し方を入力してください。");
  if (formData.get("owner_authorized") !== "on") throw new Error("店舗責任者の切替承認を確認してください。");
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_booking_migrations").update({
    target_cutover_at: targetCutoverAt,
    rollback_plan: rollbackPlan,
    cutover_requested_at: now,
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`切替依頼を保存できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_cutover_requested",
    migrationId: migration.id,
    message: "店舗責任者の承認を確認し、LINE予約の切替確認を運営会社へ依頼しました。",
    metadata: { target_cutover_at: targetCutoverAt }
  });
}

export async function completeLineBookingMigration(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!access.isPlatformAdmin) throw new Error("移行完了にできるのは、実接続を確認した運営管理者だけです。");
  if (!migration?.cutover_requested_at) throw new Error("店舗からの切替依頼がありません。");
  if (migration.stage !== "cutover") throw new Error("切替確認中の移行だけ完了にできます。");
  for (const key of ["webhook_verified", "aio_booking_verified", "owner_informed"]) {
    if (formData.get(key) !== "on") throw new Error("Webhook、AIO boost予約、店舗責任者への連絡をすべて確認してください。");
  }
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_booking_migrations").update({
    stage: "completed",
    completed_at: now,
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`移行を完了にできませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_completed",
    migrationId: migration.id,
    message: "Webhookとテスト予約を確認し、LINE予約の移行を完了しました。"
  });
}

export async function rollBackLineBookingMigration(storeId: string, formData: FormData) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!access.isPlatformAdmin) throw new Error("切替を元に戻せるのは運営管理者だけです。");
  if (migration?.stage !== "completed") throw new Error("完了した移行だけ元の受付方法へ戻せます。");
  if (formData.get("rollback_confirmed") !== "on") throw new Error("旧受付の復旧と新規受付の停止を確認してください。");
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_booking_migrations").update({
    stage: "rolled_back",
    rolled_back_at: now,
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`切替を元に戻した記録を保存できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_rolled_back",
    migrationId: migration.id,
    message: "旧受付の復旧を確認し、LINE予約の切替を元に戻しました。"
  });
}

export async function archiveLineBookingMigration(storeId: string) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (!migration) throw new Error("削除する移行計画がありません。");
  const now = new Date().toISOString();
  const { error } = await supabase.from("line_booking_migrations").update({
    archived_at: now,
    archived_by: access.userId,
    updated_by: access.userId,
    updated_at: now
  }).eq("id", migration.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`移行計画を削除できませんでした: ${error.message}`);
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_archived",
    migrationId: migration.id,
    message: "LINE予約の移行計画を削除済みに移しました。移行記録は保持されています。"
  });
}

export async function restoreLineBookingMigration(storeId: string, migrationId: string) {
  const { store, access, supabase, migration } = await activeMigration(storeId);
  if (migration) throw new Error("進行中の計画があるため、削除済みの計画を元に戻せません。");
  const { data, error } = await supabase.from("line_booking_migrations").update({
    archived_at: null,
    archived_by: null,
    updated_by: access.userId,
    updated_at: new Date().toISOString()
  }).eq("id", migrationId).eq("store_id", store.id).not("archived_at", "is", null).select("id").maybeSingle();
  if (error || !data) throw new Error("元に戻す移行計画を確認できませんでした。");
  await audit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "line_booking_migration_restored",
    migrationId,
    message: "削除済みのLINE予約移行計画を元に戻しました。"
  });
}
