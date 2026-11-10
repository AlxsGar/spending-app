import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog, CurrencyPicker, SettingRow } from '@/components/ui';
import { CURRENCIES } from '@/services/accounts';
import type { Currency } from '@/services/accounts';
import { scheduleState, toDay } from '@/services/recurring';
import { useCaps, useCapsStore } from '@/stores/caps-store';
import { useDefaultCurrency, useDefaultCurrencyStore } from '@/stores/default-currency';
import { useRecurring, useRecurringStore } from '@/stores/recurring-store';

// What a change would switch: the global cap and the recurring payments that
// have no account both follow the default currency.
type Pending = { to: Currency; hasCap: boolean; unassigned: number };

// The message key for what is affected. Counts use plural forms (en one/other,
// es one/many/other); the cap-only text has no count.
function messageKey(pending: Pending): string {
  if (pending.unassigned === 0) return 'settings.defaultCurrencyChangeCap';
  return pending.hasCap
    ? 'settings.defaultCurrencyChangeBoth'
    : 'settings.defaultCurrencyChangePayments';
}

// Settings row for the default currency. Applies on pick, like the language
// row, unless a global cap or unassigned recurring payments exist: then it asks
// first. Amounts are never converted.
export function DefaultCurrencySetting() {
  const { t } = useTranslation();
  const current = useDefaultCurrency();
  const saveError = useDefaultCurrencyStore((state) => state.saveError);
  const save = useDefaultCurrencyStore((state) => state.set);
  // Mounting the hooks loads both lists, so they are usually ready at pick time.
  useCaps();
  useRecurring();
  const [pending, setPending] = useState<Pending | null>(null);
  const [checkError, setCheckError] = useState(false);

  if (current === null) return null;

  const pick = async (next: Currency) => {
    if (next === current) return;
    setCheckError(false);
    if (useCapsStore.getState().status !== 'ready') await useCapsStore.getState().load();
    if (useRecurringStore.getState().status !== 'ready') await useRecurringStore.getState().load();
    const caps = useCapsStore.getState();
    const recurring = useRecurringStore.getState();
    if (caps.status !== 'ready' || recurring.status !== 'ready') {
      // Without the lists the dialog could not say what changes, so do nothing
      // and say so (not the save error: nothing was saved).
      setCheckError(true);
      return;
    }
    const hasCap = caps.caps.some((cap) => cap.accountId === null);
    // Inactive payments still count (they can be switched back on); finished
    // ones never show an amount again, so they do not.
    const today = toDay(new Date());
    const unassigned = recurring.payments.filter(
      (payment) =>
        payment.accountId === null && scheduleState(payment, today).kind !== 'finished',
    ).length;
    if (!hasCap && unassigned === 0) {
      await save(next);
      return;
    }
    setPending({ to: next, hasCap, unassigned });
  };

  return (
    <>
      <SettingRow
        label={t('settings.defaultCurrency')}
        errorText={
          saveError
            ? t('settings.defaultCurrencySaveError')
            : checkError
              ? t('settings.defaultCurrencyCheckError')
              : undefined
        }
      >
        <CurrencyPicker
          value={current}
          options={CURRENCIES}
          onChange={(next) => void pick(next)}
          label={t('settings.defaultCurrency')}
          title={t('accounts.currencyPicker')}
          cancelLabel={t('common.cancel')}
        />
      </SettingRow>
      <ConfirmDialog
        visible={pending !== null}
        title={t('settings.defaultCurrencyChangeTitle')}
        message={
          pending
            ? t(messageKey(pending), { count: pending.unassigned, currency: pending.to })
            : ''
        }
        confirmLabel={t('settings.defaultCurrencyChangeConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          const target = pending?.to;
          setPending(null);
          if (target) void save(target);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
