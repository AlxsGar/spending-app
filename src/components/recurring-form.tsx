import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ReminderChips } from '@/components/reminder-chips';
import {
  AppButton,
  AppText,
  DateField,
  OptionPicker,
  SwitchRow,
  TextField,
  useScrollEndStyle,
} from '@/components/ui';
import type { Account } from '@/services/accounts';
import { formatLongDate } from '@/services/format-date';
import {
  INTERVAL_MAX,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  UNITS,
  dayToDate,
  isOnceOnly,
  isUnit,
  parseInterval,
  startDateFloor,
  toDay,
  validateRecurringInput,
} from '@/services/recurring';
import type { Day, RecurringInput, Unit } from '@/services/recurring';
import {
  useNotificationPermission,
  useNotificationPermissionStore,
} from '@/stores/notification-permission';
import { spacing } from '@/theme';

type Props = {
  accounts: Account[];
  // null: no account ("Not set"), the default for a new payment.
  initialAccountId: number | null;
  // The currency of a payment with no account.
  defaultCurrency: string;
  // Prefill for editing; a new payment starts empty: every 1 month from today.
  initial?: {
    name: string;
    amount: string;
    interval: string;
    unit: Unit;
    startDate: Day;
    endDate: Day | null;
    note: string;
    active: boolean;
  };
  // Editing a payment that was paid or skipped: its last handled occurrence.
  // `initial.startDate` is then that day, and the schedule counts from it.
  lastConfirmedAt?: Day | null;
  // The reminder choices to start with: the Settings default for a new payment,
  // the stored ones when editing ("3,1,0"; empty means none).
  initialReminders: string;
  // Extra content under the save button (the edit screen's delete action).
  children?: ReactNode;
  // Resolves true when the payment was saved.
  onSubmit: (input: RecurringInput) => Promise<boolean>;
};

const AMOUNT_ERRORS = [
  'amountRequired',
  'amountInvalid',
  'amountNotPositive',
  'amountTooLarge',
  'amountDecimalsNotAllowed',
  'amountTooManyDecimals',
];

export function RecurringForm({
  accounts,
  initialAccountId,
  defaultCurrency,
  initial,
  lastConfirmedAt = null,
  initialReminders,
  children,
  onSubmit,
}: Props) {
  const { t, i18n } = useTranslation();
  const scrollEnd = useScrollEndStyle();
  const [name, setName] = useState(initial?.name ?? '');
  const [accountId, setAccountId] = useState(initialAccountId);
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [interval, setInterval] = useState(initial?.interval ?? '1');
  const [unit, setUnit] = useState<string>(initial?.unit ?? 'month');
  const [startDate, setStartDate] = useState<Day>(() => initial?.startDate ?? toDay(new Date()));
  const [endDate, setEndDate] = useState<Day | null>(initial?.endDate ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [reminders, setReminders] = useState(initialReminders);
  const permission = useNotificationPermission();
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const account = accounts.find((item) => item.id === accountId);
  // The chosen account's currency, the default one with no account, null when
  // the chosen account is gone.
  const currency = accountId === null ? defaultCurrency : (account?.currency ?? null);
  const input: RecurringInput = {
    accountId,
    name,
    amount,
    interval,
    unit,
    startDate,
    endDate,
    note,
    active,
    notifyDaysBefore: reminders,
  };
  // "Today" is read each time, never captured at mount, so a form left open
  // past midnight follows the new day.
  const validate = () =>
    validateRecurringInput(
      input,
      currency,
      toDay(new Date()),
      initial?.startDate,
      lastConfirmedAt,
    );

  // Errors appear after the first save attempt, then follow the input.
  const code = submitted ? validate() : null;

  const save = async () => {
    setSubmitted(true);
    if (validate()) return;
    setSaving(true);
    setFailed(false);
    // The first save with any reminder asks for notification permission (the
    // system only asks while it is undecided). A refusal never blocks saving:
    // the reminders are saved and the note below says they will not fire.
    if (reminders !== '') await useNotificationPermissionStore.getState().request();
    const ok = await onSubmit(input);
    // On success the screen navigates away, so only reset on failure.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
  };

  const errorFor = (codes: string[]) =>
    code && codes.includes(code) ? t(`recurring.errors.${code}`) : undefined;

  const parsedInterval = parseInterval(interval);
  const unitCount = parsedInterval.ok ? parsedInterval.interval : 2;
  const unitLabel = (value: Unit) => {
    const keys = {
      day: 'recurring.unitDay',
      week: 'recurring.unitWeek',
      month: 'recurring.unitMonth',
      year: 'recurring.unitYear',
    } as const;
    return t(keys[value], { count: unitCount });
  };

  const dayText = (value: Day) =>
    value === toDay(new Date())
      ? t('transactions.today')
      : formatLongDate(dayToDate(value), i18n.language);
  // The picker never offers a past day, nor one on or before the last handled
  // occurrence. An original past start date (or the handled occurrence) stays
  // only while it is left unchanged (the field keeps showing it).
  const startFloor = dayToDate(startDateFloor(lastConfirmedAt, toDay(new Date())));
  const startErrors = ['invalidStartDate', 'startDateInPast', 'startDateNotAfterHandled'];
  const onceOnly =
    endDate !== null &&
    parsedInterval.ok &&
    isUnit(unit) &&
    endDate >= startDate &&
    isOnceOnly({ interval: parsedInterval.interval, unit, startDate, endDate });

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, scrollEnd]}>
      <TextField
        label={t('recurring.nameLabel')}
        value={name}
        onChangeText={setName}
        maxLength={NAME_MAX_LENGTH}
        helperText={t('recurring.charCount', { count: name.length, max: NAME_MAX_LENGTH })}
        errorText={errorFor(['nameRequired', 'nameTooLong'])}
      />
      <OptionPicker
        value={accountId === null ? '' : String(accountId)}
        options={[
          { value: '', label: t('recurring.noAccount') },
          ...accounts.map((item) => ({ value: String(item.id), label: item.name })),
        ]}
        onChange={(next) => setAccountId(next === '' ? null : Number(next))}
        label={t('recurring.accountLabel')}
        title={t('recurring.accountPicker')}
        cancelLabel={t('common.cancel')}
        errorText={errorFor(['accountNotFound'])}
      />
      <TextField
        label={t('recurring.amountLabel')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        suffix={currency ?? undefined}
        errorText={errorFor(AMOUNT_ERRORS)}
      />
      <View style={styles.repeat}>
        <View style={styles.interval}>
          <TextField
            label={t('recurring.intervalLabel')}
            value={interval}
            onChangeText={setInterval}
            keyboardType="number-pad"
            maxLength={String(INTERVAL_MAX).length}
            errorText={errorFor(['intervalRequired', 'intervalInvalid', 'intervalOutOfRange'])}
          />
        </View>
        <View style={styles.unit}>
          <OptionPicker
            value={unit}
            options={UNITS.map((value) => ({ value, label: unitLabel(value) }))}
            onChange={setUnit}
            label={t('recurring.unitLabel')}
            title={t('recurring.unitPicker')}
            cancelLabel={t('common.cancel')}
            errorText={errorFor(['invalidUnit'])}
          />
        </View>
      </View>
      <View style={styles.section}>
        <AppText variant="bodyStrong">{t('recurring.startDateLabel')}</AppText>
        <DateField
          value={dayToDate(startDate)}
          onChange={(picked) => setStartDate(toDay(picked))}
          locale={i18n.language}
          confirmLabel={t('common.done')}
          cancelLabel={t('common.cancel')}
          accessibilityLabel={t('recurring.startDateLabel')}
          displayValue={dayText(startDate)}
          allowFuture
          minimumDate={startFloor}
        />
        {lastConfirmedAt !== null ? (
          <AppText color="textSecondary">{t('recurring.startDateHandledHint')}</AppText>
        ) : null}
        {errorFor(startErrors) ? <AppText color="alert">{errorFor(startErrors)}</AppText> : null}
      </View>
      <View style={styles.section}>
        <AppText variant="bodyStrong">{t('recurring.endDateLabel')}</AppText>
        <DateField
          value={dayToDate(endDate ?? startDate)}
          onChange={(picked) => setEndDate(toDay(picked))}
          locale={i18n.language}
          confirmLabel={t('common.done')}
          cancelLabel={t('common.cancel')}
          accessibilityLabel={t('recurring.endDateLabel')}
          displayValue={endDate ? dayText(endDate) : t('recurring.noEndDate')}
          allowFuture
          minimumDate={dayToDate(startDate)}
        />
        {endDate ? (
          <AppButton
            label={t('recurring.clearEndDate')}
            variant="secondary"
            onPress={() => setEndDate(null)}
          />
        ) : null}
        {errorFor(['invalidEndDate', 'endBeforeStart']) ? (
          <AppText color="alert">{errorFor(['invalidEndDate', 'endBeforeStart'])}</AppText>
        ) : null}
        {onceOnly ? <AppText color="textSecondary">{t('recurring.onceOnly')}</AppText> : null}
      </View>
      <TextField
        label={t('recurring.noteLabel')}
        value={note}
        onChangeText={setNote}
        maxLength={NOTE_MAX_LENGTH}
        helperText={t('recurring.charCount', { count: note.length, max: NOTE_MAX_LENGTH })}
        errorText={errorFor(['noteTooLong'])}
      />
      <View style={styles.section}>
        <AppText variant="bodyStrong">{t('reminders.label')}</AppText>
        <ReminderChips value={reminders} onChange={setReminders} />
        {reminders !== '' && permission === 'denied' ? (
          <AppText color="textSecondary">{t('reminders.deniedNote')}</AppText>
        ) : null}
      </View>
      <SwitchRow label={t('recurring.activeLabel')} value={active} onChange={setActive} />
      {failed ? <AppText color="alert">{t('recurring.saveError')}</AppText> : null}
      <AppButton label={t('recurring.save')} onPress={() => void save()} disabled={saving} />
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
  repeat: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  interval: {
    flex: 1,
  },
  unit: {
    flex: 2,
  },
});
