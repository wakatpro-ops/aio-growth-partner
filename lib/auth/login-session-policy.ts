/** Store-scoped memberships must never turn into organization-wide access. */
export function selectLoginStores(input: {
  organizationIds: string[];
  directStoreIds: string[];
  activeOrganizationIds: string[];
  stores: Array<{ id: string; organization_id: string }>;
}): string[] {
  return [...new Set(input.stores.filter(store =>
    input.activeOrganizationIds.includes(store.organization_id)
    && (input.organizationIds.includes(store.organization_id) || input.directStoreIds.includes(store.id))
  ).map(store => store.id))];
}
