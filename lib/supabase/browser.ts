"use client";

import { createClient } from "@supabase/supabase-js";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient(requestSignal?: AbortSignal) {
  if (!hasSupabaseBrowserEnv()) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    requestSignal ? { auth: { autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([requestSignal, init.signal]) : requestSignal
    }) } } : undefined
  );
}
