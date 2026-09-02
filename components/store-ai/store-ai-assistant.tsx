"use client";

import { useEffect, useRef, useState } from "react";
import { AiRobotFace } from "@/components/brand/ai-robot";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

type Message = { role: "user" | "assistant"; content: string };

const suggestions = ["この画面でできることを教えて", "次に何をすればいい？", "データ取り込みについて教えて"];

export function StoreAiAssistant({ storeId, pathname, open, onClose }: { storeId: string; pathname: string; open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "こんにちは。AIO boostの操作方法や、店舗運営で次に何をすればよいかを一緒に整理します。データは勝手に変更しません。" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight }), 20);
  }, [open, messages]);

  async function ask(question = input) {
    const nextQuestion = question.trim();
    if (!nextQuestion || loading) return;
    const nextMessages = [...messages, { role: "user" as const, content: nextQuestion }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch(`/api/stores/${encodeURIComponent(storeId)}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathname, message: nextQuestion, history: nextMessages.slice(-8) })
      });
      const data = await response.json().catch(() => null);
      setMessages((current) => [...current, { role: "assistant", content: response.ok && data?.answer ? data.answer : data?.error ?? "回答を準備できませんでした。少し待ってからもう一度お試しください。" }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "通信が途切れました。もう一度お試しください。" }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;
  return <div className="store-ai-assistant-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="store-ai-assistant" role="dialog" aria-modal="true" aria-labelledby="store-ai-assistant-title">
      <header><div><AiRobotFace className="assistant-header-avatar" /><div><strong id="store-ai-assistant-title">AIに尋ねる</strong><small>操作方法・店舗運営の相談</small></div></div><button type="button" onClick={onClose} aria-label="AI相談を閉じる">×</button></header>
      <div className="store-ai-assistant-thread" ref={threadRef}>{messages.map((message, index) => <div className={`store-ai-message ${message.role}`} key={`${message.role}-${index}`}><div className="store-ai-message-author">{message.role === "assistant" ? <AiRobotFace className="message-avatar" /> : null}<span>{message.role === "assistant" ? "AIO boost AI" : "あなた"}</span></div><p>{message.content}</p></div>)}{loading ? <div className="store-ai-message assistant"><div className="store-ai-message-author"><AiRobotFace className="message-avatar" /><span>AIO boost AI</span></div><p>考えています...</p></div> : null}</div>
      {messages.length === 1 ? <div className="store-ai-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void ask(suggestion)}>{suggestion}</button>)}</div> : null}
      <form onSubmit={(event) => { event.preventDefault(); void ask(); }} aria-busy={loading}><label htmlFor="store_ai_question">質問・相談を入力</label><textarea id="store_ai_question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={800} rows={3} placeholder="例：この売上データをどこから取り込めますか？" disabled={loading} /><div><small>AIは説明と相談を行います。データ変更・削除・外部送信はしません。</small><PendingSubmitButton busy={loading} disabled={!input.trim()} pendingLabel="AIが回答を考えています...">AIに尋ねる</PendingSubmitButton></div></form>
    </section>
  </div>;
}
