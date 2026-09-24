import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { ItemThumbnail,HorizontalBarChart } from "@/components/ui/data-visuals";
import { MenuCards } from "@/components/menu/menu-cards";
import { AskAboutMenu } from "@/components/menu/ask-about-menu";
import { listBusinessItems,listInventoryStocks } from "@/lib/phase2/business-data";
import { listInventoryMovements } from "@/lib/inventory-operations";
import { menuContext,menuSales,stockDocuments } from "@/lib/menu-workbench";
import { menuTabs,itemPhoto } from "@/lib/menu-workbench-rules";
import { getStoreNavigationLabels } from "@/lib/store-navigation";
import { uploadDeliveryAction } from "./actions";

export default async function InventoryPage({params,searchParams}:{params:Promise<{storeId:string}>;searchParams:Promise<{tab?:string;days?:string;saved?:string;error?:string}>}) {
  const {storeId}=await params, query=await searchParams;
  const {store,permissions}=await menuContext(storeId);
  const tab=query.tab==="stock"?"stock":query.tab==="analysis"?"analysis":"menu";
  if(tab==="analysis") await menuContext(storeId,"manager");
  const items=await listBusinessItems(storeId,1000), labels=menuTabs(store.industry_type_key);
  const base=`/stores/${storeId}/inventory`;
  const stocks=tab==="stock"?await listInventoryStocks(storeId):[];
  const documents=tab==="stock"?await stockDocuments(storeId):[];
  const movements=tab==="stock"?await listInventoryMovements(storeId):[];
  const days=[30,90,365].includes(Number(query.days))?Number(query.days):30;
  const sales=tab==="analysis"?await menuSales(storeId,days):null;
  const totals=new Map<string,{quantity:number;amount:number}>();
  for(const row of sales?.rows??[]) {if(!row.item_id)continue;const value=totals.get(row.item_id)??{quantity:0,amount:0};value.quantity+=Number(row.quantity);value.amount+=Number(row.total_amount);totals.set(row.item_id,value);}
  const ranked=items.map(item=>({...item,sales:totals.get(item.id)})).filter(item=>item.sales).sort((a,b)=>b.sales!.quantity-a.sales!.quantity);
  const margins=items.filter(item=>item.cost_price>0&&item.unit_price>0).map(item=>({item,margin:(item.metadata.tax_inclusion==="exclusive"?item.unit_price:item.unit_price/(1+item.tax_rate/100))-item.cost_price})).sort((a,b)=>b.margin-a.margin);
  return <AppShell><PageHeader title={getStoreNavigationLabels(store.industry_type_key).product} description="写真で選んで、必要な操作だけ。" action={permissions.manager?<Link className="button" href={`/stores/${storeId}/items/new`}>＋ 商品・メニューを追加</Link>:undefined}/>
    <nav className="menu-tabs" aria-label="商品と在庫の切り替え">{["menu","stock",...(permissions.manager?["analysis"]:[])].map((key,index)=><Link key={key} className={tab===key?"button":"button secondary"} aria-current={tab===key?"page":undefined} href={`${base}?tab=${key}`}>{labels[index]}</Link>)}</nav>
    {query.saved?<p className="notice success" role="status">{query.saved==="status"?"販売状態を保存しました。いつでも戻せます。":"保存しました。"}</p>:null}{query.error?<p className="notice danger" role="alert">{query.error}</p>:null}
    {tab==="menu"?<><MenuCards storeId={storeId} items={items.map(({cost_price,...item})=>{void cost_price;return item;})} manager={permissions.manager} operate={permissions.operate}/>{permissions.manager?<p><Link className="button secondary" href={`/stores/${storeId}/data-imports/ai`}>既存の商品データを取り込む</Link> <Link className="button secondary" href={`/stores/${storeId}/archives`}>削除済みのデータ</Link></p>:null}</>:null}
    {tab==="stock"?<>
      {permissions.operate?<section className="card"><div className="menu-quick-actions"><Link className="button" href={`${base}/documents/new`}>📦 届いた商品を登録</Link><Link className="button secondary" href="#stock-list">残量を確認</Link><Link className="button secondary" href={`${base}/documents/new?kind=waste`}>廃棄を記録</Link>{permissions.manager?<Link className="button secondary" href={`${base}/documents/new?kind=purchase`}>仕入書を作る（未送信）</Link>:null}</div>
        <details><summary>伝票の写真から入荷を準備する</summary><form action={uploadDeliveryAction.bind(null,storeId)} className="form"><label className="field">納品書・伝票の写真<input type="file" name="receipt_file" accept="image/jpeg,image/png,image/webp,application/pdf" required/></label><p>JPG・PNG・WebP・PDF、4MBまで。AIで読み取った後、数量と単位を確認します。会計へ自動計上はしません。</p><PendingSubmitButton pendingLabel="伝票を読み取り中...">写真を読み取る</PendingSubmitButton></form></details>
      </section>:null}
      <section id="stock-list"><div className="section-heading"><h2>残量を確認</h2>{permissions.manager?<Link className="button secondary" href={`${base}/adjust`}>棚卸・発注目安などを調整</Link>:null}</div><div className="menu-card-grid">{items.filter(item=>item.is_stock_managed).map(item=>{const stock=stocks.find(stock=>stock.item_id===item.id);const available=stock?Number(stock.quantity)-Number(stock.reserved_quantity??0):null;const low=stock&&Number(stock.reorder_point)>0&&available!<=Number(stock.reorder_point);return <article className="card menu-stock-card" key={item.id}><ItemThumbnail name={item.name} imageUrl={itemPhoto(item.metadata)}/><h3>{item.name}</h3><strong className="menu-stock-number">{available===null?"未登録":`${available.toLocaleString("ja-JP")} ${item.unit}`}</strong><span className={low?"badge menu-state-sold_out":"badge"}>{!stock?"残量を確認してください":low?"発注目安以下":Number(stock.reorder_point)>0?"在庫あり":"発注目安は未設定"}</span>{stock?<small>現在庫 {stock.quantity} / 確保済み {stock.reserved_quantity??0} {item.unit}</small>:null}</article>;})}</div>{!items.some(item=>item.is_stock_managed)?<p className="notice">在庫管理する商品を登録すると、ここに表示されます。</p>:null}</section>
      <section className="card"><h2>入荷・仕入の確認と履歴</h2><p>直近100件。削除済み下書きもここから戻せます。</p><div className="menu-document-lines">{documents.map(doc=><Link key={doc.id} href={`${base}/documents/${doc.id}`}><strong>{doc.kind==="purchase"?"仕入書（未送信）":doc.kind==="receipt"?"入荷":"廃棄"}</strong><span>{doc.document_date} {doc.vendor}</span><span>{doc.archived_at?"削除済み":doc.status==="draft"?"確認待ち":doc.status==="reversed"?"取消済み":"確定済み"}</span></Link>)}</div>{!documents.length?<p>まだ記録がありません。</p>:null}</section>
      <details className="card"><summary>在庫の変動履歴（直近100件）</summary><div className="menu-document-lines">{movements.map(movement=><div key={movement.id}><strong>{movement.item?.name??"商品"}</strong><span>{Number(movement.quantity_delta)>0?"+":""}{movement.quantity_delta} {movement.item?.unit}</span><small>{new Date(movement.occurred_at).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} · {movement.actor_name??"記録者不明"} · {movement.reason}</small></div>)}</div></details>
    </>:null}
    {sales?<><section className="card"><div className="section-heading"><h2>売れ方を確認</h2><div className="button-row">{[30,90,365].map(value=><Link className={days===value?"button":"button secondary"} key={value} href={`${base}?tab=analysis&days=${value}`}>{value}日</Link>)}</div></div><p>{sales.start}〜{sales.until} · 取り込み済み明細 {sales.rows.length}件</p><p className="muted">商品に紐付いていない明細は {sales.rows.filter(row=>!row.item_id).length}件。未取り込み期間の売上は含まれません。</p></section>
      <div className="menu-analysis-grid"><HorizontalBarChart title="よく売れている（数量）" data={ranked.map(item=>({label:item.name,value:Math.max(0,item.sales!.quantity),displayValue:`${item.sales!.quantity} ${item.unit}`}))} emptyMessage="商品に紐付いた売上明細がまだありません。"/>
        <section className="card"><h3>1つ売れたときの参考利益</h3><p>現在の販売単価（税抜換算）−登録原価。実際の期間利益やレシピ原価ではありません。登録原価を税抜として計算しています。</p><div className="menu-document-lines">{margins.slice(0,6).map(({item,margin})=><div key={item.id}><strong>{item.name}</strong><span>{Math.round(margin).toLocaleString("ja-JP")}円 / {item.unit}</span></div>)}</div><p>{items.length-margins.length}件は価格・原価不足のため計算していません。</p></section>
        <section className="card"><h3>この期間に販売記録がない</h3><p>未取り込みや商品未紐付けの可能性もあります。「売れていない」とは断定しません。</p><div className="menu-document-lines">{items.filter(item=>!totals.has(item.id)).slice(0,10).map(item=><Link href={`/stores/${storeId}/items/${item.id}`} key={item.id}>{item.name} → 内容を確認</Link>)}</div></section></div>
      <p className="notice">価格や発注をAIが勝手に変更することはありません。<AskAboutMenu/></p>
    </>:null}
  </AppShell>;
}
