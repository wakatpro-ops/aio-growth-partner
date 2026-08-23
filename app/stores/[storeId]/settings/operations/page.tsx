import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { normalizeOperatingModel } from "@/lib/applications/operating-model";
import { getStore } from "@/lib/stores";
import { updateOperatingModelAction } from "./actions";

export default async function StoreOperationsSettingsPage({ params, searchParams }: { params: Promise<{ storeId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { storeId } = await params;
  const query = await searchParams;
  const store = await getStore(storeId);
  const model = normalizeOperatingModel(store.operating_model);
  return <AppShell>
    <PageHeader eyebrow="設定" title="運営方法とシステム連携" description="既存システムを残しながら、AIO boostが担当する範囲を設定します。" />
    <StoreBusinessNav store={store} />
    {query.saved ? <p className="notice success">運営方法を保存しました。</p> : null}
    <form className="card form" action={updateOperatingModelAction.bind(null, store.id)}>
      <div className="field"><label htmlFor="structure_mode">店舗構成</label><select id="structure_mode" name="structure_mode" defaultValue={model.structure.mode}><option value="single_store">単一店舗</option><option value="multi_store">複数店舗</option><option value="multi_brand">複数ブランド</option><option value="multi_company">複数法人（契約確認が必要）</option></select></div>
      <div className="grid cols-2">{Object.entries(model.systems).map(([key, value]) => <div className="field" key={key}><label>{({ sales: "売上", reservations: "予約受付", customers: "顧客", inventory: "在庫", accounting: "会計" } as Record<string, string>)[key]}</label><select name={`system_${key}`} defaultValue={value.authority}>{key === "reservations" ? <><option value="external">既存の予約サービスを使う</option><option value="manual">電話・LINE・紙などで管理</option><option value="not_managed">予約管理は使わない</option><option value="undecided">後で決める</option>{value.authority === "aio_boost" ? <option value="aio_boost" disabled>AIO boost予約管理（準備中・変更してください）</option> : null}</> : <><option value="aio_boost">AIO boostで管理</option><option value="external">既存システムを正本にする</option><option value="file_import">ファイル取込で連携</option><option value="not_managed">管理しない</option></>}</select></div>)}</div>
      <div className="grid cols-2"><div className="field"><label>レジ・売上データ</label><select name="register_mode" defaultValue={model.register.mode}><option value="external_pos">既存のPOS・レジを使う</option><option value="file_import">CSV・Excelで売上を取り込む</option><option value="not_needed">レジは使わない</option><option value="undecided">後で決める</option>{model.register.mode === "simple_register" ? <option value="simple_register" disabled>AIO boost簡易レジ（準備中・変更してください）</option> : null}</select></div><div className="field"><label>予約の運用形態</label><select name="service_mode" defaultValue={model.operations.serviceMode}><option value="reservation_only">予約制</option><option value="walk_in_only">来店順</option><option value="both">予約と当日受付</option><option value="remote_or_visit">訪問・オンライン</option><option value="not_used">予約管理不要</option></select></div></div>
      <div className="checkbox-grid">{[["staff", "スタッフ"], ["seat", "席"], ["room", "部屋"], ["equipment", "設備"], ["table", "テーブル"], ["vehicle", "車両"], ["other", "その他"]].map(([key, label]) => <label className="check-card" key={key}><input type="checkbox" name={`resource_${key}`} defaultChecked={model.operations.reservationResources.includes(key as never)} /><span>{label}</span></label>)}</div>
      <div className="grid cols-3">{Object.entries(model.sharing).map(([key, value]) => <div className="field" key={key}><label>{({ menus: "メニュー", invoices: "請求書", customers: "顧客", staff: "スタッフ", inventory: "在庫" } as Record<string, string>)[key]}</label><select name={`sharing_${key}`} defaultValue={value}><option value="company">法人共通</option><option value="brand">ブランド共通</option><option value="store">店舗別</option></select></div>)}</div>
      <p className="notice">既存POS・予約サービスを選んでも、AIO boostが外部データを書き換えることはありません。AIO boost内の簡易レジと予約管理は準備中のため、完成するまで新規選択できません。</p>
      <PendingSubmitButton pendingLabel="保存しています...">運営方法を保存</PendingSubmitButton>
    </form>
  </AppShell>;
}
