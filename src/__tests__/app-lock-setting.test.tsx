import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { AppLockSetting } from '@/components/app-lock-setting';
import { en } from '@/i18n/en';
import { verifyPin } from '@/services/app-lock';
import { resetAppLockForTests, useAppLockStore } from '@/stores/app-lock-store';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

jest.mock('@/services/erase-data', () => ({ eraseAllData: jest.fn() }));
jest.mock('@/stores/reload-all', () => ({ reloadAllStores: jest.fn() }));

const secure = SecureStore as unknown as { __reset: () => void };
const isEnrolled = LocalAuthentication.isEnrolledAsync as jest.Mock;

const typePin = (pin: string) => {
  for (const digit of pin) fireEvent.press(screen.getByLabelText(digit));
};
const press = async (label: string) => {
  fireEvent.press(screen.getByText(label));
  await act(async () => {});
};

beforeEach(async () => {
  secure.__reset();
  resetAppLockForTests();
  isEnrolled.mockResolvedValue(true);
  await useAppLockStore.getState().load();
});

async function turnOn(pin = '1234') {
  fireEvent.press(screen.getByLabelText(en.settings.appLock.title));
  await screen.findByText(en.settings.appLock.enableTitle);
  typePin(pin);
  await press(en.settings.appLock.next);
  await screen.findByText(en.settings.appLock.repeatTitle);
  typePin(pin);
  await press(en.settings.appLock.confirm);
}

describe('AppLockSetting', () => {
  it('is off by default, with no biometrics or change PIN rows', async () => {
    await renderWithProviders(<AppLockSetting />);
    expect(screen.getByLabelText(en.settings.appLock.title).props.accessibilityState.checked).toBe(false);
    expect(screen.queryByText(en.settings.appLock.changePin)).toBeNull();
    expect(screen.queryByText(en.settings.appLock.biometrics)).toBeNull();
  });

  it('turns on with a PIN entered twice, then offers biometrics and Change PIN', async () => {
    await renderWithProviders(<AppLockSetting />);
    await turnOn('1234');
    await waitFor(() => expect(useAppLockStore.getState().enabled).toBe(true));
    expect(await screen.findByText(en.settings.appLock.biometrics)).toBeTruthy();
    expect(screen.getAllByText(en.settings.appLock.changePin).length).toBeGreaterThan(0);
    expect((await verifyPin('1234')).result).toBe('ok');
  });

  it('rejects PINs that do not match', async () => {
    await renderWithProviders(<AppLockSetting />);
    fireEvent.press(screen.getByLabelText(en.settings.appLock.title));
    await screen.findByText(en.settings.appLock.enableTitle);
    typePin('1234');
    await press(en.settings.appLock.next);
    await screen.findByText(en.settings.appLock.repeatTitle);
    typePin('1235');
    await press(en.settings.appLock.confirm);
    expect(await screen.findByText(en.settings.appLock.mismatch)).toBeTruthy();
    expect(useAppLockStore.getState().enabled).toBe(false);
  });

  it('does not accept fewer than 4 digits', async () => {
    await renderWithProviders(<AppLockSetting />);
    fireEvent.press(screen.getByLabelText(en.settings.appLock.title));
    await screen.findByText(en.settings.appLock.enableTitle);
    typePin('123');
    expect(screen.getByRole('button', { name: en.settings.appLock.next })).toBeDisabled();
  });

  it('hides the biometrics switch on a device without enrolled biometrics', async () => {
    isEnrolled.mockResolvedValue(false);
    await useAppLockStore.getState().load();
    await renderWithProviders(<AppLockSetting />);
    await turnOn();
    await waitFor(() => expect(useAppLockStore.getState().enabled).toBe(true));
    expect(screen.queryByText(en.settings.appLock.biometrics)).toBeNull();
  });

  it('turning off needs the current PIN', async () => {
    await renderWithProviders(<AppLockSetting />);
    await turnOn();
    await waitFor(() => expect(useAppLockStore.getState().enabled).toBe(true));

    fireEvent.press(screen.getByLabelText(en.settings.appLock.title));
    await screen.findByText(en.settings.appLock.currentTitle);
    typePin('9999');
    await press(en.settings.appLock.turnOff);
    expect(await screen.findByText(en.settings.appLock.wrongPin)).toBeTruthy();
    expect(useAppLockStore.getState().enabled).toBe(true);

    typePin('1234');
    await press(en.settings.appLock.turnOff);
    await waitFor(() => expect(useAppLockStore.getState().enabled).toBe(false));
  });

  it('change PIN needs the current PIN, then the new one twice', async () => {
    await renderWithProviders(<AppLockSetting />);
    await turnOn();
    await waitFor(() => expect(useAppLockStore.getState().enabled).toBe(true));

    await press(en.settings.appLock.changePin);
    await screen.findByText(en.settings.appLock.currentTitle);
    typePin('1234');
    await press(en.settings.appLock.next);
    await screen.findByText(en.settings.appLock.newTitle);
    typePin('4321');
    await press(en.settings.appLock.next);
    await screen.findByText(en.settings.appLock.repeatTitle);
    typePin('4321');
    await press(en.settings.appLock.confirm);
    await waitFor(async () => expect((await verifyPin('4321')).result).toBe('ok'));
  });
});
