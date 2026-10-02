function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFKC").trim() : "";
}

function dateParts(value: unknown) {
  const input = text(value)
    .replace(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u, "$1-$2-$3")
    .replace(/^(\d{4})(\d{2})(\d{2})(?=$|[Tt\s])/u, "$1-$2-$3");
  const match = input.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:[Tt\s]+(.+))?$/u);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[3]);
  const day = Number(match[4]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  return { date: `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, time: match[5]?.trim() ?? "" };
}

function timeParts(value: unknown) {
  const input = text(value)
    .replace(/^(\d{2})(\d{2})(\d{2})$/u, "$1:$2:$3")
    .replace(/^(\d{2})(\d{2})$/u, "$1:$2:00");
  const match = input.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?([Zz]|[+-]\d{2}:?\d{2})?$/u);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) return null;
  const zone = match[5]?.toUpperCase().replace(/^([+-]\d{2})(\d{2})$/u, "$1:$2") ?? "+09:00";
  if (zone !== "Z") {
    const hours = Number(zone.slice(1, 3));
    const minutes = Number(zone.slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  }
  return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}.${(match[4] ?? "0").padEnd(3, "0")}${zone}`;
}

/** Date-only inputs retain UTC midnight; explicit local times are interpreted in Japan. */
export function parseImportDateIso(dateValue: unknown, timeValue?: unknown) {
  const parts = dateParts(dateValue);
  if (!parts) return null;
  const separateTime = text(timeValue);
  // Two independent clocks must not be silently combined or one discarded.
  if (parts.time && separateTime) return null;
  const rawTime = separateTime || parts.time;
  const time = rawTime ? timeParts(rawTime) : "00:00:00.000Z";
  if (!time) return null;
  const date = new Date(`${parts.date}T${time}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Preserve the source calendar date, including single-digit month/day and Japanese formats. */
export function normalizeImportBusinessDate(value: unknown) {
  const parts = dateParts(value);
  return parts && (!parts.time || timeParts(parts.time)) ? parts.date : null;
}
