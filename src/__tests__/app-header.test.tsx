import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AppHeader } from '@/components/ui';
import { colors, header, sizes } from '@/theme';
import { renderWithProviders } from '@/test/render';

const mockInsets = { top: 30, right: 0, bottom: 0, left: 0 };

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe('AppHeader', () => {
  it('is a compact bar with the theme height, background and title size', async () => {
    await renderWithProviders(<AppHeader title="Home" />);

    // Paper's Surface splits its style over an outer and an inner layer on iOS.
    const bar = { ...styleOf('appbar-header-outer-layer'), ...styleOf('appbar-header') };
    expect(bar.height).toBe(header.height);
    expect(bar.backgroundColor).toBe(colors.background);

    const title = screen.getByRole('header', { name: 'Home' });
    const titleStyle = StyleSheet.flatten(title.props.style);
    expect(titleStyle.fontSize).toBe(header.title.fontSize);
    expect(titleStyle.lineHeight).toBe(header.title.lineHeight);
    expect(titleStyle.color).toBe(colors.text);
    expect(title.props.numberOfLines).toBe(1);
  });

  it('keeps the bar below the status bar inset', async () => {
    await renderWithProviders(<AppHeader title="Home" />);

    expect(styleOf('appbar-header-root-layer').paddingTop).toBe(mockInsets.top);
  });

  it('has no back button without onBack', async () => {
    await renderWithProviders(<AppHeader title="Home" backLabel="Back" />);

    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  it('shows a 48 by 48 back button that calls onBack', async () => {
    const onBack = jest.fn();
    await renderWithProviders(<AppHeader title="New account" onBack={onBack} backLabel="Back" />);

    const back = screen.getByLabelText('Back');
    fireEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(header.height).toBeGreaterThanOrEqual(sizes.touchTarget);
    // Paper puts the size on the button's container (the Surface around it).
    let node = back.parent;
    let size: { width?: unknown; height?: unknown } = {};
    while (node) {
      const style = StyleSheet.flatten(node.props.style) ?? {};
      if (style.width !== undefined && style.height !== undefined) {
        size = { width: style.width, height: style.height };
        break;
      }
      node = node.parent;
    }
    expect(size).toEqual({ width: sizes.touchTarget, height: sizes.touchTarget });
  });
});
