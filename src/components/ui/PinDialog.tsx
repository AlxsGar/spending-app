import { Button, Dialog, Portal } from 'react-native-paper';

import { colors, disabledColor } from '@/theme';

import { AppText } from './AppText';
import { PinPad } from './PinPad';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  // Enables the confirm button once the PIN is long enough.
  canConfirm: boolean;
  errorText?: string | null;
  confirmLabel: string;
  cancelLabel: string;
  statusLabel: string;
  deleteLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

// A dialog that asks for a PIN on the PIN pad. One dialog at a time: the flow
// (enter, repeat, current PIN) changes its text, it never opens a second one.
export function PinDialog({
  visible,
  title,
  message,
  value,
  onChange,
  maxLength,
  canConfirm,
  errorText,
  confirmLabel,
  cancelLabel,
  statusLabel,
  deleteLabel,
  onConfirm,
  onCancel,
  busy = false,
}: Props) {
  const confirmDisabled = busy || !canConfirm;
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onCancel} dismissable={!busy}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <AppText color="textSecondary">{message}</AppText>
          <PinPad
            value={value}
            onChange={onChange}
            maxLength={maxLength}
            disabled={busy}
            statusLabel={statusLabel}
            deleteLabel={deleteLabel}
          />
          {errorText ? (
            <AppText color="alert" align="center" accessibilityLiveRegion="polite">
              {errorText}
            </AppText>
          ) : null}
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
            textColor={confirmDisabled ? disabledColor(colors.accent) : colors.accent}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
