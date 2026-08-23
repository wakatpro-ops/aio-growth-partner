"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { InitialSetupReview } from "@/lib/onboarding/initial-setup";
import { confirmInitialSetupAction, saveInitialSetupDraftAction, type InitialSetupActionState } from "./actions";

const initialState: InitialSetupActionState = { ok: false, message: "" };
const systemLabels: Record<string, string> = { sales: "売上", reservations: "予約", customers: "顧客", inventory: "在庫", accounting: "会計" };
const authorityLabels: Record<string, string> = { aio_boost: "AIO boostで管理", external: "既存システムを正本にする", file_import: "CSV・Excel取込で連携", not_managed: "管理しない" };
const reservationLabels: Record<string, string> = { external: "既存の予約サービスを使う", manual: "電話・LINE・紙などで管理する", not_managed: "予約管理は使わない", undecided: "後で決める", aio_boost: "AIO boost予約管理（準備中）", file_import: "CSV・Excel取込で連携" };
const structureLabels: Record<string, string> = { single_store: "1法人・1ブランド・1店舗", multi_store: "同じ法人・ブランドで複数店舗", multi_brand: "同じ法人で複数ブランド・店舗", multi_company: "複数法人" };
const registerLabels: Record<string, string> = { external_pos: "既存のPOS・レジを使う", file_import: "CSV・Excelで売上を取り込む", simple_register: "AIO boost簡易レジ（準備中）", not_needed: "レジは使わない", undecided: "後で決める" };

type MenuDraft = { index: number; enabled: boolean; name: string; itemType: "product" | "part" | "service"; unitPrice: number; taxRate: 0 | 8 | 10; taxInclusion: "inclusive" | "exclusive" };
type StoreDraft = { name: string; industry: string; address: string; phone: string; website: string; description: string };
type InvoiceDraft = { issuerName: string; registrationNumber: string; prefix: string };

function hostname(urlValue: string) {
  try { return new URL(urlValue).hostname.replace(/^www\./u, ""); } catch { return "公開ページ"; }
}

export function InitialSetupReviewForm({ review }: { review: InitialSetupReview }) {
  const action = confirmInitialSetupAction.bind(null, review.store.id);
  const saveDraftAction = saveInitialSetupDraftAction.bind(null, review.store.id);
  const [state, formAction] = useActionState(action, initialState);
  const chatRef = useRef<HTMLFormElement>(null);
  const draft = review.savedDraft;
  const draftOperatingModel = draft?.operatingModel ?? review.operatingModel;
  const [currentStep, setCurrentStep] = useState(review.savedDraftStep);
  const [skipped, setSkipped] = useState<string[]>(review.savedSkippedSteps);
  const [showMenuEditor, setShowMenuEditor] = useState(false);
  const [structureMode, setStructureMode] = useState(draftOperatingModel.structure.mode);
  const [systemAuthorities, setSystemAuthorities] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(draftOperatingModel.systems).map(([key, value]) => [key, key === "reservations" && value.authority === "aio_boost" ? "undecided" : value.authority])));
  const [registerMode, setRegisterMode] = useState<InitialSetupReview["operatingModel"]["register"]["mode"]>(draftOperatingModel.register.mode === "simple_register" ? "undecided" : draftOperatingModel.register.mode);
  const [serviceMode, setServiceMode] = useState(draftOperatingModel.operations.serviceMode);
  const [resources] = useState<string[]>(draftOperatingModel.operations.reservationResources);
  const [sharing, setSharing] = useState<Record<string, string>>({ ...draftOperatingModel.sharing });
  const [locations, setLocations] = useState(() => draft ? draft.additionalLocations.map((location) => ({ ...location, enabled: true })) : review.additionalLocations.map((location) => ({ ...location, enabled: true })));
  const [store, setStore] = useState<StoreDraft>({ name: draft?.storeName ?? review.store.name, industry: draft?.industryTypeKey ?? review.store.industry_type_key, address: draft?.address ?? review.store.address ?? "", phone: draft?.phone ?? review.store.phone ?? "", website: draft?.websiteUrl ?? review.store.website_url ?? "", description: draft?.description ?? review.store.description ?? "" });
  const [menus, setMenus] = useState<MenuDraft[]>(() => review.menus.map((menu, index) => ({ ...menu, ...(draft?.menus[index] ?? {}), enabled: draft?.menus[index]?.enabled ?? true })));
  const [invoice, setInvoice] = useState<InvoiceDraft>({ issuerName: draft?.invoiceIssuerName ?? review.invoice.issuerName, registrationNumber: draft?.invoiceRegistrationNumber ?? review.invoice.registrationNumber, prefix: draft?.invoicePrefix ?? review.invoice.prefix });
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const selectedPreset = review.industryPresets[store.industry] ?? { dashboardCards: [], recommendedFeatures: [] };
  const selectedMenus = menus.filter((menu) => menu.enabled);
  const detectedReservationSystems = review.operatingModel.systems.reservations.serviceNames;
  const questionCount = 7;

  const preparedItems = useMemo(() => [
    `店舗情報を${review.preparedSummary.storeFieldCount}項目準備しました`,
    review.preparedSummary.menuCount ? `メニュー・サービスを${review.preparedSummary.menuCount}件抽出しました` : "メニューは利用開始後に追加できます",
    `店舗に合う主な機能を${review.preparedSummary.featureCount}件選びました`,
    review.preparedSummary.externalSystemCount ? `利用中の外部システムを${review.preparedSummary.externalSystemCount}種類確認しました` : "既存システムと衝突しない設定を準備しました",
    review.preparedSummary.additionalLocationCount ? `追加店舗候補を${review.preparedSummary.additionalLocationCount}件確認しました` : "現在は1店舗として準備しています"
  ], [review]);

  function goTo(step: number) {
    setCurrentStep(Math.min(Math.max(step, 0), 8));
    window.setTimeout(() => chatRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  function choose<T>(setter: (value: T) => void, value: T) {
    setter(value);
    window.setTimeout(() => goTo(currentStep + 1), 180);
  }

  function skip(stepKey: string, onSkip?: () => void) {
    onSkip?.();
    setSkipped((items) => Array.from(new Set([...items, stepKey])));
    goTo(currentStep + 1);
  }

  function setMenu(index: number, patch: Partial<MenuDraft>) {
    setMenus((current) => current.map((menu, menuIndex) => menuIndex === index ? { ...menu, ...patch } : menu));
  }

  function setLocation(index: number, patch: Partial<(typeof locations)[number]>) {
    setLocations((current) => current.map((location, locationIndex) => locationIndex === index ? { ...location, ...patch } : location));
  }

  const importAnswer = review.dataImport.status === "completed" ? `既存データを${review.dataImport.successRows}件取り込み済み` : review.dataImport.jobId ? "既存データの解析・確認を継続中" : "既存データは手入力または後で取り込む";
  const answered = [structureLabels[structureMode], reservationLabels[systemAuthorities.reservations], registerLabels[registerMode], `${store.name}の店舗情報`, importAnswer, `${selectedMenus.length}件のメニュー`, `${invoice.issuerName}の請求書設定`];

  return (
    <form className="setup-conversation" action={formAction} ref={chatRef}>
      {state.message ? <p className="notice danger" role="alert">{state.message}</p> : null}
      {draft ? <p className="notice success" role="status">途中保存した内容から再開しています。</p> : null}

      <input type="hidden" name="conversation_step" value={currentStep} />
      <input type="hidden" name="skipped_steps" value={skipped.join(",")} />
      <input type="hidden" name="structure_mode" value={structureMode} />
      {Object.entries(systemAuthorities).map(([key, value]) => <input key={key} type="hidden" name={`system_${key}`} value={value} />)}
      <input type="hidden" name="register_mode" value={registerMode} /><input type="hidden" name="service_mode" value={serviceMode} />
      {resources.map((key) => <input key={key} type="hidden" name={`resource_${key}`} value="on" />)}
      {Object.entries(sharing).map(([key, value]) => <input key={key} type="hidden" name={`sharing_${key}`} value={value} />)}
      {locations.map((location, index) => <span key={`${location.name}-${index}`} className="setup-hidden-data">{location.enabled ? <input type="hidden" name={`location_enabled_${index}`} value="on" /> : null}<input type="hidden" name={`location_name_${index}`} value={location.name} /><input type="hidden" name={`location_brand_${index}`} value={location.brandName} /><input type="hidden" name={`location_company_${index}`} value={location.companyName} /><input type="hidden" name={`location_address_${index}`} value={location.address} /><input type="hidden" name={`location_website_${index}`} value={location.websiteUrl} /></span>)}
      <input type="hidden" name="store_name" value={store.name} /><input type="hidden" name="industry_type_key" value={store.industry} /><input type="hidden" name="address" value={store.address} /><input type="hidden" name="phone" value={store.phone} /><input type="hidden" name="website_url" value={store.website} /><input type="hidden" name="description" value={store.description} />
      {menus.map((menu, index) => <span key={menu.index} className="setup-hidden-data">{menu.enabled ? <input type="hidden" name={`menu_enabled_${index}`} value="on" /> : null}<input type="hidden" name={`menu_name_${index}`} value={menu.name} /><input type="hidden" name={`menu_type_${index}`} value={menu.itemType} /><input type="hidden" name={`menu_unit_price_${index}`} value={menu.unitPrice} /><input type="hidden" name={`menu_tax_rate_${index}`} value={menu.taxRate} /><input type="hidden" name={`menu_tax_inclusion_${index}`} value={menu.taxInclusion} /></span>)}
      <input type="hidden" name="invoice_issuer_name" value={invoice.issuerName} /><input type="hidden" name="invoice_registration_number" value={invoice.registrationNumber} /><input type="hidden" name="invoice_prefix" value={invoice.prefix} />
      {finalConfirmed ? <input type="hidden" name="final_confirmation" value="on" /> : null}

      {currentStep === 0 ? <Welcome review={review} preparedItems={preparedItems} onStart={() => goTo(1)} /> : null}

      {currentStep > 0 ? (
        <section className="setup-chat card">
          <header className="setup-chat-header"><div className="setup-ai-avatar" aria-hidden="true">AI</div><div><strong>AIO boost AIパートナー</strong><span>一問ずつ確認します</span></div><div className="setup-chat-progress"><span>質問 {Math.min(currentStep, questionCount)} / {questionCount}</span><div><i style={{ width: `${Math.min(currentStep, questionCount) / questionCount * 100}%` }} /></div></div></header>
          <div className="setup-chat-thread">
            {answered.slice(0, Math.max(0, currentStep - 1)).map((answer, index) => <div className="setup-chat-history" key={`${answer}-${index}`}><span>確認 {index + 1}</span><p>{answer}</p></div>)}
            {currentStep === 1 ? <StructureQuestion mode={structureMode} candidateCount={review.additionalLocations.length} onChoose={(value) => choose(setStructureMode, value)} /> : null}
            {currentStep === 2 ? <ReservationQuestion authority={systemAuthorities.reservations} detected={detectedReservationSystems} onChoose={(value) => choose((next: string) => setSystemAuthorities((items) => ({ ...items, reservations: next })), value)} /> : null}
            {currentStep === 3 ? <RegisterQuestion mode={registerMode} onChoose={(value) => choose(setRegisterMode, value)} /> : null}
            {currentStep === 4 ? <StoreQuestion review={review} value={store} onChange={setStore} onNext={() => goTo(5)} /> : null}
            {currentStep === 5 ? <DataImportQuestion review={review} onManual={() => goTo(6)} onLater={() => skip("data_import")} /> : null}
            {currentStep === 6 ? <MenuQuestion menus={menus} importedCount={review.dataImport.counts.item} showEditor={showMenuEditor} onToggleEditor={() => setShowMenuEditor((visible) => !visible)} onMenuChange={setMenu} onAcceptAll={() => { setMenus((items) => items.map((menu) => ({ ...menu, enabled: true }))); goTo(7); }} onNext={() => goTo(7)} /> : null}
            {currentStep === 7 ? <InvoiceQuestion value={invoice} onChange={setInvoice} onNext={() => goTo(8)} /> : null}
            {currentStep === 8 ? <FinalSummary structureMode={structureMode} systemAuthorities={systemAuthorities} setSystemAuthorities={setSystemAuthorities} registerMode={registerMode} serviceMode={serviceMode} setServiceMode={setServiceMode} sharing={sharing} setSharing={setSharing} locations={locations} setLocation={setLocation} store={store} dataImport={review.dataImport} selectedMenuCount={selectedMenus.length} featureCount={selectedPreset.recommendedFeatures.length} skippedCount={skipped.length} confirmed={finalConfirmed} setConfirmed={setFinalConfirmed} /> : null}
          </div>
          <footer className="setup-chat-actions">{currentStep > 1 ? <button className="button secondary" type="button" onClick={() => goTo(currentStep - 1)}>一つ前に戻る</button> : <button className="button secondary" type="button" onClick={() => goTo(0)}>準備内容へ戻る</button>}{currentStep <= questionCount ? <button className="button secondary" type="button" onClick={() => skip(["structure", "reservation", "register", "store", "data_import", "menus", "invoice"][currentStep - 1] ?? `step-${currentStep}`, currentStep === 6 ? () => setMenus((items) => items.map((menu) => ({ ...menu, enabled: false }))) : undefined)}>後で確認する</button> : null}<PendingSubmitButton className="button ghost" formAction={saveDraftAction} pendingLabel="途中保存しています...">途中保存して終了</PendingSubmitButton></footer>
        </section>
      ) : null}
    </form>
  );
}

function Welcome({ review, preparedItems, onStart }: { review: InitialSetupReview; preparedItems: string[]; onStart: () => void }) {
  return <section className="setup-welcome card"><div className="setup-ai-avatar" aria-hidden="true">AI</div><div className="setup-welcome-copy"><p className="eyebrow">AIO boost AIパートナー</p><h2>すでにここまで準備できています</h2><p>公開されている店舗情報をもとに、管理画面の土台を作りました。最初から入力する必要はありません。違うところと、公開情報だけでは分からなかったことを一緒に確認します。</p></div><ul className="setup-prepared-list">{preparedItems.map((item) => <li key={item}><span aria-hidden="true">✓</span><strong>{item}</strong></li>)}</ul><div className="setup-evidence"><div><p className="step-label">確認した公開情報</p><strong>{review.evidenceSources.length ? `${review.evidenceSources.length}件の情報源を初期設定に利用` : "申込時の店舗ページを初期設定に利用"}</strong></div>{review.evidenceSources.length ? <ul>{review.evidenceSources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label || hostname(source.url)} ↗</a></li>)}</ul> : null}<p className="muted">公開ページで確認できた事実とAIの推定を分け、推定した内容はこの後の会話で確認します。</p></div><div className="setup-ropeway"><strong>初期設定の土台は完成しています</strong><span>あと7つの確認で利用を開始できます</span><div><i /></div></div><button className="button setup-start-button" type="button" onClick={onStart}>AIと一緒に仕上げる</button></section>;
}

function StructureQuestion({ mode, candidateCount, onChoose }: { mode: InitialSetupReview["operatingModel"]["structure"]["mode"]; candidateCount: number; onChoose: (value: InitialSetupReview["operatingModel"]["structure"]["mode"]) => void }) {
  return <><div className="setup-bubble ai"><p>まず、店舗の構成を確認させてください。公開情報では「{structureLabels[mode]}」として準備しました。どれが近いですか？</p><small>{candidateCount ? `公開情報から追加店舗候補を${candidateCount}件確認しています。` : "複数店舗がある場合は、ここで教えてください。"}</small></div><div className="setup-choice-grid">{Object.entries(structureLabels).map(([value, label], index) => <button key={value} className={`setup-choice ${mode === value ? "selected" : ""}`} type="button" onClick={() => onChoose(value as InitialSetupReview["operatingModel"]["structure"]["mode"])}><span>{index + 1}</span>{label}</button>)}</div></>;
}

function ReservationQuestion({ authority, detected, onChoose }: { authority: string; detected: string[]; onChoose: (value: string) => void }) {
  const options = [["external", "既存の予約サービスを使う"], ["manual", "電話・LINE・紙などで管理する"], ["not_managed", "予約管理は使わない"], ["undecided", "後で決める"]];
  return <><div className="setup-bubble ai"><p>{detected.length ? `予約先として「${detected.join("、")}」を確認しました。` : "予約情報を管理する公開システムは確認できませんでした。"} 現在の予約受付方法を教えてください。</p><small>AIO boost内の予約管理は現在準備中です。今お使いの方法は変更せず、店舗に合う案内やデータ整理に活用します。</small></div><div className="setup-choice-grid">{options.map(([value, label], index) => <button key={value} className={`setup-choice ${authority === value ? "selected" : ""}`} type="button" onClick={() => onChoose(value)}><span>{index + 1}</span>{label}</button>)}</div></>;
}

function RegisterQuestion({ mode, onChoose }: { mode: InitialSetupReview["operatingModel"]["register"]["mode"]; onChoose: (value: InitialSetupReview["operatingModel"]["register"]["mode"]) => void }) {
  const options = [["external_pos", "既存のPOS・レジを使う"], ["file_import", "CSV・Excelで売上を取り込む"], ["not_needed", "レジは使わない"], ["undecided", "後で決める"]] as const;
  return <><div className="setup-bubble ai"><p>会計やレジについて教えてください。現在使っている仕組みはそのまま残せます。</p><small>AIO boost内の簡易レジは現在準備中です。CSV・Excelの売上データは「データ取り込み」から整理できます。</small></div><div className="setup-choice-grid">{options.map(([value, label], index) => <button key={value} className={`setup-choice ${mode === value ? "selected" : ""}`} type="button" onClick={() => onChoose(value)}><span>{index + 1}</span>{label}</button>)}</div></>;
}

function StoreQuestion({ review, value, onChange, onNext }: { review: InitialSetupReview; value: StoreDraft; onChange: (value: StoreDraft) => void; onNext: () => void }) {
  return <><div className="setup-bubble ai"><p>店舗情報は公開ページから入力済みです。違う部分だけ直してください。</p><small>この情報は店舗プロフィール、請求書、AIO改善の基本情報として活用します。</small></div><div className="setup-answer-form"><div className="grid cols-2"><label className="field">店舗名<input id="store_name_editor" value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label><label className="field">業種・業態<select id="industry_type_key_editor" value={value.industry} onChange={(event) => onChange({ ...value, industry: event.target.value })}>{review.industryOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><label className="field">住所<input id="address_editor" value={value.address} onChange={(event) => onChange({ ...value, address: event.target.value })} /></label><label className="field">電話番号<input id="phone_editor" value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} /></label><label className="field">店舗サイト<input id="website_url_editor" type="url" value={value.website} onChange={(event) => onChange({ ...value, website: event.target.value })} /></label></div><label className="field">店舗の特徴・説明<textarea id="description_editor" value={value.description} onChange={(event) => onChange({ ...value, description: event.target.value })} /></label><button className="button" type="button" onClick={onNext}>この店舗情報で進む</button></div></>;
}

function DataImportQuestion({ review, onManual, onLater }: { review: InitialSetupReview; onManual: () => void; onLater: () => void }) {
  const imported = review.dataImport.status === "completed";
  const counts = review.dataImport.counts;
  const labels: Array<[keyof typeof counts, string]> = [["sale", "売上"], ["expense", "経費"], ["customer", "顧客"], ["item", "商品・メニュー"], ["inventory", "在庫"]];
  if (imported) return <><div className="setup-bubble ai"><p>既存データの取り込みが完了しています。AIが分類し、確認済みの内容を各管理画面へ保存しました。</p><small>成功{review.dataImport.successRows}件、確認できなかった行{review.dataImport.errorRows}件です。元ファイルと確認履歴はデータ取り込み画面から確認できます。</small></div><div className="setup-import-summary">{labels.map(([key, label]) => <article key={key}><span>{label}</span><strong>{counts[key]}件</strong></article>)}</div><div className="setup-choice-grid"><button className="setup-choice" type="button" onClick={onManual}><span>1</span>取り込み結果を使って進む</button><Link className="setup-choice" href={`/stores/${review.store.id}/data-imports/ai/${review.dataImport.jobId}?onboarding=1`}><span>2</span>取り込み結果を確認する</Link></div></>;
  return <><div className="setup-bubble ai"><p>現在使っているメニュー表、商品一覧、在庫表、売上表、顧客一覧はありますか？</p><small>CSV・Excel・PDFをアップロードすると、AIが売上・経費・顧客・商品・在庫へ整理します。分からない項目だけ質問し、確認するまで正式保存しません。</small></div>{review.dataImport.jobId ? <p className="notice">途中まで解析したファイルがあります。続きから確認できます。</p> : null}<div className="setup-choice-grid"><Link className="setup-choice" href={review.dataImport.jobId ? `/stores/${review.store.id}/data-imports/ai/${review.dataImport.jobId}?onboarding=1` : `/stores/${review.store.id}/data-imports/ai?onboarding=1`}><span>1</span>{review.dataImport.jobId ? "解析の続きを確認する" : "ファイルを取り込む"}</Link><button className="setup-choice" type="button" onClick={onManual}><span>2</span>手入力で進める</button><button className="setup-choice" type="button" onClick={onLater}><span>3</span>後で取り込む</button></div></>;
}

function MenuQuestion({ menus, importedCount, showEditor, onToggleEditor, onMenuChange, onAcceptAll, onNext }: { menus: MenuDraft[]; importedCount: number; showEditor: boolean; onToggleEditor: () => void; onMenuChange: (index: number, patch: Partial<MenuDraft>) => void; onAcceptAll: () => void; onNext: () => void }) {
  return <><div className="setup-bubble ai"><p>{menus.length ? `公開情報からメニュー・サービスを${menus.length}件準備しました。` : "公開ページからメニューを十分に確認できませんでした。"}</p><small>{importedCount ? `ファイルから取り込んだ商品・メニュー${importedCount}件は保存済みです。同じ名前の候補は重複登録しません。` : "利用開始時に登録する内容だけを選べます。価格が不明な項目は0円のまま登録し、後から変更できます。"}</small></div>{menus.length ? <><ul className="setup-menu-preview">{menus.slice(0, 5).map((menu) => <li key={menu.index}><span>{menu.enabled ? "登録予定" : "後で確認"}</span><strong>{menu.name}</strong></li>)}</ul>{menus.length > 5 ? <p className="muted">ほか{menus.length - 5}件</p> : null}<div className="setup-choice-grid"><button className="setup-choice" type="button" onClick={onAcceptAll}><span>1</span>すべて登録して進む</button><button className="setup-choice" type="button" onClick={onToggleEditor}><span>2</span>内容を確認・編集する</button></div>{showEditor ? <div className="setup-menu-editor">{menus.map((menu, index) => <article className={menu.enabled ? "static-card" : "static-card setup-candidate-excluded"} key={menu.index}><label className="check-row"><input type="checkbox" checked={menu.enabled} onChange={(event) => onMenuChange(index, { enabled: event.target.checked })} />{menu.enabled ? "登録する" : "後で確認する"}</label><div className="grid cols-3"><label className="field">名称<input id={`menu_name_editor_${index}`} value={menu.name} onChange={(event) => onMenuChange(index, { name: event.target.value })} /></label><label className="field">価格<input id={`menu_unit_price_editor_${index}`} type="number" min="0" value={menu.unitPrice} onChange={(event) => onMenuChange(index, { unitPrice: Number(event.target.value) || 0 })} /></label><label className="field">価格表示<select value={menu.taxInclusion} onChange={(event) => onMenuChange(index, { taxInclusion: event.target.value as MenuDraft["taxInclusion"] })}><option value="inclusive">税込（内税）</option><option value="exclusive">税抜（外税）</option></select></label></div></article>)}<button className="button" type="button" onClick={onNext}>選んだメニューで進む</button></div> : null}</> : <button className="button" type="button" onClick={onNext}>利用開始後にメニューを登録する</button>}</>;
}

function InvoiceQuestion({ value, onChange, onNext }: { value: InvoiceDraft; onChange: (value: InvoiceDraft) => void; onNext: () => void }) {
  return <><div className="setup-bubble ai"><p>請求書の基本情報を準備しました。登録番号はAIが推測せず、空欄のままでも利用を開始できます。</p><small>請求書の住所には、先ほど確認した店舗住所を使用します。</small></div><div className="setup-answer-form"><div className="grid cols-2"><label className="field">請求書に表示する事業者名<input id="invoice_issuer_name_editor" value={value.issuerName} onChange={(event) => onChange({ ...value, issuerName: event.target.value })} /></label><label className="field">適格請求書発行事業者の登録番号<input id="invoice_registration_number_editor" placeholder="T1234567890123" value={value.registrationNumber} onChange={(event) => onChange({ ...value, registrationNumber: event.target.value })} /></label><label className="field">請求書番号の先頭文字<input id="invoice_prefix_editor" value={value.prefix} onChange={(event) => onChange({ ...value, prefix: event.target.value })} /></label></div><button className="button" type="button" onClick={onNext}>この請求書情報で進む</button></div></>;
}

type FinalLocation = InitialSetupReview["additionalLocations"][number] & { enabled: boolean };
type FinalProps = { structureMode: string; systemAuthorities: Record<string, string>; setSystemAuthorities: (value: Record<string, string>) => void; registerMode: string; serviceMode: InitialSetupReview["operatingModel"]["operations"]["serviceMode"]; setServiceMode: (value: InitialSetupReview["operatingModel"]["operations"]["serviceMode"]) => void; sharing: Record<string, string>; setSharing: (value: Record<string, string>) => void; locations: FinalLocation[]; setLocation: (index: number, patch: Partial<FinalLocation>) => void; store: StoreDraft; dataImport: InitialSetupReview["dataImport"]; selectedMenuCount: number; featureCount: number; skippedCount: number; confirmed: boolean; setConfirmed: (value: boolean) => void };

function authorityOptionsFor(key: string) {
  return Object.entries(key === "reservations" ? reservationLabels : authorityLabels)
    .filter(([value]) => value !== "aio_boost" || key !== "reservations");
}

function FinalSummary(props: FinalProps) {
  return <><div className="setup-bubble ai"><p>ありがとうございます。初期設定の準備ができました。</p><small>「利用を開始する」を押すまで、店舗情報と公開ページ由来のメニュー候補は正式反映しません。確認済みのファイル取込データは各管理画面に保存済みです。</small></div><section className="setup-final-summary"><h2>AIと一緒に決めた内容</h2><div className="grid cols-2"><article className="static-card"><span>店舗構成</span><strong>{structureLabels[props.structureMode]}</strong></article><article className="static-card"><span>予約</span><strong>{reservationLabels[props.systemAuthorities.reservations]}</strong></article><article className="static-card"><span>会計・レジ</span><strong>{registerLabels[props.registerMode]}</strong></article><article className="static-card"><span>店舗情報</span><strong>{props.store.name}</strong><small>{props.store.address || "住所は後で確認"}</small></article><article className="static-card"><span>データ取り込み</span><strong>{props.dataImport.status === "completed" ? `${props.dataImport.successRows}件を保存済み` : "手入力または後で取り込み"}</strong></article><article className="static-card"><span>メニュー</span><strong>{props.selectedMenuCount}件を登録</strong></article><article className="static-card"><span>管理画面</span><strong>{props.featureCount}機能を準備</strong></article></div>{props.skippedCount ? <p className="notice">後で確認する項目が{props.skippedCount}件あります。利用開始後の設定画面から変更できます。</p> : null}<details className="disclosure"><summary>AIが準備した詳細設定を確認・変更する</summary><div className="grid cols-2 setup-advanced-settings">{Object.entries(props.systemAuthorities).map(([key, value]) => <label className="field" key={key}>{systemLabels[key]}<select value={value} onChange={(event) => props.setSystemAuthorities({ ...props.systemAuthorities, [key]: event.target.value })}>{authorityOptionsFor(key).map(([option, label]) => <option key={option} value={option}>{label}</option>)}</select></label>)}<label className="field">予約の運用<select value={props.serviceMode} onChange={(event) => props.setServiceMode(event.target.value as InitialSetupReview["operatingModel"]["operations"]["serviceMode"])}><option value="reservation_only">予約制</option><option value="walk_in_only">来店順</option><option value="both">予約と当日受付</option><option value="remote_or_visit">訪問・オンライン</option><option value="not_used">予約管理不要</option></select></label>{Object.entries(props.sharing).map(([key, value]) => <label className="field" key={key}>{({ menus: "メニュー", invoices: "請求書", customers: "顧客", staff: "スタッフ", inventory: "在庫" } as Record<string, string>)[key]}の共有範囲<select value={value} onChange={(event) => props.setSharing({ ...props.sharing, [key]: event.target.value })}><option value="company">法人共通</option><option value="brand">ブランド共通</option><option value="store">店舗別</option></select></label>)}</div>{props.locations.length ? <div className="stack"><h3>追加店舗候補</h3>{props.locations.map((location, index) => <article className="static-card" key={`${location.name}-${index}`}><label className="check-row"><input type="checkbox" checked={location.enabled} onChange={(event) => props.setLocation(index, { enabled: event.target.checked })} />この店舗を追加する</label><label className="field">店舗名<input value={location.name} onChange={(event) => props.setLocation(index, { name: event.target.value })} /></label></article>)}</div> : null}</details><label className="check-card setup-final-consent"><input type="checkbox" checked={props.confirmed} onChange={(event) => props.setConfirmed(event.target.checked)} /><span><strong>この内容で正式データを作成します</strong><small>AIが読み取った原本と確認履歴は、あとから確認できるよう保持します。</small></span></label><PendingSubmitButton disabled={!props.confirmed} pendingLabel="初期設定を反映しています...">この内容で利用を開始する</PendingSubmitButton></section></>;
}
