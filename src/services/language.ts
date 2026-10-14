import { getLocales } from 'expo-localization';

import { DEFAULT_LANGUAGE, LANGUAGES } from '@/i18n';
import type { Language } from '@/i18n';

import { getSetting, setSetting } from './db';

const LANGUAGE_KEY = 'language';

export function isLanguage(value: string | null | undefined): value is Language {
  return LANGUAGES.includes(value as Language);
}

export function resolveLanguage(
  stored: string | null | undefined,
  deviceCode: string | null | undefined,
): Language {
  if (isLanguage(stored)) return stored;
  if (isLanguage(deviceCode)) return deviceCode;
  return DEFAULT_LANGUAGE;
}

export async function loadLanguage(): Promise<Language> {
  const stored = await getSetting(LANGUAGE_KEY);
  const deviceCode = getLocales()[0]?.languageCode;
  return resolveLanguage(stored, deviceCode);
}

export async function saveLanguage(language: Language): Promise<void> {
  await setSetting(LANGUAGE_KEY, language);
}
