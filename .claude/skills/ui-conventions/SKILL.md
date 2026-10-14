---
name: ui-conventions
description: UI and visual conventions for this app. Use when building, changing, or reviewing any screen or component.
---

# UI conventions

The goal is an app that looks designed on purpose: calm, consistent, and
easy to scan. Generic defaults are the failure mode.

## Palette

The app is dark-first. These are the only colors in `src/theme.ts`; every
other value is derived from them (opacity, not new hex codes).

| Token | Value | Use |
|---|---|---|
| `background` | `#1A1A1A` | Screen background |
| `surface` | `#262626` | Cards, sheets, inputs |
| `accent` | `#10B981` | Primary actions, income, positive change |
| `accentSecondary` | `#06B6D4` | Links, selected tabs, informational highlights |
| `text` | `#FFFFFF` | Primary text |
| `textSecondary` | `#9CA3AF` | Labels, metadata, placeholders |
| `alert` | `#EF4444` | Expenses, warnings, destructive actions |

Rules:

- Income and positive balances use `accent`. Expenses and overdue items use
  `alert`. Nothing else uses those two colors.
- `accentSecondary` never marks money; it marks navigation and selection.
- Dividers and borders are `text` at 8 to 12 percent opacity, never a new
  gray.
- Disabled states are the normal color at 40 percent opacity.

## Structure

- All visual values come from `src/theme.ts`: colors, type scale, spacing,
  radii. If a value is missing, add it to the theme. Never inline one.
- Screens use the wrappers in `src/components/ui/` (for example `Screen`,
  `AppText`, `AppButton`, `AppCard`, `AmountText`, `EmptyState`). If a
  wrapper is missing, create it there first, then use it.
- A screen file composes components. It holds no styling numbers.
- Use React Native Paper's components whenever one exists for the need,
  always through the wrappers in `src/components/ui/`. Build a custom
  component only when Paper has nothing suitable, and say so in the slice
  report. Custom wrappers are still built from Paper primitives inside;
  only the composition is ours.

## Spacing and layout

- Spacing uses the theme scale only: 4, 8, 12, 16, 24, 32.
- Screen horizontal padding is 16. Vertical gap between sections is 24,
  between related items 8 or 12.
- Cards use `surface` on `background` with radius 12 and no border.
- One primary action per screen. Secondary actions are visually quieter.
- Touch targets are at least 48 by 48.
- The FAB sits bottom-right, above the tab bar, and uses `accent`.

## Typography

- At most three text sizes on one screen.
- Amounts use `AmountText`: tabular numbers, right-aligned in lists, with
  the currency code or symbol from the account, never hardcoded.
- Use weight and size for hierarchy before reaching for color.

## Color

- Color carries meaning, not decoration.
- Never show meaning by color alone. Expenses also carry a minus sign or
  icon; overdue items also carry a label.
- Never hardcode white or black in a component. Use the tokens.

## Content

- Every string goes through i18next, with keys in both `en` and `es`.
  Spanish strings run longer; layouts must not break.
- Money is formatted by one helper from integer cents, using the account's
  currency and the device locale.
- Labels are short and specific: "Add expense", not "Submit".

## States

Every screen and list handles all four states: loading, empty, error, and
populated. The empty state says what the screen is for and offers the one
action that fills it.

## Do not

- No gradients, drop shadows beyond Paper elevation, or decorative icons.
- No emoji in the interface.
- No colors outside the palette.
- No modal on top of a modal.
