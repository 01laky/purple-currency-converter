---
name: dynamo-stats
description: Use for any work with DynamoDB or the conversion statistics - writing/reading the counters, the db:init script, integration tests against dynamodb-local, the local/AWS client switching.
---

# DynamoDB and statistics — the project patterns

Source of truth: docs/proposal.md §6 (the data model) and §5 (money). The DynamoDB API is vast — use EXCLUSIVELY the patterns below.

## Client access

- The single place: `lib/dynamo.ts` (`DynamoDBDocumentClient`). Switching: when `DYNAMO_ENDPOINT` is set → local (the endpoint + region `local` + dummy credentials `local`/`local`); otherwise AWS (everything supplied by the Lambda runtime).
- The modular `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` v3 — NEVER the old monolithic `aws-sdk` v2.

## The data model (immutable)

| pk | sk | attributes |
|---|---|---|
| `STATS` | `GLOBAL` | `conversionCount: N`, `totalEurCents: N` |
| `STATS` | `TARGET#<CURRENCY>` | `count: N` |

## Writing a conversion

- **One `TransactWriteItems` transaction** with two `Update ADD`s: GLOBAL (`conversionCount +1`, `totalEurCents +cents`) and `TARGET#<to>` (`count +1`). Never two separate UpdateItems — the counters could drift apart.
- Amounts in **cents (integer)**: `totalEurCents` — the conversion to EUR by the §5 formula (`roundMoney(amount × usdRates["EUR"] / usdRates[from])`, for `from = EUR` directly the amount), to cents via `roundMoney` at write time. No floats in the DB.
- **Write failure:** a conversion NEVER fails because of statistics — the result is always returned to the user. The transaction retries ×3 with a short backoff; once exhausted, log an error with the request ID. No further retry layers.

## Reading (/api/stats)

- One `Query pk = STATS` → the GLOBAL values + the maximum of the `TARGET#` items.
- **Tie-break:** on equal counts the alphabetically first currency wins — deterministic, covered by a test.
- `totalAmountEur = totalEurCents / 100`. The response is never cached.

## db:init and tests

- `scripts/create-local-table.ts` must be **idempotent** — `ResourceInUseException` is silently accepted, other errors propagate.
- Integration tests run against **dynamodb-local** (docker-compose, `-sharedDb`); the in-memory variant is suitable for tests. NEVER against real AWS.
- dynamodb-local does not validate IAM — a missing `link` in the SST config is revealed only by `sst dev`, not by the local tests.
