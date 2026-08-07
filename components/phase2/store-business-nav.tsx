import Link from "next/link";
import type { Store } from "@/types/domain";

const storeAreas = [
  { path: "", label: "店舗トップ", description: "状況と今日やること" },
  { path: "/aio-improvement", label: "AIO改善", description: "おすすめされる準備" },
  { path: "/acquisition", label: "集客", description: "Google・SNS・投稿" },
  { path: "/sales-hub", label: "売上", description: "見積・請求・入金" },
  { path: "/settings", label: "設定", description: "店舗情報・外部連携" }
];

export function StoreBusinessNav({ store }: { store: Store }) {
  return (
    <nav className="store-area-nav" aria-label="店舗の主要メニュー">
      {storeAreas.map((area) => (
        <Link className="store-area-link" href={`/stores/${store.id}${area.path}`} key={area.path || "home"}>
          <strong>{area.label}</strong>
          <span>{area.description}</span>
        </Link>
      ))}
    </nav>
  );
}
