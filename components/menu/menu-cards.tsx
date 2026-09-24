"use client";
import Link from "next/link";
import { useState } from "react";
import { ItemThumbnail } from "@/components/ui/data-visuals";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { availabilityLabels,itemAvailability,itemPhoto } from "@/lib/menu-workbench-rules";
import type { BusinessItem } from "@/types/phase2";
import { setAvailabilityAction } from "@/app/stores/[storeId]/inventory/actions";
export function MenuCards({storeId,items,manager,operate}:{storeId:string;items:Omit<BusinessItem,"cost_price">[];manager:boolean;operate:boolean}) {
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const filtered=items.filter(item=>(!search||item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))&&(filter==="all"||itemAvailability(item)===filter));
  return <section className="menu-workbench"><div className="menu-toolbar"><label className="field">名前で探す<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="商品・メニュー名"/></label><label className="field">表示<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">すべて</option>{Object.entries(availabilityLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
    <div className="menu-card-grid">{filtered.map(item=><article className="card menu-photo-card" key={item.id}>
      <ItemThumbnail name={item.name} imageUrl={itemPhoto(item.metadata)}/><div className="menu-card-body"><span className={`badge menu-state-${itemAvailability(item)}`}>{availabilityLabels[itemAvailability(item)]}</span><h2>{item.name}</h2><p className="menu-price">{item.unit_price.toLocaleString("ja-JP")}円 <small>{item.metadata.tax_inclusion==="exclusive"?"税抜":"税込"}</small></p>
      {operate?<details><summary>販売状態を変える</summary><form action={setAvailabilityAction.bind(null,storeId,item.id)}><label className="field">変更後の状態<select name="availability" defaultValue={itemAvailability(item)}>{Object.entries(availabilityLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><PendingSubmitButton pendingLabel="変更中...">状態を保存</PendingSubmitButton><small>AIO boost内のみ。外部POSや予約サイトには反映されません。</small></form></details>:null}
      {manager?<Link className="button secondary" href={`/stores/${storeId}/items/${item.id}`}>写真・価格などを編集</Link>:null}
    </div></article>)}</div>{!filtered.length?<p className="notice">{items.length?"一致する商品がありません。検索条件を変えてください。":"まだ登録がありません。写真は後から追加できます。"}</p>:null}
  </section>;
}
