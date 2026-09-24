"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { menuContext } from "@/lib/menu-workbench";
import { parseStockLines } from "@/lib/menu-workbench-rules";
import { createReceiptFromForm } from "@/lib/phase6/expense-receipts";

function refresh(storeId: string) {
  revalidatePath(`/stores/${storeId}/inventory`);
  revalidatePath(`/stores/${storeId}/items`);
}
export async function setAvailabilityAction(storeId: string, itemId: string, form: FormData) {
  const { db,access } = await menuContext(storeId,"operate");
  const { error } = await db.rpc("set_menu_availability",{ p_actor:access.userId,p_store:storeId,p_item:itemId,p_value:String(form.get("availability")) });
  if (error) redirect(`/stores/${storeId}/inventory?error=${encodeURIComponent(error.message)}`);
  refresh(storeId);
  redirect(`/stores/${storeId}/inventory?tab=menu&saved=status`);
}
export async function uploadDeliveryAction(storeId: string,form: FormData) {
  await menuContext(storeId,"operate");
  const file=form.get("receipt_file");
  if(file instanceof File && file.size>4*1024*1024) redirect(`/stores/${storeId}/inventory?tab=stock&error=${encodeURIComponent("写真・PDFは4MB以下にしてください。")}`);
  let receiptId: string;
  try { receiptId=(await createReceiptFromForm(storeId,form)).receiptId; }
  catch(error) { redirect(`/stores/${storeId}/inventory?tab=stock&error=${encodeURIComponent(error instanceof Error ? error.message : "読み取れませんでした")}`); }
  const { db } = await menuContext(storeId,"operate");
  const { data,error } = await db.from("stock_documents").select("id").eq("store_id",storeId).eq("source_receipt_id",receiptId).maybeSingle();
  if (error) throw new Error("伝票の取り込み履歴を確認できませんでした。");
  redirect(data ? `/stores/${storeId}/inventory/documents/${data.id}` : `/stores/${storeId}/inventory/documents/new?source=${receiptId}`);
}
export async function saveStockDocumentAction(storeId: string,id: string,form: FormData) {
  const { db,access,permissions } = await menuContext(storeId,"operate");
  try {
    const lines = parseStockLines(form,permissions.manager);
    const { error } = await db.rpc("save_stock_document",{ p_actor:access.userId,p_store:storeId,p_id:id,p_kind:String(form.get("kind")),p_vendor:String(form.get("vendor")??""),p_date:String(form.get("document_date")),p_lines:lines,p_note:String(form.get("note")??""),p_revision:Number(form.get("revision")??0),p_source:String(form.get("source_receipt_id")??"")||null });
    if (error) throw new Error(error.message);
  } catch(error) { return { error:error instanceof Error ? error.message : "保存できませんでした" }; }
  refresh(storeId);
  redirect(`/stores/${storeId}/inventory/documents/${id}?saved=1`);
}
export async function transitionStockDocumentAction(storeId: string,id: string,action: string,revision: number) {
  const { db,access } = await menuContext(storeId,"operate");
  const { error } = await db.rpc("transition_stock_document",{ p_actor:access.userId,p_store:storeId,p_id:id,p_action:action,p_revision:revision });
  refresh(storeId);
  redirect(`/stores/${storeId}/inventory/documents/${id}?${error ? `error=${encodeURIComponent(error.message)}` : "saved=1"}`);
}
