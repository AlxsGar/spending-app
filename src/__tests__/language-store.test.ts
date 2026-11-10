import i18n from '@/i18n';
import { useLanguageStore } from '@/stores/language-store';

let mockDevice: 'en' | 'es' = 'en';
const mockRemove = jest.fn();

const mockInitDb = jest.fn();
jest.mock('@/services/db', () => ({ initDb: () => mockInitDb() }));
jest.mock('@/services/language', () => ({
  getDeviceLanguage: () => mockDevice,
  removeLegacyLanguageSetting: () => mockRemove(),
}));

describe('language store', () => {
  beforeEach(async () => {
    mockDevice = 'en';
    mockRemove.mockReset().mockResolvedValue(undefined);
    mockInitDb.mockReset().mockResolvedValue(undefined);
    await i18n.changeLanguage('en');
    useLanguageStore.setState({ language: 'en', ready: false, error: false });
  });

  it('init flags an error, in the device language, when the database does not open, and skips the cleanup', async () => {
    mockDevice = 'es';
    mockInitDb.mockRejectedValue(new Error('db'));
    await useLanguageStore.getState().init();
    const state = useLanguageStore.getState();
    expect(state.ready).toBe(true);
    expect(state.error).toBe(true);
    expect(i18n.language).toBe('es');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('init clears a previous error when the database opens on retry', async () => {
    mockInitDb.mockRejectedValueOnce(new Error('db'));
    await useLanguageStore.getState().init();
    expect(useLanguageStore.getState().error).toBe(true);
    await useLanguageStore.getState().init();
    expect(useLanguageStore.getState().error).toBe(false);
    expect(useLanguageStore.getState().ready).toBe(true);
  });

  it('init uses the device language, clears the old setting and becomes ready', async () => {
    mockDevice = 'es';
    await useLanguageStore.getState().init();
    const state = useLanguageStore.getState();
    expect(state.language).toBe('es');
    expect(state.ready).toBe(true);
    expect(i18n.language).toBe('es');
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('init still becomes ready when applying the language fails', async () => {
    mockDevice = 'es';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const change = jest.spyOn(i18n, 'changeLanguage').mockRejectedValueOnce(new Error('i18n'));
    await expect(useLanguageStore.getState().init()).resolves.toBeUndefined();
    expect(useLanguageStore.getState().ready).toBe(true);
    expect(mockRemove).toHaveBeenCalledTimes(1);
    change.mockRestore();
    warn.mockRestore();
  });

  it('syncWithDevice switches i18next and the store when the device language changed', async () => {
    mockDevice = 'es';
    await useLanguageStore.getState().syncWithDevice();
    expect(i18n.language).toBe('es');
    expect(useLanguageStore.getState().language).toBe('es');
  });

  it('syncWithDevice changes nothing when the language is the same', async () => {
    const change = jest.spyOn(i18n, 'changeLanguage');
    const seen: string[] = [];
    const unsubscribe = useLanguageStore.subscribe((state) => seen.push(state.language));
    await useLanguageStore.getState().syncWithDevice();
    unsubscribe();
    expect(change).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    change.mockRestore();
  });
});
