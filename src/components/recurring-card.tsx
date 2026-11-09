import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AmountText, AppIcon, AppText } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatShortDate } from '@/services/format-date';
import { formatSignedMoney } from '@/services/money';
import { dayToDate } from '@/services/recurring';
import type { Day, RecurringPayment } from '@/services/recurring';
import { deck, sizes, spacing } from '@/theme';

// "Due Nov 8", "Due today" or, for an overdue one, "Overdue since Nov 2".
export function dueText(
  t: TFunction,
  language: string,
  occurrence: Day,
  today: Day,
  overdue: boolean,
): string {
  const date = formatShortDate(dayToDate(occurrence), language);
  if (overdue) return t('recurring.card.overdueOn', { date });
  if (occurrence === today) return t('recurring.card.dueToday');
  return t('recurring.card.due', { date });
}

// What a stack card says, as one sentence for screen readers.
export function cardLabel(
  t: TFunction,
  language: string,
  payment: RecurringPayment,
  account: Account | null,
  defaultCurrency: string,
  occurrence: Day,
  today: Day,
  overdue: boolean,
): string {
  const currency = account ? account.currency : defaultCurrency;
  const due = dueText(t, language, occurrence, today, overdue);
  return t('recurring.card.label', {
    name: payment.name,
    amount: formatSignedMoney(payment.amountCents, currency),
    account: account ? account.name : t('recurring.noAccount'),
    due,
  });
}

type Props = {
  payment: RecurringPayment;
  // null: the payment has no account; it shows "Not set" and uses the default
  // currency.
  account: Account | null;
  defaultCurrency: string;
  occurrence: Day;
  overdue: boolean;
  today: Day;
  // True when the deck shows its count badge over the card's top-right corner.
  reserveBadge?: boolean;
};

// The inside of a stack card: name and amount, then the account and the due
// date. Overdue ones carry an icon and the word as well as the alert color.
export function RecurringCardContent({
  payment,
  account,
  defaultCurrency,
  occurrence,
  overdue,
  today,
  reserveBadge,
}: Props) {
  const { t, i18n } = useTranslation();
  const currency = account ? account.currency : defaultCurrency;
  const due = dueText(t, i18n.language, occurrence, today, overdue);

  const accountName = account ? account.name : t('recurring.noAccount');

  return (
    <>
      {/* Top line: "BBVA · Due Nov 1"; an overdue card says so in alert, with
          the icon and the word, after the account. It stops short of the
          count badge when there is one. */}
      <View style={reserveBadge ? styles.beforeBadge : undefined}>
        {overdue ? (
          <View style={styles.due}>
            <AppText
              variant="caption"
              color="textSecondary"
              numberOfLines={1}
              style={styles.shrink}
            >
              {`${accountName} · `}
            </AppText>
            <AppIcon name="alert-circle-outline" size={sizes.iconSmall} color="alert" />
            <AppText variant="caption" color="alert" numberOfLines={1}>
              {due}
            </AppText>
          </View>
        ) : (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {t('recurring.card.secondary', { account: accountName, due })}
          </AppText>
        )}
      </View>
      {/* Main line: the name, and the amount on the right, centered with it. */}
      <View style={styles.row}>
        <View style={styles.name}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {payment.name}
          </AppText>
        </View>
        <AmountText cents={payment.amountCents} currency={currency} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  name: {
    flex: 1,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shrink: {
    flexShrink: 1,
  },
  // The card pads its content by spacing.lg; the badge takes its size plus its
  // inset from the right edge, plus a little breathing room, so the line leaves
  // what is left over.
  beforeBadge: {
    marginRight: Math.max(0, sizes.badge + deck.badgeInset + spacing.xs - spacing.lg),
  },
});
