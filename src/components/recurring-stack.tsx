import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { RecurringCardContent, cardLabel } from '@/components/recurring-card';
import { RecurringPayDialog } from '@/components/recurring-pay-dialog';
import {
  AppButton,
  AppCard,
  AppText,
  CardStack,
  SectionHeader,
} from '@/components/ui';
import type { StackItem } from '@/components/ui';
import { stackCards } from '@/services/recurring';
import type { StackCard } from '@/services/recurring';
import { useAccounts } from '@/stores/accounts-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useRecurring, useRecurringStore } from '@/stores/recurring-store';
import { useToday } from '@/stores/today';
import { spacing } from '@/theme';

// The recurring card stack, shown on Home and at the top of Movements.
// - Cards: overdue first, then due within the next 7 days, soonest first;
//   dismissed occurrences are left out. The badge counts them.
// - Swipe the top card right to dismiss it; tap it for Dismiss and Paid.
// - Nothing due but payments exist: one summary card that opens the list.
// - No recurring payments: nothing at all.
// It loads what it needs itself, so a screen only places it.
export function RecurringStack() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const accountsState = useAccounts();
  const recurring = useRecurring();
  const defaultCurrency = useDefaultCurrency();
  const today = useToday();
  const dismiss = useRecurringStore((state) => state.dismiss);
  const [open, setOpen] = useState<StackCard | null>(null);

  const { accounts } = accountsState;
  const known = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const cards = useMemo(
    () =>
      stackCards(
        recurring.payments.filter((item) => item.accountId === null || known.has(item.accountId)),
        today,
      ),
    [recurring.payments, known, today],
  );

  if (recurring.status === 'error' || accountsState.status === 'error') {
    return (
      <View style={styles.error}>
        <AppText color="alert">{t('recurring.card.loadError')}</AppText>
        <AppButton
          label={t('common.retry')}
          variant="secondary"
          onPress={() => {
            if (recurring.status === 'error') void recurring.reload();
            if (accountsState.status === 'error') void accountsState.reload();
          }}
        />
      </View>
    );
  }
  // Wait for everything, so a card never shows in the wrong currency.
  if (
    recurring.status !== 'ready' ||
    accountsState.status !== 'ready' ||
    defaultCurrency === null
  ) {
    return null;
  }
  if (recurring.payments.length === 0) return null;

  const currencyOf = defaultCurrency;
  const accountOf = (card: StackCard) =>
    card.payment.accountId === null ? null : (known.get(card.payment.accountId) ?? null);

  const items: StackItem[] = cards.map((card) => ({
    key: `${card.payment.id}:${card.occurrence}`,
    content: (
      <RecurringCardContent
        payment={card.payment}
        account={accountOf(card)}
        defaultCurrency={currencyOf}
        occurrence={card.occurrence}
        overdue={card.overdue}
        today={today}
        reserveBadge={cards.length >= 2}
      />
    ),
  }));
  const top = cards[0];

  const summaryText = t('recurring.card.summary', { count: recurring.payments.length });
  const openList = () => router.push('/recurring');

  return (
    <View>
      <View style={styles.header}>
        <SectionHeader title={t('recurring.sectionTitle')} />
        <AppButton label={t('recurring.card.seeAll')} variant="link" onPress={openList} />
      </View>
      {top ? (
        <CardStack
          items={items}
          topLabel={cardLabel(
            t,
            i18n.language,
            top.payment,
            accountOf(top),
            currencyOf,
            top.occurrence,
            today,
            top.overdue,
          )}
          topHint={t('recurring.card.hint')}
          swipeActionLabel={t('recurring.card.dismiss')}
          countLabel={t('recurring.card.badge', { count: cards.length })}
          onPressTop={() => setOpen(top)}
          onSwipeTop={() => dismiss(top.payment.id, top.occurrence)}
        />
      ) : (
        <AppCard
          onPress={openList}
          accessibilityLabel={`${summaryText}, ${t('recurring.card.summaryHint')}`}
        >
          <AppText variant="bodyStrong">{summaryText}</AppText>
          <AppText variant="caption" color="textSecondary">
            {t('recurring.card.summaryHint')}
          </AppText>
        </AppCard>
      )}
      {open ? (
        <RecurringPayDialog
          key={`${open.payment.id}:${open.occurrence}`}
          mode="card"
          payment={open.payment}
          occurrence={open.occurrence}
          overdue={open.overdue}
          today={today}
          accounts={accounts}
          defaultCurrency={currencyOf}
          onDone={() => setOpen(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  error: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
