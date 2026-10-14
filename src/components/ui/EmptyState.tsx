import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

type Props = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

export function EmptyState({ title, description, actionLabel, onAction }: Props) {
  return (
    <View style={styles.root}>
      <AppText variant="title" align="center">
        {title}
      </AppText>
      <AppText color="textSecondary" align="center">
        {description}
      </AppText>
      <View style={styles.action}>
        <AppButton label={actionLabel} onPress={onAction} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  action: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
});
