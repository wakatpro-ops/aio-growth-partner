import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { PendingSubmitButton } from '@/components/ui/pending-submit-button';
import { OrderDraft } from '@/components/procurement/order-draft';
import { OrderEvidence,OrderLines } from '@/components/procurement/evidence';
import { buyerOrder,buyerOrderEvidence,buyerSupplier,procurementPath } from '@/lib/procurement/service';
import { jstDay,statuses } from '@/lib/procurement/model';
import { moveOrderAction,saveDraftAction } from '../actions';

export default async function PurchaseOrderPage({params,searchParams}:{params:Promise<{storeId:string;orderId:string}>;searchParams:Promise<{notice?:string;error?:string}>}) {
  const {storeId,orderId}=await params, q=await searchParams, base=procurementPath(storeId);
  const order=await buyerOrder(storeId,orderId);
  if(!order) notFound();
  const [supplier,evidence]=await Promise.all([buyerSupplier(storeId,order.supplier_id),buyerOrderEvidence(storeId,orderId)]);
  const act=(op:string)=>moveOrderAction.bind(null,storeId,orderId,order.revision,op);
  const o=order, activeSupplier=supplier&&!supplier.archived_at;
  return <AppShell><PageHeader title="仕入れ取引の詳細" description={o.supplier_name||supplier?.name||'仕入先'}/><div className="procurement-stack">
    <Link href={`${base}${o.archived_at?'?archived=1':''}`}>← {o.archived_at?'削除済み':'仕入れ取引'}に戻る</Link>
    {q.notice?<p className="notice success" role="status">{q.notice}</p>:null}{q.error?<p className="notice danger" role="alert">{q.error}</p>:null}
    <section className="card"><div className="section-heading"><h2>発注内容</h2><span className="badge">{o.archived_at?'削除済み · ':''}{statuses[o.status]}</span></div>
      <p className="procurement-note">発注番号：{o.id}</p>{o.desired_date?<p>希望納品日：{o.desired_date}</p>:null}{o.received_date?<p>納品日（取引日）：{o.received_date}</p>:null}
      <OrderLines lines={o.lines}/>{o.note?<p className="procurement-note">店舗の連絡事項：{o.note}</p>:null}{o.supplier_note?<p className="procurement-note">仕入先の回答：{o.supplier_note}</p>:null}
      {o.status==='draft'&&!o.archived_at&&activeSupplier?<details><summary>明細・納品希望を編集</summary><OrderDraft action={saveDraftAction.bind(null,storeId,o.id,o.supplier_id,o.revision)} lines={o.lines} desiredDate={o.desired_date} note={o.note}/></details>:null}
    </section>
    <section className="card"><h2>次の操作</h2><div className="button-row">
      {o.archived_at?<form action={act('restore')}><PendingSubmitButton className="button secondary">元に戻す</PendingSubmitButton></form>:<>
        {o.status==='draft'&&activeSupplier?<form action={act('send')}><ConfirmSubmitButton className="button" message={`${supplier.name}にこの内容で発注します。下書きの内容が仕入先画面に共有されます。`}>仕入先へ発注する</ConfirmSubmitButton></form>:null}
        {['draft','sent','accepted'].includes(o.status)?<form action={act('cancel')}><ConfirmSubmitButton className="button secondary" message="この発注を取り消します。取引の履歴は保持されます。">発注を取り消す</ConfirmSubmitButton></form>:null}
        {o.status==='shipped'?<form action={act('receive')} className="form"><label>実際の納品日（請求書の取引日）<input name="value" type="date" required max={jstDay()} defaultValue={jstDay()}/></label><ConfirmSubmitButton className="button" message="納品内容を確認済みとして記録します。在庫数は自動で変更しません。">納品を確認して検収する</ConfirmSubmitButton></form>:null}
        {o.status==='invoiced'?<form action={act('pay')}><ConfirmSubmitButton className="button" message="実際に支払ったことを記録します。振込・決済は実行しません。">支払済みとして記録する</ConfirmSubmitButton></form>:null}
        {['draft','cancelled','declined','paid'].includes(o.status)?<form action={act('archive')}><ConfirmSubmitButton message="この取引を削除済みに移します。取引・請求書・履歴は保持され、元に戻せます。">削除</ConfirmSubmitButton></form>:null}
        {['sent','accepted','received'].includes(o.status)?<p className="muted">{o.status==='received'?'仕入先が請求書を発行するのを待っています。':'仕入先からの回答・納品連絡を待っています。'}</p>:null}
      </>}
    </div></section>
    <OrderEvidence {...evidence} download={id=>`${base}/${o.id}/invoice/${id}`}/>
  </div></AppShell>;
}
