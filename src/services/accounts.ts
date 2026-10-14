import { getSetting, initDb } from './db';

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
};

export type AccountInput = {
  name: string;
  icon: string;
  currency: string;
};

export type AccountValidationCode =
  | 'nameRequired'
  | 'nameTooLong'
  | 'invalidIcon'
  | 'invalidCurrency';

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
};

const COLUMNS = 'id, name, icon, currency, in_global_cap, created_at';

export function isAccountIcon(value: string): value is AccountIcon {
  return (ACCOUNT_ICONS as readonly string[]).includes(value);
}

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

// Returns the first problem found, or null when the input is valid.
export function validateAccountInput(input: AccountInput): AccountValidationCode | null {
  const name = input.name.trim();
  if (name.length === 0) return 'nameRequired';
  if (name.length > NAME_MAX_LENGTH) return 'nameTooLong';
  if (!isAccountIcon(input.icon)) return 'invalidIcon';
  if (!isCurrency(input.currency)) return 'invalidCurrency';
  return null;
}

function parse(input: AccountInput): { name: string; icon: AccountIcon; currency: Currency } {
  const code = validateAccountInput(input);
  if (code) throw new AccountValidationError(code);
  return {
    name: input.name.trim(),
    icon: input.icon as AccountIcon,
    currency: input.currency as Currency,
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
  const { name, icon, currency } = parse(input);
  const createdAt = new Date().toISOString();
  const db = await initDb();
  const result = await db.runAsync(
    'INSERT INTO accounts (name, icon, currency, in_global_cap, created_at) VALUES (?, ?, ?, 1, ?)',
    name,
    icon,
    currency,
    createdAt,
  );
  return { id: result.lastInsertRowId, name, icon, currency, inGlobalCap: true, createdAt };
}

export async function updateAccount(id: number, input: AccountInput): Promise<Account> {
  const { name, icon, currency } = parse(input);
  const db = await initDb();
  const result = await db.runAsync(
    'UPDATE accounts SET name = ?, icon = ?, currency = ? WHERE id = ?',
    name,
    icon,
    currency,
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
