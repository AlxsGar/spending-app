import { useMemo } from 'react';

import { FALLBACK_CURRENCY } from '@/services/accounts';
import type { Account } from '@/services/accounts';
import { projectBalances } from '@/services/projection';
import type { Projection } from '@/services/projection';
import { useDefaultCurrency } from '@/stores/default-currency';
import { useRecurring } from '@/stores/recurring-store';
import { useToday } from '@/stores/today';

// The end-of-month projection (see services/projection.ts), derived from the
// balances, the recurring payments and the local day, so it follows any
// transaction or payment change and the day and month change. Null until the
// recurring payments have loaded (a projection without them would just repeat
// the balance and mislead). `overall` also waits for the default currency.
export function useProjection(
  accounts: Pick<Account, 'id' | 'currency'>[],
  balances: Record<number, number>,
): { perAccount: Projection['perAccount'] | null; overall: Projection['overall'] | null } {
  const { payments, status } = useRecurring();
  const today = useToday();
  const defaultCurrency = useDefaultCurrency();

  const projection = useMemo(
    () =>
      status === 'ready'
        ? projectBalances({
            accounts,
            balances,
            payments,
            today,
            defaultCurrency: defaultCurrency ?? FALLBACK_CURRENCY,
          })
        : null,
    [status, accounts, balances, payments, today, defaultCurrency],
  );
  return {
    perAccount: projection ? projection.perAccount : null,
    overall: projection && defaultCurrency !== null ? projection.overall : null,
  };
}
