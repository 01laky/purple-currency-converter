# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry carries the datetime the version was closed — together with the AI_DIARY.md datetimes it is the source of the submission time budget (rule 14).

## [0.8.0] — 2026-06-12 13:47

**The milestone: Level 1 of the assignment complete, including both bonuses (the deploy + IaC).**

### Added

- **The production deploy and the live URL** — the production stage deployed by the human from the existing SST config (zero application-code change); the full live verification sweep passed: the health diagnostics, the ETag/304 revalidation, the first live OER call (172 currencies — the secret works), a real conversion with the full-precision rate and the once-rounded result, the validation and 422 catalogs over HTTP, the statistics written to and read from the production DynamoDB, the Swagger UI including its copied assets, and the unified 404.
- **README.md** — the complete rule-17 structure: the badges (the live GitHub Actions CI badge instead of a hardcoded test count — it cannot go stale), the request-flow diagram with the documented trade-offs (the §4 cache-vs-OER-limit math, the §6 counters-not-event-log decision, the per-stage isolation), the API reference with the `rateTimestamp` semantics and the error-model table, the Quick Start (local + AWS) with the rule-27 env-variable table, the documentation links, the project status, the tech stack, the AI-collaboration section and the honest unlicensed status (revisited at 1.0.0).

## [0.7.0] — 2026-06-12 13:21

### Added

- **The SST v4 infrastructure (`deploy/`)** — its own npm project with the single `sst` dependency (the no-sharing principle); `sst.config.ts` with the per-stage DynamoDB table (dev conversions never pollute production), the `OerApiKey` secret (the key lives in SST secrets, never in the repo) and the Function with `url: true` and `link` (IAM least privilege — exactly its one table); the region eu-central-1.
- **The Lambda parameters as documented decisions** — `nodejs22.x` (matches the pinned local Node), 512 MB (CPU scales with memory), a 10-second timeout (above the 5-second OER fetch budget — a slow OER ends as a controlled stale/502, never a Lambda kill), the concurrency cap of 10 via the account-level quota; every value carries its why-comment in the config.
- **The Lambda adapter (`src/lambda.ts`)** — the §2 twin of `server.ts`: `@fastify/aws-lambda` around `buildApp()`, nothing else; the app stays blind to its hosting (configuration exclusively from env vars, `DYNAMO_ENDPOINT` unset = the AWS mode).
- **The §8 esbuild traps solved** — the Swagger UI assets ship via `copyFiles` from the ROOT `node_modules` (the `../` crosses the deploy/ module boundary) and `resolveSwaggerStaticDir()` hands the plugin an explicit `baseDir` on Lambda (the ESM pattern: `import.meta.url` + `fileURLToPath` — no `__dirname`, no `cwd()`); the i18n JSONs were statically imported since v0.2.0.
- **Tests** — 4 new (99 total): both branches of the swagger resolver (the module-relative path, the injectable check) and the offline Lambda smoke test through a **Function URL payload-format-2.0 fixture** (`url: true` never sends the API GW v1 shape) — `/health` 200 with the §3 shape and the unified 404 through the adapter.

## [0.6.0] — 2026-06-12 13:02

### Added

- **The statistics module (`src/stats/`)** — the §6 model: one table, atomic counters, no event log. Every conversion writes ONE `TransactWriteItems` with two `Update ADD`s (the global `conversionCount`/`totalEurCents` + the per-target counter) — both succeed or neither does, the global count can never drift from the target sum; no read before write.
- **`GET /api/stats`** — the persistent totals: `totalConversions` (a nonnegative integer in the contract), `totalAmountEur` (integer cents / 100, nonnegative), `topTargetCurrency` (nullable — `null` at zero conversions, the honest empty state); ties resolve to the alphabetically first code with one pass and a strict `>` over the Query's ascending sort-key order — no sort; the response carries NO cache headers of any kind.
- **The EUR-at-write-time conversion (`toEurCents`)** — integer cents: `from = EUR` → `Math.round(amount × 100)` directly (no rate lookup); otherwise through `rate(from→EUR)` from the same cached payload, rounded once by `roundMoney`.
- **The write-failure policy live** — the statistics step (BOTH the EUR conversion and the write) runs in one try/catch: a conversion never fails because of statistics; the write retries ×3 with an injectable backoff, transient attempts log `warn` through the request-scoped logger (the retry lines carry the request id), the final failure logs `error` and the 200 still goes out.
- **Tests** — 15 new (95 total): the `toEurCents` branches (including the no-rate-lookup EUR spy), the repository against the real dynamodb-local (transactional totals, the tie-break, the empty state, the retry warn counts, the exhausted-retry throw), the API shape with no cache headers, both still-200 failure paths, and the end-to-end persistence proof: `POST /api/convert` → `GET /api/stats` through the real database.

## [0.5.0] — 2026-06-12 12:37

### Added

- **`POST /api/convert`** — the conversion with the live cross-rate through the USD base: `rate` in full precision (verifiable math), `result` as the only rounded field, `rateTimestamp` with the §3 semantics (the rates-fetch time, not the conversion moment) validated as ISO 8601 in the contract; currency codes case-insensitive, normalized to uppercase.
- **`roundMoney()` (`src/lib/money.ts`)** — the single rounding place of the system: half-up to 2 decimal places computed from the **decimal string** via BigInt cents, never float multiplication (`1.005` rounds UP — the trap the naive `Math.round(x*100)/100` fails); whole numbers pass through (no decimal point in `toString()`); sub-1e-6 values round to the honest 0; non-finite, negative and oversized exponential inputs throw.
- **The conversion service (`src/conversion/`)** — both currencies validated against the ACTUAL supported list (the keys of the cached rates, rule 5); an unknown code → 422 `UNSUPPORTED_CURRENCY` with `params.code` and the interpolated message.
- **The Zod-key passthrough** — the central handler detects schema failures via `hasZodFastifySchemaValidationErrors` and passes `error.validation[0].message` through as the i18n `key` (the schema messages ARE keys, §3); unknown/default Zod messages fall back to the generic `invalidRequest` key instead of crashing the lookup.
- **The validation catalog live** — `amountNotPositive`, `amountTooLarge` (> 1e12), `amountTooManyDecimals` (a string-based decimal check, no float arithmetic), `invalidCurrencyCode` (`/^[A-Za-z]{3}$/`, not a length check), `sameCurrency` (after the uppercase normalization — `eur`/`EUR` is the same currency).
- **The honest zero** — a result may round to 0.00 (e.g. 0.01 of a weak currency into a strong one); decided with the human and covered by tests at the unit, service and API level.
- **Tests** — 29 new (80 total): the `roundMoney` boundary catalog (1.005, 0.005, 2.675, carries, whole numbers, long expansions, the throwing branches), the service math and error paths, and the full API validation catalog — every key triggered over HTTP, the 422 with `params.code`, the 502, the lowercase→UPPERCASE normalization and the OpenAPI presence.

## [0.4.0] — 2026-06-12 11:03

### Added

- **`GET /api/currencies`** — currency codes mapped to display names for the conversion selects; the response is the **intersection** of the OER currency names and the cached rates (only currencies that have a rate are listed — the list and the rates never diverge), keys sorted; `Cache-Control: public, max-age=3600`.
- **The names source** — `fetchCurrencyNames` through the single OER fetch pattern (the shared injectable fetch, timeout and Zod parsing); cached by the generic `createCachedSource<T>` with a 1-hour TTL and an independent stale fallback.
- **`RATE_PROVIDER_ERROR` (502)** — the error-model piece deferred from v0.3.0: an unreachable provider (no stale copy) is mapped by the central error handler to 502 in the unified shape; the `errors.rateProvider` translation existed since v0.2.0, so the catalog needed zero changes; covered by a catalog API test that triggers the 502 over HTTP.
- **The `buildApp` DI seam** — an optional `ratesProvider` override for route tests (rule 1 — the tests never touch the real OER client); `server.ts` unchanged.
- **Tests** — 9 new (51 total): the intersection semantics (both drop directions), the sorted keys, the stale-names fallback, the names-unavailable 502 path, the `/currencies.json` parsing branches, the endpoint happy path with the cache header and the 502 catalog test.

## [0.3.0] — 2026-06-12 05:58

### Added

- **The rates module (`src/rates/`)** — the openexchangerates client with an injectable fetch, a 5 s AbortController timeout and Zod parsing of the external response (the shape is never assumed); the key never appears in errors or logs.
- **The generic cache (`createCachedSource<T>`)** — in-memory, TTL 10 minutes, an injected clock for deterministic tests; concurrent callers share a single in-flight fetch; a failed refresh serves the stale copy with its original `fetchedAt`, a failed first fetch propagates.
- **The cross-rate provider** — every pair computed through the USD base (`rate(from→to) = usdRates[to] / usdRates[from]`, full precision); `rateTimestamp` = the moment the cached payload was fetched from OER (ISO 8601 UTC), honestly older under the stale fallback; the supported-currency list as the keys of the cached rates; module errors (`RateProviderUnavailableError` — the 502 of v0.4.0, `UnknownRateCurrencyError` — never a silent NaN).
- **Tests** — 19 new (42 total): the cache TTL/stale/deduplication behavior under fake time, the client parsing/timeout/missing-key branches, the cross-rate math and the provider error and age semantics.

### Changed

- **`GET /health`** — `ratesCacheAge` is now wired to the real rates cache (still `null` until the first fetch; the endpoint never triggers one).
- **`.env.example`** — adds `OER_API_KEY` (empty — a secret).

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

[0.8.0]: https://github.com/01laky/purple-currency-converter/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/01laky/purple-currency-converter/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/01laky/purple-currency-converter/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/01laky/purple-currency-converter/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/01laky/purple-currency-converter/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/01laky/purple-currency-converter/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/01laky/purple-currency-converter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/01laky/purple-currency-converter/compare/v0.0.0...v0.1.0
[0.0.0]: https://github.com/01laky/purple-currency-converter/releases/tag/v0.0.0
