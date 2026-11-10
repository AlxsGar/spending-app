import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { AppGate } from '@/components/app-gate';
import i18n from '@/i18n';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import { requestReminderSync } from '@/services/reminders';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useLanguageStore } from '@/stores/language-store';
import { renderWithProviders } from '@/test/render';

const mockGetDefaultCurrency = jest.fn();
const mockInitDb = jest.fn();
const mockDeleteSetting = jest.fn();
const mockGetSetting = jest.fn();
let mockLocales: { languageCode: string }[] = [{ languageCode: 'en' }];

// The gate reads the default currency at start; keep that read off the real db.
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  getDefaultCurrency: () => mockGetDefaultCurrency(),
}));

jest.mock('@/services/db', () => ({
  ...jest.requireActual('@/services/db'),
  initDb: () => mockInitDb(),
  deleteSetting: (key: string) => mockDeleteSetting(key),
  getSetting: (key: string) => mockGetSetting(key),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => mockLocales,
}));

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  function MockStack() {
    return <MockText>app ready</MockText>;
  }
  MockStack.Screen = function MockStackScreen() {
    return null;
  };
  return {
    Stack: MockStack,
    useRouter: () => ({ navigate: jest.fn() }),
    useRootNavigationState: () => ({ key: 'root' }),
  };
});

const sync = requestReminderSync as jest.Mock;
// The gate and the NotificationHost both listen; a change reaches every one.
let appStateListeners: ((state: string) => void)[] = [];
const appStateListener = (state: string) => appStateListeners.forEach((listener) => listener(state));

describe('AppGate', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    appStateListeners = [];
    mockLocales = [{ languageCode: 'en' }];
    mockGetDefaultCurrency.mockReset().mockResolvedValue('EUR');
    mockInitDb.mockReset().mockResolvedValue(undefined);
    mockDeleteSetting.mockReset().mockResolvedValue(undefined);
    mockGetSetting.mockReset();
    await i18n.changeLanguage('en');
    useDefaultCurrencyStore.setState({ value: null, saveError: false, loading: false });
    useLanguageStore.setState({ language: 'en', ready: false, error: false });
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: (state: string) => void,
    ) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the default currency once at start', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    await waitFor(() => expect(useDefaultCurrencyStore.getState().value).toBe('EUR'));
    expect(mockGetDefaultCurrency).toHaveBeenCalledTimes(1);
  });

  it('starts in the device language', async () => {
    mockLocales = [{ languageCode: 'es' }];
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    expect(i18n.language).toBe('es');
    expect(useLanguageStore.getState().language).toBe('es');
  });

  it('deletes the old language setting at startup and never reads it', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    expect(mockDeleteSetting).toHaveBeenCalledWith('language');
    expect(mockGetSetting).not.toHaveBeenCalledWith('language');
  });

  it('still starts when deleting the old setting fails', async () => {
    mockDeleteSetting.mockRejectedValue(new Error('disk'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    expect(screen.queryByText(en.common.loadError)).toBeNull();
    expect(useLanguageStore.getState().ready).toBe(true);
    expect(useLanguageStore.getState().error).toBe(false);
    warn.mockRestore();
  });

  it('shows the error screen, in the device language, when the database does not open', async () => {
    mockLocales = [{ languageCode: 'es' }];
    mockInitDb.mockRejectedValue(new Error('db'));
    await renderWithProviders(<AppGate />);
    await screen.findByText(es.common.loadError);
    expect(screen.queryByText('app ready')).toBeNull();
    expect(mockDeleteSetting).not.toHaveBeenCalled();
  });

  it('retry recovers after a failed open', async () => {
    mockInitDb.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce(undefined);
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.common.loadError);
    fireEvent.press(screen.getByText(en.common.retry));
    await screen.findByText('app ready');
    expect(screen.queryByText(en.common.loadError)).toBeNull();
    expect(useLanguageStore.getState().error).toBe(false);
  });

  it('shows the error again when retry fails', async () => {
    mockInitDb.mockRejectedValue(new Error('db'));
    await renderWithProviders(<AppGate />);
    await screen.findByText(en.common.loadError);
    fireEvent.press(screen.getByText(en.common.retry));
    await waitFor(() => expect(mockInitDb).toHaveBeenCalledTimes(2));
    await screen.findByText(en.common.loadError);
    expect(screen.queryByText('app ready')).toBeNull();
  });

  it('on return to the foreground with a changed device language, switches i18next, the store and syncs reminders', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    sync.mockClear();
    mockLocales = [{ languageCode: 'es' }];
    await act(async () => appStateListener('active'));
    expect(i18n.language).toBe('es');
    expect(useLanguageStore.getState().language).toBe('es');
    // The NotificationHost reacts to the store change, and also syncs on
    // every foreground: two requests in all.
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
  });

  it('on return to the foreground with the same language, does not switch', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    sync.mockClear();
    const change = jest.spyOn(i18n, 'changeLanguage');
    await act(async () => appStateListener('active'));
    expect(change).not.toHaveBeenCalled();
    // Only the ordinary foreground sync, no extra one for a language change.
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('a failed language switch on return to the foreground is caught', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    mockLocales = [{ languageCode: 'es' }];
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(i18n, 'changeLanguage').mockRejectedValueOnce(new Error('i18n'));
    await act(async () => appStateListener('active'));
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
    expect(i18n.language).toBe('en');
  });

  it('ignores other app states', async () => {
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    mockLocales = [{ languageCode: 'es' }];
    await act(async () => appStateListener('background'));
    expect(i18n.language).toBe('en');
  });
});
