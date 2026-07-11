"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [message, setMessage] = useState("メールアドレスとパスワードを入力してログインしてください。");
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("ログイン情報を確認しています。");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      window.location.href = "/dashboard";
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setMessage("ログインできませんでした。メールアドレスとパスワードを確認してください。");
      return;
    }

    const session = data.session;
    if (!session?.access_token) {
      setLoading(false);
      setMessage("ログイン情報を保存できませんでした。もう一度ログインしてください。");
      return;
    }

    const sessionResponse = await fetch("/api/auth/session", {
      body: JSON.stringify({
        access_token: session.access_token,
        expires_in: session.expires_in
      }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    if (!sessionResponse.ok) {
      const result = await sessionResponse.json().catch(() => null);
      setLoading(false);
      setMessage(result?.error ?? "ログイン状態を保存できませんでした。もう一度ログインしてください。");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form className="card form" action={submit}>
      <div className="field">
        <label htmlFor="email">メール</label>
        <input id="email" name="email" type="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">パスワード</label>
        <input id="password" name="password" type="password" required />
      </div>
      <button className="button" type="submit" disabled={loading} aria-busy={loading}>
        {loading ? "ログインしています..." : "ログイン"}
      </button>
      <p>{message}</p>
    </form>
  );
}
