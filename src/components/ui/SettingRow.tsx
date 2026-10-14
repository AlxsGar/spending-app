import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { List } from 'react-native-paper';

import { spacing, typography } from '@/theme';

import { AppText } from './AppText';

type Props = {
  label: string;
  children: ReactNode;
  errorText?: string;
};

// The control sits under the title (in the description slot) so longer
// Spanish labels and the segmented control never fight for one line.
export function SettingRow({ label, children, errorText }: Props) {
  return (
    <List.Item
      title={label}
      titleStyle={typography.bodyStrong}
      style={styles.item}
      description={() => (
        <View style={styles.body}>
          {children}
          {errorText ? <AppText color="alert">{errorText}</AppText> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 0,
  },
  body: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});
