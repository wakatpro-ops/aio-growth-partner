"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export function SetPasswordForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const recoveryMode = searchParams.get("mode") === "recovery";
  const inviteError = searchParams.get("invite_error");
  const linkUnavailable = inviteError === "expired" || inviteError === "invalid";
  const [message, setMessage] = useState(
    linkUnavailable
      ? "この招待リンクは有効期限が切れているか、すでに無効になっています。担当者へ再発行をご依頼ください。"
      : recoveryMode
        ? "新しいパスワードを設定してください。"
        : "今後ログインに使うパスワードを設定してください。"
  );
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const formData = new FormData(event.currentTarget);
    if (linkUnavailable) {
      setMessage("この招待リンクではパスワードを設定できません。担当者へ再発行をご依頼ください。");
      return;
    }

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
    const sessionResult = supabase ? await supabase.auth.getSession() : null;
    const accessToken = sessionResult?.data?.session?.access_token ?? null;

    const response = await fetch("/api/auth/set-password", {
      body: JSON.stringify({ password, access_token: accessToken }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setLoading(false);
      setMessage(result?.error ?? "パスワードを設定できませんでした。招待メールを開き直すか、担当者へお問い合わせください。");
      return;
    }

    let destination = next;
    if (typeof result.email === "string" && result.email.length > 0) {
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
        const sessionResult = await sessionResponse.json().catch(() => null);
        if (typeof sessionResult?.next_path === "string" && sessionResult.next_path.startsWith("/") && !sessionResult.next_path.startsWith("//")) {
          destination = sessionResult.next_path;
        }
      } else if (signInResult.error) {
        setLoading(false);
        setMessage("パスワードは設定できました。ログイン画面から新しいパスワードでお入りください。");
        return;
      }
    }

    window.location.href = destination;
  }

  return (
    <>
      <form className="card form" onSubmit={submit} aria-busy={loading}>
        <div className="field">
          <label htmlFor="password">パスワード</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" disabled={loading} />
        </div>
        <div className="field">
          <label htmlFor="confirm_password">パスワード確認</label>
          <input id="confirm_password" name="confirm_password" type="password" minLength={8} required autoComplete="new-password" disabled={loading} />
        </div>
        <PendingSubmitButton busy={loading} disabled={linkUnavailable} pendingLabel="設定しています...">パスワードを設定して進む</PendingSubmitButton>
        <p aria-live="polite">{message}</p>
      </form>
      <p className="muted">
        {recoveryMode ? "再設定メールの有効期限が切れている場合は、ログイン画面からもう一度お手続きください。" : "招待メールの有効期限が切れている場合は、担当者へ再発行をご依頼ください。"}
      </p>
      <Link className="button secondary" href="/login">ログイン画面へ</Link>
    </>
  );
}
