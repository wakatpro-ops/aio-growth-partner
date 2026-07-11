import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { betaCautions, betaManualOrPlannedFeatures, betaReadyFeatures } from "@/lib/mvp/release-prep";

const firstSetupChecklist = [
  "店舗名",
  "業態",
  "請求書情報",
  "登録番号",
  "顧客登録",
  "商品/サービス登録",
  "見積作成",
  "請求作成",
  "PDF出力",
  "入金登録",
  "freee CSV出力",
  "Stripe決済URL登録",
  "Gmail接続",
  "Googleカレンダー接続",
  "SNS手動投稿支援",
  "AI月次レポート",
  "AI集客アクション"
];

const dailyFlow = [
  { title: "見積から請求まで", body: "顧客と商品/サービスを登録し、見積書、受注、請求書、PDF、入金までを順番に確認します。" },
  { title: "売上の整理", body: "レジや販売管理ツールからCSV / Excelを出し、AIOに取り込んで売上一覧とレポートを確認します。" },
  { title: "集客の実行", body: "AI月次レポートや集客アクションを見て、Gmail下書き、Googleカレンダー予定、SNS投稿文を作ります。" },
  { title: "会計の受け渡し", body: "freee向けCSVを出力し、店舗側の会計処理へ渡します。API自動送信は次フェーズです。" }
];

const manualSteps = [
  { title: "ログインする", body: "案内されたURLからログインし、ダッシュボードまたは初回導入画面を開きます。" },
  { title: "店舗を作る", body: "店舗管理から実店舗を追加します。デモ店舗ではなく、自社の店舗名と業態を設定します。" },
  { title: "顧客を登録する", body: "顧客管理で顧客名、連絡先、メモを登録します。自動車修理では車両情報も意識して入力します。" },
  { title: "商品/サービスを登録する", body: "商品、部品、サービス名、価格、在庫に関係する情報を登録します。" },
  { title: "見積書を作る", body: "見積画面で顧客、見積番号、金額、有効期限、備考を入力して保存します。" },
  { title: "請求書を作る", body: "請求画面で請求番号、取引日、税率、支払期限、備考を確認して保存します。" },
  { title: "PDFを出す", body: "見積書または請求書の詳細画面からPDF出力を開き、内容を確認して保存します。" },
  { title: "入金を登録する", body: "入金画面または請求書詳細から、入金日、支払方法、入金額を登録します。" },
  { title: "売上データを取り込む", body: "CSV / Excelをアップロードし、列マッピングとプレビューを確認してから取り込みます。" },
  { title: "月次レポートを見る", body: "売上レポートまたはAI月次レポートで、売上、商品別傾向、注意点を確認します。" },
  { title: "AI集客アクションを作る", body: "集客アクション画面で、Google投稿案、SNS投稿案、案内文、POP文を生成します。" },
  { title: "Gmail下書きを作る", body: "Google接続済みの場合、送信前確認画面からGmail下書きを作成します。送信はGmail側で確認して行います。" },
  { title: "Googleカレンダー予定を作る", body: "送信前確認画面からGoogleカレンダー予定を作成し、Google側の予定も確認します。" },
  { title: "SNS投稿文をコピーして使う", body: "SNS投稿支援画面で媒体別の文体、ハッシュタグ、CTAを確認し、投稿先へ手動で貼り付けます。" },
  { title: "freee向けCSVを出す", body: "会計CSV出力画面でfreee向けCSVを作成し、出力履歴とファイル内容を確認します。" }
];

const supportChecks = [
  "発生画面URL",
  "操作内容",
  "表示されたエラー",
  "スクリーンショット",
  "店舗名",
  "発生日時",
  "期待していた動作",
  "実際の動作",
  "急ぎ度"
];

const adminNotes = [
  "新規店舗作成後は、デモ店舗ではなく実店舗として表示されているか確認します。",
  "店舗名、業態、請求書設定、登録番号、顧客、商品/サービスが入っているか確認します。",
  "Google接続はGmail下書きとGoogleカレンダー予定作成まで確認します。",
  "Google Business ProfileはAPI自動投稿ではなく、手動投稿支援モードとして説明します。",
  "Stripeは店舗側の決済URL手動登録モードです。AIO運営側の月額課金とは分けて説明します。",
  "freeeはCSV出力モードです。API自動送信は未対応です。",
  "AI利用状況、CSV取込履歴、外部連携ログ、audit_logsを管理者画面で確認します。",
  "SQL追加が必要なフェーズでは、差分SQLをSupabase SQL Editorで実行し、既存データを消さないことを確認します。",
  "Vercelは最新コミットのデプロイ状態、Supabaseはテーブル/RLS/Storage、GitHubはmain反映を確認します。"
];

export default function BetaOnboardingPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="β導入パッケージ"
        title="実店舗向け導入ガイド"
        description="店舗オーナー、店長、事務担当者がAIO Growth Partnerをβ版として使い始めるための説明ページです。"
        action={<Link className="button" href="/onboarding">初回導入へ</Link>}
      />

      <section className="grid cols-3">
        <article className="card">
          <p className="muted">最初に見る画面</p>
          <h2>初回導入</h2>
          <p>店舗作成から請求、入金、Google連携、集客支援まで順番に進めます。</p>
          <Link className="button secondary" href="/onboarding">開く</Link>
        </article>
        <article className="card">
          <p className="muted">日常で使う入口</p>
          <h2>店舗管理</h2>
          <p>顧客、商品、見積、請求、入金、売上、集客アクションを店舗ごとに確認します。</p>
          <Link className="button secondary" href="/stores">開く</Link>
        </article>
        <article className="card">
          <p className="muted">伴走担当者向け</p>
          <h2>βリリース運用</h2>
          <p>店舗状態、外部連携、AI利用、CSV取込、操作ログを管理者が確認します。</p>
          <Link className="button secondary" href="/admin/beta-release">開く</Link>
        </article>
      </section>

      <section className="card">
        <h2>導入申し込みから利用開始まで</h2>
        <ol className="compact-list">
          <li>広告用ランディングページや紹介導線から、公開申し込みフォームへ進みます。</li>
          <li>AIO運営側がオンライン説明・営業を行います。</li>
          <li>契約意思確認後、AIO運営側が請求書を発行します。</li>
          <li>入金確認後、管理者が申し込みを承認します。</li>
          <li>承認後、ログイン案内または招待リンクを発行します。</li>
          <li>ユーザーはログイン後、初回オンボーディングから店舗設定を進めます。</li>
        </ol>
        <p className="notice">申し込みだけで自動的に利用開始にはなりません。MVP期間中のAIO利用料は請求書ベースで運用します。</p>
      </section>

      <section className="grid cols-2">
        <article className="card">
          <h2>AIO Growth Partnerでできること</h2>
          <div className="grid">
            {betaReadyFeatures.map((feature) => <span className="badge badge-strong" key={feature}>{feature}</span>)}
          </div>
        </article>
        <article className="card">
          <h2>手動運用 / 準備中のこと</h2>
          <div className="grid">
            {betaManualOrPlannedFeatures.map((feature) => <span className="badge" key={feature}>{feature}</span>)}
          </div>
        </article>
      </section>

      <section className="card">
        <h2>最初にやること</h2>
        <ol className="compact-list">
          <li>ログイン後、実店舗を作成します。</li>
          <li>業態、店舗情報、請求書情報、登録番号を確認します。</li>
          <li>顧客と商品/サービスを1件以上登録します。</li>
          <li>見積書、請求書、PDF出力、入金登録を1回ずつ試します。</li>
          <li>Stripe決済URL手動登録、freee向けCSV出力、Google/Gmail/Calendar接続を確認します。</li>
          <li>売上CSV / Excel取り込み、AI月次レポート、AI集客アクションを確認します。</li>
        </ol>
      </section>

      <section className="card">
        <h2>日常業務で使う流れ</h2>
        <div className="grid cols-2">
          {dailyFlow.map((item) => (
            <article className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>初期設定チェックリスト</h2>
        <table className="table">
          <tbody>
            {firstSetupChecklist.map((item) => (
              <tr key={item}>
                <th>{item}</th>
                <td><span className="badge">導入時に確認</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>店舗ユーザー向け簡易マニュアル</h2>
        <div className="grid cols-2">
          {manualSteps.map((step) => (
            <article className="card" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>β版の注意事項</h2>
        <ul className="compact-list">
          {betaCautions.map((caution) => <li key={caution}>{caution}</li>)}
          <li>β版のため、一部画面や文言は伴走しながら改善します。</li>
          <li>重要データは定期的に確認し、必要に応じてCSVやPDFで控えてください。</li>
          <li>Gmail下書きやGoogleカレンダー予定は、Google側でも内容を確認してから運用してください。</li>
        </ul>
        <div className="button-row">
          <Link className="button secondary" href="/terms">利用規約</Link>
          <Link className="button secondary" href="/privacy">プライバシーポリシー</Link>
          <Link className="button secondary" href="/beta-notes">β版の注意事項</Link>
          <Link className="button secondary" href="/help">操作方法</Link>
        </div>
      </section>

      <section className="card">
        <h2>不具合報告テンプレート</h2>
        <p className="muted">困ったときは、以下を分かる範囲で伴走担当者へ送ってください。</p>
        <table className="table">
          <tbody>
            {supportChecks.map((item) => (
              <tr key={item}>
                <th>{item}</th>
                <td>記入してください</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>管理者向けβ運用メモ</h2>
        <ul className="compact-list">
          {adminNotes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>
    </AppShell>
  );
}
