import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EraseDataDialog } from '@/components/erase-data-dialog';
import { AppButton, ErrorState, Screen } from '@/components/ui';
import { useAppLockStore } from '@/stores/app-lock-store';
import { spacing } from '@/theme';

// Shown when the lock settings cannot be read from secure store. Retry is always
// there. After one failed Retry (the second failed load) "Erase all data" is
// offered too, so a broken or lost keychain cannot lock the user out for good.
export function LockLoadError() {
  const { t } = useTranslation();
  const failures = useAppLockStore((state) => state.loadFailures);
  const [eraseOpen, setEraseOpen] = useState(false);

  return (
    <Screen headerless>
      <ErrorState
        message={t('common.loadError')}
        retryLabel={t('common.retry')}
        onRetry={() => void useAppLockStore.getState().load()}
      />
      {failures >= 2 ? (
        <View style={styles.erase}>
          <AppButton
            label={t('lock.eraseConfirm')}
            variant="destructive"
            onPress={() => setEraseOpen(true)}
          />
        </View>
      ) : null}
      <EraseDataDialog visible={eraseOpen} onCancel={() => setEraseOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  erase: {
    paddingBottom: spacing.lg,
  },
});
