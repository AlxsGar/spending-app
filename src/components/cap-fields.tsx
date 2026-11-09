import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, SegmentedControl, TextField } from '@/components/ui';
import { CAP_PERIODS, validateCapInput } from '@/services/soft-caps';
import type { CapInput, CapPeriod } from '@/services/soft-caps';
import { spacing } from '@/theme';

type Props = {
  value: CapInput;
  onChange: (value: CapInput) => void;
  currency: string;
  // Show the amount's error (the owner decides when, for example after a save
  // attempt).
  showError: boolean;
  helperText?: string;
};

// The cap amount (empty means no cap) and its period. Shared by the account
// form and Settings.
export function CapFields({ value, onChange, currency, showError, helperText }: Props) {
  const { t } = useTranslation();
  const code = showError ? validateCapInput(value, currency) : null;
  return (
    <View style={styles.root}>
      <TextField
        label={t('caps.amountLabel')}
        value={value.amount}
        onChangeText={(amount) => onChange({ ...value, amount })}
        keyboardType="decimal-pad"
        suffix={currency}
        helperText={helperText}
        errorText={code ? t(`caps.errors.${code}`) : undefined}
      />
      <AppText variant="bodyStrong">{t('caps.periodLabel')}</AppText>
      <SegmentedControl<CapPeriod>
        value={value.period}
        onChange={(period) => onChange({ ...value, period })}
        options={CAP_PERIODS.map((period) => ({
          value: period,
          label: t(
            period === 'day' ? 'caps.periodDay' : period === 'week' ? 'caps.periodWeek' : 'caps.periodMonth',
          ),
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
});
