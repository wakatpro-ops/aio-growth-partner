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

    const response = await fetch("/api/auth/set-password", {
      body: JSON.stringify({ password }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setLoading(false);
      setMessage(result?.error ?? "パスワードを設定できませんでした。招待メールを開き直すか、担当者へお問い合わせください。");
      return;
    }

    if (typeof result.email === "string" && result.email.length > 0) {
      const supabase = createSupabaseBrowserClient();
      const signInResult = supabase
        ? await supabase.auth.signInWithPassword({ email: result.email, password })
        : { data: null, error: new Error("auth unavailable") };

      const session = signInResult.data?.session;
      const accessToken = session?.access_token;
      if (accessToken) {
        const sessionResponse = await fetch("/api/auth/session", {
          body: JSON.stringify({
            access_token: accessToken,
            expires_in: session?.expires_in ?? 3600
          }),
          headers: { "content-type": "application/json" },
          method: "POST"
        });
        if (!sessionResponse.ok) {
          setLoading(false);
          setMessage("パスワードは設定できましたが、ログイン状態を確認できませんでした。ログイン画面から新しいパスワードでお入りください。");
          return;
        }
      } else if (signInResult.error) {
        setLoading(false);
        setMessage("パスワードは設定できました。ログイン画面から新しいパスワードでお入りください。");
        return;
      }
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
