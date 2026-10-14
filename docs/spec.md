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
- `created_at`

No categories in v1.

### Recurring payment

- `id`, `account_id`
- `name`, `amount_cents`, `note`
- `day_of_month` - 1..31; months with fewer days use their last day
- `notify_days_before` - any subset of `{3, 2, 1, 0}` where `0` means the
  morning of the due date. Empty set means no notifications.
- `active` - boolean
- `last_confirmed_period` - the `YYYY-MM` it was last paid

A recurring payment is never deducted automatically. Each month it appears as
*due* and the user confirms it (on or before the due date, "pay now"), which
creates a real `expense` transaction linked by `recurring_id`.

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
- `[Q5]` How the warning is shown (banner on Home, toast when a transaction
  crosses the cap, or both). Default until decided: both.

## Screens

Bottom tabs: **Home / Accounts / Movements / Settings**. Home, Accounts and
Movements have a `+` FAB that opens a menu: *Add transaction*, *Add recurring
payment*, *Add account*. Settings has no FAB.

### Home

- A row of account cards (name, icon, balance, currency). `[Q6]` which
  accounts when there are many; default: horizontal scroll, all accounts.
- An "upcoming" card with a bell icon whenever a recurring payment is due
  within the next 7 days. It lists those payments. It is a card only; it
  never sends a notification.
- Latest 3 transactions across all accounts: the three most recently
  recorded (by `created_at`), not by transaction date. Each row shows the
  transaction's date as secondary text under the amount, so a backdated
  entry is visibly dated. Movements and the account detail order and group
  by transaction date.
- Chart of income and expenses. Default until decided: current month,
  bars per week, income in `accent`, expenses in `alert`. `[Q7]` period
  selector later.

### Accounts

- List of all accounts with balance.
- Tapping one opens the account detail: all its transactions newest first,
  its chart of income and expenses `[Q8]` (same chart as Home, scoped to
  the account), and its recurring payments with next due date.

### Movements

- All transactions from every account, newest first, grouped by day.
- A section for all recurring payments: edit, remove, and *Pay now* (confirm
  early). Due and overdue ones are visually distinct.

### Settings

- Language (en / es), default currency, global soft cap, default reminder
  selection for new recurring payments.
- Backup: export and import. `[Q9]` Default until decided: a JSON file via
  the system share sheet.

## Reminders

Local notifications only (no server). For each active recurring payment the
user chooses which of 3 / 2 / 1 days before and morning-of fire; all, some,
or none. Tapping a notification opens the payment in Movements with *Pay
now* visible.

The 7-day "upcoming" card on Home is separate from notifications and always
appears when something is due within a week.

## Month projection

Shown per account and overall: current balance minus the unconfirmed
recurring payments still due this month. `[Q10]` confirm this rule when the
slice comes up.

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

- `[Q5]` Cap warning presentation (default: banner on Home and toast on the
  transaction that crosses it).
- `[Q6]` Home account row when there are many accounts (default: all,
  horizontal scroll).
- `[Q7]` Chart period selector (default: current month only).
- `[Q8]` Account detail chart scope (default: same as Home, scoped to the
  account).
- `[Q9]` Backup format and destination (default: JSON via share sheet).
- `[Q10]` Month projection rule.
- `[Q11]` App lock in v1.
