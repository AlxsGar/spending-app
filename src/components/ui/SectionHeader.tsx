import { StyleSheet } from 'react-native';
import { List } from 'react-native-paper';

import { colors, spacing, typography } from '@/theme';

type Props = {
  title: string;
};

export function SectionHeader({ title }: Props) {
  return (
    <List.Subheader style={styles.header} accessibilityRole="header">
      {title}
    </List.Subheader>
  );
}

const styles = StyleSheet.create({
  header: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.background,
    paddingHorizontal: 0,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
});
