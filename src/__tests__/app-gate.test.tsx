import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AppGate } from '@/components/app-gate';
import { en } from '@/i18n/en';
import { useLanguageStore } from '@/stores/language-store';
import { renderWithProviders } from '@/test/render';

const mockLoad = jest.fn();

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
  return { Stack: MockStack };
});

describe('AppGate', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    useLanguageStore.setState({ language: 'en', ready: false, error: false });
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
