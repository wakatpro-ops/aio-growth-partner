import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { canEditStore, getCurrentUserAccess } from "@/lib/auth/server";
import { listLineBookingMigrationImportRows, listLineBookingMigrations } from "@/lib/line/migration";
import { getStore } from "@/lib/stores";
import type { LineBookingMigration, LineMigrationStage } from "@/types/line-migration";
import {
  archiveLineBookingMigrationAction,
  completeLineBookingMigrationAction,
  confirmLineMigrationTestAction,
  createLineBookingMigrationAction,
  importLineMigrationBookingsAction,
  markLineMigrationDataPreparedAction,
  requestLineMigrationCutoverAction,
  previewLineMigrationImportAction,
  restoreLineBookingMigrationAction,
  rollBackLineBookingMigrationAction,
  updateLineBookingMigrationAssessmentAction
} from "./actions";

const steps: Array<{ key: LineMigrationStage; label: string; description: string }> = [
  { key: "assessment", label: "現状確認", description: "現在のLINE公式アカウントと予約サービスを確認" },
  { key: "data_preparation", label: "データ準備", description: "予約・顧客・メニューを移す方法を確認" },
  { key: "test", label: "テスト", description: "旧サービスを止めずにテスト予約" },
  { key: "cutover", label: "切替準備", description: "日時・承認・元に戻す手順を確定" },
  { key: "completed", label: "移行完了", description: "運営会社が実接続を確認して完了" }
];

const stageIndex: Record<LineMigrationStage, number> = {
  assessment: 0,
  data_preparation: 1,
  test: 2,
  cutover: 3,
  completed: 4,
  rolled_back: 4
};

const exportLabels = { api: "公式API", csv: "CSV・Excel", manual: "手動で整理", none: "移すデータはない", unknown: "まだ分からない" } as const;
const adminLabels = { confirmed: "管理者として操作できる", needs_owner: "店舗責任者の操作が必要", unknown: "まだ分からない" } as const;

function formatDateTime(value: string | null) {
  if (!value) return "未設定";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

function dateTimeInput(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: "Asia/Tokyo"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function AssessmentFields({ migration }: { migration?: LineBookingMigration }) {
  return <>
    <div className="grid cols-2">
      <div className="field"><label htmlFor="current_provider_name">現在の予約サービス <span className="required-mark">必須</span></label><input id="current_provider_name" name="current_provider_name" required defaultValue={migration?.current_provider_name ?? ""} placeholder="例：LINEミニアプリ、予約サービス名" /></div>
      <div className="field"><label htmlFor="official_account_name">LINE公式アカウント名</label><input id="official_account_name" name="official_account_name" defaultValue={migration?.official_account_name ?? ""} placeholder="分からなければ空欄で大丈夫です" /></div>
      <div className="field"><label htmlFor="official_account_basic_id">LINE公式アカウントのID</label><input id="official_account_basic_id" name="official_account_basic_id" defaultValue={migration?.official_account_basic_id ?? ""} placeholder="例：@example" /></div>
      <div className="field"><label htmlFor="open_booking_count">これから来店する予約数</label><input id="open_booking_count" name="open_booking_count" type="number" min="0" max="1000000" defaultValue={migration?.open_booking_count ?? ""} placeholder="分かる範囲で入力" /></div>
      <div className="field"><label htmlFor="admin_access_status">LINE管理画面を操作できますか</label><select id="admin_access_status" name="admin_access_status" defaultValue={migration?.admin_access_status ?? "unknown"}>{Object.entries(adminLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      <div className="field"><label htmlFor="export_method">予約データを取り出す方法</label><select id="export_method" name="export_method" defaultValue={migration?.export_method ?? "unknown"}>{Object.entries(exportLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
    </div>
    <div className="field"><label htmlFor="notes">補足</label><textarea id="notes" name="notes" defaultValue={migration?.notes ?? ""} placeholder="契約先への確認事項や、残したい運用方法など" /></div>
    <p className="field-help">パスワード、アクセストークン、二段階認証コードは入力しないでください。秘密情報は運営会社が安全な接続画面で扱います。</p>
  </>;
}

export default async function LineBookingMigrationPage({ params, searchParams }: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ saved?: string; previewed?: string; imported?: string; requested?: string; completed?: string; rolledBack?: string; deleted?: string; restored?: string; error?: string }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  if (!(await canEditStore(store.id, store.organization_id))) notFound();
  const [access, migrations] = await Promise.all([getCurrentUserAccess(), listLineBookingMigrations(store.id)]);
  const migration = migrations.find((item) => !item.archived_at);
  const archived = migrations.filter((item) => item.archived_at);
  const importRows = migration ? await listLineBookingMigrationImportRows(store.id, migration.id) : [];
  const currentStep = migration ? stageIndex[migration.stage] : 0;

  return <AppShell>
    <PageHeader eyebrow="予約・LINE" title="既存LINE予約から移行" description="現在のお客様窓口を不用意に止めず、確認・テスト・切替を一つずつ進めます。" action={<div className="button-row"><Link className="button secondary" href={`/stores/${store.id}/bookings`}>予約へ戻る</Link><Link className="button secondary" href={`/stores/${store.id}/bookings/line`}>LINE予約設定</Link></div>} />
    {query.saved ? <p className="notice success">移行計画を保存しました。</p> : null}
    {query.previewed ? <p className="notice success">予約ファイルを解析しました。候補と除外理由を確認してから取り込んでください。</p> : null}
    {query.imported ? <p className="notice success">予約を店舗確認待ちで取り込みました。残りがある場合は続けて取り込めます。</p> : null}
    {query.requested ? <p className="notice success">切替確認を運営会社へ依頼しました。旧サービスはまだ停止しないでください。</p> : null}
    {query.completed ? <p className="notice success">実接続とテスト予約を確認し、移行を完了しました。</p> : null}
    {query.rolledBack ? <p className="notice warning">旧受付への復旧を記録しました。新しいLINE予約の受付状況も確認してください。</p> : null}
    {query.deleted ? <p className="notice success">移行計画を削除済みに移しました。記録は保持され、元に戻せます。</p> : null}
    {query.restored ? <p className="notice success">削除済みの移行計画を元に戻しました。</p> : null}
    {query.error ? <p className="notice danger">{decodeURIComponent(query.error)}</p> : null}

    <section className="line-migration-safety">
      <strong>現在のLINE予約は、この画面を保存しただけでは変更されません</strong>
      <p>Webhookやアクセストークンの切替は、データ確認とテスト予約が終わり、店舗責任者が切替日時を承認した後に運営会社が行います。</p>
    </section>

    <ol className="line-migration-steps" aria-label="移行の進行状況">
      {steps.map((step, index) => <li className={index < currentStep ? "done" : index === currentStep ? "current" : ""} key={step.key}>
        <span>{index + 1}</span><div><strong>{step.label}</strong><small>{step.description}</small></div>
      </li>)}
    </ol>

    {!migration ? <section className="card line-migration-start">
      <div><p className="eyebrow">最初の確認</p><h2>今の予約方法を教えてください</h2><p>分からない項目はそのままで開始できます。AIO boostが確認事項を整理し、旧サービスを止めてよい段階まで案内します。</p></div>
      <form className="form" action={createLineBookingMigrationAction.bind(null, store.id)}>
        <AssessmentFields />
        <PendingSubmitButton pendingLabel="移行計画を作成しています...">移行計画を作成</PendingSubmitButton>
      </form>
    </section> : <>
      <section className="grid cols-3 booking-metrics">
        <article className="card"><span>現在の予約サービス</span><strong>{migration.current_provider_name}</strong><small>{migration.official_account_name || "LINE公式アカウント名は未確認"}</small></article>
        <article className="card"><span>データの取り出し</span><strong>{exportLabels[migration.export_method]}</strong><small>これから来店する予約 {migration.open_booking_count ?? "未確認"}件</small></article>
        <article className="card"><span>現在の段階</span><strong>{migration.stage === "rolled_back" ? "元の受付へ復旧" : steps[currentStep]?.label}</strong><small>切替希望 {formatDateTime(migration.target_cutover_at)}</small></article>
      </section>

      <section className="line-migration-workspace">
        <article className="card">
          <div className="section-heading"><div><p className="eyebrow">1. 現状確認</p><h2>現在の利用内容</h2></div><span className="badge">編集できます</span></div>
          <form className="form" action={updateLineBookingMigrationAssessmentAction.bind(null, store.id)}>
            <AssessmentFields migration={migration} />
            <PendingSubmitButton disabled={["completed", "rolled_back"].includes(migration.stage)} pendingLabel="確認内容を保存しています...">確認内容を保存</PendingSubmitButton>
          </form>
        </article>

        <article className="card">
          <div className="section-heading"><div><p className="eyebrow">2. データ準備</p><h2>何を移すか確認</h2></div>{migration.data_prepared_at ? <span className="badge badge-strong">確認済み</span> : <span className="badge">未確認</span>}</div>
          <p>優先して移すのは「これから来店する予約」です。必要に応じて顧客、メニュー、担当者も整理します。過去履歴は証拠として旧サービスにも残してください。</p>
          <form className="form line-migration-upload" action={previewLineMigrationImportAction.bind(null, store.id)}>
            <div className="field"><label htmlFor="reservation_file">予約データのCSV・Excel</label><input id="reservation_file" name="reservation_file" type="file" accept=".csv,.tsv,.xlsx,.xls,.xlsm" required /></div>
            <p className="field-help">4MB・5,000行まで。マクロは実行せず、Excelに保存されたセルの値だけを読み取ります。元ファイル自体は保存しません。</p>
            <PendingSubmitButton disabled={["completed", "rolled_back"].includes(migration.stage)} pendingLabel="予約データを解析しています...">アップロードして解析</PendingSubmitButton>
          </form>
          {migration.import_batch_id ? <div className="line-migration-preview">
            <div className="section-heading"><div><p className="eyebrow">取込プレビュー</p><h3>{migration.import_file_name}</h3></div><span className="badge badge-strong">候補 {migration.import_valid_row_count}件／全{migration.import_row_count}行</span></div>
            <div className="line-migration-preview-list">
              {importRows.map((row) => <div className={`line-migration-preview-row ${row.row_status}`} key={row.id}>
                <span>{row.row_number}行</span>
                <div><strong>{row.normalized_data.customerName || "お客様名なし"}</strong><small>{formatDateTime(row.normalized_data.startsAt)}・{row.normalized_data.serviceName}</small></div>
                <em>{row.row_status === "imported" ? "取込済み" : row.error_message || "取込候補"}</em>
              </div>)}
            </div>
            {migration.import_row_count > importRows.length ? <p className="field-help">先頭{importRows.length}行を表示しています。全件数と除外件数は上の集計で確認できます。</p> : null}
            {migration.import_valid_row_count === 0 ? <p className="notice danger">取り込める将来の予約がありません。除外理由を確認して、ファイルを選び直してください。</p> : migration.imported_booking_count < migration.import_valid_row_count ? <form action={importLineMigrationBookingsAction.bind(null, store.id)}><ConfirmSubmitButton className="button" message="表示内容を確認し、将来の予約をAIO boostの予約台帳へ『店舗確認待ち』で取り込みます。">予約データを取り込む</ConfirmSubmitButton></form> : <p className="notice success">候補の予約はすべて取り込み済みです。予約台帳で日時と内容を確認してください。</p>}
          </div> : null}
          <div className="line-migration-manual-separator"><span>ファイルを使わない場合</span></div>
          <form className="form" action={markLineMigrationDataPreparedAction.bind(null, store.id)}>
            <div className="field"><label htmlFor="data_preparation_status">準備方法</label><select id="data_preparation_status" name="data_preparation_status" defaultValue={migration.data_preparation_status}><option value="not_started">まだ準備していない</option><option value="export_ready">CSV・Excel・APIで準備できた</option><option value="manual_ready">未消化予約を手動で確認した</option><option value="no_data">移す予約データはない</option></select></div>
            <label className="check-row"><input name="data_scope_confirmed" type="checkbox" />未消化予約、顧客、メニュー、担当者のうち、移す対象と件数を確認しました</label>
            <p className="field-help">ファイル形式が不明な場合は先に保存せず、予約サービス名と出力例を運営会社へ共有してください。行ごとの推測で予約を確定しません。</p>
            <PendingSubmitButton disabled={Boolean(migration.import_batch_id && migration.import_valid_row_count > 0) || ["completed", "rolled_back"].includes(migration.stage)} pendingLabel="データ準備を確認しています...">手動のデータ準備を確認</PendingSubmitButton>
          </form>
        </article>

        <article className="card">
          <div className="section-heading"><div><p className="eyebrow">3. テスト</p><h2>旧予約を止めずに確認</h2></div>{migration.test_confirmed_at ? <span className="badge badge-strong">確認済み</span> : <span className="badge">未確認</span>}</div>
          <p>店舗のLINE公式アカウント、予約内容、日時、担当者、確認通知が正しいかをテストします。</p>
          <form className="form" action={confirmLineMigrationTestAction.bind(null, store.id)}>
            <label className="check-row"><input name="test_booking_confirmed" type="checkbox" />AIO boost側でテスト予約を登録し、予約台帳で確認しました</label>
            <label className="check-row"><input name="old_service_untouched" type="checkbox" />現在の予約サービスとWebhookをまだ停止・変更していません</label>
            <PendingSubmitButton disabled={!migration.data_prepared_at || ["completed", "rolled_back"].includes(migration.stage)} pendingLabel="テスト結果を保存しています...">テスト結果を確認</PendingSubmitButton>
          </form>
        </article>

        <article className="card">
          <div className="section-heading"><div><p className="eyebrow">4. 切替準備</p><h2>切替日時と戻し方</h2></div>{migration.cutover_requested_at ? <span className="badge badge-strong">確認依頼済み</span> : <span className="badge">未依頼</span>}</div>
          <form className="form" action={requestLineMigrationCutoverAction.bind(null, store.id)}>
            <div className="field"><label htmlFor="target_cutover_at">切替希望日時</label><input id="target_cutover_at" name="target_cutover_at" type="datetime-local" defaultValue={dateTimeInput(migration.target_cutover_at)} required /></div>
            <div className="field"><label htmlFor="rollback_plan">問題が起きた場合の戻し方</label><textarea id="rollback_plan" name="rollback_plan" defaultValue={migration.rollback_plan ?? "旧予約サービスのWebhookと受付を再開し、切替後の予約を店舗台帳で照合する。"} required /></div>
            <label className="check-row"><input name="owner_authorized" type="checkbox" />店舗責任者が切替日時と、問題時に元へ戻す手順を承認しました</label>
            <PendingSubmitButton disabled={!migration.test_confirmed_at || ["completed", "rolled_back"].includes(migration.stage)} pendingLabel="切替確認を依頼しています...">運営会社へ切替確認を依頼</PendingSubmitButton>
          </form>
          <p className="notice warning">この操作は切替依頼です。旧サービスの契約・Webhook・トークンは自動変更しません。</p>
        </article>
      </section>

      {access?.isPlatformAdmin && migration.cutover_requested_at && migration.stage !== "completed" && migration.stage !== "rolled_back" ? <section className="card line-migration-admin">
        <div className="section-heading"><div><p className="eyebrow">運営管理者の最終確認</p><h2>実接続を確認して移行完了</h2></div><span className="badge">運営管理者のみ</span></div>
        <form className="form" action={completeLineBookingMigrationAction.bind(null, store.id)}>
          <label className="check-row"><input name="webhook_verified" type="checkbox" />対象店舗のLINE Webhookと接続先を確認しました</label>
          <label className="check-row"><input name="aio_booking_verified" type="checkbox" />本番のテスト予約が正しい店舗の予約台帳へ入りました</label>
          <label className="check-row"><input name="owner_informed" type="checkbox" />店舗責任者へ切替完了と戻し方を連絡しました</label>
          <ConfirmSubmitButton className="button" message="実接続と店舗責任者への連絡を確認し、この移行を完了にします。">移行完了にする</ConfirmSubmitButton>
        </form>
      </section> : null}

      {access?.isPlatformAdmin && migration.stage === "completed" ? <section className="card danger-zone"><h2>元の予約受付へ戻す</h2><p>障害時だけ使用します。旧受付の復旧とAIO boost側の新規受付停止を実際に確認してから記録してください。</p><form className="form" action={rollBackLineBookingMigrationAction.bind(null, store.id)}><label className="check-row"><input name="rollback_confirmed" type="checkbox" />旧受付の復旧と新規受付の停止を確認しました</label><ConfirmSubmitButton message="LINE予約の切替を元に戻した記録を保存します。">元の受付へ戻す</ConfirmSubmitButton></form></section> : null}

      <section className="card danger-zone"><h2>移行計画を削除</h2><p>画面から外しますが、計画内容と監査履歴は保持されます。削除済みから元に戻せます。</p><form action={archiveLineBookingMigrationAction.bind(null, store.id)}><ConfirmSubmitButton message="この移行計画を削除済みに移します。記録は保持されます。">移行計画を削除</ConfirmSubmitButton></form></section>
    </>}

    {archived.length ? <section className="card booking-config-list"><div className="section-heading"><div><p className="eyebrow">削除済み</p><h2>元に戻せる移行計画</h2></div></div>{archived.map((item) => <div className="booking-config-row" key={item.id}><div><strong>{item.current_provider_name}</strong><small>{formatDateTime(item.archived_at)}に削除・予約や顧客データは保持</small></div>{migration ? <span className="badge">進行中の計画があります</span> : <form action={restoreLineBookingMigrationAction.bind(null, store.id, item.id)}><ConfirmSubmitButton className="button secondary" message={`「${item.current_provider_name}」の移行計画を元に戻しますか？`}>元に戻す</ConfirmSubmitButton></form>}</div>)}</section> : null}
  </AppShell>;
}
