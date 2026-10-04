import { z } from "zod";

export const moneyInput = z.object({
  quantity: z.number().int().min(1).max(100000),
  unitPrice: z.number().int().min(0).max(100000000),
  taxRate: z.union([z.literal(0), z.literal(8), z.literal(10)]),
  taxInclusion: z.enum(["inclusive", "exclusive"])
}).strict().refine(value => value.quantity * value.unitPrice <= 1000000000, "合計は10億円以内で入力してください。");
export type MoneyInput = z.infer<typeof moneyInput>;
export function calculateMoney(input: MoneyInput) {
  const value = moneyInput.parse(input);
  const amount = value.quantity * value.unitPrice;
  const tax = Math.floor(amount * value.taxRate / (value.taxInclusion === "inclusive" ? 100 + value.taxRate : 100));
  return { subtotal: value.taxInclusion === "inclusive" ? amount - tax : amount, tax, total: value.taxInclusion === "inclusive" ? amount : amount + tax };
}
export type SalesBrief = {
  kind: "estimates" | "invoices"; subject: string; itemId?: string; itemUpdatedAt?: string;
  customerId?: string; customerName?: string; money?: MoneyInput; details?: string;
};
export type SalesConversation = {
  step?: "subject" | "customer" | "amounts" | "details" | "confirm" | "generating" | "done";
  brief?: SalesBrief; deferred?: Record<string, number>; actionId?: string;
  generationId?: string; lease?: string; leaseUntil?: number;
};
export type SalesOffer = { id: string; priority: number; weight: number; text: string; label: string; href?: string; kind?: SalesBrief["kind"] };
export const documentLabel = (kind?: SalesBrief["kind"]) => kind === "invoices" ? "請求書" : "見積書";
export function salesOffers(storeId: string, facts: { hasSales: boolean; estimates: number; invoices: number; reports: boolean; aiReports: boolean }): SalesOffer[] {
  const base = `/stores/${storeId}`;
  return [
    ...(!facts.hasSales && facts.reports ? [{ id: "import", priority: 100, weight: 1, text: "売上データを取り込んで、お店の変化を見てみませんか？CSV・Excelを選ぶところから始められます。", label: "売上を取り込む", href: `${base}/data-imports/ai` }] : []),
    ...(facts.invoices ? [{ id: "invoice-drafts", priority: 90, weight: 1, text: `作成途中の請求書が${facts.invoices}件あります。内容を確認して仕上げませんか？`, label: "請求書の下書きを確認", href: `${base}/invoices` }] : []),
    ...(facts.estimates ? [{ id: "estimate-drafts", priority: 90, weight: 1, text: `作成途中の見積書が${facts.estimates}件あります。続きから編集できます。`, label: "見積書の下書きを確認", href: `${base}/estimates` }] : []),
    { id: "estimate", priority: 50, weight: 2, kind: "estimates", text: "商品・サービスを選んで、見積書を準備しませんか？宛先と金額を一緒に確認します。", label: "見積書を準備する" },
    { id: "invoice", priority: 50, weight: 2, kind: "invoices", text: "請求書の下書きを作りませんか？確認した金額を入れた状態で、編集画面へ進めます。", label: "請求書を準備する" },
    ...(facts.hasSales && facts.reports ? [{ id: "report", priority: 50, weight: 1, text: "取り込んだ売上の内訳を確認しませんか？日別・商品別の集計を見られます。", label: "売上の内訳を見る", href: `${base}/sales-hub#reports` }] : []),
    ...(facts.hasSales && facts.aiReports ? [{ id: "ai-report", priority: 50, weight: 1, text: "今月の売上を振り返りませんか？月を選んでAIレポートを準備できます。", label: "AI月次レポートへ", href: `${base}/sales/reports/monthly-ai` }] : []),
    { id: "receipt", priority: 40, weight: 1, text: "たまった伝票を整理しませんか？写真を選ぶと、AIの読み取り結果を確認できます。", label: "伝票を読み取る", href: `${base}/accounting/receipts/new` },
    { id: "payments", priority: 20, weight: 1, text: "領収・入金の記録を確認しませんか？実際の入金を確認してから記録できます。", label: "領収・入金を確認", href: `${base}/payments` },
    { id: "expenses", priority: 20, weight: 1, text: "取り込んだ経費・伝票の内容を確認しませんか？", label: "経費・伝票を確認", href: `${base}/accounting/receipts` },
    { id: "exports", priority: 10, weight: 1, text: "会計ソフト用のデータを準備しますか？対象期間を選ぶ画面へ進めます。", label: "会計データを書き出す", href: `${base}/accounting/exports` },
    { id: "freee", priority: 10, weight: 1, text: "freeeとの連携状況を確認しますか？", label: "freee連携を確認", href: `${base}/settings/accounting/freee` },
    { id: "items", priority: 10, weight: 1, text: "書類で使う商品・サービスを整えませんか？", label: "商品・サービスを確認", href: `${base}/items` },
    { id: "customers", priority: 10, weight: 1, text: "宛先に使うお客様の情報を確認しませんか？", label: "顧客を確認", href: `${base}/customers?tab=customers` },
    ...(facts.reports ? [
      { id: "transactions", priority: 10, weight: 1, text: "取り込んだ取引明細を確認しませんか？", label: "取引明細を見る", href: `${base}/sales` },
      { id: "forecast", priority: 10, weight: 1, text: "需要予測の準備状況を確認しませんか？", label: "需要予測を見る", href: `${base}/sales/forecast` },
      { id: "monthly", priority: 10, weight: 1, text: "月次の傾向を確認しませんか？", label: "月次レポートを見る", href: `${base}/reports/monthly` }
    ] : [])
  ];
}
export const salesCommand = z.object({ revision: z.number().int().min(0),
  action: z.enum(["start", "answer", "generate", "edit", "cancel", "defer", "alternative", "open"]),
  value: z.string().trim().max(800).optional(), itemId: z.string().uuid().optional(), customerId: z.string().uuid().optional(), money: moneyInput.optional()
}).strict();
export type SalesCommand = z.infer<typeof salesCommand>;
export const draftText = z.object({ note: z.string().trim().min(1).max(600) }).strict();
