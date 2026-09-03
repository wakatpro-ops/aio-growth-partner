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

## Store-manager UX definition of done

For every store-manager-facing screen:

1. Make interactive controls look clickable; do not style static information as a button.
2. Label recoverable archive actions as `削除`, the collection as `削除済み`, and restore actions as `元に戻す`. Explain that data is retained in the confirmation.
3. Show a pending state while saving, then navigate to a list or a clear next step with a success message. Never leave a successful save on an unchanged screen with no feedback.
4. Provide a deterministic back/cancel route on create, edit, and detail screens.
5. Use outcome labels such as `請求書を作成` or `変更を保存`; avoid vague labels such as `実行`, `開く`, or `保存` when the outcome is not already obvious.
6. Keep the primary business navigation limited to `店舗トップ`, `AIO改善`, `売上・経理`, `顧客`, `集客・販促`, and the industry-specific product/inventory hub. Keep `設定` in a separate utility area and place data import inside the relevant hubs and settings.
7. Do not label the customer hub `顧客・予約` until store-facing booking creation, editing, authorization, and lifecycle tests are complete. Do not advertise unavailable integrations as active.
8. Keep first login focused on one AIO improvement. Do not require billing, tax, CSV, or integration setup before the user experiences the core value.
9. Treat `AIおすすめ準備度` as information-readiness, never as a promise that an external AI will recommend the store. Display external publication status separately.
10. For prices, state whether they are tax-inclusive or tax-exclusive. Only show the reduced 8% rate prominently for relevant industries.

See `docs/ux-product-principles.md` for the product hierarchy and review checklist.
