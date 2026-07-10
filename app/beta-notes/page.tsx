import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { betaNotes } from "@/lib/legal/content";

export default function BetaNotesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Beta Notes"
        title="β版利用時の注意事項"
        description="伴走ありβ版として利用する際の手動運用、AI確認、外部サービス連携の制限をまとめています。"
        action={<Link className="button secondary" href="/legal">文書一覧へ</Link>}
      />
      <section className="card legal-card">
        <h2>利用前に確認してください</h2>
        <ul className="compact-list">
          {betaNotes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>
      <section className="grid cols-3">
        <article className="card">
          <h2>手動運用</h2>
          <p>Stripe、freee、Google Business Profile、SNS投稿は、MVPでは一部手動支援モードです。</p>
        </article>
        <article className="card">
          <h2>AI確認</h2>
          <p>AI生成文は公開・送信前に必ず店舗担当者が確認してください。</p>
        </article>
        <article className="card">
          <h2>仕様変更</h2>
          <p>正式版移行前に、機能、画面、料金、外部連携方法が変わる可能性があります。</p>
        </article>
      </section>
    </AppShell>
  );
}
