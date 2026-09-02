export type InviteVerificationType = "invite" | "recovery";

type GenerateLinkResult = {
  data?: {
    properties?: {
      hashed_token?: unknown;
      verification_type?: unknown;
    } | null;
  } | null;
};

function verificationType(value: unknown): InviteVerificationType | null {
  return value === "invite" || value === "recovery" ? value : null;
}

export function safeNextPathFromRedirect(redirectTo: string) {
  try {
    const redirectUrl = new URL(redirectTo);
    const next = redirectUrl.searchParams.get("next");
    return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export function buildScannerSafeInviteUrl({
  appUrl,
  result,
  redirectTo
}: {
  appUrl: string;
  result: unknown;
  redirectTo: string;
}) {
  const typedResult = result as GenerateLinkResult | null;
  const properties = typedResult?.data?.properties;
  const tokenHash = typeof properties?.hashed_token === "string" ? properties.hashed_token : "";
  const type = verificationType(properties?.verification_type);
  if (!tokenHash || !type) return null;

  const url = new URL("/auth/accept-invite", appUrl);
  const fragment = new URLSearchParams({
    token_hash: tokenHash,
    type,
    next: safeNextPathFromRedirect(redirectTo)
  });
  url.hash = fragment.toString();
  return url.toString();
}
