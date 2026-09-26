"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { FormEvent } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [message, setMessage] = useState("メールアドレスとパスワードを入力してログインしてください。");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const submitting = useRef(false);
  useEffect(() => { setReady(true); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A synchronous lock also covers Enter/requestSubmit before React rerenders.
    if (!ready || submitting.current) return;
    const formData = new FormData(event.currentTarget);
    submitting.current = true;
    flushSync(() => {
      setLoading(true);
      setSlow(false);
      setMessage("ログイン情報を確認しています。");
    });
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    const slowTimer = window.setTimeout(() => setSlow(true), 5000);
    let navigating = false;
    try {
      const supabase = createSupabaseBrowserClient(controller.signal);
      if (!supabase) throw new Error("unavailable");
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (controller.signal.aborted || !error.status || error.status >= 500) throw new Error("network");
        setMessage("ログインできませんでした。メールアドレスとパスワードを確認してください。");
        return;
      }
      const session = data.session;
      if (!session?.access_token) throw new Error("session");
      setMessage("利用できる店舗を確認しています。");
      const sessionResponse = await fetch("/api/auth/session", {
        body: JSON.stringify({ access_token: session.access_token, expires_in: session.expires_in }),
        headers: { "content-type": "application/json" }, method: "POST", signal: controller.signal
      });
      const result = await sessionResponse.json().catch(() => null);
      if (!sessionResponse.ok) {
        setMessage(result?.error ?? "ログイン状態を保存できませんでした。もう一度ログインしてください。");
        return;
      }
      const next = typeof result?.next_path === "string" && /^\/(?!\/)/.test(result.next_path) && !result.next_path.includes("\\")
        ? result.next_path : "/dashboard";
      setMessage("ログインできました。画面を開いています。");
      navigating = true;
      window.location.assign(next);
    } catch {
      setMessage(controller.signal.aborted
        ? "接続に時間がかかっています。通信環境を確認して、もう一度お試しください。"
        : "通信を確認できませんでした。接続を確認して、もう一度お試しください。");
    } finally {
      window.clearTimeout(timeout);
      window.clearTimeout(slowTimer);
      if (!navigating) { submitting.current = false; setLoading(false); setSlow(false); }
    }
  }

  return (
    <form className="card form login-form" method="post" onSubmit={submit} aria-busy={loading}>
      <div className="field">
        <label htmlFor="email">メール</label>
        <input id="email" name="email" type="email" autoComplete="username" autoCapitalize="none" required disabled={loading} />
      </div>
      <div className="field">
        <label htmlFor="password">パスワード</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required disabled={loading} />
      </div>
      <PendingSubmitButton busy={loading} disabled={!ready} pendingLabel="ログインしています...">ログイン</PendingSubmitButton>
      {loading ? <div className="login-progress" data-testid="login-progress" role="status" aria-live="polite">
        <span className="login-progress-spinner" aria-hidden="true" />
        <div><strong>{message}</strong><p>{slow ? "少し時間がかかっています。そのままお待ちください。" : "ボタンを押し直す必要はありません。"}</p></div>
      </div> : <p role="status" aria-live="polite">{ready ? message : "ログインの準備をしています。"}</p>}
      <noscript>ログインするにはJavaScriptを有効にしてください。</noscript>
    </form>
  );
}
