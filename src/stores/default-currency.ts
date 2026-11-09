import { useEffect, useState } from 'react';

import { FALLBACK_CURRENCY, getDefaultCurrency } from '@/services/accounts';
import type { Currency } from '@/services/accounts';

// The last default currency a screen read, kept in memory so code outside a
// component (the cap-crossing check after a save) can use it without a database
// read. Null until some screen has read it (Home does on every start).
let remembered: Currency | null = null;

export function rememberedDefaultCurrency(): Currency | null {
  return remembered;
}

// Also the way tests seed or clear the value.
export function rememberDefaultCurrency(currency: Currency | null): void {
  remembered = currency;
}

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
        remembered = value;
        if (active) setCurrency(value);
      });
    return () => {
      active = false;
    };
  }, []);

  return currency;
}
