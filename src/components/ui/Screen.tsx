import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Portal } from 'react-native-paper';

import { colors, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  overlay?: ReactNode;
};

// The Portal.Host is scoped to the screen so overlays (such as the FAB group)
// render inside the scene, above the tab bar, not over it.
export function Screen({ children, overlay }: Props) {
  return (
    <Portal.Host>
      <View style={styles.root}>
        <View style={styles.content}>{children}</View>
        {overlay}
      </View>
    </Portal.Host>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
});
