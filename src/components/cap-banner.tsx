import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WHEN_KEYS } from '@/components/cap-labels';
import { ActionDialog, AlertBanner, ListRow } from '@/components/ui';
import { formatMoney } from '@/services/money';
import { dayToDate } from '@/services/recurring';
import { exceededCaps, headlineCap } from '@/services/soft-caps';
import type { ExceededCap } from '@/services/soft-caps';
import { useAccounts } from '@/stores/accounts-store';
import { useCaps, useCapsStore } from '@/stores/caps-store';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useToday } from '@/stores/today';
import { useTransactions } from '@/stores/transactions-store';

// Home's warning: one compact banner while any cap is exceeded, nothing when
// none is, and the same size however many are. It shows the headline cap (the
// global cap if exceeded, else the one furthest over by percentage) and, with
// more, "and N more caps exceeded". Pressing it, also with a single cap, opens a
// dialog listing every exceeded cap; a row opens that account, or Settings for
// the global cap. Not dismissable. It recomputes when the transactions,
// accounts or caps change, and when the local day changes (a new day, week or
// month can clear a cap).
export function CapBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accounts } = useAccounts();
  const { transactions } = useTransactions();
  const { caps, status, reload } = useCaps();
  const defaultCurrency = useDefaultCurrency();
  const today = useToday();
  const focused = useIsFocused();
  const [listOpen, setListOpen] = useState(false);

  // Home regaining focus retries a failed caps load (once per focus, so a load
  // that keeps failing never loops). The banner stays hidden while errored.
  useEffect(() => {
    if (focused && useCapsStore.getState().status === 'error') void reload();
    // Only a change of focus retries; reload is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const exceeded = useMemo(() => {
    if (defaultCurrency === null || status === 'error') return [];
    return exceededCaps({
      caps,
      accounts,
      transactions,
      defaultCurrency,
      now: dayToDate(today),
    });
  }, [caps, status, accounts, transactions, defaultCurrency, today]);

  // Nothing exceeded closes the list, so it cannot reopen by itself the next
  // time a cap is exceeded (the early return below only hides it). Adjusting
  // state during render is React's way to reset state from a changed value; it
  // re-renders once, before anything is shown.
  if (exceeded.length === 0 && listOpen) setListOpen(false);

  const headline = headlineCap(exceeded);
  if (headline === null) return null;

  const nameOf = (item: ExceededCap) =>
    item.accountId === null
      ? t('caps.globalName')
      : (accounts.find((account) => account.id === item.accountId)?.name ?? '');
  const values = (item: ExceededCap) => ({
    spent: formatMoney(item.spentCents, item.currency),
    cap: formatMoney(item.capCents, item.currency),
    when: t(WHEN_KEYS[item.period]),
  });

  const headlineValues = values(headline);
  const lines = [
    headline.accountId === null
      ? t('caps.bannerGlobal', headlineValues)
      : t('caps.bannerAccount', { ...headlineValues, name: nameOf(headline) }),
  ];
  if (exceeded.length > 1) lines.push(t('caps.bannerMore', { count: exceeded.length - 1 }));

  const open = (item: ExceededCap) => {
    // Unmounted in the same update as the navigation, so no dialog is left open.
    setListOpen(false);
    if (item.accountId === null) router.push('/settings');
    else router.push({ pathname: '/account/[id]', params: { id: item.accountId } });
  };

  return (
    <>
      <AlertBanner
        lines={lines}
        onPress={() => setListOpen(true)}
        accessibilityLabel={lines.join('. ')}
        accessibilityHint={t('caps.bannerHint')}
      />
      {/* Mounted only while open (no fade-out), so a row press closes it and
          navigates in one update and no dialog fades over the next screen. */}
      {listOpen ? (
        <ActionDialog
          visible
          title={t('caps.listTitle')}
          onDismiss={() => setListOpen(false)}
          scroll
          actions={[{ label: t('common.done'), tone: 'muted', onPress: () => setListOpen(false) }]}
        >
          {exceeded.map((item) => {
            const row = {
              ...values(item),
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
      ) : null}
    </>
  );
}
