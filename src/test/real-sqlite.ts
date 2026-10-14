// A real SQLite database (Node's built-in node:sqlite, in memory) wearing the
// small part of the expo-sqlite async API that src/services/db.ts and the
// services use. Use it where a hand-written mock cannot prove the thing: real
// DDL, real BEGIN/COMMIT/ROLLBACK, real foreign keys, real sqlite_sequence.
//
// CONVENTION FOR FUTURE SLICES: every new upgrade step in src/services/db.ts
// (a new user_version) must add cases to src/__tests__/db-migrations.real.test.ts:
// an upgrade from each older version with real data, a fresh install, and a
// rollback with an injected failure at each risky statement. If you change an
// older step, update the seed schemas below.
//
// Differences from expo-sqlite, on purpose or not:
// - Calls here are synchronous inside; they only LOOK async. expo-sqlite runs on
//   a native thread, and its withTransactionAsync does not stop other queries on
//   the same connection from running inside the transaction. Here nothing can
//   interleave, so this cannot show that kind of race.
// - node:sqlite turns foreign key enforcement ON by default. expo-sqlite starts
//   with SQLite's default (OFF), so it is switched off at open to match.
// - The SQLite library version differs from the one bundled with expo-sqlite.
// - node:sqlite returns null-prototype rows and bigint for large numbers; rows
//   are copied to plain objects and ids/changes are returned as numbers.
// - Parameters are passed as plain values (db.ts always does), not as arrays or
//   named objects.
// - expo-sqlite's native errors have different messages; tests here only match
//   on SQLite's own messages (for example "FOREIGN KEY constraint failed").
import { DatabaseSync } from 'node:sqlite';

type Param = string | number | null;

export class InjectedFailure extends Error {
  constructor(match: string) {
    super(`Injected failure at statement containing "${match}"`);
    this.name = 'InjectedFailure';
  }
}

export type RealSqlite = ReturnType<typeof createRealSqlite>;

export function createRealSqlite() {
  const raw = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  let failMatch: string | null = null;
  // Every statement that reached SQLite or the failure check, in order.
  const statements: string[] = [];

  // Throws for every statement containing `match`, until cleared.
  const failOn = (match: string) => {
    failMatch = match;
  };
  const clearFailure = () => {
    failMatch = null;
  };

  // SQL to run once, right after the first statement containing `match`. Used to
  // create a state a migration cannot reach by itself, such as a real foreign
  // key violation in the middle of an upgrade.
  let afterHook: { match: string; sql: string } | null = null;
  const afterStatement = (match: string, sql: string) => {
    afterHook = { match, sql };
  };

  const track = (sql: string) => {
    statements.push(sql);
    if (failMatch !== null && sql.includes(failMatch)) throw new InjectedFailure(failMatch);
  };
  const done = (sql: string) => {
    if (afterHook !== null && sql.includes(afterHook.match)) {
      const { sql: extra } = afterHook;
      afterHook = null;
      raw.exec(extra);
    }
  };

  const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T;

  const adapter = {
    execAsync: async (sql: string): Promise<void> => {
      track(sql);
      raw.exec(sql);
      done(sql);
    },
    getFirstAsync: async <T>(sql: string, ...params: Param[]): Promise<T | null> => {
      track(sql);
      const row = raw.prepare(sql).get(...params);
      return row === undefined ? null : plain<T>(row);
    },
    getAllAsync: async <T>(sql: string, ...params: Param[]): Promise<T[]> => {
      track(sql);
      return raw.prepare(sql).all(...params).map((row) => plain<T>(row));
    },
    runAsync: async (sql: string, ...params: Param[]) => {
      track(sql);
      const result = raw.prepare(sql).run(...params);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    // Real BEGIN / COMMIT / ROLLBACK. A throw inside the task rolls back.
    withTransactionAsync: async (task: () => Promise<void>): Promise<void> => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };

  // Direct access for assertions and seeding; never goes through failOn.
  const query = <T>(sql: string, ...params: Param[]): T[] =>
    raw.prepare(sql).all(...params).map((row) => plain<T>(row));
  const exec = (sql: string) => raw.exec(sql);

  return {
    adapter,
    query,
    exec,
    failOn,
    clearFailure,
    afterStatement,
    statements,
    close: () => raw.close(),
  };
}

// The schemas as the released app created them, so upgrade tests start from
// what a real device has. Keep these identical to the old steps in db.ts.
const V1 = 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)';
const V2 = `CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  currency TEXT NOT NULL,
  in_global_cap INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
)`;
const V3 = `CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  date TEXT NOT NULL,
  note TEXT,
  recurring_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_transactions_account_date ON transactions (account_id, date)`;

// Creates the schema of an older release (1, 2 or 3) and sets its user_version.
export function seedSchema(db: RealSqlite, version: 1 | 2 | 3): void {
  db.exec(V1);
  if (version >= 2) db.exec(V2);
  if (version >= 3) db.exec(V3);
  db.exec(`PRAGMA user_version = ${version}`);
}
