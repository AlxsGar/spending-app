import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppButton, AppText, PinDialog, SwitchRow } from '@/components/ui';
import { useWaitText } from '@/components/use-wait-text';
import { PIN_MAX_LENGTH, isValidPin } from '@/services/app-lock';
import { useAppLockStore } from '@/stores/app-lock-store';
import { showSuccess } from '@/stores/success-store';

type Kind = 'enable' | 'change' | 'disable';
type Step = 'current' | 'enter' | 'new' | 'repeat';
type Flow = { kind: Kind; step: Step };

// Settings section for the app lock: turn it on (a PIN, entered twice), the
// biometrics switch (only on a device that has them enrolled), change the PIN
// and turn it off (both ask for the current PIN first).
export function AppLockSetting() {
  const { t } = useTranslation();
  const enabled = useAppLockStore((state) => state.enabled);
  const biometrics = useAppLockStore((state) => state.biometrics);
  const biometricsAvailable = useAppLockStore((state) => state.biometricsAvailable);
  const waitUntil = useAppLockStore((state) => state.waitUntil);
  const waitText = useWaitText(waitUntil);

  const [flow, setFlow] = useState<Flow | null>(null);
  const [pin, setPin] = useState('');
  // The PIN typed at the "current" step, and the new PIN typed at "enter"/"new".
  const [current, setCurrent] = useState('');
  const [fresh, setFresh] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const open = (kind: Kind) => {
    setFlow({ kind, step: kind === 'enable' ? 'enter' : 'current' });
    setPin('');
    setCurrent('');
    setFresh('');
    setError(null);
  };
  const close = () => {
    setFlow(null);
    setPin('');
    setCurrent('');
    setFresh('');
    setError(null);
  };
  const goTo = (step: Step) => {
    setFlow((value) => (value ? { ...value, step } : value));
    setPin('');
    setError(null);
  };

  const wrongCurrent = (result: { result: string }) => {
    setPin('');
    setError(result.result === 'wrong' ? t('settings.appLock.wrongPin') : null);
  };

  const submit = async () => {
    if (!flow || busy) return;
    const store = useAppLockStore.getState();
    setBusy(true);
    try {
      if (flow.step === 'current') {
        if (flow.kind === 'disable') {
          const result = await store.disable(pin);
          if (result.result !== 'ok') return wrongCurrent(result);
          close();
          showSuccess({ icon: 'check', tone: 'neutral', message: t('settings.appLock.disabled') });
          return;
        }
        const result = await store.verifyCurrentPin(pin);
        if (result.result !== 'ok') return wrongCurrent(result);
        setCurrent(pin);
        goTo('new');
        return;
      }
      if (flow.step === 'enter' || flow.step === 'new') {
        setFresh(pin);
        goTo('repeat');
        return;
      }
      // Repeat step.
      if (pin !== fresh) {
        setFresh('');
        setPin('');
        setError(t('settings.appLock.mismatch'));
        setFlow({ kind: flow.kind, step: flow.kind === 'enable' ? 'enter' : 'new' });
        return;
      }
      if (flow.kind === 'enable') {
        await store.enable(pin);
        close();
        showSuccess({ icon: 'check', tone: 'neutral', message: t('settings.appLock.saved') });
        return;
      }
      const result = await store.changePin(current, pin);
      if (result.result !== 'ok') {
        // The old PIN no longer checks out (for example a wait started): start over.
        setFlow({ kind: 'change', step: 'current' });
        setCurrent('');
        setFresh('');
        return wrongCurrent(result);
      }
      close();
      showSuccess({ icon: 'check', tone: 'neutral', message: t('settings.appLock.changed') });
    } catch (failure) {
      console.error('[app-lock] could not save the lock settings:', failure);
      setPin('');
      setError(t('settings.appLock.error'));
    } finally {
      setBusy(false);
    }
  };

  const toggleBiometrics = async (on: boolean) => {
    setSwitchError(null);
    try {
      const ok = await useAppLockStore
        .getState()
        .setBiometrics(on, t('lock.biometricPrompt'), t('lock.biometricCancel'));
      if (!ok) setSwitchError(t('settings.appLock.biometricsError'));
    } catch (failure) {
      console.error('[app-lock] could not change biometrics:', failure);
      setSwitchError(t('settings.appLock.error'));
    }
  };

  const step = flow?.step ?? 'enter';
  const title =
    step === 'current'
      ? t('settings.appLock.currentTitle')
      : step === 'repeat'
        ? t('settings.appLock.repeatTitle')
        : step === 'new'
          ? t('settings.appLock.newTitle')
          : t('settings.appLock.enableTitle');
  const message =
    step === 'current'
      ? flow?.kind === 'disable'
        ? t('settings.appLock.currentHintDisable')
        : t('settings.appLock.currentHintChange')
      : step === 'repeat'
        ? t('settings.appLock.repeatHint')
        : t('settings.appLock.enableHint');
  const last = step === 'repeat' || (step === 'current' && flow?.kind === 'disable');
  const confirmLabel =
    flow?.kind === 'disable' && step === 'current'
      ? t('settings.appLock.turnOff')
      : last
        ? t('settings.appLock.confirm')
        : t('settings.appLock.next');
  const waiting = step === 'current' && waitText !== null;

  return (
    <>
      <SwitchRow
        label={t('settings.appLock.title')}
        description={t('settings.appLock.hint')}
        value={enabled}
        onChange={(on) => open(on ? 'enable' : 'disable')}
      />
      {enabled && biometricsAvailable ? (
        <SwitchRow
          label={t('settings.appLock.biometrics')}
          description={t('settings.appLock.biometricsHint')}
          value={biometrics}
          onChange={(on) => void toggleBiometrics(on)}
        />
      ) : null}
      {enabled ? (
        <AppButton
          label={t('settings.appLock.changePin')}
          variant="secondary"
          onPress={() => open('change')}
        />
      ) : null}
      {switchError ? <AppText color="alert">{switchError}</AppText> : null}
      <PinDialog
        visible={flow !== null}
        busy={busy}
        title={title}
        message={message}
        value={pin}
        onChange={setPin}
        maxLength={PIN_MAX_LENGTH}
        canConfirm={isValidPin(pin) && !waiting}
        errorText={waiting ? waitText : error}
        confirmLabel={confirmLabel}
        cancelLabel={t('common.cancel')}
        statusLabel={t('lock.digitsEntered', { count: pin.length })}
        deleteLabel={t('lock.delete')}
        onConfirm={() => void submit()}
        onCancel={close}
      />
    </>
  );
}
