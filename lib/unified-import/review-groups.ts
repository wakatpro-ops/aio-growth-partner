import type { ImportClarificationIssue } from "./clarification";

/** Batch only an explicit keep-original-dates decision. Never combine choices
 * of a replacement month, an amount, or a vendor across independent tables. */
export function groupImportReviewIssues(issues: readonly ImportClarificationIssue[]) {
  const groups = new Map<string, ImportClarificationIssue[]>();
  for (const issue of issues) {
    const key = issue.code === "expense_period" && issue.severity === "clarifiable"
      ? "expense-period" : issue.severity === "unprocessable"
        ? JSON.stringify([issue.tableName, issue.code]) : issue.id;
    const group = groups.get(key) ?? [];
    group.push(issue);
    groups.set(key, group);
  }
  // Answerable questions come first; source-file problems remain visible in a
  // separate per-table section, not a global "file rejected" error.
  return [...groups.values()].flatMap((group) => group[0].code === "expense_period"
    ? Array.from({ length: Math.ceil(group.length / 100) }, (_, index) => group.slice(index * 100, (index + 1) * 100)) : [group])
    .sort((a, b) => Number(a[0].severity === "unprocessable") - Number(b[0].severity === "unprocessable"));
}

export function importReviewQuestions(issues: readonly ImportClarificationIssue[]) {
  return groupImportReviewIssues(issues).map((group) => ({
    key: group[0].id, sheetName: group[0].tableName,
    prompt: group.length > 1 ? `${group[0].message}（対象${group.length}件）` : group[0].message
  }));
}
