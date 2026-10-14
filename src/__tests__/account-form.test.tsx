import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AccountForm } from '@/components/account-form';
import { en } from '@/i18n/en';
import { renderWithProviders } from '@/test/render';

const initial = { name: '', icon: 'bank', currency: 'MXN' };

describe('AccountForm', () => {
  it('blocks save with an inline error when the name is blank', async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    await renderWithProviders(<AccountForm initial={initial} onSubmit={onSubmit} />);

    expect(screen.queryByText(en.accounts.errors.nameRequired)).toBeNull();
    fireEvent.changeText(screen.getByLabelText(en.accounts.nameLabel), '   ');
    fireEvent.press(screen.getByText(en.accounts.save));

    expect(await screen.findByText(en.accounts.errors.nameRequired)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the too-long error', async () => {
    const onSubmit = jest.fn();
    await renderWithProviders(<AccountForm initial={initial} onSubmit={onSubmit} />);
    fireEvent.changeText(screen.getByLabelText(en.accounts.nameLabel), 'a'.repeat(41));
    fireEvent.press(screen.getByText(en.accounts.save));
    expect(await screen.findByText(en.accounts.errors.nameTooLong)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the chosen values', async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    await renderWithProviders(<AccountForm initial={initial} onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByLabelText(en.accounts.nameLabel), 'Wallet');
    fireEvent.press(screen.getByLabelText(en.accounts.icons.cash));
    fireEvent.press(screen.getByText(en.accounts.save));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Wallet', icon: 'cash', currency: 'MXN' }),
    );
  });

  it('shows a save error when submit fails', async () => {
    const onSubmit = jest.fn().mockResolvedValue(false);
    await renderWithProviders(
      <AccountForm initial={{ ...initial, name: 'Main' }} onSubmit={onSubmit} />,
    );
    fireEvent.press(screen.getByText(en.accounts.save));
    expect(await screen.findByText(en.accounts.saveError)).toBeTruthy();
  });

  it('caps the name at 40 and shows the characters used as you type', async () => {
    await renderWithProviders(<AccountForm initial={initial} onSubmit={jest.fn()} />);
    const field = screen.getByLabelText(en.accounts.nameLabel);
    expect(field.props.maxLength).toBe(40);
    expect(screen.getByText('0/40 characters')).toBeTruthy();

    fireEvent.changeText(field, 'a'.repeat(12));
    expect(screen.getByText('12/40 characters')).toBeTruthy();
  });

  it('shows the error and the counter together', async () => {
    await renderWithProviders(<AccountForm initial={initial} onSubmit={jest.fn()} />);
    fireEvent.press(screen.getByText(en.accounts.save));
    expect(await screen.findByText(en.accounts.errors.nameRequired)).toBeTruthy();
    expect(screen.getByText('0/40 characters')).toBeTruthy();
  });

  it('currency dialog opens, selects and closes', async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    await renderWithProviders(
      <AccountForm initial={{ ...initial, name: 'Main' }} onSubmit={onSubmit} />,
    );
    fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, MXN`));
    expect(await screen.findByText('JPY')).toBeTruthy();
    fireEvent.press(screen.getByText('EUR'));
    await waitFor(() => expect(screen.queryByText('JPY')).toBeNull());

    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Main', icon: 'bank', currency: 'EUR' }),
    );
  });

  describe('currency change confirmation', () => {
    const changeCurrency = async (onSubmit: jest.Mock, transactionCount: number) => {
      await renderWithProviders(
        <AccountForm
          initial={{ ...initial, name: 'Main' }}
          onSubmit={onSubmit}
          transactionCount={transactionCount}
        />,
      );
      fireEvent.changeText(screen.getByLabelText(en.accounts.nameLabel), 'Edited');
      fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, MXN`));
      await screen.findByText('JPY');
      fireEvent.press(screen.getByText('EUR'));
      await waitFor(() => expect(screen.queryByText('JPY')).toBeNull());
      fireEvent.press(screen.getByText(en.accounts.save));
    };

    it('asks first when the currency changed and the account has transactions', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await changeCurrency(onSubmit, 3);
      expect(await screen.findByText(en.accounts.currencyChangeTitle)).toBeTruthy();
      expect(
        screen.getByText(
          'The 3 transactions in this account keep their amounts and will show in EUR instead of MXN. Nothing is converted.',
        ),
      ).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Confirm saves the new currency', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await changeCurrency(onSubmit, 1);
      fireEvent.press(await screen.findByText(en.accounts.currencyChangeConfirm));
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({ name: 'Edited', icon: 'bank', currency: 'EUR' }),
      );
    });

    it('Cancel saves nothing and keeps the edits', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await changeCurrency(onSubmit, 2);
      await screen.findByText(en.accounts.currencyChangeTitle);
      fireEvent.press(screen.getByText(en.common.cancel));
      await waitFor(() =>
        expect(screen.queryByText(en.accounts.currencyChangeTitle)).toBeNull(),
      );
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByLabelText(en.accounts.nameLabel).props.value).toBe('Edited');
      expect(screen.getByLabelText(`${en.accounts.currencyLabel}, EUR`)).toBeTruthy();
    });

    it('saves directly with no transactions', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await changeCurrency(onSubmit, 0);
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(en.accounts.currencyChangeTitle)).toBeNull();
    });

    it('saves directly when the currency did not change', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await renderWithProviders(
        <AccountForm
          initial={{ ...initial, name: 'Main' }}
          onSubmit={onSubmit}
          transactionCount={5}
        />,
      );
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(en.accounts.currencyChangeTitle)).toBeNull();
    });
  });

  it('currency dialog Cancel keeps the current currency', async () => {
    const onSubmit = jest.fn().mockResolvedValue(true);
    await renderWithProviders(
      <AccountForm initial={{ ...initial, name: 'Main' }} onSubmit={onSubmit} />,
    );
    fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, MXN`));
    await screen.findByText('JPY');
    fireEvent.press(screen.getByText(en.common.cancel));
    await waitFor(() => expect(screen.queryByText('JPY')).toBeNull());

    fireEvent.press(screen.getByText(en.accounts.save));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Main', icon: 'bank', currency: 'MXN' }),
    );
  });
});
