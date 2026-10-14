import { fireEvent, screen } from '@testing-library/react-native';

import AccountsScreen from '@/app/(tabs)/accounts';
import HomeScreen from '@/app/(tabs)/index';
import MovementsScreen from '@/app/(tabs)/movements';
import SettingsScreen from '@/app/(tabs)/settings';
import { en } from '@/i18n/en';
import { listAccounts } from '@/services/accounts';
import { useAccountsStore } from '@/stores/accounts-store';
import { renderWithProviders } from '@/test/render';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/services/accounts', () => ({
  listAccounts: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/language', () => ({
  loadLanguage: jest.fn(),
  saveLanguage: jest.fn(),
}));

const account = {
  id: 7,
  name: 'Savings',
  icon: 'bank' as const,
  currency: 'USD' as const,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('tab screens', () => {
  beforeEach(() => {
    mockPush.mockClear();
    (listAccounts as jest.Mock).mockResolvedValue([]);
    useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  });

  it('Home renders its empty state', async () => {
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText(en.home.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.home.emptyAction)).toBeTruthy();
  });

  it('Accounts renders its empty state and its action opens the form', async () => {
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText(en.accounts.emptyTitle)).toBeTruthy();
    fireEvent.press(screen.getByText(en.accounts.emptyAction));
    expect(mockPush).toHaveBeenCalledWith('/account/new');
  });

  it('Accounts lists accounts with a zero balance and opens the detail', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText('Savings')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
    fireEvent.press(screen.getByText('Savings'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: 7 } });
  });

  it('Home shows an account card with its balance', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([account]);
    await renderWithProviders(<HomeScreen />);
    expect(await screen.findByText('Savings')).toBeTruthy();
    expect(screen.getByText('$0.00')).toBeTruthy();
    expect(screen.queryByText(en.home.emptyTitle)).toBeNull();
    expect(screen.getByText('Savings').props.numberOfLines).toBe(1);
  });

  it('Accounts shows an error with retry when loading fails', async () => {
    (listAccounts as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<AccountsScreen />);
    expect(await screen.findByText(en.common.loadError)).toBeTruthy();
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText(en.accounts.emptyTitle)).toBeTruthy();
  });

  it('Movements renders its empty state', async () => {
    await renderWithProviders(<MovementsScreen />);
    expect(screen.getByText(en.movements.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.movements.emptyAction)).toBeTruthy();
  });

  it('FAB menu shows three options when opened', async () => {
    await renderWithProviders(<MovementsScreen />);
    expect(screen.queryByLabelText(en.fab.addRecurring)).toBeNull();
    fireEvent.press(screen.getByLabelText(en.fab.open));
    expect(await screen.findByLabelText(en.fab.addRecurring)).toBeTruthy();
    expect(screen.getByLabelText(en.fab.addAccount)).toBeTruthy();
    expect(screen.getByLabelText(en.fab.addTransaction)).toBeTruthy();
  });

  it('Home, Accounts and Movements show the FAB', async () => {
    for (const Screen of [HomeScreen, AccountsScreen, MovementsScreen]) {
      const { unmount } = await renderWithProviders(<Screen />);
      expect(screen.getByLabelText(en.fab.open)).toBeTruthy();
      unmount();
    }
  });

  it('Settings has no FAB', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(screen.getByText(en.settings.language)).toBeTruthy();
    expect(screen.queryByLabelText(en.fab.open)).toBeNull();
  });
});
