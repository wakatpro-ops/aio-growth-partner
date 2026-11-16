import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUserAccess } from '@/lib/auth/server';
import { getStoreForApi } from '@/lib/stores';
import { menuPermissions } from '@/lib/menu-workbench-rules';
import { isDemoStore } from '@/lib/mvp/status';
import { emailConfig, sendEmail } from '@/lib/email/sendgrid';
import { emailFormat, opaque, uuid, type PurchaseEvent, type PurchaseInvoice, type PurchaseOrder, type Supplier } from './model';

export const supplierCookie='aio_procurement_supplier';
export const cookieSettings={ path:'/supplier', httpOnly:true, sameSite:'lax' as const, secure:process.env.NODE_ENV==='production' };
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const supplierFields='id,name,email,registration_number,last_login_at,last_link_at,archived_at';
const orderFields='id,supplier_id,status,lines,note,supplier_note,desired_date,received_date,buyer_name,supplier_name,revision,updated_at,archived_at';
const db=()=>{const client=createSupabaseAdminClient(); if(!client) throw new Error('procurement_unavailable');return client;};
function checked<T>(r:{data:T;error:{message:string;code?:string}|null}):T {
  if (r.error) {
    if(r.error.code==='23505') throw new Error('procurement_duplicate');
    if(r.error.code==='22007'||r.error.code==='22008'||r.error.code==='22P02'||r.error.code==='23514') throw new Error('procurement_invalid');
    if(/^procurement_[a-z_]+$/.test(r.error.message)) throw new Error(r.error.message);
    throw new Error('procurement_unavailable');
  }
  return r.data;
}
export const procurementPath=(id:string)=>`/stores/${id}/procurement`;
export const supplierPath=(id:string)=>`/supplier/${id}`;

export const buyerAccess=cache(async(storeId:string)=>{
  if(!uuid(storeId)) notFound();
  const [s,a]=await Promise.all([getStoreForApi(storeId),getCurrentUserAccess()]);
  if(!a) redirect('/login');
  if(!s.ok || isDemoStore(s.store) || !menuPermissions(a,s.store.organization_id,storeId).manager) notFound();
  if(!checked(await db().rpc('menu_actor_allowed',{p_actor:a.userId,p_store:storeId,p_manager:true}))) notFound();
  return {store:s.store,actor:a};
});

export async function buyerOverview(storeId:string,archived:boolean,page:number) {
  await buyerAccess(storeId);
  const client=db();
  const suppliers=client.from('procurement_suppliers').select(supplierFields,{count:'exact'}).eq('store_id',storeId);
  const orders=client.from('procurement_orders').select(orderFields,{count:'exact'}).eq('store_id',storeId);
  const [cap,supplierRows,orderRows,active]=await Promise.all([
    client.from('procurement_contracts').select('account_limit').eq('store_id',storeId).maybeSingle(),
    (archived ? suppliers.not('archived_at','is',null) : suppliers.is('archived_at',null)).order('name').order('id').range(page*50,page*50+49),
    (archived ? orders.not('archived_at','is',null) : orders.is('archived_at',null)).order('updated_at',{ascending:false}).order('id').range(page*50,page*50+49),
    client.from('procurement_suppliers').select('id',{head:true,count:'exact'}).eq('store_id',storeId).is('archived_at',null)
  ]);
  checked(active);
  return {cap:checked(cap)?.account_limit as number|undefined,suppliers:checked(supplierRows) as Supplier[],orders:checked(orderRows) as PurchaseOrder[],orderCount:orderRows.count??0,supplierCount:active.count??0,listedSuppliers:supplierRows.count??0};
}

export async function buyerPrefill(storeId:string,itemId:string) {
  await buyerAccess(storeId);
  if(!uuid(itemId)) return null;
  return checked(await db().from('items').select('name,unit').eq('store_id',storeId).eq('id',itemId).is('archived_at',null).maybeSingle()) as {name:string;unit:string}|null;
}

export async function buyerSupplier(storeId:string,id:string) {
  await buyerAccess(storeId);
  if(!uuid(id)) return null;
  return checked(await db().from('procurement_suppliers').select(supplierFields).eq('store_id',storeId).eq('id',id).maybeSingle()) as Supplier|null;
}
export async function buyerOrder(storeId:string,id:string) {
  await buyerAccess(storeId);
  if(!uuid(id)) return null;
  return checked(await db().from('procurement_orders').select(orderFields).eq('store_id',storeId).eq('id',id).maybeSingle()) as PurchaseOrder|null;
}
export async function buyerOrderEvidence(storeId:string,id:string) {
  await buyerAccess(storeId);
  if(!uuid(id)) notFound();
  const client=db();
  const [invoices,events]=await Promise.all([
    client.from('procurement_invoices').select('id,document_number,voided_at,void_reason,snapshot').eq('store_id',storeId).eq('order_id',id).order('issued_at',{ascending:false}),
    client.from('procurement_events').select('id,action,detail,created_at').eq('store_id',storeId).eq('order_id',id).order('id',{ascending:false}).limit(100)
  ]);
  return {invoices:checked(invoices) as PurchaseInvoice[],events:checked(events) as PurchaseEvent[]};
}
export async function buyerChangeSupplier(storeId:string,op:string,id:string|null,data:Record<string,unknown>) {
  const {actor}=await buyerAccess(storeId);
  if(id!==null&&!uuid(id)) throw new Error('procurement_invalid');
  return checked(await db().rpc('procurement_buyer_supplier',{p_actor:actor.userId,p_store:storeId,p_op:op,p_id:id,p_data:data})) as string;
}
export async function saveDraft(storeId:string,id:string,supplier:string,revision:number,lines:unknown,note:string,date:string|null) {
  const {actor}=await buyerAccess(storeId);
  if(!uuid(id)||!uuid(supplier)||!Number.isSafeInteger(revision)||revision<0 || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('procurement_invalid');
  return checked(await db().rpc('procurement_buyer_draft',{p_actor:actor.userId,p_store:storeId,p_id:id,p_supplier:supplier,p_revision:revision,p_lines:lines,p_note:note,p_date:date}));
}
export async function buyerMove(storeId:string,id:string,revision:number,op:string,value:string|null) {
  const {actor}=await buyerAccess(storeId);
  if(!uuid(id)||!Number.isSafeInteger(revision)||revision<1) throw new Error('procurement_invalid');
  checked(await db().rpc('procurement_move',{p_actor:actor.userId,p_store:storeId,p_supplier:null,p_hash:null,p_id:id,p_revision:revision,p_op:op,p_value:value}));
}

function mailOrigin() {
  if(process.env.PROCUREMENT_PREVIEW_MAIL_TO!==undefined) {
    const host=process.env.VERCEL_URL;
    if(process.env.VERCEL_ENV!=='preview'||!host||!/^aio-growth-partner-[a-z0-9-]+\.vercel\.app$/u.test(host)||!emailConfig().apiKey) throw new Error('procurement_mail');
    return `https://${host}`;
  }
  const configured=process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if(!configured || !emailConfig().apiKey) throw new Error('procurement_mail');
  const url=new URL(configured);
  if(url.protocol!=='https:' || url.username || url.password) throw new Error('procurement_mail');
  return url.origin;
}
export async function sendSupplierLink(id:string,options:{storeId:string}|{email:string}) {
  if(!uuid(id)) return false;
  const buyer='storeId' in options ? await buyerAccess(options.storeId) : null;
  const email='email' in options ? options.email.toLowerCase().trim() : null;
  if(email!==null&&!emailFormat(email)) return false;
  const origin=mailOrigin(), code=secret(), url=`${origin}${supplierPath(id)}`;
  const recipient=checked(await db().rpc('procurement_supplier_link',{p_id:id,p_store:buyer?.store.id??null,p_actor:buyer?.actor.userId??null,p_email:email,p_hash:digest(code)}));
  if(!recipient) return false;
  const link=`${url}#code=${code}`;
  const escaped=(value:string)=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]??''));
  const intro=buyer ? `${buyer.store.name} から仕入先として招待されました。利用料はかかりません。` : '仕入先画面のログインリンクをお送りします。';
  const result=await sendEmail({to:String(recipient),subject:buyer ? '【AIO boost】仕入れ取引へのご招待' : '【AIO boost】仕入先画面へのログイン',templateKey:'procurement_supplier_link', disableTracking:true,
    html:`<p>${escaped(intro)}</p><p><a href="${escaped(link)}">仕入先画面にログイン（30分以内・1回限り）</a></p><p>次回は<a href="${escaped(url)}">仕入先ログイン画面</a>でメールを再発行してください。</p><p>心当たりのない場合はこのメールを破棄してください。</p>`,
    text:`${intro}\nログイン（30分以内・1回限り）\n${link}\n\n次回ログインするには、こちらからメールを再発行してください。\n${url}\n心当たりのない場合はこのメールを破棄してください。`}).catch(()=>null);
  if(!result?.ok) throw new Error('procurement_mail');
  return true;
}
export async function notifySupplierOrder(storeId:string,orderId:string) {
  const {store}=await buyerAccess(storeId);
  const order=await buyerOrder(storeId,orderId);
  if(!order||order.status!=='sent'||order.archived_at) return false;
  const supplier=await buyerSupplier(storeId,order.supplier_id);
  if(!supplier||supplier.archived_at) return false;
  const url=`${mailOrigin()}${supplierPath(supplier.id)}`;
  const result=await sendEmail({ to:supplier.email, subject:'【AIO boost】新しい発注があります', templateKey:'procurement_order_notice', disableTracking:true,
    text:`${store.name} から発注が届きました。内容の確認と受注回答は仕入先画面からお願いします。\n${url}` }).catch(()=>null);
  return result?.ok===true;
}

function parseSession(raw:string|undefined,id:string) {
  if(!raw) return null;
  const [owner,token,...rest]=raw.split('.');
  return owner===id && opaque(token) && rest.length===0 ? digest(token) : null;
}
export async function supplierSession(id:string) {
  if(!uuid(id)) return null;
  return parseSession((await cookies()).get(supplierCookie)?.value,id);
}
export async function signInSupplier(id:string,code:string) {
  if(!uuid(id)||!opaque(code)) return false;
  const token=secret();
  const ok=checked(await db().rpc('procurement_supplier_session',{p_id:id,p_code:digest(code),p_session:digest(token),p_op:'login'}));
  if(ok===true) (await cookies()).set(supplierCookie,`${id}.${token}`,{...cookieSettings,maxAge:8*60*60});
  return ok===true;
}
export async function signOutSupplier(id:string) {
  const hash=await supplierSession(id);
  if(!hash) return;
  checked(await db().rpc('procurement_supplier_session',{p_id:id,p_code:null,p_session:hash,p_op:'logout'}));
  (await cookies()).set(supplierCookie,'',{...cookieSettings,maxAge:0});
}
export async function supplierView(id:string,orderId:string|null,page:number,archived:boolean) {
  const hash=await supplierSession(id);
  if(!hash) return null;
  return checked(await db().rpc('procurement_supplier_view',{p_id:id,p_hash:hash,p_order:uuid(orderId)?orderId:null,p_offset:page*50,p_archived:archived})) as {supplier:Pick<Supplier,'name'|'registration_number'>;orders:PurchaseOrder[];count:number;order:PurchaseOrder|null;invoices:PurchaseInvoice[];events:PurchaseEvent[]}|null;
}
export async function supplierMove(id:string,orderId:string,revision:number,op:string,value:string|null) {
  const hash=await supplierSession(id);
  if(!hash||!uuid(orderId)||!Number.isSafeInteger(revision)||revision<1) throw new Error('procurement_forbidden');
  checked(await db().rpc('procurement_move',{p_actor:null,p_store:null,p_supplier:id,p_hash:hash,p_id:orderId,p_revision:revision,p_op:op,p_value:value}));
}
