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

## Success feedback

After a successful create or save that returns the user to another screen,
confirm it with the shared success card.

- Call `showSuccess({ icon, tone, message, detail? })` from
  `src/stores/success-store.ts`, after the save resolves and right before
  `router.back()`. The one `SuccessHost` lives in `src/components/app-gate.tsx`;
  never mount another.
- Content: a Paper icon (`arrow-up` with tone `positive` for income,
  `arrow-down` with `negative` for expense, `check` with tone `neutral` for
  saves that are not money), a short translated message ("Income saved"), and
  an optional second line, `detail`: the signed amount for a transaction, the
  account name for an account save. The tone colors the icon and the second
  line: `positive` is `accent`, `negative` is `alert`, `neutral` is `text`.
  The caller translates and formats; the host stays generic.
- Timing: bounces in with `Animated.spring`, dismisses itself after
  `motion.successDuration`, and a tap on the card or the backdrop dismisses it
  sooner. With reduce motion on, it only fades.
- It announces message and second line to screen readers, and the card is an
  `alert` that a tap dismisses.
- Never on failure: errors stay inline in the form.
- It shows over the screen the user returns to, so it never stacks on another
  modal.

## Card deck

A short list of cards the user works through one at a time (the recurring
payments on Home and Movements) is a deck. Always use the `CardStack` wrapper
in `src/components/ui/`; never re-implement it. Paper has no deck, so it is a
custom component built from Paper `Surface` and `TouchableRipple`.

- Only the top card is readable. Its layout: a small secondary line on top
  (`textSecondary`, for example "BBVA · Due Nov 1"), then the main line (the
  name, one line, ellipsized) with the value on the right (`AmountText`),
  centered with the main line. An overdue card says so in `alert` with the
  alert icon and the word ("Overdue · Nov 1"), never by color alone.
- Up to two layers peek out below the top card: no text, hidden from screen
  readers, not touchable. Their offset, widths and tints are the theme's
  `deck` values (6 px lower per layer, 96% and 92% as wide, filled with the
  `text` color at 12% and 7% over the background, the same derived overlay as
  the dividers; the surface color is too close to the background to show);
  nothing inline. Two cards show one layer, three or more show two, one
  card shows none, and a summary card ("N recurring payments") is a plain
  `AppCard` with no layers.
- A count badge (the `AppBadge` wrapper) sits inside the top card's top-right
  corner, `deck.badgeInset` from the top and the right edge, only with two or
  more cards. It never hangs outside the deck's bounds (a parent such as a
  scroll view would clip it). The card's first line leaves room for it and
  ellipsizes before it; it never covers the amount. No "and N more" text.
- Swipe the top card right to dismiss it, or tap it for the actions. Both need
  an accessible route: the modal buttons and a "dismiss" accessibility action.
  The action runs once per card.
- After a dismissal the next card and the layers move up (`deck.settleDuration`).
  With reduce motion on, nothing animates: it switches at once.

## Action menu

A row with a few secondary actions (the Recurring payments screen) uses the
`ActionMenu` wrapper in `src/components/ui/`; never build another. It is a ⋮
`IconButton` in the row's right slot, after the amount, that opens a centered
Paper dialog (through `ActionDialog`) titled with the item's name, with the date
the actions apply to under it and one row per action. There is no dropdown, so
there is no positioning. Paper `Menu` dropdowns are currently avoided because of
a known iOS positioning issue (see docs/slices.md, 5b2).

- The row tap stays the main action (open or edit). The menu holds the rest.
- Order: the primary actions first, then Edit last ("Pay Nov 1", "Skip Nov 1",
  "Edit"). Labels name what they act on when that is not obvious (the date).
- Hide an action that does not apply instead of disabling it: an inactive or
  finished payment shows Edit only.
- The ⋮ button is at least 48 by 48 and has an accessibility label that names
  the row ("Actions for Rent"). The dialog is unmounted (no fade-out) in the
  same update that runs the chosen action, so two dialogs are never on screen
  together (Skip's confirmation replaces it). Only the first action press in an
  open dialog runs.
- Cancel and the backdrop close it without running anything.
- Each action row has an icon (pay, skip, edit). It identifies the action, so it
  is allowed despite "no decorative icons".
- Screen-reader behaviour of the open dialog is pending a device check; do not
  change it until that is reported.
- A row without actions (account detail) simply leaves the menu out.

## Banner

A warning that stays on screen while it applies (the exceeded spending caps on
Home) uses the `AlertBanner` wrapper in `src/components/ui/`; never use Paper's
`Banner` directly. It is Paper's `Banner` with no actions, so there is no
dismiss button, and the owner renders it only while the condition holds.

- One line of text per item, in `alert` with the alert icon (the 40 px
  `iconLarge`), on the `surface` card background with the shared radius. Never
  color alone: the icon and the words carry the meaning.
- Paper marks the message as an alert for screen readers (live region).
- It sits at the top of the screen's scrolling content, above the first section
  (Home: above the account cards).
- Keep it compact: its size does not depend on how many items apply. Home shows
  the headline cap plus "and N more caps exceeded", never one line per cap.
- Pass `onPress` to make the whole banner one button (accessibility label = the
  lines, hint = what it opens). Home's opens an `ActionDialog` listing every
  exceeded cap with `ListRow`s; a row closes the dialog and navigates. There is
  no chevron, because Paper's Banner has no slot for one. It stays
  not dismissable.
- A calm state of the same fact is a plain `caption` line in `textSecondary`
  with no icon (account detail: "$800 of $1,000 today"); it becomes the banner
  only when the limit is exceeded.

## Do not

- No gradients, drop shadows beyond Paper elevation, or decorative icons.
- No emoji in the interface.
- No colors outside the palette.
- No modal on top of a modal.
