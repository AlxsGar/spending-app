import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppButton, AppText, DateField, useScrollEndStyle } from '@/components/ui';
import { fromBounds, toBounds, validateCustomRange, withinBounds } from '@/services/chart-range';
import { formatShortDate } from '@/services/format-date';
import { spacing } from '@/theme';

type Props = {
  initialFrom: Date;
  initialTo: Date;
  today: Date;
  onApply: (from: Date, to: Date) => void;
  onCancel: () => void;
};

// The Custom range form: From and To date fields, Apply and Cancel. The pickers
// only offer valid days (From up to To and at most a year before it; To from
// From up to today or a year after From), so an invalid range cannot be chosen:
// a field keeps its last valid value, and a value a platform delivers outside the
// bounds is ignored. Apply still checks the range as a guard.
export function ChartRangeForm({ initialFrom, initialTo, today, onApply, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const scrollEnd = useScrollEndStyle();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const fromRange = fromBounds(to);
  const toRange = toBounds(from, today);

  const field = (
    label: string,
    value: Date,
    bounds: { min: Date; max: Date },
    onChange: (value: Date) => void,
  ) => (
    <View style={styles.field}>
      <AppText variant="bodyStrong">{label}</AppText>
      <DateField
        value={value}
        onChange={(next) => {
          if (withinBounds(next, bounds)) onChange(next);
        }}
        locale={i18n.language}
        accessibilityLabel={label}
        displayValue={formatShortDate(value, i18n.language)}
        confirmLabel={t('common.done')}
        cancelLabel={t('common.cancel')}
        minimumDate={bounds.min}
        maximumDate={bounds.max}
      />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[styles.content, scrollEnd]} keyboardShouldPersistTaps="handled">
      {field(t('chart.from'), from, fromRange, setFrom)}
      {field(t('chart.to'), to, toRange, setTo)}
      <AppButton
        label={t('chart.apply')}
        onPress={() => {
          if (validateCustomRange(from, to, today) === null) onApply(from, to);
        }}
      />
      <AppButton label={t('common.cancel')} variant="secondary" onPress={onCancel} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  field: {
    gap: spacing.sm,
  },
});
