import { loadLanguage, resolveLanguage } from '@/services/language';

const mockGetSetting = jest.fn();
const mockGetLocales = jest.fn();

jest.mock('@/services/db', () => ({
  getSetting: (key: string) => mockGetSetting(key),
  setSetting: jest.fn(),
}));

jest.mock('expo-localization', () => ({
  getLocales: () => mockGetLocales(),
}));

describe('resolveLanguage', () => {
  it('uses the device language when it is es', () => {
    expect(resolveLanguage(null, 'es')).toBe('es');
  });

  it('falls back to en for unsupported device languages', () => {
    expect(resolveLanguage(null, 'fr')).toBe('en');
  });

  it('prefers the stored value over the device', () => {
    expect(resolveLanguage('en', 'es')).toBe('en');
    expect(resolveLanguage('es', 'fr')).toBe('es');
  });
});

describe('loadLanguage', () => {
  it('reads the stored value and the device locale', async () => {
    mockGetLocales.mockReturnValue([{ languageCode: 'es' }]);
    mockGetSetting.mockResolvedValue(null);
    expect(await loadLanguage()).toBe('es');

    mockGetSetting.mockResolvedValue('en');
    expect(await loadLanguage()).toBe('en');
  });
});
