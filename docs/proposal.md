# Proposal

The binding solution design. Related documents: the AI process in [AI_SETUP.md](AI_SETUP.md), the working rules in [CLAUDE.md](../CLAUDE.md).

Everything in this document is decided and binding; every material trade-off comes with its reasoning. A change of the design = a change of this document (rule 9).

## 1. Goal and scope

A REST API for currency conversion with live exchange rates, caching, persistent statistics and a web frontend following the Figma design. Mapping to the assignment:

| Assignment requirement                             | Solution                                    | Version       |
| -------------------------------------------------- | ------------------------------------------- | ------------- |
| Conversion API with live rates                     | `POST /api/convert` + openexchangerates.org | 0.3.0–0.5.0   |
| Input validation + error handling                  | Zod schemas + a central error handler       | 0.1.0–0.5.0   |
| Rates cache                                        | in-memory TTL 10 min + stale fallback       | 0.3.0         |
| Conversion statistics                              | DynamoDB (persistent, across clients)       | 0.6.0         |
| Tests                                              | Vitest, unit + integration                  | every version |
| Persistence (L2)                                   | DynamoDB                                    | 0.6.0         |
| Web frontend (L2)                                  | React + Vite following Figma                | 0.9.0–0.10.0  |
| Deploy + live URL ("bonus" in the assignment)      | SST → AWS Lambda                            | 0.7.0–0.8.0   |
| Infrastructure as Code ("bonus" in the assignment) | SST v4 (`sst.config.ts`)                    | 0.7.0         |

Items marked "bonus in the assignment" are bonuses in the assignment's classification — in this design they are a full part of the implementation, not an optional add-on.

## 2. Architecture

```
                    ┌────────────────────────────────────────────┐
 local: server.ts ──┤  src/app.ts — Fastify app (all the logic)  │
 AWS:   lambda.ts ──┤                                            │
                    │  • /health          • /api/init            │
                    │  • /api/convert     • /api/currencies      │
                    │  • /api/stats       • /docs (Swagger)      │
                    └─────────────────────┬──────────────────────┘
                              ┌───────────┴───────────┐
                              ▼                       ▼
                    rates (OER + cache)      stats (DynamoDB)
```

### Principles

- **Adapter architecture.** `app.ts` does not know whether it runs locally or on Lambda; `server.ts` (local run, including graceful shutdown — SIGINT/SIGTERM → `app.close()`) and `lambda.ts` (AWS) are thin adapters. Configuration is read exclusively from environment variables.
- **Modules.** Every module (`rates/`, `stats/`, …) keeps its definitions in local `types.ts`, `enums.ts`, `constants.ts` (rule 23).
- **The API contract lives in `src/schemas.ts`.** Zod schemas wired through `fastify-type-provider-zod` are the single source of truth for validation, TypeScript types and the OpenAPI documentation.
- **The backend and the frontend share no code.** No shared modules, types, schemas or utilities. The only artifact between them is `openapi.json` (a contract, not code) — the frontend generates its own client from it (§10). Each part is independently buildable, testable and replaceable.

### API source structure

```
src/
├── app.ts                  # buildApp() — Fastify + routes + the central error handler
├── server.ts               # local adapter (graceful shutdown)
├── lambda.ts               # AWS adapter (@fastify/aws-lambda)
├── schemas.ts              # Zod schemas of the API contract
├── i18n/                   # en/cs/sk.json + loader.ts (static imports — §8, parity, ETag) — §3
├── conversion/             # service.ts (convertAmount) + errors.ts (UnsupportedCurrencyError)
├── lib/
│   ├── dynamo.ts           # DynamoDB client (local/AWS switching via DYNAMO_ENDPOINT)
│   ├── money.ts            # roundMoney() — the only place rounding happens
│   ├── swagger.ts          # resolveSwaggerStaticDir() — Swagger UI assets in the Lambda bundle (§8)
│   └── constants.ts / enums.ts / types.ts
├── rates/                  # client.ts (OER fetch), cached-source.ts (generic cache), provider.ts (cross-rate)
└── stats/                  # repository.ts (counters, retry) + eur.ts (conversion to cents)
scripts/                    # create-local-table.ts (db:init), setup.ts (onboarding), openapi-export.ts
```

### Target repo structure (monorepo without sharing)

```
/
├── api/                  # backend — own package.json, .env(.example), tests
├── web/                  # frontend — own package.json, .env(.example), tests
├── deploy/               # sst.config.ts + deploy scripts — own package.json (sst)
├── docs/                 # documentation (including this proposal)
├── prompt/               # versioned prompts
├── figma/                # design snapshot
├── .github/              # CI workflows
├── docker-compose.yml    # dynamodb-local on :8002 (8000 is commonly taken) with `user: root` (named volume); started by `npm run setup`
└── README.md, CHANGELOG.md, CLAUDE.md, AI_DIARY.md
```

- **No npm workspaces.** `api/`, `web/` and `deploy/` are three independent npm projects with their own `node_modules` — we share no code and the tooling must not tempt us to.
- The structure is reality as of v0.9.0 (moved via `git mv` with history preserved).

## 3. API contract

No path versioning (no `/api/v1`): the API has a single consumer, the contract is guarded by OpenAPI + a drift guard (§7), and the product version lives in `package.json` and release tags.

### `POST /api/convert`

```jsonc
// request
{ "amount": 100, "from": "EUR", "to": "GBP" }
// 200
{ "amount": 100, "from": "EUR", "to": "GBP", "rate": 0.8612, "result": 86.12, "rateTimestamp": "2026-06-11T12:00:00Z" }
```

- **`amount`** — a positive number with an upper bound: Zod `.positive().max(1e12)` (above ~2^53 JS numbers and cent arithmetic lose precision). The schema rejects every invalid shape: non-numeric values, `NaN`/`Infinity`, more than 2 decimal places (refine). An unvalidated amount never enters the logic.
- **`from`/`to`** — a 3-letter currency code, case-insensitive, normalized to uppercase. `from === to` is forbidden — a Zod refine at the body level → 400 `VALIDATION_ERROR`; the frontend does not even allow selecting this combination (§10).
- **`rate`** — returned **in full precision** (it is not a monetary amount; full precision allows verifying the computation). Only `result` is rounded (§5).
- **`rateTimestamp`** — the time the rates were fetched from OER (from the cache), **not** the moment of the conversion; with the stale fallback (§4) it honestly carries the older time. The semantics of the field must be stated in the README and in the `description` of the OpenAPI schema.

### `GET /api/currencies`

```jsonc
{ "currencies": { "EUR": "Euro", "GBP": "British Pound Sterling", ... } }
```

- Source: OER `/currencies.json` (codes + names — the frontend needs them for the selects).
- **The intersection** with the rates from `/latest.json` is returned — only currencies that have a rate. `/currencies.json` also contains currencies without a rate; those would fail conversion with `UNSUPPORTED_CURRENCY`. The list and the rates therefore never diverge.
- The list is cached on the server (mechanism of §4) and the response carries `Cache-Control: public, max-age=3600` — the browser/CDN does not re-fetch it needlessly.

### `GET /api/init` — all texts of the system with ETag revalidation

```jsonc
{
  "languages": ["en", "cs", "sk"],
  "translations": {
    "en": { "errors": { "unsupportedCurrency": "Currency {{code}} is not supported", ... }, "ui": { "convertCurrency": "Convert currency", ... } },
    "cs": { ... },
    "sk": { ... }
  }
}
```

- **The backend is the single source of all texts** — `api/src/i18n/{en,cs,sk}.json` contain the backend error messages as well as the frontend UI texts. The frontend downloads them at app boot through the generated client (the endpoint is part of the OpenAPI contract). Translations are data flowing through the contract — the no-code-sharing principle (§2) is untouched.
- **The key catalog is fixed and the keys are camelCase paths (not error codes):** `errors.{notFound, internal, rateProvider, rateLimited, unsupportedCurrency}`, `errors.validation.{invalidRequest, amountNotPositive, amountTooLarge, amountTooManyDecimals, invalidCurrencyCode, sameCurrency}`, `ui.{title, amountToConvert, from, to, convertCurrency, result, numberOfCalculations, topTargetCurrency, totalAmountEur}`; interpolation through the `{{param}}` placeholder.
- **Three languages: EN, CS, SK** — codes per ISO 639-1 (Czech = `cs`). The endpoint returns all languages at once: the texts are small (a few KB), one ETag, and switching the language on the frontend is instant without another request. The language list is sent by the backend — the frontend hardcodes nothing.
- **Revalidation via HTTP ETag (conditional requests):** the response carries an `ETag` (a hash of the JSON, computed once at process start) + `Cache-Control: no-cache`. On the next load the browser automatically sends `If-None-Match` and the backend replies `304 Not Modified` with an empty body when the texts have not changed. Standard HTTP behavior — no manual hash endpoint and no custom cache logic.
- **Fallback:** if `/api/init` fails, the frontend shows a single hardcoded message ("Failed to load application"). A bundled backup copy of the translations does not exist — it would double the maintenance and defeat the single-source principle.
- **Translation parity is a test:** every key must exist in all languages; a missing translation fails the tests.
- **A missing translation never falls back — it fails immediately.** Under no circumstance does a missing key resolve to the key itself, the English text, an empty string or a placeholder: the backend throws (rule 24), and the frontend i18n layer is configured the same way (§10 — i18next's default of returning the key is explicitly disabled). A silent fallback would hide a broken catalog exactly where the parity test is supposed to catch it.

### `GET /api/stats`

```jsonc
{ "totalConversions": 42, "totalAmountEur": 12345.67, "topTargetCurrency": "EUR" }
```

Statistics are **never cached anywhere** (no HTTP cache headers) — they are always fresh.

### `GET /health`

```jsonc
{ "ok": true, "version": "0.4.0", "uptime": 1234, "ratesCacheAge": 120 }
```

Instance diagnostics: the version (from `package.json`), process uptime in seconds (per instance on Lambda), age of the rates cache in seconds (`null` before the first fetch). When debugging a deployment you immediately see what the instance runs and whether its rates are fresh.

### OpenAPI / Swagger

- Every endpoint is documented in **Swagger UI at `GET /docs`** (+ the raw specification at `/docs/json`).
- **Generated automatically from the Zod schemas** — `@fastify/swagger` + `@fastify/swagger-ui` with `jsonSchemaTransform` from `fastify-type-provider-zod`. No hand-written OpenAPI YAML exists; `schemas.ts` is the single source of truth (§2).
- Every route adds `summary`, `description` and `tags`; error responses are registered in the `response` schemas — Swagger shows the error shapes too.
- `/docs` is available in production as well — the evaluator can click through the API without reading the code.
- Introduced from the skeleton version; every following version adds the schemas of its endpoints.
- The specification is exported by a script into `openapi.json` — the source for generating the frontend client (§10) and for the drift guard in CI (§7).

### Error model

A unified shape **`{ "error": { "code", "key", "message", "params"? } }`**:

- **`code`** (the `ErrorCode` enum) — programmatic handling and HTTP semantics
- **`key`** — an i18n key into the texts from `/api/init` (e.g. `errors.validation.sameCurrency`); the frontend translates the message by the key in the selected language
- **`message`** — **always in English**, the EN translation of the key with the params interpolated (e.g. "Currency XYZ is not supported"). Reason: the assignment asks for _meaningful error handling_ — an API consumer without the frontend (Swagger, curl) must understand the error without a translation table. The frontend does not display `message` — it translates the `key`.
- **`params`** (optional) — values for interpolation (e.g. `{ "code": "XYZ" }`)

| HTTP | `code`                 | When                                                                                     |
| ---- | ---------------------- | ---------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`     | input shape error (Zod) — the `key` names the field and the reason, `params` the details |
| 404  | `NOT_FOUND`            | unknown route                                                                            |
| 422  | `UNSUPPORTED_CURRENCY` | the currency is not in the supported list (`params.code`)                                |
| 429  | `RATE_LIMITED`         | rate limit exceeded — 60 req/min per IP on `POST /api/convert` (§9)                      |
| 500  | `INTERNAL_ERROR`       | unexpected error — no stack trace and no internals in the response                       |
| 502  | `RATE_PROVIDER_ERROR`  | OER unavailable and the cache is empty                                                   |

- **Zod messages carry the i18n key directly** — the `message` in a Zod schema is a key (e.g. `errors.validation.amountTooManyDecimals`) and the central error handler passes it through into `key`. There are no English sentences in the schemas.
- **The central error handler normalizes every error** into the shape above — including Fastify internals (404, 413 body over the limit, JSON parse errors). The API never returns a response outside this shape.
- **The error catalog is also a test:** for every `ErrorCode` there is an API test that actually triggers it and verifies the response shape; every `key` used in the code must have an entry in the translations of all languages.

## 4. Rates: the external API, cache, cross-rate

- **Provider:** openexchangerates.org, free plan — USD base only, ~1,000 requests/month, hourly rate updates.
- **Client:** fetch with a 5 s timeout (AbortController); the response is always parsed with a Zod schema (rule 3) — the shape of the external response is never assumed.
- **Cross-rate:** `rate(from→to) = usdRates[to] / usdRates[from]` — the free plan has a USD base only, every pair is computed through USD. Covered by a test.
- **Cache:** in-memory, TTL 10 min. A conscious trade-off: the theoretical maximum under continuous traffic (~4,320 fetches/month) exceeds the OER limit of 1,000/month — accepted, because fetches happen exclusively on demand (the first request after expiry), real case-study traffic is sporadic and exhausting the limit is caught by the stale fallback. Documented in the README.
- **One generic cache (`createCachedSource<T>`)** serves both the rates and the currency-name list (§3 currencies). Concurrent requests after expiry share a single in-flight fetch (deduplication) — N waiting requests never fire N OER calls.
- **Stale fallback:** on an OER outage or limit, the stale cache is served (the response carries the original `rateTimestamp` — §3); 502 `RATE_PROVIDER_ERROR` only when there is not even a stale copy. On Lambda the cache is per instance (best effort) — a conscious decision, the worst case is one extra fetch.
- **The supported-currency list** = the keys of the cached rates; `UNSUPPORTED_CURRENCY` validation runs against it (rule 5).
- **Timeout budget:** OER fetch 5 s < Lambda timeout 10 s (§8). An OER outage or slowness always ends in a controlled response (stale/502), never in Lambda killing the request.
- **Time:** all timestamps are ISO 8601 UTC. The cache receives `now()` as an injected dependency — the TTL/stale logic is tested deterministically with fake time (§7).
- **The key never appears in logs:** OER uses `app_id` as a query parameter — URLs are always logged without the query string (a concretization of rule 7).

## 5. Money and rounding

- **Half-up to 2 decimal places.** The 2 dp precision is confirmed by Figma ("4 942,52 CZK"); half-up is the backend's mathematical rule (0.005 → 0.01).
- The `amount × rate` computation is done in a number; **a single rounding at the end** through `roundMoney()` (rule 4) — no scattered `toFixed`/`Math.round`.
- **`roundMoney` shifts the decimal point through a decimal string, not by multiplication** — a naive `Math.round(x * 100) / 100` fails on the float representation (`1.005 × 100 = 100.4999…` → rounds down); half-up is therefore performed on an integer representation.
- **Division of labor:** the backend rounds the **value** (the API returns `result` at 2 dp), the frontend exclusively **formats the presentation** — it never re-rounds or recomputes.
- **No decimal library** — a needless dependency for a single computation (rule 8); precision is guaranteed by boundary-value tests (0.005, large amounts, long decimal expansions).
- **Aggregates in cents (integer):** `totalEurCents` — summation accumulates no float error; conversion to cents goes through `roundMoney` at write time.
- **The common sum currency: EUR.** The assignment asks for the "total sum of all conversions in a currency of your choice"; different currencies cannot be summed directly, so every conversion is converted to EUR at write time using the rate valid at the moment of the conversion. Formula: `amountEur = roundMoney(amount × usdRates["EUR"] / usdRates[from])`; for `from = EUR` simply `amount`.

## 6. Statistics: the DynamoDB data model

One table, atomic counters, no event log:

| pk      | sk           | attributes                               |
| ------- | ------------ | ---------------------------------------- |
| `STATS` | `GLOBAL`     | `conversionCount: N`, `totalEurCents: N` |
| `STATS` | `TARGET#EUR` | `count: N`                               |
| `STATS` | `TARGET#GBP` | `count: N`                               |

- **Write** (per conversion): one **`TransactWriteItems`** transaction with two `Update ADD` operations (the global counter + the target-currency counter) — both succeed or neither does; `conversionCount` can never drift from the sum of the target counters. No read before write.
- **Read** (`/api/stats`): one Query `pk = STATS` → the global values + the maximum of the `TARGET#` items (there are at most ~170 currencies). **Tie-break:** on equal counts the alphabetically first currency wins — the API always answers the same state the same way (determinism = testability; the assignment does not address ties, so the design does).
- **Why not an event log:** the assignment asks for three aggregates, not history; counters are O(1) to write and read, with no scans. The trade-off (loss of per-conversion history) is documented in the README; the event log is in the Backlog.
- `totalAmountEur` in the response = `totalEurCents / 100`.
- **Write-failure policy:** a conversion never fails because of statistics — the user always gets the result. On a failed transaction there are **3 retries** with a short backoff; once exhausted, the error is logged as an error (with the request ID). The retry applies to the transaction as a whole and lives exclusively in the backend write logic.
- **No outward retry exists:** the frontend (the generated client) never retries `POST /api/convert` — a repeated POST would mean a duplicate statistic.

## 7. Testing, tooling and CI

One test runner (Vitest), but **separate test suites** — the backend and the frontend have separate tests, their own Vitest configs and their own commands. Nothing runs "all at once". **Tests always live in a dedicated `tests/` directory of the given part** (API: `tests/`, frontend: `web/tests/`) whose structure mirrors `src/` — never next to the sources (rule 28).

### Backend tests

| Type              | Tool                                        | Covers                                                                             |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unit              | Vitest                                      | `roundMoney` (boundary values), cross-rate, cache TTL/stale logic (fake time)      |
| API (integration) | Vitest + `app.inject()`                     | endpoints: happy path + every error code; the OER client is always mocked (rule 1) |
| DB integration    | Vitest + dynamodb-local (in-memory variant) | writing/reading statistics against the real DynamoDB API                           |

### Frontend tests

| Type              | Tool                                      | Covers                                                                                  |
| ----------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Component         | Vitest + React Testing Library (jsdom)    | the converter: form validation, result display; statistics including the empty state    |
| States and errors | Vitest + RTL, the generated client mocked | mapping the error model to the UI (`key` → translation), loading states, the boot phase |

Frontend tests never call the real API — the generated axios client is mocked; the contract is held by the OpenAPI specification. Dev dependencies: `@testing-library/react`, `@testing-library/user-event`, `jsdom`.

### Tooling and code style

- **Package manager: npm** — `package-lock.json` committed, CI installs via `npm ci`.
- **Formatting: Prettier** — the format is enforced by a tool, not by discussions. **Indentation: tabs, not spaces** (`useTabs: true`, `.editorconfig` with `indent_style = tab`).
- **Linting: ESLint** with `typescript-eslint` + `eslint-config-prettier`; the lint rules support rule 23 (no `any`, no unused variables, …).
- `api/` and `web/` have their own configs and commands (`lint:api`/`lint:web`, `format:api`/`format:web`) — consistent with the no-sharing principle.
- **Node 22, pinned:** `.nvmrc` in the root (read by `nvm use` and by CI `setup-node`), `engines: { "node": ">=22" }` in every `package.json`, `.npmrc` with `engine-strict=true` — `npm install` on a wrong version fails immediately with a clear message. The version matches the Lambda runtime `nodejs22.x` (§8); the native `--env-file` (Node 20.6+) replaces dotenv — no dependency for configuration.

### Commands and CI

- Backend: `npm run test:api`, `npm run verify:api` (= typecheck + lint + tests); frontend: `npm run test:web`, `npm run verify:web` — always separate, no merged command. The definition of done of a version runs the commands of the part the version touches.
- **`npm run setup`** — one-command onboarding: `docker compose up -d` + `db:init` + a copy of `.env.example` → `.env` (when missing).
- **CI (GitHub Actions): two separate jobs** `api` and `web`, running in parallel; dynamodb-local as a service container only in the api job; besides `verify:web` the web job also runs `vite build` (build errors are caught in the PR, not at deploy time).
- **OpenAPI drift guard:** CI generates `openapi.json` and fails when it differs from the committed one — the contract in the repo cannot grow stale against the code.
- **Generated-client drift guard:** the web job regenerates the API client (`npm run generate:api`) and fails on a difference against the committed `web/src/api/generated` — the client cannot grow stale against `openapi.json`.
- Repo hygiene: `.editorconfig`, Dependabot for security updates only.

## 8. Infra and deploy (SST v4)

- `sst.config.ts`: `sst.aws.Dynamo` (Stats), `sst.Secret` (OerApiKey), `sst.aws.Function` with `url: true` and `link`, `sst.aws.StaticSite` + `sst.aws.Router` (a same-origin domain for the web and `/api/*` — §10).
- The Lambda receives through `environment` the same variables as the local `.env` (`STATS_TABLE`, `OER_API_KEY`) plus `NODE_ENV=production` (drives the log level — §9) — the app is blind to how it is hosted.
- **Stages:** a personal dev (`sst dev` — Live Lambda) and `production` (`sst deploy`); `sst remove` once the evaluation ends. Every stage = its own stack including its own DynamoDB table — dev conversions never pollute production statistics.
- **The Lambda parameters are a documented decision, not defaults:** runtime `nodejs22.x`, memory 512 MB (CPU scales with memory → faster cold starts and responses), timeout 10 s (above the 5 s OER fetch timeout — §4), a concurrency cap of 10 via the account-level quota (§9). The values live in the SST config with a comment explaining why.
- **Esbuild bundling — two places solved by design:** ① the i18n JSONs are imported **statically** — the bundle has no `node_modules` and no files on disk, dynamic reads/`createRequire` do not exist on Lambda; ② the Swagger UI assets are copied next to the bundle via `copyFiles` (`@fastify/swagger-ui/static` → `static`) and the plugin receives an explicit `baseDir` (`lib/swagger.ts`: an existing `./static` next to the module → baseDir; locally the directory does not exist → the default from `node_modules`).
- **`sst dev` does not serve the StaticSite** (the domain root is a placeholder origin) — during development the web runs locally via `npm run dev`; the full web through the router exists only in the production stage.
- **Deploy artifacts live in `/deploy/`**, not in the repo root — `sst.config.ts` and the deploy scripts have their own `package.json` with the `sst` dependency; the config references `api/` and `web/` relatively and the SST commands are run from `deploy/`.
- The deploy is triggered exclusively by a human (deny in `.claude/settings.json`).

## 9. Security and observability

### By design (from the first versions)

- Input validation with Zod schemas before any logic (§3)
- A leak-free error model — `INTERNAL_ERROR` contains no stack trace and no internals
- Secrets discipline — keys only in `.env`/SST secrets; a logger with sensitive-field redaction; never in code or logs
- CORS for local development only (an exact origin, never `*`); production is same-origin through the Router — no CORS exists there (§10)
- HTTPS — both the Function URL and CloudFront enforce it by default
- IAM least privilege — through the SST `link` the Lambda can access exactly its one table
- Security headers via `@fastify/helmet`
- Fastify defaults — a 1 MB body limit, strict JSON parsing

### Authentication: none

A public converter with no user data and no PII — authentication is not introduced and is not planned even as a future step.

### Rate limiting (implemented in the hardening version)

- `@fastify/rate-limit` — a per-IP limit (baseline: 60 req/min on `/api/convert`), the 429 response in the unified error model. It protects the statistics from pollution and dampens abuse. It keys on the client IP from `x-forwarded-for` (Fastify `trustProxy`) — production sits behind CloudFront and the socket address is a changing edge; a caller hitting the Function URL directly could spoof the header, which is accepted (the public entry point is CloudFront).
- An admitted trade-off: the in-memory limit counts per Lambda instance (like the cache, §4) — with N instances the effective limit is N-fold. The hard backstop is the second layer; API Gateway throttling/WAF is consciously out of scope (§15). Documented in the README.
- **A concurrency cap of 10 instances** — the hard cost backstop: the API never runs in more than 10 concurrent instances. It is enforced by the account-level Lambda quota (10 concurrent executions). A per-function `reserved` concurrency is deliberately not set: AWS requires at least 10 unreserved executions to remain outside reservations, so on an account with a quota of 10 no reservation is permissible — it would become possible only after a quota increase (Service Quotas), at which point `concurrency: { reserved: 10 }` is added to the SST config.

### Observability

- **Request ID:** every response carries `X-Request-Id` (Fastify `genReqId` — a UUID per request) and every log record contains it — a response, a log line and CloudWatch can always be paired.
- **Log policy:** one log line per request (status, latency, request ID); `debug` locally, `info` in production; the request body is never logged; URLs always without the query string (§4). Logs are structured JSON (pino) — readable in CloudWatch Insights.

## 10. Frontend

### Design per Figma (binding; snapshot in `figma/`)

Figma "Purple case" → the Main page contains the Web and Mobile variant of the same screen:

- **Elements (top to bottom):** the heading "Purple currency converter" (centered) → the purple form card with the fields Amount to convert (input), From (select), To (select) → the "Convert currency" button (purple, centered) → the Result card (light, outlined): the label "Result" → the value `4 942,52 CZK` → the label "Number of calculations made" → the value.
- **Web layout:** the three form fields in one row; content centered.
- **Mobile layout:** identical elements, the fields stacked to the container width. The layouts switch by grid template (CSS Grid), not by scaling.
- **Visual:** a dark purple card and button, a light background, white inputs, dark text. The exact values (hex, fonts, dimensions, spacing) live in the committed `figma/` export and are carried exclusively into `web/src/styles/_tokens.scss`; the breakpoint between the layouts is **920 px** (mobile ≤ 919 px). The Roboto font is self-hosted via `@fontsource/roboto`.
- **The texts from the design = the base of the EN translations** (`Amount to convert`, `From`, `To`, `Convert currency`, `Result`, `Number of calculations made`).
- **The number format is confirmed by the design:** `4 942,52 CZK` (§5).
- The design does not contain: a header/footer, the rate/its time next to the result, loading/error states, the open state of the selects, a language changer. The design of this proposal adds the needed elements consciously (below).

### Conscious additions beyond Figma

- **The remaining two statistics from the assignment** (the top target currency, the total amount in EUR — the design shows only the count): additional rows of the same Result card in the identical "label + value" style. The smallest possible intervention, no new components.
- **The open state of the selects:** with ~170 currencies it behaves as a filterable list (specification below); the closed state is pixel-perfect per Figma.
- **Loading/error states:** derived from the design system — a spinner in the button, errors next to the fields, a banner.
- **A language changer:** an EN/CS/SK switch (the texts arrive multilingual from `/api/init`); a discreet placement in the page corner, the visual derived from the design system.

### Layout and behavior

- **A React + Vite SPA** — a single screen, no router. Two zones per Figma: the form card with the button and the Result card (the result + the statistics).
- **Pixel-perfect, web and mobile** — the visual is implemented exactly per both variants of the design.
- **A custom fully responsive layout: CSS Grid + SCSS.** No grid framework; the breakpoints derive from the Figma dimensions and the devices switch by grid template.
- **Conversion is an explicit action** (the Convert button), not live while typing — `POST /api/convert` = 1 record in the statistics; a live recompute would, while typing "100", record conversions for "1", "10", "100".
- **App boot:** a full-page spinner until `GET /api/init` (the texts) and `GET /api/currencies` (the currencies) complete — without them the app does not render. An init failure → the fallback message (§3); a currencies failure → an error state with a retry option.
- **States during use:** loading = the disabled Convert button with an inline spinner (no skeletons — the design does not need them); errors mapped onto the error model (`VALIDATION_ERROR` at the field, `UNSUPPORTED_CURRENCY` at the select, `RATE_PROVIDER_ERROR` as a banner); the statistics empty state at 0 conversions. Stale rates are not shown in the UI (the design has no such element) — `rateTimestamp` stays only in the API response.
- **No layout shift:** the space for the result and the statistics is reserved (CLS ≈ 0).
- **Input UX:** autofocus on amount, Enter submits, Convert is disabled with an invalid form and during the request (double-submit prevention — a complement of the "the frontend never retries a POST" rule, §6).
- **The currency selects — a binding specification:** typing filters the list, the ↑/↓ arrows navigate, Enter selects, Esc closes, an outside click closes; fully operable by mouse and keyboard; the value = the code + the currency name. **The same currency cannot be chosen on both sides** — the target select excludes the chosen source currency (and vice versa); the backend validates it anyway (§3) — defense in depth.
- **The statistics** load at boot and refresh after every successful conversion — the user sees the persistence live.
- **Accessibility baseline:** semantic HTML (form/label/button), `aria-live` on the result and the error messages, visible focus, contrast per Figma, correct ARIA roles of the selects.

### Texts, languages and formatting

- **Texts via i18n, the source = the backend (`/api/init`), languages EN/CS/SK.** All UI texts including error messages, empty states and aria-labels live in `api/src/i18n/`; no hardcoded strings in components (the single exception: the fallback message when init fails). The i18n layer (`i18next` + `react-i18next`) initializes from the downloaded data; interpolation through i18n, never string concatenation. API errors are displayed by translating `error.key` (§3).
- **Language selection:** ① localStorage → ② the browser language (`navigator.languages` against the list from `/api/init`) → ③ the EN fallback. A manual change is stored in localStorage (key `language`) and switches instantly (all languages are already downloaded). On a change `<html lang>` is updated.
- **Number formatting through own helpers, fixed per Figma:** `formatMoney`/`formatCount` with `Intl.NumberFormat` — space thousands, comma decimals, the currency code after the amount, always 2 dp. **The format does not change with the language or the browser locale** — the language changes texts, not numbers. The helpers are the only formatting place and have unit tests; the frontend never rounds values (§5).
- **HTML head:** a custom title and meta description; the favicon = a dollar icon (freely available, license-clean).

### Frontend architecture

- **Component structure:** feature folders (`features/converter/`, `features/stats/`) + shared `components/`; every component = a folder with `.tsx` + `.module.scss`. Tests live separately in `web/tests/` with a structure mirroring `src/` (rule 28 — no test colocation with sources).
- **State: hooks + Context API, no Redux/Zustand** — a store is over-engineering for an app of this size. API data through typed custom hooks (`useCurrencies`, `useConvert`, `useStats`); shared state (texts, currencies, statistics) through React Context.
- **Request state as a discriminated union** — `{ status: 'idle' | 'loading' | 'success' | 'error' }`; TypeScript forces handling of every state (rule 23).
- **A layer above the generated client:** components never call the generated client directly — above it sits a thin layer (an axios instance through the generator's mutator: a client-side timeout, mapping errors onto `ErrorCode`/`key`); the hooks call this layer. Components never see a raw `AxiosError`.
- **Currencies and texts are downloaded once** at boot and held in Context for the whole session.
- **SCSS architecture:** a central `styles/` — `_tokens.scss` (the design tokens from Figma; components never hardcode values), `_mixins.scss` (breakpoints), a reset; component styles exclusively through CSS Modules.
- **Rule 23 applies to `web/` as well** — strict TS without `any`/`as`, local `types.ts`/`enums.ts`/`constants.ts` per module.
- **Browser target:** modern evergreen browsers, no legacy polyfills; React `<StrictMode>` enabled.
- No component UI library and no grid framework. The open state of the selects is **an own implementation of the ARIA combobox pattern** (`role="combobox"`, `aria-expanded`, `aria-activedescendant`) — no extra dependency.

### API client

- The frontend writes no API calls by hand — it uses **a client generated from the OpenAPI specification** (§3). The contract flows one way: `schemas.ts` (Zod) → OpenAPI → the typed client; a contract change is a reviewable diff on the frontend, not a runtime surprise.
- **HTTP layer: axios.**
- Workflow: the API exports `openapi.json` → `web/` generates the client (`npm run generate:api`) → the generated code is committed (reproducibility, contract-diff review in PRs).
- Generator: **orval** (axios clients; the HTTP layer is wired through a custom mutator — §10 Architecture).
- The types on the frontend come exclusively from the generated client; the only artifact shared with the backend is `openapi.json` (§2).

### Hosting and integration (revised at 0.10.0: same-origin through the Router)

- The frontend after `vite build` = static files; they are served by **S3 + CloudFront through `sst.aws.StaticSite`** — the API and the web deploy with a single `sst deploy`, the whole infra in one config (the IaC bonus covers the frontend too). The Lambda serves no static files (an anti-pattern: an invocation per asset).
- **Production is same-origin through `sst.aws.Router`** (a human decision at 0.10.0; it replaces the original separate-origins plan): one CloudFront domain routes `/api/*` to the Lambda Function URL and everything else to the static site. Reasons: **no CORS in production** (the browser never makes a cross-origin request), no chicken-and-egg URL dependency (the web and the api know the single shared domain only at runtime — `VITE_API_URL` is empty in production = relative paths) and a single URL for the evaluator.
- **Router API:** routes are defined with the `router.route(prefix, url)` method for `/api`, `/docs`, `/health` (a prefix matches whole path segments — `/docs` catches `/docs/static/...` too, but not `/docsfoo`; without a `rewrite` the path is forwarded unchanged, the Lambda routes carry their prefixes themselves); the StaticSite attaches through `router: { instance: router }` as the default for everything else.
- **CORS remains for local development only:** `web:5173` → `api:3000` is cross-origin → `@fastify/cors` with `FRONTEND_ORIGIN` (default `http://localhost:5173`). The `cors` option on the Function URL stays disabled.
- `VITE_API_URL`: locally `http://localhost:3000`, in the production build **empty** (same-origin relative calls through the Router).
- **Separate env files:** `api/.env(.example)` and `web/.env(.example)`; no shared env. Rule 27 applies to both parts. AWS secrets exclusively through `sst secret` — `deploy/` needs no runtime `.env`.
- The monorepo structure is reality as of v0.9.0.

## 11. Approved dependencies (rule 8)

| Part      | Runtime                                                                                                                                                                                                       | Dev                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`    | fastify, zod, fastify-type-provider-zod, @fastify/swagger, @fastify/swagger-ui, @fastify/cors, @fastify/helmet, @fastify/rate-limit, **@fastify/aws-lambda**, @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb | typescript, tsx, vitest, @types/node, **@types/aws-lambda**, prettier, eslint, **@eslint/js**, typescript-eslint, eslint-config-prettier                                                                                         |
| `web/`    | react, react-dom, axios, react-hook-form, i18next, react-i18next, @fontsource/roboto                                                                                                                          | vite, @vitejs/plugin-react, typescript, @types/react, @types/react-dom, vitest, @testing-library/react, @testing-library/user-event, jsdom, sass, orval, prettier, eslint, @eslint/js, typescript-eslint, eslint-config-prettier |
| `deploy/` | —                                                                                                                                                                                                             | sst                                                                                                                                                                                                                              |

Anything beyond the table requires approval (rule 8).

## 12. AI configuration and way of working

The project is developed in collaboration with AI (Claude Code, the Claude Fable 5 model); the way of collaborating is designed, committed and enforced just like the rest of the architecture. The full reasoning: [AI_SETUP.md](AI_SETUP.md).

### Configuration layers

| Layer      | File(s)                        | Role                                                  |
| ---------- | ------------------------------ | ----------------------------------------------------- |
| Rules      | `CLAUDE.md` (29 working rules) | the contract with the AI — loaded every session       |
| Guardrails | `.claude/settings.json`        | machine-enforced boundaries (permissions, hooks)      |
| Commands   | `.claude/commands/`            | procedures triggered by the human (`/name`)           |
| Skills     | `.claude/skills/`              | procedures the AI picks up automatically by task type |

### Rules (CLAUDE.md — a selection of the key ones)

- **The AI never makes decisions alone** (rule 9) — it presents options with a recommendation, the human decides; the version scope is untouchable, everything extra goes to the Backlog (25).
- **Commit only after explicit human approval** (20); push, tag, release and deploy are done exclusively by the human (16). No AI attribution in commits (11); Conventional Commits with a descriptive body, in English (21/22).
- **The definition of done is verifiable** (10): a version is finished only when all the prompt's checkboxes are ticked and the answer contains the literal output of the typecheck, the lint and the tests.
- **Code quality enforced by rules:** strict TS without `any`/`as`, enums and constants, `type` instead of `interface`, local `types/enums/constants.ts` (23); JSDoc in a fixed format (12); no silent errors (24); a bugfix starts with a failing test (2).
- **Language discipline** (21): everything in English — the code, the documentation and the prompts.

### Guardrails (settings.json)

- **Deny list:** reading `.env*`, `sst deploy`/`sst remove`, `git push` — irreversible and sensitive actions are machine-forbidden to the AI, not merely "forbidden by word".
- **Allowlist:** routine read-only and test commands run without confirmation — fast iteration.
- **PostToolUse hook:** after every file edit the typecheck runs automatically — the AI sees its own mistakes immediately; the system catches the errors, not the human.

### Commands and skills

- `/diary` — recording a moment into AI_DIARY.md (triggered by the human); `/review-api` — an adversarial review of the changes in a fresh context before a commit.
- Skills (picked up automatically): `version-workflow` (the version lifecycle), `api-endpoint` (the chain of a contract change up to regenerating the FE client), `error-code` (a new ErrorCode in 5 places), `dynamo-stats` (DB patterns), `fe-component` (React component conventions), `figma-to-scss` (design tokens — the values are supplied by the human from Figma).

### Diary

`AI_DIARY.md` is a deliverable of the assignment — the records are written continuously (the `/diary` command), at the moment of the event, including failures and corrections of the AI; every version must add at least one record (rule 26). The diary is never rewritten retroactively.

### Future vision

The assignment's reflection question — _"If AI writes the code, what does a great engineer actually do?"_ — is answered by a dedicated **Future vision section near the top of the README** (right below the badges), so the evaluator reads it before the technical content. It is written in v1.0.0, in English. The core of the answer: when the AI writes the code, the great engineer finally gets to design the architecture they always dreamed of, instead of spending 95 % of their time typing code — the engineer decides WHAT to build and verifies that it is right (the design, the constraints, the rules, the review and the quality gates); this repo's AI setup is the practical demonstration of that role.

## 13. Process

Every version of the roadmap from v0.1.0 onward has a prompt in [`/prompt`](../prompt/) (format: [TEMPLATE.md](../prompt/TEMPLATE.md)) — an analysis, the solution design, checkbox tasks; the last task is always the tests of the given version. v0.0.0 has no prompt — it set up the process itself, including this mechanism. A version is finished only when all the checkboxes are ticked and the tests are green (rule 10). Every version = its own `feature/` branch (rule 13) that reaches `main` through a pull request; the AI prepares the commits and the PR title/description, while the push, the PR merge and the `vX.Y.Z` tag are done by the human (rule 16). The prompts are written from this document — if an undecided question appears while writing a prompt, it is resolved before the implementation starts.

## 14. Roadmap 0.0.0 → 1.0.0

| Version    | Content                                                                                                                                                                                                                                                                                                                                                      | Assignment level                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **0.0.0**  | AI configuration: CLAUDE.md (working rules 1–28), `.claude/` (permissions, hook, commands, skills), `docs/` + the proposal, the `prompt/` process, AI_DIARY.md                                                                                                                                                                                               | — (process)                        |
| **0.1.0**  | Project skeleton: TypeScript (strict), Fastify + the Zod type provider, `GET /health`, the central error handler + the error model, Swagger `/docs`, Vitest, docker-compose (dynamodb-local) + `db:init`, env configuration (`--env-file`), tooling (Prettier tabs, ESLint, Node 22 pinning, `.editorconfig`), `npm run setup`, GitHub Actions CI, CHANGELOG | —                                  |
| **0.2.0**  | i18n and `GET /api/init`: EN/CS/SK translations in `api/src/i18n/`, ETag + 304 revalidation, translation parity as a test                                                                                                                                                                                                                                    | —                                  |
| **0.3.0**  | The rate provider: the OER client (5 s timeout, Zod parsing), the TTL 10 min cache + the stale fallback, the cross-rate through USD, injected clock                                                                                                                                                                                                          | L1                                 |
| **0.4.0**  | `GET /api/currencies`: the intersection of rates and names, the server cache, `Cache-Control`, the supported-currency list                                                                                                                                                                                                                                   | L1                                 |
| **0.5.0**  | Conversion: `POST /api/convert` — `roundMoney()`, validations (amount, `from ≠ to`, supported currencies), `rateTimestamp`, error codes 400/422/502                                                                                                                                                                                                          | L1                                 |
| **0.6.0**  | Statistics: DynamoDB counters (`TransactWriteItems`, retry ×3, cents, the tie-break), the EUR conversion, `GET /api/stats`                                                                                                                                                                                                                                   | L1 + L2 persistence                |
| **0.7.0**  | SST: `deploy/` (the config, secrets), the lambda adapter, the Lambda parameters (§8), verification via `sst dev`                                                                                                                                                                                                                                             | "bonus" in the assignment — IaC    |
| **0.8.0**  | The production deploy (the live URL) + the README setup guide — **Level 1 + the bonuses complete**                                                                                                                                                                                                                                                           | "bonus" in the assignment — deploy |
| **0.9.0**  | The frontend base: the monorepo move (`api/` + `web/`), Vite/React, the SCSS tokens from Figma, the generated API client, the boot (init + currencies), the conversion form (react-hook-form)                                                                                                                                                                | L2                                 |
| **0.10.0** | The frontend completion: the statistics in the Result card, the language changer, the error/loading states, a11y, the frontend deploy (StaticSite + Router, same-origin)                                                                                                                                                                                     | L2                                 |
| **0.11.0** | Hardening: the rate limit + reserved concurrency (§9), edge cases, the e2e pass, the documentation review (syncing AI_SETUP.md)                                                                                                                                                                                                                              | —                                  |
| **1.0.0**  | Submission finalization: the AI diary complete, the future vision (the README-top section — §12), the time budget (summed from the changelog/diary datetimes), the final README                                                                                                                                                                              | submission                         |

Milestones: **0.8.0 = a submittable Level 1** (if time ran out, this is where to cut), **1.0.0 = the full Level 2 submission**.

## 15. Out of scope (consciously)

Multi-region, CD (automatic deploys from CI), API Gateway throttling/WAF — the README mentions them as "next steps", they are not implemented. Authentication is not a "next step" — it will not exist at all (§9). Rate limiting IS in scope (§9, the hardening version). CI (typecheck + lint + tests on push/PR) IS in scope from v0.1.0.

## Backlog

Everything that appears during the work and is not in the scope of any version is recorded here (rule 25). The items are planned only after v1.0.0.

- A conversion event log (history, not just aggregates) — if the statistics were to grow into charts/time series (§6)
