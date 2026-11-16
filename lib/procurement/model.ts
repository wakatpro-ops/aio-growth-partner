export type Supplier = { id: string; name: string; email: string; registration_number: string | null; archived_at: string | null; last_login_at: string | null; last_link_at: string | null };
export type OrderLine = { name: string; unit: string; quantity: number; unit_price: number; tax_rate: 8 | 10 };
export type PurchaseOrder = { id: string; supplier_id: string; status: string; lines: OrderLine[]; note: string; supplier_note: string; desired_date: string | null; received_date: string | null; buyer_name: string; supplier_name: string; revision: number; updated_at: string; archived_at: string | null };
export type PurchaseInvoice = { id: string; document_number: string; voided_at: string | null; void_reason: string | null; snapshot: { seller: string; buyer: string; registration_number: string; issue_date: string; transaction_date: string; lines: OrderLine[]; tax_summary: { rate: number; subtotal: number; tax: number }[]; total: number } };
export type PurchaseEvent = { id: number; created_at: string; action: string; detail: { note?: string; received_date?: string } };

export const statuses: Record<string,string> = { draft: "下書き", sent: "受注確認待ち", accepted: "受注済み", shipped: "納品連絡済み", received: "検収済み・請求待ち", invoiced: "請求済み・支払待ち", paid: "支払済み", declined: "受注不可", cancelled: "取消済み" };
export const eventLabels: Record<string,string> = { draft: "発注の下書きを保存", send: "店舗が発注", accept: "仕入先が受注", decline: "仕入先が受注不可と回答", ship: "仕入先が納品を連絡", receive: "店舗が検収", invoice: "仕入先が請求書を発行", void_invoice: "仕入先が請求書を取消", pay: "店舗が支払済みと記録", cancel: "店舗が発注を取消", archive: "削除済みに移動", restore: "削除済みから復元" };
export const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`;
export const jstDay = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const localDateTime = (value: string) => new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'short'});
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const opaque = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(value);
export const emailFormat = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(s);

export function formLines(form: FormData): OrderLine[] {
  const fields = ['name','unit','quantity','unit_price','tax_rate'].map(key=>form.getAll(key));
  const n=fields[0].length;
  if (n<1 || n>50 || fields.some(column=>column.length!==n)) throw new Error('procurement_invalid');
  return Array.from({length:n},(_,i)=>{
    const [name,unit,quantity,unit_price,tax_rate]=fields.map(col=>typeof col[i]==='string' ? String(col[i]).trim() : '');
    if (!name || name.length>120 || !unit || unit.length>20 || !/^[0-9]{1,5}$/.test(quantity) || Number(quantity)<1 || !/^[0-9]{1,8}$/.test(unit_price) || !['8','10'].includes(tax_rate)) throw new Error('procurement_invalid');
    return {name,unit,quantity:Number(quantity),unit_price:Number(unit_price),tax_rate:Number(tax_rate) as 8|10};
  });
}

export function procurementMessage(error: unknown) {
  const code=error instanceof Error ? error.message : '';
  const messages: Record<string,string> = {
    procurement_forbidden:'この操作を行う権限がありません。', procurement_missing:'対象が見つかりません。',
    procurement_cap:'契約の招待枠が未設定か、上限に達しています。現在の利用数を下回る枠には変更できません。',
    procurement_invalid:'入力内容を確認してください。', procurement_conflict:'状態が変わったか、操作を完了できませんでした。画面を開き直してください。',
    procurement_open_orders:'進行中の取引があります。取引を完了または取消してから削除してください。',
    procurement_invoice_required:'仕入先の登録番号と請求書番号が必要です。', procurement_buyer_name:'請求書の宛先となる法人名が未登録です。運営担当者へご確認ください。',
    procurement_duplicate:'このメールアドレスまたは請求書番号は登録済みです。削除済みも確認してください。',
    procurement_mail:'メールは送信できませんでした。少し時間をおいてから再試行してください。', procurement_wait:'短時間に送信されています。1分以上待ってから再試行してください。',
    procurement_unavailable:'現在、仕入れの機能を利用できません。時間をおいてご確認ください。'
  };
  return messages[code] ?? messages.procurement_unavailable;
}
