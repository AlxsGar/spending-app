import { screen } from '@testing-library/react-native';

import { AmountText, AppText } from '@/components/ui';
import { fontScaleLimits } from '@/theme';
import { renderWithProviders } from '@/test/render';

describe('AmountText fit', () => {
  it('without fit leaves the fit props unset and keeps the tail ellipsis', async () => {
    await renderWithProviders(<AmountText cents={123456} currency="USD" />);

    const amount = screen.getByText(/1,234\.56/);
    expect(amount.props.numberOfLines).toBeUndefined();
    expect(amount.props.adjustsFontSizeToFit).toBeUndefined();
    expect(amount.props.minimumFontScale).toBeUndefined();
    expect(amount.props.ellipsizeMode).toBe('tail');
  });

  it('with fit is one line that shrinks and is never cut with an ellipsis', async () => {
    await renderWithProviders(<AmountText cents={2903600} currency="MXN" fit />);

    const amount = screen.getByText(/29,036\.00/);
    expect(amount.props.numberOfLines).toBe(1);
    expect(amount.props.adjustsFontSizeToFit).toBe(true);
    expect(amount.props.minimumFontScale).toBe(fontScaleLimits.minFit);
    expect(amount.props.ellipsizeMode).toBeUndefined();
  });
});

describe('AppText', () => {
  it('keeps the tail ellipsis on ordinary one-line text', async () => {
    await renderWithProviders(<AppText numberOfLines={1}>A long account name</AppText>);

    const text = screen.getByText('A long account name');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.ellipsizeMode).toBe('tail');
    expect(text.props.adjustsFontSizeToFit).toBeUndefined();
  });
});
