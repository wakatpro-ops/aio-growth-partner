import { AppShell } from "@/components/layout/app-shell";
import { StoreBusinessNav } from "@/components/phase2/store-business-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getIndustryConfig } from "@/config/industries";
import { getStore } from "@/lib/stores";

const groups = [
  {
    title: "会計",
    items: [
      ["インボイス対応請求書", "実装済み"],
      ["税率別集計", "実装済み"],
      ["入金管理", "実装済み"],
      ["会計CSV出力", "実装済み"]
    ]
  },
  {
    title: "受発注",
    items: [
      ["見積", "実装済み"],
      ["受注", "実装済み"],
      ["作業完了", "実装済み"],
      ["請求化", "準備済み"]
    ]
  },
  {
    title: "決済",
    items: [
      ["支払方法管理", "実装済み"],
      ["入金ステータス", "実装済み"],
      ["Stripe連携準備", "将来連携"]
    ]
  },
  {
    title: "データ連携",
    items: [
      ["CSV / Excel取込", "実装済み"],
      ["POS売上データ取込", "CSV経由で対応"],
      ["会計CSV出力", "実装済み"]
    ]
  },
  {
    title: "AI活用",
    items: [
      ["月次AI分析", "実装済み"],
      ["AI改善提案", "実装済み"],
      ["SNS投稿下書き", "実装済み"],
      ["Google / Gmail / Calendar支援", "一部実装済み"]
    ]
  },
  {
    title: "証跡",
    items: [
      ["操作ログ", "実装済み"],
      ["PDF発行履歴", "実装済み"],
      ["再発行履歴", "実装済み"],
      ["ステータス変更履歴", "準備済み"]
    ]
  }
];

export default async function InvoiceToolMapPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const store = await getStore(storeId);
  const industry = getIndustryConfig(store.industry_type_key);

  return (
    <AppShell>
      <PageHeader eyebrow={industry.name} title="業務機能マップ" description="AIO boostの機能を、会計・受発注・決済・データ連携・AI活用・証跡管理に整理します。" />
      <StoreBusinessNav store={store} />
      <p className="notice">業務で使っている機能を一覧で確認できます。制度利用や申請判断が必要な場合は、専門家や窓口へ確認してください。</p>
      <section className="grid cols-2">
        {groups.map((group) => (
          <article className="card" key={group.title}>
            <h2>{group.title}</h2>
            <table className="table compact">
              <thead><tr><th>機能</th><th>状態</th></tr></thead>
              <tbody>
                {group.items.map(([label, status]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td><span className="badge">{status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
