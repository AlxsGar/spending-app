import { StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

import { colors, disabledColor, sizes } from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean;
};

export function AppButton({ label, onPress, variant = 'primary', disabled }: Props) {
  return (
    <Button
      mode={variant === 'primary' ? 'contained' : 'outlined'}
      textColor={
        variant === 'destructive'
          ? disabled
            ? disabledColor(colors.alert)
            : colors.alert
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
