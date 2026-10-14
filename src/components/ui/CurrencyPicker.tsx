import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Dialog, Portal, RadioButton } from 'react-native-paper';

import { colors, sizes } from '@/theme';

type Props<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
  title: string;
  cancelLabel: string;
};

// Custom component: Paper has no select. A Paper Button shows the selected
// code and opens a Paper Dialog with a scrollable list of RadioButton.Items,
// so every option stays reachable on small screens.
export function CurrencyPicker<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
  title,
  cancelLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        mode="outlined"
        icon="chevron-down"
        contentStyle={styles.buttonContent}
        style={styles.button}
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
      >
        {value}
      </Button>
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
                    key={option}
                    label={option}
                    value={option}
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
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  buttonContent: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row-reverse',
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
