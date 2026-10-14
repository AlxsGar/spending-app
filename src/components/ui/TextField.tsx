import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import { colors } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  errorText?: string;
  helperText?: string;
  maxLength?: number;
};

export function TextField({ label, value, onChangeText, errorText, helperText, maxLength }: Props) {
  return (
    <View>
      <TextInput
        mode="outlined"
        label={label}
        accessibilityLabel={label}
        value={value}
        maxLength={maxLength}
        onChangeText={onChangeText}
        error={Boolean(errorText)}
        style={styles.input}
        activeOutlineColor={colors.accentSecondary}
      />
      {errorText ? (
        <HelperText type="error" visible>
          {errorText}
        </HelperText>
      ) : null}
      {helperText ? (
        <HelperText type="info" visible>
          {helperText}
        </HelperText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
  },
});
