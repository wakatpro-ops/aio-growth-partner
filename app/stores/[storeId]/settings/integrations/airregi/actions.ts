"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { transitionAirRegi } from "@/lib/airregi/service";

export async function transitionAirRegiAction(storeId: string, id: string, action: string, revision: number) {
  const path = `/stores/${storeId}/settings/integrations/airregi`;
  try { await transitionAirRegi(storeId, id, action, revision); }
  catch { redirect(`${path}?error=1`); }
  revalidatePath(path);
  redirect(`${path}?done=${encodeURIComponent(action)}`);
}
