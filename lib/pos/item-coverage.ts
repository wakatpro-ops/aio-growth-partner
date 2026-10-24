// A financially correct return may have no defensible product allocation.
// Never infer item-level performance from totals alone, or let opposite gaps
// cancel each other out when assessing completeness.
export function itemAmountDifference(total: number, amounts: number[]) {
  const gap = total - amounts.reduce((sum, amount) => sum + amount, 0);
  return Math.abs(gap) < 0.005 ? 0 : gap;
}

export function inspectItemCoverage(rows: Array<{ gross_amount: number; items?: Array<{ total_amount: number }>; source_metadata?: { square_pos_state?: string } }>) {
  let unallocatedAmount = 0, incompleteTransactionCount = 0;
  for (const row of rows) {
    const gap = itemAmountDifference(Number(row.gross_amount), (row.items ?? []).map(item => Number(item.total_amount)));
    unallocatedAmount += gap;
    const squareState = row.source_metadata?.square_pos_state;
    if (gap !== 0 || ((squareState === "sale" || squareState === "refund") && !row.items?.length)) incompleteTransactionCount++;
  }
  return { complete: incompleteTransactionCount === 0, incompleteTransactionCount, unallocatedAmount };
}
