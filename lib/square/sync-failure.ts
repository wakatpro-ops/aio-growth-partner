import { z } from "zod";

export type SquareSyncStage = "credentials" | "refresh" | "locations" | "orders" | "normalize" | "persist";
const codes = new Set(["store_mismatch", "square_unavailable", "square_rate_limited", "square_reconnect_required", "sync_failed", "invalid_provider_data", "square_response_too_large", "square_return_needs_review"]);
const databaseReasons = new Set(["lease_or_permission_invalid", "store_mismatch", "invalid_page", "duplicate_source_id", "invalid_transaction", "duplicate_item_identity", "totals_do_not_reconcile", "conflicting_revision", "invalid_item"]);

// Only schema metadata and allowlisted machine codes. Never log provider bodies,
// order/customer values, credentials, arbitrary exception messages or stacks.
export function squareSyncFailure(stage: SquareSyncStage, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const code = codes.has(message) ? message : "invalid_provider_data";
  return {
    stage, code,
    ...(error instanceof z.ZodError ? { issues: error.issues.slice(0, 8).map(issue => ({ code: issue.code, path: issue.path.map(key => typeof key === "number" ? "*" : /^[a-zA-Z_]+$/u.test(key) ? key : "field").join(".") })) } : {}),
    ...(stage === "persist" && error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9]{5}$/u.test(error.code) ? { databaseCode: error.code } : {}),
    ...(stage === "persist" && databaseReasons.has(message) ? { databaseReason: message } : {})
  };
}

export function squareOrderShape(value: unknown) {
  const order = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const lines = Array.isArray(order.line_items) ? order.line_items : [];
  return {
    missingClosedAt: order.closed_at == null,
    lines: lines.length,
    missingLineNames: lines.filter(line => !line || typeof line.name !== "string" || !line.name.trim()).length,
    longLineNames: lines.filter(line => typeof line?.name === "string" && line.name.length > 300).length,
    nonAlphanumericLineIds: lines.filter(line => typeof line?.uid !== "string" || !/^[A-Za-z0-9_-]{1,160}$/u.test(line.uid)).length,
    missingBasePrices: lines.filter(line => line?.base_price_money == null).length
  };
}
