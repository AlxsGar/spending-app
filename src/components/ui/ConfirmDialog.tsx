import { Button, Dialog, Portal } from 'react-native-paper';

import { colors } from '@/theme';

import { AppText } from './AppText';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <AppText color="textSecondary">{message}</AppText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onCancel} textColor={colors.textSecondary}>
            {cancelLabel}
          </Button>
          <Button onPress={onConfirm} textColor={colors.alert}>
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
