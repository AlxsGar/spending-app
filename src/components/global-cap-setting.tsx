import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CapFields } from '@/components/cap-fields';
import { AppButton, AppText, SettingRow } from '@/components/ui';
import { formatCentsForInput } from '@/services/money';
import { DEFAULT_CAP_PERIOD, validateCapInput } from '@/services/soft-caps';
import type { CapInput } from '@/services/soft-caps';
import { useCaps, useCapsStore } from '@/stores/caps-store';
import { useDefaultCurrency } from '@/stores/default-currency';

// Deliberate deviation from the other Settings rows, which apply on change: this
// one has an explicit Save button. A typed amount that has to be validated should
// not save on blur or on every keystroke, and the user should know exactly when
// the cap took effect.
//
// Settings row for the global cap: an amount in the default currency (empty
// means no cap), a period and a Save button. The draft lives here until it is
// saved; after a save the row shows what the database now holds.
export function GlobalCapSetting() {
  const { t } = useTranslation();
  const { caps, status, reload } = useCaps();
  const currency = useDefaultCurrency();
  const setGlobal = useCapsStore((state) => state.setGlobal);
  const saveError = useCapsStore((state) => state.saveError);
  const [draft, setDraft] = useState<CapInput | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const label = t('settings.globalCap');
  if (status === 'error') {
    return (
      <SettingRow label={label}>
        <AppText color="alert">{t('common.loadError')}</AppText>
        <AppButton label={t('common.retry')} variant="secondary" onPress={() => void reload()} />
      </SettingRow>
    );
  }
  if (status !== 'ready' || currency === null) return null;

  const stored = caps.find((cap) => cap.accountId === null);
  const value: CapInput =
    draft ??
    (stored
      ? { amount: formatCentsForInput(stored.amountCents, currency), period: stored.period }
      : { amount: '', period: DEFAULT_CAP_PERIOD });

  const save = async () => {
    setAttempted(true);
    if (validateCapInput(value, currency)) return;
    setSaving(true);
    const ok = await setGlobal(value, currency);
    setSaving(false);
    if (ok) {
      setDraft(null);
      setAttempted(false);
    }
  };

  return (
    <SettingRow label={label} errorText={saveError ? t('settings.globalCapSaveError') : undefined}>
      <CapFields
        value={value}
        onChange={setDraft}
        currency={currency}
        showError={attempted}
        helperText={t('settings.globalCapHint', { currency })}
      />
      <AppButton
        label={t('settings.globalCapSave')}
        variant="secondary"
        onPress={() => void save()}
        disabled={saving}
      />
    </SettingRow>
  );
}
