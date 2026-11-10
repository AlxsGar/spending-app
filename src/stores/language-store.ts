import { create } from 'zustand';

import i18n, { DEFAULT_LANGUAGE } from '@/i18n';
import type { Language } from '@/i18n';
import { initDb } from '@/services/db';
import { getDeviceLanguage, removeLegacyLanguageSetting } from '@/services/language';

type LanguageState = {
  language: Language;
  ready: boolean;
  error: boolean;
  init: () => Promise<void>;
  // Re-reads the device language; switches i18next and the store when it
  // changed. Called at launch and whenever the app returns to the foreground.
  syncWithDevice: () => Promise<void>;
};

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: DEFAULT_LANGUAGE,
  ready: false,
  error: false,
  init: async () => {
    set({ ready: false, error: false });
    try {
      await get().syncWithDevice();
    } catch (error) {
      // Keep the current language; the app must still start.
      console.warn('[language] could not apply the device language:', error);
    }
    // The app data must open (and migrate) before anything else can work. The
    // language is already set, so the error screen shows in it.
    try {
      await initDb();
    } catch {
      // initDb already logged it; Retry runs init again.
      set({ ready: true, error: true });
      return;
    }
    // The language is no longer stored; clear the old row (best effort).
    await removeLegacyLanguageSetting();
    set({ ready: true, error: false });
  },
  syncWithDevice: async () => {
    const next = getDeviceLanguage();
    if (next === get().language && i18n.language === next) return;
    await i18n.changeLanguage(next);
    set({ language: next });
  },
}));
