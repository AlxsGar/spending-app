import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { IconButton } from 'react-native-paper';

import { colors, sizes } from '@/theme';

import { ActionDialog } from './ActionDialog';
import { AppText } from './AppText';
import { ListRow } from './ListRow';
import { createOnce } from './once';

export type MenuAction = {
  label: string;
  onPress: () => void;
  // Paper icon name shown before the label.
  icon: string;
};

type Props = {
  actions: readonly MenuAction[];
  // Names the ⋮ button for screen readers ("Actions for Rent").
  accessibilityLabel: string;
  // The dialog's title (the item's name) and an optional line under it (the
  // date the actions apply to).
  title: string;
  subtitle?: string;
  cancelLabel: string;
  disabled?: boolean;
};

// A ⋮ button that opens a centered dialog listing the actions for one item
// (Paper Dialog through ActionDialog; no dropdown, so there is no positioning).
// The dialog is unmounted, not faded out (Paper's Modal keeps a closing dialog
// on screen for its ~220 ms exit animation), in the same update that runs the
// chosen action. An action that opens another dialog (Skip's confirmation)
// therefore never overlaps this one, the same way the deck's pay dialog closes.
// Only the first action press in an open dialog runs.
export function ActionMenu({
  actions,
  accessibilityLabel,
  title,
  subtitle,
  cancelLabel,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  // Set synchronously: a second tap can arrive before a re-render removes the
  // rows. Reset each time the dialog opens.
  const [inFlight] = useState(createOnce);

  return (
    <>
      <IconButton
        icon="dots-vertical"
        iconColor={colors.text}
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={() => {
          inFlight.reset();
          setOpen(true);
        }}
        style={styles.button}
      />
      {open ? (
        <ActionDialog
          visible
          title={title}
          actions={[{ label: cancelLabel, tone: 'muted', onPress: () => setOpen(false) }]}
          onDismiss={() => setOpen(false)}
        >
          {subtitle ? <AppText color="textSecondary">{subtitle}</AppText> : null}
          {actions.map((action) => (
            <ListRow
              key={action.label}
              icon={action.icon}
              title={action.label}
              onPress={() => {
                // Only the first press in an open dialog runs.
                if (!inFlight.tryStart()) return;
                setOpen(false);
                action.onPress();
              }}
            />
          ))}
        </ActionDialog>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    margin: 0,
    width: sizes.touchTarget,
    height: sizes.touchTarget,
  },
});
