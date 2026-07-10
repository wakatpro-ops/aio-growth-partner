import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { helpGroups } from "@/lib/legal/content";

export default function HelpPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Help"
        title="操作方法・使い方ガイド"
        description="店舗オーナー、店長、事務担当者向けに、最初の設定から日常業務、売上分析、集客支援までを説明します。"
        action={<Link className="button" href="/onboarding">初回導入へ</Link>}
      />
      <section className="grid cols-3">
        <article className="card">
          <h2>まずは初期設定</h2>
          <p>店舗、請求書、商品・サービス、顧客を登録します。</p>
        </article>
        <article className="card">
          <h2>日常業務</h2>
          <p>見積、請求、PDF、入金、freee向けCSVを確認します。</p>
        </article>
        <article className="card">
          <h2>集客支援</h2>
          <p>AI提案、Gmail下書き、Googleカレンダー、SNS手動投稿支援を使います。</p>
        </article>
      </section>
      <div className="legal-document">
        {helpGroups.map((group) => (
          <section className="card help-card" key={group.title}>
            <h2>{group.title}</h2>
            <div className="grid cols-2">
              {group.steps.map(([title, body]) => (
                <article className="card" key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="card">
        <h2>困ったときの連絡メモ</h2>
        <p>エラーが出た場合は、画面URL、押したボタン、表示されたエラー、スクリーンショット、期待していた動作、実際の動作を伴走担当者へ共有してください。</p>
        <div className="button-row">
          <Link className="button secondary" href="/beta-onboarding">β導入パックを見る</Link>
          <Link className="button secondary" href="/beta-notes">β版の注意事項を見る</Link>
        </div>
      </section>
    </AppShell>
  );
}
