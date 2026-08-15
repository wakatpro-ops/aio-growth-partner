import "server-only";

import { randomUUID } from "node:crypto";
import { getCurrentUserAccess } from "@/lib/auth/server";
import { getStore } from "@/lib/stores";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BusinessOrderItem, InventoryMovement } from "@/types/phase2";

const editableRoles = new Set(["org_owner", "store_manager", "staff"]);
const demoStoreIds: Record<string, string> = {
  "store-general-demo": "00000000-0000-4000-8000-000000000101",
  "store-auto-demo": "00000000-0000-4000-8000-000000000102"
};
const manualMovementTypes = new Set(["receipt", "stocktake", "waste", "return_in", "transfer_in", "transfer_out", "adjustment"]);

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function text(value: FormDataEntryValue | null, maxLength = 500) {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maxLength) : null;
}

function number(value: FormDataEntryValue | null) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

async function context(storeId: string, write = false) {
  const [store, access] = await Promise.all([getStore(storeId), getCurrentUserAccess()]);
  if (!access) throw new Error("ログインが必要です。");
  const role = access.organizationRoles[store.organization_id] ?? "viewer";
  if (write && !access.isPlatformAdmin && !editableRoles.has(role)) throw new Error("在庫を変更する権限がありません。");
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase環境変数が未設定です。");
  return { store, access, supabase };
}

async function applyMovement(supabase: SupabaseClient, input: {
  storeId: string;
  itemId: string;
  movementType: string;
  quantityDelta: number;
  reservedDelta?: number;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
  movementKey?: string | null;
  actorUserId?: string | null;
}) {
  const { data, error } = await supabase.rpc("apply_inventory_movement", {
    p_store_id: input.storeId,
    p_item_id: input.itemId,
    p_movement_type: input.movementType,
    p_quantity_delta: input.quantityDelta,
    p_reserved_delta: input.reservedDelta ?? 0,
    p_reason: input.reason,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
    p_movement_key: input.movementKey ?? null,
    p_actor_user_id: input.actorUserId ?? null
  });
  if (error) throw new Error(`在庫変動を記録できませんでした: ${error.message}`);
  return String(data);
}

async function recordAudit(supabase: SupabaseClient, input: {
  organizationId: string;
  storeId: string;
  actorUserId: string;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    store_id: input.storeId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    message: input.message,
    metadata: input.metadata ?? {}
  });
  if (error) throw new Error(`操作履歴を記録できませんでした: ${error.message}`);
}

export async function listInventoryMovements(storeId: string, limit = 100): Promise<InventoryMovement[]> {
  const store = await getStore(storeId);
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];
  const databaseStoreId = demoStoreIds[store.id] ?? store.id;
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("*, item:items(name, sku, unit)")
    .eq("store_id", databaseStoreId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`在庫履歴を取得できませんでした: ${error.message}`);
  const actorIds = Array.from(new Set((data ?? []).map((movement) => movement.created_by).filter(Boolean))) as string[];
  const { data: profiles } = actorIds.length > 0
    ? await supabase.from("user_profiles").select("user_id, display_name").in("user_id", actorIds)
    : { data: [] };
  const actorNames = new Map((profiles ?? []).map((profile) => [String(profile.user_id), String(profile.display_name ?? "担当スタッフ")]));
  return (data ?? []).map((movement) => ({ ...movement, actor_name: movement.created_by ? actorNames.get(String(movement.created_by)) ?? "担当スタッフ" : "システム" })) as InventoryMovement[];
}

export async function createInventoryMovementFromForm(storeId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, true);
  const itemId = text(formData.get("item_id"), 36);
  const movementType = String(formData.get("movement_type") ?? "adjustment");
  const inputQuantity = number(formData.get("quantity"));
  const reason = text(formData.get("reason"), 1000);
  const reorderPoint = number(formData.get("reorder_point"));
  if (!itemId) throw new Error("対象の商品・メニューを選択してください。");
  if (!manualMovementTypes.has(movementType)) throw new Error("在庫変動の理由を選び直してください。");
  if (!reason) throw new Error("在庫を変更する理由を入力してください。");
  if (movementType !== "stocktake" && inputQuantity <= 0) throw new Error("数量は0より大きい値を入力してください。");
  if (movementType === "stocktake" && inputQuantity < 0) throw new Error("棚卸後の数量は0以上で入力してください。");

  const { data: item } = await supabase.from("items").select("id, name, is_stock_managed").eq("store_id", store.id).eq("id", itemId).is("archived_at", null).maybeSingle();
  if (!item?.id || !item.is_stock_managed) throw new Error("選択した対象は在庫管理されていません。");
  const { data: stock } = await supabase.from("inventory_stocks").select("quantity").eq("item_id", itemId).maybeSingle();
  let delta = inputQuantity;
  if (["waste", "transfer_out"].includes(movementType)) delta = -Math.abs(inputQuantity);
  if (movementType === "stocktake") delta = inputQuantity - Number(stock?.quantity ?? 0);
  if (movementType === "adjustment") delta = inputQuantity;

  const movementId = await applyMovement(supabase, {
    storeId: store.id,
    itemId,
    movementType,
    quantityDelta: delta,
    reason,
    referenceType: "manual",
    movementKey: `manual:${randomUUID()}`,
    actorUserId: access.userId
  });
  await supabase.from("inventory_stocks").update({ reorder_point: Math.max(0, reorderPoint), updated_at: new Date().toISOString() }).eq("item_id", itemId);
  await recordAudit(supabase, {
    organizationId: store.organization_id,
    storeId: store.id,
    actorUserId: access.userId,
    actionType: "inventory_movement_created",
    targetType: "inventory_movement",
    targetId: movementId,
    message: `${item.name}の在庫変動を記録しました。`,
    metadata: { movement_type: movementType, quantity_delta: delta }
  });
}

export async function listOrderItems(storeId: string, orderId: string): Promise<BusinessOrderItem[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("order_items")
    .select("*, item:items(name, sku, unit, is_stock_managed)")
    .eq("store_id", store.id)
    .eq("order_id", orderId)
    .is("archived_at", null)
    .order("sort_order");
  if (error) throw new Error(`受注明細を取得できませんでした: ${error.message}`);
  return (data ?? []) as BusinessOrderItem[];
}

export async function listArchivedOrderItems(storeId: string, orderId: string): Promise<BusinessOrderItem[]> {
  const { store, supabase } = await context(storeId);
  const { data, error } = await supabase
    .from("order_items")
    .select("*, item:items(name, sku, unit, is_stock_managed)")
    .eq("store_id", store.id)
    .eq("order_id", orderId)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });
  if (error) throw new Error(`削除済み受注明細を取得できませんでした: ${error.message}`);
  return (data ?? []) as BusinessOrderItem[];
}

async function updateOrderTotal(supabase: SupabaseClient, storeId: string, orderId: string) {
  const { data } = await supabase.from("order_items").select("amount").eq("store_id", storeId).eq("order_id", orderId).is("archived_at", null);
  const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  await supabase.from("orders").update({ total, updated_at: new Date().toISOString() }).eq("store_id", storeId).eq("id", orderId);
  return total;
}

export async function addOrderItemFromForm(storeId: string, orderId: string, formData: FormData) {
  const { store, access, supabase } = await context(storeId, true);
  const { data: order } = await supabase.from("orders").select("id, status").eq("store_id", store.id).eq("id", orderId).is("archived_at", null).maybeSingle();
  if (!order) throw new Error("受注が見つかりません。");
  if (["completed", "invoiced", "cancelled"].includes(order.status)) throw new Error("完了・請求化・取消済みの受注明細は変更できません。");
  const itemId = text(formData.get("item_id"), 36);
  const { data: item } = itemId
    ? await supabase.from("items").select("id, name, unit, unit_price").eq("store_id", store.id).eq("id", itemId).is("archived_at", null).maybeSingle()
    : { data: null };
  const description = text(formData.get("description"), 500) ?? item?.name ?? null;
  const quantity = number(formData.get("quantity"));
  const unitPrice = number(formData.get("unit_price")) || Number(item?.unit_price ?? 0);
  if (!description) throw new Error("明細名を入力してください。");
  if (quantity <= 0) throw new Error("数量は0より大きい値を入力してください。");
  const { data: last } = await supabase.from("order_items").select("sort_order").eq("order_id", orderId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data: created, error } = await supabase.from("order_items").insert({
    organization_id: store.organization_id,
    store_id: store.id,
    order_id: orderId,
    item_id: item?.id ?? null,
    description,
    quantity,
    unit: text(formData.get("unit"), 30) ?? item?.unit ?? "個",
    unit_price: unitPrice,
    amount: quantity * unitPrice,
    sort_order: Number(last?.sort_order ?? -1) + 1
  }).select("id").single();
  if (error || !created) throw new Error(`受注明細を追加できませんでした: ${error?.message ?? ""}`);
  await updateOrderTotal(supabase, store.id, orderId);
  await syncOrderInventory(store.id, orderId, order.status);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "order_item_created", targetType: "order_item", targetId: created.id, message: `${description}を受注明細へ追加しました。`, metadata: { quantity } });
  return { itemId: String(created.id), actorId: access.userId };
}

export async function archiveOrderItem(storeId: string, orderId: string, orderItemId: string) {
  const { store, access, supabase } = await context(storeId, true);
  const { data: order } = await supabase.from("orders").select("status").eq("store_id", store.id).eq("id", orderId).maybeSingle();
  const { data: line } = await supabase.from("order_items").select("id, item_id, quantity, description").eq("store_id", store.id).eq("order_id", orderId).eq("id", orderItemId).is("archived_at", null).maybeSingle();
  if (!order || !line) throw new Error("受注明細が見つかりません。");
  if (["completed", "invoiced"].includes(order.status)) throw new Error("在庫減算済みの明細は削除できません。取消処理を行ってください。");
  const { error } = await supabase.from("order_items").update({ archived_at: new Date().toISOString(), archived_by: access.userId }).eq("id", line.id).eq("store_id", store.id);
  if (error) throw new Error(`受注明細を削除できませんでした: ${error.message}`);
  if (line.item_id && ["ordered", "in_progress"].includes(order.status)) {
    await applyMovement(supabase, { storeId: store.id, itemId: line.item_id, movementType: "order_release", quantityDelta: 0, reservedDelta: -Number(line.quantity), reason: "受注明細を削除したため引当を解除", referenceType: "order", referenceId: orderId, movementKey: `order:${orderId}:${line.id}:removed`, actorUserId: access.userId });
  }
  await updateOrderTotal(supabase, store.id, orderId);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "order_item_archived", targetType: "order_item", targetId: line.id, message: `${line.description}を受注明細から削除しました。` });
}

export async function restoreOrderItem(storeId: string, orderId: string, orderItemId: string) {
  const { store, access, supabase } = await context(storeId, true);
  const { data: order } = await supabase.from("orders").select("status").eq("store_id", store.id).eq("id", orderId).maybeSingle();
  const { data: line } = await supabase.from("order_items").select("id, item_id, quantity, description, archived_at").eq("store_id", store.id).eq("order_id", orderId).eq("id", orderItemId).not("archived_at", "is", null).maybeSingle();
  if (!order || !line) throw new Error("削除済みの受注明細が見つかりません。");
  if (["completed", "invoiced", "cancelled"].includes(order.status)) throw new Error("完了・請求化・取消済みの受注には明細を戻せません。");
  const { error } = await supabase.from("order_items").update({ archived_at: null, archived_by: null, updated_at: new Date().toISOString() }).eq("id", line.id).eq("store_id", store.id);
  if (error) throw new Error(`受注明細を元に戻せませんでした: ${error.message}`);
  if (line.item_id && ["ordered", "in_progress"].includes(order.status)) {
    await applyMovement(supabase, {
      storeId: store.id,
      itemId: line.item_id,
      movementType: "order_reserve",
      quantityDelta: 0,
      reservedDelta: Number(line.quantity),
      reason: "削除した受注明細を元に戻したため在庫を再引当",
      referenceType: "order",
      referenceId: orderId,
      movementKey: `order:${orderId}:${line.id}:restore:${line.archived_at}`,
      actorUserId: access.userId
    });
  }
  await updateOrderTotal(supabase, store.id, orderId);
  await syncOrderInventory(store.id, orderId, order.status);
  await recordAudit(supabase, { organizationId: store.organization_id, storeId: store.id, actorUserId: access.userId, actionType: "order_item_restored", targetType: "order_item", targetId: line.id, message: `${line.description}を受注明細へ戻しました。` });
}

export async function syncOrderInventory(storeId: string, orderId: string, targetStatus?: string) {
  const { store, access, supabase } = await context(storeId, true);
  const { data: order } = await supabase.from("orders").select("id, status, order_number").eq("store_id", store.id).eq("id", orderId).maybeSingle();
  if (!order) throw new Error("受注が見つかりません。");
  const status = targetStatus ?? order.status;
  const lines = await listOrderItems(store.id, orderId);
  const stockLines = lines.filter((line) => line.item_id && line.item?.is_stock_managed);
  if (stockLines.length === 0) return;
  const { data: movements } = await supabase.from("inventory_movements").select("movement_key").eq("store_id", store.id).eq("reference_type", "order").eq("reference_id", orderId);
  const keys = new Set((movements ?? []).map((row) => String(row.movement_key)));

  for (const line of stockLines) {
    const itemId = String(line.item_id);
    const quantity = Number(line.quantity);
    const prefix = `order:${orderId}:${line.id}`;
    const reserveKey = `${prefix}:reserve`;
    const fulfillKey = `${prefix}:fulfill`;
    if (["ordered", "in_progress", "completed", "invoiced"].includes(status) && !keys.has(reserveKey)) {
      await applyMovement(supabase, { storeId: store.id, itemId, movementType: "order_reserve", quantityDelta: 0, reservedDelta: quantity, reason: `受注 ${order.order_number} の在庫を引当`, referenceType: "order", referenceId: orderId, movementKey: reserveKey, actorUserId: access.userId });
      keys.add(reserveKey);
    }
    if (["completed", "invoiced"].includes(status) && !keys.has(fulfillKey)) {
      await applyMovement(supabase, { storeId: store.id, itemId, movementType: "order_fulfill", quantityDelta: -quantity, reservedDelta: -quantity, reason: `受注 ${order.order_number} の完了により在庫を減算`, referenceType: "order", referenceId: orderId, movementKey: fulfillKey, actorUserId: access.userId });
      keys.add(fulfillKey);
    }
    if (status === "cancelled") {
      const cancelKey = `${prefix}:cancel`;
      if (!keys.has(cancelKey)) {
        await applyMovement(supabase, { storeId: store.id, itemId, movementType: keys.has(fulfillKey) ? "order_return" : "order_release", quantityDelta: keys.has(fulfillKey) ? quantity : 0, reservedDelta: keys.has(fulfillKey) ? 0 : -quantity, reason: `受注 ${order.order_number} の取消により在庫を復元`, referenceType: "order", referenceId: orderId, movementKey: cancelKey, actorUserId: access.userId });
        keys.add(cancelKey);
      }
    }
  }
}

export async function applyImportedSaleInventory(input: { storeId: string; itemId: string; transactionId: string; rowHash: string; quantity: number; itemName: string }) {
  const { store, access, supabase } = await context(input.storeId, true);
  return applyMovement(supabase, {
    storeId: store.id,
    itemId: input.itemId,
    movementType: "sale",
    quantityDelta: -Math.abs(input.quantity),
    reason: `${input.itemName}の売上取込により在庫を減算`,
    referenceType: "sales_transaction",
    referenceId: input.transactionId,
    movementKey: `sale:${input.rowHash}:${input.itemId}`,
    actorUserId: access.userId
  });
}
