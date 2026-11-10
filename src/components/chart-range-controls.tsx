import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppIconButton, OptionPicker } from '@/components/ui';
import { rangeDays } from '@/services/chart-range';
import type { ChartRange } from '@/services/chart-range';
import { formatDateRange } from '@/services/format-date';
import { dayToDate, toDay } from '@/services/recurring';
import { useChartRangeStore } from '@/stores/chart-range-store';
import { useToday } from '@/stores/today';
import { spacing } from '@/theme';

type Preset = 'days7' | 'days30' | 'month';
const PRESETS: readonly Preset[] = ['days7', 'days30', 'month'];
const TITLE_KEYS = {
  days7: 'chart.titleDays7',
  days30: 'chart.titleDays30',
  month: 'chart.titleMonth',
} as const;

// The chart's range and its days, kept current: the rolling ranges and this
// month follow the day (a new day shifts the window). Not remembered: every
// screen starts on the last 7 days, and each chart keeps its own choice.
// `chartId` names the chart ('home', 'account-<id>'): a range applied on the
// Custom range screen for that id is picked up here.
export function useChartRange(chartId: string) {
  const { t, i18n } = useTranslation();
  const todayDay = useToday();
  const today = useMemo(() => dayToDate(todayDay), [todayDay]);
  const [range, setRange] = useState<ChartRange>({ kind: 'days7' });
  const days = useMemo(() => rangeDays(range, today), [range, today]);

  // The Custom range screen leaves its result in the store; the chart that owns
  // the id takes it. This assumes one mounted chart per id: the first listener
  // that matches clears the slot, so a second chart with the same id would not
  // see the result.
  useEffect(
    () =>
      useChartRangeStore.subscribe((state) => {
        const pending = state.pending;
        if (pending === null || pending.chartId !== chartId) return;
        // A new object every time, so applying the same dates again also starts
        // the chart over from its last day.
        setRange({ kind: 'custom', from: dayToDate(pending.from), to: dayToDate(pending.to) });
        state.clear(pending);
      }),
    [chartId],
  );

  const title =
    range.kind === 'custom'
      ? formatDateRange(range.from, range.to, i18n.language)
      : t(TITLE_KEYS[range.kind]);
  return { chartId, range, setRange, days, today, title };
}

type Props = {
  chartId: string;
  range: ChartRange;
  // The range's title (the preset's name, or the custom dates).
  title: string;
  // The range's days: the Custom range screen opens prefilled with the first and last.
  days: readonly Date[];
  today: Date;
  onChange: (range: ChartRange) => void;
};

// The header row of the chart: on the left the range dropdown (OptionPicker, a
// centered list: Last 7 days, Last 30 days, This month), which doubles as the
// chart's title and shows the dates while a custom range is active (no preset is
// checked then); on the right a filter button that opens the Custom range screen
// (a form with a date picker is a screen, not a dialog), prefilled with the
// current range. The button looks selected, and says so to screen readers, while
// a custom range is active.
export function ChartRangeHeader({ chartId, range, title, days, today, onChange }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const openCustom = () =>
    router.push({
      pathname: '/chart-range',
      params: {
        chart: chartId,
        from: toDay(days[0] ?? today),
        to: toDay(days[days.length - 1] ?? today),
      },
    });

  return (
    <View style={styles.row}>
      <View style={styles.picker}>
        <OptionPicker
          value={range.kind}
          options={PRESETS.map((value) => ({ value, label: t(TITLE_KEYS[value]) }))}
          onChange={(next) => {
            if (next !== 'custom' && next !== range.kind) onChange({ kind: next });
          }}
          label={t('chart.rangeLabel')}
          title={t('chart.rangeTitle')}
          cancelLabel={t('common.cancel')}
          displayValue={title}
        />
      </View>
      <AppIconButton
        icon="filter-variant"
        selectedIcon="filter-check"
        accessibilityLabel={t('chart.customTitle')}
        selected={range.kind === 'custom'}
        onPress={openCustom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  picker: {
    flex: 1,
  },
});
