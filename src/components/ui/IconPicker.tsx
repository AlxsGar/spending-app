import { StyleSheet, View } from 'react-native';
import { IconButton } from 'react-native-paper';

import { borderWidth, colors, radius, sizes, spacing } from '@/theme';

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

// Custom component: Paper has no select or grid picker. Built from Paper
// IconButtons; the selected one is filled with the selection color and
// outlined, so it is not shown by color alone.
export function IconPicker<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <View style={styles.grid}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <IconButton
            key={option.value}
            icon={option.value}
            size={sizes.icon}
            mode="contained"
            selected={selected}
            containerColor={selected ? colors.accentSecondary : colors.surface}
            iconColor={selected ? colors.background : colors.textSecondary}
            style={[styles.button, selected && styles.selected]}
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    margin: 0,
    borderRadius: radius,
  },
  selected: {
    borderWidth,
    borderColor: colors.text,
  },
});
