import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ActionDialog, AmountText, AppIconButton, AppText } from '@/components/ui';
import type { CurrencyProjection } from '@/services/projection';
import { formatSignedMoney } from '@/services/money';
import { spacing } from '@/theme';

type Props = {
  lines: CurrencyProjection[];
};

const BULLETS = [
  'projection.infoCounts',
  'projection.infoNotCounts',
  'projection.infoAccounts',
  'projection.infoCurrencies',
  'projection.infoOnlyRecurring',
] as const;

// Home: the projected end-of-month balance, one line per currency (never
// converted). All of it is secondary text; negative amounts carry the minus
// sign (no color). An (i) button next to the title explains the rule.
export function ProjectionSummary({ lines }: Props) {
  const { t } = useTranslation();
  const [info, setInfo] = useState(false);
  if (lines.length === 0) return null;
  return (
    <View style={styles.block} testID="projection-summary">
      <View style={styles.titleRow}>
        <View style={styles.title}>
          <AppText variant="caption" color="textSecondary">
            {t('projection.title')}
          </AppText>
        </View>
        <AppIconButton
          icon="information-outline"
          accessibilityLabel={t('projection.infoLabel')}
          onPress={() => setInfo(true)}
        />
      </View>
      {lines.map((line) => (
        <View
          key={line.currency}
          style={styles.line}
          accessible
          accessibilityLabel={t('projection.lineLabel', {
            currency: line.currency,
            amount: formatSignedMoney(line.cents, line.currency),
          })}
        >
          <AppText color="textSecondary">{line.currency}</AppText>
          <AmountText cents={line.cents} currency={line.currency} muted />
        </View>
      ))}
      <ActionDialog
        visible={info}
        title={t('projection.title')}
        scroll
        onDismiss={() => setInfo(false)}
        actions={[{ label: t('projection.infoClose'), onPress: () => setInfo(false) }]}
      >
        <View style={styles.body}>
          <AppText color="textSecondary">{t('projection.infoIntro')}</AppText>
          <AppText color="textSecondary">
            <AppText variant="bodyStrong" color="textSecondary">
              {t('projection.infoHow')}
            </AppText>{' '}
            {t('projection.infoHowText')}
          </AppText>
          {BULLETS.map((key) => (
            <View key={key} style={styles.bullet}>
              {/* The glyph is decoration: hidden from screen readers. */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <AppText color="textSecondary">{'•'}</AppText>
              </View>
              <View style={styles.bulletText}>
                <AppText color="textSecondary">{t(key)}</AppText>
              </View>
            </View>
          ))}
        </View>
      </ActionDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  body: {
    gap: spacing.md,
    // The dialog's scroll area has no side padding of its own.
    paddingHorizontal: spacing.xl,
  },
  bullet: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bulletText: {
    flex: 1,
  },
});
