import type { ModuleKey } from "@/types/domain";

export const modules: Array<{
  key: ModuleKey;
  name: string;
  description: string;
  category: "core" | "ai" | "industry" | "admin" | "integration";
  isCore: boolean;
}> = [
  { key: "store_profile", name: "店舗プロフィール", description: "店舗情報と業態別プロフィールを管理します。", category: "core", isCore: true },
  { key: "multi_store", name: "複数店舗管理", description: "組織配下で複数店舗を管理します。", category: "core", isCore: true },
  { key: "ai_post_generation", name: "AI投稿文生成", description: "業態別プロンプトで投稿文を生成します。", category: "ai", isCore: false },
  { key: "ai_review_reply", name: "AIクチコミ返信", description: "クチコミ本文から返信文を生成します。", category: "ai", isCore: false },
  { key: "aio_diagnosis", name: "AIO診断", description: "AI検索時代に向けた店舗情報の診断を行います。", category: "ai", isCore: false },
  { key: "instagram_post", name: "Instagram投稿", description: "業態によって非表示にできる投稿機能です。", category: "industry", isCore: false },
  { key: "repair_services", name: "修理サービス管理", description: "自動車修理向けのサービス可視化です。", category: "industry", isCore: false },
  { key: "product_management", name: "商品・部品・サービス管理", description: "販売品、部品、提供サービスを業態別の文言で管理します。", category: "industry", isCore: false },
  { key: "inventory_management", name: "在庫管理", description: "商品や部品の在庫数、入出庫、発注目安を管理します。", category: "industry", isCore: false },
  { key: "customer_management", name: "顧客管理", description: "店舗ごとの顧客情報と業態別補足情報を管理します。", category: "core", isCore: false },
  { key: "estimate_management", name: "見積書管理", description: "顧客向け見積書を作成・管理します。", category: "core", isCore: false },
  { key: "invoice_management", name: "請求書管理", description: "顧客向け請求書を作成・管理します。", category: "core", isCore: false },
  { key: "pdf_export", name: "PDF出力", description: "見積書、請求書、レポートのPDF出力拡張ポイントです。", category: "integration", isCore: false },
  { key: "monthly_report", name: "月次レポート", description: "売上、見積、請求、在庫の月次集計を確認します。", category: "core", isCore: false },
  { key: "admin", name: "管理者画面", description: "運営者がユーザー、店舗、ログを確認します。", category: "admin", isCore: true },
  { key: "billing", name: "請求連携", description: "将来のStripe連携用拡張ポイントです。", category: "integration", isCore: false },
  { key: "accounting", name: "会計連携", description: "将来のfreee連携用拡張ポイントです。", category: "integration", isCore: false }
];
