import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppButton, AppText, OptionPicker, TextField, useScrollEndStyle } from '@/components/ui';
import { createOnce } from '@/components/ui/once';
import type { Account } from '@/services/accounts';
import { formatLongDate } from '@/services/format-date';
import { formatCentsForInput, parseAmountToCents } from '@/services/money';
import { dayToDate } from '@/services/recurring';
import type { Day, RecurringPayment } from '@/services/recurring';
import { spacing } from '@/theme';

type Props = {
  payment: RecurringPayment;
  // The occurrence being paid.
  occurrence: Day;
  accounts: Account[];
  // The currency of a payment with no account.
  defaultCurrency: string;
  // Resolves true when the payment was recorded (the screen then navigates
  // away), false when it failed.
  onSubmit: (accountId: number, amountCents: number) => Promise<boolean>;
};

const AMOUNT_CODES = {
  empty: 'amountRequired',
  invalid: 'amountInvalid',
  notPositive: 'amountNotPositive',
  tooLarge: 'amountTooLarge',
  decimalsNotAllowed: 'amountDecimalsNotAllowed',
  tooManyDecimals: 'amountTooManyDecimals',
} as const;

// Pay now: the amount (prefilled, editable) and the account (the payment's own
// by default, empty when it has none) for this occurrence. The date is today and
// cannot be changed. The payment's stored amount and account are not touched.
export function RecurringPayForm({
  payment,
  occurrence,
  accounts,
  defaultCurrency,
  onSubmit,
}: Props) {
  const { t, i18n } = useTranslation();
  const scrollEnd = useScrollEndStyle();
  const own = accounts.find((item) => item.id === payment.accountId);
  const [accountId, setAccountId] = useState<number | null>(own ? own.id : null);
  const [amount, setAmount] = useState(() =>
    formatCentsForInput(payment.amountCents, own ? own.currency : defaultCurrency),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set synchronously: a second tap arrives before a re-render could disable the
  // button.
  const [inFlight] = useState(createOnce);

  const account = accounts.find((item) => item.id === accountId);
  // Until an account is chosen the amount is read in the payment's own currency.
  const currency = account ? account.currency : defaultCurrency;
  const parsed = parseAmountToCents(amount, currency);
  const amountError = submitted && !parsed.ok ? parsed.code : null;
  const accountError = submitted && !account;

  const save = async () => {
    setSubmitted(true);
    if (!parsed.ok || !account) return;
    if (!inFlight.tryStart()) return;
    setSaving(true);
    setFailed(false);
    const ok = await onSubmit(account.id, parsed.cents);
    // On success the screen navigates away, so only reset on failure.
    if (!ok) {
      inFlight.reset();
      setSaving(false);
      setFailed(true);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, scrollEnd]}>
      <View style={styles.heading}>
        <AppText variant="title">{payment.name}</AppText>
        <AppText color="textSecondary">
          {t('recurring.payNow.occurrence', {
            date: formatLongDate(dayToDate(occurrence), i18n.language),
          })}
        </AppText>
      </View>
      <TextField
        label={t('recurring.amountLabel')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        suffix={currency}
        errorText={amountError ? t(`recurring.errors.${AMOUNT_CODES[amountError]}`) : undefined}
      />
      <OptionPicker
        value={accountId === null ? '' : String(accountId)}
        options={accounts.map((item) => ({ value: String(item.id), label: item.name }))}
        onChange={(next) => setAccountId(Number(next))}
        label={t('recurring.accountLabel')}
        title={t('recurring.accountPicker')}
        cancelLabel={t('common.cancel')}
        errorText={accountError ? t('transactions.errors.accountRequired') : undefined}
      />
      <View style={styles.date}>
        <AppText variant="bodyStrong">{t('transactions.dateLabel')}</AppText>
        <AppText color="textSecondary">{t('transactions.today')}</AppText>
      </View>
      {failed ? <AppText color="alert">{t('recurring.pay.error')}</AppText> : null}
      <AppButton
        label={t('recurring.payNow.save')}
        onPress={() => void save()}
        disabled={saving}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  heading: {
    gap: spacing.xs,
  },
  date: {
    gap: spacing.sm,
  },
});
