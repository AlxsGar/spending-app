import { StyleSheet } from 'react-native';
import { Portal, Snackbar } from 'react-native-paper';

import { colors, sizes } from '@/theme';

type Props = {
  visible: boolean;
  // Already translated.
  message: string;
  actionLabel: string;
  actionAccessibilityLabel: string;
  onAction: () => void;
  // Called when Paper's default duration ends, or the action was pressed.
  onDismiss: () => void;
};

const theme = {
  colors: {
    inverseOnSurface: colors.text,
    inversePrimary: colors.accent,
  },
};

// A short notice with one action: Paper's Snackbar in a Portal, so it shows
// above whatever screen is open, lifted above the tab bar (Paper adds the safe
// area itself). Paper's default duration, and Paper marks it as a polite live
// region for screen readers. Mount it through a host, one at a time.
export function AppSnackbar({
  visible,
  message,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
  onDismiss,
}: Props) {
  return (
    <Portal>
      <Snackbar
        visible={visible}
        onDismiss={onDismiss}
        theme={theme}
        style={styles.snackbar}
        wrapperStyle={styles.wrapper}
        action={{
          label: actionLabel,
          accessibilityLabel: actionAccessibilityLabel,
          onPress: onAction,
        }}
      >
        {message}
      </Snackbar>
    </Portal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    // Approximate lift (see sizes.tabBar): the same on non-tab screens.
    bottom: sizes.tabBar,
  },
  snackbar: {
    backgroundColor: colors.surface,
  },
});
