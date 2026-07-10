import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { createStoreAction } from "../actions";

export default async function NewStorePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AppShell>
      <PageHeader
        title="店舗追加"
        description="実店舗として使う最初の店舗を登録します。デモ店舗とは分けて本番データとして管理されます。"
        action={<Link className="button secondary" href="/onboarding">導入手順を見る</Link>}
      />
      {error ? <p className="notice danger">{decodeURIComponent(error)}</p> : null}
      <form className="card form" action={createStoreAction}>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="name">店舗名</label>
            <input id="name" name="name" required placeholder="例: 佐藤オート整備" />
          </div>
          <div className="field">
            <label htmlFor="industry_type_key">業態</label>
            <select id="industry_type_key" name="industry_type_key" defaultValue="general_store">
              <option value="general_store">汎用店舗</option>
              <option value="auto_repair">自動車修理</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="address">住所</label>
            <input id="address" name="address" placeholder="例: 神奈川県横浜市..." />
          </div>
          <div className="field">
            <label htmlFor="phone">電話番号</label>
            <input id="phone" name="phone" placeholder="例: 045-..." />
          </div>
          <div className="field">
            <label htmlFor="website_url">公式サイト</label>
            <input id="website_url" name="website_url" placeholder="https://..." />
          </div>
          <div className="field">
            <label htmlFor="google_business_url">GoogleビジネスプロフィールURL</label>
            <input id="google_business_url" name="google_business_url" placeholder="https://business.google.com/..." />
          </div>
          <div className="field">
            <label htmlFor="target_customer">主な顧客</label>
            <input id="target_customer" name="target_customer" placeholder="近隣住民、法人顧客、リピーターなど" />
          </div>
          <div className="field">
            <label htmlFor="brand_tone">投稿・案内のトーン</label>
            <input id="brand_tone" name="brand_tone" placeholder="親しみやすい、専門的、信頼感重視など" />
          </div>
          <div className="field">
            <label htmlFor="services">主な商品・サービス</label>
            <textarea id="services" name="services" placeholder="車検、点検、オイル交換 / カット、カラー / ランチ、テイクアウト など" />
          </div>
          <div className="field">
            <label htmlFor="reservation_method">予約・問い合わせ方法</label>
            <input id="reservation_method" name="reservation_method" placeholder="電話、Web、LINE、Google予約など" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">店舗説明</label>
          <textarea id="description" name="description" placeholder="地域のお客様に向けた説明、強み、対応範囲を書いてください。" />
        </div>
        <label className="field checkbox-row">
          <input type="checkbox" name="use_sample_data" value="yes" />
          初期説明用のサンプルデータを参考にしながら設定する
        </label>
        <div className="notice">
          <strong>保存後の流れ</strong>
          <p>請求書設定、Google接続状態、最初に見る画面をオンボーディングで確認します。</p>
        </div>
        <button className="button" type="submit">店舗を作成</button>
      </form>
    </AppShell>
  );
}
