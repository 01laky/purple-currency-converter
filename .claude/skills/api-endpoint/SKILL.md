---
name: api-endpoint
description: Use when adding a new API endpoint or changing an existing contract (request/response shape, schemas, routes) in the backend. Holds the complete chain from the Zod schema to the frontend client regeneration.
---

# Adding/changing an API endpoint

Source of truth: docs/proposal.md §3 (the contract, the error model, OpenAPI) and §2 (the architecture). This chain must NOT be broken — every step is mandatory, skipping one fails CI or the tests.

## The chain of steps

1. **The Zod schema in `schemas.ts`** — both request and response. The validation `message` = an i18n KEY (e.g. `errors.validation.amountTooManyDecimals`), NEVER an English sentence (§3 Error model). No manual validation in the handler (the CLAUDE.md rule, the Architecture section).
2. **The route in `app.ts`** — through the type provider, with `schema` (body/response including the error shapes for the relevant codes), `summary`, `description` and `tags` for Swagger. The `description` must explain the field semantics (e.g. `rateTimestamp` = the time of the rates, not of the conversion).
3. **Translations** — add every new i18n key to ALL three files `api/src/i18n/{en,cs,sk}.json`. Parity is tested — a missing language fails the tests.
4. **Tests via `app.inject()`** — the happy path + every error code the endpoint returns (the error catalog is a test — §3). The OER client always mocked (rule 1); DynamoDB via dynamodb-local.
5. **The OpenAPI export** — run the export script (`openapi.json`); check the diff.
6. **The FE client regeneration** (if `web/` exists) — `npm run generate:api` in `web/`, commit the generated code together with the change. The CI drift guard fails otherwise.
7. **README** — when the contract changes, update the API reference in the same commit (rule 6).

## Immutable contract properties (never violate)

- Error responses ALWAYS `{ error: { code, key, message, params? } }` — the `message` always in English (the EN translation of the key with the params interpolated, via `formatEnglishMessage`); the frontend translates the `key` (§3).
- No path versioning (`/api/v1` does not exist).
- The `rate` in full precision; the `result` rounded via `roundMoney()` (§5); money never plain float chaining.
- Cache headers: `/api/currencies` has `max-age=3600`; `/api/stats` is NOT cached; `/api/init` has an ETag + `no-cache` (§3).
- Logs without query strings (the OER `app_id` — §4).
