import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AmountText, AppCard, AppIcon, AppText } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatMoney } from '@/services/money';
import { fontScaleLimits, scaleSize, sizes, spacing } from '@/theme';

type Props = {
  accounts: Account[];
  onOpen: (id: number) => void;
};

// Balance is 0 until transactions exist (a later slice).
export function AccountCards({ accounts, onOpen }: Props) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  // Same size for every card: it depends only on the font scale, never on content.
  const cardSize = {
    width: scaleSize(sizes.accountCard, fontScale, fontScaleLimits.maxWidth),
    height: scaleSize(sizes.accountCardHeight, fontScale, fontScaleLimits.maxHeight),
  };
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {accounts.map((account) => (
        <View key={account.id} testID={`account-card-${account.id}`} style={cardSize}>
          <AppCard
            fill
            onPress={() => onOpen(account.id)}
            accessibilityLabel={t('accounts.cardLabel', {
              name: account.name,
              balance: formatMoney(0, account.currency),
              currency: account.currency,
            })}
          >
            <AppIcon name={account.icon} size={sizes.iconLarge} />
            <AppText
              variant="bodyStrong"
              numberOfLines={1}
              maxFontSizeMultiplier={fontScaleLimits.maxHeight}
            >
              {account.name}
            </AppText>
            <AmountText
              cents={0}
              currency={account.currency}
              variant="title"
              align="left"
              maxFontSizeMultiplier={fontScaleLimits.maxHeight}
            />
            <AppText
              variant="caption"
              color="textSecondary"
              maxFontSizeMultiplier={fontScaleLimits.maxHeight}
            >
              {account.currency}
            </AppText>
          </AppCard>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
  },
});
