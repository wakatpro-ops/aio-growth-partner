import type { PublicMenuCandidate } from "../onboarding/menu-candidates.ts";

type Page = { url: string; html: string };
const clean = (value: string) => value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/\s+/gu, " ").trim();
const key = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s/gu, "");
function money(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).normalize("NFKC").replace(/[,¥￥\s]|円/gu, "");
  if (!/^\d+(?:\.\d+)?$/u.test(text)) return null;
  const amount = Number(text);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 100_000_000 ? amount : null;
}
function tax(text: string): PublicMenuCandidate["taxInclusion"] {
  if (/税込|内税/u.test(text)) return "inclusive";
  if (/税抜|外税|税別/u.test(text)) return "exclusive";
  return "unknown";
}

/** Only directly fetched, tightly paired name/price evidence. Search descriptions are not products. */
export function extractPublicMenus(pages: Page[]): PublicMenuCandidate[] {
  const candidates: PublicMenuCandidate[] = [];
  const add = (name: string, unitPrice: number | null, evidence: string, page: Page, taxInclusion = tax(evidence)) => {
    name = clean(name);
    if (name.length < 2 || name.length > 160 || /営業時間|電話|送料|合計|平均予算|予算|クーポン|ポイント|最低注文|最低利用/u.test(name)) return;
    if (unitPrice === null) return;
    candidates.push({ name, unitPrice, taxInclusion, sourceUrl: page.url, sourceAccess: "page", evidence: clean(evidence).slice(0, 600) });
  };
  for (const page of pages.slice(0, 6)) {
    for (const block of page.html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
      try {
        const visit = (value: unknown, depth = 0) => {
          if (depth > 20 || !value || typeof value !== "object") return;
          if (Array.isArray(value)) { value.slice(0, 200).forEach(item => visit(item, depth + 1)); return; }
          const row = value as Record<string, unknown>;
          const types = Array.isArray(row["@type"]) ? row["@type"] : [row["@type"]];
          if (types.some(type => ["MenuItem", "Product", "Service"].includes(String(type))) && typeof row.name === "string") {
            const offers = Array.isArray(row.offers) ? row.offers : [row.offers];
            for (const value of offers) {
              if (!value || typeof value !== "object") continue;
              const offer = value as Record<string, unknown>;
              const specification = offer.priceSpecification && typeof offer.priceSpecification === "object" ? offer.priceSpecification as Record<string, unknown> : {};
              const currency = String(offer.priceCurrency ?? specification.priceCurrency ?? "").toUpperCase();
              if (currency !== "JPY") continue; // Never assume a foreign/unspecified currency is yen.
              if (offer.lowPrice !== undefined || offer.highPrice !== undefined) continue;
              const price = money(offer.price ?? specification.price);
              const vat = offer.valueAddedTaxIncluded ?? specification.valueAddedTaxIncluded;
              add(row.name, price, `${row.name} / ${String(offer.price ?? specification.price ?? "")} JPY`, page, vat === true ? "inclusive" : vat === false ? "exclusive" : "unknown");
            }
          }
          Object.values(row).forEach(child => visit(child, depth + 1));
        };
        visit(JSON.parse(block[1]));
      } catch { /* Invalid JSON-LD is not price evidence. */ }
    }
    // A row/dl pair must contain exactly one explicit yen price. Ranges and alternate prices need review.
    const pairs = [
      ...Array.from(page.html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu), match => match[1]),
      ...Array.from(page.html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/giu), match => `${match[1]}<br>${match[2]}`)
    ];
    for (const pair of pairs.slice(0, 200)) {
      const text = clean(pair).normalize("NFKC");
      const prices = [...text.matchAll(/(?:[¥￥]\s*([\d,]+)|([\d,]+)\s*円)/gu)];
      if (prices.length !== 1 || /[〜～~]|\d\s*[-–]\s*\d|より|から|時価|各種|平均|予算|目安/u.test(text)) continue;
      const price = prices[0];
      const name = text.slice(0, price.index).replace(/(?:価格|料金|税込|税抜|税別|\(|（|:|：)\s*$/gu, "").trim();
      add(name, money(price[1] ?? price[2]), text, page);
    }
  }
  // Conflicting prices are not silently resolved by choosing the first page.
  const groups = new Map<string, PublicMenuCandidate[]>();
  for (const candidate of candidates) groups.set(key(candidate.name), [...(groups.get(key(candidate.name)) ?? []), candidate]);
  return [...groups.values()].filter(group => new Set(group.map(item => item.unitPrice)).size === 1)
    .map(group => {
      const known = group.filter(item => item.taxInclusion !== "unknown");
      return new Set(known.map(item => item.taxInclusion)).size > 1 ? { ...group[0], taxInclusion: "unknown" as const } : known[0] ?? group[0];
    }).slice(0, 30);
}

/** A researched official page must still match the store, not just a generic directory. */
export function menuPageMatchesStore(page: { title: string; description: string; html: string }, store: { store_name: string; phone: string; address: string }) {
  const text = key(`${page.title} ${page.description} ${clean(page.html).slice(0, 24_000)}`);
  const names = store.store_name.split(/[（(]/u)[0].trim();
  const name = key(names);
  const phone = store.phone.replace(/\D/gu, "");
  const hasPhone = phone.length >= 10 && text.replace(/[^0-9]/gu, "").includes(phone);
  const publishedPhones = clean(page.html).normalize("NFKC").match(/0\d{1,4}[-ー−－]\d{1,4}[-ー−－]\d{3,4}/gu) ?? [];
  if (phone.length >= 10 && publishedPhones.length && !hasPhone) return false;
  const addressKey = (value: string) => key(value).replace(/〒?\d{3}-\d{4}/gu, "").replace(/\d+(?:f|階).*$/iu, "").replace(/[丁目番地号\-ー−－]/gu, "");
  const address = addressKey(store.address);
  return Boolean(name.length >= 3 && text.includes(name) && (hasPhone || (address.length >= 6 && addressKey(text).includes(address))));
}

/** Search-derived values remain visibly unconfirmed, and must cite a verified tool source. */
export function searchedMenuCandidates(value: unknown, sources: { url: string }[]): PublicMenuCandidate[] {
  if (!Array.isArray(value)) return [];
  const urls = new Set(sources.map(source => source.url.replace(/\/$/u, "")));
  const candidates: PublicMenuCandidate[] = value.slice(0, 8).flatMap(raw => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? clean(item.name).slice(0, 160) : "";
    const evidence = typeof item.evidence === "string" ? clean(item.evidence).slice(0, 600) : "";
    const sourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl : "";
    if (name.length < 2 || !urls.has(sourceUrl.replace(/\/$/u, "")) || !evidence || !key(evidence).includes(key(name))) return [];
    const unitPrice = item.unitPrice === null ? null : money(item.unitPrice);
    if (item.unitPrice !== null && unitPrice === null) return [];
    const priceEvidence = [...evidence.normalize("NFKC").matchAll(/(?:[¥￥]\s*([\d,]+)|([\d,]+)\s*円)/gu)];
    if (unitPrice !== null && (!priceEvidence.some(match => money(match[1] ?? match[2]) === unitPrice) || /[〜～~]|より|から|時価|平均|予算|目安/u.test(evidence))) return [];
    if (/^(?:ランチ|ディナー|カフェ|テイクアウト|個室利用|イタリアン|ビストロ・イタリアン料理)$/u.test(name) && unitPrice === null) return [];
    return [{ name, unitPrice, sourceUrl, evidence, sourceAccess: "search" as const,
      taxInclusion: item.taxInclusion === "inclusive" || item.taxInclusion === "exclusive" ? item.taxInclusion : "unknown" as const }];
  });
  return candidates.filter((candidate, index) => {
    const matching = candidates.filter(item => key(item.name) === key(candidate.name));
    return candidates.findIndex(item => key(item.name) === key(candidate.name)) === index
      && new Set(matching.map(item => item.unitPrice)).size === 1;
  });
}
