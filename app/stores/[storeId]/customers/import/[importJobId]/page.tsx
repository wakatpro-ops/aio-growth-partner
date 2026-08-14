import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { customerImportFields, getCustomerImportJob } from "@/lib/customer-crm";
import { getStore } from "@/lib/stores";
import { executeCustomerImportAction } from "../../customer-actions";

export default async function CustomerImportPreviewPage({ params, searchParams }: { params: Promise<{ storeId: string; importJobId: string }>; searchParams: Promise<{ error?: string; completed?: string }> }) {
  const { storeId, importJobId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const job = await getCustomerImportJob(store.id, importJobId);
  if (!job) notFound();
  const completed = job.status === "completed";

  return (
    <AppShell>
      <PageHeader
        eyebrow="顧客データ移行"
        title={completed ? "取り込み結果" : "列と内容を確認"}
        description={job.original_filename}
        action={<Link className="button secondary" href={`/stores/${store.id}/customers/import`}>取込一覧へ戻る</Link>}
      />
      <StoreBusinessNav store={store} />
      {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}
      {query.completed ? <p className="notice success">顧客データの取り込みが完了しました。セグメントと顧客一覧に反映されています。</p> : null}

      {completed ? (
        <>
          <section className="grid cols-4">
            <article className="card"><p className="muted">対象</p><div className="metric">{job.row_count}件</div></article>
            <article className="card"><p className="muted">新規登録</p><div className="metric">{job.success_count}件</div></article>
            <article className="card"><p className="muted">既存更新・スキップ</p><div className="metric">{job.updated_count}／{job.skipped_count}件</div></article>
            <article className="card"><p className="muted">要確認</p><div className="metric">{job.error_count}件</div></article>
          </section>
          <div className="button-row">
            <Link className="button" href={`/stores/${store.id}/customer-segments`}>顧客セグメントを確認</Link>
            <Link className="button secondary" href={`/stores/${store.id}/customers`}>顧客一覧を見る</Link>
          </div>
          {job.errors.length > 0 ? (
            <section className="card"><h2>取り込めなかった行</h2><table className="table compact"><thead><tr><th>CSV行</th><th>理由</th></tr></thead><tbody>{job.errors.map((error, index) => <tr key={`${error.row}-${index}`}><td>{error.row}</td><td>{error.message}</td></tr>)}</tbody></table></section>
          ) : null}
        </>
      ) : (
        <form className="stack" action={executeCustomerImportAction.bind(null, store.id, job.id)}>
          <section className="card">
            <h2>2. 元ファイルの列を対応させる</h2>
            <p>名前と電話番号は必須です。使わない項目は「取り込まない」のままで構いません。</p>
            <div className="grid cols-3">
              {customerImportFields.map((field) => (
                <div className="field" key={field.key}>
                  <label htmlFor={`mapping_${field.key}`}>{field.label}{field.required ? <span className="required-mark"> 必須</span> : null}</label>
                  <select id={`mapping_${field.key}`} name={`mapping_${field.key}`} defaultValue={job.mapping[field.key] ?? ""} required={field.required}>
                    <option value="">取り込まない</option>
                    {job.source_headers.map((header) => <option value={header} key={header}>{header}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>3. 先頭10件を確認</h2>
            <div className="table-wrap">
              <table><thead><tr>{job.source_headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{job.preview_rows.map((row, index) => <tr key={index}>{job.source_headers.map((header) => <td key={header}>{String(row[header] ?? "")}</td>)}</tr>)}</tbody></table>
            </div>
          </section>

          <section className="card form">
            <h2>4. 重複時の処理を選ぶ</h2>
            <label className="radio-card"><input type="radio" name="duplicate_behavior" value="skip" defaultChecked />同じ電話番号の顧客は取り込まず、既存情報を残す</label>
            <label className="radio-card"><input type="radio" name="duplicate_behavior" value="update" />同じ電話番号の顧客は、ファイル内の空欄でない項目だけ更新する</label>
            <p className="notice">取り込み後にメッセージは送信されません。顧客セグメントと配信許可を確認してから下書きを作成してください。</p>
            <div className="form-actions">
              <PendingSubmitButton pendingLabel={`${job.row_count}件を取り込んでいます...`}>{`${job.row_count}件の顧客データを取り込む`}</PendingSubmitButton>
              <Link className="button secondary" href={`/stores/${store.id}/customers/import`}>取り込まずに戻る</Link>
            </div>
          </section>
        </form>
      )}
    </AppShell>
  );
}
