import { useTranslation } from 'react-i18next';

import { Screen, SegmentedControl, SettingRow } from '@/components/ui';
import type { Language } from '@/i18n';
import { useLanguageStore } from '@/stores/language-store';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const saveError = useLanguageStore((state) => state.saveError);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  return (
    <Screen>
      <SettingRow
        label={t('settings.language')}
        errorText={saveError ? t('settings.saveError') : undefined}
      >
        <SegmentedControl<Language>
          value={language}
          onChange={(next) => void setLanguage(next)}
          options={[
            { value: 'en', label: t('settings.english') },
            { value: 'es', label: t('settings.spanish') },
          ]}
        />
      </SettingRow>
    </Screen>
  );
}
