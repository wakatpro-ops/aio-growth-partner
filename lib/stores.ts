import "server-only";
import { demoStores, getDemoStore } from "@/lib/industry/demo-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Store } from "@/types/domain";

export async function listStores(): Promise<Store[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return demoStores;
  }

  const { data, error } = await supabase.from("stores").select("*").order("created_at", { ascending: false });
  if (error || !data || data.length === 0) {
    return demoStores;
  }

  return data as Store[];
}

export async function getStore(storeId: string): Promise<Store> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return getDemoStore(storeId);
  }

  const { data, error } = await supabase.from("stores").select("*").eq("id", storeId).single();
  if (error || !data) {
    return getDemoStore(storeId);
  }

  return data as Store;
}
