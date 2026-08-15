import "server-only";

import { getCurrentUserAccess } from "@/lib/auth/server";
import { logAuditEvent } from "@/lib/phase6/compliance-data";
import { getStoreAiReadiness, type StoreAiReadiness } from "@/lib/store-ai/readiness";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AioGoal,
  AioImprovementAlert,
  AioImprovementTask,
  AioPublicationStatus,
  AioPublicationTarget,
  AioReadinessSnapshot,
  AioTaskStatus
} from "@/types/aio-improvement";

const editableRoles = new Set(["org_owner", "store_manager", "staff"]);
const taskStatuses = new Set<AioTaskStatus>(["not_started", "in_progress", "completed", "on_hold"]);
const publicationTargets = new Set<AioPublicationTarget>(["none", "website", "google", "instagram", "facebook", "other"]);
const publicationStatuses = new Set<AioPublicationStatus>(["not_published", "pending_review", "verified"]);

function text(value: FormDataEntryValue | null, maxLength = 500) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maxLength) : null;
}

function validDate(value: string | null) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validPublicationUrl(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000).toISOString();
}

async function context(storeId: string, write = false) {
  const store = await getStore(storeId);
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("ログインが必要です。");
  if (write && !access.isPlatformAdmin && !editableRoles.has(access.organizationRoles[store.organization_id] ?? "viewer")) {
    throw new Error("AIO改善を変更する権限がありません。");
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

export async function getAioGoal(storeId: string): Promise<AioGoal | null> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase.from("aio_goals").select("*").eq("store_id", store.id).maybeSingle();
  if (error) throw new Error(`目標質問を取得できませんでした: ${error.message}`);
  return data as AioGoal | null;
}

export async function getAioTargetQuestions(storeId: string, fallback: string[]) {
  const goal = await getAioGoal(storeId);
  return goal?.target_questions?.length ? goal.target_questions : fallback;
}

export async function saveAioGoalFromForm(storeId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, true);
  const questions = [1, 2, 3]
    .map((index) => text(formData.get(`target_question_${index}`), 160))
    .filter((value): value is string => Boolean(value));
  const uniqueQuestions = [...new Set(questions)];
  if (uniqueQuestions.length === 0) throw new Error("目指す質問を1件以上入力してください。");
  const now = new Date().toISOString();
  const { error } = await supabase.from("aio_goals").upsert({
    organization_id: store.organization_id,
    store_id: store.id,
    target_questions: uniqueQuestions,
    updated_by: access.userId,
    updated_at: now
  }, { onConflict: "store_id" });
  if (error) throw new Error(`目標質問を保存できませんでした: ${error.message}`);
  await logAuditEvent({
    storeId: store.id,
    actionType: "aio_goal_updated",
    targetType: "aio_goal",
    message: `AIに見つけてもらいたい目標質問を${uniqueQuestions.length}件保存しました。`,
    metadata: { question_count: uniqueQuestions.length }
  });
}

export async function listAioImprovementTasks(storeId: string): Promise<AioImprovementTask[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("aio_improvement_tasks")
    .select("*")
    .eq("store_id", store.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`AIO改善項目を取得できませんでした: ${error.message}`);
  return (data ?? []) as AioImprovementTask[];
}

export async function getAioImprovementTask(storeId: string, taskId: string): Promise<AioImprovementTask | null> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("aio_improvement_tasks")
    .select("*")
    .eq("store_id", store.id)
    .eq("id", taskId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`AIO改善項目を取得できませんでした: ${error.message}`);
  return data as AioImprovementTask | null;
}

export async function listAioReadinessSnapshots(storeId: string, limit = 24): Promise<AioReadinessSnapshot[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("aio_readiness_snapshots")
    .select("*")
    .eq("store_id", store.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`AIO再診断履歴を取得できませんでした: ${error.message}`);
  return (data ?? []) as AioReadinessSnapshot[];
}

async function insertReadinessSnapshot({
  storeId,
  readiness,
  triggerType,
  questions
}: {
  storeId: string;
  readiness: StoreAiReadiness;
  triggerType: AioReadinessSnapshot["trigger_type"];
  questions: string[];
}) {
  const { store, access, supabase } = await context(storeId, true);
  const nextAction = readiness.nextBestActions[0];
  const { data, error } = await supabase.from("aio_readiness_snapshots").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    score: readiness.score,
    trigger_type: triggerType,
    readiness_items: readiness.items.map((item) => ({ key: item.key, label: item.label, complete: item.complete, value: item.value })),
    publication_status: readiness.publicationStatus,
    target_questions: questions,
    next_action_key: nextAction?.key ?? null,
    next_action_label: nextAction?.label ?? null,
    created_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`AIO再診断を記録できませんでした: ${error?.message ?? ""}`);
  return String(data.id);
}

export async function startAioImprovementTask(storeId: string, sourceKey: string) {
  const { store, access, supabase } = await context(storeId, true);
  const readiness = await getStoreAiReadiness(store);
  const source = readiness.items.find((item) => item.key === sourceKey);
  if (!source) throw new Error("選択した改善項目が見つかりません。");
  const { data: existing } = await supabase
    .from("aio_improvement_tasks")
    .select("id")
    .eq("store_id", store.id)
    .eq("source_key", source.key)
    .in("status", ["not_started", "in_progress", "on_hold"])
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return String(existing.id);
  const dueDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("aio_improvement_tasks").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    source_key: source.key,
    title: source.label,
    description: source.benefit,
    status: "in_progress",
    due_date: dueDate,
    source_href: source.href,
    before_score: readiness.score,
    before_value: source.value,
    created_by: access.userId,
    updated_by: access.userId
  }).select("id").single();
  if (error || !data) throw new Error(`改善項目を開始できませんでした: ${error?.message ?? ""}`);
  await logAuditEvent({
    storeId: store.id,
    actionType: "aio_improvement_started",
    targetType: "aio_improvement_task",
    targetId: String(data.id),
    message: `${source.label}のAIO改善を開始しました。`,
    metadata: { source_key: source.key, before_score: readiness.score }
  });
  return String(data.id);
}

export async function updateAioImprovementTaskFromForm(storeId: string, taskId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, true);
  const task = await getAioImprovementTask(store.id, taskId);
  if (!task) throw new Error("AIO改善項目が見つかりません。");
  const status = String(formData.get("status") ?? task.status) as AioTaskStatus;
  const publicationTarget = String(formData.get("publication_target") ?? task.publication_target) as AioPublicationTarget;
  const publicationStatus = String(formData.get("publication_status") ?? task.publication_status) as AioPublicationStatus;
  if (!taskStatuses.has(status)) throw new Error("進捗状態を選び直してください。");
  if (!publicationTargets.has(publicationTarget)) throw new Error("公開先を選び直してください。");
  if (!publicationStatuses.has(publicationStatus)) throw new Error("公開確認の状態を選び直してください。");
  const dueDate = text(formData.get("due_date"), 10);
  const publicationUrl = text(formData.get("publication_url"), 1000);
  const changeSummary = text(formData.get("change_summary"), 2000);
  const holdReason = text(formData.get("hold_reason"), 1000);
  if (!validDate(dueDate)) throw new Error("期限の日付を確認してください。");
  if (!validPublicationUrl(publicationUrl)) throw new Error("公開先URLはhttpまたはhttpsで入力してください。");
  if (status === "completed" && !changeSummary) throw new Error("完了した変更内容を入力してください。");
  if (status === "on_hold" && !holdReason) throw new Error("保留理由を入力してください。");
  if (publicationStatus === "verified" && publicationTarget === "none") throw new Error("公開確認済みにする場合は公開先を選択してください。");
  if (publicationStatus === "verified" && !publicationUrl) throw new Error("公開確認済みにする場合は確認したURLを入力してください。");

  const readiness = await getStoreAiReadiness(store);
  const source = readiness.items.find((item) => item.key === task.source_key);
  const now = new Date();
  const completedAt = status === "completed" ? task.completed_at ?? now.toISOString() : null;
  const publishedAt = publicationStatus === "not_published" ? null : task.published_at ?? now.toISOString();
  const verifiedAt = publicationStatus === "verified" ? task.verified_at ?? now.toISOString() : null;
  const nextReviewAt = publicationStatus === "verified" ? addDays(now, 90) : null;
  const payload = {
    status,
    assignee_name: text(formData.get("assignee_name"), 120),
    due_date: dueDate,
    change_summary: changeSummary,
    hold_reason: status === "on_hold" ? holdReason : null,
    publication_target: publicationTarget,
    publication_status: publicationStatus,
    publication_url: publicationUrl,
    published_at: publishedAt,
    verified_at: verifiedAt,
    next_review_at: nextReviewAt,
    completed_at: completedAt,
    after_score: status === "completed" ? readiness.score : task.after_score,
    after_value: status === "completed" ? source?.value ?? task.after_value : task.after_value,
    updated_by: access.userId,
    updated_at: now.toISOString()
  };
  const { error } = await supabase.from("aio_improvement_tasks").update(payload).eq("id", task.id).eq("store_id", store.id).is("archived_at", null);
  if (error) throw new Error(`AIO改善項目を保存できませんでした: ${error.message}`);
  if (status === "completed" && task.status !== "completed") {
    const goal = await getAioGoal(store.id);
    await insertReadinessSnapshot({ storeId: store.id, readiness, triggerType: "task_completed", questions: goal?.target_questions ?? readiness.targetQuestions });
  }
  await logAuditEvent({
    storeId: store.id,
    actionType: "aio_improvement_updated",
    targetType: "aio_improvement_task",
    targetId: task.id,
    message: `${task.title}の進捗と公開確認を更新しました。`,
    metadata: { status, publication_target: publicationTarget, publication_status: publicationStatus, after_score: payload.after_score }
  });
}

export async function runAioRediagnosis(storeId: string) {
  const { store } = await context(storeId, true);
  const readiness = await getStoreAiReadiness(store);
  const goal = await getAioGoal(store.id);
  const latest = (await listAioReadinessSnapshots(store.id, 1))[0];
  const monthly = !latest || Date.now() - new Date(latest.created_at).getTime() >= 30 * 86400000;
  const snapshotId = await insertReadinessSnapshot({
    storeId: store.id,
    readiness,
    triggerType: monthly ? "monthly" : "manual",
    questions: goal?.target_questions ?? readiness.targetQuestions
  });
  await logAuditEvent({
    storeId: store.id,
    actionType: "aio_readiness_rediagnosed",
    targetType: "aio_readiness_snapshot",
    targetId: snapshotId,
    message: `AIOおすすめ準備度を再診断し、${readiness.score}%として記録しました。`,
    metadata: { score: readiness.score, trigger_type: monthly ? "monthly" : "manual", next_action_key: readiness.nextBestActions[0]?.key ?? null }
  });
  return snapshotId;
}

function alertsFor(storeId: string, tasks: AioImprovementTask[], snapshots: AioReadinessSnapshot[], storeUpdatedAt?: string | null): AioImprovementAlert[] {
  const now = Date.now();
  const alerts: AioImprovementAlert[] = [];
  const latest = snapshots[0];
  if (!latest || now - new Date(latest.created_at).getTime() >= 30 * 86400000) {
    alerts.push({ key: "monthly-review", tone: "warning", title: "今月の再診断が必要です", message: "現在の店舗情報と公開状況から、次に行う改善を1件に絞り直します。", href: `/stores/${storeId}/aio-improvement#rediagnosis` });
  }
  for (const task of tasks) {
    if (task.due_date && task.status !== "completed" && new Date(`${task.due_date}T23:59:59`).getTime() < now) {
      alerts.push({ key: `overdue-${task.id}`, tone: "danger", title: `${task.title}の期限を過ぎています`, message: "担当者・期限・保留理由を確認してください。", href: `/stores/${storeId}/aio-improvement/tasks/${task.id}` });
    }
    if (task.status === "completed" && task.publication_status !== "verified") {
      alerts.push({ key: `unpublished-${task.id}`, tone: "warning", title: `${task.title}は公開確認が未完了です`, message: "準備度の完了と、Web・Google・SNSへの公開確認は別です。", href: `/stores/${storeId}/aio-improvement/tasks/${task.id}` });
    }
    if (task.next_review_at && new Date(task.next_review_at).getTime() <= now) {
      alerts.push({ key: `stale-${task.id}`, tone: "info", title: `${task.title}の公開情報を再確認してください`, message: "前回の公開確認から90日が経過しました。内容の古さや不一致を確認します。", href: `/stores/${storeId}/aio-improvement/tasks/${task.id}` });
    }
  }
  if (storeUpdatedAt && now - new Date(storeUpdatedAt).getTime() >= 180 * 86400000) {
    alerts.push({ key: "profile-stale", tone: "info", title: "店舗プロフィールを半年以上確認していません", message: "営業時間、提供内容、対象のお客様に変更がないか確認してください。", href: `/stores/${storeId}/settings/profile` });
  }
  return alerts.slice(0, 8);
}

export async function getAioImprovementWorkspace(storeId: string) {
  const { store } = await context(storeId);
  const readiness = await getStoreAiReadiness(store);
  const [goal, tasks, snapshots] = await Promise.all([
    getAioGoal(store.id),
    listAioImprovementTasks(store.id),
    listAioReadinessSnapshots(store.id)
  ]);
  const questions = goal?.target_questions?.length ? goal.target_questions : readiness.targetQuestions;
  const activeTask = tasks.find((task) => task.status === "in_progress")
    ?? tasks.find((task) => task.status === "not_started")
    ?? tasks.find((task) => task.status === "on_hold")
    ?? null;
  const storeUpdatedAt = (store as unknown as { updated_at?: string | null }).updated_at;
  return {
    store,
    readiness: { ...readiness, targetQuestions: questions },
    goal,
    tasks,
    snapshots,
    activeTask,
    alerts: alertsFor(store.id, tasks, snapshots, storeUpdatedAt),
    monthlyReviewDue: !snapshots[0] || Date.now() - new Date(snapshots[0].created_at).getTime() >= 30 * 86400000
  };
}
