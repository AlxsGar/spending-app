// Runs before every test file (see "jest.setupFiles" in package.json).
// Reanimated, Worklets and Gesture Handler need native modules; their own test
// mocks stand in for them. Worklets is mocked first because Reanimated's mock
// loads it.
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
// expo-notifications needs native modules (and warns on import under Expo Go
// checks). Only the services/notifications.ts boundary uses it; tests assert on
// these mocks or replace that module.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true }),
  requestPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true, status: 'granted', canAskAgain: true }),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
}));
// Backup files: the native modules are only used through
// services/backup-files.ts, which tests replace or drive through these mocks.
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: jest.fn().mockImplementation((...parts: unknown[]) => ({
    uri: parts.map(String).join('/'),
    create: jest.fn(),
    write: jest.fn(),
    delete: jest.fn(),
    text: jest.fn().mockResolvedValue(''),
  })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true, assets: null }),
}));
// App lock: the three native modules are only used through services/app-lock.ts.
// Secure store is an in-memory map (read it with the mock's __items; clear it
// with __reset), crypto uses Node's, and local authentication starts with a
// device that has enrolled biometrics and accepts the prompt.
jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();
  return {
    __items: items,
    __reset: () => items.clear(),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});
jest.mock('expo-crypto', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: jest.fn(async (_algorithm: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data).digest('hex'),
    ),
    getRandomBytesAsync: jest.fn(async (count: number) => new Uint8Array(nodeCrypto.randomBytes(count))),
  };
});
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));
// Stores ask for a reminder sync after every write; the sync itself is tested
// in reminders.test.ts (through jest.requireActual) and would otherwise read
// the database in every other test.
jest.mock('@/services/reminders', () => ({
  ...jest.requireActual('@/services/reminders'),
  requestReminderSync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-reanimated',() => jest.requireActual('react-native-reanimated/mock'));
