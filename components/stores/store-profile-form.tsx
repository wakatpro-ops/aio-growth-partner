import { getIndustryConfig } from "@/config/industries";
import { publicIndustryOptions } from "@/lib/applications/options";
import { resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import type { Store } from "@/types/domain";

const featureLabels = [
  { key: "invoice_compliance", label: "請求書・入金管理" },
  { key: "data_imports", label: "売上データ取り込み" },
  { key: "sales_ai_report", label: "AI月次レポート" },
  { key: "growth_action_center", label: "集客アクション" },
  { key: "google_integrations", label: "Google連携" },
  { key: "monthly_report", label: "月次レポート" }
];

export function StoreProfileForm({ store }: { store: Store }) {
  const industry = getIndustryConfig(store.industry_type_key);
  const flags = resolveFeatureFlags(store);

  return (
    <form className="form">
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="name">店舗名</label>
          <input id="name" name="name" defaultValue={store.name} />
        </div>
        <div className="field">
          <label htmlFor="industry">業態</label>
          <select id="industry" name="industry" defaultValue={store.industry_type_key}>
            <option value="general_store">汎用店舗</option>
            {publicIndustryOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="address">住所</label>
          <input id="address" name="address" defaultValue={store.address} />
        </div>
        <div className="field">
          <label htmlFor="phone">電話番号</label>
          <input id="phone" name="phone" defaultValue={store.phone} />
        </div>
        <div className="field">
          <label htmlFor="website">Webサイト</label>
          <input id="website" name="website" defaultValue={store.website_url} />
        </div>
        <div className="field">
          <label htmlFor="gbp">GoogleビジネスプロフィールURL</label>
          <input id="gbp" name="gbp" defaultValue={store.google_business_url} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="description">{industry.profileLabel}の説明</label>
        <textarea id="description" name="description" defaultValue={store.description} />
      </div>
      <div className="grid cols-2">
        {industry.profileFields.map((field) => {
          const value = store.profile_data[field.key];
          if (field.type === "boolean") {
            return (
              <div className="field" key={field.key}>
                <label htmlFor={field.key}>{field.label}</label>
                <select id={field.key} name={field.key} defaultValue={value ? "true" : "false"}>
                  <option value="true">はい</option>
                  <option value="false">いいえ</option>
                </select>
              </div>
            );
          }

          return (
            <div className="field" key={field.key}>
              <label htmlFor={field.key}>{field.label}</label>
              {field.type === "textarea" || field.type === "list" ? (
                <textarea
                  id={field.key}
                  name={field.key}
                  placeholder={field.placeholder}
                  defaultValue={Array.isArray(value) ? value.join("、") : String(value ?? "")}
                />
              ) : (
                <input id={field.key} name={field.key} placeholder={field.placeholder} defaultValue={String(value ?? "")} />
              )}
            </div>
          );
        })}
      </div>
      <section className="card">
        <h3>この店舗で使える主な機能</h3>
        <p>業態や利用状況に合わせて、日常業務と集客支援に使う機能を表示しています。</p>
        <div className="grid cols-3">
          {featureLabels.map((feature) => <span className="badge" key={feature.key}>{feature.label}: {flags[feature.key] ? "利用可" : "未設定"}</span>)}
        </div>
      </section>
    </form>
  );
}
