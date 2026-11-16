'use server';
import { redirect, unstable_rethrow } from 'next/navigation';
import { sendSupplierLink, signInSupplier, signOutSupplier, supplierMove, supplierPath } from '@/lib/procurement/service';
import { procurementMessage, uuid } from '@/lib/procurement/model';

export async function supplierLoginAction(id:string,form:FormData) {
  let ok=false;
  try {ok=await signInSupplier(id,String(form.get('code')??''));} catch(error) {unstable_rethrow(error);}
  redirect(`${supplierPath(id)}${ok?'':'?login=expired'}`);
}
export async function supplierLinkAction(id:string,form:FormData) {
  try {await sendSupplierLink(id,{email:String(form.get('email')??'').trim()});} catch(error) {unstable_rethrow(error);}
  // Do not confirm an account's existence to an unauthenticated visitor.
  redirect(`${supplierPath(id)}?login=requested`);
}
export async function supplierLogoutAction(id:string) {
  await signOutSupplier(id);
  redirect(supplierPath(id));
}
export async function supplierMoveAction(id:string,orderId:string,revision:number,op:string,form:FormData) {
  if(!uuid(id)||!uuid(orderId)) redirect('/');
  const path=`${supplierPath(id)}?order=${orderId}`;
  try {await supplierMove(id,orderId,revision,op,String(form.get('value')??'').trim()||null);}
  catch(error) {unstable_rethrow(error);redirect(`${path}&error=${encodeURIComponent(procurementMessage(error))}`);}
  redirect(`${path}&notice=1`);
}
