"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";

type InvitePayload = {
  tokenHash: string;
  type: "invite" | "recovery";
  next: string;
};

function safeNextPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

export function AcceptInviteForm() {
  const [payload, setPayload] = useState<InvitePayload | null>(null);
  const [message, setMessage] = useState("招待内容を準備しています。");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = params.get("token_hash") ?? "";
    const rawType = params.get("type");
    const type = rawType === "invite" || rawType === "recovery" ? rawType : null;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    if (!tokenHash || !type) {
      setMessage("招待情報を確認できませんでした。新しい招待メールを開いてください。");
      return;
    }
    setPayload({ tokenHash, type, next: safeNextPath(params.get("next")) });
    setMessage("確認ボタンを押すと、ログイン用パスワードの設定へ進みます。");
  }, []);

  async function acceptInvite() {
    if (!payload) return;
    setLoading(true);
    setMessage("招待を確認しています。");

    const response = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token_hash: payload.tokenHash, type: payload.type })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      setLoading(false);
      setMessage(result?.error ?? "招待を確認できませんでした。担当者へ再発行をご依頼ください。");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      setMessage("ログイン機能の準備が完了していません。担当者へお問い合わせください。");
      return;
    }
    const sessionResult = await supabase.auth.setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token
    });
    if (sessionResult.error) {
      setLoading(false);
      setMessage("招待は確認できましたが、ログイン状態を開始できませんでした。担当者へお問い合わせください。");
      return;
    }

    const params = new URLSearchParams({ next: payload.next });
    if (payload.type === "recovery") params.set("mode", "recovery");
    window.location.href = `/auth/set-password?${params.toString()}`;
  }

  return (
    <div className="card form">
      <form onSubmit={(event) => { event.preventDefault(); void acceptInvite(); }}>
        <PendingSubmitButton busy={loading} disabled={!payload} pendingLabel="確認しています...">招待を確認してパスワード設定へ進む</PendingSubmitButton>
      </form>
      <p role="status">{message}</p>
      <p className="muted">心当たりのない招待の場合は、この画面を閉じてください。</p>
      <Link className="button secondary" href="/login">ログイン画面へ</Link>
    </div>
  );
}
