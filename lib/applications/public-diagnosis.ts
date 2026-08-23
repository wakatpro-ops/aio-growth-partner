import type { ExtractedStoreProfile } from "@/lib/applications/page-extraction";

export type StoreIdentification = {
  identified: boolean;
  confidence: "high" | "medium" | "low";
  label: string;
  reason: string;
};

export type DiagnosisSource = {
  url: string;
  label: string;
  kind: "input" | "official" | "google" | "portal" | "sns" | "other";
};

export type ExpectedOutcome = {
  title: string;
  description: string;
};

const genericStoreNames = [
  /^google(?: maps?| マップ)?$/iu,
  /^google map$/iu,
  /^食べログ$/u,
  /^ホットペッパー(?:ビューティー|グルメ)?$/u,
  /^instagram$/iu,
  /^facebook$/iu,
  /^店舗情報$/u,
  /^地図$/u
];

export function isGenericStoreName(value: string) {
  const normalized = value.replace(/[|｜\-–—].*$/u, "").replace(/\s+/gu, " ").trim();
  return !normalized || genericStoreNames.some((pattern) => pattern.test(normalized));
}

export function assessStoreIdentification(profile: ExtractedStoreProfile): StoreIdentification {
  const hasName = !isGenericStoreName(profile.store_name);
  const strongSignals = [profile.address, profile.phone].filter(Boolean).length;
  const descriptiveSignals = [profile.description.length >= 24, profile.services.length > 0, profile.industry_key !== "other_service"].filter(Boolean).length;
  const identified = hasName && (strongSignals >= 1 || descriptiveSignals >= 2);
  const confidence = identified && strongSignals >= 1 && descriptiveSignals >= 1
    ? "high"
    : identified
      ? "medium"
      : "low";
  return {
    identified,
    confidence,
    label: confidence === "high" ? "店舗を確認できました" : confidence === "medium" ? "店舗候補を確認できました" : "店舗を特定できませんでした",
    reason: identified
      ? "店舗情報は登録後さらに解析しシステムの基本情報としてそのまま活用します。"
      : "店舗名と所在地など、別の店舗と区別するための情報を確認できませんでした。"
  };
}

function normalizedIdentity(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/株式会社|有限会社|合同会社|店舗|支店/gu, "").replace(/[\s　()（）・,，.。\-‐‑–—−ー丁目番地号]/gu, "");
}

export function identityTextMatches(left: string, right: string) {
  const a = normalizedIdentity(left);
  const b = normalizedIdentity(right);
  return Boolean(a && b && (a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)))));
}

export function researchedIdentityMatches(base: ExtractedStoreProfile, candidate: ExtractedStoreProfile, storeHint = "") {
  const baseIdentified = assessStoreIdentification(base).identified;
  if (storeHint && !identityTextMatches(candidate.store_name, storeHint)) return false;
  if (!baseIdentified) return assessStoreIdentification(candidate).identified;
  if (!identityTextMatches(base.store_name, candidate.store_name)) return false;
  if (base.phone && candidate.phone && base.phone.replace(/\D/gu, "") !== candidate.phone.replace(/\D/gu, "")) return false;
  if (base.address && candidate.address && !identityTextMatches(base.address, candidate.address)) return false;
  return true;
}

function areaLabel(address: string) {
  return address.match(/(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)?([^\s]{1,12}(?:市|区|町|村))/u)?.[0]
    || address.split(/[\s　]/u)[0]
    || "地域";
}

function representativeService(profile: ExtractedStoreProfile) {
  const explicit = profile.services.find((value) => !/登録|ログイン|店舗情報|メニュー・コース|コース\s*\(\s*0/iu.test(value));
  if (explicit) return explicit;
  const signal = `${profile.store_name} ${profile.description}`;
  const known = signal.match(/焼肉|ヘッドスパ|ハーブピーリング|アロマリンパマッサージ|整体|美容室|ネイル|カフェ|居酒屋|車検|リフォーム/iu)?.[0];
  return known || profile.industry_label || "サービス";
}

export function buildExpectedOutcomes(profile: ExtractedStoreProfile): ExpectedOutcome[] {
  const area = areaLabel(profile.address);
  const service = representativeService(profile);
  const strength = profile.strengths[0] || "お店ならではの特徴";
  return [
    {
      title: "見つけてもらいたい検索テーマを整理",
      description: `「${area}で${service}を探す」など、この店舗がおすすめ候補になるための質問を具体化できます。`
    },
    {
      title: "店舗情報のばらつきや不足を発見",
      description: "公式サイト・Google・予約サイト・SNSなどを比較し、店舗名、住所、営業時間、メニューの違いを確認できます。"
    },
    {
      title: "選ばれる理由をAIに伝わる形へ整理",
      description: `${strength}などの魅力を、検索する人にもAIにも理解しやすい店舗情報へ整えられます。`
    },
    {
      title: "Google・SNS投稿の準備を効率化",
      description: "メニューや写真を基に、媒体ごとに使いやすい投稿文や返信文の下書きを作成できます。"
    },
    {
      title: "改善前後の変化を継続して確認",
      description: "公開情報の整備状況や検索での見つかり方を記録し、次に取り組む改善を分かりやすくできます。"
    }
  ];
}

function sourceKind(hostname: string): DiagnosisSource["kind"] {
  if (/google\./iu.test(hostname) || /goo\.gl$/iu.test(hostname)) return "google";
  if (/tabelog|hotpepper|epark|ikyu|gurunavi|retty/iu.test(hostname)) return "portal";
  if (/instagram|facebook|twitter|x\.com|tiktok|youtube/iu.test(hostname)) return "sns";
  return "other";
}

function sourceLabel(hostname: string, kind: DiagnosisSource["kind"]) {
  if (kind === "google") return "Google マップ";
  if (/tabelog/iu.test(hostname)) return "食べログ";
  if (/hotpepper/iu.test(hostname)) return "ホットペッパー";
  if (kind === "sns") return hostname.replace(/^www\./u, "");
  return hostname.replace(/^www\./u, "");
}

export function normalizeDiagnosisSources(
  inputUrl: string,
  discovered: Array<{ url?: unknown; label?: unknown; kind?: unknown }> = []
): DiagnosisSource[] {
  const candidates = [{ url: inputUrl, label: "", kind: "input" }, ...discovered];
  const sources: DiagnosisSource[] = [];
  const sourceGroups = new Set<string>();
  for (const candidate of candidates) {
    try {
      const url = new URL(String(candidate.url ?? ""));
      if (!["http:", "https:"].includes(url.protocol)) continue;
      url.hash = "";
      const inferredKind = candidate.kind === "official" ? "official" : sourceKind(url.hostname);
      const kind = candidate.kind === "input" ? "input" : inferredKind;
      const suppliedLabel = String(candidate.label ?? "").trim().slice(0, 80);
      const label = candidate.kind === "input"
        ? `${sourceLabel(url.hostname, inferredKind)}（入力URL）`
        : suppliedLabel || sourceLabel(url.hostname, inferredKind);
      const hostname = url.hostname.replace(/^www\./u, "").toLowerCase();
      const sourceGroup = /google\.|goo\.gl$/u.test(hostname) ? "google" : hostname;
      if (sourceGroups.has(sourceGroup)) continue;
      sources.push({ url: url.toString(), label, kind });
      sourceGroups.add(sourceGroup);
    } catch {
      // Ignore malformed model output.
    }
  }
  return sources.slice(0, 6);
}

export function webCitationSources(response: unknown) {
  const responseRecord = response && typeof response === "object" ? response as Record<string, unknown> : {};
  const output = Array.isArray(responseRecord.output) ? responseRecord.output : [];
  return output.flatMap((item) => {
    const itemRecord = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    return content.flatMap((part) => {
      const partRecord = part && typeof part === "object" ? part as Record<string, unknown> : {};
      const annotations = Array.isArray(partRecord.annotations) ? partRecord.annotations : [];
      return annotations.flatMap((annotation) => {
        const citation = annotation && typeof annotation === "object" ? annotation as Record<string, unknown> : {};
        if (citation.type !== "url_citation" || typeof citation.url !== "string" || !/^https?:\/\//iu.test(citation.url)) return [];
        const title = typeof citation.title === "string" && citation.title.trim()
          ? citation.title.trim().slice(0, 80)
          : "検索で確認した公開ページ";
        return [{ url: citation.url, label: title, kind: "other" }];
      });
    });
  });
}
