import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Button, Dialog, Portal } from 'react-native-paper';

import { colors, sizes } from '@/theme';

type Props = {
  // The chosen local day (the time of day is ignored).
  value: Date;
  // Called with local midnight of the picked day.
  onChange: (value: Date) => void;
  locale: string;
  accessibilityLabel: string;
  // Text shown on the button, already formatted for the app language.
  displayValue: string;
  confirmLabel: string;
  cancelLabel: string;
  // What "now" is. Read each time the picker opens, so a screen left open
  // past midnight limits the picker to the new day.
  getNow?: () => Date;
};

const defaultNow = () => new Date();

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function localDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Custom component: Paper has no date picker. A Paper Button shows the date
// and opens the platform's native picker, which never accepts a future day.
//
// - Android: the native calendar dialog (imperative API). It is already a
//   system dialog, so it needs no extra container.
// - iOS: the native spinner inside a Paper Dialog with Cancel and Done. The
//   spinner is compact and fits the dialog width, and Cancel/Done keep the
//   value unchanged until the user confirms, matching Android.
export function DateField({
  value,
  onChange,
  locale,
  accessibilityLabel,
  displayValue,
  confirmLabel,
  cancelLabel,
  getNow = defaultNow,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [maximumDate, setMaximumDate] = useState(() => endOfLocalDay(getNow()));

  const openPicker = () => {
    const limit = endOfLocalDay(getNow());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value,
        mode: 'date',
        maximumDate: limit,
        onChange: (event: DateTimePickerEvent, picked?: Date) => {
          if (event.type === 'set' && picked) onChange(localDay(picked));
        },
      });
      return;
    }
    setMaximumDate(limit);
    setDraft(value);
    setOpen(true);
  };

  return (
    <>
      <Button
        mode="outlined"
        icon="calendar"
        contentStyle={styles.buttonContent}
        style={styles.button}
        accessibilityLabel={accessibilityLabel}
        onPress={openPicker}
      >
        {displayValue}
      </Button>
      {Platform.OS === 'ios' ? (
        <Portal>
          <Dialog visible={open} onDismiss={() => setOpen(false)}>
            <Dialog.Content>
              <DateTimePicker
                testID="date-picker"
                value={draft}
                mode="date"
                display="spinner"
                locale={locale}
                themeVariant="dark"
                textColor={colors.text}
                maximumDate={maximumDate}
                onChange={(_event, picked) => {
                  if (picked) setDraft(picked);
                }}
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setOpen(false)} textColor={colors.textSecondary}>
                {cancelLabel}
              </Button>
              <Button
                onPress={() => {
                  setOpen(false);
                  onChange(localDay(draft));
                }}
              >
                {confirmLabel}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      ) : null}
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
  },
});
