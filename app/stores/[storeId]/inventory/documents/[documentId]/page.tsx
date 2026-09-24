import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { StockDocumentEditor } from "@/components/menu/stock-document-editor";
import { PrintButton } from "@/components/menu/print-button";
import { menuContext,stockDocuments } from "@/lib/menu-workbench";
import { listBusinessItems } from "@/lib/phase2/business-data";
import { getExpenseReceipt } from "@/lib/phase6/expense-receipts";
import type { StockDocumentLine } from "@/lib/menu-workbench-rules";
import { saveStockDocumentAction,transitionStockDocumentAction } from "../../actions";

export default async function StockDocumentPage({params,searchParams}:{params:Promise<{storeId:string;documentId:string}>;searchParams:Promise<{kind?:string;source?:string;edit?:string;error?:string;saved?:string}>}) {
  const {storeId,documentId}=await params, query=await searchParams;
  const {permissions}=await menuContext(storeId,"operate");
  const doc=documentId==="new"?null:(await stockDocuments(storeId,documentId))[0];
  if(documentId!=="new"&&!doc) notFound();
  const kind=doc?.kind??(query.kind==="purchase"?"purchase":query.kind==="waste"?"waste":"receipt");
  if(kind==="purchase") await menuContext(storeId,"manager");
  const sourceId=doc?.source_receipt_id??query.source??null;
  const receipt=sourceId?await getExpenseReceipt(storeId,sourceId):null;
  if(sourceId&&!receipt&&!doc) notFound();
  const id=doc?.id??randomUUID();
  const editing=!doc||(query.edit==="1"&&doc.status==="draft"&&!doc.archived_at);
  const title=kind==="purchase"?"仕入書（未送信）":kind==="waste"?"廃棄の確認":"届いた商品の確認";
  const items=editing?(await listBusinessItems(storeId,1000)).filter(item=>item.is_stock_managed):[];
  const initial:StockDocumentLine[]=doc?.lines??(Array.isArray(receipt?.extracted_items)?receipt.extracted_items.map((line:{name?:string;quantity?:number})=>({item_id:"",name:String(line.name??""),quantity:Number(line.quantity??1),unit:""})):[]);
  if(!doc) for(const line of initial) {
    const matches=items.filter(item=>item.name.normalize("NFKC").trim()===line.name.normalize("NFKC").trim());
    if(matches.length===1) { line.item_id=matches[0].id; line.unit=matches[0].unit; }
  }
  return <AppShell><PageHeader title={title} description="確認するまで在庫は変わりません。外部サービスへの送信・会計計上は行いません。" action={<Link className="button secondary" href={`/stores/${storeId}/inventory?tab=stock`}>一覧に戻る</Link>}/>
    {query.error?<p className="notice danger" role="alert">{query.error}</p>:null}
    {query.saved?<p className="notice success" role="status">{doc?.status==="confirmed"?(kind==="purchase"?"仕入書を確定しました。未送信です。在庫は変更していません。":"在庫へ反映しました。履歴に記録されています。"):doc?.status==="reversed"?"取消を記録し、在庫を戻しました。":"下書きを保存しました。内容を確認してください。"}</p>:null}
    {receipt?<details className="card"><summary>伝票の原本と読み取り結果を見る</summary>{receipt.preview_url?<a className="button secondary" href={receipt.preview_url} target="_blank" rel="noreferrer">原本を開く</a>:<p>原本を表示できませんでした。</p>}<p>{receipt.ai_summary}</p>{receipt.possible_duplicates?.length?<p className="notice danger">同内容の別伝票があります。二重入荷でないことを確認してください。</p>:null}</details>:null}
    {editing?<StockDocumentEditor action={saveStockDocumentAction.bind(null,storeId,id)} items={items.map(({id,name,unit})=>({id,name,unit}))} initial={initial} kind={kind} revision={doc?.revision??0} source={sourceId} vendor={doc?.vendor??receipt?.vendor_name??""} date={doc?.document_date??new Date().toISOString().slice(0,10)} note={doc?.note??""} manager={permissions.manager}/>:doc?<section className="card menu-document">
      <h2>{doc.archived_at?"削除済み":doc.status==="draft"?"内容を確認":doc.status==="reversed"?"取消済み":kind==="purchase"?"確定・未送信":"反映済み"}</h2><p>{doc.document_date} · {doc.vendor||"取引先未入力"}</p>
      <div className="menu-document-lines">{doc.lines.map((line,i)=><div key={i}><strong>{line.name}</strong><span>{line.quantity.toLocaleString("ja-JP")} {line.unit}</span>{permissions.manager&&kind==="purchase"?<span>{line.unit_price?`${(line.quantity*line.unit_price).toLocaleString("ja-JP")}円（税抜）`:"金額未入力"}</span>:null}</div>)}</div>
      {kind==="purchase"?<p className="notice">合計 {doc.lines.reduce((sum,line)=>sum+line.quantity*(line.unit_price??0),0).toLocaleString("ja-JP")}円（入力済み単価分・税抜）。仕入先へは送信されません。発注後も入荷は別途登録してください。</p>:null}
      <p>{doc.note}</p><div className="button-row">
      {doc.archived_at?<form action={transitionStockDocumentAction.bind(null,storeId,id,"restore",doc.revision)}><ConfirmSubmitButton message="下書きを元に戻します。">元に戻す</ConfirmSubmitButton></form>:doc.status==="draft"?<>
        <Link className="button secondary" href={`?edit=1`}>内容を修正</Link>
        <form action={transitionStockDocumentAction.bind(null,storeId,id,"confirm",doc.revision)}><ConfirmSubmitButton message={kind==="purchase"?"仕入書を確定します。外部には送信されません。":"商品・数量・単位を確認しました。在庫へ反映します。"}>{kind==="purchase"?"この内容で仕入書を確定":"確認して在庫に反映"}</ConfirmSubmitButton></form>
        <form action={transitionStockDocumentAction.bind(null,storeId,id,"archive",doc.revision)}><ConfirmSubmitButton message="下書きを削除します。後で元に戻せます。">削除</ConfirmSubmitButton></form>
      </>:doc.status==="confirmed"&&permissions.manager?<form action={transitionStockDocumentAction.bind(null,storeId,id,"reverse",doc.revision)}><ConfirmSubmitButton message="取消を履歴に残します。入荷・廃棄の場合は在庫を元に戻します。">取消を記録</ConfirmSubmitButton></form>:null}
      <PrintButton/></div>
    </section>:null}
  </AppShell>;
}
