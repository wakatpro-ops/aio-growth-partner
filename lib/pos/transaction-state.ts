/** Canceled POS rows remain as evidence but are not sales or transaction counts. */
export const EFFECTIVE_POS_SALES_FILTER = "and(or(source_metadata->>air_regi_state.is.null,source_metadata->>air_regi_state.neq.void),or(source_metadata->>square_pos_state.is.null,source_metadata->>square_pos_state.neq.void))";
export function posTransactionState(metadata: unknown): "sale" | "refund" | "void" | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const values = metadata as { air_regi_state?: unknown; square_pos_state?: unknown };
  const states = [values.air_regi_state, values.square_pos_state];
  return states.includes("void") ? "void" : states.includes("refund") ? "refund" : states.includes("sale") ? "sale" : undefined;
}
