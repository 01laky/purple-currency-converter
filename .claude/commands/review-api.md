---
description: A critical review of the API code before a commit
---
Do a critical review of the uncommitted changes (git diff + git diff --staged). Focus on:

1. Money and rounding (floating point errors)
2. Validation edge cases (from === to, an unknown currency, extreme/negative amounts)
3. Behavior during an outage or a slow response of the external rate API
4. The cross-rate logic (the free plan has a USD-only base)
5. Whether every logic change has a corresponding test

Be adversarial — actively look for reasons why it does NOT work. Fix nothing, only report a list of findings ordered by severity; for each one state file:line and the concrete failure scenario.
