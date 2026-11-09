import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { ReminderChips } from '@/components/reminder-chips';
import { AppButton, AppText, Screen, SegmentedControl, SettingRow } from '@/components/ui';
// Development tool: a test reminder in 15 seconds (see src/dev/test-reminder.ts).
import { scheduleTestReminder } from '@/dev/test-reminder';
import type { Language } from '@/i18n';
import { openNotificationSettings } from '@/services/notifications';
import { useDefaultRemindersStore, useDefaultReminders } from '@/stores/default-reminders';
import { useLanguageStore } from '@/stores/language-store';
import { useNotificationPermission } from '@/stores/notification-permission';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const saveError = useLanguageStore((state) => state.saveError);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const defaultReminders = useDefaultReminders();
  const setDefaultReminders = useDefaultRemindersStore((state) => state.set);
  const remindersSaveError = useDefaultRemindersStore((state) => state.saveError);
  const permission = useNotificationPermission();

  return (
    <Screen>
      <ScrollView>
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
        <SettingRow
          label={t('settings.defaultReminders')}
          errorText={remindersSaveError ? t('settings.remindersSaveError') : undefined}
        >
          <AppText color="textSecondary">{t('settings.defaultRemindersHint')}</AppText>
          <ReminderChips
            value={defaultReminders ?? ''}
            onChange={(next) => void setDefaultReminders(next)}
          />
        </SettingRow>
        {permission === null ? null : (
          <SettingRow label={t('settings.notifications')}>
            <AppText color="textSecondary">{t(`settings.notifications_${permission}`)}</AppText>
            {permission === 'denied' ? (
              <AppButton
                label={t('settings.openSettings')}
                variant="secondary"
                onPress={() => void openNotificationSettings()}
              />
            ) : null}
          </SettingRow>
        )}
        {/* Development tool, rendered only when __DEV__ (see docs/spec.md). */}
        {__DEV__ ? (
          <SettingRow label={t('settings.dev.testReminder')}>
            <AppButton
              label={t('settings.dev.testReminderAction')}
              variant="secondary"
              onPress={() => void scheduleTestReminder()}
            />
          </SettingRow>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
