"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AiContextCard } from "@/lib/store-ai/context-rules";
import { AiRobotFace, AiRobotPortrait } from "@/components/brand/ai-robot";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { MarketingAssistant } from "@/components/marketing/marketing-assistant";

type Message = { role: "user" | "assistant"; content: string; pageLabel?: string; observedAt?: string };
const clock = (value: string) => new Date(value).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

export function StoreAiAssistant({ storeId, pathname, search = "" }: { storeId: string; pathname: string; search?: string }) {
  const [consult, setConsult] = useState(false);
  const [guidedUnavailable, setGuidedUnavailable] = useState(false);
  const [marketingOpen, setMarketingOpen] = useState(0);
  const marketing = pathname === `/stores/${storeId}/marketing`;
  const aio = pathname === `/stores/${storeId}/marketing/aio-improvement`;
  useEffect(() => { setConsult(false); setGuidedUnavailable(false); }, [pathname, storeId]);
  useEffect(() => { const open = () => { setConsult(false); setMarketingOpen(value => value + 1); }; window.addEventListener("aio:marketing", open); return () => window.removeEventListener("aio:marketing", open); }, []);
  if ((marketing || aio) && !consult) return <MarketingAssistant key={`${storeId}:${aio}`} mode={aio ? "aio" : "marketing"} storeId={storeId} openRequest={marketingOpen} onConsult={() => setConsult(true)} onUnavailable={() => { setGuidedUnavailable(true); setConsult(true); }} />;
  return <ReadOnlyStoreAiAssistant key={storeId} storeId={storeId} pathname={pathname} search={search} onResume={(marketing || aio) && !guidedUnavailable ? () => setConsult(false) : undefined} />;
}

function ReadOnlyStoreAiAssistant({ storeId, pathname, search = "", onResume }: { storeId: string; pathname: string; search?: string; onResume?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocus = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  const [context, setContext] = useState<AiContextCard | null>(null);
  const [contextError, setContextError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [contextBusy, setContextBusy] = useState(true);
  const currentPage = `${pathname}?${search}`;
  const activePage = useRef(currentPage);
  activePage.current = currentPage;
  const lastRead = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    setContext(null); setContextError(false); setContextBusy(true);
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    const query = new URLSearchParams({ pathname, search });
    void fetch(`/api/stores/${encodeURIComponent(storeId)}/assistant?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("context_failed"); return response.json() as Promise<AiContextCard>; })
      .then(data => { if (!disposed && !controller.signal.aborted) { setContext(current => current && Date.parse(current.observedAt) > Date.parse(data.observedAt) ? current : data); lastRead.current = Date.now(); } })
      .catch(() => { if (!disposed) setContextError(true); })
      .finally(() => { window.clearTimeout(timeout); if (!disposed) setContextBusy(false); });
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout); };
  }, [storeId, pathname, search, refresh]);

  useEffect(() => {
    const reread = () => { if (!document.hidden && Date.now() - lastRead.current > 30_000) setRefresh(value => value + 1); };
    window.addEventListener("focus", reread); document.addEventListener("visibilitychange", reread);
    return () => { window.removeEventListener("focus", reread); document.removeEventListener("visibilitychange", reread); };
  }, []);

  useEffect(() => {
    const prefill = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (typeof detail === "string") setInput(detail.slice(0, 800));
      setExpanded(true);
      shouldFocus.current = true;
      setFocusRequest((current) => current + 1);
    };
    window.addEventListener("aio:ask", prefill);
    return () => {
      window.removeEventListener("aio:ask", prefill);
      // Store change / logout: discard the old request and conversation together.
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, []);

  useEffect(() => {
    if (shouldFocus.current && expanded && !loading) {
      inputRef.current?.focus({ preventScroll: true });
      shouldFocus.current = false;
    }
  }, [focusRequest, expanded, loading]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [expanded, messages, loading, error]);

  useEffect(() => {
    // Navigation starts with the current page's greeting, not an old reply.
    threadRef.current?.scrollTo({ top: 0 });
  }, [pathname, search]);

  async function ask(question = input) {
    const nextQuestion = question.trim();
    // Synchronous lock also covers rapid clicks before React renders busy state.
    if (!nextQuestion || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setInput("");
    setError(null);
    setLoading(true);
    setExpanded(true);
    const pageLabel = context?.pageLabel;
    setMessages((current) => [...current, { role: "user", content: nextQuestion, pageLabel }]);
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(storeId)}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ pathname, search, message: nextQuestion, history: messages.slice(-24).map(({ role, content, pageLabel }) => ({ role, pageLabel, content: content.slice(0, 1200) })) })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.answer !== "string") throw new Error("assistant_request_failed");
      if (inFlight.current === controller) {
        setMessages((current) => [...current, { role: "assistant", content: data.answer, pageLabel: data.context?.pageLabel ?? pageLabel, observedAt: data.context?.observedAt }]);
        if (data.context && activePage.current === currentPage) { setContext(current => current && Date.parse(current.observedAt) > Date.parse(data.context.observedAt) ? current : data.context); setContextError(false); lastRead.current = Date.now(); }
      }
    } catch {
      if (inFlight.current !== controller) return;
      setError("回答を取得できませんでした。質問は入力欄に戻しました。もう一度送信できます。");
      setInput((current) => current || nextQuestion);
      setMessages((current) => current.slice(0, -1));
    } finally {
      window.clearTimeout(timeout);
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <aside className={`store-ai-assistant store-ai-workspace${expanded ? " is-expanded" : ""}`} aria-labelledby="store-ai-assistant-title" data-store-id={storeId}>
      <header>
        <div><AiRobotFace className="assistant-header-avatar" /><div><strong id="store-ai-assistant-title">AIに尋ねる</strong><small>画面を見ながら、気軽に相談</small></div></div>
        <button className="store-ai-mobile-toggle" type="button" aria-controls="store-ai-conversation" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? "小さくする ↓" : "会話を開く ↑"}</button>
      </header>
      <div className="store-ai-conversation" id="store-ai-conversation">
        {onResume ? <button className="button secondary" type="button" onClick={onResume}>{pathname.endsWith("/marketing/aio-improvement") ? "AIO改善の準備に戻る（続きから）" : "投稿の準備に戻る（続きから）"}</button> : null}
        <div className="store-ai-assistant-thread" ref={threadRef}>
          <div className="store-ai-welcome">
            <AiRobotPortrait />
            <strong>お店のこと、一緒に考えます。</strong>
            <p>保存済みの情報と、画面の使い方をもとに答えます。</p>
          </div>
          <section className="store-ai-page-context" aria-label="この画面からのひとこと" aria-busy={contextBusy}>
            <div className="store-ai-context-heading"><strong>{context?.pageLabel ?? "画面の情報"}</strong><button type="button" disabled={contextBusy} onClick={() => setRefresh(value => value + 1)} aria-label="画面の情報を再確認">↻ 再確認</button></div>
            <p aria-live="polite">{contextBusy ? "この画面の情報を確認しています…" : contextError ? "画面の情報を取得できませんでした。再確認するか、操作方法をご相談ください。" : context?.greeting}</p>
            {context ? <><small>{context.sections.length ? `${clock(context.observedAt)} 時点の保存済みデータ` : "画面の操作ガイド"}</small>{context.links.length ? <div className="store-ai-context-links">{context.links.map(link => <Link key={link.href} href={link.href}>{link.label} →</Link>)}</div> : null}</> : null}
          </section>
          <div className="store-ai-messages" role="log" aria-label="AIとの会話" aria-live="polite" aria-relevant="additions text">
            {messages.map((message, index) => <div className={`store-ai-message ${message.role}`} key={`${message.role}-${index}`}><div className="store-ai-message-author">{message.role === "assistant" ? <AiRobotFace className="message-avatar" /> : null}<span>{message.role === "assistant" ? "AIO boost AI" : "あなた"}</span></div>{message.pageLabel ? <small className="store-ai-message-source">{message.pageLabel}{message.observedAt ? ` / ${clock(message.observedAt)} 確認` : ""}</small> : null}<p>{message.content}</p></div>)}
            {loading ? <div className="store-ai-message assistant"><div className="store-ai-message-author"><AiRobotFace className="message-avatar" /><span>AIO boost AI</span></div><p>考えています…</p></div> : null}
          </div>
          {error ? <p className="store-ai-error" role="alert">{error}</p> : null}
        </div>
        {context?.suggestions.length ? <div className="store-ai-suggestions">{context.suggestions.map((suggestion) => <button type="button" disabled={loading || contextBusy} key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div> : null}
        <form onSubmit={(event) => { event.preventDefault(); void ask(); }} aria-busy={loading}>
          <label htmlFor="store_ai_question">質問・相談を入力</label>
          <textarea ref={inputRef} id="store_ai_question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={800} rows={3} placeholder="例：この画面の使い方を教えて" disabled={loading} />
          <PendingSubmitButton busy={loading} disabled={!input.trim()} pendingLabel="回答を考えています…">送信する</PendingSubmitButton>
          <small>AIは説明と相談を行います。データ変更・削除・外部送信はしません。</small>
        </form>
      </div>
    </aside>
  );
}
