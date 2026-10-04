"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiRobotFace, AiRobotPortrait } from "@/components/brand/ai-robot";
import { calculateMoney, documentLabel, moneyInput, type SalesCommand, type SalesConversation, type SalesOffer, type MoneyInput } from "@/lib/sales/conversation-rules";
import styles from "@/components/marketing/marketing-assistant.module.css";

type View = { revision: number; state: SalesConversation; offers: SalesOffer[]; offer: SalesOffer | null;
  items: { id: string; name: string; unit_price: number; tax_rate: number }[];
  customers: { id: string; name: string; company_name: string | null }[];
  reducedTax: boolean; actionAvailable: boolean };
const yen = (value: number) => `${value.toLocaleString("ja-JP")}円`;
export function StartSalesConversation() { return <button className="button secondary" type="button" onClick={() => window.dispatchEvent(new Event("aio:sales"))}>AIと売上・書類を確認する →</button>; }
export function SalesAssistant({ storeId, onConsult, onUnavailable, openRequest = 0 }: { storeId: string; onConsult: () => void; onUnavailable: () => void; openRequest?: number }) {
  const router = useRouter(), endpoint = `/api/stores/${storeId}/sales-conversation`;
  const [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false), [input, setInput] = useState("");
  const lock = useRef<AbortController | null>(null), alive = useRef(true);
  const unavailable = useRef(onUnavailable); unavailable.current = onUnavailable;
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => { if (openRequest) setExpanded(true); }, [openRequest]);
  async function request(command?: Omit<SalesCommand, "revision">) {
    if (lock.current || (command && !view)) return;
    const controller = new AbortController(); lock.current = controller; setBusy(true); setError(null);
    const timer = window.setTimeout(() => controller.abort(), command?.action === "generate" ? 70000 : 25000);
    try {
      const response = await fetch(endpoint, { method: command ? "POST" : "GET", cache: "no-store", signal: controller.signal,
        ...(command ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...command, revision: view!.revision }) } : {}) });
      const body = await response.json();
      if (response.status === 403 && body.unavailable) { unavailable.current(); return; }
      if (!response.ok) throw new Error(body.error ?? "読み込めませんでした。「再確認」してください。");
      if (!alive.current || lock.current !== controller) return;
      setView(body); if (command) { setInput(""); setExpanded(true); }
      if (command?.action === "generate" && body.state.step === "done" && body.actionAvailable) router.push(`/stores/${storeId}/${body.state.brief.kind}/${body.state.actionId}?prepared=1#document-edit`);
      return body as View;
    } catch (e) { if (alive.current && lock.current === controller) setError(e instanceof Error && e.name !== "AbortError" ? e.message : "応答を確認できませんでした。「再確認」で続きを確認できます。"); }
    finally { window.clearTimeout(timer); if (lock.current === controller) { lock.current = null; if (alive.current) setBusy(false); } }
  }
  useEffect(() => { alive.current = true; void request(); return () => { alive.current = false; lock.current?.abort(); lock.current = null; }; /* store-keyed component */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);
  useEffect(() => { thread.current?.scrollTo({ top: 0 }); }, [view?.state.step]);
  const state = view?.state, brief = state?.brief, step = state?.step, label = documentLabel(brief?.kind);
  const total = brief?.money ? calculateMoney(brief.money) : null;
  const expired = step === "generating" && (state?.leaseUntil ?? 0) < Date.now();
  const prompts = { subject: "どの商品・サービスで作りますか？一覧から選ぶか、名前を教えてください。", customer: "宛先はどのお客様ですか？あとで編集画面から指定することもできます。", amounts: "数量・単価・税の扱いを確認しましょう。登録単価は参考です。今回の金額を入力してください。", details: "書類に添えたい説明はありますか？価格や期限は編集画面で確認できます。", confirm: "この内容で下書きを作りますか？まだ発行・送信はしません。", generating: "下書きを準備しています。完了すると編集画面へ進みます。", done: "下書きを保存しました。編集画面で宛先・金額・期限を確認してください。" };
  async function select(offer: SalesOffer) {
    if (offer.kind) await request({ action: "start", value: offer.id });
    else if (offer.href && !lock.current) { const href = offer.href; if (await request({ action: "open", value: offer.id })) router.push(href); }
  }
  return <aside className={`store-ai-assistant store-ai-workspace ${styles.panel}${step ? ` ${styles.inProgress}` : ""}${expanded ? " is-expanded" : ""}`} aria-labelledby="sales-assistant-title" aria-busy={busy}>
    <header><div><AiRobotFace className="assistant-header-avatar"/><div><strong id="sales-assistant-title">AIと売上・経理</strong><small>選んで、確認して、編集へ</small></div></div><button className="store-ai-mobile-toggle" type="button" aria-expanded={expanded} aria-controls="sales-conversation" onClick={() => setExpanded(value => !value)}>{expanded ? "小さくする ↓" : "会話を開く ↑"}</button></header>
    <div className="store-ai-conversation" id="sales-conversation">
      <div className="store-ai-assistant-thread" ref={thread}>
        <div className="store-ai-welcome"><AiRobotPortrait/><strong>次のひと手間を、一緒に。</strong><p>書類の準備も、売上の確認も。</p></div>
        <section className="store-ai-page-context" aria-live="polite"><div className="store-ai-context-heading"><strong>{step ? `${label}の準備` : "売上・経理"}</strong><button type="button" disabled={busy} onClick={() => void request()}>↻ 再確認</button></div>
          <p>{busy && !view ? "店舗の状況を確認しています…" : step ? prompts[step] : view?.offer?.text ?? "やりたいことを選んで、一緒に進めましょう。"}</p>
          {!step && view ? <><div className={styles.choices}>{view.offer ? <><button disabled={busy} onClick={() => void select(view.offer!)}>{view.offer.label} →</button><button disabled={busy} onClick={() => void request({ action: "defer", value: view.offer!.id })}>あとで</button><button disabled={busy} onClick={() => void request({ action: "alternative", value: view.offer!.id })}>別の提案</button></> : null}</div><details><summary>やりたいことから選ぶ</summary><div className={styles.choices}>{view.offers.map(offer => <button key={offer.id} disabled={busy} onClick={() => void select(offer)}>{offer.label}</button>)}</div></details></> : null}
          {step && brief?.subject ? <div className={styles.brief}><strong>{brief.subject}</strong><small>宛先：{brief.customerName || "編集画面で指定"}</small>{brief.money && total ? <><span>{brief.money.quantity} × {yen(brief.money.unitPrice)}（{brief.money.taxInclusion === "inclusive" ? "税込" : "税抜"}・税率{brief.money.taxRate}%）</span><strong>合計 {yen(total.total)}（税 {yen(total.tax)}）</strong><small>税額は円未満切り捨て</small></> : null}{brief.details ? <p>{brief.details}</p> : null}</div> : null}
          {step === "subject" ? <><div className={styles.choices}>{view?.items.slice(0, 6).map(item => <button key={item.id} disabled={busy} onClick={() => void request({ action: "answer", itemId: item.id })}>{item.name}</button>)}</div>{(view?.items.length ?? 0) > 6 ? <label>ほかの商品<select disabled={busy} value="" onChange={e => { if (e.target.value) void request({ action: "answer", itemId: e.target.value }); }}><option value="">選択してください</option>{view!.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}</> : null}
          {step === "customer" ? <><label>登録済みのお客様<select value="" disabled={busy} onChange={e => { if (e.target.value) void request({ action: "answer", customerId: e.target.value }); }}><option value="">宛先を選ぶ</option>{view?.customers.map(customer => <option key={customer.id} value={customer.id}>{customer.company_name || customer.name}</option>)}</select></label><div className={styles.choices}><button disabled={busy} onClick={() => void request({ action: "answer", value: "later" })}>編集画面で指定する</button></div><small>候補は先頭100件です。見つからない場合は編集画面で指定してください。</small></> : null}
          {step === "amounts" ? <AmountQuestion key={`${view!.revision}`} item={view?.items.find(item => item.id === brief?.itemId)} initial={brief?.money} reducedTax={view?.reducedTax ?? false} busy={busy} onSubmit={money => void request({ action: "answer", money })}/> : null}
          {step === "subject" || step === "details" ? <form onSubmit={e => { e.preventDefault(); void request({ action: "answer", value: input }); }}><label htmlFor="sales-answer">{step === "subject" ? "商品・サービス名" : "添えたい説明（任意）"}</label><textarea id="sales-answer" value={input} maxLength={step === "subject" ? 160 : 800} rows={3} disabled={busy} onChange={e => setInput(e.target.value)}/><button className="button" disabled={busy || (step === "subject" && !input.trim())}>{busy ? "確認しています…" : step === "details" && !input.trim() ? "説明なしで内容確認へ" : "次へ"}</button></form> : null}
          {step === "confirm" || expired ? <div className={styles.choices}><button disabled={busy} onClick={() => void request({ action: "generate" })}>{busy ? "下書きを作成しています…" : "下書きを作って編集する"}</button><button disabled={busy} onClick={() => void request({ action: "edit" })}>内容を直す</button></div> : null}
          {step === "done" ? <div className={styles.choices}>{view?.actionAvailable ? <Link href={`/stores/${storeId}/${brief!.kind}/${state!.actionId}?prepared=1#document-edit`}>下書きを編集する →</Link> : <p>この下書きは削除済み、または利用できません。削除済み一覧から確認できます。</p>}<button disabled={busy} onClick={() => void request({ action: "cancel" })}>次の提案へ</button></div> : null}
        </section>
        {error ? <p className="store-ai-error" role="alert">{error}</p> : null}
      </div>
      <footer className={styles.footer}>{step && step !== "done" ? <button type="button" disabled={busy || (step === "generating" && !expired)} onClick={() => { if (window.confirm("入力中の準備をやめますか？保存済みの書類や売上は変更されません。")) void request({ action: "cancel" }); }}>準備をやめる</button> : null}<button type="button" disabled={busy} onClick={onConsult}>自由に相談する</button><small>作成するのは未発行の下書きだけです。売上の確定・送信・入金処理は行いません。</small></footer>
    </div>
  </aside>;
}
function AmountQuestion({ item, initial, reducedTax, busy, onSubmit }: { item?: { unit_price: number; tax_rate: number }; initial?: MoneyInput; reducedTax: boolean; busy: boolean; onSubmit: (value: MoneyInput) => void }) {
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1)), [price, setPrice] = useState(initial ? String(initial.unitPrice) : item ? String(item.unit_price) : "");
  const [rate, setRate] = useState(String(initial?.taxRate ?? item?.tax_rate ?? 10)), [inclusion, setInclusion] = useState(initial?.taxInclusion ?? "");
  const parsed = moneyInput.safeParse({ quantity: quantity === "" ? NaN : Number(quantity), unitPrice: price === "" ? NaN : Number(price), taxRate: Number(rate), taxInclusion: inclusion });
  const totals = parsed.success ? calculateMoney(parsed.data) : null;
  return <form onSubmit={e => { e.preventDefault(); if (parsed.success) onSubmit(parsed.data); }}>
    <label htmlFor="sales-quantity">数量</label><input id="sales-quantity" type="number" inputMode="numeric" min="1" max="100000" step="1" required value={quantity} disabled={busy} onChange={e => setQuantity(e.target.value)}/>
    <label htmlFor="sales-price">単価（円）</label><input id="sales-price" type="number" inputMode="numeric" min="0" max="100000000" step="1" required value={price} disabled={busy} onChange={e => setPrice(e.target.value)}/>
    <small>数量は整数、単価は1円単位です。細かな内訳は編集画面で調整できます。</small>
    <label htmlFor="sales-tax-inclusion">入力した単価は？</label><select id="sales-tax-inclusion" required value={inclusion} disabled={busy} onChange={e => setInclusion(e.target.value)}><option value="">税込・税抜を選択</option><option value="inclusive">税込（内税）</option><option value="exclusive">税抜（外税）</option></select>
    <label htmlFor="sales-tax-rate">税率</label><select id="sales-tax-rate" value={rate} disabled={busy} onChange={e => setRate(e.target.value)}><option value="10">10%</option><option value="0">0%（課税しない）</option>{reducedTax || rate === "8" ? <option value="8">8%（軽減税率）</option> : null}</select>
    {totals ? <p>合計 <strong>{yen(totals.total)}</strong>（税 {yen(totals.tax)}）</p> : <p className="muted">数量・単価・税の扱いを確認してください。</p>}
    <button className="button" disabled={busy || !parsed.success}>{busy ? "確認しています…" : "この金額で次へ"}</button>
  </form>;
}
