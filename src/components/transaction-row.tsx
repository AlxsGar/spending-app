import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AmountText, AppText, ListRow } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { relativeDay } from '@/services/day-groups';
import { formatShortDate } from '@/services/format-date';
import { formatSignedMoney } from '@/services/money';
import type { Transaction } from '@/services/transactions';

type Props = {
  transaction: Transaction;
  account: Account;
  // Show the transaction's date under the amount (Home, where rows are
  // ordered by when they were recorded, not by date).
  showDate?: boolean;
  onPress?: () => void;
};

// Account name, then the note (or the kind when there is no note), then the
// amount: "+" and accent for income, a minus sign and alert for expenses.
export function TransactionRow({ transaction, account, showDate = false, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const kind = t(`transactions.${transaction.kind}`);
  const signed = transaction.kind === 'income' ? transaction.amountCents : -transaction.amountCents;
  const detail = transaction.note ?? kind;

  let dateText: string | null = null;
  if (showDate) {
    const day = new Date(transaction.date);
    const relative = relativeDay(day, new Date());
    dateText = relative ? t(`transactions.${relative}`) : formatShortDate(day, i18n.language);
  }

  const amount = formatSignedMoney(signed, account.currency, { showPlus: true });

  return (
    <ListRow
      onPress={onPress}
      accessibilityLabel={t('transactions.rowLabel', {
        kind,
        account: account.name,
        detail,
        amount: dateText ? `${amount}, ${dateText}` : amount,
      })}
      icon={account.icon}
      title={account.name}
      description={detail}
      right={
        <View style={styles.right}>
          <AmountText cents={signed} currency={account.currency} colored showPlus />
          {dateText ? (
            <AppText variant="caption" color="textSecondary" align="right">
              {dateText}
            </AppText>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  right: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
