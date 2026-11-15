'use client';
import { useState } from 'react';
import { PendingSubmitButton } from '@/components/ui/pending-submit-button';
import type { OrderLine } from '@/lib/procurement/model';

type FormAction=(form:FormData)=>void|Promise<void>;
export function OrderDraft({ action,lines,desiredDate,note,itemId,prefill }:{action:FormAction;lines?:OrderLine[];desiredDate?:string|null;note?:string;itemId?:string;prefill?:{name:string;unit:string}|null}) {
  const [keys,setKeys]=useState(()=>Array.from({length:lines?.length||1},(_,i)=>i));
  const [next,setNext]=useState(lines?.length||1);
  return <form action={action} className="form procurement-lines">
    {itemId?<input type="hidden" name="item_id" value={itemId}/>:null}
    <p className="muted">単価は税抜・1単位あたり。数量と税率を確認してください。</p>
    {keys.map((key,index)=>{const line=lines?.[key];return <fieldset className="procurement-line" key={key}>
      <legend>明細 {index+1}</legend>
      <label>品名<input name="name" required maxLength={120} defaultValue={line?.name??(key===0?prefill?.name:undefined)}/></label>
      <label>数量<input name="quantity" type="number" inputMode="numeric" required min={1} max={99999} step={1} defaultValue={line?.quantity??1}/></label>
      <label>単位<input name="unit" required maxLength={20} defaultValue={line?.unit||(key===0?prefill?.unit:null)||'個'}/></label>
      <label>税抜単価（円）<input name="unit_price" type="number" inputMode="numeric" required min={0} max={99999999} step={1} defaultValue={line?.unit_price}/></label>
      <label>税率<select name="tax_rate" defaultValue={line?.tax_rate??10}><option value="10">10%（標準）</option><option value="8">8%（軽減）</option></select></label>
      {keys.length>1?<button type="button" className="button secondary" onClick={()=>setKeys(previous=>previous.filter(k=>k!==key))}>この明細を外す</button>:null}
    </fieldset>;})}
    <button type="button" className="button secondary" disabled={keys.length>=50} onClick={()=>{setKeys(previous=>[...previous,next]);setNext(next+1);}}>明細を追加</button>
    <label>希望納品日（任意）<input name="desired_date" type="date" defaultValue={desiredDate??''}/></label>
    <label>仕入先への連絡事項（任意）<textarea name="note" maxLength={1000} rows={3} defaultValue={note}/></label>
    <div className="form-actions"><PendingSubmitButton pendingLabel="下書きを保存中…">発注の下書きを保存</PendingSubmitButton></div>
  </form>;
}
