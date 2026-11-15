import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { unstable_rethrow } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { PendingSubmitButton } from '@/components/ui/pending-submit-button';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { OrderDraft } from '@/components/procurement/order-draft';
import { buyerAccess,buyerOverview,buyerPrefill,buyerSupplier,procurementPath } from '@/lib/procurement/service';
import { localDateTime,statuses,uuid,type Supplier } from '@/lib/procurement/model';
import { saveDraftAction,supplierSetupAction } from './actions';

function SupplierForm({store,supplier}:{store:string;supplier?:Supplier}) {
  return <form action={supplierSetupAction.bind(null,store,supplier?'edit':'create',supplier?.id??null)} className="form">
    <label>仕入先の事業者名<input name="name" defaultValue={supplier?.name} maxLength={160} required/></label>
    <label>招待先メール<input type="email" name="email" defaultValue={supplier?.email} maxLength={254} readOnly={Boolean(supplier)} required/></label>
    {supplier?<p className="muted">招待先メールを変更する場合は、旧アカウントを削除し、新しいメールで登録し直してください。</p>:null}
    <label>インボイス登録番号（未登録なら空欄）<input name="registration_number" placeholder="T1234567890123" pattern="T[0-9]{13}" maxLength={14} defaultValue={supplier?.registration_number??''}/></label>
    <div className="form-actions"><PendingSubmitButton>{supplier?'仕入先情報を更新':'仕入先を登録'}</PendingSubmitButton></div>
  </form>;
}

type Query={archived?:string;page?:string;supplier?:string;item?:string;edit?:string;notice?:string;error?:string};
export default async function ProcurementPage({params,searchParams}:{params:Promise<{storeId:string}>;searchParams:Promise<Query>}) {
  const {storeId}=await params, q=await searchParams, base=procurementPath(storeId);
  const {actor}=await buyerAccess(storeId);
  const archived=q.archived==='1', page=/^[0-9]{1,5}$/.test(q.page??'')?Number(q.page):0;
  const item=uuid(q.item)?q.item:null;
  let result: Awaited<ReturnType<typeof buyerOverview>>;
  let selected:Supplier|null=null;
  let prefill:Awaited<ReturnType<typeof buyerPrefill>>=null;
  try {
    [result,selected,prefill]=await Promise.all([buyerOverview(storeId,archived,page),!archived&&uuid(q.supplier)?buyerSupplier(storeId,q.supplier):Promise.resolve(null),item?buyerPrefill(storeId,item):Promise.resolve(null)]);
  } catch(error) {unstable_rethrow(error);return <AppShell><PageHeader title="発注・仕入先"/><p className="notice danger" role="alert">発注と仕入先を取得できませんでした。時間をおいて開き直してください。</p></AppShell>;}
  const {cap,suppliers,orders,supplierCount,orderCount,listedSuppliers}=result;
  const next=(page+1)*50<Math.max(orderCount,listedSuppliers);
  const nav=(i:number)=>`${base}?page=${i}${archived?'&archived=1':''}${item?`&item=${item}`:''}`;
  return <AppShell><PageHeader title="発注・仕入先" description="仕入先を招待し、発注から受注・検収・請求までを一つの取引で確認できます。"/>
    <div className="procurement-stack">
      <nav className="button-row" aria-label="仕入取引の表示"><Link className={!archived?'button':'button secondary'} href={base} aria-current={!archived?'page':undefined}>通常の一覧</Link><Link className={archived?'button':'button secondary'} href={`${base}?archived=1`} aria-current={archived?'page':undefined}>削除済み</Link><Link href={`/stores/${storeId}/inventory?tab=stock`}>在庫・仕入へ戻る</Link></nav>
      {q.notice?<p className="notice success" role="status">{q.notice}</p>:null}{q.error?<p className="notice danger" role="alert">{q.error}</p>:null}
      {!archived?<section className="card"><h2>仕入先アカウント</h2><p>{cap?`利用枠：${supplierCount} / ${cap} アカウント`:'契約の招待枠が未設定です。運営担当者へご確認ください。'} 仕入先の利用は無料です。</p>
        {actor.isPlatformAdmin?<details><summary>運営管理者：契約の招待上限を設定</summary><form action={supplierSetupAction.bind(null,storeId,'limit',null)} className="form"><label>契約上の発行上限<input type="number" name="limit" min={1} max={1000} required defaultValue={cap}/></label><ConfirmSubmitButton className="button secondary" message="この契約の受注アカウント発行上限を変更します。内容は監査履歴に残ります。">招待上限を設定</ConfirmSubmitButton></form></details>:null}
        {cap&&supplierCount<cap?<details><summary>仕入先を登録する</summary><SupplierForm store={storeId}/></details>:null}
      </section>:null}
      {selected&&!selected.archived_at&&!archived?<section className="card"><div className="section-heading"><h2>{q.edit==='1'?'仕入先情報を編集':'発注の下書き'}：{selected.name}</h2><Link href={base}>一覧へ戻る</Link></div>
        {q.edit==='1'?<SupplierForm store={storeId} supplier={selected}/>:<OrderDraft action={saveDraftAction.bind(null,storeId,randomUUID(),selected.id,0)} itemId={item??undefined} prefill={prefill}/>}
      </section>:null}
      {prefill&&!selected?<p className="notice">「{prefill.name}」の発注先を選んでください。数量・単価は送る前に確認できます。</p>:null}
      <section className="card"><h2>{archived?'削除済みの仕入先':'仕入先一覧'}</h2>{suppliers.length===0?<p className="muted">このページに仕入先はありません。</p>:null}
        <ul className="procurement-list">{suppliers.map(s=><li key={s.id}><div><strong>{s.name}</strong><p>{s.email}</p><small>登録番号：{s.registration_number??'未登録'} · {s.last_login_at?`最終利用 ${localDateTime(s.last_login_at)}`:s.last_link_at?'招待・リンク発行済み':'未招待'}</small></div>
          <div className="button-row">{archived?<form action={supplierSetupAction.bind(null,storeId,'restore',s.id)}><PendingSubmitButton className="button secondary">元に戻す</PendingSubmitButton></form>:<>
            <Link className="button" href={`${base}?supplier=${s.id}${item?`&item=${item}`:''}`}>この仕入先への発注を作る</Link><Link className="button secondary" href={`${base}?supplier=${s.id}&edit=1`}>仕入先情報を編集</Link>
            <form action={supplierSetupAction.bind(null,storeId,'invite',s.id)}><ConfirmSubmitButton className="button secondary" message={`${s.email} に、この仕入先専用のログインリンクを送信します。`}>招待メールを送る</ConfirmSubmitButton></form>
            <form action={supplierSetupAction.bind(null,storeId,'archive',s.id)}><ConfirmSubmitButton message="仕入先を削除済みに移し、ログインを停止します。取引・請求書・履歴は残り、仕入先は元に戻せます。">削除</ConfirmSubmitButton></form></>}
          </div></li>)}</ul>
      </section>
      <section className="card"><h2>{archived?'削除済みの取引':'仕入れ取引'}</h2>{orders.length===0?<p className="muted">このページに取引はありません。</p>:null}<ul className="procurement-list">
        {orders.map(o=><li key={o.id}><div><span className="badge">{statuses[o.status]}</span> <strong>{o.supplier_name||suppliers.find(s=>s.id===o.supplier_id)?.name||'仕入先への発注'}</strong><p>{o.lines[0]?.name}{o.lines.length>1?` ほか${o.lines.length-1}件`:''} · {localDateTime(o.updated_at)}</p></div><Link className="button secondary" href={`${base}/${o.id}`}>取引の詳細</Link></li>)}
      </ul></section>
      {page||next?<nav className="button-row" aria-label="一覧のページ切り替え">{page>0?<Link href={nav(page-1)}>← 前のページ</Link>:null}<span>{page+1}ページ</span>{next?<Link href={nav(page+1)}>次のページ →</Link>:null}</nav>:null}
    </div>
  </AppShell>;
}
