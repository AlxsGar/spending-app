import i18n from '@/i18n';
import { useLanguageStore } from '@/stores/language-store';

const mockLoad = jest.fn();
const mockSave = jest.fn();

jest.mock('@/services/language', () => ({
  loadLanguage: () => mockLoad(),
  saveLanguage: (language: string) => mockSave(language),
}));

describe('language store', () => {
  beforeEach(async () => {
    mockLoad.mockReset();
    mockSave.mockReset();
    await i18n.changeLanguage('en');
    useLanguageStore.setState({
      language: 'en',
      ready: false,
      error: false,
      saveError: false,
    });
  });

  it('setLanguage changes i18n and saves', async () => {
    mockSave.mockResolvedValue(undefined);
    await useLanguageStore.getState().setLanguage('es');
    expect(i18n.language).toBe('es');
    expect(mockSave).toHaveBeenCalledWith('es');
    expect(useLanguageStore.getState().language).toBe('es');
    expect(useLanguageStore.getState().saveError).toBe(false);
  });

  it('rolls back and flags an error when saving fails', async () => {
    mockSave.mockRejectedValue(new Error('disk'));
    await expect(useLanguageStore.getState().setLanguage('es')).resolves.toBeUndefined();
    expect(i18n.language).toBe('en');
    expect(useLanguageStore.getState().language).toBe('en');
    expect(useLanguageStore.getState().saveError).toBe(true);
  });

  it('init sets ready on success', async () => {
    mockLoad.mockResolvedValue('es');
    await useLanguageStore.getState().init();
    const state = useLanguageStore.getState();
    expect(state.ready).toBe(true);
    expect(state.error).toBe(false);
    expect(state.language).toBe('es');
  });

  it('init sets error on failure', async () => {
    mockLoad.mockRejectedValue(new Error('db'));
    await useLanguageStore.getState().init();
    const state = useLanguageStore.getState();
    expect(state.ready).toBe(true);
    expect(state.error).toBe(true);
  });
});
