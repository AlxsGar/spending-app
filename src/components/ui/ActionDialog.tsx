import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Button, Dialog, Portal } from 'react-native-paper';

import { colors, sizes } from '@/theme';

export type DialogAction = {
  label: string;
  onPress: () => void;
  // muted: a way out (Cancel, Dismiss); alert: destructive; primary: the
  // action the dialog is for.
  tone?: 'primary' | 'muted' | 'alert';
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  children: ReactNode;
  actions: readonly DialogAction[];
  // Called by the backdrop and the Android back button.
  onDismiss: () => void;
  // A long list of content: scrolls inside the dialog.
  scroll?: boolean;
};

const TONE_COLOR = {
  primary: colors.accent,
  muted: colors.textSecondary,
  alert: colors.alert,
} as const;

// A Paper Dialog with a title, free content and any number of text actions.
// Use ConfirmDialog for a plain yes/no confirmation.
export function ActionDialog({ visible, title, children, actions, onDismiss, scroll }: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        {scroll ? (
          <Dialog.ScrollArea style={styles.scrollArea}>
            <ScrollView>{children}</ScrollView>
          </Dialog.ScrollArea>
        ) : (
          <Dialog.Content>{children}</Dialog.Content>
        )}
        <Dialog.Actions>
          {actions.map((action) => (
            <Button
              key={action.label}
              onPress={action.onPress}
              disabled={action.disabled}
              textColor={TONE_COLOR[action.tone ?? 'primary']}
              style={styles.action}
            >
              {action.label}
            </Button>
          ))}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  scrollArea: {
    maxHeight: sizes.dialogList,
    paddingHorizontal: 0,
  },
  action: {
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
  },
});
