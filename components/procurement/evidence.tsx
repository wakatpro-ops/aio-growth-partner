import { eventLabels,localDateTime,yen,type OrderLine,type PurchaseEvent,type PurchaseInvoice } from '@/lib/procurement/model';

export function OrderLines({lines}:{lines:OrderLine[]}) {
  return <div className="table-wrap"><table className="table compact"><thead><tr><th>品名</th><th>数量</th><th>税抜単価</th><th>税率</th><th>税抜金額</th></tr></thead><tbody>
    {lines.map((line,i)=><tr key={i}><td>{line.name}{line.tax_rate===8?' ※':''}</td><td>{line.quantity} {line.unit}</td><td>{yen(line.unit_price)}</td><td>{line.tax_rate}%</td><td>{yen(line.unit_price*line.quantity)}</td></tr>)}
  </tbody></table>{lines.some(row=>row.tax_rate===8)?<p className="muted">※ 軽減税率の対象</p>:null}</div>;
}

export function OrderEvidence({invoices,events,download}:{invoices:PurchaseInvoice[];events:PurchaseEvent[];download:(id:string)=>string}) {
  return <>
    <section className="card"><h2>仕入先からの請求書</h2>{invoices.length===0?<p className="muted">請求書はまだ発行されていません。</p>:null}
      {invoices.map(invoice=><details key={invoice.id} open={!invoice.voided_at} className="procurement-invoice">
        <summary>請求書 {invoice.document_number} · {yen(invoice.snapshot.total)}（税込）{invoice.voided_at?' · 取消済み':''}</summary>
        <dl className="procurement-facts"><div><dt>発行者</dt><dd>{invoice.snapshot.seller}</dd></div><div><dt>登録番号</dt><dd>{invoice.snapshot.registration_number}</dd></div><div><dt>宛先</dt><dd>{invoice.snapshot.buyer}</dd></div><div><dt>取引日</dt><dd>{invoice.snapshot.transaction_date}</dd></div><div><dt>発行日</dt><dd>{invoice.snapshot.issue_date}</dd></div></dl>
        <OrderLines lines={invoice.snapshot.lines}/>
        <ul>{invoice.snapshot.tax_summary.map(t=><li key={t.rate}>{t.rate}%対象：税抜 {yen(t.subtotal)} ／ 消費税 {yen(t.tax)}</li>)}</ul>
        {invoice.voided_at?<p className="notice">取消：{localDateTime(invoice.voided_at)} · {invoice.void_reason}</p>:null}
        <a className="button secondary" href={download(invoice.id)}>請求書をダウンロード（HTML）</a>
      </details>)}
    </section>
    <section className="card"><h2>取引履歴</h2>{events.length===0?<p className="muted">まだ履歴はありません。</p>:<ol className="procurement-history">
      {events.map(e=><li key={e.id}><time dateTime={e.created_at}>{localDateTime(e.created_at)}</time> {eventLabels[e.action]??'取引を更新'}{e.detail.note?<p>{e.detail.note}</p>:null}{e.detail.received_date?<p>納品日：{e.detail.received_date}</p>:null}</li>)}
    </ol>}</section>
  </>;
}
