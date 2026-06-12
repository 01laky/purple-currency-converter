---
name: version-workflow
description: Use ALWAYS when starting work on a new version (prompt/vX.Y.Z.md) and when finishing/closing it. Covers the whole version lifecycle - the branch, the tasks, the definition of done, the changelog, the commit.
---

# The version workflow

Source of truth: CLAUDE.md (rules 10, 13, 14, 15, 20, 22, 26) and docs/proposal.md (§12 Process). This skill is an executable sequence — on a conflict CLAUDE.md wins.

## Starting a version

1. Read `CLAUDE.md`, `docs/proposal.md` and the `prompt/vX.Y.Z.md` of the given version. If the prompt does not exist or contains an unresolved question → STOP, resolve it with the human (rule 9).
2. Verify a clean working tree (`git status`). If it is not clean → STOP, resolve it with the human.
3. Create the branch `feature/vX.Y.Z-name` (rule 13). Fixes outside a version go into `fix/description`.
4. Summarize the task plan from the prompt to the human before the first line of code.

## During the work

- Implement EXCLUSIVELY the tasks of the version's prompt (rule 25) — write anything extra into the Backlog section of `docs/proposal.md` and continue.
- Existing tests are a contract (rule 29) — never adapt an old test to new behavior unless the prompt explicitly requires it; add new tests instead. A failing old test means the change is wrong, not the test.
- Tick a checkbox in the prompt ONLY AFTER the given task is verified, never in advance (rule 10).
- Every logic change = a test in the same commit.
- Make no decisions alone — present options with a recommendation and wait (rule 9).

## The definition of done (before declaring the version finished)

1. All the prompt's checkboxes ticked.
2. `npm run verify:api` (a backend version) / `npm run verify:web` (a frontend version) — the literal output into the answer (rule 10). A failure = the version is NOT done.
3. CHANGELOG.md: the `[X.Y.Z] — YYYY-MM-DD HH:MM` entry (the closing datetime — the time-budget source, rule 14), the Added/Changed/Fixed sections, bold feature names.
4. The version in `package.json` = X.Y.Z; matching the README badge and the CHANGELOG (rule 15).
5. A record into AI_DIARY.md — at least one moment from the version (rule 26); use the template from the file header, starting with the datetime (`YYYY-MM-DD HH:MM`).
6. Propose the commit message (a Conventional Commits subject + a descriptive body, EN — rules 21/22). **Execute the commit only after explicit human approval (rule 20).** Then propose the pull-request title and description — **the push, the PR merge and the tag are done by the human (rule 16).**

## After finishing (remind the human)

- The push of the `feature/` branch, the pull request into `main` and the `git tag vX.Y.Z` — done by the human (rule 16). **The AI never pushes.**
- Start the new version in a new session with a clean context (rule 26).
