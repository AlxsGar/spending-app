import { getSetting, initDb } from './db';
import { parseAmountToCents } from './money';
import type { AmountParseError } from './money';

export const ACCOUNT_ICONS = [
  'bank',
  'wallet',
  'safe',
  'cash',
  'credit-card',
  'piggy-bank',
  'home',
  'briefcase',
  'cart',
  'gift',
] as const;

export const CURRENCIES = [
  'MXN',
  'USD',
  'CAD',
  'AUD',
  'BRL',
  'CHF',
  'COP',
  'EUR',
  'GBP',
  'JPY',
] as const;

export type AccountIcon = (typeof ACCOUNT_ICONS)[number];
export type Currency = (typeof CURRENCIES)[number];

export const NAME_MAX_LENGTH = 40;
export const FALLBACK_CURRENCY: Currency = 'MXN';
const DEFAULT_CURRENCY_KEY = 'default_currency';

export type Account = {
  id: number;
  name: string;
  icon: AccountIcon;
  currency: Currency;
  inGlobalCap: boolean;
  createdAt: string;
  // A balance the user set, counted from `balanceAnchorAt` on (ISO, UTC).
  // balanceAnchorAt is null when no balance was ever set.
  balanceAnchorCents: number;
  balanceAnchorAt: string | null;
};

export type AccountInput = {
  name: string;
  icon: string;
  currency: string;
  // What the user typed, with an optional leading "-" (see parseBalance). On
  // create: the optional initial balance (empty, 0 or -0 means none). On
  // update: set only when the user changed the current balance; omitted keeps
  // the existing balance and anchor untouched.
  balance?: string;
};

export type BalanceValidationCode =
  | 'balanceRequired'
  | 'balanceInvalid'
  | 'balanceTooLarge'
  | 'balanceDecimalsNotAllowed'
  | 'balanceTooManyDecimals';

export type AccountValidationCode =
  | 'nameRequired'
  | 'nameTooLong'
  | 'invalidIcon'
  | 'invalidCurrency'
  | BalanceValidationCode;

export class AccountValidationError extends Error {
  code: AccountValidationCode;

  constructor(code: AccountValidationCode) {
    super(code);
    this.name = 'AccountValidationError';
    this.code = code;
  }
}

type AccountRow = {
  id: number;
  name: string;
  icon: string;
  currency: string;
  in_global_cap: number;
  created_at: string;
  balance_anchor_cents: number;
  balance_anchor_at: string | null;
};

const COLUMNS =
  'id, name, icon, currency, in_global_cap, created_at, balance_anchor_cents, balance_anchor_at';

const BALANCE_CODES: Record<AmountParseError, BalanceValidationCode> = {
  empty: 'balanceRequired',
  invalid: 'balanceInvalid',
  // Zero and one leading minus are allowed for a balance, so this cannot
  // happen; it is mapped anyway.
  notPositive: 'balanceInvalid',
  tooLarge: 'balanceTooLarge',
  decimalsNotAllowed: 'balanceDecimalsNotAllowed',
  tooManyDecimals: 'balanceTooManyDecimals',
};

export type BalanceParseResult =
  | { ok: true; cents: number }
  | { ok: false; code: BalanceValidationCode };

// Signed cents for a typed balance. Same rules as a transaction amount (comma
// or point, no decimals for JPY, at most MAX_AMOUNT_CENTS) except that 0 is
// allowed and one leading "-" makes it negative. "-0" is 0.
export function parseBalance(balance: string, currency: string): BalanceParseResult {
  const parsed = parseAmountToCents(balance, currency, { allowZero: true, allowNegative: true });
  if (!parsed.ok) return { ok: false, code: BALANCE_CODES[parsed.code] };
  return { ok: true, cents: parsed.cents };
}

// Returns the problem with a typed balance, or null. On create an empty amount
// is fine (no balance); on update the field is always filled, so empty is an
// error. An undefined balance (update left it unchanged) is always fine.
export function validateBalance(
  balance: string | undefined,
  currency: string,
  mode: 'create' | 'update' = 'create',
): BalanceValidationCode | null {
  if (balance === undefined) return null;
  if (mode === 'create' && balance.trim().length === 0) return null;
  const parsed = parseBalance(balance, currency);
  return parsed.ok ? null : parsed.code;
}

export function isAccountIcon(value: string): value is AccountIcon {
  return (ACCOUNT_ICONS as readonly string[]).includes(value);
}

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

// Returns the first problem found, or null when the input is valid.
export function validateAccountInput(
  input: AccountInput,
  mode: 'create' | 'update' = 'create',
): AccountValidationCode | null {
  const name = input.name.trim();
  if (name.length === 0) return 'nameRequired';
  if (name.length > NAME_MAX_LENGTH) return 'nameTooLong';
  if (!isAccountIcon(input.icon)) return 'invalidIcon';
  if (!isCurrency(input.currency)) return 'invalidCurrency';
  return validateBalance(input.balance, input.currency, mode);
}

function parse(
  input: AccountInput,
  mode: 'create' | 'update',
): {
  name: string;
  icon: AccountIcon;
  currency: Currency;
  // Signed cents, or undefined when there is no balance to write.
  balanceCents: number | undefined;
} {
  const code = validateAccountInput(input, mode);
  if (code) throw new AccountValidationError(code);
  const currency = input.currency as Currency;
  let balanceCents: number | undefined;
  if (input.balance !== undefined && !(mode === 'create' && input.balance.trim().length === 0)) {
    const parsed = parseBalance(input.balance, currency);
    if (parsed.ok) balanceCents = parsed.cents;
  }
  return {
    name: input.name.trim(),
    icon: input.icon as AccountIcon,
    currency,
    balanceCents,
  };
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon as AccountIcon,
    currency: row.currency as Currency,
    inGlobalCap: row.in_global_cap === 1,
    createdAt: row.created_at,
    balanceAnchorCents: row.balance_anchor_cents,
    balanceAnchorAt: row.balance_anchor_at,
  };
}

export async function listAccounts(): Promise<Account[]> {
  const db = await initDb();
  const rows = await db.getAllAsync<AccountRow>(
    `SELECT ${COLUMNS} FROM accounts ORDER BY id`,
  );
  return rows.map(toAccount);
}

export async function getAccount(id: number): Promise<Account | null> {
  const db = await initDb();
  const row = await db.getFirstAsync<AccountRow>(
    `SELECT ${COLUMNS} FROM accounts WHERE id = ?`,
    id,
  );
  return row ? toAccount(row) : null;
}

export async function createAccount(input: AccountInput): Promise<Account> {
  const { name, icon, currency, balanceCents } = parse(input, 'create');
  const createdAt = new Date().toISOString();
  // Empty or 0 means no balance: no anchor. Otherwise it counts from creation.
  const anchorCents = balanceCents ?? 0;
  const anchorAt = anchorCents === 0 ? null : createdAt;
  const db = await initDb();
  const result = await db.runAsync(
    'INSERT INTO accounts (name, icon, currency, in_global_cap, created_at, balance_anchor_cents, balance_anchor_at) VALUES (?, ?, ?, 1, ?, ?, ?)',
    name,
    icon,
    currency,
    createdAt,
    anchorCents,
    anchorAt,
  );
  return {
    id: result.lastInsertRowId,
    name,
    icon,
    currency,
    inGlobalCap: true,
    createdAt,
    balanceAnchorCents: anchorCents,
    balanceAnchorAt: anchorAt,
  };
}

// Without `input.balance` the balance and its anchor are left as they are. With
// it, the balance is set to that value counting from `now` (also when it is 0).
export async function updateAccount(
  id: number,
  input: AccountInput,
  now: Date = new Date(),
): Promise<Account> {
  const { name, icon, currency, balanceCents } = parse(input, 'update');
  const db = await initDb();
  const result =
    balanceCents === undefined
      ? await db.runAsync(
          'UPDATE accounts SET name = ?, icon = ?, currency = ? WHERE id = ?',
          name,
          icon,
          currency,
          id,
        )
      : await db.runAsync(
          'UPDATE accounts SET name = ?, icon = ?, currency = ?, balance_anchor_cents = ?, balance_anchor_at = ? WHERE id = ?',
          name,
          icon,
          currency,
          balanceCents,
          now.toISOString(),
          id,
        );
  if (result.changes === 0) throw new Error(`Account ${id} not found`);
  const updated = await getAccount(id);
  if (!updated) throw new Error(`Account ${id} not found`);
  return updated;
}

export async function removeAccount(id: number): Promise<void> {
  const db = await initDb();
  // One database transaction: a failure removes neither.
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM transactions WHERE account_id = ?', id);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
  });
}

export async function getDefaultCurrency(): Promise<Currency> {
  const stored = await getSetting(DEFAULT_CURRENCY_KEY);
  return stored !== null && isCurrency(stored) ? stored : FALLBACK_CURRENCY;
}
