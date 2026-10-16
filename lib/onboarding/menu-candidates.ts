/** Public business descriptions are not a saleable catalogue. */
export type PublicMenuCandidate = {
  name: string;
  unitPrice: number | null;
  taxInclusion: "inclusive" | "exclusive" | "unknown";
  sourceUrl: string;
  evidence: string;
  sourceAccess?: "page" | "search";
};

export type SetupMenuCandidate = PublicMenuCandidate & {
  index: number;
  itemType: "product" | "part" | "service";
  taxRate: 0 | 8 | 10;
  kind: "menu" | "overview";
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function setupMenuCandidates(profile: unknown): SetupMenuCandidate[] {
  const data = object(profile);
  const menus: SetupMenuCandidate[] = [];
  const names = new Set<string>();
  for (const raw of Array.isArray(data.menu_candidates) ? data.menu_candidates : []) {
    const candidate = object(raw);
    const name = String(candidate.name ?? "").trim().slice(0, 160);
    const sourceUrl = String(candidate.sourceUrl ?? "");
    const evidence = String(candidate.evidence ?? "").slice(0, 600);
    let safeUrl = false;
    try { const url = new URL(sourceUrl); safeUrl = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { /* Invalid public source. */ }
    const nameKey = name.normalize("NFKC").toLowerCase().replace(/\s/gu, "");
    if (!name || names.has(nameKey) || !safeUrl || !evidence) continue;
    names.add(nameKey);
    const price = candidate.unitPrice;
    menus.push({ index: menus.length, name, kind: "menu", itemType: "service", taxRate: 10,
      unitPrice: typeof price === "number" && Number.isSafeInteger(price) && price >= 0 && price <= 100_000_000 ? price : null,
      taxInclusion: candidate.taxInclusion === "inclusive" || candidate.taxInclusion === "exclusive" ? candidate.taxInclusion : "unknown",
      sourceUrl, evidence, sourceAccess: candidate.sourceAccess === "search" ? "search" : "page" });
    if (menus.length === 30) return menus;
  }
  // Preserve legacy descriptions for review, never enable or price them by default.
  for (const value of Array.isArray(data.services) ? data.services : []) {
    const name = String(value).trim().slice(0, 160);
    const nameKey = name.normalize("NFKC").toLowerCase().replace(/\s/gu, "");
    if (!name || names.has(nameKey)) continue;
    names.add(nameKey);
    menus.push({ index: menus.length, name, kind: "overview", itemType: "service", taxRate: 10,
      unitPrice: null, taxInclusion: "unknown", sourceUrl: "", evidence: "" });
    if (menus.length === 30) break;
  }
  return menus;
}

export function catalogueNeedsReview(item: { unit_price?: number; metadata?: Record<string, unknown> | null }) {
  const metadata = item.metadata ?? {};
  return metadata.catalogue_review_required === true
    || (metadata.initial_setup_candidate === true && item.unit_price === 0 && metadata.price_confirmed !== true);
}

export function setupMenuReady(menu: { name: string; unitPrice: number | null; taxInclusion: string; confirmed?: boolean; freeConfirmed?: boolean }) {
  return Boolean(menu.confirmed && menu.name.trim() && menu.unitPrice !== null && Number.isFinite(menu.unitPrice)
    && Number.isSafeInteger(menu.unitPrice) && menu.unitPrice >= 0 && menu.unitPrice <= 100_000_000
    && ["inclusive", "exclusive"].includes(menu.taxInclusion) && (menu.unitPrice !== 0 || menu.freeConfirmed));
}
