import "server-only";
import { listCustomers, listDocuments, listInventoryStocks } from "@/lib/phase2/business-data";
import type { BusinessDocument, InventoryStock } from "@/types/phase2";

export type MonthlyReport = {
  month: string;
  estimateTotal: number;
  invoiceTotal: number;
  paidTotal: number;
  unpaidTotal: number;
  estimateCount: number;
  invoiceCount: number;
  customerCount: number;
  lowStockCount: number;
  frequentItems: Array<{
    name: string;
    quantity: number;
    unit?: string;
    itemType?: string;
  }>;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function normalizeMonth(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return /^\d{4}-\d{2}$/.test(candidate ?? "") ? candidate as string : currentMonth();
}

function isInMonth(document: BusinessDocument, month: string) {
  return document.issue_date?.startsWith(month);
}

function isLowStock(stock: InventoryStock) {
  return Number(stock.quantity) <= Number(stock.reorder_point);
}

export async function getMonthlyReport(storeId: string, month: string): Promise<MonthlyReport> {
  const [estimates, invoices, customers, stocks] = await Promise.all([
    listDocuments(storeId, "estimates"),
    listDocuments(storeId, "invoices"),
    listCustomers(storeId),
    listInventoryStocks(storeId)
  ]);

  const monthEstimates = estimates.filter((estimate) => isInMonth(estimate, month));
  const monthInvoices = invoices.filter((invoice) => isInMonth(invoice, month));
  const paidInvoices = monthInvoices.filter((invoice) => invoice.status === "paid");
  const unpaidInvoices = monthInvoices.filter((invoice) => invoice.status !== "paid" && invoice.status !== "void");
  const stockItems = stocks.filter((stock) => stock.item);

  return {
    month,
    estimateTotal: monthEstimates.reduce((sum, estimate) => sum + Number(estimate.total), 0),
    invoiceTotal: monthInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0),
    paidTotal: paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0),
    unpaidTotal: unpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0),
    estimateCount: monthEstimates.length,
    invoiceCount: monthInvoices.length,
    customerCount: customers.length,
    lowStockCount: stocks.filter(isLowStock).length,
    frequentItems: stockItems
      .sort((left, right) => Number(right.quantity) - Number(left.quantity))
      .slice(0, 5)
      .map((stock) => ({
        name: stock.item?.name ?? stock.item_id,
        quantity: Number(stock.quantity),
        unit: stock.item?.unit,
        itemType: stock.item?.item_type
      }))
  };
}
