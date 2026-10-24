"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmSquareConnection, runSquareSync, transitionSquareConnection } from "@/lib/square/service";
function path(storeId: string) { return `/stores/${storeId}/settings/integrations/square`; }
function finish(storeId: string, done: string): never {
  revalidatePath(path(storeId));
  revalidatePath(`/stores/${storeId}/sales-hub`);
  redirect(`${path(storeId)}?done=${encodeURIComponent(done)}`);
}
export async function confirmSquareAction(storeId: string, pendingId: string, formData: FormData) {
  try {
    if (formData.get("confirmed") !== "yes" || formData.get("no_overlap") !== "yes") throw new Error("confirmation_required");
    await confirmSquareConnection(storeId, pendingId, String(formData.get("location") ?? ""));
  } catch (error) { redirect(`${path(storeId)}?error=${error instanceof Error && error.message === "square_csv_overlap_review_required" ? "overlap" : "1"}`); }
  finish(storeId, "connected");
}
export async function transitionSquareAction(storeId: string, id: string, action: string, revision: number) {
  try { await transitionSquareConnection(storeId, id, action, revision); }
  catch { redirect(`${path(storeId)}?error=1`); }
  finish(storeId, action);
}
export async function syncSquareAction(storeId: string) {
  let done = "sync_wait";
  try {
    const result = await runSquareSync(storeId);
    if (result.failed) throw new Error("sync_failed");
    if (result.synced) done = "synced";
  } catch { redirect(`${path(storeId)}?error=1`); }
  finish(storeId, done);
}
