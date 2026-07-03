"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const [message, setMessage] = useState("Supabase環境変数が未設定の場合はデモ画面へ進めます。");

  async function submit(formData: FormData) {
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const supabase = createSupabaseBrowserClient();

    if (!supabase) {
      window.location.href = "/dashboard";
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
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
      <button className="button" type="submit">ログイン</button>
      <p>{message}</p>
    </form>
  );
}
