import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppButton, AppText, ConfirmDialog, SettingRow } from '@/components/ui';
import { applyImport, BackupError, backupFileName, buildBackupJson, prepareImport } from '@/services/backup';
import type { PreparedBackup } from '@/services/backup';
import { pickBackupText, shareBackupFile } from '@/services/backup-files';
import { formatShortDate } from '@/services/format-date';
import { requestReminderSync } from '@/services/reminders';
import { reloadAllStores } from '@/stores/reload-all';
import { showSuccess } from '@/stores/success-store';

// Settings section for backups: export the whole database through the share
// sheet, or import a file that replaces everything after a confirmation.
export function BackupSetting() {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  // A second tap in the same frame, before the disabled state renders.
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PreparedBackup | null>(null);

  const run = async (task: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const exportBackup = () =>
    run(async () => {
      try {
        const now = new Date();
        await shareBackupFile(backupFileName(now), await buildBackupJson(now));
      } catch (failure) {
        console.error('[backup] export failed:', failure);
        setError(t('settings.backup.exportError'));
      }
    });

  const importBackup = () =>
    run(async () => {
      try {
        const text = await pickBackupText();
        if (text === null) return;
        setPending(await prepareImport(text));
      } catch (failure) {
        if (failure instanceof BackupError) {
          setError(t(`settings.backup.error_${failure.code}`));
        } else {
          console.error('[backup] read failed:', failure);
          setError(t('settings.backup.readError'));
        }
      }
    });

  const confirmImport = () => {
    const backup = pending;
    if (!backup) return;
    // The dialog stays open (as "Restoring...", not dismissable) until this ends.
    void run(async () => {
      try {
        await applyImport(backup);
      } catch (failure) {
        console.error('[backup] import failed:', failure);
        setPending(null);
        setError(t('settings.backup.importError'));
        return;
      }
      // Committed. Close the dialog first so the success card never sits over it.
      setPending(null);
      let reloaded = true;
      try {
        await reloadAllStores();
      } catch (failure) {
        console.error('[backup] reload after import failed:', failure);
        reloaded = false;
      }
      // Reminders follow the restored payments whatever the reload did.
      void requestReminderSync();
      if (reloaded) {
        showSuccess({ icon: 'check', tone: 'neutral', message: t('settings.backup.restored') });
      } else {
        setError(t('settings.backup.reloadError'));
      }
    });
  };

  return (
    <>
      <SettingRow label={t('settings.backup.title')} errorText={error ?? undefined}>
        <AppText color="textSecondary">{t('settings.backup.note')}</AppText>
        <AppButton
          label={t('settings.backup.export')}
          variant="secondary"
          disabled={busy}
          onPress={() => void exportBackup()}
        />
        <AppButton
          label={t('settings.backup.import')}
          variant="secondary"
          disabled={busy}
          onPress={() => void importBackup()}
        />
      </SettingRow>
      <ConfirmDialog
        visible={pending !== null}
        busy={busy}
        title={busy ? t('settings.backup.restoring') : t('settings.backup.confirmTitle')}
        message={
          pending && busy
            ? t('settings.backup.restoringMessage')
            : pending
            ? t('settings.backup.confirmMessage', {
                accounts: pending.counts.accounts,
                transactions: pending.counts.transactions,
                recurring: pending.counts.recurringPayments,
                date: formatShortDate(new Date(pending.exportedAt), i18n.language),
                version: pending.appVersion,
              })
            : ''
        }
        confirmLabel={t('settings.backup.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmImport}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
