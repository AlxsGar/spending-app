import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { WHEN_KEYS } from '@/components/cap-labels';
import { useExceededCaps } from '@/components/use-exceeded-caps';
import { ActionDialog, ListRow } from '@/components/ui';
import { formatMoney } from '@/services/money';
import type { ExceededCap } from '@/services/soft-caps';
import { useCapsDialogStore } from '@/stores/caps-dialog-store';

// The "Caps exceeded" dialog: every exceeded cap with its amount over. A row
// closes the dialog and opens that account, or Settings for the global cap.
// Mounted only while open (no fade-out), so a row press closes it and navigates
// in one update and no dialog fades over the next screen.
function CapsExceededDialog() {
  const { t } = useTranslation();
  const router = useRouter();
  const { exceeded, accounts, ready } = useExceededCaps();
  const setOpen = useCapsDialogStore((state) => state.setOpen);

  // Nothing exceeded closes it, so it cannot reopen by itself the next time a
  // cap is exceeded. Not before the data is read: the first render is empty.
  const empty = exceeded.length === 0;
  useEffect(() => {
    if (ready && empty) setOpen(false);
  }, [ready, empty, setOpen]);
  if (empty) return null;

  const nameOf = (item: ExceededCap) =>
    item.accountId === null
      ? t('caps.globalName')
      : (accounts.find((account) => account.id === item.accountId)?.name ?? '');

  const open = (item: ExceededCap) => {
    setOpen(false);
    if (item.accountId === null) router.push('/settings');
    else router.push({ pathname: '/account/[id]', params: { id: item.accountId } });
  };

  return (
    <ActionDialog
      visible
      title={t('caps.listTitle')}
      onDismiss={() => setOpen(false)}
      scroll
      actions={[{ label: t('common.done'), tone: 'muted', onPress: () => setOpen(false) }]}
    >
      {exceeded.map((item) => {
        const row = {
          spent: formatMoney(item.spentCents, item.currency),
          cap: formatMoney(item.capCents, item.currency),
          when: t(WHEN_KEYS[item.period]),
          over: formatMoney(item.spentCents - item.capCents, item.currency),
        };
        const name = nameOf(item);
        return (
          <ListRow
            key={item.accountId ?? 'global'}
            icon={
              item.accountId === null
                ? 'earth'
                : (accounts.find((account) => account.id === item.accountId)?.icon ?? 'alert')
            }
            title={name}
            description={t('caps.listRow', row)}
            accessibilityLabel={t('caps.listRowLabel', { ...row, name })}
            onPress={() => open(item)}
          />
        );
      })}
    </ActionDialog>
  );
}

// Mounted once near the root (next to SuccessHost). Renders nothing, and reads
// no data, until the dialog is opened (Home's banner or the cap snackbar).
export function CapsDialogHost() {
  const open = useCapsDialogStore((state) => state.open);
  return open ? <CapsExceededDialog /> : null;
}
