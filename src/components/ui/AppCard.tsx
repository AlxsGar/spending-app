import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Card } from 'react-native-paper';

import { colors, radius, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  // Fill the parent instead of sizing to the content (parent sets the size).
  fill?: boolean;
};

export function AppCard({ children, onPress, accessibilityLabel, fill }: Props) {
  return (
    <Card
      mode="contained"
      style={[styles.card, fill && styles.fill]}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      <Card.Content style={styles.content}>{children}</Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
});
