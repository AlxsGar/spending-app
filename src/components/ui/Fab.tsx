import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { FAB, Portal } from 'react-native-paper';

import { colors, scrimColor } from '@/theme';

export type FabAction = {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
};

type Props = {
  label: string;
  actions: FabAction[];
  visible?: boolean;
};

export function Fab({ label, actions, visible = true }: Props) {
  const [open, setOpen] = useState(false);

  // Tabs stay mounted, so close the group when the screen loses focus.
  if (!visible && open) setOpen(false);

  return (
    <Portal>
      <FAB.Group
        open={open}
        visible={visible}
        icon={open ? 'close' : 'plus'}
        accessibilityLabel={label}
        color={colors.background}
        backdropColor={scrimColor}
        fabStyle={styles.fab}
        onStateChange={({ open: next }) => setOpen(next)}
        actions={actions.map((action) => ({
          icon: action.icon,
          label: action.label,
          size: 'medium' as const,
          color: colors.text,
          labelTextColor: colors.text,
          style: styles.action,
          containerStyle: styles.action,
          onPress: () => {
            setOpen(false);
            action.onPress();
          },
        }))}
      />
    </Portal>
  );
}

const styles = StyleSheet.create({
  fab: {
    backgroundColor: colors.accent,
  },
  action: {
    backgroundColor: colors.surface,
  },
});
