import { StyleSheet } from 'react-native';
import { IconButton } from 'react-native-paper';

import { colors, opacity, sizes, withOpacity } from '@/theme';

type Props = {
  // Paper icon name.
  icon: string;
  accessibilityLabel: string;
  onPress: () => void;
  // On: a tinted background, the accent color and, when given, `selectedIcon`
  // instead of `icon` (a different shape, so it is never color alone), plus the
  // selected state for screen readers (a filter that is active).
  selected?: boolean;
  selectedIcon?: string;
};

// A Paper IconButton at least 48 by 48, with an optional selected look.
export function AppIconButton({
  icon,
  selectedIcon,
  accessibilityLabel,
  onPress,
  selected = false,
}: Props) {
  return (
    <IconButton
      icon={selected && selectedIcon ? selectedIcon : icon}
      iconColor={selected ? colors.accent : colors.text}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.button, selected ? styles.on : null]}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    margin: 0,
  },
  on: {
    backgroundColor: withOpacity(colors.accent, opacity.selected),
  },
});
