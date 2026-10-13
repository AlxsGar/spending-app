---
name: ui-conventions
description: UI and visual conventions for this app. Use when building, changing, or reviewing any screen or component.
---

# UI conventions

The goal is an app that looks designed on purpose: calm, consistent, and
easy to scan. Generic defaults are the failure mode.

## Structure

- All visual values come from `src/theme.ts`: colors, type scale, spacing,
  radii. If a value is missing, add it to the theme. Never inline one.
- Screens use the wrappers in `src/components/ui/` (for example `Screen`,
  `AppText`, `AppButton`, `AppCard`, `AmountText`, `EmptyState`). If a
  wrapper is missing, create it there first, then use it.
- A screen file composes components. It holds no styling numbers.

## Spacing and layout

- Spacing uses the theme scale only: 4, 8, 12, 16, 24, 32.
- Screen horizontal padding is 16. Vertical gap between sections is 24,
  between related items 8 or 12.
- One primary action per screen. Secondary actions are visually quieter.
- Touch targets are at least 48 by 48.

## Typography

- At most three text sizes on one screen.
- Amounts use `AmountText`: tabular numbers, right-aligned in lists.
- Use weight and size for hierarchy before reaching for color.

## Color

- Color carries meaning, not decoration. Expense, income, and warning each
  have one theme color, and nothing else uses them.
- Never show meaning by color alone. Pair it with a sign, icon, or label.
- Both light and dark themes must work. Never hardcode white or black.

## Content

- Every string goes through i18next, with keys in both `en` and `es`.
  Spanish strings run longer; layouts must not break.
- Money is formatted by one helper from integer cents, using the device
  locale.
- Labels are short and specific: "Add expense", not "Submit".

## States

Every screen and list handles all four states: loading, empty, error, and
populated. The empty state says what the screen is for and offers the one
action that fills it.

## Do not

- No gradients, drop shadows beyond Paper elevation, or decorative icons.
- No emoji in the interface.
- No more than one accent color on a screen.
- No modal on top of a modal.
