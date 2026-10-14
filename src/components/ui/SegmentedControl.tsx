import { StyleSheet } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

import { sizes } from '@/theme';

type Option<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ value, options, onChange }: Props<T>) {
  return (
    <SegmentedButtons
      value={value}
      onValueChange={(next) => onChange(next as T)}
      buttons={options.map((option) => ({
        value: option.value,
        label: option.label,
        style: styles.button,
      }))}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.touchTarget,
  },
});
