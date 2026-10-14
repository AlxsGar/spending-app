import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { List } from 'react-native-paper';

import { colors, sizes, typography } from '@/theme';

type Props = {
  icon: string;
  title: string;
  description?: string;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function ListRow({ icon, title, description, right, onPress, accessibilityLabel }: Props) {
  return (
    <List.Item
      accessibilityLabel={accessibilityLabel}
      title={title}
      description={description}
      titleStyle={typography.bodyStrong}
      descriptionStyle={styles.description}
      style={styles.item}
      onPress={onPress}
      left={(props) => <List.Icon {...props} icon={icon} color={colors.text} />}
      right={right ? () => right : undefined}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: 0,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
