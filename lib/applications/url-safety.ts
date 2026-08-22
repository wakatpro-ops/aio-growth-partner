import { lookup as nodeLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export const MAX_STORE_PAGE_BYTES = 600_000;
export const MAX_STORE_PAGES = 3;
export const MAX_STORE_REDIRECTS = 4;
export const STORE_FETCH_TIMEOUT_MS = 7_000;

type LookupAddress = { address: string; family: number };
type LookupFn = (hostname: string) => Promise<LookupAddress[]>;
type FetchFn = typeof fetch;

export type PublicPageSnapshot = {
  url: string;
  title: string;
  description: string;
  html: string;
};

export type PublicSiteFetchResult = {
  sourceUrl: string;
  finalUrl: string;
  pages: PublicPageSnapshot[];
  errors: Array<{ url: string; code: string }>;
  status: "success" | "partial";
};

export class PublicUrlError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PublicUrlError";
  }
}

export function normalizePublicUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new PublicUrlError("invalid_url", "URLを入力してください。");
  const withScheme = /^[a-z][a-z0-9+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new PublicUrlError("invalid_url", "店舗を確認できるURLを入力してください。");
  }
  url.hash = "";
  const secretParameters = new Set(["token", "access_token", "id_token", "api_key", "apikey", "key", "signature", "password", "session", "code"]);
  for (const name of [...url.searchParams.keys()]) {
    const normalizedName = name.toLowerCase();
    if (secretParameters.has(normalizedName)) {
      throw new PublicUrlError("url_secret", "認証情報を含まない公開ページのURLを入力してください。");
    }
    if (normalizedName.startsWith("utm_") || ["gclid", "fbclid"].includes(normalizedName)) url.searchParams.delete(name);
  }
  return url;
}

function isBlockedIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/u.test(normalized)) return true;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  if (mapped) return isBlockedIpv4(mapped);
  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    return isBlockedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  return false;
}

export function isBlockedAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

async function defaultLookup(hostname: string) {
  return nodeLookup(hostname, { all: true, verbatim: true });
}

async function validatedAddresses(url: URL, lookupFn: LookupFn) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new PublicUrlError("unsupported_protocol", "WebページのURLを入力してください。");
  }
  if (url.username || url.password) {
    throw new PublicUrlError("url_credentials", "ログイン情報を含むURLは利用できません。");
  }
  if (url.port && !['80', '443'].includes(url.port)) {
    throw new PublicUrlError("unsupported_port", "通常のWebページURLを入力してください。");
  }

  const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new PublicUrlError("blocked_host", "公開されている店舗ページのURLを入力してください。");
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookupFn(hostname).catch(() => []);
  if (addresses.length === 0) {
    throw new PublicUrlError("dns_failed", "ページの場所を確認できませんでした。");
  }
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new PublicUrlError("blocked_address", "公開されている店舗ページのURLを入力してください。");
  }
  return addresses;
}

export async function validatePublicUrl(url: URL, lookupFn: LookupFn = defaultLookup) {
  await validatedAddresses(url, lookupFn);
  return url;
}

function pinnedNodeResponse(url: URL, target: LookupAddress) {
  return new Promise<Response>((resolve, reject) => {
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = requestFn(url, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "AIOBoostStoreAnalyzer/1.0 (+https://aioboost.jp/)"
      },
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      }
    }, (incoming) => {
      const headers = new Headers();
      Object.entries(incoming.headers).forEach(([name, value]) => {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      });
      const status = incoming.statusCode ?? 500;
      if ([301, 302, 303, 307, 308].includes(status)) {
        incoming.resume();
        resolve(new Response(null, { status, headers }));
        return;
      }
      const declaredLength = Number(headers.get("content-length") ?? "0");
      if (declaredLength > MAX_STORE_PAGE_BYTES) {
        incoming.destroy();
        reject(new PublicUrlError("response_too_large", "ページの情報量が多すぎます。"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      incoming.on("data", (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > MAX_STORE_PAGE_BYTES) {
          incoming.destroy(new PublicUrlError("response_too_large", "ページの情報量が多すぎます。"));
          return;
        }
        chunks.push(chunk);
      });
      incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), { status, headers })));
      incoming.on("error", reject);
    });
    request.setTimeout(STORE_FETCH_TIMEOUT_MS, () => request.destroy(new PublicUrlError("fetch_timeout", "ページの確認に時間がかかっています。")));
    request.on("error", reject);
    request.end();
  });
}

async function readLimitedHtml(response: Response) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_STORE_PAGE_BYTES) throw new PublicUrlError("response_too_large", "ページの情報量が多すぎます。");
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new PublicUrlError("unsupported_content", "WebページのURLを入力してください。");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_STORE_PAGE_BYTES) {
      await reader.cancel();
      throw new PublicUrlError("response_too_large", "ページの情報量が多すぎます。");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

function metaContent(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/giu) ?? [];
  for (const tag of tags) {
    const name = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/iu)?.[1]?.toLowerCase();
    if (name !== key.toLowerCase()) continue;
    return tag.match(/content\s*=\s*["']([^"']*)["']/iu)?.[1]?.trim() ?? "";
  }
  return "";
}

function pageTitle(html: string) {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]?.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 240) ?? "";
}

async function fetchSinglePage(rawUrl: string, fetchFn: FetchFn | null, lookupFn: LookupFn) {
  let current = normalizePublicUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_STORE_REDIRECTS; redirect += 1) {
    const addresses = await validatedAddresses(current, lookupFn);
    const response = fetchFn
      ? await fetchFn(current, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(STORE_FETCH_TIMEOUT_MS),
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": "AIOBoostStoreAnalyzer/1.0 (+https://aioboost.jp/)"
          }
        })
      : await pinnedNodeResponse(current, addresses[0]);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new PublicUrlError("invalid_redirect", "ページの移動先を確認できませんでした。");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new PublicUrlError(`http_${response.status}`, "ページを取得できませんでした。");
    const html = await readLimitedHtml(response);
    return {
      url: current.toString(),
      title: pageTitle(html),
      description: metaContent(html, "description") || metaContent(html, "og:description"),
      html
    } satisfies PublicPageSnapshot;
  }
  throw new PublicUrlError("too_many_redirects", "ページの移動回数が多すぎます。");
}

function decodeBasicEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function relevantSameOriginLinks(page: PublicPageSnapshot) {
  const base = new URL(page.url);
  const matches = [...page.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/giu)];
  const keywords = /menu|service|price|about|concept|access|shop|salon|clinic|company|店舗|メニュー|料金|サービス|アクセス|会社|私たち/iu;
  const candidates: Array<{ url: string; score: number }> = [];
  for (const match of matches) {
    try {
      const target = new URL(decodeBasicEntities(match[1]), base);
      target.hash = "";
      if (target.origin !== base.origin || !['http:', 'https:'].includes(target.protocol)) continue;
      const label = decodeBasicEntities(match[2].replace(/<[^>]+>/gu, " ")).replace(/\s+/gu, " ").trim();
      const signal = `${target.pathname} ${label}`;
      if (!keywords.test(signal)) continue;
      target.search = "";
      candidates.push({ url: target.toString(), score: /menu|service|price|メニュー|料金|サービス/iu.test(signal) ? 2 : 1 });
    } catch {
      // Ignore malformed links from untrusted pages.
    }
  }
  return [...new Map(candidates.sort((a, b) => b.score - a.score).map((item) => [item.url, item])).values()]
    .slice(0, MAX_STORE_PAGES - 1)
    .map((item) => item.url);
}

export async function fetchPublicStoreSite(
  sourceUrl: string,
  dependencies: { fetchFn?: FetchFn; lookupFn?: LookupFn } = {}
): Promise<PublicSiteFetchResult> {
  const fetchFn = dependencies.fetchFn ?? null;
  const lookupFn = dependencies.lookupFn ?? defaultLookup;
  const normalized = normalizePublicUrl(sourceUrl);
  const first = await fetchSinglePage(normalized.toString(), fetchFn, lookupFn);
  const errors: Array<{ url: string; code: string }> = [];
  const related = relevantSameOriginLinks(first);
  const extras = await Promise.all(related.map(async (url) => {
    try {
      return await fetchSinglePage(url, fetchFn, lookupFn);
    } catch (error) {
      errors.push({ url, code: error instanceof PublicUrlError ? error.code : "fetch_failed" });
      return null;
    }
  }));
  const pages = [first, ...extras.filter((page): page is PublicPageSnapshot => Boolean(page))];
  return {
    sourceUrl: normalized.toString(),
    finalUrl: first.url,
    pages,
    errors,
    status: errors.length > 0 ? "partial" : "success"
  };
}
