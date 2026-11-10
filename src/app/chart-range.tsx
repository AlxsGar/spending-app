import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ChartRangeForm } from '@/components/chart-range-form';
import { Screen } from '@/components/ui';
import { dayToDate, toDay } from '@/services/recurring';
import { useChartRangeStore } from '@/stores/chart-range-store';
import { useToday } from '@/stores/today';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The Custom range screen, pushed on top of the screen whose chart opened it. The
// params say which chart (`chart`) and the range it shows now (`from`, `to`, as
// calendar days). Apply hands the result to that chart through the store and
// goes back; Cancel just goes back.
export default function ChartRangeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const today = dayToDate(useToday());
  const params = useLocalSearchParams<{ chart?: string; from?: string; to?: string }>();
  const apply = useChartRangeStore((state) => state.apply);
  const day = (value: string | undefined) =>
    value !== undefined && DAY.test(value) ? dayToDate(value) : today;

  return (
    <>
      <Stack.Screen options={{ title: t('chart.customTitle') }} />
      <Screen>
        <ChartRangeForm
          initialFrom={day(params.from)}
          initialTo={day(params.to)}
          today={today}
          onApply={(from, to) => {
            // Without a chart id there is nobody to hand the range to.
            if (params.chart) apply({ chartId: params.chart, from: toDay(from), to: toDay(to) });
            router.back();
          }}
          onCancel={() => router.back()}
        />
      </Screen>
    </>
  );
}
