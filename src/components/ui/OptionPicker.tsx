import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, RadioButton, TextInput } from 'react-native-paper';

import { colors, sizes } from '@/theme';

export type PickerOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: readonly PickerOption<T>[];
  onChange: (value: T) => void;
  // Shown as the field label; also announced with the current value.
  label: string;
  title: string;
  cancelLabel: string;
  errorText?: string;
  helperText?: string;
};

// Custom component: Paper has no select. A read-only Paper TextInput (same
// look as TextField) shows the label and the selected option, with a chevron.
// Pressing anywhere on it opens a Paper Dialog with a scrollable list of
// RadioButton.Items, so every option stays reachable on small screens.
export function OptionPicker<T extends string>({
  value,
  options,
  onChange,
  label,
  title,
  cancelLabel,
  errorText,
  helperText,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const text = selected ? selected.label : value;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${text}`}
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        {/* The Pressable is the one control; the input is only its look. */}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <TextInput
            mode="outlined"
            label={label}
            value={text}
            editable={false}
            showSoftInputOnFocus={false}
            caretHidden
            numberOfLines={1}
            error={Boolean(errorText)}
            style={styles.input}
            activeOutlineColor={colors.accentSecondary}
            right={<TextInput.Icon icon="chevron-down" />}
          />
        </View>
      </Pressable>
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
      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)}>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.ScrollArea style={styles.scrollArea}>
            <ScrollView>
              <RadioButton.Group
                value={value}
                onValueChange={(next) => {
                  setOpen(false);
                  onChange(next as T);
                }}
              >
                {options.map((option) => (
                  <RadioButton.Item
                    key={option.value}
                    label={option.label}
                    value={option.value}
                    color={colors.accentSecondary}
                    labelStyle={styles.label}
                    style={styles.item}
                  />
                ))}
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setOpen(false)} textColor={colors.textSecondary}>
              {cancelLabel}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.surface,
  },
  scrollArea: {
    maxHeight: sizes.dialogList,
    paddingHorizontal: 0,
  },
  item: {
    minHeight: sizes.touchTarget,
  },
  label: {
    color: colors.text,
  },
});
