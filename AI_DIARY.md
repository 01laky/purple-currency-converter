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
