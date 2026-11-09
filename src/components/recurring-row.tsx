import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { dueText } from '@/components/recurring-card';
import { ActionMenu, AmountText, AppIcon, AppText, ListRow } from '@/components/ui';
import type { MenuAction } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatShortDate } from '@/services/format-date';
import { formatSignedMoney } from '@/services/money';
import { actionOccurrence, dayToDate, scheduleState } from '@/services/recurring';
import type { Day, RecurringPayment } from '@/services/recurring';
import { sizes, spacing } from '@/theme';

export type RowActions = {
  onPay: () => void;
  onSkip: () => void;
  onEdit: () => void;
};

type Props = {
  payment: RecurringPayment;
  // The local calendar day, from useToday, so the row follows midnight.
  today: Day;
  // null: the payment has no account; it shows "Not set" and uses the default
  // currency.
  account: Account | null;
  defaultCurrency: string;
  onPress?: () => void;
  // The ⋮ menu (Pay now, Skip, Edit). Left out, the row has no menu (account
  // detail): it only opens the edit form when tapped.
  actions?: RowActions;
};

const EVERY_KEYS = {
  day: 'recurring.everyDay',
  week: 'recurring.everyWeek',
  month: 'recurring.everyMonth',
  year: 'recurring.everyYear',
} as const;

// Account name; then "Every 2 weeks · next Oct 28" (or Inactive / Finished in
// place of the next date); then "Ends Dec 31" when there is an end date. The
// amount sits on the right, in the account's currency. States:
// - overdue: "Overdue · Oct 28" in alert, with the alert icon;
// - due today: "Due today" in accentSecondary;
// - finished: the whole row greyed;
// - anything else: plain.
export function RecurringRow({
  payment,
  today,
  account,
  defaultCurrency,
  onPress,
  actions,
}: Props) {
  const { t, i18n } = useTranslation();
  const currency = account ? account.currency : defaultCurrency;
  const accountName = account ? account.name : t('recurring.noAccount');
  const date = (day: string) => formatShortDate(dayToDate(day), i18n.language);

  const every = t(EVERY_KEYS[payment.unit], { count: payment.interval });
  let status: string;
  let tone: 'plain' | 'overdue' | 'today' = 'plain';
  let finished = false;
  if (!payment.active) {
    status = t('recurring.inactive');
  } else {
    const state = scheduleState(payment, today);
    if (state.kind === 'finished') {
      status = t('recurring.finished');
      finished = true;
    } else if (state.kind === 'current' && state.date < today) {
      status = t('recurring.card.overdueOn', { date: date(state.date) });
      tone = 'overdue';
    } else if (state.kind === 'current') {
      status = t('recurring.card.dueToday');
      tone = 'today';
    } else {
      status = t('recurring.next', { date: date(state.date) });
    }
  }
  const endsText = payment.endDate ? t('recurring.ends', { date: date(payment.endDate) }) : null;

  const target = actionOccurrence(payment, today);
  const menu: MenuAction[] = [];
  if (actions) {
    if (target !== null) {
      menu.push(
        {
          label: t('recurring.menu.pay', { date: date(target) }),
          icon: 'cash-check',
          onPress: actions.onPay,
        },
        {
          label: t('recurring.menu.skip', { date: date(target) }),
          icon: 'skip-next',
          onPress: actions.onSkip,
        },
      );
    }
    menu.push({ label: t('recurring.menu.edit'), icon: 'pencil', onPress: actions.onEdit });
  }

  const description = (
    <View>
      <AppText variant="caption" color="textSecondary">
        {accountName}
      </AppText>
      {tone === 'plain' ? (
        <AppText variant="caption" color="textSecondary">{`${every} · ${status}`}</AppText>
      ) : (
        <View style={styles.status}>
          <AppText variant="caption" color="textSecondary">{`${every} · `}</AppText>
          {tone === 'overdue' ? (
            <AppIcon name="alert-circle-outline" size={sizes.iconSmall} color="alert" />
          ) : null}
          <AppText variant="caption" color={tone === 'overdue' ? 'alert' : 'accentSecondary'}>
            {status}
          </AppText>
        </View>
      )}
      {endsText ? (
        <AppText variant="caption" color="textSecondary">
          {endsText}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <ListRow
      onPress={onPress}
      muted={finished}
      accessibilityLabel={t('recurring.rowLabel', {
        name: payment.name,
        account: accountName,
        amount: formatSignedMoney(payment.amountCents, currency),
        schedule: [`${every} · ${status}`, endsText].filter(Boolean).join(', '),
      })}
      icon="calendar-sync"
      title={payment.name}
      descriptionContent={description}
      right={
        <View style={styles.right}>
          <AmountText cents={payment.amountCents} currency={currency} muted={finished} />
          {actions ? (
            <ActionMenu
              actions={menu}
              accessibilityLabel={t('recurring.menu.label', { name: payment.name })}
              title={payment.name}
              subtitle={
                target === null
                  ? undefined
                  : dueText(t, i18n.language, target, today, target < today)
              }
              cancelLabel={t('common.cancel')}
            />
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
