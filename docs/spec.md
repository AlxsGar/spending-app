# Spending App - Product spec (v1)

Status: active. Open questions are marked `[Q]`. The coordinator treats every
`[Q]` as a decision to bring to the user, not something to guess. Decisions
already made are stated as rules.

## Purpose

An offline spending tracker for users in North America (English and Spanish;
no French for now). Users record expenses and income per account, plan
recurring monthly payments, get reminded before they are due, set soft
spending caps that warn but never block, and see simple charts of spending
and income.

v1 is dark theme only.

## Core objects

### Account

- `id`
- `name` - user-defined, required
- `icon` - required, chosen from a fixed icon set (bank, wallet, safe, cash,
  card, piggy bank, home, and similar). There is no account "type"; the
  icon and name carry the meaning.
- `currency` - ISO 4217 code (MXN, USD, CAD, EUR, ...). A label, not a
  conversion. Totals never mix currencies. The currency can always be
  changed on edit; changing it relabels existing amounts and nothing is
  recalculated. From the transactions slice on, changing the currency of an
  account that already has transactions asks for confirmation first.
- `balance_anchor_cents`, `balance_anchor_at` - an optional balance the user
  sets (initial balance when creating the account, or current balance later
  on edit), and the moment it was set. May be negative (for example credit
  cards): the user types a leading minus (for example `-500.00`), with at
  most one minus and only at the start; `-0` is 0. There is no sign toggle.
  Negative balances display in `alert` with the minus sign. The account balance is the anchor amount plus income minus
  expenses of transactions dated after `balance_anchor_at`; with no anchor
  set, every transaction counts. Comparison is by transaction date, so a
  backdated transaction added after the balance was set, dated before it,
  does not count. On a new account, an empty or zero initial balance means
  no anchor. On edit, any change to the current balance (including to 0)
  sets the anchor to that moment; leaving it unchanged keeps the anchor.
  When an anchor exists, the account detail shows "Balance set on <date>".
- `in_global_cap` - boolean. Whether this account's expenses count toward
  the global soft cap.
- `created_at`

### Transaction

- `id`, `account_id`
- `kind` - `expense` | `income`
- `amount_cents` - integer, always positive; `kind` gives the sign
- `date` - the day it happened (defaults to today). Stored as an ISO UTC
  timestamp: the chosen local day combined with the current local time of
  day. Future dates are not allowed; recurring payments cover planned items.
- `note` - optional
- `recurring_id` - set when the transaction was created by confirming a
  recurring payment
- `recurring_occurrence` - calendar day (`YYYY-MM-DD`) of the occurrence the
  transaction paid; set together with `recurring_id`
- `created_at`

No categories in v1.

### Recurring payment

- `id`
- `account_id` - optional. The form's account picker starts with "Not set"
  / "Sin definir", which is the default for a new recurring payment. When
  set, deleting the account deletes the payment. A payment with no account
  uses the default currency (`default_currency` setting, else MXN) for
  amount parsing and display. Movements rows show "Not set" where the
  account name would be. An account's detail lists only payments linked to
  it, and deleting an account counts only its linked payments.
- `name`, `amount_cents`, `note`
- `interval` - integer 1..365, and `unit` - `day` | `week` | `month` |
  `year`. Read as "Every [interval] [unit]" (every 10 days, every 2 weeks,
  every month).
- `start_date` - calendar day (`YYYY-MM-DD`), required, defaults to today.
  On create it must be today or later. On edit an unchanged past start date
  is kept; a changed one must be today or later. The start date is the first
  occurrence and the anchor: weekly repeats on its weekday, monthly on its
  day of month, yearly on its month and day.
- `end_date` - optional calendar day (`YYYY-MM-DD`); empty means indefinite.
  Must be on or after `start_date`. If it falls before the second
  occurrence, the form shows an inline warning that the payment will only
  occur once, but saving is allowed.
- `notify_days_before` - any subset of `{3, 2, 1, 0}` where `0` means the
  morning of the occurrence. Empty set means no notifications. Reminders
  are relative to each occurrence.
- `active` - boolean
- `last_confirmed_at` - calendar day (`YYYY-MM-DD`) of the last occurrence
  that was paid or skipped; empty if never.
- `dismissed_at` - calendar day (`YYYY-MM-DD`) of the occurrence whose card
  was dismissed; empty if none. Hides that occurrence's card on Home and
  Movements only; reminders are unaffected. Dismissing hides only that
  occurrence: the next one appears when it enters the 7-day window like any
  other, even while the dismissed one is still the unpaid current
  occurrence.

Schedule dates are calendar days, not timestamps (exception to the ISO UTC
rule); `created_at` stays ISO UTC.

Occurrence rules:

- Occurrences are counted from `start_date` in steps of `interval` × `unit`.
  Days and weeks count calendar days, so DST changes never shift them.
- Monthly or yearly occurrences on a day the month does not have (31st,
  Feb 29) fall back to that month's last day, without drifting (Jan 31 →
  Feb 28 → Mar 31).
- No occurrence is after `end_date`.
- Current occurrence: the latest occurrence on or before today that is after
  `last_confirmed_at`. It shows as overdue until the next occurrence
  arrives, then it is dropped. Only one occurrence is ever due or overdue;
  earlier missed ones are dropped. The last occurrence before `end_date`
  stays overdue until paid or skipped.
- With no current occurrence, the next due date is the first occurrence on
  or after today (and after `last_confirmed_at`).
- Finished: the last occurrence has passed and been paid or skipped.
- Editing, never paid: changing interval, unit or start date recomputes the
  next due date. Renames and amount edits never move it.
- Editing, once paid or skipped: future occurrences follow the new schedule
  counted from the last paid or skipped occurrence, and the start date field
  shows that date; a changed start date must be after that occurrence and
  today or later, whichever is later, and becomes the new anchor. Paid and
  skipped occurrences are untouched.

Rows show "Every 2 weeks · next Oct 28" or "Every month · next Nov 1", plus
"Ends Dec 31" when an end date is set.

A recurring payment is never deducted automatically. Each occurrence
appears as *due* and the user confirms it ("pay now", allowed early), which
creates a real `expense` transaction linked by `recurring_id` and marks that
occurrence as paid. Pay now asks for the amount (prefilled with the
payment's amount) and the account to pay from; the date is today. If the
payment has no account, choosing one is required. If it has one, that
account is the default and can be changed for that occurrence. The chosen
account goes on the created expense; the payment's own account does not
change. Paying from an account in another currency relabels the amount, as
with any currency change; nothing is converted and no warning is shown;
the amount shows in the paying account's currency. *Skip* marks the
current occurrence as handled without creating a transaction; it asks for
confirmation first and cannot be undone, and shows "Payment skipped" with
the name. Pay now (a full screen) and Skip live on the Recurring payments
screen, in each row's ⋮ menu (Pay now, Skip, Edit); both act on the current
occurrence, or the next one if there is none (early is allowed). Rows: an
overdue one shows "Overdue · date" in `alert` with an icon, a due-today one
shows "Due today" in `accentSecondary`, others are plain; finished ones are
greyed, listed last, and have no Pay now or Skip.

Quick *Paid* (from a card, or "Yes" on the paid-today prompt) uses the
stored amount, today's date and the payment's account; it asks for an
account only when the payment's account is "Not set". It records the
occurrence in `recurring_occurrence` and sets `last_confirmed_at` to it. A
success card follows ("Payment recorded", with the name).

"Has this been paid today?" (*Yes* / *No, later*) appears after creating a
recurring payment whose start date is today. Only on create, never on edit.

Undo: deleting a linked expense whose `recurring_occurrence` equals
`last_confirmed_at` sets `last_confirmed_at` back to the occurrence before
it (empty if it was the first). Otherwise nothing changes.

### Recurring card stack

One component, shown on Home (replacing the "upcoming" card) and at the top
of Movements:

- Cards: overdue occurrences first, marked as overdue, then occurrences due
  in the next 7 days from today, soonest first; dismissed occurrences
  excluded.
- Drawn as a deck seen from the front: only the top card is readable. Its
  secondary line on top reads "account · due date" ("BBVA · Due Nov 1", or
  "Overdue · Nov 1" in the alert color with an icon; "Not set" when there
  is no account), the payment name is the main line, and the amount is on
  the right. Behind it, up to two textless layers peek out below its bottom
  edge (each about 6 px lower, about 96% and 92% of the width, filled with
  the text color at 12% and 7% over the background, the same overlay rule
  as dividers). One card, or the summary card, has no layers. A badge with
  the card count sits inside the top card's top-right corner, only when
  there are two or more cards; the secondary line ellipsizes before it. On
  overdue cards the account name shrinks first so "Overdue · date" always
  shows. Swiping brings the next card up
  to the front and the layers shift up with it.
- Swipe the top card right to dismiss it. Tap it to open a modal with
  *Dismiss* and *Paid*. A dismissal or payment applies in both places.
- "See all" opens the Recurring payments screen (full list; tap a row to
  edit).
- With nothing due, the stack shows one summary card ("N recurring
  payments") that opens the Recurring payments screen. With no recurring
  payments at all, it is hidden.
- Paid cancels that occurrence's reminders (once reminders exist); Dismiss
  does not.

### Soft cap

- `scope` - `global` or an `account_id`
- `period` - daily | weekly | monthly
- `amount_cents`

Rules:

- The global cap and each account cap have their own period.
- An account cap counts only that account's expenses.
- The global cap counts expenses from every account with
  `in_global_cap = true`.
- A cap only warns. It never blocks or changes a transaction.
- Stored in `soft_caps` (`account_id` NULL = the global cap; one cap per
  scope). No cap means no row; clearing the amount removes the cap. An
  account's cap is deleted with the account.
- Periods use the device's local time: daily = the current calendar day,
  weekly = Monday to Sunday, monthly = the calendar month.
- A cap counts expenses dated in its current period; income never offsets
  them. It is exceeded when that total is strictly above the cap.
- Currency: an account cap uses the account's currency. The global cap uses
  the default currency (`default_currency` setting, else MXN) and counts
  only accounts with `in_global_cap = true` in that currency. For an account
  in another currency, the "Counts toward global cap" switch is disabled and
  says why.
- The account's cap (amount and period) and the "Counts toward global cap"
  switch are on the account form, on create and edit (switch defaults on).
  The global cap is in Settings.
- Warnings (decided, was `[Q5]`):
  - Home shows one compact alert banner while any cap is exceeded; it keeps
    the same size however many caps are exceeded. With one, it shows that
    cap ("Global cap: $5,200 of $5,000 this week"). With more, it shows the
    global cap if exceeded, else the cap furthest over by percentage, plus
    "and N more caps exceeded". Tapping it opens a dialog listing every
    exceeded cap (spent, cap, period, amount over); an account cap opens
    that account's detail, the global cap opens Settings. It is not
    dismissable; it goes away when no cap is exceeded.
  - Account detail: when the account has a cap, a single secondary-text line
    under the balance shows progress ("$800 of $1,000 today"), no icon, not
    in alert. While that cap is exceeded, the line is replaced by an alert
    banner ("Cap exceeded: $1,200 of $1,000 today"), not dismissable. The
    global cap is shown only on Home and in Settings.
  - When a saved expense (add, edit, Pay now, quick Paid, and "Paid today"
    when creating a recurring payment) moves a cap's current-period total
    from at or under to strictly over, a snackbar shows after the saved card
    closes. It is a single snackbar however many caps the save crossed: it
    names the cap furthest over (the same headline rule as the Home banner)
    and the amount over, adds "and N more" when several were crossed, and has
    a View action that opens the "Caps exceeded" dialog. A newer save that
    crosses a cap replaces a snackbar still waiting to show; one that
    crosses nothing leaves it. When it is due to show, it is dropped if its
    cap is no longer exceeded. A backdated expense
    in an earlier period, a save while already over, income, deletes, undo,
    and changes to caps or account settings show none.

## Screens

Bottom tabs: **Home / Accounts / Movements / Settings**. Home, Accounts and
Movements have a `+` FAB that opens a menu: *Add transaction*, *Add recurring
payment*, *Add account*. Settings has no FAB.

A form that contains a date picker is a screen, not a dialog (as the
transaction, recurring and Pay now forms are), so the picker never opens on
top of another dialog. Dialogs are for confirmations and short choices.

### Home

- A row of account cards (name, icon, balance, currency). `[Q6]` which
  accounts when there are many; default: horizontal scroll, all accounts.
- The recurring card stack (see "Recurring card stack"), replacing the
  former "upcoming" card. It never sends a notification.
- Latest 3 transactions across all accounts: the three most recently
  recorded (by `created_at`), not by transaction date. Each row shows the
  transaction's date as secondary text under the amount, so a backdated
  entry is visibly dated. Movements and the account detail order and group
  by transaction date.
- Home order: cap banner, chart, account cards, recurring card stack,
  latest 3 transactions.
- Chart of income and expenses, a line chart of the last 7 local days
  (today minus 6 through today). Recorded transactions only (planned
  recurring payments do not count), by local date. One point per day, that
  day's total (not cumulative). Income line in `accent`, expenses line in
  `alert`, with a legend. Range totals above the chart; tapping a day shows
  its totals under it (today is selected at first). With no transactions in
  the range, a short line replaces the chart. Totals never mix currencies:
  when two or more currencies have transactions in the range, chips above
  the chart choose the currency, the default currency first. Drawn with
  react-native-svg. Range selection (slice 7b): a header row inside the
  chart holds a range dropdown (Last 7 days, the default; Last 30 days; This
  month, the 1st to today), which is also the chart's title, and a filter
  button next to it that opens Custom range (a screen pushed like the other
  form screens, with From and To date fields and Apply/Cancel). The pickers
  only allow valid dates: From ≤ To ≤ today and at most one year apart, so
  an invalid date can't be chosen. With a custom range active the dropdown
  shows the dates and the filter button looks selected. Ranges are not
  remembered between visits; Home and account detail choose separately. At
  30 days or more the date labels thin out. Choosing a day: tap or
  drag anywhere on the chart and the nearest day is selected (every range
  length); for screen readers the chart is one adjustable control, swiping
  up or down moves a day and announces its totals.

### Accounts

- List of all accounts with balance.
- Tapping one opens the account detail: all its transactions newest first,
  its chart of income and expenses (same chart as Home, for that account
  only and in its currency, after the action buttons), and its recurring
  payments with next due date.

### Movements

- All transactions from every account, newest first, grouped by day.
- The recurring card stack at the top (see "Recurring card stack"); the
  transactions list below is unchanged.
- The Recurring payments screen (opened from the stack) lists all recurring
  payments: edit, remove, *Pay now* (confirm early) and *Skip*. Due and
  overdue ones are visually distinct.

### Settings

- Language (en / es), default currency, global soft cap, default reminder
  selection for new recurring payments.
- Backup: export and import. `[Q9]` Default until decided: a JSON file via
  the system share sheet.

## Reminders

Local notifications only (no server). For each active recurring payment the
user chooses which of 3 / 2 / 1 days before and morning-of fire; all, some,
or none. Reminders fire at 09:00 local time. Tapping a notification opens
the Recurring payments screen with that payment's actions dialog open.

Overdue payments: an occurrence that is already overdue gets no further
reminders; the payment's next occurrence keeps its reminders. Tapping one of
those next-occurrence reminders opens the dialog for the overdue occurrence,
because that is the one Pay and Skip act on; the dialog shows its date.

The recurring card stack is separate from notifications. Dismissing a card
never changes reminders; paying an occurrence cancels its remaining
reminders.

## Month projection

Projection = current balance minus every unpaid, unskipped occurrence of
active recurring payments due on or before the last day of the current
month (decided, was `[Q10]`). That includes an overdue unpaid occurrence and
dismissed occurrences (dismissing only hides a card); paid and skipped
occurrences, inactive and finished payments, and occurrences after the
payment's end date don't count. Recurring payments with no account count in
the overall projection (in the default currency) but not in any account's.

- Per account: a secondary line under the balance on the Home account card
  and on account detail ("End of month: $1,240"), always shown (equal to
  the balance when nothing is due). On account detail the order is
  balance, projection, cap line.
- Overall: a summary on Home between the chart and the account cards,
  titled "End of month balance projection", with an (i) button that opens a
  text dialog explaining what the figures are and how they're calculated;
  one line per currency that has an account, default currency first,
  always shown. No conversion between currencies. If unassigned payments are due
  and no account uses the default currency, a default-currency line is
  still shown.
- All projection figures are quiet secondary text (no color), signed, so a
  negative projection reads by its minus sign.
- Exception to "always shown": the lines and the summary are hidden until
  recurring payments have loaded, and while that load is in error (a
  projection equal to the balance would mislead).
- Refreshes after any transaction or recurring change and on day and month
  change.

## Development tools

Shown only in development builds (`__DEV__`), never in a release build.

- **Test reminder (dev)** (Settings): schedules one reminder 15 seconds from
  now for the first recurring payment with an occurrence to remind about,
  with the same content, tap behavior and actions dialog as a real one. It
  asks for notification permission if needed. Its identifier starts with
  `dev-test:` rather than `reminder:`, so reminder syncs leave it alone.
  Code: `src/dev/test-reminder.ts`.

## Rules carried over from CLAUDE.md

- Money is stored as integer cents and formatted at the display edge using
  the account's currency and the device locale.
- Dates are ISO strings in UTC; the day boundary for grouping and caps uses
  the device's local time zone.
- Every string exists in `en` and `es` from the first component.

## Out of scope for v1

Light theme, categories, bank sync, cloud sync, multi-device, currency
conversion, paid tier (RevenueCat), ads (AdMob), French, widgets, Apple
Watch, web (v1 targets iOS and Android only). `[Q11]` App lock (PIN or biometrics): decide before release.

## Open questions

- `[Q6]` Home account row when there are many accounts (default: all,
  horizontal scroll).
- `[Q9]` Backup format and destination (default: JSON via share sheet).
- `[Q11]` App lock in v1.
