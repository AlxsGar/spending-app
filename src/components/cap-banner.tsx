import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { WHEN_KEYS } from '@/components/cap-labels';
import { useExceededCaps } from '@/components/use-exceeded-caps';
import { AlertBanner } from '@/components/ui';
import { formatMoney } from '@/services/money';
import { headlineCap } from '@/services/soft-caps';
import { useCapsDialogStore } from '@/stores/caps-dialog-store';
import { useCapsStore } from '@/stores/caps-store';

// Home's warning: one compact banner while any cap is exceeded, nothing when
// none is, and the same size however many are. It shows the headline cap (the
// global cap if exceeded, else the one furthest over by percentage) and, with
// more, "and N more caps exceeded". Pressing it, also with a single cap, opens
// the "Caps exceeded" dialog (see CapsDialogHost, mounted at the root, which
// lists every exceeded cap). Not dismissable. It recomputes when the
// transactions, accounts or caps change, and when the local day changes.
export function CapBanner() {
  const { t } = useTranslation();
  const { exceeded, accounts, reload } = useExceededCaps();
  const focused = useIsFocused();
  const openList = useCapsDialogStore((state) => state.setOpen);

  // Home regaining focus retries a failed caps load (once per focus, so a load
  // that keeps failing never loops). The banner stays hidden while errored.
  useEffect(() => {
    if (focused && useCapsStore.getState().status === 'error') void reload();
    // Only a change of focus retries; reload is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const headline = headlineCap(exceeded);
  if (headline === null) return null;

  const values = {
    spent: formatMoney(headline.spentCents, headline.currency),
    cap: formatMoney(headline.capCents, headline.currency),
    when: t(WHEN_KEYS[headline.period]),
  };
  const name =
    headline.accountId === null
      ? ''
      : (accounts.find((account) => account.id === headline.accountId)?.name ?? '');
  const lines = [
    headline.accountId === null
      ? t('caps.bannerGlobal', values)
      : t('caps.bannerAccount', { ...values, name }),
  ];
  if (exceeded.length > 1) lines.push(t('caps.bannerMore', { count: exceeded.length - 1 }));

  return (
    <AlertBanner
      lines={lines}
      onPress={() => openList(true)}
      accessibilityLabel={lines.join('. ')}
      accessibilityHint={t('caps.bannerHint')}
    />
  );
}
