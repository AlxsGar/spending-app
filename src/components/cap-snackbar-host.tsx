import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo } from 'react-native';

import { WHEN_KEYS } from '@/components/cap-labels';
import { AppSnackbar } from '@/components/ui';
import { formatMoney } from '@/services/money';
import { showPendingCapNotice } from '@/stores/cap-crossing';
import { useCapSnackbarStore } from '@/stores/cap-snackbar-store';
import { useCapsDialogStore } from '@/stores/caps-dialog-store';
import { useSuccessStore } from '@/stores/success-store';

// Mounted once near the root, next to SuccessHost. Shows the cap-crossing
// snackbar: a notice waits until the saved card is gone (never on top of it),
// then shows over the screen the user returned to. "View" opens the Caps
// exceeded dialog (see CapsDialogHost).
export function CapSnackbarHost() {
  const { t } = useTranslation();
  const pending = useCapSnackbarStore((state) => state.pending);
  const current = useCapSnackbarStore((state) => state.current);
  const hide = useCapSnackbarStore((state) => state.hide);
  const cardShowing = useSuccessStore((state) => state.current !== null);
  const openList = useCapsDialogStore((state) => state.setOpen);

  useEffect(() => {
    if (pending && !cardShowing) showPendingCapNotice();
  }, [pending, cardShowing]);

  // Keep the last notice so its text stays while the snackbar fades out.
  const [last, setLast] = useState(current);
  if (current && current !== last) setLast(current);

  let message = '';
  if (last) {
    const values = {
      over: formatMoney(last.cap.spentCents - last.cap.capCents, last.cap.currency),
      when: t(WHEN_KEYS[last.cap.period]),
    };
    const main =
      last.cap.accountId === null
        ? t('caps.crossedGlobal', values)
        : t('caps.crossedAccount', { ...values, name: last.name });
    message = last.more > 0 ? `${main} ${t('caps.crossedMore', { count: last.more })}` : main;
  }

  useEffect(() => {
    if (current && message) AccessibilityInfo.announceForAccessibility(message);
    // Announced once per notice, not when the text is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  return (
    <AppSnackbar
      visible={current !== null}
      message={message}
      actionLabel={t('caps.crossedView')}
      actionAccessibilityLabel={t('caps.crossedViewLabel')}
      onAction={() => openList(true)}
      onDismiss={hide}
    />
  );
}
