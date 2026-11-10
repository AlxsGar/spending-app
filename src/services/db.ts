import * as SQLite from 'expo-sqlite';

const DB_NAME = 'spending.db';
const SCHEMA_VERSION = 8;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current >= SCHEMA_VERSION) return;

  await db.withTransactionAsync(async () => {
    if (current < 1) {
      await db.execAsync(
        'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)',
      );
    }
    if (current < 2) {
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          icon TEXT NOT NULL,
          currency TEXT NOT NULL,
          in_global_cap INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        )`,
      );
    }
    if (current < 3) {
      // recurring_id has no foreign key: the recurring table comes later.
      await db.execAsync(
        `CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          date TEXT NOT NULL,
          note TEXT,
          recurring_id INTEGER,
          created_at TEXT NOT NULL
        )`,
      );
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions (account_id, date)',
      );
    }
    if (current < 4) {
      // Rows left behind by account deletes before they cascaded.
      await db.execAsync(
        'DELETE FROM transactions WHERE account_id NOT IN (SELECT id FROM accounts)',
      );
      // Rebuild with a foreign key (SQLite cannot add one in place), following
      // the documented procedure. Foreign keys are OFF here (see open()).
      await db.execAsync(
        `CREATE TABLE transactions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          date TEXT NOT NULL,
          note TEXT,
          recurring_id INTEGER,
          created_at TEXT NOT NULL
        )`,
      );
      await db.execAsync(
        `INSERT INTO transactions_new (id, account_id, kind, amount_cents, date, note, recurring_id, created_at)
         SELECT id, account_id, kind, amount_cents, date, note, recurring_id, created_at FROM transactions`,
      );
      // AUTOINCREMENT: keep the old counter if it is ahead of the highest copied
      // id (the latest rows were deleted), so ids are never reused.
      await db.execAsync(
        `UPDATE sqlite_sequence
         SET seq = max(seq, (SELECT COALESCE(max(seq), 0) FROM sqlite_sequence WHERE name = 'transactions'))
         WHERE name = 'transactions_new'`,
      );
      await db.execAsync(
        `INSERT INTO sqlite_sequence (name, seq)
         SELECT 'transactions_new', seq FROM sqlite_sequence
         WHERE name = 'transactions'
           AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'transactions_new')`,
      );
      await db.execAsync('DROP TABLE transactions');
      await db.execAsync('ALTER TABLE transactions_new RENAME TO transactions');
      await db.execAsync(
        'CREATE INDEX idx_transactions_account_date ON transactions (account_id, date)',
      );
      // Throwing here rolls the whole upgrade back, user_version included.
      const violations = await db.getAllAsync('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        throw new Error('Foreign key check failed after rebuilding transactions');
      }
    }
    if (current < 5) {
      // Existing accounts get no anchor (NULL), so their balances do not change.
      await db.execAsync(
        'ALTER TABLE accounts ADD COLUMN balance_anchor_cents INTEGER NOT NULL DEFAULT 0',
      );
      await db.execAsync('ALTER TABLE accounts ADD COLUMN balance_anchor_at TEXT');
    }
    if (current < 6) {
      await db.execAsync(
        `CREATE TABLE recurring_payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          note TEXT,
          interval INTEGER NOT NULL CHECK (interval >= 1),
          unit TEXT NOT NULL CHECK (unit IN ('day','week','month','year')),
          start_date TEXT NOT NULL,
          end_date TEXT,
          notify_days_before TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          last_confirmed_at TEXT,
          created_at TEXT NOT NULL,
          CHECK (end_date IS NULL OR end_date >= start_date)
        )`,
      );
      await db.execAsync(
        'CREATE INDEX idx_recurring_payments_account ON recurring_payments (account_id)',
      );
      // A link to a recurring payment that does not exist (there is no such
      // table before this step) would fail the foreign key check below.
      await db.execAsync(
        `UPDATE transactions SET recurring_id = NULL
         WHERE recurring_id IS NOT NULL
           AND recurring_id NOT IN (SELECT id FROM recurring_payments)`,
      );
      // Rebuild transactions so recurring_id has a foreign key, same procedure
      // as in the v4 step.
      await db.execAsync(
        `CREATE TABLE transactions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
          date TEXT NOT NULL,
          note TEXT,
          recurring_id INTEGER REFERENCES recurring_payments(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL
        )`,
      );
      await db.execAsync(
        `INSERT INTO transactions_new (id, account_id, kind, amount_cents, date, note, recurring_id, created_at)
         SELECT id, account_id, kind, amount_cents, date, note, recurring_id, created_at FROM transactions`,
      );
      await db.execAsync(
        `UPDATE sqlite_sequence
         SET seq = max(seq, (SELECT COALESCE(max(seq), 0) FROM sqlite_sequence WHERE name = 'transactions'))
         WHERE name = 'transactions_new'`,
      );
      await db.execAsync(
        `INSERT INTO sqlite_sequence (name, seq)
         SELECT 'transactions_new', seq FROM sqlite_sequence
         WHERE name = 'transactions'
           AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'transactions_new')`,
      );
      await db.execAsync('DROP TABLE transactions');
      await db.execAsync('ALTER TABLE transactions_new RENAME TO transactions');
      await db.execAsync(
        'CREATE INDEX idx_transactions_account_date ON transactions (account_id, date)',
      );
      const violations = await db.getAllAsync('PRAGMA foreign_key_check');
      if (violations.length > 0) {
        throw new Error('Foreign key check failed after rebuilding transactions');
      }
    }
    if (current < 7) {
      // Calendar days (YYYY-MM-DD); NULL on existing rows means none.
      await db.execAsync('ALTER TABLE recurring_payments ADD COLUMN dismissed_at TEXT');
      await db.execAsync('ALTER TABLE transactions ADD COLUMN recurring_occurrence TEXT');
    }
    if (current < 8) {
      // account_id NULL is the global cap. No cap means no row.
      await db.execAsync(
        `CREATE TABLE soft_caps (
          id INTEGER PRIMARY KEY,
          account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
          period TEXT NOT NULL CHECK (period IN ('day','week','month')),
          amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
        )`,
      );
      // One cap per scope. A plain UNIQUE (account_id) would allow any number
      // of global rows, because SQLite treats NULLs as distinct. Mapping NULL to
      // 0 makes the global scope one value; real account ids start at 1.
      await db.execAsync(
        'CREATE UNIQUE INDEX idx_soft_caps_scope ON soft_caps (COALESCE(account_id, 0))',
      );
    }
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  // PRAGMA foreign_keys does nothing inside a transaction, so it is set here,
  // outside migrate()'s transaction: OFF while tables are rebuilt, ON after,
  // on every open.
  await db.execAsync('PRAGMA foreign_keys = OFF');
  await migrate(db);
  await db.execAsync('PRAGMA foreign_keys = ON');
  const enabled = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  if (enabled?.foreign_keys !== 1) throw new Error('Could not enable foreign keys');
  return db;
}

export function initDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((error) => {
      // Diagnostic: opening or migrating the database failed (the app only
      // shows a generic message). Logged, then rethrown as before.
      console.error('[db] open/migrate failed:', error);
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await initDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await initDb();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const db = await initDb();
  await db.runAsync('DELETE FROM settings WHERE key = ?', key);
}

export function resetDbForTests(): void {
  dbPromise = null;
}
