/**
 * The old `language` setting is removed on a REAL SQLite database
 * (node:sqlite, see src/test/real-sqlite.ts); other settings stay.
 *
 * @jest-environment node
 */
import { getSetting, initDb, resetDbForTests } from '@/services/db';
import { removeLegacyLanguageSetting } from '@/services/language';
import { createRealSqlite } from '@/test/real-sqlite';
import type { RealSqlite } from '@/test/real-sqlite';

let mockReal: RealSqlite;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockReal.adapter),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [] }));

beforeEach(() => {
  mockReal = createRealSqlite();
  resetDbForTests();
});

describe('removeLegacyLanguageSetting (real SQLite)', () => {
  it('deletes the language row and leaves the others', async () => {
    await initDb();
    await mockReal.adapter.runAsync("INSERT INTO settings (key, value) VALUES ('language', 'es')");
    await mockReal.adapter.runAsync(
      "INSERT INTO settings (key, value) VALUES ('default_currency', 'USD')",
    );
    await removeLegacyLanguageSetting();
    expect(await getSetting('language')).toBeNull();
    expect(await getSetting('default_currency')).toBe('USD');
  });

  it('is fine when there is no language row', async () => {
    await initDb();
    await expect(removeLegacyLanguageSetting()).resolves.toBeUndefined();
  });
});
