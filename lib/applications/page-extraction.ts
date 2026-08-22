import type { IndustryTypeKey } from "@/types/domain";
import type { PublicPageSnapshot } from "@/lib/applications/url-safety";

export type EvidenceOrigin = "published" | "inferred" | "missing";

export type ExtractedStoreProfile = {
  store_name: string;
  company_name: string;
  industry_key: IndustryTypeKey;
  industry_label: string;
  address: string;
  phone: string;
  opening_hours: string;
  description: string;
  services: string[];
  strengths: string[];
  target_customers: string[];
  social_urls: string[];
  source_urls: string[];
  location_candidates: Array<{
    name: string;
    address: string;
    website_url: string;
    company_name: string;
    brand_name: string;
  }>;
  detected_systems: Record<"sales" | "reservations" | "customers" | "inventory" | "accounting", string[]>;
  operating_signals: {
    reservation: boolean;
    walk_in: boolean;
    staff: boolean;
    room: boolean;
    equipment: boolean;
    table: boolean;
  };
  field_origins: Record<string, EvidenceOrigin>;
};

const industrySignals: Array<{ key: IndustryTypeKey; label: string; pattern: RegExp }> = [
  { key: "beauty_salon", label: "美容室・サロン", pattern: /美容室|美容院|ヘッドスパ|エステ|ネイル|まつげ|リンパ|マッサージ|サロン/iu },
  { key: "clinic_bodycare", label: "クリニック・整体・治療院", pattern: /クリニック|医院|歯科|整体|整骨|接骨|鍼灸|治療院/iu },
  { key: "restaurant", label: "飲食店", pattern: /レストラン|カフェ|喫茶|居酒屋|料理|ランチ|ディナー|飲食店|メニュー/iu },
  { key: "auto_repair", label: "自動車整備", pattern: /自動車整備|車検|板金|鈑金|タイヤ交換|オイル交換/iu },
  { key: "retail", label: "小売店", pattern: /小売|販売店|ショップ|商品販売|オンラインストア/iu },
  { key: "real_estate", label: "不動産", pattern: /不動産|賃貸|売買物件|マンション|土地/iu },
  { key: "school", label: "スクール・教室", pattern: /スクール|教室|レッスン|講座|塾/iu },
  { key: "hotel_tourism", label: "宿泊・観光", pattern: /ホテル|旅館|宿泊|観光|ゲストハウス/iu },
  { key: "professional_service", label: "士業・専門サービス", pattern: /弁護士|税理士|司法書士|行政書士|社労士|会計事務所/iu },
  { key: "construction_renovation", label: "建設・リフォーム", pattern: /建設|工務店|リフォーム|外壁|塗装|施工/iu }
];

const industryLabels: Record<IndustryTypeKey, string> = {
  general_store: "店舗・サービス業",
  auto_repair: "自動車整備",
  beauty_salon: "美容室・サロン",
  clinic_bodycare: "クリニック・整体・治療院",
  restaurant: "飲食店",
  retail: "小売店",
  real_estate: "不動産",
  school: "スクール・教室",
  hotel_tourism: "宿泊・観光",
  professional_service: "士業・専門サービス",
  construction_renovation: "建設・リフォーム",
  other_service: "その他店舗・サービス業"
};

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©" };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? " ";
  });
}

function cleanText(value: string, limit = 400) {
  return decodeEntities(value).replace(/<[^>]+>/gu, " ").replace(/[\t\r\n ]+/gu, " ").trim().slice(0, limit);
}

export function htmlToVisibleText(html: string, limit = 24_000) {
  return cleanText(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/giu, " ")
      .replace(/<!--([\s\S]*?)-->/gu, " "),
    limit
  );
}

function unique(values: unknown[], limit = 12) {
  return Array.from(new Set(values.map((value) => cleanText(String(value), 180)).filter((value) => value.length >= 2))).slice(0, limit);
}

function jsonLdBlocks(html: string) {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      blocks.push(JSON.parse(decodeEntities(match[1]).trim()));
    } catch {
      // Invalid structured data is ignored; visible text remains available.
    }
  }
  return blocks;
}

function walkJson(value: unknown, visit: (record: Record<string, unknown>) => void) {
  if (Array.isArray(value)) return value.forEach((item) => walkJson(item, visit));
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  visit(record);
  Object.values(record).forEach((item) => walkJson(item, visit));
}

function addressFrom(value: unknown) {
  if (typeof value === "string") return cleanText(value, 240);
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return cleanText([
    record.postalCode,
    record.addressRegion,
    record.addressLocality,
    record.streetAddress
  ].filter(Boolean).join(" "), 240);
}

function metaContent(html: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/giu) ?? []) {
    const name = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/iu)?.[1]?.toLowerCase();
    if (name !== key.toLowerCase()) continue;
    return cleanText(tag.match(/content\s*=\s*["']([^"']*)["']/iu)?.[1] ?? "", 500);
  }
  return "";
}

function titleStoreName(title: string) {
  return cleanText(title.split(/\s*[|｜–—]\s*/u)[0] ?? title, 140);
}

function extractSocialUrls(html: string, baseUrl: string) {
  const hosts = /instagram\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|line\.me|lin\.ee/iu;
  const urls: string[] = [];
  for (const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/giu)) {
    try {
      const url = new URL(decodeEntities(match[1]), baseUrl);
      if (hosts.test(url.hostname)) urls.push(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }
  return unique(urls, 12);
}

function detectIndustry(text: string) {
  const match = industrySignals.find((signal) => signal.pattern.test(text));
  return match ?? { key: "other_service" as IndustryTypeKey, label: industryLabels.other_service };
}

function extractJapaneseAddress(text: string) {
  return text.match(/(?:〒\s*\d{3}-?\d{4}\s*)?(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)[^。\n|｜]{3,80}/u)?.[0]?.trim().replace(/(?:電話|TEL|営業時間).*$/iu, "").trim().slice(0, 240) ?? "";
}

function extractPhone(text: string) {
  return text.match(/(?:TEL|電話|Phone)?\s*[:：]?\s*(0\d{1,4}[-‐‑–—−ー ]?\d{1,4}[-‐‑–—−ー ]?\d{3,4})/iu)?.[1]?.replace(/[‐‑–—−ー ]/gu, "-") ?? "";
}

function visibleServiceCandidates(html: string) {
  const values: string[] = [];
  for (const match of html.matchAll(/<(?:h2|h3|li)\b[^>]*>([\s\S]*?)<\/(?:h2|h3|li)>/giu)) {
    const value = cleanText(match[1], 120);
    if (value.length >= 2 && value.length <= 80 && /メニュー|コース|施術|サービス|カット|カラー|スパ|マッサージ|ランチ|修理|車検|相談|レッスン|プラン|¥|￥|円/iu.test(value)) values.push(value);
  }
  return unique(values, 10);
}

const systemSignals: Record<keyof ExtractedStoreProfile["detected_systems"], Array<[string, RegExp]>> = {
  sales: [["Airレジ", /Air\s*レジ|エアレジ/iu], ["Square", /Square/iu], ["スマレジ", /スマレジ/iu], ["POS+", /POS\+/iu], ["Uレジ", /Uレジ/iu]],
  reservations: [["ホットペッパービューティー", /ホットペッパー(?:ビューティー)?/iu], ["STORES予約", /STORES\s*予約/iu], ["RESERVA", /RESERVA/iu], ["Airリザーブ", /Air\s*リザーブ|エアリザーブ/iu], ["EPARK", /EPARK/iu], ["TableCheck", /TableCheck/iu]],
  customers: [["LINE公式アカウント", /LINE公式(?:アカウント)?/iu], ["Salesforce", /Salesforce/iu]],
  inventory: [["ロジクラ", /ロジクラ/iu], ["zaico", /zaico/iu]],
  accounting: [["freee", /freee/iu], ["マネーフォワード", /マネーフォワード/iu], ["弥生", /弥生/iu]]
};

function detectedSystems(text: string): ExtractedStoreProfile["detected_systems"] {
  return Object.fromEntries(Object.entries(systemSignals).map(([key, candidates]) => [
    key,
    candidates.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
  ])) as ExtractedStoreProfile["detected_systems"];
}

export function extractStoreProfile(pages: PublicPageSnapshot[]): ExtractedStoreProfile {
  const primary = pages[0];
  const fullVisibleText = pages.map((page) => `${page.title} ${page.description} ${htmlToVisibleText(page.html)}`).join(" ").slice(0, 60_000);
  const structured: Record<string, unknown>[] = [];
  pages.flatMap((page) => jsonLdBlocks(page.html)).forEach((block) => walkJson(block, (record) => structured.push(record)));
  const businessRecords = structured.filter((record) => {
    const type = Array.isArray(record['@type']) ? record['@type'].join(" ") : String(record['@type'] ?? "");
    return /LocalBusiness|Organization|Store|Restaurant|Salon|Beauty|Medical|AutoRepair|ProfessionalService|Hotel|School/iu.test(type);
  });
  const primaryBusiness = businessRecords.find((record) => record.name || record.address || record.telephone) ?? {};

  const storeName = cleanText(String(primaryBusiness.name ?? ""), 140)
    || cleanText(metaContent(primary.html, "og:site_name"), 140)
    || titleStoreName(primary.title);
  const companyName = cleanText(String(businessRecords.find((record) => /Organization/iu.test(String(record['@type'] ?? "")))?.name ?? ""), 140);
  const address = addressFrom(primaryBusiness.address) || extractJapaneseAddress(fullVisibleText);
  const phone = cleanText(String(primaryBusiness.telephone ?? ""), 80) || extractPhone(fullVisibleText);
  const openingHours = unique([
    primaryBusiness.openingHours,
    (primaryBusiness.openingHoursSpecification as Record<string, unknown> | undefined)?.opens
  ].flat(), 8).join(" / ");
  const description = cleanText(String(primaryBusiness.description ?? ""), 600)
    || metaContent(primary.html, "description")
    || primary.description;
  const structuredServices: unknown[] = [];
  structured.forEach((record) => {
    const type = String(record['@type'] ?? "");
    if (/Service|Offer|Product|MenuItem/iu.test(type) && record.name) structuredServices.push(record.name);
  });
  const services = unique([...structuredServices, ...pages.flatMap((page) => visibleServiceCandidates(page.html))], 12);
  const socialUrls = unique(pages.flatMap((page) => extractSocialUrls(page.html, page.url)), 12);
  const industry = detectIndustry(`${storeName} ${description} ${services.join(" ")} ${fullVisibleText.slice(0, 12_000)}`);
  const locationCandidates = businessRecords.flatMap((business) => {
    const type = Array.isArray(business['@type']) ? business['@type'].join(" ") : String(business['@type'] ?? "");
    const name = cleanText(String(business.name ?? ""), 140);
    const candidateAddress = addressFrom(business.address);
    const websiteUrl = cleanText(String(business.url ?? ""), 2_000);
    if (/^Organization$/iu.test(type.trim()) && !candidateAddress) return [];
    if (!name && !candidateAddress && !websiteUrl) return [];
    return [{
      name,
      address: candidateAddress,
      website_url: websiteUrl,
      company_name: /Organization/iu.test(type) ? name : companyName,
      brand_name: cleanText(String((business.brand as Record<string, unknown> | undefined)?.name ?? business.brand ?? ""), 140)
    }];
  }).filter((candidate, index, values) => values.findIndex((item) => `${item.name}|${item.address}|${item.website_url}` === `${candidate.name}|${candidate.address}|${candidate.website_url}`) === index).slice(0, 10);
  const systems = detectedSystems(fullVisibleText);
  const operatingSignals = {
    reservation: /予約|appointment|reserve/iu.test(fullVisibleText),
    walk_in: /予約なし|飛び込み|当日受付|walk[ -]?in/iu.test(fullVisibleText),
    staff: /スタッフ|担当者|指名|stylist|therapist/iu.test(fullVisibleText),
    room: /個室|施術室|room/iu.test(fullVisibleText),
    equipment: /設備|機器|マシン|equipment/iu.test(fullVisibleText),
    table: /席|テーブル|座席|table/iu.test(fullVisibleText)
  };

  return {
    store_name: storeName,
    company_name: companyName,
    industry_key: industry.key,
    industry_label: industry.label,
    address,
    phone,
    opening_hours: openingHours,
    description,
    services,
    strengths: [],
    target_customers: [],
    social_urls: socialUrls,
    source_urls: pages.map((page) => page.url),
    location_candidates: locationCandidates.length ? locationCandidates : [{
      name: storeName,
      address,
      website_url: primary.url,
      company_name: companyName,
      brand_name: ""
    }],
    detected_systems: systems,
    operating_signals: operatingSignals,
    field_origins: {
      store_name: storeName ? "published" : "missing",
      company_name: companyName ? "published" : "missing",
      industry_key: industry.key === "other_service" ? "inferred" : "inferred",
      address: address ? "published" : "missing",
      phone: phone ? "published" : "missing",
      opening_hours: openingHours ? "published" : "missing",
      description: description ? "published" : "missing",
      services: services.length ? "published" : "missing",
      strengths: "missing",
      target_customers: "missing"
    }
  };
}

export type ReadinessItem = {
  key: string;
  label: string;
  earned: number;
  weight: number;
  status: "確認できました" | "一部確認" | "確認が必要";
  detail: string;
};

export type ClarifyingQuestion = {
  id: string;
  label: string;
  question: string;
  placeholder: string;
};

export function buildRuleBasedDiagnosis(profile: ExtractedStoreProfile) {
  const identityParts = [profile.store_name, profile.address, profile.phone].filter(Boolean).length;
  const identityEarned = [0, 8, 16, 25][identityParts];
  const offeringEarned = profile.services.length > 0 ? 25 : profile.description ? 12 : 0;
  const localEarned = profile.address ? 15 : 0;
  const distinctionEarned = profile.strengths.length > 0 ? 15 : profile.description ? 7 : 0;
  const trustEarned = profile.source_urls.length > 0 ? 20 : 0;
  const items: ReadinessItem[] = [
    { key: "identity", label: "店舗の基本情報", earned: identityEarned, weight: 25, status: identityEarned === 25 ? "確認できました" : identityEarned > 0 ? "一部確認" : "確認が必要", detail: identityEarned === 25 ? "店舗名・地域・連絡先を確認できました。" : "店舗名・住所・電話番号の確認が必要です。" },
    { key: "offering", label: "メニュー・提供内容", earned: offeringEarned, weight: 25, status: offeringEarned === 25 ? "確認できました" : offeringEarned > 0 ? "一部確認" : "確認が必要", detail: offeringEarned === 25 ? "具体的なサービスを確認できました。" : "代表的なメニューやサービスを追加するとおすすめ理由が明確になります。" },
    { key: "local", label: "地域情報", earned: localEarned, weight: 15, status: localEarned === 15 ? "確認できました" : "確認が必要", detail: localEarned ? "所在地を確認できました。" : "おすすめされたい地域を確認する必要があります。" },
    { key: "distinction", label: "特徴・強み", earned: distinctionEarned, weight: 15, status: distinctionEarned === 15 ? "確認できました" : distinctionEarned > 0 ? "一部確認" : "確認が必要", detail: distinctionEarned === 15 ? "選ばれる理由を確認できました。" : "他店との違いや得意なことを具体化できます。" },
    { key: "trust", label: "確認できる公開情報", earned: trustEarned, weight: 20, status: trustEarned === 20 ? "確認できました" : "確認が必要", detail: trustEarned ? "公開ページを信頼情報の起点として確認しました。" : "公開情報の参照先が必要です。" }
  ];
  const score = items.reduce((sum, item) => sum + item.earned, 0);
  const area = profile.address.match(/(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)?([^\s]{1,12}(?:市|区|町|村))/u)?.[1] || profile.address || "この地域";
  const service = profile.services[0] || profile.industry_label.replace(/・/gu, "") || "お店";
  const questions = [
    `${area}で${service}を探すなら、どこがおすすめ？`,
    `${area}で安心して相談できる${profile.industry_label}は？`,
    `${profile.store_name || "このお店"}はどんな人におすすめ？`
  ];
  const clarifying: ClarifyingQuestion[] = [];
  if (!profile.address) clarifying.push({ id: "address", label: "店舗の地域・住所", question: "お店がある地域または住所を教えてください。", placeholder: "例: 東京都杉並区梅里2丁目" });
  if (profile.services.length === 0) clarifying.push({ id: "services", label: "代表的なメニュー", question: "特におすすめしたいメニューやサービスは何ですか？", placeholder: "例: ハーブピーリング、アロマリンパマッサージ" });
  if (profile.strengths.length === 0) clarifying.push({ id: "strengths", label: "お店の強み", question: "お客様から選ばれている理由や得意なことは何ですか？", placeholder: "例: 完全個室で、一人ひとりに合わせた施術" });
  if (clarifying.length < 3 && profile.target_customers.length === 0) clarifying.push({ id: "target_customers", label: "おすすめしたいお客様", question: "特にどのようなお客様に来てほしいですか？", placeholder: "例: 肌質改善をしたい30〜50代の女性" });
  const top = items.filter((item) => item.earned < item.weight).sort((a, b) => (b.weight - b.earned) - (a.weight - a.earned))[0] ?? items[0];
  const recommendedModules = [
    { key: "aio_improvement", label: "AIO改善", reason: "想定質問と不足情報から最初の改善を案内します。" },
    { key: "customer_management", label: "顧客管理", reason: "来店後の関係づくりと再来店施策につなげます。" },
    { key: "marketing", label: "集客・投稿", reason: "店舗の特徴をGoogleやSNS向けの下書きに活用します。" },
    { key: "sales", label: "売上管理", reason: "導入後の変化を売上データと合わせて確認します。" }
  ];

  return {
    business_summary: profile.description || (profile.store_name ? `${profile.store_name}の公開情報を確認しました。内容を確認して、不足している情報だけ追加できます。` : "公開ページから確認できた情報を整理しました。"),
    readiness_score: score,
    readiness_items: items,
    target_questions: questions,
    top_improvement: { key: top.key, title: top.label, description: top.detail },
    clarifying_questions: clarifying.slice(0, 3),
    recommended_modules: recommendedModules
  };
}
