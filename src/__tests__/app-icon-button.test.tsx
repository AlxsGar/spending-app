import { fireEvent, screen } from '@testing-library/react-native';
import { IconButton } from 'react-native-paper';

import { AppIconButton } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

// The icon name Paper's IconButton was given.
const glyph = () => screen.UNSAFE_getByType(IconButton).props.icon as string;

describe('AppIconButton', () => {
  it('presses, is a button and reports it is not selected by default', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <AppIconButton icon="filter-variant" accessibilityLabel="Filter" onPress={onPress} />,
    );
    fireEvent.press(screen.getByLabelText('Filter'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Filter').props.accessibilityState.selected).toBe(false);
  });

  it('while selected it reports the state and switches to the selected icon', async () => {
    const view = await renderWithProviders(
      <AppIconButton
        icon="filter-variant"
        selectedIcon="filter-check"
        accessibilityLabel="Filter"
        onPress={jest.fn()}
      />,
    );
    const plain = glyph();
    view.rerender(
      <AppIconButton
        icon="filter-variant"
        selectedIcon="filter-check"
        accessibilityLabel="Filter"
        onPress={jest.fn()}
        selected
      />,
    );
    expect(screen.getByLabelText('Filter').props.accessibilityState.selected).toBe(true);
    expect(plain).toBe('filter-variant');
    expect(glyph()).toBe('filter-check');
  });

  it('keeps the icon when selected has no selectedIcon', async () => {
    const view = await renderWithProviders(
      <AppIconButton icon="filter-variant" accessibilityLabel="Filter" onPress={jest.fn()} />,
    );
    const plain = glyph();
    view.rerender(
      <AppIconButton icon="filter-variant" accessibilityLabel="Filter" onPress={jest.fn()} selected />,
    );
    expect(glyph()).toBe(plain);
  });
});
