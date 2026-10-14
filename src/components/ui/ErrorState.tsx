import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { AppButton } from './AppButton';
import { AppText } from './AppText';

type Props = {
  message: string;
  retryLabel: string;
  onRetry: () => void;
};

export function ErrorState({ message, retryLabel, onRetry }: Props) {
  return (
    <View style={styles.root}>
      <AppText color="alert" align="center">
        {message}
      </AppText>
      <View style={styles.action}>
        <AppButton label={retryLabel} onPress={onRetry} variant="secondary" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  action: {
    alignSelf: 'stretch',
  },
});
