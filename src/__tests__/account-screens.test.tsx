import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import NewAccountScreen from '@/app/account/new';
import AccountDetailScreen from '@/app/account/[id]/index';
import EditAccountScreen from '@/app/account/[id]/edit';
import { en } from '@/i18n/en';
import {
  createAccount,
  listAccounts,
  removeAccount,
  updateAccount,
} from '@/services/accounts';
import { getSetting } from '@/services/db';
import { useAccountsStore } from '@/stores/accounts-store';
import { renderWithProviders } from '@/test/render';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({ id: '7' }),
}));

jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  listAccounts: jest.fn(),
  createAccount: jest.fn(),
  updateAccount: jest.fn(),
  removeAccount: jest.fn(),
}));

jest.mock('@/services/db', () => ({ getSetting: jest.fn(), initDb: jest.fn() }));

const account = {
  id: 7,
  name: 'Savings',
  icon: 'wallet' as const,
  currency: 'EUR' as const,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  (listAccounts as jest.Mock).mockResolvedValue([account]);
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
});

describe('account detail screen', () => {
  it('shows the account, and Cancel keeps it', async () => {
    await renderWithProviders(<AccountDetailScreen />);
    expect(await screen.findByText('Savings')).toBeTruthy();
    expect(screen.queryByText(en.accounts.deleteTitle)).toBeNull();

    fireEvent.press(screen.getByText(en.accounts.delete));
    expect(await screen.findByText(en.accounts.deleteTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.cancel));

    await waitFor(() => expect(screen.queryByText(en.accounts.deleteTitle)).toBeNull());
    expect(removeAccount).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(useAccountsStore.getState().accounts).toHaveLength(1);
  });

  it('Confirm removes the account and navigates back', async () => {
    (removeAccount as jest.Mock).mockResolvedValue(undefined);
    await renderWithProviders(<AccountDetailScreen />);
    await screen.findByText('Savings');

    fireEvent.press(screen.getByText(en.accounts.delete));
    await screen.findByText(en.accounts.deleteTitle);
    // Both the button and the dialog confirm say "Delete"; the dialog one is last.
    const deletes = screen.getAllByText(en.accounts.delete);
    fireEvent.press(deletes[deletes.length - 1]);

    await waitFor(() => expect(removeAccount).toHaveBeenCalledWith(7));
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(useAccountsStore.getState().accounts).toHaveLength(0);
  });
});

describe('new account screen', () => {
  const save = async () => {
    fireEvent.changeText(await screen.findByLabelText(en.accounts.nameLabel), 'New');
    fireEvent.press(screen.getByText(en.accounts.save));
  };

  it.each([
    ['uses the default_currency setting', 'EUR', 'EUR'],
    ['falls back to MXN when the setting is missing', null, 'MXN'],
    ['falls back to MXN when the setting is not in the list', 'ZZZ', 'MXN'],
  ])('%s', async (_label, stored, expected) => {
    (getSetting as jest.Mock).mockResolvedValue(stored);
    (createAccount as jest.Mock).mockResolvedValue({ ...account, id: 8 });
    await renderWithProviders(<NewAccountScreen />);
    await save();

    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith({
        name: 'New',
        icon: 'bank',
        currency: expected,
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});

describe('edit account screen', () => {
  it('is prefilled and saving updates the account', async () => {
    (updateAccount as jest.Mock).mockResolvedValue({ ...account, name: 'Renamed' });
    await renderWithProviders(<EditAccountScreen />);

    const field = await screen.findByLabelText(en.accounts.nameLabel);
    expect(field.props.value).toBe('Savings');
    expect(screen.getByText('EUR')).toBeTruthy();

    fireEvent.changeText(field, 'Renamed');
    fireEvent.press(screen.getByText(en.accounts.save));

    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(7, {
        name: 'Renamed',
        icon: 'wallet',
        currency: 'EUR',
      }),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(useAccountsStore.getState().accounts[0].name).toBe('Renamed');
  });
});
