import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppGate } from '@/components/app-gate';
import { en } from '@/i18n/en';
import { useDefaultCurrencyStore } from '@/stores/default-currency';
import { useLanguageStore } from '@/stores/language-store';
import { renderWithProviders } from '@/test/render';

const mockLoad = jest.fn();
const mockGetDefaultCurrency = jest.fn();

// The gate reads the default currency at start; keep that read off the real db.
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  getDefaultCurrency: () => mockGetDefaultCurrency(),
}));

jest.mock('@/services/language', () => ({
  loadLanguage: () => mockLoad(),
  saveLanguage: jest.fn(),
}));

jest.mock('expo-router', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  function MockStack() {
    return <MockText>app ready</MockText>;
  }
  MockStack.Screen = function MockStackScreen() {
    return null;
  };
  return {
    Stack: MockStack,
    useRouter: () => ({ navigate: jest.fn() }),
    useRootNavigationState: () => ({ key: 'root' }),
  };
});

describe('AppGate', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockGetDefaultCurrency.mockReset().mockResolvedValue('EUR');
    useDefaultCurrencyStore.setState({ value: null, saveError: false, loading: false });
    useLanguageStore.setState({ language: 'en', ready: false, error: false });
  });

  it('reads the default currency once at start', async () => {
    mockLoad.mockResolvedValue('en');
    await renderWithProviders(<AppGate />);
    await screen.findByText('app ready');
    await waitFor(() => expect(useDefaultCurrencyStore.getState().value).toBe('EUR'));
    expect(mockGetDefaultCurrency).toHaveBeenCalledTimes(1);
  });

  it('retry recovers after a failed init', async () => {
    mockLoad.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce('en');
    await renderWithProviders(<AppGate />);

    await screen.findByText(en.common.loadError);
    fireEvent.press(screen.getByText(en.common.retry));

    await screen.findByText('app ready');
    expect(screen.queryByText(en.common.loadError)).toBeNull();
    expect(useLanguageStore.getState().ready).toBe(true);
    expect(useLanguageStore.getState().error).toBe(false);
  });

  it('shows the error again when retry fails', async () => {
    mockLoad.mockRejectedValue(new Error('db'));
    await renderWithProviders(<AppGate />);

    await screen.findByText(en.common.loadError);
    fireEvent.press(screen.getByText(en.common.retry));

    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
    await screen.findByText(en.common.loadError);
    expect(screen.queryByText('app ready')).toBeNull();
  });
});
