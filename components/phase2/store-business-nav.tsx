import type { Store } from "@/types/domain";

export function StoreBusinessNav(_props: { store: Store }) {
  // The persistent sidebar is now the single source of primary navigation.
  // Keep this compatibility component while callers are removed gradually.
  void _props;
  return null;
}
