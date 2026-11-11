import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ui';
import { useAppLockStore } from '@/stores/app-lock-store';

type Props = {
  visible: boolean;
  onCancel: () => void;
};

// The confirmation for "Erase all data" when the PIN cannot be used (Forgot PIN
// without biometrics, or a lock that cannot be read). It names the backup file as
// the only way to recover. On success the store leaves the app unlocked with the
// lock off, which unmounts the screen that hosts this dialog.
export function EraseDataDialog({ visible, onCancel }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await useAppLockStore.getState().erase();
    } catch (failure) {
      // The database part failed: nothing was changed.
      console.error('[app-lock] erase failed:', failure);
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      visible={visible}
      busy={busy}
      title={t('lock.eraseTitle')}
      message={failed ? t('lock.eraseError') : t('lock.eraseMessage')}
      confirmLabel={t('lock.eraseConfirm')}
      cancelLabel={t('common.cancel')}
      onConfirm={() => void confirm()}
      onCancel={() => {
        setFailed(false);
        onCancel();
      }}
    />
  );
}
