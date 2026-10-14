import { fireEvent, screen } from '@testing-library/react-native';

import AccountsScreen from '@/app/(tabs)/accounts';
import HomeScreen from '@/app/(tabs)/index';
import MovementsScreen from '@/app/(tabs)/movements';
import SettingsScreen from '@/app/(tabs)/settings';
import { en } from '@/i18n/en';
import { renderWithProviders } from '@/test/render';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/services/language', () => ({
  loadLanguage: jest.fn(),
  saveLanguage: jest.fn(),
}));

describe('tab screens', () => {
  it('Home renders its empty state', async () => {
    await renderWithProviders(<HomeScreen />);
    expect(screen.getByText(en.home.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.home.emptyAction)).toBeTruthy();
  });

  it('Accounts renders its empty state', async () => {
    await renderWithProviders(<AccountsScreen />);
    expect(screen.getByText(en.accounts.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.accounts.emptyAction)).toBeTruthy();
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
