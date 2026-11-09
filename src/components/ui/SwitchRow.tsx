import { StyleSheet } from 'react-native';
import { List, Switch } from 'react-native-paper';

import { colors, opacity, sizes, typography } from '@/theme';

type Props = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  // A disabled row does not toggle and is drawn at the disabled opacity. The
  // description (for example the reason it is disabled) shows under the label.
  disabled?: boolean;
  description?: string;
};

// A labelled on/off row: Paper's List.Item with a Paper Switch on the right.
// The whole row toggles, so the touch target is the full row.
export function SwitchRow({ label, value, onChange, disabled = false, description }: Props) {
  return (
    <List.Item
      title={label}
      // Paper's List.Item does not dim its texts when disabled (it only passes
      // `disabled` to the touchable), so the whole row gets the disabled opacity.
      titleStyle={[typography.bodyStrong, disabled && styles.dimmed]}
      descriptionStyle={disabled ? styles.dimmed : undefined}
      description={description}
      descriptionNumberOfLines={3}
      style={styles.item}
      onPress={disabled ? undefined : () => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      right={() => (
        <Switch
          value={value}
          disabled={disabled}
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
  dimmed: {
    opacity: opacity.disabled,
  },
  item: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: 0,
  },
});
