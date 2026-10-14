import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';

import {
  AppButton,
  AppText,
  ConfirmDialog,
  CurrencyPicker,
  IconPicker,
  Screen,
  TextField,
} from '@/components/ui';
import {
  ACCOUNT_ICONS,
  CURRENCIES,
  NAME_MAX_LENGTH,
  parseBalance,
  validateAccountInput,
  validateBalance,
} from '@/services/accounts';
import type { AccountInput } from '@/services/accounts';
import { formatCentsForInput } from '@/services/money';
import { spacing } from '@/theme';

type Props = {
  initial: Omit<AccountInput, 'balance'>;
  // Resolves true when the account was saved.
  onSubmit: (input: AccountInput) => Promise<boolean>;
  // Transactions the account already has. When above 0, changing the currency
  // asks for confirmation before saving.
  transactionCount?: number;
  // Signed cents of the account's current balance. Set when editing: the field
  // becomes "Current balance", prefilled, and is sent only if the user changed
  // it. Left out when creating: the field is the optional "Initial balance".
  currentBalanceCents?: number;
};

// A balance may be negative, so the keyboard needs a minus key. iOS's decimal
// pad has none; "numbers-and-punctuation" has "-", "." and ",". On Android RN's
// "numeric" sets the number class with the signed and decimal flags, so it shows
// "-" and "."; "decimal-pad" is unsigned there. Read at render so tests can
// switch the platform.
const balanceKeyboard = (): KeyboardTypeOptions =>
  Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric';

export function AccountForm({
  initial,
  onSubmit,
  transactionCount = 0,
  currentBalanceCents,
}: Props) {
  const { t } = useTranslation();
  const editing = currentBalanceCents !== undefined;
  // What the balance field starts with: the shown balance when editing, with a
  // leading "-" when negative. The balance in cents is snapshotted too: the
  // field text is frozen at mount, so "changed" must compare against the same
  // moment, not the live prop.
  const [prefillCents] = useState(currentBalanceCents);
  const [prefill] = useState(() =>
    editing
      ? `${currentBalanceCents < 0 ? '-' : ''}${formatCentsForInput(Math.abs(currentBalanceCents), initial.currency)}`
      : '',
  );
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [currency, setCurrency] = useState(initial.currency);
  const [balanceText, setBalanceText] = useState(prefill);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // The balance to send, or undefined for "leave the balance alone" (editing
  // and not changed) or "no initial balance" (creating and empty). Unchanged
  // means the same text, or a value that parses to the same cents ("500" for
  // "500.00", or "-0" for 0).
  let balance: string | undefined = balanceText;
  if (editing) {
    const parsed = parseBalance(balanceText, currency);
    if (balanceText === prefill || (parsed.ok && parsed.cents === prefillCents)) {
      balance = undefined;
    }
  } else if (balanceText.trim().length === 0) {
    balance = undefined;
  }
  const mode = editing ? 'update' : 'create';
  const input: AccountInput = { name, icon, currency, balance };

  // Errors appear after the first save attempt, then follow the input. The
  // balance error also appears as soon as the currency changes, because a
  // typed amount can stop being valid (decimals in JPY).
  const code = submitted ? validateAccountInput(input, mode) : null;
  const balanceCode =
    submitted || currencyTouched ? validateBalance(balance, currency, mode) : null;

  const [confirmingCurrency, setConfirmingCurrency] = useState(false);

  const submit = async () => {
    setSaving(true);
    setFailed(false);
    const ok = await onSubmit(input);
    // On success the screen navigates away, so only reset on failure.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
  };

  const save = async () => {
    setSubmitted(true);
    if (validateAccountInput(input, mode)) return;
    if (currency !== initial.currency && transactionCount > 0) {
      // The currency picker is already closed here, so this is the only dialog.
      setConfirmingCurrency(true);
      return;
    }
    await submit();
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <TextField
          label={t('accounts.nameLabel')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX_LENGTH}
          helperText={t('accounts.charCount', {
            count: name.length,
            max: NAME_MAX_LENGTH,
          })}
          errorText={
            code === 'nameRequired' || code === 'nameTooLong'
              ? t(`accounts.errors.${code}`)
              : undefined
          }
        />
        <View style={styles.section}>
          <AppText variant="bodyStrong">{t('accounts.iconLabel')}</AppText>
          <IconPicker
            value={icon}
            onChange={setIcon}
            options={ACCOUNT_ICONS.map((value) => ({
              value,
              label: t(`accounts.icons.${value}`),
            }))}
          />
        </View>
        <CurrencyPicker
          value={currency}
          options={CURRENCIES}
          onChange={(next) => {
            setCurrency(next);
            setCurrencyTouched(true);
          }}
          label={t('accounts.currencyLabel')}
          title={t('accounts.currencyPicker')}
          cancelLabel={t('common.cancel')}
        />
        <TextField
          label={t(editing ? 'accounts.currentBalanceLabel' : 'accounts.initialBalanceLabel')}
          value={balanceText}
          onChangeText={setBalanceText}
          keyboardType={balanceKeyboard()}
          suffix={currency}
          errorText={balanceCode ? t(`accounts.errors.${balanceCode}`) : undefined}
        />
        {failed ? <AppText color="alert">{t('accounts.saveError')}</AppText> : null}
        <AppButton label={t('accounts.save')} onPress={() => void save()} disabled={saving} />
      </ScrollView>
      <ConfirmDialog
        visible={confirmingCurrency}
        title={t('accounts.currencyChangeTitle')}
        message={t('accounts.currencyChangeMessage', {
          count: transactionCount,
          from: initial.currency,
          to: currency,
        })}
        confirmLabel={t('accounts.currencyChangeConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          setConfirmingCurrency(false);
          void submit();
        }}
        onCancel={() => setConfirmingCurrency(false)}
      />
    </Screen>
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
