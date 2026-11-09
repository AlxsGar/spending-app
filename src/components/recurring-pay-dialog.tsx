import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { dueText } from '@/components/recurring-card';
import { ActionDialog, AmountText, AppText, ListRow } from '@/components/ui';
import type { DialogAction } from '@/components/ui';
import { createOnce } from '@/components/ui/once';
import type { Account } from '@/services/accounts';
import type { Day, RecurringPayment } from '@/services/recurring';
import { beginCapWatch, finishCapWatch } from '@/stores/cap-crossing';
import { useRecurringStore } from '@/stores/recurring-store';
import { showSuccess } from '@/stores/success-store';
import { spacing } from '@/theme';

export type PayOutcome = 'paid' | 'dismissed' | 'closed';

type Props = {
  // card: the summary of a stack card with Dismiss and Paid.
  // today: "Has this been paid today?" after creating a payment that starts today.
  mode: 'card' | 'today';
  payment: RecurringPayment;
  // The occurrence Dismiss and Paid act on.
  occurrence: Day;
  overdue: boolean;
  today: Day;
  accounts: Account[];
  // The currency of a payment with no account.
  defaultCurrency: string;
  // Called once, when the dialog is finished: after a payment or a dismissal,
  // or when it was closed without either. The success card for a payment is
  // already shown by then.
  onDone: (outcome: PayOutcome) => void;
};

// One dialog, never two stacked: the summary (or the paid-today question) turns
// into the account list in place when the payment has no account to pay from.
export function RecurringPayDialog({
  mode,
  payment,
  occurrence,
  overdue,
  today,
  accounts,
  defaultCurrency,
  onDone,
}: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pay = useRecurringStore((state) => state.pay);
  const dismiss = useRecurringStore((state) => state.dismiss);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The payment's own account; null when it has none (or it is gone).
  const account =
    payment.accountId === null
      ? null
      : (accounts.find((item) => item.id === payment.accountId) ?? null);
  const currency = account ? account.currency : defaultCurrency;

  // One write at a time for this dialog (pay or dismiss): set synchronously,
  // because the disabled buttons only apply after a re-render.
  const [inFlight] = useState(createOnce);

  const payFrom = async (accountId: number) => {
    if (!inFlight.tryStart()) return;
    setBusy(true);
    setError(null);
    const watch = beginCapWatch();
    const outcome = await pay(payment.id, occurrence, accountId);
    if (outcome === 'failed') {
      inFlight.reset();
      setBusy(false);
      setError(t('recurring.pay.error'));
      return;
    }
    if (outcome === 'already') {
      // The occurrence was paid elsewhere (a stale card): nothing was recorded
      // here, so no "Payment recorded" card. The card disappears with the
      // refreshed payment. (A double tap in this dialog never gets here: the
      // in-flight guard stops the second call, and the first shows its card.)
      onDone('closed');
      return;
    }
    // The dialog closes first, then the card shows over the screen below it.
    onDone('paid');
    finishCapWatch(watch);
    showSuccess({
      icon: 'arrow-down',
      tone: 'negative',
      message: t('recurring.pay.recorded'),
      detail: payment.name,
    });
  };

  // Paid / Yes: straight away when the payment has an account, else ask.
  const startPaying = () => {
    if (busy) return;
    if (account) void payFrom(account.id);
    else setChoosing(true);
  };

  const dismissCard = async () => {
    if (!inFlight.tryStart()) return;
    setBusy(true);
    setError(null);
    const ok = await dismiss(payment.id, occurrence);
    if (!ok) {
      inFlight.reset();
      setBusy(false);
      setError(t('recurring.card.dismissError'));
      return;
    }
    onDone('dismissed');
  };

  let title: string;
  let actions: DialogAction[];
  let body;
  if (choosing) {
    title = t('recurring.pay.accountTitle');
    actions = [{ label: t('common.cancel'), tone: 'muted', onPress: () => onDone('closed') }];
    if (accounts.length === 0) {
      actions.push({
        label: t('transactions.noAccountsAction'),
        onPress: () => {
          onDone('closed');
          router.push('/account/new');
        },
      });
      body = <AppText color="textSecondary">{t('recurring.pay.noAccounts')}</AppText>;
    } else {
      body = (
        <View>
          {accounts.map((item) => (
            <ListRow
              key={item.id}
              icon={item.icon}
              title={item.name}
              description={item.currency}
              onPress={() => void payFrom(item.id)}
            />
          ))}
        </View>
      );
    }
  } else {
    const summary = (
      <View style={styles.summary}>
        {mode === 'today' ? (
          <AppText variant="bodyStrong">{payment.name}</AppText>
        ) : null}
        <AmountText
          cents={payment.amountCents}
          currency={currency}
          variant="title"
          align="left"
        />
        <AppText color="textSecondary">
          {account ? account.name : t('recurring.noAccount')}
        </AppText>
        {mode === 'card' ? (
          <AppText color={overdue ? 'alert' : 'textSecondary'}>
            {dueText(t, i18n.language, occurrence, today, overdue)}
          </AppText>
        ) : null}
      </View>
    );
    body = summary;
    if (mode === 'card') {
      title = payment.name;
      actions = [
        {
          label: t('recurring.card.dismiss'),
          tone: 'muted',
          disabled: busy,
          onPress: () => void dismissCard(),
        },
        { label: t('recurring.card.paid'), disabled: busy, onPress: startPaying },
      ];
    } else {
      title = t('recurring.pay.todayTitle');
      actions = [
        {
          label: t('recurring.pay.todayLater'),
          tone: 'muted',
          disabled: busy,
          onPress: () => onDone('closed'),
        },
        { label: t('recurring.pay.todayYes'), disabled: busy, onPress: startPaying },
      ];
    }
  }

  return (
    <ActionDialog
      visible
      title={title}
      actions={actions}
      onDismiss={() => {
        if (!busy) onDone('closed');
      }}
      scroll={choosing && accounts.length > 0}
    >
      {body}
      {error ? <AppText color="alert">{error}</AppText> : null}
    </ActionDialog>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.xs,
  },
});
