"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export function SetPasswordForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [message, setMessage] = useState("今後ログインに使うパスワードを設定してください。");
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    setMessage("パスワードを設定しています。");

    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");
    if (password.length < 8) {
      setLoading(false);
      setMessage("パスワードは8文字以上で設定してください。");
      return;
    }
    if (password !== confirmPassword) {
      setLoading(false);
      setMessage("確認用パスワードが一致していません。");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setMessage("パスワード設定の準備が完了していません。担当者へお問い合わせください。");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setMessage("パスワードを設定できませんでした。招待メールを開き直すか、担当者へお問い合わせください。");
      return;
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      await fetch("/api/auth/session", {
        body: JSON.stringify({
          access_token: accessToken,
          expires_in: data.session?.expires_in ?? 3600
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
    }

    window.location.href = next;
  }

  return (
    <>
      <form className="card form" action={submit}>
        <div className="field">
          <label htmlFor="password">パスワード</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="confirm_password">パスワード確認</label>
          <input id="confirm_password" name="confirm_password" type="password" minLength={8} required autoComplete="new-password" />
        </div>
        <button className="button" type="submit" disabled={loading} aria-busy={loading}>
          {loading ? "設定しています..." : "パスワードを設定して進む"}
        </button>
        <p>{message}</p>
      </form>
      <p className="muted">
        招待メールの有効期限が切れている場合は、担当者へ再発行をご依頼ください。
      </p>
      <Link className="button secondary" href="/login">ログイン画面へ</Link>
    </>
  );
}
