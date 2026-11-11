import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { EraseDataDialog } from '@/components/erase-data-dialog';
import { AppButton, AppText, PinPad } from '@/components/ui';
import { useWaitText } from '@/components/use-wait-text';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH, isValidPin } from '@/services/app-lock';
import { useAppLockStore } from '@/stores/app-lock-store';
import { spacing } from '@/theme';

type Mode = 'unlock' | 'newPin' | 'confirmPin';

// The lock screen: biometrics first (when on), the PIN pad always. "Forgot
// PIN?" sets a new PIN after a biometric check, or, with biometrics off, offers
// to erase all data.
export function LockScreen() {
  const { t } = useTranslation();
  const biometrics = useAppLockStore((state) => state.biometrics);
  const waitUntil = useAppLockStore((state) => state.waitUntil);
  const waitText = useWaitText(waitUntil);

  const [mode, setMode] = useState<Mode>('unlock');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [eraseOpen, setEraseOpen] = useState(false);
  const prompted = useRef(false);

  const promptBiometrics = async () => {
    setError(null);
    await useAppLockStore
      .getState()
      .unlockWithBiometrics(t('lock.biometricPrompt'), t('lock.biometricCancel'));
    // Cancelled or failed: the PIN pad is already there.
  };

  useEffect(() => {
    if (!biometrics || prompted.current) return;
    prompted.current = true;
    void promptBiometrics();
    // Once per lock: the screen mounts each time the app locks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometrics]);

  // The permission to set a new PIN does not outlive this screen.
  useEffect(() => () => useAppLockStore.getState().cancelReset(), []);

  const submitUnlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await useAppLockStore.getState().unlockWithPin(pin);
      if (result.result === 'wrong') setError(t('lock.wrongPin'));
      setPin('');
    } catch (failure) {
      console.error('[app-lock] unlock failed:', failure);
      setError(t('lock.error'));
    } finally {
      setBusy(false);
    }
  };

  const submitNewPin = async () => {
    if (mode === 'newPin') {
      setFirstPin(pin);
      setPin('');
      setError(null);
      setMode('confirmPin');
      return;
    }
    if (pin !== firstPin) {
      setError(t('lock.mismatch'));
      setPin('');
      setFirstPin('');
      setMode('newPin');
      return;
    }
    setBusy(true);
    try {
      await useAppLockStore.getState().resetPin(pin);
    } catch (failure) {
      console.error('[app-lock] could not set the new PIN:', failure);
      setError(t('lock.error'));
      setPin('');
      setMode('newPin');
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    if (!biometrics) {
      setEraseOpen(true);
      return;
    }
    const ok = await useAppLockStore
      .getState()
      .checkBiometricsForReset(t('lock.biometricPrompt'), t('lock.biometricCancel'));
    if (ok) {
      setPin('');
      setMode('newPin');
    } else {
      setError(t('lock.biometricFailed'));
    }
  };

  const unlocking = mode === 'unlock';
  const waiting = unlocking && waitText !== null;
  const title =
    mode === 'unlock'
      ? t('lock.title')
      : mode === 'newPin'
        ? t('lock.newPinTitle')
        : t('lock.confirmPinTitle');
  const hint =
    mode === 'unlock'
      ? t('lock.enterPin')
      : mode === 'newPin'
        ? t('lock.newPinHint', { min: PIN_MIN_LENGTH, max: PIN_MAX_LENGTH })
        : t('lock.confirmPinHint');
  const canSubmit = isValidPin(pin) && !busy && !waiting;

  return (
    <>
      <View style={styles.group}>
        <AppText variant="title" align="center">
          {title}
        </AppText>
        <AppText color="textSecondary" align="center">
          {hint}
        </AppText>
      </View>
      <PinPad
        value={pin}
        onChange={setPin}
        maxLength={PIN_MAX_LENGTH}
        disabled={busy || waiting}
        statusLabel={t('lock.digitsEntered', { count: pin.length })}
        deleteLabel={t('lock.delete')}
      />
      {waiting || error ? (
        <AppText color="alert" align="center" accessibilityLiveRegion="polite">
          {waiting ? waitText : error}
        </AppText>
      ) : null}
      <View style={styles.group}>
        <AppButton
          label={unlocking ? t('lock.unlock') : t('common.continue')}
          disabled={!canSubmit}
          onPress={() => void (unlocking ? submitUnlock() : submitNewPin())}
        />
        {unlocking && biometrics ? (
          <AppButton
            label={t('lock.useBiometrics')}
            variant="secondary"
            disabled={busy}
            onPress={() => void promptBiometrics()}
          />
        ) : null}
        {unlocking ? (
          <AppButton
            label={t('lock.forgot')}
            variant="link"
            disabled={busy}
            onPress={() => void forgot()}
          />
        ) : (
          <AppButton
            label={t('common.cancel')}
            variant="link"
            disabled={busy}
            onPress={() => {
              useAppLockStore.getState().cancelReset();
              setPin('');
              setFirstPin('');
              setError(null);
              setMode('unlock');
            }}
          />
        )}
      </View>
      <EraseDataDialog visible={eraseOpen} onCancel={() => setEraseOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
});
