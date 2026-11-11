import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ProjectionLine } from '@/components/projection-line';
import { AmountText, AppCard, AppIcon, AppText } from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatSignedMoney } from '@/services/money';
import { fontScaleLimits, scaleSize, sizes, spacing } from '@/theme';

type Props = {
  accounts: Account[];
  // Balance in cents per account id; a missing id means 0.
  balances: Record<number, number>;
  // Projected end-of-month balance per account id; null while it is not known
  // (the recurring payments have not loaded), and then no line is shown.
  projections?: Record<number, number> | null;
  onOpen: (id: number) => void;
};

export function AccountCards({ accounts, balances, projections, onOpen }: Props) {
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
            accessibilityLabel={t(
              projections ? 'accounts.cardLabelProjection' : 'accounts.cardLabel',
              {
                name: account.name,
                balance: formatSignedMoney(balances[account.id] ?? 0, account.currency),
                projection: formatSignedMoney(projections?.[account.id] ?? 0, account.currency),
                currency: account.currency,
              },
            )}
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
              cents={balances[account.id] ?? 0}
              currency={account.currency}
              colored
              variant="title"
              align="left"
              fit
              maxFontSizeMultiplier={fontScaleLimits.maxHeight}
            />
            {projections ? (
              <ProjectionLine
                cents={projections[account.id] ?? 0}
                currency={account.currency}
                maxFontSizeMultiplier={fontScaleLimits.maxHeight}
              />
            ) : null}
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
