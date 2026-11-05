import { StyleSheet } from 'react-native';
import { List, Switch } from 'react-native-paper';

import { colors, sizes, typography } from '@/theme';

type Props = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

// A labelled on/off row: Paper's List.Item with a Paper Switch on the right.
// The whole row toggles, so the touch target is the full row.
export function SwitchRow({ label, value, onChange }: Props) {
  return (
    <List.Item
      title={label}
      titleStyle={typography.bodyStrong}
      style={styles.item}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      right={() => (
        <Switch
          value={value}
          onValueChange={onChange}
          color={colors.accent}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: 0,
  },
});
