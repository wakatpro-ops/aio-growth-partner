import "server-only";
import { INSTAGRAM_LOGIN_SCOPES } from "./policy";

function singleObject(value: Record<string, unknown>) {
  if (!Array.isArray(value.data)) return value;
  if (value.data.length !== 1 || !value.data[0] || typeof value.data[0] !== "object") throw new Error("Instagramのアカウントを一つに特定できませんでした。");
  return value.data[0] as Record<string, unknown>;
}

export class InstagramClient {
  constructor(private readonly appId: string, private readonly appSecret: string, private readonly version = "v26.0", private readonly fetcher: typeof fetch = fetch) {
    if (!/^v\d+\.\d+$/u.test(version)) throw new Error("Instagram APIの設定を確認してください。");
  }

  private async json(url: string, operation: string, init?: RequestInit) {
    let response: Response;
    try { response = await this.fetcher(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) }); }
    catch { throw new Error(`Instagramの${operation}に接続できませんでした。もう一度お試しください。`); }
    let result: Record<string, unknown>;
    try {
      const raw = await response.text();
      result = JSON.parse(raw, (name: string, value: unknown, context?: { source: string }) => {
        if (["id", "user_id"].includes(name) && typeof value === "number" && !Number.isSafeInteger(value)) {
          if (!context?.source || !/^\d+$/u.test(context.source)) throw new Error("unsafe_identifier");
          return context.source;
        }
        return value;
      }) as Record<string, unknown>;
    }
    catch { throw new Error(`Instagramの${operation}結果を読み取れませんでした。`); }
    // Do not expose provider messages, request URLs, authorization codes or tokens in errors/logs.
    if (!response.ok || !result || typeof result !== "object" || result.error || result.error_type) throw new Error(`Instagramの${operation}が完了しませんでした。接続と権限を確認してください。`);
    return result;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const body = new FormData();
    for (const [name, value] of Object.entries({ client_id: this.appId, client_secret: this.appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code })) body.set(name, value);
    const short = singleObject(await this.json("https://api.instagram.com/oauth/access_token", "認証", { method: "POST", body }));
    const granted = Array.isArray(short.permissions) ? short.permissions.map(String) : String(short.permissions ?? "").split(/[ ,]+/u);
    if (typeof short.access_token !== "string" || !short.access_token || !INSTAGRAM_LOGIN_SCOPES.every(scope => granted.includes(scope))) {
      throw new Error("Instagramのプロフィール読み取りと投稿の両方を許可して、接続し直してください。");
    }
    const query = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: this.appSecret, access_token: short.access_token });
    const long = await this.json(`https://graph.instagram.com/access_token?${query}`, "長期認証");
    const lifetime = Number(long.expires_in);
    if (typeof long.access_token !== "string" || !long.access_token || !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 90 * 86_400) throw new Error("Instagramの認証期限を確認できませんでした。");
    const identity = singleObject(await this.get("me", long.access_token, "user_id,username,account_type"));
    const userId = String(identity.user_id ?? "");
    const username = String(identity.username ?? "");
    if (!/^\d+$/u.test(userId) || !username || !["BUSINESS", "MEDIA_CREATOR", "CREATOR"].includes(String(identity.account_type ?? "").toUpperCase())) {
      throw new Error("Instagramのプロアカウント（ビジネス・クリエイター）を確認できませんでした。");
    }
    return { token: long.access_token, expiresIn: lifetime, userId, username, accountType: String(identity.account_type), scopes: [...INSTAGRAM_LOGIN_SCOPES] };
  }

  async refresh(token: string) {
    const query = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
    const result = await this.json(`https://graph.instagram.com/refresh_access_token?${query}`, "認証更新");
    const lifetime = Number(result.expires_in);
    if (typeof result.access_token !== "string" || !result.access_token || !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 90 * 86_400) throw new Error("Instagramの認証更新を確認できませんでした。");
    return { token: result.access_token, expiresIn: lifetime };
  }

  async get(path: string, token: string, fields: string) {
    if (!/^(?:me|\d+)$/u.test(path)) throw new Error("Instagramの取得先を確認してください。");
    const query = new URLSearchParams({ fields });
    return this.json(`https://graph.instagram.com/${this.version}/${path}?${query}`, "情報取得", { headers: { Authorization: `Bearer ${token}` } });
  }

  async post(path: string, token: string, fields: Record<string, string>) {
    if (!/^\d+\/(?:media|media_publish)$/u.test(path)) throw new Error("Instagramの投稿先を確認してください。");
    return this.json(`https://graph.instagram.com/${this.version}/${path}`, "投稿処理", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
  }
}
