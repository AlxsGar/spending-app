import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
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
};

export function AccountForm({ initial, onSubmit }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [currency, setCurrency] = useState(initial.currency);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Errors appear after the first save attempt, then follow the input.
  const code = submitted ? validateAccountInput({ name, icon, currency }) : null;

  const save = async () => {
    setSubmitted(true);
    if (validateAccountInput({ name, icon, currency })) return;
    setSaving(true);
    setFailed(false);
    const ok = await onSubmit({ name, icon, currency });
    // On success the screen navigates away, so only reset on failure.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
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
        <View style={styles.section}>
          <AppText variant="bodyStrong">{t('accounts.currencyLabel')}</AppText>
          <CurrencyPicker
            value={currency}
            options={CURRENCIES}
            onChange={setCurrency}
            accessibilityLabel={t('accounts.currencyPicker')}
            title={t('accounts.currencyPicker')}
            cancelLabel={t('common.cancel')}
          />
        </View>
        {failed ? <AppText color="alert">{t('accounts.saveError')}</AppText> : null}
        <AppButton label={t('accounts.save')} onPress={() => void save()} disabled={saving} />
      </ScrollView>
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
