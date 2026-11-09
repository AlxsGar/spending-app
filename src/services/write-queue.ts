// One in-process queue for every explicit write transaction.
//
// Users of `serialized` (all of them wrap one withTransactionAsync):
// - payOccurrence and removeTransactionUndoing (recurring-actions.ts)
// - removeAccount (accounts.ts)
// - migrate (db.ts) does NOT use it: it runs inside initDb() before the database
//   is handed out, and every service awaits initDb() before it can queue
//   anything, so no queued write can overlap a migration.
//
// Why: expo-sqlite's withTransactionAsync is not exclusive. Other queries on the
// same connection can run inside the transaction, and two overlapping
// transactions on one connection nest (and fail). withExclusiveTransactionAsync
// opens a second connection instead, which would not carry the foreign_keys
// pragma set in db.ts and cannot work on the in-memory database the real-SQLite
// tests use. So transactions are queued one at a time, and decisions inside them
// are conditional UPDATEs (changes === 0 means someone else got there first).
//
// Known limitation: the queue only orders the writes that use it. A single
// statement outside it (a dismiss, a transaction insert or edit, an account
// rename) can still run on the connection in the middle of a queued
// transaction; it then commits or rolls back together with it. Never call
// `serialized` from inside a serialized task: it would wait for itself.

let queue: Promise<unknown> = Promise.resolve();

// Runs `task` after every earlier serialized task has finished, whatever their
// outcome.
export function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
