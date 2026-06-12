---
name: figma-to-scss
description: Use when styling the frontend per the Figma design - extracting the design tokens into _tokens.scss, breakpoints, grid templates for the web/mobile layout. Applies to the frontend versions (0.9.0+).
---

# Figma → SCSS tokens and layout

Source of truth: docs/proposal.md §10 (Design per Figma, Layout). **The exact Figma values are supplied by the HUMAN at the start of the implementation** (from Figma Inspect — hex colors, fonts, sizes, spacing, radius, frame dimensions). If you do not have the values → request them, NEVER estimate them from memory or "by eye".

## Procedure

1. **Request the tokens from Figma Inspect from the human:** colors (the card, the button, the background, text, the inputs, borders), typography (the font family, the sizes/weights of the heading, the labels, the values, the button), spacing (the card paddings, the field gaps), border-radius, the widths of the Web and Mobile frames.
2. **Write them into `styles/_tokens.scss`** as SCSS variables named by meaning (`$color-card-bg`, `$font-size-result`, `$space-card-padding`…) — NOT by value (`$purple-dark`).
3. **Derive the breakpoint from the frame dimensions** (the Web vs Mobile width) → `styles/_mixins.scss` as a mixin (`@mixin mobile { @media ... }`).
4. **Layout through CSS Grid:** web = the three form fields in one row, mobile = stacked. It switches by `grid-template-*` inside the mixin, NOT by scaling or flex hacks.
5. Components draw EXCLUSIVELY from the tokens — during review look for hardcoded hex/px values and replace them with a variable.

## The binding design elements (from proposal §10)

- Top to bottom: the heading "Purple currency converter" → the purple form card (Amount / From / To) → the "Convert currency" button → the Result card (Result + the value + Number of calculations made + the added statistics in the same style).
- The number format: `4 942,52 CZK` — fixed, it does not change with the language (the helpers, not a CSS matter, but verify it during the visual check).
- The design does NOT have: a header/footer, skeletons, the rate next to the result — do not add them; derive the conscious additions (the language changer, the boot spinner, the error states) from the design system (colors/typography from the tokens).
- No layout shift: reserve the space for the result and the statistics already in the grid template.

## The definition of done of the styling

- A visual comparison with Figma at both breakpoints (web + mobile).
- A `grep` for hardcoded hex/px in `*.module.scss` outside `_tokens.scss` — it must come back clean.
