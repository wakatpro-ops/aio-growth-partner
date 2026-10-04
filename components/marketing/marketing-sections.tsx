import Link from "next/link";
import { isFeatureEnabled, resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import type { Store } from "@/types/domain";
import styles from "./marketing-sections.module.css";

/** Shared hub navigation; never replaces store authorization in the pages/actions. */
export function MarketingSections({ store, active }: { store: Store; active: "promotion" | "aio" }) {
  const showPromotion = isFeatureEnabled(resolveFeatureFlags(store), "marketing_drafts");
  return (
    <nav className={styles.sections} aria-label="集客・販促の切り替え">
      {showPromotion ? <Link href={`/stores/${store.id}/marketing`} aria-current={active === "promotion" ? "page" : undefined}>
        投稿・販促
      </Link> : null}
      <Link href={`/stores/${store.id}/marketing/aio-improvement`} aria-current={active === "aio" ? "page" : undefined}>
        検索・AI対策<span>（AIO改善）</span>
      </Link>
    </nav>
  );
}
