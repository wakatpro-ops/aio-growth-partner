// Conservative identity checks: shared brands/domains and different addresses
// are not sufficient evidence that two branches are the same store.
export type LocationIdentity = { name: string; address?: string | null; websiteUrl?: string | null };

function normalized(value?: string | null) {
  return (value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

export function locationUrl(value?: string | null) {
  try {
    const url = new URL(value ?? "");
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|igsh|fbclid|gclid|yclid)$/iu.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/u, "");
    return `${url.hostname}${path}${url.search}`;
  } catch { return ""; }
}

export function sameStoreLocation(a: LocationIdentity, b: LocationIdentity) {
  const aName = normalized(a.name), bName = normalized(b.name);
  const aAddress = normalized(a.address), bAddress = normalized(b.address);
  // Even the same brand and website can represent separate branches.
  if (aAddress && bAddress && aAddress !== bAddress) return false;
  const aUrl = locationUrl(a.websiteUrl), bUrl = locationUrl(b.websiteUrl);
  const sameUrl = Boolean(aUrl && aUrl === bUrl);
  if (aName && aName === bName) {
    if (aAddress && aAddress === bAddress) return true;
    if (sameUrl) return true;
    // No evidence of a separate branch: ask for its address/URL instead of
    // automatically creating another record with only the same name.
    if (!aUrl || !bUrl) return true;
  }
  // Instagram display names vary, but an identical profile identifies the
  // same candidate unless separate branch addresses are explicitly present.
  return sameUrl && /^instagram\.com\/[^/?]+$/u.test(aUrl);
}

export function uniqueAdditionalLocations<T extends LocationIdentity>(primary: LocationIdentity, candidates: T[]) {
  const accepted: T[] = [];
  for (const candidate of candidates) {
    if (sameStoreLocation(primary, candidate) || accepted.some((other) => sameStoreLocation(other, candidate))) continue;
    accepted.push(candidate);
  }
  return accepted;
}
