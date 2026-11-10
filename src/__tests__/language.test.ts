import { getDeviceLanguage, removeLegacyLanguageSetting, resolveLanguage } from '@/services/language';

const mockGetLocales = jest.fn();
const mockDeleteSetting = jest.fn();
const mockGetSetting = jest.fn();

jest.mock('@/services/db', () => ({
  getSetting: (key: string) => mockGetSetting(key),
  deleteSetting: (key: string) => mockDeleteSetting(key),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => mockGetLocales(),
}));

describe('resolveLanguage', () => {
  it('es gives es', () => {
    expect(resolveLanguage('es')).toBe('es');
  });

  it.each(['en', 'fr', 'pt', 'de'])('%s gives en', (code) => {
    expect(resolveLanguage(code)).toBe('en');
  });

  it('a missing code gives en', () => {
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage(null)).toBe('en');
  });
});

describe('getDeviceLanguage', () => {
  it('uses the language code of the first preferred locale', () => {
    mockGetLocales.mockReturnValue([
      { languageTag: 'es-MX', languageCode: 'es' },
      { languageTag: 'en-US', languageCode: 'en' },
    ]);
    expect(getDeviceLanguage()).toBe('es');
    mockGetLocales.mockReturnValue([{ languageTag: 'en-US', languageCode: 'en' }]);
    expect(getDeviceLanguage()).toBe('en');
  });

  it.each([
    ['en-US', 'en'],
    ['fr-FR', 'en'],
    ['pt-BR', 'en'],
    ['de', 'en'],
    ['es', 'es'],
    ['es-MX', 'es'],
    ['es-US', 'es'],
    ['es-ES', 'es'],
  ])('%s gives %s', (tag, expected) => {
    mockGetLocales.mockReturnValue([{ languageTag: tag, languageCode: tag.split('-')[0] }]);
    expect(getDeviceLanguage()).toBe(expected);
  });

  it('gives en when reading the locales throws', () => {
    mockGetLocales.mockImplementation(() => {
      throw new Error('native');
    });
    expect(getDeviceLanguage()).toBe('en');
    mockGetLocales.mockReset();
  });

  it('an empty or undefined locale list gives en', () => {
    mockGetLocales.mockReturnValue([]);
    expect(getDeviceLanguage()).toBe('en');
    mockGetLocales.mockReturnValue(undefined);
    expect(getDeviceLanguage()).toBe('en');
  });
});

describe('removeLegacyLanguageSetting', () => {
  beforeEach(() => {
    mockDeleteSetting.mockReset();
    mockGetSetting.mockReset();
  });

  it('deletes the old language row and never reads it', async () => {
    mockDeleteSetting.mockResolvedValue(undefined);
    await removeLegacyLanguageSetting();
    expect(mockDeleteSetting).toHaveBeenCalledWith('language');
    expect(mockGetSetting).not.toHaveBeenCalled();
  });

  it('ignores a failed delete and logs it once', async () => {
    mockDeleteSetting.mockRejectedValue(new Error('disk'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(removeLegacyLanguageSetting()).resolves.toBeUndefined();
    await expect(removeLegacyLanguageSetting()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
