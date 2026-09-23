# GPT-6 Luna migration

## Scope and acceptance criteria

- Switch the default application model to `gpt-6-luna`: AIO analysis, post/review drafts, reports, store assistant, URL/application intake, receipt images, SNS image captions, and inbound email classification.
- Switch new AI visibility observations to `gpt-6-luna` too. Historical observations retain their original model and are not comparable as a same-model baseline.
- Keep existing authorization, prompts/output schemas, rule-first email processing, and owner approvals unchanged. No automatic booking/publishing behavior is added.
- Keep dedicated `OPENAI_MODEL` / `OPENAI_SEARCH_MODEL` overrides and deliberate legacy fallback candidates. Persisted template model overrides retain priority; migrate only existing legacy defaults, not custom models.
- Preserve prior non-reasoning behavior via `reasoning_effort: none` / `reasoning.effort: none`, including AI search observations (GPT-5.4's prior default was none). Use `max_completion_tokens` for Luna in Chat Completions.
- Do not rewrite historical generation logs, extracted data, or search observations.

## Verification and release

1. Unit tests validate selectors, per-model request options, and fallbacks; run existing relevant behavior tests, lint and build.
2. `AIO_OPENAI_LIVE_TEST=1 OPENAI_MODEL=gpt-6-luna node --experimental-strip-types scripts/smoke-openai-model.mjs` explicitly makes billable synthetic-only requests. It tests Chat JSON/injection resistance, image JSON, and Responses web search with none/medium reasoning. Missing credentials or fallback output are never a pass.
3. Production API key is sensitive and cannot be exported. Staging currently has no OpenAI key. Validate live calls in an isolated production-environment Vercel deployment with `--skip-domain`; do not change the production alias before all checks pass. Do not disclose credentials.
4. Apply `202609230001_gpt_6_luna.sql` to staging, then production after live checks pass. Verify migrated counts/default and retain existing custom model rows.
5. Set production and staging model environment variables to `gpt-6-luna`. Merge PR, deploy/promote tested code, verify aliases and normal pages. Do not represent staging AI as enabled without its API credential.

## Sources

- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#migration-quickstart

## Release evidence

- Issue: https://github.com/wakatpro-ops/aio-growth-partner/issues/150
- 2026-09-23: Source inspection found 32 active legacy `gpt-4.1-mini` templates in each database. Production's latest token-bearing common-generation log also used `gpt-4.1-mini`.
- Local validation passed: 14 model-selector/request tests, URL onboarding, email rules (8), SNS rules, receipt review, full TypeScript, ESLint, Next production build, and client-secret check.
- Pre-existing `check:results` static check fails on old store-top text `実測成果`; both the checked page and assertion are unchanged by this migration. This is not an API/model failure.
- Live isolated deployment `dpl_2UKMuJu3xkUVoWg1LSfznYoNDx4v`: all 5 synthetic API checks passed with response model `gpt-6-luna` (Chat JSON, image JSON, exact URL-intake preview-tool + strict JSON, web search none/medium). Initial malformed image test fixture was corrected before the successful run.
- Staging DB: 32/32 templates migrated; template/report column defaults verified. Production release pending below.
