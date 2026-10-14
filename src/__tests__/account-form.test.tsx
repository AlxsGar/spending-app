import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { AccountForm } from '@/components/account-form';
import { en } from '@/i18n/en';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

const DEFAULT_OS = Platform.OS;

// Restores jest.replaceProperty(Platform, 'OS', ...) after every test.
afterEach(() => {
  jest.restoreAllMocks();
});

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

  describe('initial balance (new account)', () => {
    const named = { ...initial, name: 'Main', currency: 'USD' };
    const submitWith = async (amount: string, onSubmit = jest.fn().mockResolvedValue(true)) => {
      await renderWithProviders(<AccountForm initial={named} onSubmit={onSubmit} />);
      fireEvent.changeText(screen.getByLabelText(en.accounts.initialBalanceLabel), amount);
      fireEvent.press(screen.getByText(en.accounts.save));
      return onSubmit;
    };

    it('is optional: empty sends no balance at all', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await renderWithProviders(<AccountForm initial={named} onSubmit={onSubmit} />);
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0].balance).toBeUndefined();
    });

    it('has no sign toggle', async () => {
      await renderWithProviders(<AccountForm initial={named} onSubmit={jest.fn()} />);
      expect(screen.queryByText('Positive')).toBeNull();
      expect(screen.queryByText('Negative')).toBeNull();
    });

    it('sends the typed text', async () => {
      const onSubmit = await submitWith('500');
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ ...named, balance: '500' }));
    });

    it('sends a negative amount typed with a leading minus', async () => {
      const onSubmit = await submitWith('-200,5');
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ ...named, balance: '-200,5' }));
    });

    it.each(['--5', '-5-', '5-', '-', '- 5', '+5'])('blocks %s with an inline error', async (text) => {
      const onSubmit = await submitWith(text);
      expect(await screen.findByText(en.accounts.errors.balanceInvalid)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('uses a keyboard with a minus key: numbers-and-punctuation on iOS, numeric on Android', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const ios = await renderWithProviders(<AccountForm initial={named} onSubmit={jest.fn()} />);
      expect(screen.getByLabelText(en.accounts.initialBalanceLabel).props.keyboardType).toBe(
        'numbers-and-punctuation',
      );
      ios.unmount();

      jest.replaceProperty(Platform, 'OS', 'android');
      await renderWithProviders(
        <AccountForm initial={named} onSubmit={jest.fn()} currentBalanceCents={100} />,
      );
      expect(screen.getByLabelText(en.accounts.currentBalanceLabel).props.keyboardType).toBe(
        'numeric',
      );
    });

    it('the platform override from the previous test did not leak', () => {
      expect(Platform.OS).toBe(DEFAULT_OS);
    });

    it('accepts 0 (the service stores no anchor for it)', async () => {
      const onSubmit = await submitWith('0');
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    });

    it('accepts a comma decimal', async () => {
      const onSubmit = await submitWith('12,5');
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    });

    it('blocks an invalid amount with an inline error', async () => {
      const onSubmit = await submitWith('abc');
      expect(await screen.findByText(en.accounts.errors.balanceInvalid)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('blocks an amount above the maximum', async () => {
      const onSubmit = await submitWith('1000000000');
      expect(await screen.findByText(en.accounts.errors.balanceTooLarge)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('JPY rejects decimals on save', async () => {
      const onSubmit = jest.fn();
      await renderWithProviders(
        <AccountForm initial={{ ...named, currency: 'JPY' }} onSubmit={onSubmit} />,
      );
      fireEvent.changeText(screen.getByLabelText(en.accounts.initialBalanceLabel), '12.50');
      fireEvent.press(screen.getByText(en.accounts.save));
      expect(await screen.findByText(en.accounts.errors.balanceDecimalsNotAllowed)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('switching to JPY re-validates a typed "12.50" right away', async () => {
      await renderWithProviders(<AccountForm initial={named} onSubmit={jest.fn()} />);
      fireEvent.changeText(screen.getByLabelText(en.accounts.initialBalanceLabel), '12.50');
      expect(screen.queryByText(en.accounts.errors.balanceDecimalsNotAllowed)).toBeNull();

      fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, USD`));
      await screen.findByText('JPY');
      fireEvent.press(screen.getByText('JPY'));
      expect(await screen.findByText(en.accounts.errors.balanceDecimalsNotAllowed)).toBeTruthy();
      // The name error is not shown before the first save.
      expect(screen.queryByText(en.accounts.errors.nameRequired)).toBeNull();

      // And it clears when the currency goes back.
      fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, JPY`));
      await screen.findByText('USD');
      fireEvent.press(screen.getByText('USD'));
      await waitFor(() =>
        expect(screen.queryByText(en.accounts.errors.balanceDecimalsNotAllowed)).toBeNull(),
      );
    });
  });

  describe('current balance (edit)', () => {
    const named = { ...initial, name: 'Main', currency: 'USD' };

    it('prefills a positive balance without a sign', async () => {
      await renderWithProviders(
        <AccountForm initial={named} onSubmit={jest.fn()} currentBalanceCents={50000} />,
      );
      expect(screen.getByLabelText(en.accounts.currentBalanceLabel).props.value).toBe('500.00');
    });

    it('is prefilled from the balance with a leading minus, and unchanged sends no balance', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await renderWithProviders(
        <AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={-12550} />,
      );
      expect(screen.getByLabelText(en.accounts.currentBalanceLabel).props.value).toBe('-125.50');
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0].balance).toBeUndefined();
    });

    it('an untouched field stays unchanged even if the ledger moves while the form is open', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      const { rerender } = await renderWithProviders(
        <AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={5000} />,
      );
      // A transaction lands: the live balance is now 60.00, the field still says 50.00.
      rerender(<AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={6000} />);
      expect(screen.getByLabelText(en.accounts.currentBalanceLabel).props.value).toBe('50.00');
      // Typing the same text in another form is still "unchanged".
      fireEvent.changeText(screen.getByLabelText(en.accounts.currentBalanceLabel), '50');
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0].balance).toBeUndefined();
    });

    it('flipping the sign on a non-zero balance is a change', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await renderWithProviders(
        <AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={50000} />,
      );
      fireEvent.changeText(screen.getByLabelText(en.accounts.currentBalanceLabel), '-500.00');
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({ ...named, balance: '-500.00' }),
      );
    });

    it('typing "-0" over a balance of 0 is not a change; typing 0 over 500 is', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      const zero = await renderWithProviders(
        <AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={0} />,
      );
      fireEvent.changeText(screen.getByLabelText(en.accounts.currentBalanceLabel), '-0');
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0].balance).toBeUndefined();
      zero.unmount();

      await renderWithProviders(
        <AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={50000} />,
      );
      fireEvent.changeText(screen.getByLabelText(en.accounts.currentBalanceLabel), '-0');
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(onSubmit.mock.calls[1][0].balance).toBe('-0');
    });

    it('does not block saving an unchanged prefill above the maximum', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await renderWithProviders(
        <AccountForm
          initial={named}
          onSubmit={onSubmit}
          currentBalanceCents={100_000_000_000}
        />,
      );
      fireEvent.press(screen.getByText(en.accounts.save));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(screen.queryByText(en.accounts.errors.balanceTooLarge)).toBeNull();
    });

    it('an emptied field is an error, not a silent 0', async () => {
      const onSubmit = jest.fn();
      await renderWithProviders(
        <AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={500} />,
      );
      fireEvent.changeText(screen.getByLabelText(en.accounts.currentBalanceLabel), '');
      fireEvent.press(screen.getByText(en.accounts.save));
      expect(await screen.findByText(en.accounts.errors.balanceRequired)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('a JPY switch with the prefill untouched saves; with an edited decimal it errors', async () => {
      const onSubmit = jest.fn().mockResolvedValue(true);
      await renderWithProviders(
        <AccountForm initial={named} onSubmit={onSubmit} currentBalanceCents={1250} />,
      );
      fireEvent.press(screen.getByLabelText(`${en.accounts.currencyLabel}, USD`));
      await screen.findByText('JPY');
      fireEvent.press(screen.getByText('JPY'));
      await screen.findByLabelText(`${en.accounts.currencyLabel}, JPY`);
      fireEvent.changeText(screen.getByLabelText(en.accounts.currentBalanceLabel), '12.75');
      expect(await screen.findByText(en.accounts.errors.balanceDecimalsNotAllowed)).toBeTruthy();
      fireEvent.press(screen.getByText(en.accounts.save));
      expect(onSubmit).not.toHaveBeenCalled();
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
