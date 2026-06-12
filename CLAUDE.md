# Currency Conversion API — project rules

## Context
The binding design and all decisions: docs/proposal.md. The AI process: docs/AI_SETUP.md.
Stack: TypeScript, Fastify + Zod (fastify-type-provider-zod), DynamoDB (locally amazon/dynamodb-local), SST v4, Vitest.

## Commands
- `cd api && npm run dev` — the API on :3000 (requires `npm run setup` once); `cd web && npm run dev` — the frontend on :5173
- `npm run verify:api` (in api/) / `npm run verify:web` (in web/) — typecheck + lint + tests
- `npx tsc --noEmit` — typecheck
- `npx sst dev` / `npm run deploy` — AWS (NEVER trigger a deploy yourself, only on an explicit instruction)

## Architecture (do not change without discussion)
- All the logic in `api/src/app.ts` (a pure Fastify app); `lambda.ts` and `server.ts` are ONLY thin adapters
- The app reads configuration EXCLUSIVELY from env variables (STATS_TABLE, OER_API_KEY, DYNAMO_ENDPOINT)
- Input validation: Zod schemas in `src/schemas.ts`, wired through the type provider — no manual validation in handlers
- DynamoDB access only through `src/lib/dynamo.ts`

## Domain traps
- Money: NEVER plain float arithmetic — compute explicitly, rounding defined and tested
- Rates: the openexchangerates free plan has a USD-ONLY base → cross-rate (EUR→GBP = USDGBP/USDEUR), must be covered by a test
- The rates cache: TTL 10 min; on an external API outage return the stale cache, not a 500
- In-memory state does not survive on Lambda — statistics go ALWAYS to DynamoDB
 
## Working rules
1. **Tests never call the real openexchangerates API** — the rate provider is always mocked/replaced by a fixture in tests (the free plan = 1,000 req/month; network tests are flaky).
2. **A bugfix starts with a failing test** that reproduces the bug — only then the fix.
3. **The response of an external API is always parsed through a Zod schema and the fetch has a timeout.** Never assume the response shape; a failure of an external API must never end as a 500.
4. **Money rounding exists in one place** — one helper, called once at the end of the computation, with boundary-value tests. No scattered `toFixed`/`Math.round`.
5. **A currency is validated against the list of actually supported currencies** (from the list in the rates cache), not just by format — an unknown currency = 422 with a clear message.
6. **The API contract lives in `src/schemas.ts`** — a change of an endpoint/response shape = a change of the Zod schema + a README update in the same commit.
7. **No `console.log` — only the Fastify logger.** Never log `OER_API_KEY`, the whole `process.env` or raw headers.
8. **A new dependency = first a proposal with a justification, then wait for approval.**
9. **The AI never makes decisions alone — never.** Every decision (architecture, the API contract, solution choice, data structure) is presented with options and a recommendation, discussed, and the human's decision is awaited.
10. **The work follows the proposal and the prompts exclusively.** `docs/proposal.md` holds the overall design and the roadmap 0.0.0 → 1.0.0. Every version from v0.1.0 onward has a `prompt/vX.Y.Z.md` (v0.0.0 — the process setup itself — has none) with an analysis, a solution description and checkbox tasks; **the last task of every version is always the tests for the given proposal**. The AI must not declare a version done until all the checkboxes are ticked and the tests are green — ticking happens continuously, after verification, and "tested" means the literal output of `npx tsc --noEmit` + `npm test` in the answer.
11. **Claude is NEVER added to commits as a co-author.** No `Co-Authored-By: Claude` trailer and no other AI attribution in commit messages.
12. **Every method, function and class has a JSDoc comment in exactly this format** (tag order, empty lines between groups; `@param`/`@throws` only when they exist):
    ```ts
    /**
     * @name methodName
     *
     * @description description
     *
     * @param {number} param1 description
     * @param {number} param2 description
     *
     * @returns {number} description
     *
     * @throws {Error} description
     */
    ```
13. **Every new prompt = a new branch.** Work on the version `prompt/vX.Y.Z.md` starts by creating the branch `feature/vX.Y.Z-name` (e.g. `feature/v0.1.0-skeleton`); fixes go into `fix/problem-description`. Never commit directly to `main` — `main` is reached by a merge after the version is finished (rule 10).
14. **CHANGELOG.md per Keep a Changelog + SemVer, with a datetime.** Every finished version adds a `[X.Y.Z] — YYYY-MM-DD HH:MM` entry (the moment the version was closed) with Added/Changed/Fixed sections and a comparison link to the GitHub diff. Bullets: **a bold feature name** + a description. The changelog datetimes, together with the diary ones (rule 26), are the source for the submission time budget. **The changelog entry is a mandatory part of the definition of done of EVERY version** (including non-code ones) — a version must not be closed without it; never a retroactive reconstruction.
15. **The version has a single source of truth: `package.json`.** The README badge and Project Status are updated in the branch in which the version is being finished; the version match across `package.json`, the README and the CHANGELOG is part of the definition of done.
16. **The AI never pushes — the remote belongs to the human.** The AI prepares every commit (rule 20) and, when a version is finished, proposes the pull-request title and description; the push, opening and merging the pull request and the `vX.Y.Z` tag are done exclusively by the human. A version reaches `main` through a pull request from its `feature/` branch; the GitHub release note = the content of the changelog entry.
17. **The README keeps a fixed structure:** badges (version, Node/TS, tests) → Future vision (the assignment's reflection answer — added in v1.0.0) → How it works (the request-flow diagram) → API reference (endpoints + examples) → Quick Start (the local run + AWS) → Documentation (the table of links into `docs/`) → Project Status → Tech Stack → AI collaboration (link to AI_DIARY.md) → Author & License.
18. **All documentation lives in `docs/`**, the README links to it with a table. The repo root contains only README.md, CHANGELOG.md, CLAUDE.md and AI_DIARY.md — no other MD files.
19. **The README and the CHANGELOG are changed exclusively in the branch of the version they concern.** `main` always has a README matching the last release — it never describes non-existent functionality.
20. **The AI makes the commits, but NEVER without the human's decision.** The AI prepares the changes (staged) and proposes a commit message; the commit itself is executed only after explicit approval. The same applies to amend and to any operation changing the git history. An instruction like "create a branch" is NOT an implicit consent to a commit.
21. **Language discipline: everything in English.** Identifiers, JSDoc comments (including `@description`), API error messages, logs and commit messages, as well as `docs/`, `AI_DIARY.md` and the prompts — all in English. `AI_DIARY.md` must contain no Slovak: when a quoted prompt comes from a session run in Slovak, record its English translation with the note "(translated — the session ran in Slovak)".
22. **Conventional Commits, as descriptive as possible.** The subject in the `type: description` format with the types `feat`, `fix`, `test`, `docs`, `chore`, `refactor`; below it always a body that describes in detail WHAT changed and WHY. Never one-line laconic commits.
23. **Strict typing with no escapes and with a fixed type structure.** Forbidden: `any`, `as` casts (type assertions) and `@ts-ignore`/`@ts-expect-error` (the single exception: a `// SAFETY: reason` comment on the same line). **The const assertion `as const` is allowed** — it is not a cast, it does not disable type checking (it only narrows literals to readonly types); ESLint `assertionStyle: 'never'` deliberately does not punish it. No magic values — use enums and constants. Do not use `interface`, always `type`. Every module separates its definitions into local `types.ts`, `enums.ts` and `constants.ts` files.
24. **No silent errors.** An empty `catch` and a `catch` without logging are forbidden; every error is either handled (mapped onto the error model 400/422/502) or left to propagate into the central error handler.
25. **The version scope is untouchable + the Backlog.** Only what is in the version's prompt gets implemented. Anything extra (an idea, debt, an out-of-scope edge case) is recorded in the `Backlog` section of `docs/proposal.md`. Backlog items are planned only after v1.0.0 — they are never implemented "along the way".
26. **Every version = a new session + a diary record.** Work on a version starts with a clean context (`/clear`); the AI first reads `CLAUDE.md`, `docs/proposal.md` and the version's prompt. Part of the definition of done of a version is at least one record in `AI_DIARY.md`. Every diary record starts with a datetime (`YYYY-MM-DD HH:MM`) — together with the changelog datetimes (rule 14) it is the source for the submission time budget.
27. **A new env variable = an updated `.env.example` + README in the same commit.** `.env.example` is always the complete list of the configuration, without values.
28. **Tests live ALWAYS separately from the sources.** A dedicated `tests/` directory in the given part (API: `tests/`, frontend: `web/tests/`) whose structure mirrors `src/`. NEVER `*.test.ts` next to source files — no colocation.

## Conventions
- Error responses: `{ error: { code, key, message, params? } }` — `key` = the i18n key for the FE, `message` ALWAYS in English (the assignment: meaningful errors); HTTP codes: 400 validation, 422 a business rule, 502 an external API outage
- Every logic change = a test in the same commit
- Before marking a task done: `npx tsc --noEmit` + `npm test` must pass
- Commits: as descriptive as possible, in English — a concise subject + a body with the details of what changed and why (rules 21–22)

## Forbidden
- Reading or printing `.env` / AWS credentials
- `sst deploy`, `sst remove`, `git push` without an explicit instruction
- Adding dependencies without a justification in the commit message
