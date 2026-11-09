import { StyleSheet } from 'react-native';
import { Banner, TouchableRipple } from 'react-native-paper';

import { colors, radius, sizes, spacing } from '@/theme';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';

type Props = {
  // One line of text each. Shown in the alert color, with the alert icon, so the
  // meaning never rests on color alone.
  lines: string[];
  // Makes the whole banner a button (for example to open a list). The label
  // should cover the lines and the hint say what pressing does.
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

// A warning that stays while it applies: Paper's Banner with no actions, so
// there is no dismiss button. The owner decides when to render it; rendered, it
// is visible. Paper reads the message as an alert for screen readers; with
// `onPress` the banner is one button instead.
export function AlertBanner({ lines, onPress, accessibilityLabel, accessibilityHint }: Props) {
  const banner = (
    <Banner
      visible
      style={styles.banner}
      icon={() => <AppIcon name="alert-circle-outline" size={sizes.iconLarge} color="alert" />}
    >
      {lines.map((line, index) => (
        <AppText key={index} color="alert" variant="bodyStrong">
          {index < lines.length - 1 ? `${line}\n` : line}
        </AppText>
      ))}
    </Banner>
  );
  if (!onPress) return banner;
  return (
    <TouchableRipple
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={styles.press}
    >
      {banner}
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surface,
    borderRadius: radius,
  },
  press: {
    borderRadius: radius,
    marginBottom: spacing.xl,
  },
});
