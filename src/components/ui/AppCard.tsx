import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Card } from 'react-native-paper';

import { colors, radius, spacing } from '@/theme';

type Props = {
  children: ReactNode;
};

export function AppCard({ children }: Props) {
  return (
    <Card mode="contained" style={styles.card}>
      <Card.Content style={styles.content}>{children}</Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius,
  },
  content: {
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
});
