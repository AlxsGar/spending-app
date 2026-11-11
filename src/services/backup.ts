// Backup export and import (whole database as one JSON file).
//
// Import design: a backup file is never copied straight into the real database.
// It goes through a scratch in-memory database first (prepareImport):
//   1. the scratch DB is migrated up to the file's schemaVersion with the same
//      migration steps the app uses (migrate(db, target) in db.ts),
//   2. the file's rows are inserted there (this applies the table constraints:
//      CHECK, NOT NULL, primary keys),
//   3. the scratch DB is migrated to the current version (so an old backup is
//      upgraded by the existing migrations, with no per-version conversion code),
//   4. a foreign key check runs, and the rows are read back in the current shape.
// Nothing touches the real database until the user confirms; then applyImport
// replaces everything in one queued transaction.
import Constants from 'expo-constants';
import * as SQLite from 'expo-sqlite';

import { isCurrency } from './accounts';
import { CURRENT_SCHEMA_VERSION, initDb, migrate } from './db';
import { REMINDER_OFFSETS } from './reminder-offsets';
import { serialized } from './write-queue';

export const BACKUP_FORMAT = 'spending-app-backup';
export const BACKUP_FORMAT_VERSION = 1;
// A backup of a personal spending tracker is far smaller than this.
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_APP_VERSION_LENGTH = 32;

// What a column holds, beyond its SQLite type:
//  int       any safe integer (cents, interval)
//  id        a row id or a foreign key id, at least 1 (0 would collide with the
//            global-cap index, which maps a NULL account to 0)
//  bool      0 or 1
//  text      any string (CHECK constraints in the scratch database cover enums)
//  iso       a strict ISO UTC timestamp (what toISOString writes)
//  day       a calendar day, YYYY-MM-DD
//  currency  one of the supported currency codes
type Kind = 'int' | 'id' | 'bool' | 'text' | 'iso' | 'day' | 'currency';
type Column = { name: string; kind: Kind; nullable?: boolean; since: number };
type TableSpec = { name: TableName; since: number; columns: Column[]; orderBy: string };

export type TableName =
  | 'settings'
  | 'accounts'
  | 'recurring_payments'
  | 'transactions'
  | 'soft_caps';

const col = (name: string, kind: Kind, since: number, nullable = false): Column => ({
  name,
  kind,
  since,
  nullable,
});

// Parents first: this is the insert order. Deletes run in reverse.
// Stored formats (checked against the services): transactions.date, created_at
// and balance_anchor_at are ISO timestamps; recurring start_date, end_date,
// last_confirmed_at, dismissed_at and transactions.recurring_occurrence are days.
const TABLES: TableSpec[] = [
  {
    name: 'settings',
    since: 1,
    orderBy: 'key',
    columns: [col('key', 'text', 1), col('value', 'text', 1, true)],
  },
  {
    name: 'accounts',
    since: 2,
    orderBy: 'id',
    columns: [
      col('id', 'id', 2),
      col('name', 'text', 2),
      col('icon', 'text', 2),
      col('currency', 'currency', 2),
      col('in_global_cap', 'bool', 2),
      col('created_at', 'iso', 2),
      col('balance_anchor_cents', 'int', 5),
      col('balance_anchor_at', 'iso', 5, true),
    ],
  },
  {
    name: 'recurring_payments',
    since: 6,
    orderBy: 'id',
    columns: [
      col('id', 'id', 6),
      col('account_id', 'id', 6, true),
      col('name', 'text', 6),
      col('amount_cents', 'int', 6),
      col('note', 'text', 6, true),
      col('interval', 'int', 6),
      col('unit', 'text', 6),
      col('start_date', 'day', 6),
      col('end_date', 'day', 6, true),
      col('notify_days_before', 'text', 6),
      col('active', 'bool', 6),
      col('last_confirmed_at', 'day', 6, true),
      col('created_at', 'iso', 6),
      col('dismissed_at', 'day', 7, true),
    ],
  },
  {
    name: 'transactions',
    since: 3,
    orderBy: 'id',
    columns: [
      col('id', 'id', 3),
      col('account_id', 'id', 3),
      col('kind', 'text', 3),
      col('amount_cents', 'int', 3),
      col('date', 'iso', 3),
      col('note', 'text', 3, true),
      col('recurring_id', 'id', 3, true),
      col('created_at', 'iso', 3),
      col('recurring_occurrence', 'day', 7, true),
    ],
  },
  {
    name: 'soft_caps',
    since: 8,
    orderBy: 'id',
    columns: [
      col('id', 'id', 8),
      col('account_id', 'id', 8, true),
      col('period', 'text', 8),
      col('amount_cents', 'int', 8),
    ],
  },
];

// Not part of a backup: since slice 9c the language follows the device.
const EXCLUDED_SETTINGS = ['language'];

export type Row = Record<string, string | number | null>;
export type BackupTables = Record<TableName, Row[]>;

export type BackupErrorCode =
  | 'notJson'
  | 'empty'
  | 'wrongFormat'
  | 'unknownFormatVersion'
  | 'newerSchema'
  | 'tooLarge'
  | 'malformed';

export class BackupError extends Error {
  readonly code: BackupErrorCode;
  constructor(code: BackupErrorCode) {
    super(`Backup refused: ${code}`);
    this.name = 'BackupError';
    this.code = code;
  }
}

// A backup read from a file, rows in the shape of its own schemaVersion.
export type ParsedBackup = {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  tables: Partial<BackupTables>;
};

// A backup ready to be applied: rows in the current schema, already checked.
export type PreparedBackup = {
  appVersion: string;
  exportedAt: string;
  tables: BackupTables;
  counts: { accounts: number; transactions: number; recurringPayments: number };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Strict ISO UTC, and a real moment: 2026-02-30T00:00:00Z is refused.
function isIso(value: string): boolean {
  if (!ISO_PATTERN.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19);
}

// A real calendar day: 2026-02-30 is refused.
function isDay(value: string): boolean {
  if (!DAY_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

// The stored form of the default reminders: empty, or offsets from the app's
// choices separated by commas.
function isReminderValue(value: string): boolean {
  if (value === '') return true;
  return value
    .split(',')
    .every((part) => (REMINDER_OFFSETS as readonly number[]).includes(Number(part.trim())) && part.trim() !== '');
}

function validValue(kind: Kind, value: unknown): boolean {
  switch (kind) {
    case 'int':
      return Number.isSafeInteger(value);
    case 'id':
      return Number.isSafeInteger(value) && (value as number) >= 1;
    case 'bool':
      return value === 0 || value === 1;
    case 'text':
      return typeof value === 'string';
    case 'iso':
      return typeof value === 'string' && isIso(value);
    case 'day':
      return typeof value === 'string' && isDay(value);
    case 'currency':
      return typeof value === 'string' && isCurrency(value);
  }
}

function columnsFor(table: TableSpec, version: number): Column[] {
  return table.columns.filter((column) => column.since <= version);
}

function validRow(raw: unknown, columns: Column[]): raw is Row {
  if (!isObject(raw)) return false;
  return columns.every((column) => {
    if (!(column.name in raw)) return false;
    const value = raw[column.name];
    if (value === null) return column.nullable === true;
    return validValue(column.kind, value);
  });
}

// Settings the app reads with a fixed meaning must hold a value it can use.
function validSetting(row: Row): boolean {
  if (row.key === 'default_currency') return typeof row.value === 'string' && isCurrency(row.value);
  if (row.key === 'default_reminders') return typeof row.value === 'string' && isReminderValue(row.value);
  return true;
}

// Reads and checks the text of a backup file. Throws BackupError. Touches no
// database.
export function parseBackup(text: string): ParsedBackup {
  if (text.trim() === '') throw new BackupError('empty');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('notJson');
  }
  if (!isObject(data) || data.format !== BACKUP_FORMAT) throw new BackupError('wrongFormat');
  if (data.formatVersion !== BACKUP_FORMAT_VERSION) throw new BackupError('unknownFormatVersion');

  const { schemaVersion, appVersion, exportedAt, tables } = data;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new BackupError('malformed');
  }
  if (schemaVersion > CURRENT_SCHEMA_VERSION) throw new BackupError('newerSchema');
  if (
    typeof appVersion !== 'string' ||
    appVersion.length < 1 ||
    appVersion.length > MAX_APP_VERSION_LENGTH ||
    typeof exportedAt !== 'string' ||
    !isIso(exportedAt) ||
    !isObject(tables)
  ) {
    throw new BackupError('malformed');
  }

  const result: Partial<BackupTables> = {};
  for (const table of TABLES) {
    // A table the file's schema did not have yet is not expected; extra tables
    // in the file are ignored.
    if (table.since > schemaVersion) continue;
    const rows = tables[table.name];
    if (!Array.isArray(rows)) throw new BackupError('malformed');
    const columns = columnsFor(table, schemaVersion);
    if (!rows.every((row) => validRow(row, columns))) throw new BackupError('malformed');
    // Keep only the known columns; unknown extra ones are ignored.
    const clean = (rows as Row[]).map((row) => {
      const copy: Row = {};
      for (const column of columns) copy[column.name] = row[column.name];
      return copy;
    });
    if (table.name === 'settings') {
      if (!clean.every(validSetting)) throw new BackupError('malformed');
      result.settings = clean.filter((row) => !EXCLUDED_SETTINGS.includes(row.key as string));
    } else {
      result[table.name] = clean;
    }
  }
  return { schemaVersion, appVersion, exportedAt, tables: result };
}

function insertSql(table: string, columns: Column[]): string {
  const names = columns.map((column) => column.name).join(', ');
  const marks = columns.map(() => '?').join(', ');
  return `INSERT INTO ${table} (${names}) VALUES (${marks})`;
}

async function insertRows(
  db: SQLite.SQLiteDatabase,
  table: TableSpec,
  columns: Column[],
  rows: Row[],
): Promise<void> {
  const sql = insertSql(table.name, columns);
  for (const row of rows) {
    await db.runAsync(sql, ...columns.map((column) => row[column.name]));
  }
}

// Builds the file's data in the current schema in a scratch database (see the
// header). Throws BackupError('malformed') when the data does not fit (also a
// duplicate id or setting key, a CHECK violation, a missing parent row).
export async function prepareImport(text: string): Promise<PreparedBackup> {
  const parsed = parseBackup(text);
  const scratch = await SQLite.openDatabaseAsync(':memory:');
  try {
    // Off while old tables are rebuilt and while rows go in, like db.ts open().
    await scratch.execAsync('PRAGMA foreign_keys = OFF');
    await migrate(scratch, parsed.schemaVersion);
    const tables = {} as BackupTables;
    try {
      await scratch.withTransactionAsync(async () => {
        for (const table of TABLES) {
          const rows = parsed.tables[table.name];
          if (!rows) continue;
          await insertRows(scratch, table, columnsFor(table, parsed.schemaVersion), rows);
        }
      });
      await migrate(scratch);
      const violations = await scratch.getAllAsync('PRAGMA foreign_key_check');
      if (violations.length > 0) throw new Error('foreign key check failed');
    } catch (error) {
      console.error('[backup] file rejected:', error);
      throw new BackupError('malformed');
    }
    for (const table of TABLES) {
      const names = columnsFor(table, CURRENT_SCHEMA_VERSION).map((column) => column.name);
      tables[table.name] = await scratch.getAllAsync<Row>(
        `SELECT ${names.join(', ')} FROM ${table.name} ORDER BY ${table.orderBy}`,
      );
    }
    return {
      appVersion: parsed.appVersion,
      exportedAt: parsed.exportedAt,
      tables,
      counts: {
        accounts: tables.accounts.length,
        transactions: tables.transactions.length,
        recurringPayments: tables.recurring_payments.length,
      },
    };
  } finally {
    await scratch.closeAsync().catch(() => undefined);
  }
}

// Replaces every row of the real database with the prepared backup, in one
// transaction on the write queue. Any failure (including a foreign key
// violation) rolls back and leaves the current data as it was.
//
// Known limitation (see write-queue.ts): the queue only orders the writes that
// use it. A single write outside it (a transaction insert or edit, an account
// rename, a dismiss) could still run on the connection in the middle of this
// transaction; it would be deleted or rolled back with it. The screen keeps the
// user from starting one while the restore runs (the confirmation stays open).
export async function applyImport(backup: PreparedBackup): Promise<void> {
  const db = await initDb();
  await serialized(() =>
    db.withTransactionAsync(async () => {
      // The settings DELETE also removes any legacy `language` row; harmless,
      // since the language follows the device and is deleted at startup anyway.
      for (const table of [...TABLES].reverse()) {
        await db.runAsync(`DELETE FROM ${table.name}`);
      }
      for (const table of TABLES) {
        await insertRows(
          db,
          table,
          columnsFor(table, CURRENT_SCHEMA_VERSION),
          backup.tables[table.name],
        );
      }
      const violations = await db.getAllAsync('PRAGMA foreign_key_check');
      if (violations.length > 0) throw new Error('Foreign key check failed after import');
    }),
  );
}

export function backupFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `spending-backup-${day}.json`;
}

// The file content: every table in the current schema, language left out. The
// reads run in one queued transaction so the snapshot is consistent.
export async function buildBackupJson(now: Date = new Date()): Promise<string> {
  const db = await initDb();
  const tables: Partial<BackupTables> = {};
  await serialized(() =>
    db.withTransactionAsync(async () => {
      for (const table of TABLES) {
        const names = columnsFor(table, CURRENT_SCHEMA_VERSION).map((column) => column.name);
        const where =
          table.name === 'settings'
            ? ` WHERE key NOT IN (${EXCLUDED_SETTINGS.map(() => '?').join(', ')})`
            : '';
        tables[table.name] = await db.getAllAsync<Row>(
          `SELECT ${names.join(', ')} FROM ${table.name}${where} ORDER BY ${table.orderBy}`,
          ...(table.name === 'settings' ? EXCLUDED_SETTINGS : []),
        );
      }
    }),
  );
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      exportedAt: now.toISOString(),
      tables,
    },
    null,
    2,
  );
}
