import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { AccountCards } from '@/components/account-cards';
import { fontScaleLimits, sizes } from '@/theme';
import { renderWithProviders } from '@/test/render';

let mockFontScale = 1;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 800, scale: 2, fontScale: mockFontScale }),
}));

const make = (id: number, name: string, currency: 'USD' | 'JPY') => ({
  id,
  name,
  icon: 'bank' as const,
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const accounts = [
  make(1, 'A', 'USD'),
  make(2, 'x'.repeat(40), 'JPY'),
  make(3, 'Medium name', 'USD'),
];

const sizeOf = (id: number) => {
  const style = StyleSheet.flatten(screen.getByTestId(`account-card-${id}`).props.style);
  return { width: style.width, height: style.height };
};

describe('AccountCards sizing', () => {
  it('gives every card the same theme size at the default font scale', async () => {
    mockFontScale = 1;
    await renderWithProviders(<AccountCards accounts={accounts} balances={{}} onOpen={jest.fn()} />);
    const expected = { width: sizes.accountCard, height: sizes.accountCardHeight };
    expect(sizeOf(1)).toEqual(expected);
    expect(sizeOf(2)).toEqual(expected);
    expect(sizeOf(3)).toEqual(expected);
  });

  it('scales every card identically above fontScale 1', async () => {
    mockFontScale = 1.5;
    await renderWithProviders(<AccountCards accounts={accounts} balances={{}} onOpen={jest.fn()} />);
    const expected = {
      width: Math.round(sizes.accountCard * 1.25),
      height: Math.round(sizes.accountCardHeight * 1.5),
    };
    expect(expected.height).toBeGreaterThan(sizes.accountCardHeight);
    expect(sizeOf(1)).toEqual(expected);
    expect(sizeOf(2)).toEqual(expected);
    expect(sizeOf(3)).toEqual(expected);
  });

  it('caps the growth at the theme limits', async () => {
    mockFontScale = 4;
    await renderWithProviders(<AccountCards accounts={accounts} balances={{}} onOpen={jest.fn()} />);
    expect(sizeOf(2)).toEqual({
      width: Math.round(sizes.accountCard * fontScaleLimits.maxWidth),
      height: Math.round(sizes.accountCardHeight * fontScaleLimits.maxHeight),
    });
  });
});
