function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDate(value: unknown) {
  const input = text(value).replace(/[年月]/gu, "-").replace(/日/gu, "").replace(/[./]/gu, "-");
  const compact = input.match(/^(\d{4})(\d{2})(\d{2})$/u);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : input;
}

function normalizeTime(value: unknown) {
  const input = text(value);
  const compact = input.match(/^(\d{2})(\d{2})(\d{2})$/u);
  if (compact) return `${compact[1]}:${compact[2]}:${compact[3]}`;
  const hoursMinutes = input.match(/^(\d{2})(\d{2})$/u);
  return hoursMinutes ? `${hoursMinutes[1]}:${hoursMinutes[2]}:00` : input;
}

export function parseImportDateIso(dateValue: unknown, timeValue?: unknown) {
  const date = normalizeDate(dateValue);
  if (!date) return null;
  const time = normalizeTime(timeValue);
  const input = time ? `${date}T${time}+09:00` : date;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function normalizeImportBusinessDate(value: unknown) {
  const date = normalizeDate(value);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) && parseImportDateIso(date) ? date : null;
}
