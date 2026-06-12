# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry carries the datetime the version was closed — together with the AI_DIARY.md datetimes it is the source of the submission time budget (rule 14).

## [0.2.0] — 2026-06-12 05:44

### Added

- **i18n module (`src/i18n/`)** — EN/CS/SK translation files with the complete fixed key catalog (the backend errors including codes arriving in later versions, plus the frontend UI texts per Figma); statically imported (the future Lambda bundle has no files on disk).
- **`GET /api/init`** — the languages and all the translation trees at once; a strong SHA-256 ETag computed once per process, `Cache-Control: no-cache`, a matching `If-None-Match` gets `304 Not Modified` with an empty body.
- **No-fallback policy** — a missing translation or interpolation param fails immediately; it never resolves to the key itself, English, an empty string or a placeholder.
- **Tests** — 15 new (23 total): translation parity (missing AND extra keys, non-empty leaves, `{{param}}` placeholder parity across languages, every `ErrorKey` present), `formatEnglishMessage` behavior including all the throwing branches, the `/api/init` shape, the ETag stability, the 304/200 revalidation branches and the OpenAPI presence.

### Changed

- **The error `message` source** — the central error handler now builds messages from the EN translations via `formatEnglishMessage` (with `{{param}}` interpolation); the temporary `ENGLISH_MESSAGES` constants from v0.1.0 are removed.

## [0.1.0] — 2026-06-12 05:15

### Added

- **Project skeleton** — strict TypeScript on Node 22 (pinned via `.nvmrc`, `engines` and `engine-strict`), npm scripts (`dev`, `verify:api` = typecheck + lint + tests, `db:init`, `setup`, `openapi:export`), Prettier with tabs, ESLint (typescript-eslint, no `any`, no type assertions), `.editorconfig`.
- **Fastify application (`buildApp()`)** — the adapter architecture: all the logic in `src/app.ts`, `src/server.ts` is a thin local adapter with graceful shutdown; configuration read exclusively from env variables (native `--env-file`, no dotenv).
- **`GET /health`** — instance diagnostics: the version from `package.json`, process uptime, `ratesCacheAge` (null until the rates cache exists in v0.3.0).
- **The central error handler and the error model** — every error normalized into `{ error: { code, key, message, params? } }`: 404 `NOT_FOUND`, malformed JSON and an oversized body as `VALIDATION_ERROR`, unexpected errors as 500 `INTERNAL_ERROR` with no internals leaked; the full error logged with the request id.
- **Swagger UI at `/docs`** — the OpenAPI documentation generated from the Zod schemas in `src/schemas.ts` (single source of truth); the raw spec at `/docs/json`; `openapi.json` exported and committed as the contract artifact.
- **Observability baseline** — `X-Request-Id` (UUID) on every response, one structured log line per request (status, latency, URL without the query string), `debug` level locally / `info` in production.
- **Local DynamoDB environment** — docker-compose with dynamodb-local on :8002 (named volume, `user: root`), the idempotent `npm run db:init` (`scripts/create-local-table.ts`) and the one-command onboarding `npm run setup` (container + table + `.env`).
- **GitHub Actions CI** — the `api` job: `npm ci` → `verify:api` → the OpenAPI drift guard (re-export + `git diff --exit-code`), dynamodb-local as a service container; Dependabot for security updates only.
- **Tests (Vitest)** — 8 integration tests via `app.inject()` and dynamodb-local: the `/health` shape, every error branch of the handler (404/400/413/500 with no leak), the request-id uniqueness, the OpenAPI document, the `db:init` idempotence.

## [0.0.0] — 2026-06-12 04:15

### Added

- **Working rules (`CLAUDE.md`)** — the contract with the AI: 28 rules covering decision-making, the git flow, code quality, the error model, language discipline and the definition of done.
- **AI guardrails (`.claude/settings.json`)** — committed permissions (allow for routine read-only and test commands; deny for `.env` reads, deploy, remove and push) and a PostToolUse hook running the typecheck after every file edit.
- **Custom commands (`.claude/commands/`)** — `/diary` (a record into the AI collaboration diary) and `/review-api` (an adversarial pre-commit review targeting the domain traps).
- **Skills (`.claude/skills/`)** — six task-type procedures: `version-workflow`, `api-endpoint`, `error-code`, `dynamo-stats`, `fe-component`, `figma-to-scss`.
- **Documentation (`docs/`)** — `proposal.md` (the binding design and the roadmap 0.0.0 → 1.0.0) and `AI_SETUP.md` (the AI process and its reasoning).
- **AI collaboration diary (`AI_DIARY.md`)** — created on day one, with the record template in the file header.
- **Repo hygiene (`.gitignore`)** — secrets (`.env*` except `.env.example`), local AI permissions (`.claude/settings.local.json`), dependencies and build outputs.

[0.2.0]: https://github.com/01laky/purple-currency-converter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/01laky/purple-currency-converter/compare/v0.0.0...v0.1.0
[0.0.0]: https://github.com/01laky/purple-currency-converter/releases/tag/v0.0.0
