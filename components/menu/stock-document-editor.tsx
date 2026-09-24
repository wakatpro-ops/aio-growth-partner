"use client";
import { useState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { StockDocumentLine } from "@/lib/menu-workbench-rules";

type Option = { id:string; name:string; unit:string };
export function StockDocumentEditor({ action,items,initial,kind,revision,source,vendor,date,note,manager }: {
  action:(form:FormData)=>Promise<{error:string}>; items:Option[]; initial:StockDocumentLine[];
  kind:string; revision:number; source:string|null; vendor:string; date:string; note:string; manager:boolean;
}) {
  const [lines,setLines]=useState(initial.length ? initial : [{item_id:"",name:"",quantity:1,unit:""}]);
  const [error,setError]=useState("");
  function change(index:number,patch:Partial<StockDocumentLine>) { setLines(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row)); }
  return <form className="card form menu-document" action={async form=>{setError("");const result=await action(form); if(result) setError(result.error);}}>
    <input type="hidden" name="kind" value={kind}/><input type="hidden" name="revision" value={revision}/><input type="hidden" name="source_receipt_id" value={source??""}/>
    {error?<p className="notice danger" role="alert">{error}</p>:null}
    <div className="grid cols-2"><label className="field">取引先<input name="vendor" defaultValue={vendor} maxLength={200}/></label><label className="field">{kind==="receipt"?"届いた日":"記録日"}<input name="document_date" type="date" required defaultValue={date}/></label></div>
    <p className="notice">{source?"AIの読み取りは下書きです。商品・実際に届いた数量・単位を原本と確認してください。":"商品と数量を確認してください。保存しただけでは在庫は変わりません。"} 箱→個、樽→Lなどの換算は行いません。</p>
    {lines.map((line,index)=><fieldset className="menu-line" key={index}><legend>{index+1}. {line.name||"商品を選択"}</legend>
      <label className="field">登録済みの商品<select name="item_id" required value={line.item_id} onChange={event=>{const item=items.find(item=>item.id===event.target.value);change(index,{item_id:item?.id??"",name:item?.name??line.name,unit:item?.unit??""});}}><option value="">選んでください</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}（{item.unit}）</option>)}</select></label>
      <input type="hidden" name="line_name" value={line.name}/>
      <div className="grid cols-2"><label className="field">{kind==="receipt"?"実際に届いた数量":kind==="purchase"?"注文予定の数量":"廃棄する数量"}<input type="number" name="quantity" min="0.01" max="1000000" step="0.01" required value={line.quantity} onChange={event=>change(index,{quantity:Number(event.target.value)})}/></label><label className="field">単位<input name="unit" value={line.unit} readOnly required/><small>登録済み商品の単位。違う場合は換算した数量を入力。</small></label></div>
      {manager?<label className="field">参考仕入単価（税抜・任意）<input type="number" name="unit_price" min="0" max="100000000" step="0.01" defaultValue={line.unit_price??0}/><small>商品マスタの原価は変更しません。0は未入力として扱います。</small></label>:null}
      <button className="button secondary" type="button" disabled={lines.length===1} onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>この行を除外</button>
    </fieldset>)}
    <button type="button" className="button secondary" disabled={lines.length>=100} onClick={()=>setLines([...lines,{item_id:"",name:"",quantity:1,unit:""}])}>＋ 商品を追加</button>
    <label className="field">メモ（廃棄理由など）<textarea name="note" defaultValue={note} maxLength={1000} required={kind==="waste"}/></label>
    <PendingSubmitButton pendingLabel="下書きを保存中...">保存して最終確認へ</PendingSubmitButton>
  </form>;
}
