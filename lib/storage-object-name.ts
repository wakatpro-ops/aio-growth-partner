const allowedImportExtensions = new Set(["csv", "tsv", "xlsx", "xls", "pdf"]);

function importExtension(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/gu, "") ?? "";
  return allowedImportExtensions.has(extension) ? extension : "bin";
}

export function buildImportStorageFileName(originalFileName: string, checksum: string) {
  const extension = importExtension(originalFileName);
  const withoutExtension = originalFileName.replace(/\.[^.]*$/u, "");
  const asciiBase = withoutExtension
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/gu, "-")
    .replace(/^[-_]+|[-_]+$/gu, "")
    .slice(0, 80);
  const normalizedChecksum = checksum.toLowerCase().replace(/[^a-f0-9]/gu, "");
  const checksumSuffix = normalizedChecksum.length >= 16 ? normalizedChecksum.slice(0, 16) : "file";
  const base = asciiBase || "sales-import";

  return `${base}-${checksumSuffix}.${extension}`;
}
