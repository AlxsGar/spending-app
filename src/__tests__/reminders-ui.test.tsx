import * as Notifications from 'expo-notifications';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import { RecurringForm } from '@/components/recurring-form';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { setSetting } from '@/services/db';
import { requestReminderSync } from '@/services/reminders';
import { getDefaultReminders } from '@/services/reminder-settings';
import { useDefaultRemindersStore } from '@/stores/default-reminders';
import { useNotificationPermissionStore } from '@/stores/notification-permission';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();
const consoleError = silenceConsoleError();

let mockSettings: Record<string, string> = {};
jest.mock('@/services/db', () => ({
  getSetting: jest.fn(async (key: string) => mockSettings[key] ?? null),
  setSetting: jest.fn(async (key: string, value: string) => {
    mockSettings[key] = value;
  }),
  initDb: jest.fn(),
}));
// The datetimepicker needs native code the form never opens here.
jest.mock('@react-native-community/datetimepicker', () => ({
  __esModule: true,
  default: () => null,
}));

const mocks = Notifications as unknown as Record<string, jest.Mock>;
const sync = requestReminderSync as jest.Mock;

const chip = (name: string) => screen.getByRole('button', { name });
const isOn = (name: string) => chip(name).props.accessibilityState.selected === true;

beforeEach(async () => {
  jest.clearAllMocks();
  mockSettings = {};
  await i18n.changeLanguage('en');
  useDefaultRemindersStore.setState({ value: null, saveError: false });
  useNotificationPermissionStore.setState({ status: null });
  mocks.getPermissionsAsync.mockResolvedValue({
    granted: false,
    status: 'undetermined',
    canAskAgain: true,
  });
  mocks.requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
});

const form = async (initialReminders: string, onSubmit = jest.fn().mockResolvedValue(true)) => {
  await renderWithProviders(
    <RecurringForm
      accounts={[]}
      initialAccountId={null}
      defaultCurrency="MXN"
      initialReminders={initialReminders}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
};

const fillAndSave = async () => {
  fireEvent.changeText(screen.getByLabelText(en.recurring.nameLabel), 'Rent');
  fireEvent.changeText(screen.getByLabelText(en.recurring.amountLabel), '100');
  fireEvent.press(screen.getByText(en.recurring.save));
};

describe('default reminders setting', () => {
  it('is 1 day before and the morning of until the user changes it', async () => {
    expect(await getDefaultReminders()).toBe('1,0');
  });

  it('keeps "none" as a real choice', async () => {
    mockSettings.default_reminders = '';
    expect(await getDefaultReminders()).toBe('');
    mockSettings.default_reminders = '0,3,9';
    expect(await getDefaultReminders()).toBe('3,0');
  });

  it('Settings shows the four choices with the default on, and saves a change', async () => {
    await renderWithProviders(<SettingsScreen />);
    await waitFor(() => expect(isOn(en.reminders.option1)).toBe(true));
    expect(isOn(en.reminders.option0)).toBe(true);
    expect(isOn(en.reminders.option3)).toBe(false);
    expect(isOn(en.reminders.option2)).toBe(false);

    fireEvent.press(chip(en.reminders.option3));
    fireEvent.press(chip(en.reminders.option0));
    await waitFor(() => expect(setSetting).toHaveBeenLastCalledWith('default_reminders', '3,1'));
    expect(isOn(en.reminders.option3)).toBe(true);
    expect(isOn(en.reminders.option0)).toBe(false);
    // Changing the default does not touch existing payments' reminders.
    expect(sync).not.toHaveBeenCalled();
  });

  it('turning every choice off stores none (not the built-in default)', async () => {
    await renderWithProviders(<SettingsScreen />);
    await waitFor(() => expect(isOn(en.reminders.option1)).toBe(true));
    fireEvent.press(chip(en.reminders.option1));
    fireEvent.press(chip(en.reminders.option0));
    await waitFor(() => expect(setSetting).toHaveBeenLastCalledWith('default_reminders', ''));
  });

  it('shows an error and rolls back when saving fails', async () => {
    await renderWithProviders(<SettingsScreen />);
    await waitFor(() => expect(isOn(en.reminders.option1)).toBe(true));
    (setSetting as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    fireEvent.press(chip(en.reminders.option3));
    expect(await screen.findByText(en.settings.remindersSaveError)).toBeTruthy();
    expect(isOn(en.reminders.option3)).toBe(false);
    expect(consoleError()).toHaveBeenCalled();
  });
});

describe('Settings development tool', () => {
  const globals = globalThis as unknown as { __DEV__: boolean };
  const original = globals.__DEV__;
  afterEach(() => {
    globals.__DEV__ = original;
  });

  it('shows the test reminder row only when __DEV__ is true', async () => {
    globals.__DEV__ = true;
    const view = await renderWithProviders(<SettingsScreen />);
    expect(screen.getByText(en.settings.dev.testReminder)).toBeTruthy();
    expect(screen.getByText(en.settings.dev.testReminderAction)).toBeTruthy();
    view.unmount();

    globals.__DEV__ = false;
    await renderWithProviders(<SettingsScreen />);
    expect(screen.queryByText(en.settings.dev.testReminder)).toBeNull();
    expect(screen.queryByText(en.settings.dev.testReminderAction)).toBeNull();
  });

  it('is translated', async () => {
    globals.__DEV__ = true;
    await i18n.changeLanguage('es');
    await renderWithProviders(<SettingsScreen />);
    expect(screen.getByText(es.settings.dev.testReminder)).toBeTruthy();
  });
});

describe('Settings notification status', () => {
  it('says not asked yet while undecided, with no button', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText(en.settings.notifications_undetermined)).toBeTruthy();
    expect(screen.queryByText(en.settings.openSettings)).toBeNull();
  });

  it('says allowed when granted', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText(en.settings.notifications_granted)).toBeTruthy();
    expect(screen.queryByText(en.settings.openSettings)).toBeNull();
  });

  it('when denied, says so and the button opens the system settings', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText(en.settings.notifications_denied)).toBeTruthy();
    fireEvent.press(screen.getByText(en.settings.openSettings));
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('is in Spanish', async () => {
    await i18n.changeLanguage('es');
    mocks.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    await renderWithProviders(<SettingsScreen />);
    expect(await screen.findByText(es.settings.notifications_denied)).toBeTruthy();
    expect(screen.getByText(es.settings.defaultReminders)).toBeTruthy();
    expect(screen.getByText(es.settings.openSettings)).toBeTruthy();
    expect(chip(es.reminders.option0)).toBeTruthy();
  });
});

describe('recurring form reminders', () => {
  it('starts with the choices it is given', async () => {
    await form('3,0');
    expect(isOn(en.reminders.option3)).toBe(true);
    expect(isOn(en.reminders.option2)).toBe(false);
    expect(isOn(en.reminders.option1)).toBe(false);
    expect(isOn(en.reminders.option0)).toBe(true);
  });

  it('an existing payment with none stored shows none on', async () => {
    await form('');
    for (const label of [
      en.reminders.option3,
      en.reminders.option2,
      en.reminders.option1,
      en.reminders.option0,
    ]) {
      expect(isOn(label)).toBe(false);
    }
  });

  it('submits the chosen reminders in the stored form', async () => {
    const onSubmit = await form('');
    fireEvent.press(chip(en.reminders.option0));
    fireEvent.press(chip(en.reminders.option2));
    await fillAndSave();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].notifyDaysBefore).toBe('2,0');
  });

  it('asks for permission on the first save with a reminder, and saves', async () => {
    const onSubmit = await form('1');
    await fillAndSave();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(mocks.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(useNotificationPermissionStore.getState().status).toBe('granted');
    // Newly allowed: the reminders are scheduled.
    expect(sync).toHaveBeenCalled();
  });

  it('never asks when no reminder is chosen', async () => {
    const onSubmit = await form('');
    await fillAndSave();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('a refusal never blocks saving', async () => {
    mocks.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    const onSubmit = await form('1,0');
    await fillAndSave();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].notifyDaysBefore).toBe('1,0');
    expect(useNotificationPermissionStore.getState().status).toBe('denied');
  });

  it('shows a short note when notifications are not allowed and a reminder is chosen', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
      canAskAgain: false,
    });
    await form('1');
    expect(await screen.findByText(en.reminders.deniedNote)).toBeTruthy();
    // No reminders chosen: nothing to warn about.
    fireEvent.press(chip(en.reminders.option1));
    await waitFor(() => expect(screen.queryByText(en.reminders.deniedNote)).toBeNull());
  });

  it('shows no note when notifications are allowed', async () => {
    mocks.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    await form('1');
    await waitFor(() => expect(mocks.getPermissionsAsync).toHaveBeenCalled());
    expect(screen.queryByText(en.reminders.deniedNote)).toBeNull();
  });
});
