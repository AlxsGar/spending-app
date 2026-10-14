import { create } from 'zustand';

import i18n, { DEFAULT_LANGUAGE } from '@/i18n';
import type { Language } from '@/i18n';
import { loadLanguage, saveLanguage } from '@/services/language';

type LanguageState = {
  language: Language;
  ready: boolean;
  error: boolean;
  saveError: boolean;
  init: () => Promise<void>;
  setLanguage: (language: Language) => Promise<void>;
};

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: DEFAULT_LANGUAGE,
  ready: false,
  error: false,
  saveError: false,
  init: async () => {
    set({ ready: false, error: false });
    try {
      const language = await loadLanguage();
      await i18n.changeLanguage(language);
      set({ language, ready: true, error: false });
    } catch {
      set({ ready: true, error: true });
    }
  },
  setLanguage: async (language) => {
    const previous = get().language;
    try {
      await i18n.changeLanguage(language);
      set({ language, saveError: false });
      await saveLanguage(language);
    } catch {
      // Roll back so the language in memory matches what is stored.
      try {
        await i18n.changeLanguage(previous);
      } catch {
        // Nothing more to do; state below still reflects the stored value.
      }
      set({ language: previous, saveError: true });
    }
  },
}));
