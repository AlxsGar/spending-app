import { useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import {
  chart,
  colors,
  dividerColor,
  fontScaleLimits,
  spacing,
} from '@/theme';

import { AppText } from './AppText';

export type LineChartPoint = {
  key: string;
  // The x-axis label under the point; empty hides it (labels thin out on long
  // ranges) while the point can still be selected.
  label: string;
  incomeCents: number;
  expenseCents: number;
};

type Props = {
  points: readonly LineChartPoint[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  incomeLabel: string;
  expensesLabel: string;
  // What a screen reader says for the whole chart (the range title) and for its
  // current value (the selected day's totals).
  accessibilityLabel: string;
  accessibilityValue: string;
};

// Horizontal center of day `index` of `count` in a drawing `width` wide: every
// day owns an equal column, and the point sits in its middle.
export function pointX(index: number, count: number, width: number): number {
  return count > 0 ? ((index + 0.5) * width) / count : 0;
}

// The day whose column contains `x` (the inverse of pointX): a touch anywhere in
// the plot selects the nearest day, and a touch past either edge clamps to the
// first or last day. 0 when there is nothing to choose from.
export function nearestIndex(x: number, count: number, width: number): number {
  if (count <= 0 || width <= 0) return 0;
  const index = Math.floor((x / width) * count);
  return Math.min(count - 1, Math.max(0, index));
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

const ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

// A two-line chart (income in accent, expenses in alert), one point per day on
// a shared scale, with a legend. Choosing a day is a scrubber: a tap or a drag
// anywhere on the plot selects the nearest day, at any range length. The
// selected day is marked with a vertical guide, a larger dot and a bold label
// (when that day is labelled). For screen readers the plot and its labels are
// one adjustable element (label: the title, value: the selected day), and
// increment/decrement move the selection one day. Paper has no chart, so this
// is a custom component built from react-native-svg, Gesture Handler and our
// AppText.
export function LineChart({
  points,
  selectedIndex,
  onSelect,
  incomeLabel,
  expensesLabel,
  accessibilityLabel,
  accessibilityValue,
}: Props) {
  const [width, setWidth] = useState(0);
  const count = points.length;
  const max = Math.max(0, ...points.flatMap((point) => [point.incomeCents, point.expenseCents]));
  const xs = points.map((_, index) => pointX(index, count, width));
  const incomeYs = points.map((point) => pointY(point.incomeCents, max));
  const expenseYs = points.map((point) => pointY(point.expenseCents, max));
  const baseline = pointY(0, max);
  // Dots only while there is room for them; on long ranges the line alone shows
  // the shape and the selected day keeps its dot.
  const showDots = count > 0 && width / count >= chart.dotMinSpacing;

  const labelled = points.flatMap((point, index) => (point.label === '' ? [] : [index]));
  const labelStep = labelled.length > 1 ? labelled[1] - labelled[0] : 1;

  const scrub = useMemo(() => {
    const pick = (x: number) => onSelect(nearestIndex(x, count, width));
    const tap = Gesture.Tap()
      .runOnJS(true)
      .withTestId('chart-tap')
      .onEnd((event, success) => {
        if (success) pick(event.x);
      });
    // Horizontal movement takes over; a vertical swipe stays with the scroll view.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .withTestId('chart-pan')
      .activeOffsetX([-chart.scrubSlop, chart.scrubSlop])
      .failOffsetY([-chart.scrubSlop, chart.scrubSlop])
      .onStart((event) => pick(event.x))
      .onUpdate((event) => pick(event.x));
    return Gesture.Simultaneous(tap, pan);
  }, [count, width, onSelect]);

  const dots = (ys: readonly number[], color: string) =>
    points.flatMap((point, index) =>
      showDots || index === selectedIndex
        ? [
            <Circle
              key={`${color}-${point.key}`}
              cx={xs[index]}
              cy={ys[index]}
              r={index === selectedIndex ? chart.selectedDotRadius : chart.dotRadius}
              fill={color}
            />,
          ]
        : [],
    );

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
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: accessibilityValue }}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={(event) => {
          const name = event.nativeEvent.actionName;
          if (count === 0 || (name !== 'increment' && name !== 'decrement')) return;
          const next = selectedIndex + (name === 'increment' ? 1 : -1);
          onSelect(Math.min(count - 1, Math.max(0, next)));
        }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        <GestureDetector gesture={scrub}>
          <View testID="chart-plot" style={styles.plot}>
            {width > 0 ? (
              <Svg width={width} height={chart.plotHeight} pointerEvents="none">
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
          </View>
        </GestureDetector>
        <View style={styles.labels}>
          {/* Keeps the row's height; the labels themselves are positioned. */}
          <AppText variant="caption" maxFontSizeMultiplier={fontScaleLimits.maxWidth}>
            {' '}
          </AppText>
          {labelled.map((index) => {
            const selected = index === selectedIndex;
            return (
              <View
                key={points[index].key}
                testID={`chart-label-${index}`}
                style={[
                  styles.label,
                  {
                    left: `${((index + 0.5 - labelStep / 2) / count) * 100}%`,
                    width: `${(labelStep / count) * 100}%`,
                  },
                ]}
              >
                <AppText
                  variant={selected ? 'bodyStrong' : 'caption'}
                  color={selected ? 'text' : 'textSecondary'}
                  align="center"
                  maxFontSizeMultiplier={fontScaleLimits.maxWidth}
                >
                  {points[index].label}
                </AppText>
              </View>
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
  // The whole plot is the touch area.
  plot: {
    height: chart.plotHeight,
  },
  labels: {
    paddingBottom: spacing.sm,
  },
  label: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
});
