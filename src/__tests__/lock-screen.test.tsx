import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { LockScreen } from '@/components/lock-screen';
import { en } from '@/i18n/en';
import { enableLock } from '@/services/app-lock';
import { resetAppLockForTests, useAppLockStore } from '@/stores/app-lock-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

jest.mock('@/services/erase-data', () => ({ eraseAllData: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/stores/reload-all', () => ({ reloadAllStores: jest.fn().mockResolvedValue(undefined) }));

const secure = SecureStore as unknown as { __reset: () => void };
const authenticate = LocalAuthentication.authenticateAsync as jest.Mock;

async function typePin(pin: string) {
  for (const digit of pin) fireEvent.press(screen.getByLabelText(digit));
}
const press = async (label: string) => {
  fireEvent.press(screen.getByText(label));
  await act(async () => {});
};

beforeEach(async () => {
  secure.__reset();
  resetAppLockForTests();
  jest.clearAllMocks();
  authenticate.mockResolvedValue({ success: false });
  await enableLock('1234');
});

describe('LockScreen', () => {
  it('shows an error for a wrong PIN and unlocks with the right one', async () => {
    await useAppLockStore.getState().load();
    await renderWithProviders(<LockScreen />);
    await typePin('0000');
    await press(en.lock.unlock);
    expect(await screen.findByText(en.lock.wrongPin)).toBeTruthy();
    expect(useAppLockStore.getState().locked).toBe(true);

    await typePin('1234');
    await press(en.lock.unlock);
    await waitFor(() => expect(useAppLockStore.getState().locked).toBe(false));
  });

  it('keeps Unlock disabled until the PIN has 4 digits', async () => {
    await useAppLockStore.getState().load();
    await renderWithProviders(<LockScreen />);
    await typePin('123');
    expect(screen.getByRole('button', { name: en.lock.unlock })).toBeDisabled();
    await typePin('4');
    expect(screen.getByRole('button', { name: en.lock.unlock })).toBeEnabled();
  });

  it('with biometrics on, prompts automatically and falls back to the PIN pad when cancelled', async () => {
    await useAppLockStore.getState().load();
    useAppLockStore.setState({ biometrics: true });
    await renderWithProviders(<LockScreen />);
    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));
    expect(useAppLockStore.getState().locked).toBe(true);
    expect(screen.getByLabelText('5')).toBeTruthy();

    // Retry from the button.
    authenticate.mockResolvedValueOnce({ success: true });
    await press(en.lock.useBiometrics);
    await waitFor(() => expect(useAppLockStore.getState().locked).toBe(false));
    expect(authenticate).toHaveBeenCalledTimes(2);
  });

  it('forgot PIN with biometrics off offers to erase, naming the backup file', async () => {
    await useAppLockStore.getState().load();
    await renderWithProviders(<LockScreen />);
    await press(en.lock.forgot);
    expect(await screen.findByText(en.lock.eraseMessage)).toBeTruthy();
    expect(en.lock.eraseMessage).toContain('backup file');
    await press(en.lock.eraseConfirm);
    await waitFor(() => expect(useAppLockStore.getState().enabled).toBe(false));
    expect(useAppLockStore.getState().locked).toBe(false);
  });

  it('forgot PIN with biometrics on sets a new PIN after a biometric check', async () => {
    await useAppLockStore.getState().load();
    useAppLockStore.setState({ biometrics: true });
    await renderWithProviders(<LockScreen />);
    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));

    authenticate.mockResolvedValueOnce({ success: true });
    await press(en.lock.forgot);
    expect(await screen.findByText(en.lock.newPinTitle)).toBeTruthy();
    await typePin('5678');
    await press(en.common.continue);
    expect(await screen.findByText(en.lock.confirmPinTitle)).toBeTruthy();
    await typePin('5678');
    await press(en.common.continue);
    await waitFor(() => expect(useAppLockStore.getState().locked).toBe(false));
    expect((await useAppLockStore.getState().verifyCurrentPin('5678')).result).toBe('ok');
  });

  it('drops the reset permission when the new PIN steps are cancelled', async () => {
    await useAppLockStore.getState().load();
    useAppLockStore.setState({ biometrics: true });
    await renderWithProviders(<LockScreen />);
    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));
    authenticate.mockResolvedValueOnce({ success: true });
    await press(en.lock.forgot);
    await screen.findByText(en.lock.newPinTitle);
    expect(useAppLockStore.getState().canResetPin).toBe(true);
    await press(en.common.cancel);
    expect(useAppLockStore.getState().canResetPin).toBe(false);
    await expect(useAppLockStore.getState().resetPin('5678')).rejects.toThrow();
  });

  it('drops the reset permission when the lock screen goes away', async () => {
    await useAppLockStore.getState().load();
    useAppLockStore.setState({ biometrics: true });
    const view = await renderWithProviders(<LockScreen />);
    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));
    authenticate.mockResolvedValueOnce({ success: true });
    await press(en.lock.forgot);
    await screen.findByText(en.lock.newPinTitle);
    view.unmount();
    expect(useAppLockStore.getState().canResetPin).toBe(false);
  });

  it('rejects a new PIN that does not match', async () => {
    await useAppLockStore.getState().load();
    useAppLockStore.setState({ biometrics: true });
    await renderWithProviders(<LockScreen />);
    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(1));
    authenticate.mockResolvedValueOnce({ success: true });
    await press(en.lock.forgot);
    await screen.findByText(en.lock.newPinTitle);
    await typePin('5678');
    await press(en.common.continue);
    await screen.findByText(en.lock.confirmPinTitle);
    await typePin('5679');
    await press(en.common.continue);
    expect(await screen.findByText(en.lock.mismatch)).toBeTruthy();
    expect(useAppLockStore.getState().locked).toBe(true);
  });

  it('shows the remaining wait after too many wrong PINs', async () => {
    await useAppLockStore.getState().load();
    await renderWithProviders(<LockScreen />);
    for (let i = 0; i < 5; i += 1) {
      await typePin('0000');
      await press(en.lock.unlock);
    }
    expect(await screen.findByText(/Try again in 0:\d\d/)).toBeTruthy();
    expect(screen.getByRole('button', { name: en.lock.unlock })).toBeDisabled();
  });
});
