import Link from "next/link";
import styles from "@/components/ui/hub-tabs.module.css";

export function CustomerHubTabs({ storeId, active, customerLabel }: { storeId: string; active: "bookings" | "customers" | "analysis"; customerLabel: string }) {
  return <nav className={`${styles.tabs} workbench-tabs`} aria-label="予約・顧客・分析の切り替え">
    {([["bookings", "予約"], ["customers", customerLabel], ["analysis", "分析・フォロー"]] as const).map(([key, label]) => <Link key={key} href={`/stores/${storeId}/customers?tab=${key}`} aria-current={active === key ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
