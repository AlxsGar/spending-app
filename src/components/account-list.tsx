import { useTranslation } from 'react-i18next';
import { FlatList } from 'react-native';

import { AmountText, ListRow, useScrollEndStyle } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatSignedMoney } from '@/services/money';

type Props = {
  accounts: Account[];
  // Balance in cents per account id; a missing id means 0.
  balances: Record<number, number>;
  onOpen: (id: number) => void;
};

export function AccountList({ accounts, balances, onOpen }: Props) {
  const { t } = useTranslation();
  const scrollEnd = useScrollEndStyle();
  return (
    <FlatList
      data={accounts}
      contentContainerStyle={scrollEnd}
      keyExtractor={(account) => String(account.id)}
      renderItem={({ item }) => (
        <ListRow
          accessibilityLabel={t('accounts.cardLabel', {
            name: item.name,
            balance: formatSignedMoney(balances[item.id] ?? 0, item.currency),
            currency: item.currency,
          })}
          icon={item.icon}
          title={item.name}
          description={item.currency}
          right={<AmountText cents={balances[item.id] ?? 0} currency={item.currency} colored />}
          onPress={() => onOpen(item.id)}
        />
      )}
    />
  );
}
