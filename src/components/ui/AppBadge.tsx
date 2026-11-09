import { StyleSheet } from 'react-native';
import { Badge } from 'react-native-paper';

import { colors, sizes } from '@/theme';

type Props = {
  count: number;
  // Announced instead of the bare number ("3 payments due soon").
  accessibilityLabel: string;
};

// A count badge. It marks navigation and selection, not money, so it uses
// accentSecondary.
export function AppBadge({ count, accessibilityLabel }: Props) {
  return (
    <Badge size={sizes.badge} style={styles.badge} accessibilityLabel={accessibilityLabel}>
      {count}
    </Badge>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.accentSecondary,
    color: colors.background,
    alignSelf: 'center',
  },
});
