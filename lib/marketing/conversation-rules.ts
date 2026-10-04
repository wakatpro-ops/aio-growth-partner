export type Channel = "google_business_profile" | "instagram" | "aio_service" | "aio_profile" | "aio_questions";
export type Offer = { id: string; priority: number; weight: number; text: string; label: string; href?: string; channel?: Channel };
export type Brief = { channel: Channel; subject: string; details: string; itemId?: string };
export type Conversation = {
  step?: "subject" | "details" | "confirm" | "generating" | "done";
  brief?: Brief; deferred?: Record<string, number>; actionId?: string;
  generationId?: string; lease?: string; leaseUntil?: number;
};
export type Facts = { google: boolean; instagram: boolean; unanswered: number; pending: number; urgent?: number; googleEnabled: boolean; googleConnectEnabled?: boolean; instagramEnabled: boolean };
export function offersFor(storeId: string, facts: Facts): Offer[] {
  const base = `/stores/${storeId}`;
  const offers: Offer[] = [];
  if (facts.unanswered) offers.push({ id: "reviews", priority: 100, weight: 1, text: `未返信の口コミが${facts.unanswered}件あります。内容を確認して返信を準備しませんか？`, label: "口コミを確認する", href: `${base}/marketing/reviews#review-tools` });
  if (facts.pending) offers.push({ id: "drafts", priority: facts.urgent ? 110 : 90, weight: 1, text: facts.urgent ? `優先度が高い、または予定日を迎えた下書きが${facts.urgent}件あります。先に確認しませんか？` : `確認待ちの投稿が${facts.pending}件あります。仕上げてみませんか？`, label: "下書きを確認する", href: `${base}/growth-actions` });
  if ((facts.googleConnectEnabled ?? facts.googleEnabled) && !facts.google) offers.push({ id: "connect-google", priority: 120, weight: 1, text: "Googleの連携がまだ完了していないようです。口コミや投稿を管理できるよう、接続と対象店舗の選択を進めませんか？", label: "Googleの接続画面へ", href: `${base}/settings/google` });
  if (facts.googleEnabled && facts.google) offers.push({ id: "post-google", priority: 50, weight: 3, channel: "google_business_profile", text: "お店のおすすめをGoogleに投稿しませんか？一緒に下書きを作れます。", label: "下書きを作ってみる" });
  if (facts.instagramEnabled && facts.instagram) offers.push({ id: "post-instagram", priority: 50, weight: 2, channel: "instagram", text: "Instagramで紹介する投稿を準備しませんか？まずは文章の下書きを作りましょう。", label: "下書きを作ってみる" });
  offers.push({ id: "aio", priority: 40, weight: 1, text: "検索やAIにお店の魅力が伝わるように、店舗情報を整えてみませんか？", label: "検索・AI対策を確認", href: `${base}/marketing/aio-improvement` });
  return offers;
}
// Stable for the same page visit/day. Randomness never overrides priority.
export function chooseOffer<T extends Offer>(offers: T[], deferred: Record<string, number> = {}, now = Date.now(), seed = ""): T | null {
  const available = offers.filter(offer => !(deferred[offer.id] > now));
  const priority = Math.max(...available.map(offer => offer.priority));
  const peers = available.filter(offer => offer.priority === priority);
  if (!peers.length) return null;
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  let pick = (hash >>> 0) % peers.reduce((total, peer) => total + peer.weight, 0);
  for (const peer of peers) { pick -= peer.weight; if (pick < 0) return peer; }
  return peers[0];
}
export const channelLabel = (channel?: Channel) => ({ instagram: "Instagram", google_business_profile: "Google", aio_service: "サービスの紹介文", aio_profile: "お店の強み", aio_questions: "見つけてもらいたい質問" })[channel ?? "google_business_profile"];
