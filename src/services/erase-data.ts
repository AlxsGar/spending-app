// Erase all data: the way back from a forgotten PIN when biometrics are off.
//
// Order matters. The database goes first, in one queued transaction: if it
// fails nothing was changed (and the lock stays), so the failure is thrown.
// After it commits, the scheduled reminders are cancelled and the lock entries
// in secure store are deleted, so the app is empty, unlocked and has the lock
// off. Nothing after the commit throws: a failed cancel (the next reminder sync
// replaces our notifications with the empty plan anyway) or a failed secure
// store delete is only logged.
import { clearLockStorage } from './app-lock';
import { initDb } from './db';
import { replaceScheduledReminders } from './notifications';
import { serialized } from './write-queue';

// Children first (foreign keys). The test checks this list against every table
// in the database, so a table added later cannot be forgotten.
export const ERASE_ORDER = [
  'transactions',
  'recurring_payments',
  'soft_caps',
  'accounts',
  'settings',
] as const;

export async function eraseAllData(): Promise<void> {
  const db = await initDb();
  await serialized(() =>
    db.withTransactionAsync(async () => {
      for (const table of ERASE_ORDER) {
        await db.runAsync(`DELETE FROM ${table}`);
      }
    }),
  );
  try {
    await replaceScheduledReminders([]);
  } catch (failure) {
    console.error('[erase] could not cancel the reminders:', failure);
  }
  // The data is gone for good by now, so this must not report a failure ("nothing
  // was changed" would be false). If the secure store cannot be cleared the
  // failure is logged; the caller turns the lock off in memory.
  try {
    await clearLockStorage();
  } catch (failure) {
    console.error('[erase] could not clear the lock entries:', failure);
  }
}
