# AI Collaboration Diary

Record template:

```
## [YYYY-MM-DD HH:MM] — [task]
**Context:** what I was working on
**Prompt:** (verbatim, when instructive)
**What happened:** what the AI returned
**My intervention:** what I fixed/rejected/accepted and WHY
**Lesson:** what I take away (possibly what was added to CLAUDE.md)
```

## [2026-06-12 04:15] — v0.0.0: the AI audited my AI setup

**Context:** Finalizing the AI configuration (CLAUDE.md, `.claude/`, docs) before the first version commit. I asked Claude to walk through the project base, confirm it understands it, and then validate the whole AI setup in detail.

**Prompt:** "Go through my whole AI setup and validate it in detail; if you find anything you would advise me to improve, write it here into the chat." (translated — the session ran in Slovak)

**What happened:** The first pass already caught that `.claude/commands/` was empty although AI_SETUP.md and the proposal describe `/diary` and `/review-api` — I added them. The detailed validation then reported 6 issues, two of them serious: (1) my PostToolUse typecheck hook always exits 0, and a PostToolUse hook only feeds its output back to the model on exit code 2 + stderr — so the feedback loop I designed (and documented as the core of the setup) was effectively dead; (2) the hook looks for `tsconfig.json` in the repo root, so it would silently stop working at the v0.9.0 monorepo move. Further: the `.env` deny rules do not cover the future `api/.env`/`web/.env`, `npm run deploy` is not denied (only `npx sst deploy` is), the allowlist will not match the real project commands (`cd api && npm run verify:api`), and my `settings.local.json` — approvals accumulated during the prototype — allowed `git push`, `git commit`, `git merge`, `git tag` and reading `~/.aws/**`, machine-allowing exactly what my own rules 16/20 and AI_SETUP §7 forbid.

**My intervention:** I had it add `.gitignore` right away (secrets + `settings.local.json` + build outputs) and apply all the fixes before the v0.0.0 commit: the hook now feeds the typecheck errors back to the model via exit code 2 and walks the root, `api/` and `web/` tsconfigs, the deny list covers the nested `.env` files and `npm run deploy`, the allowlist matches the real project commands, and the prototype-era `settings.local.json` was reduced to a harmless minimum.

**Lesson:** "Enforced by the deny list, not by good will" only holds if the guardrails themselves are reviewed like code. My hook looked right, ran on every edit, printed errors — and still gave the model zero feedback. An adversarial audit of the AI configuration by the AI itself was cheap and found what I could not see because I trusted my own design.

## [2026-06-12 04:16] — v0.0.0: cross-checking the proposal against the assignment

**Context:** I pasted the original Purple LAB assignment text and asked Claude to verify the proposal covers all of it. Earlier in the same session I had also caught my own mistake in rule 21 — I had written that docs and prompts stay in Slovak while I meant English; the AI fixed the rule and its echo in proposal §12.

**What happened:** The technical mapping came back fully covered (in places above the assignment level — DynamoDB already at the Level 1 cut, the error catalog as a test). But it found two gaps, both in the soft deliverables: the future vision had no defined artifact (mentioned in the 1.0.0 roadmap row, but nowhere to live), and the time budget had no collection process — it would have ended as exactly the retroactive reconstruction AI_SETUP.md warns about for the diary.

**My intervention:** Two decisions: (1) every changelog entry and every diary record carries a datetime (`YYYY-MM-DD HH:MM`) — the time budget is summed from them at 1.0.0, no reconstruction (rules 14 and 26 updated); (2) the future vision will be a dedicated section near the top of the README, written at v1.0.0. I drafted the core answer myself — when the AI writes the code, a great engineer finally gets to design the architecture they always dreamed of instead of spending 95 % of the time typing code. Claude suggested strengthening it with the verification side — the engineer decides WHAT to build and verifies that it is right — and I agreed.

**Lesson:** Having the AI cross-check the spec against the source assignment catches exactly the gaps a tired author skips — the "soft" deliverables, not the technical ones. And the rule-21 moment: the AI applies rules literally, so a rule I wrote wrong is executed wrong — reading my own rules back through the AI's summary is how I spotted it.

## [2026-06-12 05:15] — v0.1.0: the skeleton, a hook that earned its keep, and a database that lied

**Context:** The first code version (the prompt: project skeleton — tooling, `buildApp()`, `GET /health`, the central error handler, dynamodb-local, CI). The AI implemented it task by task from `prompt/v0.1.0.md`.

**What happened:** Three moments worth keeping. (1) The PostToolUse typecheck hook — the one whose feedback loop was dead until the v0.0.0 audit fixed it — proved itself within minutes: it caught an unused parameter in `app.ts` right at the write and the AI fixed it before I ever saw the file. (2) `engine-strict` blocked the very first `npm install` because my shell ran Node 20 — the pinning worked exactly as designed. (3) The best one: the first `db:init` reported `Table "ConversionStats": created` — **a green result that was wrong**. Our container had actually failed to start (port 8002 already taken); the table was created in a leftover dynamodb-local container of the deleted SK prototype that was still running. A second trap followed: after removing the stale container, `docker compose up` reported the container as Up but the host port stayed unbound — only a full `docker compose down && up` recreated the network binding.

**My intervention:** None needed for (1) and (2) — the guardrails handled themselves. For (3) the AI noticed the contradiction (compose reported a port conflict, yet db:init succeeded), listed the running containers, found the stale one, removed it and recycled the compose stack; I only watched.

**Lesson:** A success message is not proof you talked to the right system — verify the target, not just the response. And the meta-lesson: the time invested into the v0.0.0 guardrail audit repaid itself in the first hour of real coding.

## [2026-06-12 05:34] — v0.2.0: shaping the prompt is design review, not paperwork

**Context:** The AI drafted `prompt/v0.2.0.md` (i18n + `GET /api/init`) from the proposal. Instead of approving it right away, I read it critically — and three design discussions came out of a one-page prompt before any code existed.

**What happened:** (1) I added a hard policy: a missing translation must never fall back to the key, English, an empty string or a placeholder — it fails immediately. The AI confirmed it is the right call and pointed out a thing I did not know: i18next (planned for the frontend at 0.9.0) silently returns the key by default, so without this policy written down the anti-pattern would have walked in unnoticed. (2) I added a second policy: existing tests are a contract — never adapt an old test to new behavior unless the prompt requires it; the AI framed it well ("a failing old test means the change is wrong, not the test") and turned it into rule 29. (3) I challenged the ETag design ("SHA-256 of the response JSON — does that make sense or change it?"); the AI defended the original design with concrete reasons (content-addressed never lies, computed once per process so the cost is zero, version-based ETags lie in dev when texts change without a version bump) and I kept it unchanged.

**My intervention:** Two additions written into the proposal, CLAUDE.md (rule 29) and the prompt; one challenge resolved by keeping the design. All before a single line of v0.2.0 code.

**Lesson:** The prompt review is the cheapest design review there is — policies and challenges land in the spec while changing them costs nothing. And asking the AI "does this make sense or should we change it" is a legitimate design tool: a good answer defends the design with reasons, not with agreement.

## [2026-06-12 05:44] — v0.2.0: rule 29 in action and a recursive schema that just worked

**Context:** Implementing `prompt/v0.2.0.md` (the i18n module + `GET /api/init` with ETag revalidation) in the same session that shaped the prompt.

**What happened:** The fresh rule 29 (existing tests are a contract) got its first real exercise: the error handler switched its message source from the v0.1.0 constants to the EN translation file, and the v0.1.0 tests asserting "Resource not found" and "Internal server error" stayed green untouched — the catalog was written to honor the existing contract, not the other way around. The new policies materialized as code the same day they were written: `formatEnglishMessage` throws on an unknown key, a non-leaf key and a missing interpolation param, and all three throwing branches have tests. One technical bet paid off: the recursive Zod schema for the translation tree (`z.lazy`) survived both the OpenAPI generation and the response serializer on the first try — I had a bounded-depth fallback ready and never needed it. The typecheck hook kept catching intermediate states (unused imports between two edits) — noisy but exactly its job.

**My intervention:** None during the implementation itself — the prompt was specific enough that the AI worked through the checkbox list without a single question. I reviewed the CS/SK translations it drafted (they were correct).

**Lesson:** A precise prompt turns the implementation into verification — the discussion belongs at the prompt stage, not the coding stage. And writing the full key catalog up front (including keys for codes that do not exist yet) meant zero schema churn is waiting for v0.3.0–0.5.0.

## [2026-06-12 05:58] — v0.3.0: the AI caught itself violating a rule

**Context:** Implementing `prompt/v0.3.0.md` — the rates module: the OER client, the generic TTL cache with the stale fallback and the deduplication, the cross-rate provider, `/health` wired to the real cache age.

**What happened:** The most interesting moment was self-correction: the AI wrote `fetchFn as unknown as FetchFn` into a test harness, then flagged it ITSELF in the very next step — rule 23 forbids `as` casts and the lint would have failed — and replaced the cast with the correct insight that a zero-argument function is directly assignable to the fetch signature (the cast was never needed; it was a reflex, not a necessity). Beyond that, the version went smoothly: the prompt's two scope decisions (the 502 mapping deferred to 0.4.0, `rateTimestamp` = the cache's `fetchedAt`) translated directly into code; the TTL/stale/dedup behavior is tested entirely under fake time through the injected clock — no sleeps, no flakes, 19 new tests in ~300 ms; and the v0.1.0 health test stayed green untouched while `/health` switched from a hardcoded `null` to the real cache age (rule 29 again — the wiring honored the existing contract: no fetch happens, so the age IS null).

**My intervention:** None — I reviewed the diff and the test scenarios against the prompt.

**Lesson:** The "no casts" rule works best as a forcing function: the moment a cast feels necessary, the type design is wrong somewhere — and removing the cast usually reveals the simpler correct typing. Also: injected clocks turn the hardest-to-test logic (TTL, staleness) into the fastest tests in the suite.

## [2026-06-12 11:03] — v0.4.0: the up-front investments started paying rent

**Context:** Implementing `prompt/v0.4.0.md` — `GET /api/currencies` (the intersection of names and rates), the deferred `RATE_PROVIDER_ERROR` 502 mapping with its catalog test, and the `buildApp` DI seam.

**What happened:** This version was mostly harvesting earlier decisions. The generic `createCachedSource<T>` from v0.3.0 took the currency names without a single change — the "generic on purpose" call proved itself. The `errors.rateProvider` translation had existed since v0.2.0 (the catalog landed complete back then), so completing the 502 error model touched zero i18n files and the parity test guarded it the whole time. The client refactor (one shared `fetchOerResource` pattern for both OER endpoints) kept all v0.3.0 client tests green untouched — rule 29 held through a refactor, not just through additions. The DI seam (`buildApp({ ratesProvider })`) made the route tests trivial: two app instances, one healthy and one throwing, no global fetch stubbing.

**My intervention:** None during the implementation; I reviewed the diff. The two parameters I pinned in the prompt (names TTL = 1 hour aligned with max-age=3600; `/currencies.json` requested with the app_id — one client pattern, no bet on OER's tolerance) went in as written.

**Lesson:** Architecture decisions are investments with a visible payback period: the generic cache paid off in one version, the complete i18n catalog in two. When the AI proposes "build it generic/complete now", the right question is not "do we need it now" but "is the version that needs it already on the roadmap".

## [2026-06-12 12:10] — between v0.3.0 and v0.4.0: we caught each other's misses

**Context:** Closing v0.3.0 and preparing v0.4.0 — two git-flow incidents in the space between versions, one caught by me, one by the AI.

**What happened:** (1) The CI on the v0.3.0 pull request failed and **I spotted it first** — the OpenAPI drift guard reported a one-line difference: `info.version` said 0.2.0 while the package was 0.3.0. I pasted the failing log into the chat; the AI immediately diagnosed the root cause (it had run `openapi:export` BEFORE bumping `package.json` when closing the version — the document embeds the version, so the committed file went stale the moment the bump landed) and prepared the one-line fix. A detail worth recording: the AI then tried to push as I asked — and the deny list machine-blocked it, exactly as designed; it committed, and I pushed. (2) When I asked for the next version's branch, **the AI refused to branch and stopped**: it checked the repo state first and found that my tag `v0.3.0` pointed at the v0.2.0 merge commit (I had tagged before merging the PR) and that `v0.1.0` did not exist at all. It gave me the exact commands to delete, re-point and push the tags, and only branched once main was verified.

**My intervention:** I reported the CI failure and executed the push and the tag fixes (the remote is mine — rule 16). The AI folded the export-ordering lesson into the closing checklist of every future prompt, starting with v0.4.0, where the order held.

**Lesson:** The collaboration works in both directions: I catch what lands in front of my eyes (a red CI run), the AI catches what requires checking state nobody looks at voluntarily (where tags actually point). And a guardrail blocking the AI's own hand — the denied push — is not friction, it is the system working.

## [2026-06-12 12:27] — v0.5.0: seven refinements into the money prompt before any code

**Context:** The AI drafted `prompt/v0.5.0.md` (POST /api/convert — `roundMoney`, the conversion service, the full validation catalog). The money version is where precision discipline matters most, so I went through the draft line by line and came back with seven concrete additions.

**What happened:** My seven points, all applied: (1) name the exact mechanism of the Zod-key passthrough in the handler description — `hasZodFastifySchemaValidationErrors` + `error.validation[0].message`, not "extract the key" hand-waving; (2) `rateTimestamp` in the response schema as a validated ISO datetime, not a plain string; (3) make the integer edge case of `roundMoney` explicit — `(100).toString()` has no decimal point, the split must survive it; (4) the 2-decimal-places refine checks the DECIMAL STRING, never `value * 100 % 1` float arithmetic — the same philosophy as roundMoney itself; (5) the currency code validated by the regex `/^[A-Za-z]{3}$/`, not a mere length check ("$12" has three characters too); (6) every field of `convertResponseSchema` explicitly typed; (7) state the relationship between `UnsupportedCurrencyError` (the user-facing 422) and the provider's defensive `UnknownRateCurrencyError`. The AI added two nuances on top: Zod 4's canonical form is `z.iso.datetime()` (the `z.string().datetime()` I named is a deprecated alias), and the consequence of (7) — since the 422 check runs before `getRate` and both read the same cached payload, `UnknownRateCurrencyError` is unreachable for user input by design, so if it ever escapes it is correctly a 500, not a 422.

**My intervention:** All seven points written into the prompt before a single line of v0.5.0 code; the AI's two nuances accepted. I also decided the one open question the AI raised with the draft — may a conversion result round to 0.00 (0.01 JPY → EUR ≈ 0.00006)? **Keep the honest zero:** the rate in full precision keeps the response verifiable, the assignment defines no minimum result, and a floor would be an invented business rule.

**Lesson:** A prompt for money code deserves the same review depth as money code. Naming exact APIs, exact regexes and exact edge cases in the prompt removes the freedom where freedom is risk — the implementation becomes transcription, and the review becomes verification.

## [2026-06-12 12:37] — v0.5.0: the AI deviated from the prompt — and was right to

**Context:** Implementing `prompt/v0.5.0.md` — `roundMoney`, the conversion service, the validation catalog, the Zod-key passthrough. The prompt was the most precise one yet (my seven refinements), so the implementation was mostly transcription — with one notable exception.

**What happened:** The prompt said exponential-notation inputs to `roundMoney` THROW. During the implementation the AI noticed this contradicts my own honest-zero decision: `Number.toString()` switches to exponential below 1e-6, and a legitimate tiny conversion (0.01 at a rate of 0.00001 = 1e-7) would have CRASHED with a 500 instead of rounding to the honest 0.00. The AI added a guard — values below 1e-6 return 0 before the string parsing (still no float multiplication; everything under 0.005 rounds to 0 anyway) — kept the throw for oversized exponentials (1e21, unreachable through the validation), flagged the deviation openly in its summary, and covered both branches with tests. Also worth recording: all 80 tests (29 new) passed on the very first run — the first version of the project where that happened, on the version with the most edge cases.

**My intervention:** Accepting the deviation — it implements the SPIRIT of my decision against the LETTER of the prompt, and the AI surfaced it instead of silently following either.

**Lesson:** A prompt is a contract, but a contradiction between two of its clauses (throw on exponential vs the honest zero) has to be caught by whoever holds the full context at execution time — and the right behavior is exactly what happened: resolve it in favor of the decided intent, say so out loud, and prove both branches with tests.

## [2026-06-12 12:48] — v0.6.0: the prompt review that kept giving — five findings

**Context:** Reviewing the AI's draft of `prompt/v0.6.0.md` (the statistics — DynamoDB counters, the EUR-at-write-time conversion, GET /api/stats). I came back with five findings — two genuine bug risks hiding in the prompt's own wording, one piece of database behavior that makes planned logic unnecessary, one contract-precision tightening and one observability gap.

**What happened:** (1) The draft said "for from = EUR simply the amount" — quoting proposal §5 faithfully, but §5 speaks about `amountEur` (euros) while `toEurCents` returns CENTS. Read literally, the EUR branch would return `100.50` instead of `10050` — a 100× error in the persistent aggregate, of exactly the kind that unit tests written from the same ambiguous sentence would bless. Even the AI's own test scenario carried the ambiguity ("passes the amount through"). Fixed in three places: the analysis, the design (`Math.round(amount × 100)` directly, no rate lookup) and the test list (`100.50 EUR → 10050 cents, never 100.5`). (2) The draft promised "any statistics error is caught" but described the catch only around the write — while `toEurCents` calls `getRate(from, 'EUR')` and can throw too; wrapped narrowly, the EUR leg would propagate into the central handler as a 502/500 and break the §6 guarantee that a conversion never fails because of statistics. Fixed: ONE try/catch wraps BOTH legs, with a dedicated test (the provider throwing on the EUR leg only → still 200). And (3), a different kind of finding: the draft described the alphabetical tie-break as logic to implement — but DynamoDB Query returns items in ascending sort-key order (ScanIndexForward defaults to true), so TARGET#EUR arrives before TARGET#GBP and one pass with the STRICT count > currentMax comparison gives the alphabetically-first winner for free; no .sort(), and >= would silently pick the LAST tied currency instead of the first. Without the hint the implementation would likely have added a redundant sort or the wrong comparison. And (4): the stats response schema written as informal "int" would have become a plain z.number() — I pinned z.number().int().nonnegative() for totalConversions (the OpenAPI document then says integer, which the generated frontend client of 0.9.0 inherits) and z.number().nonnegative() for totalAmountEur, with the serializer loudly enforcing the never-negative invariant. And (5): the prompt said the final stats failure is "logged with the request id" without distinguishing the levels — I asked for the split between a transient retry and the final failure; the AI refined it further: transient attempts log warn, not debug (the production level is info — debug retries would be invisible exactly where a flapping DynamoDB matters), and the repository receives the REQUEST-SCOPED logger as a parameter so even the retry lines carry the request id, while the final error log happens in the handler catch where the id is bound automatically. The AI verified all five, added a nuance to (2) — in-process the likelier throw is `UnknownRateCurrencyError` rather than an expired cache, since the stale fallback covers the latter — and noted the principle is unchanged either way.

**My intervention:** All five findings written into the prompt; the AI's nuances accepted (it also pinned that the order reliance gets a code comment and that pagination is a non-issue at ~170 items).

**Lesson:** The most dangerous prompt bugs quote the spec verbatim — §5's "simply the amount" is correct in its own context and wrong in the function that returns cents. Unit context matters more than faithful quoting; a guarantee ("never fails because of statistics") must be traced to EVERY call that could break it; and knowing what the database already guarantees (the sort order) deletes code before it exists.

## [2026-06-12 13:02] — v0.6.0: five findings later, the implementation was transcription

**Context:** Implementing `prompt/v0.6.0.md` — the statistics module, the DI-seamed wiring and `GET /api/stats`. Level 1 is now functionally complete and the L2 persistence with it.

**What happened:** The five-findings prompt review paid off exactly as intended: all five landed in code verbatim — the EUR branch returns `Math.round(amount × 100)` with a spy proving getRate is never called, one try/catch wraps both statistics legs (with the GBP→USD test where only the GBP→EUR leg throws and the response is still 200), the tie-break is a single pass with a strict `>` over the Query's ascending order (the reliance is a code comment and a test), the schema says nonnegative integer, and the retry logs two warns through the request-scoped logger before the final error. One honest stumble worth recording: the AI's first version of the flaky-client retry test was an ugly `Object.setPrototypeOf` hack to satisfy the client type — the typecheck hook rejected it, and the AI replaced it with a clean `vi.spyOn` on a real DocumentClient instance. The hook keeps earning its keep. The end-to-end test — `POST /api/convert` landing in `GET /api/stats` through the real dynamodb-local — passed on the first run; 95 tests total, the suite still under three seconds.

**My intervention:** None during the implementation — the prompt carried the whole review.

**Lesson:** The review effort moved entirely to the prompt stage and the implementation became transcription plus verification — the second version in a row confirming the pattern. The deeper the prompt review, the more boring the implementation; in money-and-persistence code, boring is exactly the goal.

## [2026-06-12 13:12] — v0.7.0: the infra prompt review — four findings

**Context:** Reviewing the AI's draft of `prompt/v0.7.0.md` (the SST infrastructure — deploy/, the Lambda adapter, the esbuild traps).

**What happened:** (1) I caught a path bug in the prompt's own copyFiles spec: `deploy/package.json` has a single dependency (`sst`), so `@fastify/swagger-ui` lives in the ROOT `node_modules` — but `copyFiles.from` resolves relative to `sst.config.ts` in `deploy/`, so the drafted `node_modules/@fastify/swagger-ui/static` would have copied a non-existent directory and Swagger UI would have 404'd on Lambda. The fix is one load-bearing `../`. The AI confirmed it, connected it to the already-pinned out-of-root handler situation (when the handler lives in `../src`, its assets live in `../node_modules`) and pinned the follow-up: at the v0.9.0 monorepo move the path shifts once more, to `../api/node_modules/...` — now part of the move checklist.

(2) I added the MANDATORY first line of every SST v4 config the draft omitted: /// <reference path="./.sst/platform/config.d.ts" /> — without it TypeScript cannot see the $config/$app/sst.\* globals and the config does not typecheck. The AI connected it back to its own vague "lint exception if needed" note: the exception is not hypothetical, the triple-slash-reference rule forbids exactly this mandatory line, so the file-scoped exception is now pinned; and it added the nuance that .sst/ is generated and gitignored, so the reference resolves only after the first SST run.

(3) The draft said resolveSwaggerStaticDir looks "next to the module" without saying HOW — and in an ESM project ("type": "module") that phrase is a trap: \_\_dirname does not exist and process.cwd() tracks the working directory, not the file. I pinned the exact pattern: path.join(path.dirname(fileURLToPath(import.meta.url)), 'static'). The AI added why it holds on Lambda: SST bundles the function as ESM, so import.meta.url points at the bundle file and copyFiles places static/ right next to it.

(4) The smoke-test fixture format: the draft said "an API Gateway event fixture", but SST url: true creates a Lambda FUNCTION URL — payload format 2.0 (version: '2.0', requestContext.http, rawPath), not the API GW v1 shape with httpMethod. The AI added the honest nuance that @fastify/aws-lambda handles both formats at runtime, so production would not crash — the real cost is subtler and worse: a v1 fixture tests an adapter branch production never executes, which is false confidence dressed as a passing test. The fixture is now pinned as v2.

**My intervention:** All four findings written into the prompt before any infrastructure code exists.

**Lesson:** No-sharing module boundaries (deploy/ owns only sst) are an architectural win that quietly relocates every relative path crossing them — a review must walk each such path from where it will actually be resolved, not from where the reader happens to sit. And a "maybe we will need an exception" in a prompt is a smell: either the need is provable now (then pin it with its cause) or the sentence is noise.

## [2026-06-12 13:21] — v0.7.0: the npm footgun the no-sharing principle was waiting for

**Context:** Implementing `prompt/v0.7.0.md` — the SST infrastructure, the Lambda adapter, the swagger resolver.

**What happened:** The first command of the version hit a classic: `npm install -D sst` executed inside `deploy/` BEFORE `deploy/package.json` existed — npm silently walked UP the tree and installed sst into the ROOT project, the exact cross-module leak the no-sharing principle forbids. The AI caught it immediately (the verification step showed sst in the root package.json), uninstalled it, created `deploy/package.json` first and reinstalled properly. A pleasant confirmation along the way: the installed package is sst 4.x — the proposal's "SST v4" label, written weeks earlier, aged correctly. The four prompt-review findings went in verbatim (the `../` copyFiles path, the mandatory triple-slash reference with its file-scoped lint exception, the `import.meta.url` resolver pattern, the Function URL v2 test fixture); the typecheck hook caught one real test bug mid-flight — the minimal Lambda `Context` object missing half its required fields — fixed by building the complete typed fixture with no-op callbacks instead of reaching for a forbidden cast. 99 tests green; the `openapi.json` diff after the bump-then-export order is exactly one line (`info.version`) — zero contract drift, as the prompt demanded.

**My intervention:** I ran the sst dev verification against my AWS account: the stack came up, and the root URL answered with the unified 404 from the Function URL — which in one response proves the out-of-root handler bundled (the pinned risk never materialized), the app boots on Lambda, the adapter and the central error handler work, and the message arrived from en.json (the static i18n imports survived esbuild). The convert/stats/docs legs (the OER secret, the DynamoDB write, the copyFiles assets) stay for the v0.8.0 production verification — that version is the deploy verification by design.

**Lesson:** npm resolves "the nearest package.json" with no respect for intended module boundaries — in a no-sharing monorepo, creating the boundary file FIRST is part of creating the boundary. And the closing-order discipline (bump before export) has now paid for its CI lesson twice over.
