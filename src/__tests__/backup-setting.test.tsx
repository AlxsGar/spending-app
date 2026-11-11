import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { BackupSetting } from '@/components/backup-setting';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { applyImport, BackupError, buildBackupJson, prepareImport } from '@/services/backup';
import type { PreparedBackup } from '@/services/backup';
import { pickBackupText, shareBackupFile } from '@/services/backup-files';
import { requestReminderSync } from '@/services/reminders';
import { reloadAllStores } from '@/stores/reload-all';
import { useSuccessStore } from '@/stores/success-store';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();
const consoleError = silenceConsoleError();

jest.mock('@/services/backup', () => ({
  ...jest.requireActual('@/services/backup'),
  buildBackupJson: jest.fn(),
  prepareImport: jest.fn(),
  applyImport: jest.fn(),
}));
jest.mock('@/services/backup-files', () => ({
  shareBackupFile: jest.fn(),
  pickBackupText: jest.fn(),
}));
jest.mock('@/stores/reload-all', () => ({ reloadAllStores: jest.fn() }));

const prepared: PreparedBackup = {
  appVersion: '0.9.3',
  exportedAt: '2026-11-09T12:00:00.000Z',
  counts: { accounts: 2, transactions: 41, recurringPayments: 3 },
  tables: { settings: [], accounts: [], recurring_payments: [], transactions: [], soft_caps: [] },
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

beforeEach(async () => {
  jest.clearAllMocks();
  useSuccessStore.setState({ current: null });
  await i18n.changeLanguage('en');
  (buildBackupJson as jest.Mock).mockResolvedValue('{"json":true}');
  (shareBackupFile as jest.Mock).mockResolvedValue(undefined);
  (pickBackupText as jest.Mock).mockResolvedValue('file text');
  (prepareImport as jest.Mock).mockResolvedValue(prepared);
  (applyImport as jest.Mock).mockResolvedValue(undefined);
  (reloadAllStores as jest.Mock).mockResolvedValue(undefined);
});

const exportButton = () => screen.getByText(en.settings.backup.export);
const importButton = () => screen.getByText(en.settings.backup.import);

describe('Backup section', () => {
  it('shows the buttons and the unencrypted note', async () => {
    await renderWithProviders(<BackupSetting />);
    expect(screen.getByText(en.settings.backup.title)).toBeTruthy();
    expect(screen.getByText(en.settings.backup.note)).toBeTruthy();
    expect(exportButton()).toBeTruthy();
    expect(importButton()).toBeTruthy();
  });

  it('has Spanish strings for every key', () => {
    expect(Object.keys(es.settings.backup).sort()).toEqual(Object.keys(en.settings.backup).sort());
    expect(es.settings.backup.restored).toBe('Copia restaurada');
  });
});

describe('export', () => {
  it('writes the dated file and opens the share sheet', async () => {
    jest.setSystemTime(new Date(2026, 10, 10, 9, 0, 0));
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(exportButton());
    });
    expect(shareBackupFile).toHaveBeenCalledWith('spending-backup-2026-11-10.json', '{"json":true}');
    expect(screen.queryByText(en.settings.backup.exportError)).toBeNull();
  });

  it('shows an error when it fails', async () => {
    (shareBackupFile as jest.Mock).mockRejectedValue(new Error('boom'));
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(exportButton());
    });
    expect(screen.getByText(en.settings.backup.exportError)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalled();
  });
});

describe('import', () => {
  it('does nothing when the picker is cancelled', async () => {
    (pickBackupText as jest.Mock).mockResolvedValue(null);
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(prepareImport).not.toHaveBeenCalled();
    expect(screen.queryByText(en.settings.backup.confirmTitle)).toBeNull();
    expect(screen.queryByText(en.settings.backup.readError)).toBeNull();
  });

  it('shows a message for an invalid file and changes nothing', async () => {
    (prepareImport as jest.Mock).mockRejectedValue(new BackupError('wrongFormat'));
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(screen.getByText(en.settings.backup.error_wrongFormat)).toBeTruthy();
    expect(screen.queryByText(en.settings.backup.confirmTitle)).toBeNull();
    expect(applyImport).not.toHaveBeenCalled();
  });

  it('shows the dedicated message for a newer backup', async () => {
    (prepareImport as jest.Mock).mockRejectedValue(new BackupError('newerSchema'));
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(
      screen.getByText('This backup is from a newer version of the app. Update the app to import it.'),
    ).toBeTruthy();
  });

  it('shows the confirmation with counts, date and app version', async () => {
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(await screen.findByText(en.settings.backup.confirmTitle)).toBeTruthy();
    const message = screen.getByText(/Accounts: 2/);
    const text = message.props.children as string;
    expect(text).toContain('Transactions: 41');
    expect(text).toContain('Recurring payments: 3');
    expect(text).toContain('Exported: Nov 9, 2026');
    expect(text).toContain('App version: 0.9.3');
    expect(text).toContain('replaced');
    expect(applyImport).not.toHaveBeenCalled();
  });

  it('Cancel changes nothing', async () => {
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    fireEvent.press(await screen.findByText(en.common.cancel));
    await waitFor(() => expect(screen.queryByText(en.settings.backup.confirmTitle)).toBeNull());
    expect(applyImport).not.toHaveBeenCalled();
    expect(reloadAllStores).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('Confirm replaces the data, reloads the stores, syncs reminders and shows the card', async () => {
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    await act(async () => {
      fireEvent.press(await screen.findByText(en.settings.backup.confirm));
    });
    expect(applyImport).toHaveBeenCalledWith(prepared);
    expect(reloadAllStores).toHaveBeenCalledTimes(1);
    expect(requestReminderSync).toHaveBeenCalledTimes(1);
    expect(useSuccessStore.getState().current).toMatchObject({
      icon: 'check',
      tone: 'neutral',
      message: 'Backup restored',
    });
  });

  it('shows a message for a file that is too large', async () => {
    (pickBackupText as jest.Mock).mockRejectedValue(new BackupError('tooLarge'));
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(screen.getByText('This file is too large to be a backup.')).toBeTruthy();
    expect(es.settings.backup.error_tooLarge).toBe('Este archivo es demasiado grande para ser una copia.');
    expect(prepareImport).not.toHaveBeenCalled();
  });

  it('keeps the dialog open as "Restoring…" with disabled buttons while it replaces', async () => {
    const gate = deferred<void>();
    (applyImport as jest.Mock).mockReturnValue(gate.promise);
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    await act(async () => {
      fireEvent.press(await screen.findByText(en.settings.backup.confirm));
    });
    expect(screen.getByText('Restoring…')).toBeTruthy();
    expect(isDisabled(en.settings.backup.confirm)).toBe(true);
    expect(isDisabled(en.common.cancel)).toBe(true);
    // A second tap does not start a second restore.
    fireEvent.press(screen.getByText(en.settings.backup.confirm));
    expect(applyImport).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(screen.queryByText('Restoring…')).toBeNull());
    expect(useSuccessStore.getState().current).not.toBeNull();
    expect(es.settings.backup.restoring).toBe('Restaurando…');
  });

  it('when the reload fails, asks to reopen the app, still syncs reminders and shows no success card', async () => {
    (reloadAllStores as jest.Mock).mockRejectedValue(new Error('read failed'));
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    await act(async () => {
      fireEvent.press(await screen.findByText(en.settings.backup.confirm));
    });
    expect(applyImport).toHaveBeenCalledTimes(1);
    expect(requestReminderSync).toHaveBeenCalledTimes(1);
    expect(screen.getByText(en.settings.backup.reloadError)).toBeTruthy();
    expect(useSuccessStore.getState().current).toBeNull();
    expect(consoleError()).toHaveBeenCalled();
  });

  it('a failed replace shows an error and shows no success card', async () => {
    (applyImport as jest.Mock).mockRejectedValue(new Error('rolled back'));
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    await act(async () => {
      fireEvent.press(await screen.findByText(en.settings.backup.confirm));
    });
    expect(screen.getByText(en.settings.backup.importError)).toBeTruthy();
    expect(reloadAllStores).not.toHaveBeenCalled();
    expect(requestReminderSync).not.toHaveBeenCalled();
    expect(useSuccessStore.getState().current).toBeNull();
  });
});

const isDisabled = (name: string) =>
  screen.getByRole('button', { name }).props.accessibilityState.disabled === true;

describe('busy', () => {
  it('disables both buttons while an export runs', async () => {
    const gate = deferred<void>();
    (shareBackupFile as jest.Mock).mockReturnValue(gate.promise);
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(exportButton());
    });
    expect(isDisabled(en.settings.backup.export)).toBe(true);
    expect(isDisabled(en.settings.backup.import)).toBe(true);
    await act(async () => {
      gate.resolve();
    });
    expect(isDisabled(en.settings.backup.export)).toBe(false);
  });

  it('disables both buttons while an import is being prepared', async () => {
    const gate = deferred<PreparedBackup>();
    (prepareImport as jest.Mock).mockReturnValue(gate.promise);
    await renderWithProviders(<BackupSetting />);
    await act(async () => {
      fireEvent.press(importButton());
    });
    expect(isDisabled(en.settings.backup.export)).toBe(true);
    expect(isDisabled(en.settings.backup.import)).toBe(true);
    await act(async () => {
      gate.resolve(prepared);
    });
    expect(isDisabled(en.settings.backup.import)).toBe(false);
  });
});
