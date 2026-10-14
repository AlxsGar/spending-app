import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  DateField,
  OptionPicker,
  SegmentedControl,
  TextField,
} from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatLongDate } from '@/services/format-date';
import { relativeDay } from '@/services/day-groups';
import {
  NOTE_MAX_LENGTH,
  validateTransactionInput,
} from '@/services/transactions';
import type { TransactionInput, TransactionKind } from '@/services/transactions';
import { spacing } from '@/theme';

type Props = {
  accounts: Account[];
  initialAccountId: number;
  // Prefill for editing; a new transaction starts as an expense today.
  initial?: { kind: TransactionKind; amount: string; date: Date; note: string };
  // Extra content under the save button (the edit screen's delete action).
  children?: ReactNode;
  // Resolves true when the transaction was saved.
  onSubmit: (input: TransactionInput) => Promise<boolean>;
};

const AMOUNT_ERRORS = [
  'amountRequired',
  'amountInvalid',
  'amountNotPositive',
  'amountTooLarge',
  'amountDecimalsNotAllowed',
  'amountTooManyDecimals',
];

export function TransactionForm({
  accounts,
  initialAccountId,
  initial,
  children,
  onSubmit,
}: Props) {
  const { t, i18n } = useTranslation();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [kind, setKind] = useState<TransactionKind>(initial?.kind ?? 'expense');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [date, setDate] = useState(() => initial?.date ?? new Date());
  const [note, setNote] = useState(initial?.note ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const account = accounts.find((item) => item.id === accountId);
  const input: TransactionInput = { accountId, kind, amount, date, note };
  const validate = () => validateTransactionInput(input, account ? account.currency : null);

  // Errors appear after the first save attempt, then follow the input.
  const code = submitted ? validate() : null;

  const save = async () => {
    setSubmitted(true);
    if (validate()) return;
    setSaving(true);
    setFailed(false);
    const ok = await onSubmit(input);
    // On success the screen navigates away, so only reset on failure.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
  };

  const errorFor = (codes: string[]) =>
    code && codes.includes(code) ? t(`transactions.errors.${code}`) : undefined;
  // "Now" is read when rendering and when validating or opening the picker,
  // never captured at mount, so a form left open past midnight follows the
  // new day. Validation and the picker both use the real clock.
  const relative = relativeDay(date, new Date());
  const dateText = relative ? t(`transactions.${relative}`) : formatLongDate(date, i18n.language);
  const accountError = errorFor(['accountRequired', 'accountNotFound', 'invalidKind']);
  const dateError = errorFor(['invalidDate', 'dateInFuture']);

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <SegmentedControl
        value={kind}
        onChange={setKind}
        options={[
          { value: 'expense', label: t('transactions.expense') },
          { value: 'income', label: t('transactions.income') },
        ]}
      />
      <TextField
        label={t('transactions.amountLabel')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        suffix={account?.currency}
        errorText={errorFor(AMOUNT_ERRORS)}
      />
      <OptionPicker
        value={String(accountId)}
        options={accounts.map((item) => ({ value: String(item.id), label: item.name }))}
        onChange={(next) => setAccountId(Number(next))}
        label={t('transactions.accountLabel')}
        title={t('transactions.accountPicker')}
        cancelLabel={t('common.cancel')}
        errorText={accountError}
      />
      <View style={styles.section}>
        <AppText variant="bodyStrong">{t('transactions.dateLabel')}</AppText>
        <DateField
          value={date}
          onChange={setDate}
          locale={i18n.language}
          confirmLabel={t('common.done')}
          cancelLabel={t('common.cancel')}
          accessibilityLabel={t('transactions.dateLabel')}
          displayValue={dateText}
        />
        {dateError ? <AppText color="alert">{dateError}</AppText> : null}
      </View>
      <TextField
        label={t('transactions.noteLabel')}
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX_LENGTH}
        helperText={t('transactions.charCount', { count: note.length, max: NOTE_MAX_LENGTH })}
        errorText={errorFor(['noteTooLong'])}
      />
      {failed ? <AppText color="alert">{t('transactions.saveError')}</AppText> : null}
      <AppButton label={t('transactions.save')} onPress={() => void save()} disabled={saving} />
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
});
