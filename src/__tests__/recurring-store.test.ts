import {
  createRecurring,
  dismissRecurring,
  getRecurring,
  listRecurring,
  removeRecurring,
  updateRecurring,
} from '@/services/recurring';
import type { RecurringInput, RecurringPayment } from '@/services/recurring';
import { AlreadyHandledError, payOccurrence, skipOccurrence } from '@/services/recurring-actions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { silenceConsoleError } from '@/test/console-error';

// Each failure is logged with a "[recurring] <action> failed:" prefix.
const consoleError = silenceConsoleError();

jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  createRecurring: jest.fn(),
  dismissRecurring: jest.fn(),
  getRecurring: jest.fn(),
  listRecurring: jest.fn(),
  updateRecurring: jest.fn(),
  removeRecurring: jest.fn(),
}));
jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  payOccurrence: jest.fn(),
  skipOccurrence: jest.fn(),
}));
jest.mock('@/services/accounts', () => ({
  ...jest.requireActual('@/services/accounts'),
  removeAccount: jest.fn().mockResolvedValue(undefined),
}));

const make = (id: number, accountId: number | null = 1): RecurringPayment => ({
  id,
  accountId,
  name: `Payment ${id}`,
  amountCents: 100,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-01-15',
  endDate: null,
  notifyDaysBefore: '',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const input: RecurringInput = {
  accountId: 1,
  name: 'Rent',
  amount: '1',
  interval: '1',
  unit: 'month',
  startDate: '2026-10-15',
  endDate: null,
  note: '',
  active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  useRecurringStore.setState({ payments: [], status: 'idle' });
  useTransactionsStore.setState({ transactions: [], status: 'ready' });
});

describe('recurring store', () => {
  it('loads in id order', async () => {
    (listRecurring as jest.Mock).mockResolvedValue([make(2), make(1)]);
    await useRecurringStore.getState().load();
    expect(useRecurringStore.getState().status).toBe('ready');
    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([1, 2]);
  });

  it('goes to error when loading fails, and retry recovers', async () => {
    (listRecurring as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await useRecurringStore.getState().load();
    expect(useRecurringStore.getState().status).toBe('error');
    (listRecurring as jest.Mock).mockResolvedValue([make(1)]);
    await useRecurringStore.getState().load();
    expect(useRecurringStore.getState().status).toBe('ready');
    expect(useRecurringStore.getState().payments).toHaveLength(1);
  });

  it('keeps a payment added while the load was in flight', async () => {
    let finish: (rows: RecurringPayment[]) => void = () => {};
    (listRecurring as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const loading = useRecurringStore.getState().load();
    (createRecurring as jest.Mock).mockResolvedValue(make(5));
    await useRecurringStore.getState().add(input);
    finish([make(1)]);
    await loading;
    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([1, 5]);
  });

  it('add resolves the saved payment and stores it; failure resolves null and stores nothing', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(make(1));
    expect(await useRecurringStore.getState().add(input)).toEqual(make(1));
    expect(useRecurringStore.getState().payments).toHaveLength(1);

    (createRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    expect(await useRecurringStore.getState().add(input)).toBeNull();
    expect(useRecurringStore.getState().payments).toHaveLength(1);
  });

  it('logs each failure with its prefix and the error, and nothing on success', async () => {
    const boom = new Error('no such column: interval');
    (listRecurring as jest.Mock).mockRejectedValueOnce(boom);
    await useRecurringStore.getState().load();
    expect(consoleError()).toHaveBeenLastCalledWith('[recurring] list failed:', boom);

    (createRecurring as jest.Mock).mockRejectedValueOnce(boom);
    await useRecurringStore.getState().add(input);
    expect(consoleError()).toHaveBeenLastCalledWith('[recurring] create failed:', boom);

    (updateRecurring as jest.Mock).mockRejectedValueOnce(boom);
    await useRecurringStore.getState().update(1, input);
    expect(consoleError()).toHaveBeenLastCalledWith('[recurring] update failed:', boom);

    (removeRecurring as jest.Mock).mockRejectedValueOnce(boom);
    await useRecurringStore.getState().remove(1);
    expect(consoleError()).toHaveBeenLastCalledWith('[recurring] delete failed:', boom);
    expect(consoleError()).toHaveBeenCalledTimes(4);

    consoleError().mockClear();
    (listRecurring as jest.Mock).mockResolvedValue([]);
    await useRecurringStore.getState().load();
    expect(consoleError()).not.toHaveBeenCalled();
  });

  it('add, update and load handle a payment with no account', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(make(1, null));
    const added = await useRecurringStore.getState().add({ ...input, accountId: null });
    expect(added?.accountId).toBeNull();
    expect((createRecurring as jest.Mock).mock.calls[0][0]).toMatchObject({ accountId: null });

    (updateRecurring as jest.Mock).mockResolvedValue(make(1, 2));
    expect((await useRecurringStore.getState().update(1, input))?.accountId).toBe(2);
    (updateRecurring as jest.Mock).mockResolvedValue(make(1, null));
    expect((await useRecurringStore.getState().update(1, { ...input, accountId: null }))?.accountId).toBeNull();

    useRecurringStore.setState({ payments: [], status: 'idle' });
    (listRecurring as jest.Mock).mockResolvedValue([make(1, null), make(2, 1)]);
    await useRecurringStore.getState().load();
    expect(useRecurringStore.getState().payments.map((item) => item.accountId)).toEqual([null, 1]);
  });

  it('update replaces the payment; failure keeps the old one', async () => {
    useRecurringStore.setState({ payments: [make(1), make(2)], status: 'ready' });
    (updateRecurring as jest.Mock).mockResolvedValue({ ...make(1), name: 'Renamed' });
    const saved = await useRecurringStore.getState().update(1, input);
    expect(saved?.name).toBe('Renamed');
    expect(useRecurringStore.getState().payments.map((item) => item.name)).toEqual([
      'Renamed',
      'Payment 2',
    ]);

    (updateRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    expect(await useRecurringStore.getState().update(2, input)).toBeNull();
    expect(useRecurringStore.getState().payments[1].name).toBe('Payment 2');
  });

  it('remove drops the payment and clears the link on loaded transactions', async () => {
    useRecurringStore.setState({ payments: [make(1), make(2)], status: 'ready' });
    const tx = (id: number, recurringId: number | null) => ({
      id,
      accountId: 1,
      kind: 'expense' as const,
      amountCents: 100,
      date: '2026-03-01T00:00:00.000Z',
      note: null,
      recurringId,
      recurringOccurrence: null,
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    useTransactionsStore.setState({
      transactions: [tx(1, 1), tx(2, 2), tx(3, null)],
      status: 'ready',
    });
    (removeRecurring as jest.Mock).mockResolvedValue(undefined);

    expect(await useRecurringStore.getState().remove(1)).toBe(true);

    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([2]);
    // The transactions stay; only the link is cleared.
    expect(
      useTransactionsStore.getState().transactions.map((item) => [item.id, item.recurringId]),
    ).toEqual([
      [1, null],
      [2, 2],
      [3, null],
    ]);
  });

  it('a failed remove keeps everything', async () => {
    useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
    (removeRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    expect(await useRecurringStore.getState().remove(1)).toBe(false);
    expect(useRecurringStore.getState().payments).toHaveLength(1);
  });

  it('deleting an account drops only its recurring payments from memory', async () => {
    // Payment 4 has no account: it is never dropped with an account.
    useRecurringStore.setState({
      payments: [make(1, 1), make(2, 2), make(3, 1), make(4, null)],
      status: 'ready',
    });
    useAccountsStore.setState({
      accounts: [
        {
          id: 1,
          name: 'A',
          icon: 'bank',
          currency: 'USD',
          inGlobalCap: true,
          createdAt: '',
          balanceAnchorCents: 0,
          balanceAnchorAt: null,
        },
      ],
      status: 'ready',
      saveError: false,
    });
    expect(await useAccountsStore.getState().remove(1)).toBe(true);
    expect(useRecurringStore.getState().payments.map((item) => item.id)).toEqual([2, 4]);
  });

  describe('dismiss', () => {
    it('stores the dismissed occurrence in memory and the database, leaving the confirmation alone', async () => {
      useRecurringStore.setState({
        payments: [{ ...make(1), lastConfirmedAt: '2026-09-15' }, make(2)],
        status: 'ready',
      });
      (dismissRecurring as jest.Mock).mockResolvedValue(undefined);
      expect(await useRecurringStore.getState().dismiss(1, '2026-10-15')).toBe(true);
      expect(dismissRecurring).toHaveBeenCalledWith(1, '2026-10-15');
      const [first, second] = useRecurringStore.getState().payments;
      expect(first).toMatchObject({ dismissedAt: '2026-10-15', lastConfirmedAt: '2026-09-15' });
      expect(second.dismissedAt).toBeNull();
    });

    it('keeps the state and logs when the write fails', async () => {
      useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
      (dismissRecurring as jest.Mock).mockRejectedValue(new Error('db'));
      expect(await useRecurringStore.getState().dismiss(1, '2026-10-15')).toBe(false);
      expect(useRecurringStore.getState().payments[0].dismissedAt).toBeNull();
      expect(consoleError()).toHaveBeenCalledWith('[recurring] dismiss failed:', expect.any(Error));
    });
  });

  describe('pay', () => {
    const paid = (occurrence: string) => ({
      transaction: {
        id: 90,
        accountId: 3,
        kind: 'expense' as const,
        amountCents: 100,
        date: '2026-10-15T12:00:00.000Z',
        note: null,
        recurringId: 1,
        recurringOccurrence: occurrence,
        createdAt: '2026-10-15T12:00:00.000Z',
      },
      payment: { ...make(1), lastConfirmedAt: occurrence },
    });

    it('adds the expense to the transactions store and confirms the occurrence in memory', async () => {
      useRecurringStore.setState({ payments: [make(1), make(2)], status: 'ready' });
      (payOccurrence as jest.Mock).mockResolvedValue(paid('2026-10-15'));
      expect(await useRecurringStore.getState().pay(1, '2026-10-15', 3)).toBe('paid');
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 1,
        occurrence: '2026-10-15',
        accountId: 3,
      });
      expect(useTransactionsStore.getState().transactions).toEqual([paid('2026-10-15').transaction]);
      const [first, second] = useRecurringStore.getState().payments;
      expect(first.lastConfirmedAt).toBe('2026-10-15');
      expect(second.lastConfirmedAt).toBeNull();
    });

    it('two overlapping pay calls add one expense and one confirmation; the duplicate is not an error', async () => {
      useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
      (payOccurrence as jest.Mock)
        .mockResolvedValueOnce(paid('2026-10-15'))
        .mockRejectedValueOnce(new AlreadyHandledError(1, '2026-10-15'));
      const [first, second] = await Promise.all([
        useRecurringStore.getState().pay(1, '2026-10-15', 3),
        useRecurringStore.getState().pay(1, '2026-10-15', 3),
      ]);
      expect([first, second]).toEqual(['paid', 'already']);
      expect(useTransactionsStore.getState().transactions).toHaveLength(1);
      expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe('2026-10-15');
      expect(consoleError()).not.toHaveBeenCalled();
    });

    it('an already-paid occurrence resolves "already", adds nothing and refreshes the payment from the database', async () => {
      // A stale card: memory thinks it is unpaid, the database says it is paid.
      useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
      (payOccurrence as jest.Mock).mockRejectedValue(new AlreadyHandledError(1, '2026-10-15'));
      (getRecurring as jest.Mock).mockResolvedValue({ ...make(1), lastConfirmedAt: '2026-10-15' });
      expect(await useRecurringStore.getState().pay(1, '2026-10-15', 3)).toBe('already');
      expect(useTransactionsStore.getState().transactions).toEqual([]);
      expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe('2026-10-15');
      expect(consoleError()).not.toHaveBeenCalled();
    });

    it('changes nothing and logs when the write fails', async () => {
      useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
      (payOccurrence as jest.Mock).mockRejectedValue(new Error('db'));
      expect(await useRecurringStore.getState().pay(1, '2026-10-15', 3)).toBe('failed');
      expect(useTransactionsStore.getState().transactions).toEqual([]);
      expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBeNull();
      expect(consoleError()).toHaveBeenCalledWith('[recurring] pay failed:', expect.any(Error));
    });
  });

  describe('pay with an amount, and skip', () => {
    it('pay passes the entered amount to the service', async () => {
      useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
      (payOccurrence as jest.Mock).mockResolvedValue({
        transaction: {
          id: 90,
          accountId: 3,
          kind: 'expense',
          amountCents: 2550,
          date: '2026-10-15T12:00:00.000Z',
          note: null,
          recurringId: 1,
          recurringOccurrence: '2026-10-15',
          createdAt: '2026-10-15T12:00:00.000Z',
        },
        payment: { ...make(1), lastConfirmedAt: '2026-10-15' },
      });
      expect(await useRecurringStore.getState().pay(1, '2026-10-15', 3, 2550)).toBe('paid');
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 1,
        occurrence: '2026-10-15',
        accountId: 3,
        amountCents: 2550,
      });
      // The stored payment keeps its own amount.
      expect(useRecurringStore.getState().payments[0].amountCents).toBe(100);
    });

    it('skip confirms the occurrence in memory and adds no transaction', async () => {
      useRecurringStore.setState({ payments: [make(1), make(2)], status: 'ready' });
      (skipOccurrence as jest.Mock).mockResolvedValue({ ...make(1), lastConfirmedAt: '2026-10-15' });
      expect(await useRecurringStore.getState().skip(1, '2026-10-15')).toBe('skipped');
      expect(skipOccurrence).toHaveBeenCalledWith(1, '2026-10-15');
      const [first, second] = useRecurringStore.getState().payments;
      expect(first.lastConfirmedAt).toBe('2026-10-15');
      expect(second.lastConfirmedAt).toBeNull();
      expect(useTransactionsStore.getState().transactions).toEqual([]);
    });

    it('skip of an already handled occurrence resolves "already" and refreshes, without logging', async () => {
      useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
      (skipOccurrence as jest.Mock).mockRejectedValue(new AlreadyHandledError(1, '2026-10-15'));
      (getRecurring as jest.Mock).mockResolvedValue({ ...make(1), lastConfirmedAt: '2026-10-15' });
      expect(await useRecurringStore.getState().skip(1, '2026-10-15')).toBe('already');
      expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe('2026-10-15');
      expect(consoleError()).not.toHaveBeenCalled();
    });

    it('skip changes nothing and logs when the write fails', async () => {
      useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
      (skipOccurrence as jest.Mock).mockRejectedValue(new Error('db'));
      expect(await useRecurringStore.getState().skip(1, '2026-10-15')).toBe('failed');
      expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBeNull();
      expect(consoleError()).toHaveBeenCalledWith('[recurring] skip failed:', expect.any(Error));
    });
  });

  it('setLastConfirmed sets or clears the confirmation of one payment', () => {
    useRecurringStore.setState({
      payments: [{ ...make(1), lastConfirmedAt: '2026-10-15' }, make(2)],
      status: 'ready',
    });
    useRecurringStore.getState().setLastConfirmed(1, '2026-09-15');
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe('2026-09-15');
    useRecurringStore.getState().setLastConfirmed(1, null);
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBeNull();
    expect(useRecurringStore.getState().payments[1].lastConfirmedAt).toBeNull();
  });
});
