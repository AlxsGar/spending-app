import { screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import TabsLayout from '@/app/(tabs)/_layout';
import { en } from '@/i18n/en';
import { renderWithProviders } from '@/test/render';

// The screenOptions the layout gives the Tabs, kept so the header can be rendered.
type MockTabsOptions = {
  header: (props: { options: { title?: string }; route: { name: string } }) => ReactElement;
};
let mockTabsOptions: MockTabsOptions | null = null;

jest.mock('expo-router', () => {
  function MockTabs({ screenOptions }: { screenOptions: MockTabsOptions }) {
    mockTabsOptions = screenOptions;
    return null;
  }
  MockTabs.Screen = function MockTabsScreen() {
    return null;
  };
  return { Tabs: MockTabs };
});

const renderHeader = async (title?: string) => {
  await renderWithProviders(<TabsLayout />);
  const header = (mockTabsOptions as MockTabsOptions).header({
    options: { title },
    route: { name: 'index' },
  });
  // `screen` now points at the header alone.
  await renderWithProviders(header);
};

describe('tabs header', () => {
  it('shows the tab title', async () => {
    await renderHeader('Home');
    expect(screen.getByRole('header', { name: 'Home' })).toBeTruthy();
  });

  it('falls back to the route name without a title', async () => {
    await renderHeader();
    expect(screen.getByRole('header', { name: 'index' })).toBeTruthy();
  });

  it('has no back button', async () => {
    await renderHeader('Home');
    expect(screen.queryByLabelText(en.common.back)).toBeNull();
    // The title is the only thing in the bar: no button of any kind.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
