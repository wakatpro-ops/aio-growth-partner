"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AiRobotFace, AiRobotPortrait } from "@/components/brand/ai-robot";
import { channelLabel, type Conversation, type Offer } from "@/lib/marketing/conversation-rules";
import styles from "./marketing-assistant.module.css";
type View = { revision: number; state: Conversation; offer: Offer | null; offers: Offer[]; items: { id: string; name: string }[]; actionAvailable: boolean; observedAt: string };

export function MarketingAssistant({ storeId, onConsult, onUnavailable, openRequest = 0, mode = "marketing" }: { storeId: string; onConsult: () => void; onUnavailable?: () => void; openRequest?: number; mode?: "marketing" | "aio" }) {
  const router = useRouter();
  const aio = mode === "aio";
  const editHref = (id: string) => aio ? `/stores/${storeId}/marketing/aio-improvement/tasks/${id}` : `/stores/${storeId}/growth-actions/${id}/edit`;
  const [view, setView] = useState<View | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [expanded, setExpanded] = useState(false), [input, setInput] = useState("");
  const flight = useRef<AbortController | null>(null), mounted = useRef(true);
  const thread = useRef<HTMLDivElement>(null);
  async function request(action?: string, value?: string, itemId?: string) {
    if (flight.current) return;
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError("");
    const timeout = setTimeout(() => controller.abort(), action === "generate" ? 70_000 : 25_000);
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(storeId)}/${aio ? "aio" : "marketing"}-conversation`, {
        method: action ? "POST" : "GET", cache: "no-store", signal: controller.signal,
        ...(action ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, revision: view?.revision ?? 0, value, itemId }) } : {})
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.unavailable) { (onUnavailable ?? onConsult)(); return; }
        throw new Error(data.error || "読み込みに失敗しました。");
      }
      if (!mounted.current || flight.current !== controller) return;
      setView(data); setInput("");
      if (action === "generate" && data.state?.step === "done" && data.actionAvailable) {
        router.push(editHref(data.state.actionId));
        router.refresh();
      }
      if (action === "open") {
        const href = view?.offers.find(offer => offer.id === value)?.href;
        if (href?.startsWith(`/stores/${storeId}/`)) router.push(href);
      }
    } catch (failure) {
      if (mounted.current && flight.current === controller) setError(failure instanceof Error && failure.name !== "AbortError" ? failure.message : "応答を確認できませんでした。入力はそのままです。「再確認」で保存状況を確認してください。");
    } finally { clearTimeout(timeout); if (flight.current === controller) { flight.current = null; if (mounted.current) setBusy(false); } }
  }
  useEffect(() => {
    mounted.current = true;
    void request();
    const open = () => setExpanded(true);
    window.addEventListener("aio:marketing", open);
    return () => { mounted.current = false; flight.current?.abort(); flight.current = null; window.removeEventListener("aio:marketing", open); };
    // A new instance is mounted for each store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, mode]);
  useEffect(() => { thread.current?.scrollTo({ top: thread.current.scrollHeight }); }, [view?.state.step, busy]);
  useEffect(() => { if (openRequest) setExpanded(true); }, [openRequest]);
  const state = view?.state ?? {}, offer = view?.offer, step = state.step;
  const prompt = step === "subject" ? aio ? "どのメニュー・サービスをもとに考えましょう？選ぶか、言葉で教えてください。" : `${channelLabel(state.brief?.channel)}で何を紹介しましょう？商品を選ぶか、言葉で教えてください。`
    : step === "details" ? aio ? "特に伝えたい強み、地域、どんなお客様に向いているかを教えてください。なければ登録済みの内容から作れます。" : "特に伝えたい魅力や、掲載したい日時などはありますか？なければ、この内容で作れます。"
    : step === "confirm" ? aio ? "この内容でAIO改善の下書きを作ります。目標質問の登録や店舗情報の変更、公開はまだ行いません。" : "この内容で投稿の下書きを作ります。まだ公開しません。"
    : step === "generating" ? "下書きの作成状況を確認できます。「再確認」を押してください。"
    : step === "done" ? view?.actionAvailable ? "下書きができました！内容を確認して仕上げましょう。まだ公開されていません。" : "作成した下書きは削除済み、または利用できない状態です。削除済み一覧から確認できます。"
    : offer?.text ?? "今の提案は後回しにしました。機能一覧から進むか、気になることをご相談ください。";
  const button = (label: string, action: string, value?: string, itemId?: string) => <button type="button" disabled={busy} onClick={() => void request(action, value, itemId)}>{label}</button>;
  return <aside className={`store-ai-assistant store-ai-workspace${expanded ? " is-expanded" : ""}${step ? ` ${styles.inProgress}` : ""}`} aria-labelledby="marketing-assistant-title" data-store-id={storeId}>
    <header><div><AiRobotFace className="assistant-header-avatar" /><div><strong id="marketing-assistant-title">{aio ? "AIとAIO改善" : "AIと集客を進める"}</strong><small>一つずつ、一緒に準備しましょう</small></div></div><button className="store-ai-mobile-toggle" type="button" aria-expanded={expanded} aria-controls="marketing-conversation" onClick={() => setExpanded(!expanded)}>{expanded ? "小さくする ↓" : "会話を開く ↑"}</button></header>
    <div className="store-ai-conversation" id="marketing-conversation">
      <div className="store-ai-assistant-thread" ref={thread}>
        <div className="store-ai-welcome"><AiRobotPortrait /><strong>次の一手を、一緒に。</strong><p>お店の状況から、今できることをお伝えします。</p></div>
        <section className={`store-ai-page-context ${styles.panel}`} aria-busy={busy}>
          <div className="store-ai-context-heading"><strong>{step ? aio ? "AIO改善の準備" : "投稿の準備" : "まずはこちらから"}</strong><button type="button" disabled={busy} onClick={() => void request()}>↻ 再確認</button></div>
          {!view && !error ? <p role="status">お店の状況を確認しています…</p> : null}
          {state.brief?.subject ? <div className={styles.brief}><small>ここまで確認しました</small><strong>{channelLabel(state.brief.channel)} / {state.brief.subject}</strong>{state.brief.details ? <p>{state.brief.details}</p> : null}</div> : null}
          {view ? <p aria-live="polite">{prompt}</p> : null}
          <div className={styles.choices}>
            {!step && offer ? <>{button(offer.label, offer.channel ? "start" : "open", offer.id)}{button("後で（明日まで）", "defer", offer.id)}{button("別の提案", "alternative", offer.id)}</> : null}
            {!step && aio && view ? <details><summary>作りたい下書きを選ぶ</summary>{view.offers.filter(option => option.channel).map(option => <button key={option.id} type="button" disabled={busy} onClick={() => void request("start", option.id)}>{channelLabel(option.channel)}</button>)}</details> : null}
            {step === "subject" ? view?.items.slice(0, 6).map(item => <button key={item.id} type="button" disabled={busy} onClick={() => void request("answer", undefined, item.id)}>{item.name}</button>) : null}
            {step === "details" ? button("追加なしで進む", "answer", "") : null}
            {step === "confirm" ? <>{button("この内容で下書きを作る", "generate")}{button("内容を直す", "edit")}</> : null}
            {step === "generating" && (state.leaseUntil ?? 0) < Date.now() ? button("作成を再試行", "generate") : null}
            {step === "done" && view?.actionAvailable && state.actionId ? <Link className="button" href={editHref(state.actionId)}>作成した下書きを確認 →</Link> : null}
            {step && step !== "generating" ? button(step === "done" ? "次の提案へ" : "この準備をやめる", "cancel") : null}
          </div>
          {step === "details" && state.brief?.channel === "instagram" ? <small>写真は下書きの確認後、投稿画面で選べます。</small> : null}
          {busy ? <p role="status">{step === "confirm" ? "処理しています。作成中はもう一度押さなくて大丈夫です…" : "確認しています…"}</p> : null}
          {error ? <p className="store-ai-error" role="alert">{error}</p> : null}
        </section>
      </div>
      {step === "subject" || step === "details" ? <form onSubmit={event => { event.preventDefault(); if (input.trim()) void request("answer", input); }} aria-busy={busy}>
        <label htmlFor="marketing-answer">{step === "subject" ? "紹介したい内容" : "伝えたいこと（任意）"}</label>
        <textarea id="marketing-answer" rows={3} maxLength={800} value={input} onChange={event => setInput(event.target.value)} disabled={busy} placeholder={step === "subject" ? "例：エアコンのクリーニング" : "例：おすすめの理由や、利用してほしいお客様"} />
        <button className="button" type="submit" disabled={busy || !input.trim()}>{busy ? "保存しています…" : "この内容で進む"}</button>
      </form> : null}
      <div className={styles.footer}><button type="button" disabled={busy} onClick={onConsult}>自由にAIへ相談する</button><small>途中の内容は保存されます。下書きの作成だけを行い、公開・配信は自動実行しません。</small></div>
    </div>
  </aside>;
}

export function StartMarketingConversation() {
  return <button className="button" type="button" onClick={() => window.dispatchEvent(new Event("aio:marketing"))}>AIと一緒に進める →</button>;
}
