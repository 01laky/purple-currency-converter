# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Every entry carries the datetime the version was closed — together with the AI_DIARY.md datetimes it is the source of the submission time budget (rule 14).

## [0.0.0] — 2026-06-12 04:15

### Added

- **Working rules (`CLAUDE.md`)** — the contract with the AI: 28 rules covering decision-making, the git flow, code quality, the error model, language discipline and the definition of done.
- **AI guardrails (`.claude/settings.json`)** — committed permissions (allow for routine read-only and test commands; deny for `.env` reads, deploy, remove and push) and a PostToolUse hook running the typecheck after every file edit.
- **Custom commands (`.claude/commands/`)** — `/diary` (a record into the AI collaboration diary) and `/review-api` (an adversarial pre-commit review targeting the domain traps).
- **Skills (`.claude/skills/`)** — six task-type procedures: `version-workflow`, `api-endpoint`, `error-code`, `dynamo-stats`, `fe-component`, `figma-to-scss`.
- **Documentation (`docs/`)** — `proposal.md` (the binding design and the roadmap 0.0.0 → 1.0.0) and `AI_SETUP.md` (the AI process and its reasoning).
- **AI collaboration diary (`AI_DIARY.md`)** — created on day one, with the record template in the file header.
- **Repo hygiene (`.gitignore`)** — secrets (`.env*` except `.env.example`), local AI permissions (`.claude/settings.local.json`), dependencies and build outputs.

[0.0.0]: https://github.com/01laky/purple-currency-converter/releases/tag/v0.0.0
