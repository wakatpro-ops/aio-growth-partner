'use server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { buyerChangeSupplier, buyerMove, notifySupplierOrder, procurementPath, saveDraft, sendSupplierLink } from '@/lib/procurement/service';
import { formLines, procurementMessage, uuid } from '@/lib/procurement/model';

const val=(data:FormData,key:string)=>String(data.get(key)??'').trim();
function back(path:string,key:string,message:string) {redirect(`${path}${path.includes('?')?'&':'?'}${key}=${encodeURIComponent(message)}`);}

export async function supplierSetupAction(store:string,op:string,id:string|null,form:FormData) {
  const base=procurementPath(store);
  const path=op==='restore'?`${base}?archived=1`:op==='edit'&&uuid(id)?`${base}?supplier=${id}&edit=1`:base;
  let message:string;
  try {
    if(op==='invite'&&uuid(id)) {
      if(!await sendSupplierLink(id,{storeId:store})) throw new Error('procurement_wait');
      message='招待メールを送信しました。';
    } else {
      await buyerChangeSupplier(store,op,id,{name:val(form,'name'),email:val(form,'email'),registration_number:val(form,'registration_number'),limit:val(form,'limit')});
      message=({create:'仕入先を登録しました。続けて招待メールを送信できます。',edit:'仕入先情報を更新しました。',archive:'削除済みに移動し、仕入先のログインを停止しました。',restore:'仕入先を元に戻しました。新しい招待メールからログインできます。',limit:'契約の招待枠を設定しました。'} as Record<string,string>)[op]??'変更しました。';
    }
  } catch(error) {unstable_rethrow(error);back(path,'error',procurementMessage(error));}
  back(path,'notice',message!);
}

export async function saveDraftAction(store:string,id:string,supplier:string,revision:number,form:FormData) {
  const base=procurementPath(store);
  const path=revision>0 ? `${base}/${id}` : `${base}?supplier=${supplier}${uuid(val(form,'item_id'))?`&item=${val(form,'item_id')}`:''}`;
  try {await saveDraft(store,id,supplier,revision,formLines(form),val(form,'note'),val(form,'desired_date')||null);}
  catch(error) {unstable_rethrow(error);back(path,'error',procurementMessage(error));}
  back(`${base}/${id}`,'notice','発注の下書きを保存しました。まだ仕入先へ送信していません。');
}

export async function moveOrderAction(store:string,id:string,revision:number,op:string,form:FormData) {
  const base=procurementPath(store), path=`${base}/${id}`;
  try {await buyerMove(store,id,revision,op,val(form,'value')||null);}
  catch(error) {unstable_rethrow(error);back(path,'error',procurementMessage(error));}
  if(op==='send') {
    let emailed=false;
    try {emailed=await notifySupplierOrder(store,id);} catch(error) {unstable_rethrow(error);}
    back(path,'notice',emailed?'発注し、仕入先に通知しました。':'発注しました。仕入先画面に表示されていますが、通知メールは送信できませんでした。必要に応じて仕入先にご連絡ください。');
  }
  back(op==='archive'?`${base}?archived=1`:path,'notice',({cancel:'発注を取り消しました。履歴は残ります。',receive:'検収を記録しました。次は仕入先からの請求書をお待ちください。',pay:'支払済みとして記録しました。振込や決済は実行していません。',archive:'削除済みに移動しました。取引と請求書は保持されています。',restore:'取引を元に戻しました。'} as Record<string,string>)[op]??'更新しました。');
}
