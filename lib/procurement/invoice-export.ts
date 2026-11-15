import { yen, type PurchaseInvoice } from './model';

export function invoiceDownload(invoice:PurchaseInvoice) {
  const e=(s:string)=>s.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]??''));
  const data=invoice.snapshot;
  const rows=data.lines.map(line=>`<tr><td>${e(line.name)}${line.tax_rate===8?' ※':''}</td><td>${line.quantity} ${e(line.unit)}</td><td>${yen(line.unit_price)}</td><td>${line.tax_rate}%</td><td>${yen(line.quantity*line.unit_price)}</td></tr>`).join('');
  const taxes=data.tax_summary.map(row=>`<li>${row.rate}%対象：税抜 ${yen(row.subtotal)} ／ 消費税 ${yen(row.tax)}</li>`).join('');
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>請求書 ${e(invoice.document_number)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:1rem}table{width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:.45rem;text-align:left;overflow-wrap:anywhere}.void{border:2px solid #920d27;padding:.75rem;color:#920d27}</style><h1>適格請求書</h1>${invoice.voided_at?`<p class="void">取消済み：${e(invoice.void_reason??'')}</p>`:''}<p>請求書番号：${e(invoice.document_number)}<br>発行日：${e(data.issue_date)}<br>取引日：${e(data.transaction_date)}</p><p>宛先：${e(data.buyer)} 御中<br>発行者：${e(data.seller)}<br>適格請求書発行事業者登録番号：${e(data.registration_number)}</p><table><thead><tr><th>品名</th><th>数量</th><th>税抜単価</th><th>税率</th><th>税抜金額</th></tr></thead><tbody>${rows}</tbody></table>${data.lines.some(line=>line.tax_rate===8)?'<p>※ 軽減税率の対象</p>':''}<ul>${taxes}</ul><p><strong>税込合計：${yen(data.total)}</strong></p></html>`,{headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Content-Disposition':`attachment; filename="invoice-${invoice.id}.html"`,
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'"
  }});
}
