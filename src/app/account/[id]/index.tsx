import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  AmountText,
  AppButton,
  AppIcon,
  AppText,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { useAccounts, useAccountsStore } from '@/stores/accounts-store';
import { sizes, spacing } from '@/theme';

export default function AccountDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts, status, reload } = useAccounts();
  const remove = useAccountsStore((state) => state.remove);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const account = accounts.find((item) => item.id === Number(id));

  const confirmDelete = async () => {
    if (!account) return;
    setConfirming(false);
    setDeleting(true);
    const ok = await remove(account.id);
    if (ok) {
      router.back();
    } else {
      setDeleting(false);
      setDeleteFailed(true);
    }
  };

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <LoadingState />;
  } else if (status === 'error') {
    body = (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => void reload()}
        />
      </Screen>
    );
  } else if (!account) {
    // While a delete is finishing the account disappears before we navigate back.
    body = (
      <Screen>
        {deleting ? null : <AppText color="textSecondary">{t('accounts.notFound')}</AppText>}
      </Screen>
    );
  } else {
    body = (
      <Screen>
        <View style={styles.header}>
          <AppIcon name={account.icon} size={sizes.iconLarge} />
          <AppText variant="title">{account.name}</AppText>
          <AppText color="textSecondary">{account.currency}</AppText>
          <AmountText cents={0} currency={account.currency} variant="title" align="left" />
        </View>
        {deleteFailed ? <AppText color="alert">{t('accounts.deleteError')}</AppText> : null}
        <View style={styles.actions}>
          <AppButton
            label={t('accounts.edit')}
            onPress={() =>
              router.push({ pathname: '/account/[id]/edit', params: { id: account.id } })
            }
          />
          <AppButton
            label={t('accounts.delete')}
            variant="destructive"
            onPress={() => {
              setDeleteFailed(false);
              setConfirming(true);
            }}
          />
        </View>
        <ConfirmDialog
          visible={confirming}
          title={t('accounts.deleteTitle')}
          message={t('accounts.deleteMessage')}
          confirmLabel={t('accounts.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('accounts.detailTitle') }} />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  actions: {
    gap: spacing.md,
  },
});
