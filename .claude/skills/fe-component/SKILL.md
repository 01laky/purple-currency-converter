---
name: fe-component
description: Use when creating or modifying a React component in web/ - the file structure, i18n texts, the formatting helpers, states, hooks, RTL tests. Applies to all frontend versions.
---

# A React component — the project conventions

Source of truth: docs/proposal.md §10 (Frontend architecture, Texts/languages/formatting). Rule 23 (strict TS, types/enums/constants) applies to `web/` exactly as to the backend.

## Structure

- A component = its own folder: `ComponentName/ComponentName.tsx` + `ComponentName.module.scss`. The component's test lives in `web/tests/` (the structure mirrors `src/`) — NEVER next to the component (rule 28).
- Feature components into `features/converter/` or `features/stats/`; shared ones into `components/`.
- Local `types.ts`/`enums.ts`/`constants.ts` per module; no `any`, no `as` casts.

## Texts and formatting

- ALL texts through `t('key')` — the keys come from the `/api/init` translations. NEVER a hardcoded string (including aria-labels and error messages). A new key = add it to `api/src/i18n/{en,cs,sk}.json` (all three — parity is tested).
- Numbers and amounts EXCLUSIVELY through the helpers (`formatMoney`, `formatCount`) — the fixed format per Figma (space thousands, comma decimals, the currency code after the amount, 2 dp). The format does NOT change with the language or the browser locale. A component never rounds — the values arrive from the API already rounded.

## Data and state

- The API exclusively through custom hooks (`useConvert`, `useStats`, …) above the client layer — a component NEVER calls the generated axios client directly and never sees a raw `AxiosError`.
- The request state as a discriminated union: `{ status: 'idle' | 'loading' | 'success' | 'error' }` — a switch/if must handle every state, no `isLoading` boolean combinations.
- Shared state (texts, currencies, statistics) through React Context; no Redux/Zustand.
- API errors: display the translation by `error.key` (+ the `params` interpolation); `VALIDATION_ERROR` next to the field, `UNSUPPORTED_CURRENCY` next to the select, `RATE_PROVIDER_ERROR` as a banner.

## Styles

- Exclusively CSS Modules (`*.module.scss`); values (colors, spacing, typography) ONLY through the variables from `styles/_tokens.scss` — no hardcoded hex/px in a component. Breakpoints through the mixins from `styles/_mixins.scss`.

## Tests (RTL + Vitest, jsdom)

- The generated client is mocked — the tests never call the API.
- Test behavior, not implementation: rendering across the states (loading/success/error/empty), interactions via `@testing-library/user-event`, texts through the i18n keys (mocked translations).
- A11y: the component has semantic elements, `aria-live` for dynamic content, visible focus.
