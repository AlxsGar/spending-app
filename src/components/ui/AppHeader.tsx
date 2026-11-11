import { StyleSheet } from 'react-native';
import { Appbar } from 'react-native-paper';

import { colors, header, sizes } from '@/theme';

type Props = {
  title: string;
  // With onBack the bar shows a back button; backLabel is its accessibility label.
  onBack?: () => void;
  backLabel?: string;
};

// The compact app bar used as the navigator header on every tab and stack
// screen: Paper's small Appbar.Header with the theme's height and title size.
// Paper adds the status bar inset above the bar, so the title never sits under
// the status bar. The back button is a full 48 by 48 touch target.
export function AppHeader({ title, onBack, backLabel }: Props) {
  return (
    <Appbar.Header mode="small" style={styles.bar}>
      {onBack ? (
        <Appbar.BackAction
          onPress={onBack}
          accessibilityLabel={backLabel}
          color={colors.text}
          style={styles.action}
        />
      ) : null}
      <Appbar.Content
        title={title}
        color={colors.text}
        titleStyle={styles.title}
        style={onBack ? styles.afterBack : undefined}
      />
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: header.height,
    backgroundColor: colors.background,
  },
  action: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    margin: 0,
  },
  title: header.title,
  afterBack: {
    marginLeft: header.titleGap,
  },
});
