---
name: error-code
description: Use when adding a new ErrorCode, a new error situation, or changing the error handling / the central error handler in the API.
---

# A new error code / an error-handling change

Source of truth: docs/proposal.md §3 Error model. The response shape is ALWAYS `{ error: { code, key, message, params? } }` — the `message` always in English (the EN translation of the key with the params interpolated via `formatEnglishMessage`); the frontend does not display the `message`, it translates the `key` from `/api/init`.

## A new ErrorCode touches FIVE places — all mandatory

1. **The `ErrorCode` enum** (in the `enums.ts` of the respective module or `lib/enums.ts`) — SCREAMING_SNAKE_CASE, e.g. `RATE_PROVIDER_ERROR`.
2. **The central error handler** in `app.ts` — mapping the error to the HTTP status + `code` + `key` (+ `params` when the message interpolates values).
3. **Translations** — the `errors.*` key into all three `api/src/i18n/{en,cs,sk}.json`; interpolation variables `{{likeThis}}`.
4. **The catalog test** — an API test that actually triggers the error and verifies the status + the response shape + the existence of the `key` in all languages.
5. **OpenAPI** — the error response schema on the routes that return the code; then the `openapi.json` export (+ the FE client regeneration when it exists — see the api-endpoint skill).

## Handler rules

- The handler normalizes ALL errors into the unified shape — including Fastify internals (404 → `NOT_FOUND`, 413, JSON parse → `VALIDATION_ERROR`). The API never returns a response outside the shape.
- Zod errors: the `message` from the schema IS the i18n key — the handler passes it into `key` unchanged. No English sentences in the schemas.
- `INTERNAL_ERROR` (500): NEVER a stack trace or details in the response; the full error into the log with the request ID.
- No empty/non-logging `catch` (rule 24) — handle the error by mapping it, or let it propagate into the handler.

## The current catalog (§3)

400 VALIDATION_ERROR · 404 NOT_FOUND · 422 UNSUPPORTED_CURRENCY · 429 RATE_LIMITED (from the hardening version) · 500 INTERNAL_ERROR · 502 RATE_PROVIDER_ERROR
