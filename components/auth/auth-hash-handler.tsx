"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function cleanCurrentPath() {
  const path = `${window.location.pathname}${window.location.search}`;
  if (path.startsWith("/auth/set-password")) {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/onboarding";
  }
  if (!path) return "/dashboard";
  return path;
}

export function AuthHashHandler() {
  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresIn = Number(params.get("expires_in") ?? 3600);
    const type = params.get("type");
    if (!accessToken) {
      const errorCode = params.get("error_code");
      const errorDescription = params.get("error_description");
      if (window.location.pathname.startsWith("/auth/set-password") && (errorCode || errorDescription)) {
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.set("invite_error", errorCode === "otp_expired" ? "expired" : "invalid");
        const destination = `${window.location.pathname}?${searchParams.toString()}`;
        window.history.replaceState(null, "", destination);
        window.location.assign(destination);
      }
      return;
    }
    const verifiedAccessToken = accessToken;
    const verifiedRefreshToken = refreshToken;

    const marker = `aio-auth-hash-${verifiedAccessToken.slice(0, 18)}`;
    if (sessionStorage.getItem(marker)) return;
    sessionStorage.setItem(marker, "1");

    async function persistSession() {
      const supabase = createSupabaseBrowserClient();
      if (supabase && verifiedRefreshToken) {
        await supabase.auth.setSession({
          access_token: verifiedAccessToken,
          refresh_token: verifiedRefreshToken
        });
      }

      const response = await fetch("/api/auth/session", {
        body: JSON.stringify({ access_token: verifiedAccessToken, expires_in: expiresIn }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      if (!response.ok) {
        window.history.replaceState(null, "", "/login?error=session");
        window.location.assign("/login?error=session");
        return;
      }

      const next = cleanCurrentPath();
      const destination = type === "invite" || type === "recovery"
        ? `/auth/set-password?next=${encodeURIComponent(next)}`
        : next;

      window.history.replaceState(null, "", destination);
      window.location.assign(destination);
    }

    persistSession().catch(() => {
      window.history.replaceState(null, "", "/login?error=session");
      window.location.assign("/login?error=session");
    });
  }, []);

  return null;
}
