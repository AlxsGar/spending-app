import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RecurringForm } from '@/components/recurring-form';
import {
  AppButton,
  AppText,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import { formatCentsForInput } from '@/services/money';
import { useAccounts } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useRecurring, useRecurringStore } from '@/stores/recurring-store';
import { showSuccess } from '@/stores/success-store';

export default function EditRecurringScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountsState = useAccounts();
  const recurringState = useRecurring();
  const update = useRecurringStore((state) => state.update);
  const remove = useRecurringStore((state) => state.remove);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const { accounts } = accountsState;
  const payment = recurringState.payments.find((item) => item.id === Number(id));
  const defaultCurrency = useDefaultCurrency();
  // A payment with no account is fine; a linked one needs its account.
  const hasAccount = payment
    ? payment.accountId === null || accounts.some((item) => item.id === payment.accountId)
    : false;

  const confirmDelete = async () => {
    if (!payment) return;
    setConfirming(false);
    setDeleting(true);
    const ok = await remove(payment.id);
    if (ok) {
      router.back();
    } else {
      setDeleting(false);
      setDeleteFailed(true);
    }
  };

  let body;
  if (
    accountsState.status === 'idle' ||
    accountsState.status === 'loading' ||
    recurringState.status === 'idle' ||
    recurringState.status === 'loading' ||
    defaultCurrency === null
  ) {
    body = <LoadingState />;
  } else if (accountsState.status === 'error' || recurringState.status === 'error') {
    body = (
      <Screen>
        <ErrorState
          message={t('common.loadError')}
          retryLabel={t('common.retry')}
          onRetry={() => {
            if (accountsState.status === 'error') void accountsState.reload();
            if (recurringState.status === 'error') void recurringState.reload();
          }}
        />
      </Screen>
    );
  } else if (!payment || !hasAccount) {
    // While a delete is finishing the payment disappears before we go back.
    body = (
      <Screen>
        {deleting ? null : <AppText color="textSecondary">{t('recurring.notFound')}</AppText>}
      </Screen>
    );
  } else {
    body = (
      <Screen>
        <RecurringForm
          accounts={accounts}
          initialAccountId={payment.accountId}
          defaultCurrency={defaultCurrency}
          lastConfirmedAt={payment.lastConfirmedAt}
          initial={{
            name: payment.name,
            amount: formatCentsForInput(
              payment.amountCents,
              payment.accountId === null
                ? defaultCurrency
                : (accounts.find((item) => item.id === payment.accountId)?.currency ?? ''),
            ),
            interval: String(payment.interval),
            unit: payment.unit,
            // Once paid or skipped the field shows the last handled occurrence,
            // the anchor the schedule is counted from.
            startDate: payment.lastConfirmedAt ?? payment.startDate,
            endDate: payment.endDate,
            note: payment.note ?? '',
            active: payment.active,
          }}
          onSubmit={async (input) => {
            const saved = await update(payment.id, input);
            if (!saved) return false;
            // Shown over the screen we go back to, so it never sits on the form.
            showSuccess({
              icon: 'check',
              tone: 'neutral',
              message: t('recurring.updated'),
              detail: saved.name,
            });
            router.back();
            return true;
          }}
        >
          {deleteFailed ? <AppText color="alert">{t('recurring.deleteError')}</AppText> : null}
          <AppButton
            label={t('recurring.delete')}
            variant="destructive"
            disabled={deleting}
            onPress={() => {
              setDeleteFailed(false);
              setConfirming(true);
            }}
          />
        </RecurringForm>
        <ConfirmDialog
          visible={confirming}
          title={t('recurring.deleteTitle')}
          message={t('recurring.deleteMessage')}
          confirmLabel={t('recurring.delete')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(false)}
        />
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('recurring.editTitle') }} />
      {body}
    </>
  );
}
