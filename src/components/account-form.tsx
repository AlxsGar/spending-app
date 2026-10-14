import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

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
  validateAccountInput,
} from '@/services/accounts';
import type { AccountInput } from '@/services/accounts';
import { spacing } from '@/theme';

type Props = {
  initial: AccountInput;
  // Resolves true when the account was saved.
  onSubmit: (input: AccountInput) => Promise<boolean>;
  // Transactions the account already has. When above 0, changing the currency
  // asks for confirmation before saving.
  transactionCount?: number;
};

export function AccountForm({ initial, onSubmit, transactionCount = 0 }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [currency, setCurrency] = useState(initial.currency);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Errors appear after the first save attempt, then follow the input.
  const code = submitted ? validateAccountInput({ name, icon, currency }) : null;

  const [confirmingCurrency, setConfirmingCurrency] = useState(false);

  const submit = async () => {
    setSaving(true);
    setFailed(false);
    const ok = await onSubmit({ name, icon, currency });
    // On success the screen navigates away, so only reset on failure.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
  };

  const save = async () => {
    setSubmitted(true);
    if (validateAccountInput({ name, icon, currency })) return;
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
          onChange={setCurrency}
          label={t('accounts.currencyLabel')}
          title={t('accounts.currencyPicker')}
          cancelLabel={t('common.cancel')}
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
