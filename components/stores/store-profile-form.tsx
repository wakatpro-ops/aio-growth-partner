import { getIndustryConfig } from "@/config/industries";
import { resolveFeatureFlags } from "@/lib/feature-flags/resolve-feature-flags";
import type { Store } from "@/types/domain";

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
            <option value="auto_repair">自動車修理</option>
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
        <h3>有効な機能</h3>
        <p>Instagram投稿のような業態によって不要な機能は、削除ではなく feature_flags で制御します。</p>
        <div className="grid cols-3">
          {Object.entries(flags).map(([key, enabled]) => (
            <span className="badge" key={key}>
              {key}: {enabled ? "ON" : "OFF"}
            </span>
          ))}
        </div>
      </section>
      <button className="button" type="button">
        保存
      </button>
    </form>
  );
}
