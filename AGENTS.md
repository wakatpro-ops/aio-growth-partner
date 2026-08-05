# AIO boost development rules

## Lifecycle completeness

When adding a persistent business entity that users can create, the implementation is incomplete until its full lifecycle is covered:

1. Create and edit.
2. Archive from the relevant list or detail page.
3. Exclude archived records from normal lists, selectors, AI inputs, exports, and aggregates.
4. Restore from an archive-management view.
5. Enforce organization and platform-admin authorization on the server.
6. Preserve related records and write an audit event.
7. Add a confirmation step and explain what is retained.
8. Test active, archived, restored, forbidden, and empty states.

Use physical deletion only for replaceable derived/cache rows or temporary failed-import rows. Payments, issued documents, external-integration history, PDF issue history, and audit logs must remain as evidence; use cancellation, voiding, disconnection, or archive instead.

Demo data must never appear as a real store or business record when a production/staging database query fails. Return an explicit empty/error state. Demo records may appear only in a clearly labelled demo context or an administrator-only diagnostic view.
