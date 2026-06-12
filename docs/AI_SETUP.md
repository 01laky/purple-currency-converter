# AI setup in the project — Claude Code + Claude Fable 5

Goal: set up the AI collaboration so that it is **professional, repeatable and visible in the repo**. In this case the AI collaboration is the primary evaluation criterion — the setup itself (a committed `CLAUDE.md`, permissions, hooks) is the proof that I work with AI systematically, not ad-hoc copy-paste.

---

## 1. Tool and model

- **Tool:** Claude Code (a CLI agent — it reads the repo, edits files, runs tests, makes commits)
- **Model:** **Claude Fable 5** (`claude-fable-5`) — the most intelligent available model, built for agentic coding; configured via `/model` in a session or `"model"` in the settings
- Principle: one powerful model for everything — planning, implementation and review. No model juggling needed; what matters more is workflow discipline (chapter 5).

---

## 2. `CLAUDE.md` — the project memory (the most important file)

Claude Code loads it automatically at the start of every session. It is **the contract between me and the AI**: conventions, commands, domain traps. Without it every session starts from zero and the AI repeats the same mistakes.

The initial draft of the content from before the implementation (kept for the context of the decisions). **The living contract is `CLAUDE.md` in the repo root** — over the project it grew to 28 rules; real failures and agreements kept extending it, exactly per the "living document" principle below:

```markdown
# Currency Conversion API — project rules

## Context

The binding design and decisions: docs/proposal.md.
Stack: TypeScript, Fastify + Zod (fastify-type-provider-zod), DynamoDB, SST v3, Vitest.

## Commands

- `npm run dev` — the local server (requires `docker compose up -d` + `npm run db:init`)
- `npm test` — Vitest (unit + integration against dynamodb-local)
- `npx tsc --noEmit` — typecheck
- `npx sst dev` / `npm run deploy` — AWS (NEVER trigger a deploy yourself, only on request)

## Architecture (do not change without discussion)

- All the logic in `src/app.ts` (a pure Fastify app); `lambda.ts` and `server.ts` are ONLY adapters
- The app reads configuration EXCLUSIVELY from env variables (STATS_TABLE, OER_API_KEY, DYNAMO_ENDPOINT)
- Input validation: Zod schemas in `src/schemas.ts`, wired through the type provider — no manual validation in handlers
- DynamoDB access only through `src/lib/dynamo.ts`

## Domain traps

- Money: NEVER plain float arithmetic — compute in whole units / via decimal, rounding explicit and tested
- Rates: the openexchangerates free plan has a USD-ONLY base → cross-rate (EUR→GBP = USDGBP/USDEUR), must be covered by a test
- The rates cache: TTL 1h; on an external API outage return the stale cache + a header, not a 500
- In-memory state does not survive on Lambda — statistics go ALWAYS to DynamoDB

## Conventions

- Error responses: `{ error: { code, key, message, params? } }`, correct HTTP codes (400 validation, 422 business, 502 external API)
- Every logic change = a test in the same commit
- Before marking a task done: `npx tsc --noEmit` + `npm test` must pass
- Commits: small, English, imperative ("add rate caching")

## Forbidden

- Reading or printing `.env` / AWS credentials
- `sst deploy`, `sst remove`, `git push` without an explicit instruction
- Adding dependencies without a justification in the commit message
```

Principles of writing `CLAUDE.md`: short (the AI reads it every session — ballast dilutes attention), concrete (commands and traps, not phrases like "write clean code"), and **living** — when the AI breaks something repeatedly, I add a rule. The git history of `CLAUDE.md` changes = beautiful material for the AI diary ("here I had to teach the AI X").

---

## 3. `.claude/settings.json` — permissions and hooks

Committed into the repo (it applies to anyone who opens the repo). Two roles: **safe guardrails** and **an automatic feedback loop**.

```json
{
	"permissions": {
		"allow": [
			"Bash(npm run dev)",
			"Bash(npm test:*)",
			"Bash(npm run db:init)",
			"Bash(npx tsc --noEmit)",
			"Bash(npx vitest:*)",
			"Bash(docker compose up:*)",
			"Bash(docker compose ps:*)",
			"Bash(git status)",
			"Bash(git diff:*)",
			"Bash(git log:*)"
		],
		"deny": [
			"Read(.env)",
			"Read(.env.*)",
			"Bash(npx sst deploy:*)",
			"Bash(npx sst remove:*)",
			"Bash(git push:*)"
		]
	},
	"hooks": {
		"PostToolUse": [
			{
				"matcher": "Edit|Write",
				"hooks": [
					{
						"type": "command",
						"command": "cd \"$CLAUDE_PROJECT_DIR\" && npx tsc --noEmit 2>&1 | head -20 || true"
					}
				]
			}
		]
	}
}
```

What it does and why:

- **`allow`** — routine read-only and test commands run without confirmation → fast iteration, the AI can verify itself
- **`deny` on `.env`** — the AI never sees the API keys and the AWS credentials. This is hygiene the evaluators will appreciate: a prompt containing secrets is a leaked prompt
- **`deny` on deploy/push** — irreversible actions stay in human hands; the AI proposes them, I execute them
- **The PostToolUse hook** — after every file edit the typecheck runs automatically and the result returns to the AI as feedback. The AI thus **sees its own mistakes immediately**, not only when I run a build. This is the exact meaning of the "feedback loop": the system catches the errors, not the human.

---

## 4. Custom slash commands — `.claude/commands/`

Repeated prompts as files in the repo. Two that pay off for the case:

```markdown
## <!-- .claude/commands/diary.md -->

## description: Record a moment into the AI collaboration diary

Add a record to AI_DIARY.md following the template in the file header. The moment: $ARGUMENTS
Write it factually, in the first person, including the actual prompt when relevant. Do not embellish anything.
```

```markdown
## <!-- .claude/commands/review-api.md -->

## description: A critical review of the API code before a commit

Do a critical review of the uncommitted changes (git diff). Focus on:

1. Money and rounding (floating point errors)
2. Validation edge cases (from === to, an unknown currency, extreme amounts)
3. Behavior during an external API outage
4. Whether the logic change has a test
   Be adversarial — look for reasons why it does NOT work. Fix nothing, only report.
```

The point of `/review-api`: the AI that wrote the code is a poor critic of its own work within the same conversation. A review in a fresh context with an explicitly adversarial brief finds mistakes the "author" overlooks. (Claude Code also has the built-in `/code-review` — the custom command additionally targets the domain traps of this project.)

---

## 5. Workflow — the discipline that makes the difference

The tools above are support; what decides is the way of working:

1. **A plan before code (plan mode).** I start every larger task in plan mode (Shift+Tab) — the AI first explores the context and proposes an approach, I approve/adjust it, only then is code written. The first commit of the repo = the spec and the process (`docs/`, `CLAUDE.md`), not code — the assignment explicitly wants to see this.
2. **Small steps, small commits.** One task = one conversation = one or two commits. Long sessions degrade (the context dilutes) — better `/clear` and a new task with a fresh context; permanent knowledge belongs in `CLAUDE.md`, not in the chat history.
3. **I read every diff.** The AI generates, I approve. If I do not understand a diff, I do not let it through — I have it explained. (The "this the AI proposed wrong and why" moments = the core of the diary.)
4. **The AI writes the tests, I define the scenarios.** The AI generates test boilerplate excellently; the engineer's value is in the scenario list: the cross-rate, rounding, cache expiry, an external API outage, `from === to`.
5. **Verification before "done".** The definition of done is in `CLAUDE.md` (typecheck + tests) and the hook enforces it continuously.
6. **The AI makes the commits, but only after my approval (rule 20); I do the pushing.** The AI prepares the changes and proposes a commit message, and commits only on instruction. Commit messages carry no AI attribution (no `Co-Authored-By: Claude` trailer — rule 11); the scope of the AI collaboration is documented by AI_DIARY.md, not by the git history. Push and deploy are deny-listed.

---

## 6. The AI collaboration diary — the collection process

The most common mistake: writing the diary retroactively at the end → it comes out sterile and unconvincing. The process:

- Create `AI_DIARY.md` **on day one**, with the template in the header:

```markdown
## [YYYY-MM-DD HH:MM] — [task]

**Context:** what I was working on
**Prompt:** (verbatim, when instructive)
**What happened:** what the AI returned
**My intervention:** what I fixed/rejected/accepted and WHY
**Lesson:** what I take away (possibly what was added to CLAUDE.md)
```

- Record **at the moment something happens** — that is what `/diary <note>` is for (chapter 4); the AI formats the record, the content is mine
- Deliberately collect the three types of moments the assignment explicitly asks for: (a) a prompt that worked excellently + why, (b) a prompt/proposal that failed + how I got out of it, (c) a moment where I had to rewrite/stop the AI
- The records are written at the moment of the event — rule 26 enforces it (every version has a diary record as part of its definition of done); raw transcripts are not exported, the primary artifact is AI_DIARY.md

Expected sources of records in this project (guessing ahead): floating point with money, the cross-rate through USD (the AI likes to generate a direct `rates[from][to]`, which does not exist on the free plan), the in-memory cache on Lambda, overly optimistic error handling.

---

## 7. Security and hygiene

- **Secrets:** `.env` in `.gitignore` + `Read(.env)` in the deny list + `sst secret` for AWS. The API key never appears in a prompt, in the code or in the diary
- **Irreversible actions** (deploy, remove, push): always the human, enforced by the deny list — not by good will
- **Generated code = my code:** I carry responsibility for every line as if I had written it myself; "the AI wrote it" is no defense — hence the diff-reading rule
- **Hallucinated APIs:** the AI occasionally invents a non-existent method/package — the typecheck hook catches most of it, the tests the rest; with new dependencies verify that the package really exists and is alive

---

## 8. Summary — what appears in the repo

```
.claude/
├── settings.json               # permissions + hooks (committed)
├── commands/                   # triggered by the human (/name)
│   ├── diary.md                # /diary — a diary record
│   └── review-api.md           # /review-api — an adversarial review
└── skills/                     # the AI picks them up automatically by task type
    ├── version-workflow/       # the version lifecycle (branch → tasks → DoD → commit)
    ├── api-endpoint/           # the endpoint-addition chain (schema → translations → tests → client)
    ├── error-code/             # a new ErrorCode end-to-end (5 mandatory places)
    ├── dynamo-stats/           # DynamoDB patterns (transactions, cents, retry, db:init)
    ├── fe-component/           # React component conventions (i18n, helpers, hooks, RTL)
    └── figma-to-scss/          # design-token extraction (the values are supplied by the human from Figma)
CLAUDE.md                       # the project memory — the contract with the AI (28 working rules)
AI_DIARY.md                     # the collaboration diary (continuous, rule 26)
CHANGELOG.md                    # Keep a Changelog, datetimed entries = the time-budget source (from v0.0.0)
README.md                       # badges, the future vision (v1.0.0), the API reference, the quick start, the documentation table
docs/
├── AI_SETUP.md                 # this document
└── proposal.md                 # the binding design + the roadmap 0.0.0 → 1.0.0
prompt/
├── TEMPLATE.md                 # the version prompt template
└── vX.Y.Z.md                   # the prompt of every version (one per version, 0.0.0 → current)
api/                            # the Fastify application + tests + openapi.json (the contract source)
web/                            # the React frontend + tests (the client generated from openapi.json)
deploy/                         # the SST infrastructure (Lambda, DynamoDB, Router, StaticSite)
figma/                          # the committed design export (the source of the SCSS tokens)
.github/workflows/ci.yml        # typecheck + lint + tests + the OpenAPI drift guard
```

The introduction order: `git init` → commit the spec documents + `CLAUDE.md` + `.claude/` (commit #1, no code yet) → create `AI_DIARY.md` (commit #2) → only then the first code. The evaluator thus sees in the history: **first the thinking and the process setup, then the implementation** — exactly what the assignment rewards.
