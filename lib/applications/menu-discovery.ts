import { isIP } from "node:net";
import { identityTextMatches, listingKey, sourceDomain, sourceIsExcluded, type DiagnosisSource } from "./public-diagnosis.ts";
import { isBlockedAddress, normalizePublicUrl, PublicUrlError, type PublicPageSnapshot } from "./url-safety.ts";
import { extractPublicMenus, menuPageMatchesStore, searchedMenuCandidates } from "./menu-extraction.ts";
import type { PublicMenuCandidate } from "../onboarding/menu-candidates.ts";

type StoreIdentity = { store_name: string; address: string; phone: string };
export type MenuDiscoverySummary = { status: "found" | "not_found" | "unavailable"; searched: boolean; pagesRead: number; candidateCount: number; pricedCount: number };
export type MenuResearchResult = { menu_pages: unknown; menu_candidates: unknown; sources: DiagnosisSource[] };
type Input = { store: StoreIdentity; sourceUrl: string; pages: PublicPageSnapshot[]; sources: DiagnosisSource[]; menus: PublicMenuCandidate[]; excluded: string[] };
type Dependencies = {
  fetchPage: (url: string, timeoutMs: number) => Promise<PublicPageSnapshot>;
  research: (timeoutMs: number) => Promise<MenuResearchResult>;
  now?: () => number;
};
const menuSignal = /menu|food|drink|lunch|dinner|course|service|price|product|メニュー|料理|コース|施術|料金|商品/iu;
const menuPathSignal = (value: string) => {
  try { return menuSignal.test(decodeURI(new URL(value).pathname)); } catch { return false; }
};
const textKey = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s/gu, "");
const stripHtml = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ").replace(/<[^>]*>/gu, " ");
const escapeHtml = (text: string) => text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

export function publicMenuUrl(value: string, excluded: string[] = []) {
  try {
    const url = normalizePublicUrl(value);
    const host = url.hostname.replace(/^\[|\]$/gu, "");
    if (url.username || url.password || (url.port && !["80", "443"].includes(url.port)) || host === "localhost"
      || /\.(?:local|localhost|internal)$/iu.test(host) || (isIP(host) && isBlockedAddress(host)) || sourceIsExcluded(url.toString(), excluded)) return "";
    if (/\/(?:login|accounts?|signin|checkout|cart|admin|reserve|reservation|booking)(?:\/|$)/iu.test(url.pathname)) return "";
    return url.toString();
  } catch { return ""; }
}

/** Portal domains are shared by unrelated shops: compare their exact listing identifier. */
function portalListing(value: string) {
  const url = new URL(value);
  const host = sourceDomain(value);
  let id: string | undefined;
  if (host === "tabelog.com") id = url.pathname.match(/^\/[^/]+\/[^/]+\/[^/]+\/(\d{8})(?:\/|$)/u)?.[1];
  else if (host === "hotpepper.jp") id = url.pathname.match(/^\/(str[A-Za-z]\d+)(?:\/|$)/u)?.[1];
  else if (host === "beauty.hotpepper.jp") id = url.pathname.match(/^\/(?:kr\/)?(slnH\d+)(?:\/|$)/u)?.[1];
  else if (host === "restaurant.ikyu.com") id = url.pathname.match(/^\/(\d+)(?:\/|$)/u)?.[1];
  else if (host === "r.gnavi.co.jp") id = url.pathname.match(/^\/([a-z0-9]+)(?:\/|$)/iu)?.[1];
  else return null;
  return { host, id: id ?? "" };
}

export function sameMenuListing(left: string, right: string) {
  try {
    const a = portalListing(left), b = portalListing(right);
    return Boolean(a && b && a.id && a.host === b.host && a.id === b.id);
  } catch { return false; }
}

function conflictsWithKnownListing(url: string, references: string[]) {
  const candidate = portalListing(url);
  if (!candidate) return false;
  if (!candidate.id) return true;
  const known = references.map(value => portalListing(value)).filter(value => value?.host === candidate.host && value.id);
  const primary = references[0] ? portalListing(references[0]) : null;
  if (primary?.host === candidate.host && primary.id) return primary.id !== candidate.id;
  const identifiers = new Set(known.map(value => value?.id));
  return identifiers.size > 1 || (identifiers.size === 1 && !identifiers.has(candidate.id));
}

/** Follow observed links, never invent a /menu path. Do not cross a portal's shop boundary. */
export function discoverLinkedMenuUrls(pages: PublicPageSnapshot[], references: string[], excluded: string[] = []) {
  const urls: string[] = [];
  for (const page of pages.slice(0, 6)) {
    for (const match of page.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/giu)) {
      try {
        const raw = match[1].replace(/&amp;/giu, "&").replace(/&#(?:x26|38);/giu, "&");
        const url = publicMenuUrl(new URL(raw, page.url).toString(), excluded);
        if (!url || new URL(url).origin !== new URL(page.url).origin || conflictsWithKnownListing(url, references)) continue;
        if (!menuSignal.test(`${decodeURI(new URL(url).pathname)} ${stripHtml(match[2])}`)) continue;
        if (listingKey(url) !== listingKey(page.url)) urls.push(url);
      } catch { /* Malformed untrusted link. */ }
    }
  }
  return [...new Set(urls)].slice(0, 3);
}

/** Preserve disagreements as an unpriced candidate, not an arbitrary winning price. */
export function mergePublicMenuCandidates(groups: PublicMenuCandidate[][]): PublicMenuCandidate[] {
  const byName = new Map<string, PublicMenuCandidate[]>();
  for (const item of groups.flat()) {
    if (!publicMenuUrl(item.sourceUrl) || !item.name.trim() || !item.evidence.trim()) continue;
    const key = textKey(item.name);
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  return [...byName.values()].map(group => {
    const priced = group.filter(item => item.unitPrice !== null);
    if (new Set(priced.map(item => item.unitPrice)).size > 1) return { ...group[0], unitPrice: null, taxInclusion: "unknown" as const, evidence: `掲載価格に違いがあります。${group.map(item => item.evidence).join(" / ")}`.slice(0, 600) };
    const best = [...(priced.length ? priced : group)].sort((a, b) => Number(b.sourceAccess === "page") - Number(a.sourceAccess === "page"))[0];
    const knownTaxes = new Set(group.filter(item => item.taxInclusion !== "unknown").map(item => item.taxInclusion));
    return { ...best, taxInclusion: knownTaxes.size > 1 ? "unknown" as const : [...knownTaxes][0] ?? "unknown" as const };
  }).slice(0, 30);
}

function researchedPages(result: MenuResearchResult, input: Input) {
  const verified = new Set(result.sources.map(source => listingKey(source.url)));
  const references = [input.sourceUrl, ...input.sources.map(source => source.url)].filter(url => publicMenuUrl(url, input.excluded));
  return (Array.isArray(result.menu_pages) ? result.menu_pages : []).slice(0, 6).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const url = publicMenuUrl(String(row.url ?? ""), input.excluded);
    if (!url || !verified.has(listingKey(url)) || conflictsWithKnownListing(url, references)) return [];
    const name = String(row.store_name ?? ""), address = String(row.address ?? ""), phone = String(row.phone ?? "").replace(/\D/gu, "");
    if (!identityTextMatches(name, input.store.store_name)) return [];
    if (address && input.store.address && !identityTextMatches(address, input.store.address)) return [];
    if (phone && input.store.phone && phone !== input.store.phone.replace(/\D/gu, "")) return [];
    const knownListing = references.some(reference => sameMenuListing(url, reference));
    // For an unseen site, require per-page name + address/phone evidence, not a similar domain.
    if (!knownListing && !menuPageMatchesStore({ title: name, description: "", html: escapeHtml(String(row.identity_evidence ?? "")) }, input.store)) return [];
    return [{ url, label: "メニュー・料金", kind: "other" as const, access: "search" as const }];
  });
}

function pageMatches(page: PublicPageSnapshot, input: Input, references: string[]) {
  if (conflictsWithKnownListing(page.url, references)) return false;
  if (menuPageMatchesStore(page, input.store)) return true;
  // A portal's exact shop ID can identify a menu-only page without a repeated address.
  const name = input.store.store_name.split(/[（(]/u)[0].trim();
  const text = stripHtml(page.html);
  const phones = text.match(/0\d{1,4}[-ー−－]\d{1,4}[-ー−－]\d{3,4}/gu) ?? [];
  if (input.store.phone && phones.length && !phones.some(phone => phone.replace(/\D/gu, "") === input.store.phone.replace(/\D/gu, ""))) return false;
  return name.length >= 3 && textKey(`${page.title} ${text}`).includes(textKey(name)) && references.some(reference => sameMenuListing(page.url, reference));
}

/** At most one extra search + three single-page reads; failure never loses the store diagnosis. */
export async function discoverStoreMenus(input: Input, dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  const deadline = now() + 55_000;
  const references = [input.sourceUrl, ...input.sources.map(source => source.url)].filter(url => publicMenuUrl(url, input.excluded));
  let menus = mergePublicMenuCandidates([input.menus.filter(menu => publicMenuUrl(menu.sourceUrl, input.excluded)
    && !conflictsWithKnownListing(menu.sourceUrl, references))]);
  const sources: DiagnosisSource[] = [];
  const attempted = new Set(input.pages.map(page => listingKey(page.url)));
  const unavailable = new Set<string>();
  let searched = false, pagesRead = 0, reads = 0, failed = false;
  const pricedCount = () => menus.filter(menu => menu.unitPrice !== null).length;
  const read = async (urls: string[], stopOnPrice: boolean) => {
    for (const raw of [...new Set(urls)]) {
      if (reads >= 3 || now() >= deadline || (stopOnPrice && pricedCount())) break;
      const url = publicMenuUrl(raw, input.excluded);
      if (!url || attempted.has(listingKey(url)) || conflictsWithKnownListing(url, references)) continue;
      attempted.add(listingKey(url)); reads += 1;
      try {
        const page = await dependencies.fetchPage(url, Math.min(7_000, deadline - now()));
        const final = publicMenuUrl(page.url, input.excluded);
        if (!final || !pageMatches(page, input, references)) continue;
        pagesRead += 1;
        menus = mergePublicMenuCandidates([extractPublicMenus([page]), menus]);
        sources.push({ url: final, label: page.title || "メニュー・料金", kind: "other", access: "page" });
      } catch (error) {
        failed = true;
        if (error instanceof PublicUrlError && ["http_404", "http_410"].includes(error.code)) {
          // Search indexes can retain closed pages. Their old prices must not
          // short-circuit a current menu investigation or become usable prices.
          unavailable.add(listingKey(url));
          menus = menus.map(menu => listingKey(menu.sourceUrl) === listingKey(url)
            ? { ...menu, unitPrice: null, taxInclusion: "unknown", evidence: `掲載ページが見つからないため価格は再確認が必要です。${menu.evidence}`.slice(0, 600) }
            : menu);
        }
        /* Respect 403/login/timeouts; inaccessible does not mean the page is gone. */
      }
    }
  };
  if (!menus.some(menu => menu.unitPrice !== null && menu.sourceAccess === "page")) {
    const searchedPricePages = [...new Set(menus.filter(menu => menu.unitPrice !== null && menu.sourceAccess === "search").map(menu => menu.sourceUrl))].slice(0, 2);
    const knownMenuPages = input.sources.map(source => publicMenuUrl(source.url, input.excluded))
      .filter(url => url && menuPathSignal(url));
    await read([...searchedPricePages, ...knownMenuPages, ...discoverLinkedMenuUrls(input.pages, references, input.excluded)], false);
  }
  if (!pricedCount() && now() < deadline - 1_000) {
    searched = true;
    try {
      const result = await dependencies.research(Math.min(35_000, deadline - now()));
      // Reject the complete extra investigation if an excluded source contaminated it.
      if (result.sources.some(source => sourceIsExcluded(source.url, input.excluded))) throw new Error("excluded_source_used");
      const accepted = researchedPages(result, input).filter(source => !unavailable.has(listingKey(source.url)));
      menus = mergePublicMenuCandidates([menus, searchedMenuCandidates(result.menu_candidates, accepted)]);
      sources.push(...accepted);
      // Prefer real page evidence when available; search-only evidence stays unconfirmed.
      await read(accepted.map(source => source.url), false);
    } catch { failed = true; }
  }
  const summary: MenuDiscoverySummary = { status: pricedCount() ? "found" : failed ? "unavailable" : "not_found", searched, pagesRead, candidateCount: menus.length, pricedCount: pricedCount() };
  return { menus, sources, summary };
}
