import { Button, Dialog, Portal } from 'react-native-paper';

import { colors, disabledColor } from '@/theme';

import { AppText } from './AppText';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  // Work is running: the dialog cannot be dismissed (backdrop, back button) and
  // both buttons are disabled until the caller closes it.
  busy?: boolean;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
}: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} dismissable={!busy}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <AppText color="textSecondary">{message}</AppText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={onCancel}
            textColor={busy ? disabledColor(colors.textSecondary) : colors.textSecondary}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            onPress={onConfirm}
            textColor={busy ? disabledColor(colors.alert) : colors.alert}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
