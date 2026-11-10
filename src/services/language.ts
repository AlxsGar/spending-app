import { getLocales } from 'expo-localization';

import { DEFAULT_LANGUAGE } from '@/i18n';
import type { Language } from '@/i18n';

import { deleteSetting } from './db';

// The setting the app used before it followed the device language (slice 9c).
const LEGACY_LANGUAGE_KEY = 'language';

// Any Spanish variant (es, es-MX, es-US, es-ES...) gives Spanish; anything
// else, or a missing code, gives English.
export function resolveLanguage(deviceCode: string | null | undefined): Language {
  return deviceCode?.toLowerCase() === 'es' ? 'es' : DEFAULT_LANGUAGE;
}

// The device's preferred locale (first in the list). With a per-app language
// chosen in the system settings, the system reports it first.
export function getDeviceLanguage(): Language {
  let code: string | null | undefined;
  try {
    code = getLocales()[0]?.languageCode;
  } catch {
    code = undefined;
  }
  return resolveLanguage(code);
}

let warned = false;

// Removes the old stored `language` row. Best effort: a failure is ignored
// and logged at most once.
export async function removeLegacyLanguageSetting(): Promise<void> {
  try {
    await deleteSetting(LEGACY_LANGUAGE_KEY);
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn('[language] could not remove the old language setting:', error);
    }
  }
}
