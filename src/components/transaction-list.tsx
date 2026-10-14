import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionList, StyleSheet } from 'react-native';

import { TransactionRow } from '@/components/transaction-row';
import { SectionHeader } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { groupByLocalDay, localDayKey, relativeDay } from '@/services/day-groups';
import { formatLongDate } from '@/services/format-date';
import type { Transaction } from '@/services/transactions';

type Props = {
  // Newest first.
  transactions: Transaction[];
  accounts: Account[];
  header?: ReactNode;
  // Shown when there is nothing to list.
  empty?: ReactNode;
};

// Transactions grouped by the device's local day. Rows whose account was
// deleted are skipped: they have no currency to show.
export function TransactionList({ transactions, accounts, header, empty }: Props) {
  const { t, i18n } = useTranslation();
  // Changes at midnight, so "Today" labels follow the clock.
  const todayKey = localDayKey(new Date());
  const known = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const sections = useMemo(
    () => {
      const now = new Date();
      return groupByLocalDay(transactions.filter((item) => known.has(item.accountId))).map(
        (group) => {
          const relative = relativeDay(group.day, now);
          return {
            key: group.key,
            title: relative
              ? t(`transactions.${relative}`)
              : formatLongDate(group.day, i18n.language),
            data: group.items,
          };
        },
      );
    },
    // todayKey is a dependency on purpose: it re-labels the groups at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, known, t, i18n.language, todayKey],
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={sections.length === 0 ? styles.grow : undefined}
      ListHeaderComponent={<>{header}</>}
      ListEmptyComponent={<>{empty}</>}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      renderItem={({ item }) => {
        const account = known.get(item.accountId);
        return account ? <TransactionRow transaction={item} account={account} /> : null;
      }}
    />
  );
}

const styles = StyleSheet.create({
  grow: {
    flexGrow: 1,
  },
});
