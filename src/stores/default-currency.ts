import { useEffect, useState } from 'react';

import { FALLBACK_CURRENCY, getDefaultCurrency } from '@/services/accounts';
import type { Currency } from '@/services/accounts';

// The default currency (the setting, else MXN), used for recurring payments
// that have no account. Null until it has been read, so a screen can wait and
// never format an amount in the wrong currency.
export function useDefaultCurrency(): Currency | null {
  const [currency, setCurrency] = useState<Currency | null>(null);

  useEffect(() => {
    let active = true;
    getDefaultCurrency()
      .catch(() => FALLBACK_CURRENCY)
      .then((value) => {
        if (active) setCurrency(value);
      });
    return () => {
      active = false;
    };
  }, []);

  return currency;
}
