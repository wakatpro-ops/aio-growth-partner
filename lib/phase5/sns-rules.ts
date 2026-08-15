export const SNS_CHANNELS = ["instagram", "facebook", "x", "line"] as const;
export type SnsChannel = typeof SNS_CHANNELS[number];

export const SNS_LIMITS: Record<SnsChannel, { body: number; hashtags: number }> = {
  instagram: { body: 2200, hashtags: 30 },
  facebook: { body: 5000, hashtags: 30 },
  x: { body: 280, hashtags: 6 },
  line: { body: 5000, hashtags: 10 }
};

export function normalizeHashtags(value: unknown, channel: SnsChannel) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[\s,、]+/);
  return [...new Set(source.map(String).map((item) => item.trim().replace(/^#+/, "")).filter(Boolean))]
    .slice(0, SNS_LIMITS[channel].hashtags);
}

export function constrainCaption(channel: SnsChannel, input: { body?: unknown; short_body?: unknown; hashtags?: unknown; cta?: unknown }) {
  const hashtags = normalizeHashtags(input.hashtags, channel);
  const cta = String(input.cta ?? "").trim().slice(0, 300);
  const hashtagText = hashtags.map((tag) => `#${tag}`).join(" ");
  const suffix = [cta, hashtagText].filter(Boolean).join("\n\n");
  const allowance = Math.max(0, SNS_LIMITS[channel].body - (suffix ? suffix.length + 2 : 0));
  const body = String(input.body ?? "").trim().slice(0, allowance);
  const shortBody = String(input.short_body ?? body).trim().slice(0, channel === "x" ? allowance : Math.min(500, allowance));
  const fullText = [channel === "x" ? shortBody : body, suffix].filter(Boolean).join("\n\n").slice(0, SNS_LIMITS[channel].body);
  return { body, short_body: shortBody, hashtags, cta, full_text: fullText, character_count: fullText.length, valid: fullText.length > 0 && fullText.length <= SNS_LIMITS[channel].body };
}

export function detectImageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
