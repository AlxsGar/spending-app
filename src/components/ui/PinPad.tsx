import { StyleSheet, View } from 'react-native';
import { IconButton, TouchableRipple } from 'react-native-paper';

import { borderWidth, colors, disabledColor, opacity, sizes, spacing } from '@/theme';

import { AppText } from './AppText';

type Props = {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  disabled?: boolean;
  // "3 of 6 digits entered": read by screen readers; the dots are hidden.
  statusLabel: string;
  deleteLabel: string;
};

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

// A numeric PIN pad with dots for the digits typed. Paper has no PIN pad, so
// this is a custom component composed from Paper primitives (TouchableRipple
// keys, IconButton for delete). The digits are never shown as text.
export function PinPad({ value, onChange, maxLength, disabled = false, statusLabel, deleteLabel }: Props) {
  const press = (digit: string) => {
    if (!disabled && value.length < maxLength) onChange(value + digit);
  };
  const remove = () => {
    if (!disabled && value.length > 0) onChange(value.slice(0, -1));
  };

  const key = (digit: string) => (
    <TouchableRipple
      key={digit}
      onPress={() => press(digit)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={digit}
      borderless
      style={[styles.key, disabled && styles.disabled]}
    >
      <AppText variant="title" align="center">
        {digit}
      </AppText>
    </TouchableRipple>
  );

  return (
    <View style={styles.pad}>
      <View
        style={styles.dots}
        accessible
        accessibilityLabel={statusLabel}
        accessibilityLiveRegion="polite"
      >
        {Array.from({ length: maxLength }, (_, index) => (
          <View
            key={index}
            importantForAccessibility="no-hide-descendants"
            style={[styles.dot, index < value.length && styles.dotFilled]}
          />
        ))}
      </View>
      {ROWS.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map(key)}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.spacer} />
        {key('0')}
        <View style={styles.key}>
          <IconButton
            // Paper's IconButton is the delete key.
            icon="backspace-outline"
            size={sizes.icon}
            iconColor={disabled ? disabledColor(colors.text) : colors.text}
            onPress={remove}
            disabled={disabled}
            accessibilityLabel={deleteLabel}
            style={styles.delete}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: sizes.pinPadMaxWidth,
    gap: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  dot: {
    width: sizes.pinDot,
    height: sizes.pinDot,
    borderRadius: sizes.pinDot,
    borderWidth,
    borderColor: colors.textSecondary,
  },
  dotFilled: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  key: {
    width: sizes.pinKey,
    height: sizes.pinKey,
    borderRadius: sizes.pinKey,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: sizes.pinKey,
    height: sizes.pinKey,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  delete: {
    margin: 0,
    width: sizes.pinKey,
    height: sizes.pinKey,
  },
});
