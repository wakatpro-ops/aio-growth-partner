"use client";

import { useActionState, useMemo, useState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { InitialSetupReview } from "@/lib/onboarding/initial-setup";
import { confirmInitialSetupAction, type InitialSetupActionState } from "./actions";

const initialState: InitialSetupActionState = { ok: false, message: "" };

export function InitialSetupReviewForm({ review }: { review: InitialSetupReview }) {
  const action = confirmInitialSetupAction.bind(null, review.store.id);
  const [state, formAction] = useActionState(action, initialState);
  const [selectedIndustry, setSelectedIndustry] = useState<string>(review.store.industry_type_key);
  const [enabledMenus, setEnabledMenus] = useState(() => review.menus.map(() => true));
  const preset = review.industryPresets[selectedIndustry] ?? { dashboardCards: [], recommendedFeatures: [] };
  const selectedCount = useMemo(() => enabledMenus.filter(Boolean).length, [enabledMenus]);
  const showReducedTax = selectedIndustry === "restaurant" || selectedIndustry === "retail";

  function setAll(enabled: boolean) {
    setEnabledMenus(review.menus.map(() => enabled));
  }

  function setMenu(index: number, enabled: boolean) {
    setEnabledMenus((current) => current.map((value, currentIndex) => currentIndex === index ? enabled : value));
  }

  return (
    <form className="stack" action={formAction}>
      {state.message ? <p className="notice danger" role="alert">{state.message}</p> : null}

      <section className="card form">
        <div className="section-heading">
          <div><p className="step-label">1 / 4</p><h2>店舗情報を確認</h2></div>
          <span className="badge">編集できます</span>
        </div>
        <p className="muted">AIが公開URLから読み取った内容です。違う部分だけ直してください。</p>
        <div className="grid cols-2">
          <div className="field"><label htmlFor="store_name">店舗名</label><input id="store_name" name="store_name" defaultValue={review.store.name} required /></div>
          <div className="field">
            <label htmlFor="industry_type_key">業種・業態</label>
            <select id="industry_type_key" name="industry_type_key" value={selectedIndustry} onChange={(event) => setSelectedIndustry(event.target.value)}>
              {review.industryOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="address">住所</label><input id="address" name="address" defaultValue={review.store.address ?? ""} /></div>
          <div className="field"><label htmlFor="phone">電話番号</label><input id="phone" name="phone" defaultValue={review.store.phone ?? ""} /></div>
          <div className="field"><label htmlFor="website_url">店舗サイト</label><input id="website_url" name="website_url" type="url" defaultValue={review.store.website_url ?? ""} /></div>
        </div>
        <div className="field"><label htmlFor="description">店舗の特徴・説明</label><textarea id="description" name="description" defaultValue={review.store.description ?? ""} /></div>
      </section>

      <section className="card form">
        <div className="section-heading">
          <div><p className="step-label">2 / 4</p><h2>メニュー候補を確認</h2></div>
          <span className="badge">{selectedCount}件を登録予定</span>
        </div>
        <p className="muted">確定するまでは正式なメニューに登録されません。不要な候補は「除外する」にしてください。</p>
        {review.menus.length ? (
          <>
            <div className="button-row">
              <button className="button secondary" type="button" onClick={() => setAll(true)}>すべて登録する</button>
              <button className="button secondary" type="button" onClick={() => setAll(false)}>すべて除外する</button>
            </div>
            <div className="stack">
              {review.menus.map((menu, index) => {
                const enabled = enabledMenus[index];
                return (
                  <article className={enabled ? "static-card" : "static-card setup-candidate-excluded"} key={menu.index}>
                    <div className="section-heading">
                      <h3>候補 {index + 1}</h3>
                      <label className="check-row">
                        <input type="checkbox" name={`menu_enabled_${index}`} checked={enabled} onChange={(event) => setMenu(index, event.target.checked)} />
                        {enabled ? "登録する" : "除外する"}
                      </label>
                    </div>
                    <div className="grid cols-3">
                      <div className="field"><label htmlFor={`menu_name_${index}`}>名称</label><input id={`menu_name_${index}`} name={`menu_name_${index}`} defaultValue={menu.name} disabled={!enabled} required={enabled} /></div>
                      <div className="field"><label htmlFor={`menu_type_${index}`}>種類</label><select id={`menu_type_${index}`} name={`menu_type_${index}`} defaultValue={menu.itemType} disabled={!enabled}><option value="service">サービス</option><option value="product">商品</option><option value="part">材料・備品</option></select></div>
                      <div className="field"><label htmlFor={`menu_unit_price_${index}`}>税込・税抜を選ぶ価格</label><input id={`menu_unit_price_${index}`} name={`menu_unit_price_${index}`} type="number" min="0" step="1" defaultValue={menu.unitPrice} disabled={!enabled} /></div>
                      <div className="field"><label htmlFor={`menu_tax_inclusion_${index}`}>価格表示</label><select id={`menu_tax_inclusion_${index}`} name={`menu_tax_inclusion_${index}`} defaultValue={menu.taxInclusion} disabled={!enabled}><option value="inclusive">税込（内税）</option><option value="exclusive">税抜（外税）</option></select></div>
                      <div className="field"><label htmlFor={`menu_tax_rate_${index}`}>消費税率</label><select id={`menu_tax_rate_${index}`} name={`menu_tax_rate_${index}`} defaultValue={String(menu.taxRate)} disabled={!enabled}><option value="10">10%</option>{showReducedTax ? <option value="8">8%（対象商品のみ）</option> : null}<option value="0">0%（非課税）</option></select></div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : <p className="notice">メニュー候補は取得できませんでした。利用開始後に「商品・サービス」から登録できます。</p>}
      </section>

      <section className="card form">
        <div className="section-heading"><div><p className="step-label">3 / 4</p><h2>請求書情報を確認</h2></div><span className="badge">不明な部分だけ入力</span></div>
        <p className="muted">登録番号や税区分はAIが推測しません。分からない場合、登録番号は空欄のまま開始できます。</p>
        <div className="grid cols-2">
          <div className="field"><label htmlFor="invoice_issuer_name">請求書に表示する事業者名</label><input id="invoice_issuer_name" name="invoice_issuer_name" defaultValue={review.invoice.issuerName} required /></div>
          <div className="field"><label htmlFor="invoice_registration_number">適格請求書発行事業者の登録番号</label><input id="invoice_registration_number" name="invoice_registration_number" placeholder="T1234567890123" defaultValue={review.invoice.registrationNumber} /></div>
          <div className="field"><label htmlFor="invoice_prefix">請求書番号の先頭文字</label><input id="invoice_prefix" name="invoice_prefix" pattern="[A-Za-z0-9-]+" defaultValue={review.invoice.prefix} required /></div>
          <div className="static-card compact"><span>請求書の住所</span><strong>上の店舗住所を使用します</strong></div>
        </div>
      </section>

      <section className="card">
        <div className="section-heading"><div><p className="step-label">4 / 4</p><h2>管理画面の構成を確認</h2></div><span className="badge">{review.industryOptions.find((item) => item.key === selectedIndustry)?.label ?? selectedIndustry}向け</span></div>
        <p>選択した業種に合わせて、名称、AIの考え方、表示する主な機能を整えます。利用開始後も店舗設定から業種を変更できます。</p>
        <h3>最初に表示する内容</h3>
        <div className="grid cols-3">{preset.dashboardCards.map((card) => <article className="static-card" key={card.key}><strong>{card.label}</strong></article>)}</div>
        <h3>利用できる主な機能</h3>
        <div className="button-row setup-feature-list">{preset.recommendedFeatures.map((feature) => <span className="badge" key={feature}>{feature}</span>)}</div>
      </section>

      <section className="card setup-confirm-panel">
        <h2>確認した内容で利用を開始します</h2>
        <p>店舗情報と請求書設定を反映し、選択したメニュー候補だけを正式登録します。AIが読み取った原本は確認履歴として残ります。</p>
        <label className="check-row"><input type="checkbox" name="final_confirmation" required />上記の内容を確認し、正式データへ反映することに同意します</label>
        <div className="button-row">
          <PendingSubmitButton pendingLabel="初期設定を反映しています...">この内容で利用を開始する</PendingSubmitButton>
          <a className="button secondary" href={`/onboarding?storeId=${review.store.id}`}>まだ確定せず戻る</a>
        </div>
      </section>
    </form>
  );
}
