import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { List } from 'react-native-paper';

import { colors, sizes, typography } from '@/theme';

type Props = {
  icon: string;
  title: string;
  description?: string;
  // Rich description (lines with their own colors or icons); used instead of
  // `description` when given.
  descriptionContent?: ReactNode;
  // Lines the description may use (Paper's default is 2).
  descriptionLines?: number;
  right?: ReactNode;
  // Greyed title and icon (a finished item).
  muted?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function ListRow({
  icon,
  title,
  description,
  descriptionContent,
  descriptionLines,
  right,
  muted,
  onPress,
  accessibilityLabel,
}: Props) {
  const tone = muted ? colors.textSecondary : colors.text;
  return (
    <List.Item
      accessibilityLabel={accessibilityLabel}
      title={title}
      description={descriptionContent ? () => descriptionContent : description}
      descriptionNumberOfLines={descriptionLines}
      titleStyle={[typography.bodyStrong, { color: tone }]}
      descriptionStyle={styles.description}
      style={styles.item}
      onPress={onPress}
      left={(props) => <List.Icon {...props} icon={icon} color={tone} />}
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
