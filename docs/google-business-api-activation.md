# Google Business Profile activation — Issue #156

## Verified 2026-09-26

- Basic API Access approved 2026-09-23 for project `368944976045` (`aio-growth-partner`), 300 QPM. Case `6-1655000041611`.
- Account Management and Business Information APIs were enabled already.
- Google My Business API (`mybusiness.googleapis.com`) enabled in Google Cloud after the user explicitly accepted its terms. Console shows status 有効.
- Project approval does not imply OAuth consent, a selected store, or approval to publish content.

## Behavior

- Deployment `GOOGLE_BUSINESS_PROFILE_API_STATUS=approved` overrides obsolete per-store rejection metadata. Any other explicit value closes approval gates.
- Store management scopes must be granted before candidate retrieval.
- Candidate pagination must finish successfully before reconciling cached locations. HTTP errors, malformed results, repeated tokens and page limits abort without removing a previous store selection.
- Candidates are never auto-selected. Existing server authorization, tenant boundaries, content approval and publish idempotency remain required.
- Current direct posting supports STANDARD text only. Images, CTA, offers and events remain manual workflows.

## Verification / release checklist

- Unit tests: `npm run test:google-business-policy` (9 cases including 401/403/429/500 after a successful page).
- `npm run lint`, `npm run build`, `npm run check:google-workflows`, `npm run check:google-review`.
- Static workflow checks are not live Google integration tests.
- Remaining: staging integration verification, deployment setting, PR/merge, production deployment and store-specific authenticated read check. Do not claim actual customer posts/replies were tested without explicit publication authorization.
