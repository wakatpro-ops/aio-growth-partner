"use client";

import { useEffect, useRef, useState } from "react";
import { AiRobotFace, AiRobotPortrait } from "@/components/brand/ai-robot";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

type Message = { role: "user" | "assistant"; content: string };
const suggestions = ["この画面でできることを教えて", "次に何をすればいい？", "データ取り込みについて教えて"];

export function StoreAiAssistant({ storeId, pathname }: { storeId: string; pathname: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const prefill = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      if (typeof detail === "string") setInput(detail.slice(0, 800));
      setExpanded(true);
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
    if (focusRequest && expanded && !loading) inputRef.current?.focus({ preventScroll: true });
  }, [focusRequest, expanded, loading]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [expanded, messages, loading, error]);

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
    setMessages((current) => [...current, { role: "user", content: nextQuestion }]);
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(storeId)}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ pathname, message: nextQuestion, history: messages.slice(-8).map((message) => ({ ...message, content: message.content.slice(0, 1200) })) })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.answer !== "string") throw new Error("assistant_request_failed");
      if (inFlight.current === controller) setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
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
        <div className="store-ai-assistant-thread" ref={threadRef}>
          <div className="store-ai-welcome">
            <AiRobotPortrait />
            <strong>お店のこと、一緒に考えます。</strong>
            <p>操作で迷ったときも、次にやることも。<br />ここからいつでも相談できます。</p>
          </div>
          <div className="store-ai-messages" role="log" aria-label="AIとの会話" aria-live="polite" aria-relevant="additions text">
            {messages.map((message, index) => <div className={`store-ai-message ${message.role}`} key={`${message.role}-${index}`}><div className="store-ai-message-author">{message.role === "assistant" ? <AiRobotFace className="message-avatar" /> : null}<span>{message.role === "assistant" ? "AIO boost AI" : "あなた"}</span></div><p>{message.content}</p></div>)}
            {loading ? <div className="store-ai-message assistant"><div className="store-ai-message-author"><AiRobotFace className="message-avatar" /><span>AIO boost AI</span></div><p>考えています…</p></div> : null}
          </div>
          {error ? <p className="store-ai-error" role="alert">{error}</p> : null}
        </div>
        {messages.length === 0 ? <div className="store-ai-suggestions">{suggestions.map((suggestion) => <button type="button" disabled={loading} key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div> : null}
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
