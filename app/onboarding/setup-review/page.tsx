import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getInitialSetupReview } from "@/lib/onboarding/initial-setup";
import { getStore } from "@/lib/stores";
import { InitialSetupReviewForm } from "./initial-setup-review-form";

export default async function InitialSetupReviewPage({ searchParams }: { searchParams: Promise<{ storeId?: string }> }) {
  const { storeId } = await searchParams;
  if (!storeId) redirect("/onboarding");
  const store = await getStore(storeId);
  let review;
  try {
    review = await getInitialSetupReview(store.id);
  } catch {
    redirect("/forbidden");
  }

  if (!review) {
    return (
      <AppShell>
        <PageHeader eyebrow="初回設定" title="AI初期設定を準備しています" description="申込内容から初期設定を作成しています。時間をおいてもう一度ご確認ください。" />
        <Link className="button secondary" href={`/onboarding?storeId=${store.id}`}>初回導入へ戻る</Link>
      </AppShell>
    );
  }

  if (review.confirmationStatus === "completed") {
    return (
      <AppShell>
        <PageHeader eyebrow="初回設定" title="初期設定は反映済みです" description={`${store.name}の確認済み情報で利用を開始できます。`} />
        <p className="notice success">店舗情報、請求書設定、選択したメニュー、業種別の管理画面構成を反映しました。</p>
        <div className="button-row">
          <Link className="button" href={`/stores/${store.id}/aio-improvement`}>最初のAIO改善へ進む</Link>
          <Link className="button secondary" href={`/stores/${store.id}/settings`}>設定を確認する</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="AIと一緒に始める初期設定"
        title="管理画面は、すでに準備できています"
        description="最初から入力する必要はありません。AIが公開情報から準備した内容を見ながら、分からなかったことだけを一問ずつ確認します。"
      />
      <p className="notice success">株式会社 Navi Lifeによる申込者・利用権限の承認は完了しています。ここからはAIO boost AIパートナーと一緒に、店舗の管理環境を仕上げます。</p>
      <InitialSetupReviewForm review={review} />
    </AppShell>
  );
}
