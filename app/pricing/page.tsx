import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "料金 | AIO boost",
  description: "AIO boostは月額20万円（税別）の1プラン。1法人あたり店舗数・利用ユーザー数・通常業務でのAI利用に上限はありません。"
};

const featureGroups = [
  {
    title: "AIに選ばれる店舗づくり",
    items: [
      "AIおすすめ準備度と改善ポイントの可視化",
      "店舗情報をもとにしたAIO改善提案",
      "Google・SNS向け投稿文の作成支援",
      "口コミ返信文・顧客案内文・店内POP文の作成",
      "Gmail下書き・Googleカレンダー予定の作成"
    ]
  },
  {
    title: "売上・店舗業務をひとまとめ",
    items: [
      "顧客、商品・サービス、在庫の管理",
      "見積書、受注、請求書、PDF、入金の管理",
      "CSV・Excelによる売上データ取り込み",
      "売上レポートとAIによる月次分析",
      "Stripe決済情報・freee会計との連携支援"
    ]
  },
  {
    title: "会社全体で使える",
    items: [
      "1法人あたり店舗数の上限なし",
      "利用ユーザー数の上限なし",
      "業態に合わせた画面と管理項目",
      "店舗ごとの権限・設定・履歴管理",
      "通常の業務利用ならAIトークンの利用上限なし"
    ]
  }
];

const startSteps = [
  ["1", "導入相談", "現在の店舗運営と、AIで改善したい内容を確認します。"],
  ["2", "電子契約", "料金、利用期間、初期設定内容を電子契約で確認します。"],
  ["3", "請求書・お振込み", "月額料金を毎月前払いで請求し、発行日から10日以内に銀行振込でお支払いいただきます。"],
  ["4", "初期設定・利用開始", "店舗情報と利用者を登録し、AIO改善を始めます。"]
];

export default function PricingPage() {
  return (
    <main className="pricing-page">
      <header className="pricing-nav">
        <Link className="pricing-brand" href="/">AIO boost</Link>
        <div className="button-row">
          <Link className="button secondary" href="/">サービス紹介へ戻る</Link>
          <Link className="button" href="/apply">導入相談を申し込む</Link>
        </div>
      </header>

      <section className="pricing-hero">
        <div className="pricing-hero-copy">
          <p className="pricing-kicker">料金は、これひとつだけ</p>
          <h1>AIも、店舗も、利用者も。<br />上限を気にせず使えます。</h1>
          <p className="pricing-lead">
            AIO改善、集客、売上分析、顧客管理、見積・請求、会計連携まで、店舗運営に必要な機能をひとつにまとめました。
          </p>
          <div className="pricing-unlimited-row" aria-label="上限なしの対象">
            <span>AI利用 上限なし</span>
            <span>店舗数 上限なし</span>
            <span>利用者数 上限なし</span>
          </div>
        </div>

        <article className="pricing-plan-card" aria-labelledby="pricing-plan-title">
          <p className="pricing-plan-label">AIO boost オールインワンプラン</p>
          <h2 id="pricing-plan-title">月額</h2>
          <p className="pricing-amount"><strong>200,000</strong><span>円</span></p>
          <p className="pricing-tax">税別／1法人</p>
          <div className="pricing-setup">
            <span>初期設定費 300,000円（税別）</span>
            <strong>2年以上のご契約で無料</strong>
          </div>
          <ul className="pricing-plan-highlights">
            <li>通常の業務利用ならAIトークンの利用上限なし</li>
            <li>1法人内の店舗数・利用ユーザー数に上限なし</li>
            <li>追加機能ごとの従量課金なし</li>
          </ul>
          <Link className="button pricing-primary-cta" href="/apply">導入相談・利用申し込みへ</Link>
          <p className="pricing-contract-note">電子契約・請求書払い／月額料金は毎月前払い</p>
        </article>
      </section>

      <section className="pricing-section" aria-labelledby="features-title">
        <div className="pricing-section-heading">
          <p className="eyebrow">ALL FEATURES INCLUDED</p>
          <h2 id="features-title">追加料金を気にせず、すべての機能を。</h2>
          <p>複数プランを比較したり、必要な機能を諦めたりする必要はありません。</p>
        </div>
        <div className="pricing-feature-grid">
          {featureGroups.map((group) => (
            <article className="pricing-feature-card" key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-section pricing-value-section" aria-labelledby="value-title">
        <div>
          <p className="eyebrow">ONE COMPANY, ONE CONTRACT</p>
          <h2 id="value-title">店舗が増えても、チームが増えても、月額はそのまま。</h2>
        </div>
        <div className="pricing-value-points">
          <article><strong>10店舗でも</strong><span>店舗追加料金なし</span></article>
          <article><strong>50人でも</strong><span>ユーザー追加料金なし</span></article>
          <article><strong>毎日のAI活用も</strong><span>通常業務なら利用上限なし</span></article>
        </div>
      </section>

      <section className="pricing-section" aria-labelledby="start-title">
        <div className="pricing-section-heading">
          <p className="eyebrow">HOW TO START</p>
          <h2 id="start-title">ご利用開始まで</h2>
        </div>
        <ol className="pricing-step-grid">
          {startSteps.map(([number, title, body]) => (
            <li key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{body}</p></div>
            </li>
          ))}
        </ol>
        <p className="pricing-payment-note">
          月額料金は請求書発行日から10日以内に銀行振込でお支払いいただきます。契約期間や途中解約などの詳細は、電子契約書と
          <Link href="/terms">利用規約</Link>でご確認いただけます。
        </p>
      </section>

      <section className="pricing-final-cta">
        <div>
          <p className="eyebrow">START AIO BOOST</p>
          <h2>AIに選ばれる店舗づくりを、今日から。</h2>
          <p>まずは現在のお悩みや店舗数をお聞かせください。</p>
        </div>
        <Link className="button" href="/apply">導入相談・利用申し込みへ</Link>
      </section>
    </main>
  );
}
