import { useTranslation } from 'react-i18next';
import { FlatList } from 'react-native';

import { AmountText, ListRow } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatMoney } from '@/services/money';

type Props = {
  accounts: Account[];
  onOpen: (id: number) => void;
};

// Balance is 0 until transactions exist (a later slice).
export function AccountList({ accounts, onOpen }: Props) {
  const { t } = useTranslation();
  return (
    <FlatList
      data={accounts}
      keyExtractor={(account) => String(account.id)}
      renderItem={({ item }) => (
        <ListRow
          accessibilityLabel={t('accounts.cardLabel', {
            name: item.name,
            balance: formatMoney(0, item.currency),
            currency: item.currency,
          })}
          icon={item.icon}
          title={item.name}
          description={item.currency}
          right={<AmountText cents={0} currency={item.currency} />}
          onPress={() => onOpen(item.id)}
        />
      )}
    />
  );
}
