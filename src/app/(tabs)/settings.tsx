import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { AppLockSetting } from '@/components/app-lock-setting';
import { BackupSetting } from '@/components/backup-setting';
import { DefaultCurrencySetting } from '@/components/default-currency-setting';
import { GlobalCapSetting } from '@/components/global-cap-setting';
import { ReminderChips } from '@/components/reminder-chips';
import { AppButton, AppText, Screen, SettingRow } from '@/components/ui';
// Development tool: a test reminder in 15 seconds (see src/dev/test-reminder.ts).
import { scheduleTestReminder } from '@/dev/test-reminder';
import { openNotificationSettings } from '@/services/notifications';
import { useDefaultRemindersStore, useDefaultReminders } from '@/stores/default-reminders';
import { useNotificationPermission } from '@/stores/notification-permission';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const defaultReminders = useDefaultReminders();
  const setDefaultReminders = useDefaultRemindersStore((state) => state.set);
  const remindersSaveError = useDefaultRemindersStore((state) => state.saveError);
  const permission = useNotificationPermission();

  return (
    <Screen>
      <ScrollView>
        <DefaultCurrencySetting />
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
        <GlobalCapSetting />
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
        <AppLockSetting />
        <BackupSetting />
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
