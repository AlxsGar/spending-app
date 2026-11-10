import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { TouchableRipple } from 'react-native-paper';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import {
  chart,
  colors,
  dividerColor,
  fontScaleLimits,
  opacity,
  radius,
  spacing,
  withOpacity,
} from '@/theme';

import { AppText } from './AppText';

export type LineChartPoint = {
  key: string;
  // The x-axis label under the point; empty hides it (labels thin out on long
  // ranges) while the point stays tappable.
  label: string;
  incomeCents: number;
  expenseCents: number;
  // What a screen reader says for the point.
  accessibilityLabel: string;
};

type Props = {
  points: readonly LineChartPoint[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  incomeLabel: string;
  expensesLabel: string;
};

// Horizontal center of day `index` of `count` in a drawing `width` wide: every
// day owns an equal column, and the point sits in its middle (so it lines up
// with the tappable column).
export function pointX(index: number, count: number, width: number): number {
  return count > 0 ? ((index + 0.5) * width) / count : 0;
}

// Vertical position of a value: the largest value (`max`) at the top inset, 0 on
// the baseline at the bottom inset, both inset so a dot is never cut off. With
// max 0 (nothing to scale) every value sits on the baseline.
export function pointY(cents: number, max: number): number {
  const span = chart.plotHeight - 2 * chart.plotInset;
  const ratio = max > 0 ? cents / max : 0;
  return chart.plotInset + (1 - ratio) * span;
}

// A short line sample for the legend, in the line's own style.
function LegendLine({ color, dashed = false }: { color: string; dashed?: boolean }) {
  const middle = chart.legendHeight / 2;
  return (
    <Svg width={chart.legendWidth} height={chart.legendHeight}>
      <Line
        x1={0}
        x2={chart.legendWidth}
        y1={middle}
        y2={middle}
        stroke={color}
        strokeWidth={chart.lineWidth}
        strokeDasharray={dashed ? [...chart.dashArray] : undefined}
      />
    </Svg>
  );
}

function linePath(xs: readonly number[], ys: readonly number[]): string {
  return xs.map((x, index) => `${index === 0 ? 'M' : 'L'}${x} ${ys[index]}`).join(' ');
}

// A two-line chart (income in accent, expenses in alert), one point per day on
// a shared scale, with a legend. Each day is one accessible button laid over the
// drawing (so the whole column is the touch target); the selected day is also
// bold, tinted and marked with a vertical guide and a larger dot. Paper has no
// chart, so this is a custom component built from react-native-svg, Paper's
// TouchableRipple and our AppText.
export function LineChart({ points, selectedIndex, onSelect, incomeLabel, expensesLabel }: Props) {
  const [width, setWidth] = useState(0);
  const count = points.length;
  const max = Math.max(0, ...points.flatMap((point) => [point.incomeCents, point.expenseCents]));
  const xs = points.map((_, index) => pointX(index, count, width));
  const incomeYs = points.map((point) => pointY(point.incomeCents, max));
  const expenseYs = points.map((point) => pointY(point.expenseCents, max));
  const baseline = pointY(0, max);

  const dots = (ys: readonly number[], color: string) =>
    points.map((point, index) => (
      <Circle
        key={`${color}-${point.key}`}
        cx={xs[index]}
        cy={ys[index]}
        r={index === selectedIndex ? chart.selectedDotRadius : chart.dotRadius}
        fill={color}
      />
    ));

  return (
    <View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <LegendLine color={colors.accent} />
          <AppText variant="caption" color="textSecondary">
            {incomeLabel}
          </AppText>
        </View>
        <View style={styles.legendItem}>
          <LegendLine color={colors.alert} dashed />
          <AppText variant="caption" color="textSecondary">
            {expensesLabel}
          </AppText>
        </View>
      </View>
      <View
        testID="line-chart"
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        {width > 0 ? (
          <Svg
            width={width}
            height={chart.plotHeight}
            style={styles.drawing}
            pointerEvents="none"
          >
            <Line
              x1={0}
              x2={width}
              y1={baseline}
              y2={baseline}
              stroke={dividerColor}
              strokeWidth={chart.baselineWidth}
            />
            {selectedIndex >= 0 && selectedIndex < count ? (
              <Line
                x1={xs[selectedIndex]}
                x2={xs[selectedIndex]}
                y1={0}
                y2={chart.plotHeight}
                stroke={colors.textSecondary}
                strokeWidth={chart.guideWidth}
              />
            ) : null}
            <Path
              d={linePath(xs, incomeYs)}
              stroke={colors.accent}
              strokeWidth={chart.lineWidth}
              fill="none"
            />
            <Path
              d={linePath(xs, expenseYs)}
              stroke={colors.alert}
              strokeWidth={chart.lineWidth}
              strokeDasharray={[...chart.dashArray]}
              fill="none"
            />
            {dots(incomeYs, colors.accent)}
            {dots(expenseYs, colors.alert)}
          </Svg>
        ) : null}
        <View style={styles.row}>
          {points.map((point, index) => {
            const selected = index === selectedIndex;
            return (
              <TouchableRipple
                key={point.key}
                testID={`chart-day-${index}`}
                style={[styles.column, selected ? styles.columnSelected : null]}
                onPress={() => onSelect(index)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={point.accessibilityLabel}
              >
                <View style={styles.columnInner}>
                  <View style={styles.plot} />
                  <AppText
                    variant={selected ? 'bodyStrong' : 'caption'}
                    color={selected ? 'text' : 'textSecondary'}
                    align="center"
                    maxFontSizeMultiplier={fontScaleLimits.maxWidth}
                  >
                    {point.label}
                  </AppText>
                </View>
              </TouchableRipple>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // The drawing sits behind the day columns, from the top of the plot.
  drawing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  row: {
    flexDirection: 'row',
  },
  column: {
    flex: 1,
    borderRadius: radius,
  },
  columnSelected: {
    backgroundColor: withOpacity(colors.text, opacity.divider),
  },
  columnInner: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  plot: {
    height: chart.plotHeight,
    alignSelf: 'stretch',
  },
});
