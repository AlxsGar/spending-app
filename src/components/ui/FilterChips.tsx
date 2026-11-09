import { StyleSheet, View } from 'react-native';
import { Chip } from 'react-native-paper';

import { colors, opacity, sizes, spacing, withOpacity } from '@/theme';

export type ChipOption = {
  value: string;
  label: string;
};

type Props = {
  options: readonly ChipOption[];
  // The selected values; any subset (several chips can be on, or none).
  selected: readonly string[];
  onChange: (selected: string[]) => void;
};

// A row of toggle chips for choosing any subset of a few options (Paper Chip
// with `selected`, which also reports the selected state to screen readers; the
// selected one also shows a check, so it is never color alone). Keeps the options' order in the result. Wraps onto more lines when the
// labels are long (Spanish).
export function FilterChips({ options, selected, onChange }: Props) {
  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(options.map((option) => option.value).filter((item) => next.includes(item)));
  };

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <Chip
            key={option.value}
            mode="outlined"
            selected={on}
            showSelectedCheck
            onPress={() => toggle(option.value)}
            accessibilityLabel={option.label}
            selectedColor={on ? colors.accent : colors.textSecondary}
            style={[styles.chip, on ? styles.on : null]}
          >
            {option.label}
          </Chip>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
  },
  on: {
    backgroundColor: withOpacity(colors.accent, opacity.selected),
  },
});
