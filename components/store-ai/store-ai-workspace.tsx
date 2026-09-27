"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { StoreAiAssistant } from "./store-ai-assistant";

/** Root-mounted: same-store navigation preserves the conversation in memory.
 * Leaving the workspace or switching stores clears it. No browser storage.
 * The API checks the signed-in user's store access on every request.
 */
export function StoreAiWorkspace() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const storeId = pathname.match(/^\/stores\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)?.[1];
  if (!storeId) return null;
  return <StoreAiAssistant key={storeId} storeId={storeId} pathname={pathname} search={search} />;
}
