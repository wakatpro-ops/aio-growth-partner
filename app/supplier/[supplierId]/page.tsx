import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SupplierLogin } from '@/components/procurement/supplier-login';
import { OrderEvidence,OrderLines } from '@/components/procurement/evidence';
import { ConfirmProcurementButton as ConfirmSubmitButton } from '@/components/procurement/confirm-procurement-button';
import { PendingSubmitButton } from '@/components/ui/pending-submit-button';
import { supplierPath,supplierView } from '@/lib/procurement/service';
import { localDateTime,statuses,uuid } from '@/lib/procurement/model';
import { supplierLinkAction,supplierLoginAction,supplierLogoutAction,supplierMoveAction } from './actions';

export const metadata:Metadata={title:'仕入先専用 | AIO boost',robots:{index:false,follow:false},referrer:'no-referrer'};

type Query={order?:string;archived?:string;page?:string;login?:string;notice?:string;error?:string};
export default async function SupplierPage({params,searchParams}:{params:Promise<{supplierId:string}>;searchParams:Promise<Query>}) {
  const {supplierId}=await params,q=await searchParams;
  if(!uuid(supplierId)) notFound();
  const base=supplierPath(supplierId),id=uuid(q.order)?q.order:null,page=/^[0-9]{1,5}$/.test(q.page??'')?Number(q.page):0,archived=q.archived==='1';
  let access:Awaited<ReturnType<typeof supplierView>>;
  try {access=await supplierView(supplierId,id,page,archived);} catch {return <main className="procurement-portal"><h1>仕入先専用</h1><p className="notice danger">取引を確認できません。時間をおいて開き直してください。</p></main>;}
  if(!access) return <main className="procurement-portal procurement-stack"><header><p className="eyebrow">AIO boost</p><h1>仕入先専用ログイン</h1></header><section className="card">
    <p>招待を受けた仕入先だけが利用できます。利用料はかかりません。</p>
    {q.login==='requested'?<p className="notice" role="status">登録済みの場合、ログインメールをお送りします。受信箱をご確認ください。</p>:null}
    {q.login==='expired'?<p className="notice danger" role="alert">このリンクは無効か期限切れです。新しいリンクを受け取ってください。</p>:null}
    <SupplierLogin login={supplierLoginAction.bind(null,supplierId)} request={supplierLinkAction.bind(null,supplierId)}/>
  </section></main>;
  const {supplier,order,invoices,events,orders,count}=access;
  if(id&&!order) notFound();
  const act=(op:string)=>supplierMoveAction.bind(null,supplierId,order!.id,order!.revision,op);
  const nav=(i:number)=>`${base}?page=${i}${archived?'&archived=1':''}`;
  return <main className="procurement-portal procurement-stack"><header className="section-heading"><div><p className="eyebrow">AIO boost · 仕入先専用</p><h1>{supplier.name}</h1></div><form action={supplierLogoutAction.bind(null,supplierId)}><PendingSubmitButton className="button secondary">ログアウト</PendingSubmitButton></form></header>
    {q.notice==='1'?<p className="notice success" role="status">取引を更新しました。店舗側にも反映されています。</p>:null}{q.error?<p className="notice danger" role="alert">{q.error}</p>:null}
    {order?<>
      <Link href={`${base}${order.archived_at?'?archived=1':''}`}>← 取引一覧へ</Link>
      <section className="card"><div className="section-heading"><h2>{order.buyer_name}からの発注</h2><span className="badge">{statuses[order.status]}</span></div><p>発注番号：{order.id}</p>
        {order.desired_date?<p>希望納品日：{order.desired_date}</p>:null}{order.received_date?<p>納品日（取引日）：{order.received_date}</p>:null}<OrderLines lines={order.lines}/>
        {order.note?<p className="procurement-note">店舗の連絡事項：{order.note}</p>:null}
      </section>
      {!order.archived_at&&['sent','accepted','received','invoiced'].includes(order.status)?<section className="card"><h2>店舗への回答</h2>
        {order.status==='sent'?<div className="procurement-stack">
          <form action={act('accept')} className="form"><label>納品予定・連絡事項（任意）<input name="value" maxLength={500}/></label><ConfirmSubmitButton className="button" message="この注文を受注します。回答が店舗に表示されます。">この注文を受注する</ConfirmSubmitButton></form>
          <details><summary>受注できない場合</summary><form action={act('decline')} className="form"><label>店舗への連絡事項（任意）<input name="value" maxLength={500}/></label><ConfirmSubmitButton className="button secondary" message="この注文は受注できないと店舗へ回答します。">受注不可と回答する</ConfirmSubmitButton></form></details>
        </div>:null}
        {order.status==='accepted'?<form action={act('ship')} className="form"><label>納品予定・配送情報（任意）<input name="value" maxLength={500}/></label><PendingSubmitButton>納品を連絡する</PendingSubmitButton></form>:null}
        {order.status==='received'?(supplier.registration_number?<form action={act('invoice')} className="form">
          <p>発行者：{supplier.name} ／ 登録番号：{supplier.registration_number} ／ 宛先：{order.buyer_name}</p>
          <p>発注内容をもとに、税率別の税額を算出します（税率ごとに1円未満切捨て）。発行者、取引日、数量・税率が実際の取引と一致することを確認してください。</p>
          <label>自社の請求書番号<input name="value" maxLength={80} required/></label><ConfirmSubmitButton className="button" message="発注明細をもとに適格請求書を発行し、店舗に共有します。発行後の原本は編集できません。">適格請求書を発行する</ConfirmSubmitButton>
        </form>:<p className="notice">登録番号が未設定のため、適格請求書は発行できません。発注元の店舗へお問い合わせください。</p>):null}
        {order.status==='invoiced'?<details><summary>未払いの請求書を訂正する</summary><form action={act('void_invoice')} className="form"><label>取消理由<input name="value" maxLength={500} required/></label><ConfirmSubmitButton message="発行済み請求書を取り消します。原本と取消理由は履歴に残ります。">請求書を取り消す</ConfirmSubmitButton></form></details>:null}
      </section>:null}
      <OrderEvidence invoices={invoices} events={events} download={invoice=>`${base}/invoice/${order.id}/${invoice}`}/>
    </>:<section className="card"><div className="section-heading"><h2>{archived?'取引の保管履歴':'届いた注文'}</h2><Link href={archived?base:`${base}?archived=1`}>{archived?'注文一覧へ':'保管履歴を見る'}</Link></div>
      {orders.length?<ul className="procurement-list">{orders.map(o=><li key={o.id}><div><strong>{o.buyer_name}</strong> <span className="badge">{statuses[o.status]}</span><p>{localDateTime(o.updated_at)}{o.desired_date?` · 希望納品日 ${o.desired_date}`:''}</p></div><Link className="button secondary" href={`${base}?order=${o.id}`}>注文を確認する</Link></li>)}</ul>:<p>このページに表示する注文はありません。</p>}
      {page>0||(page+1)*50<count?<nav className="button-row" aria-label="注文のページ切り替え">{page>0?<Link href={nav(page-1)}>← 前へ</Link>:null}<span>{page+1}ページ</span>{(page+1)*50<count?<Link href={nav(page+1)}>次へ →</Link>:null}</nav>:null}
    </section>}
  </main>;
}
