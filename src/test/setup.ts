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
// Stores ask for a reminder sync after every write; the sync itself is tested
// in reminders.test.ts (through jest.requireActual) and would otherwise read
// the database in every other test.
jest.mock('@/services/reminders', () => ({
  ...jest.requireActual('@/services/reminders'),
  requestReminderSync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-reanimated',() => jest.requireActual('react-native-reanimated/mock'));
