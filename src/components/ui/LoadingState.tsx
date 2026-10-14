import { StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

import { colors } from '@/theme';

export function LoadingState() {
  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.accentSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
