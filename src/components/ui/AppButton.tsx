import { StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

import { colors, disabledColor, sizes } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  // link: a quiet text button for navigation ("See all").
  variant?: 'primary' | 'secondary' | 'destructive' | 'link';
  disabled?: boolean;
};

export function AppButton({ label, onPress, variant = 'primary', disabled }: Props) {
  const mode = variant === 'primary' ? 'contained' : variant === 'link' ? 'text' : 'outlined';
  return (
    <Button
      mode={mode}
      textColor={
        variant === 'destructive'
          ? disabled
            ? disabledColor(colors.alert)
            : colors.alert
          : variant === 'link'
            ? disabled
              ? disabledColor(colors.accentSecondary)
              : colors.accentSecondary
            : undefined
      }
      onPress={onPress}
      disabled={disabled}
      style={styles.button}
      contentStyle={styles.content}
    >
      {label}
    </Button>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
  },
  content: {
    minHeight: sizes.touchTarget,
  },
});
