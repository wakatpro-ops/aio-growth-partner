"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("メールアドレスを入力してください。");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    setLoading(true);
    setMessage("再設定メールを準備しています。");

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setMessage("現在、再設定メールを送信できません。時間をおいてもう一度お試しください。");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/set-password?mode=recovery&next=${encodeURIComponent("/dashboard")}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setLoading(false);
    if (error) {
      setMessage("再設定メールを送信できませんでした。時間をおいてもう一度お試しください。");
      return;
    }

    setSent(true);
    setMessage("入力したメールアドレスが登録済みの場合、パスワード再設定メールが届きます。メール内のリンクから新しいパスワードを設定してください。");
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="recovery_email">メールアドレス</label>
        <input id="recovery_email" name="email" type="email" autoComplete="email" required disabled={loading || sent} />
      </div>
      <button className="button" type="submit" disabled={loading || sent} aria-busy={loading}>
        {loading ? "送信しています..." : sent ? "再設定メールを送信しました" : "パスワード再設定メールを受け取る"}
      </button>
      <p aria-live="polite">{message}</p>
    </form>
  );
}
