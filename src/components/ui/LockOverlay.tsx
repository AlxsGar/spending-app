import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Portal } from 'react-native-paper';

import { colors, spacing } from '@/theme';

type Props = {
  children: ReactNode;
};

// An opaque full-screen cover for the lock. It is a Portal mounted after every
// other overlay (the success card, snackbars), so it stays on top of them, and
// it is a modal view for screen readers so nothing behind it can be reached.
export function LockOverlay({ children }: Props) {
  return (
    <Portal>
      <View style={styles.root} accessibilityViewIsModal>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
});
