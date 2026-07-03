"use client";

import { createClient } from "@supabase/supabase-js";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  if (!hasSupabaseBrowserEnv()) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
