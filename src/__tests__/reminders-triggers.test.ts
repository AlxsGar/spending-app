import { removeAccount, updateAccount } from '@/services/accounts';
import {
  createRecurring,
  dismissRecurring,
  removeRecurring,
  updateRecurring,
} from '@/services/recurring';
import type { RecurringInput, RecurringPayment } from '@/services/recurring';
import { AlreadyHandledError, payOccurrence, skipOccurrence } from '@/services/recurring-actions';
import { requestReminderSync } from '@/services/reminders';
import { useAccountsStore } from '@/stores/accounts-store';
import { useRecurringStore } from '@/stores/recurring-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { silenceConsoleError } from '@/test/console-error';

silenceConsoleError();

jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  createRecurring: jest.fn(),
  dismissRecurring: jest.fn(),
  getRecurring: jest.fn(),
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
  removeAccount: jest.fn(),
  updateAccount: jest.fn(),
}));

const sync = requestReminderSync as jest.Mock;

const make = (id: number): RecurringPayment => ({
  id,
  accountId: 1,
  name: `Payment ${id}`,
  amountCents: 100,
  note: null,
  interval: 1,
  unit: 'month',
  startDate: '2026-01-15',
  endDate: null,
  notifyDaysBefore: '1,0',
  active: true,
  lastConfirmedAt: null,
  dismissedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const input = {
  accountId: 1,
  name: 'Rent',
  amount: '1',
  interval: '1',
  unit: 'month',
  startDate: '2026-10-15',
  endDate: null,
  note: '',
  active: true,
} as RecurringInput;

beforeEach(() => {
  jest.clearAllMocks();
  useRecurringStore.setState({ payments: [make(1)], status: 'ready' });
  useTransactionsStore.setState({ transactions: [], status: 'ready' });
  useAccountsStore.setState({ accounts: [], status: 'ready', saveError: false });
});

describe('reminders are synced from the stores after a successful write', () => {
  it('create', async () => {
    (createRecurring as jest.Mock).mockResolvedValue(make(2));
    await useRecurringStore.getState().add(input);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('edit (also covers activate and deactivate)', async () => {
    (updateRecurring as jest.Mock).mockResolvedValue(make(1));
    await useRecurringStore.getState().update(1, input);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('delete', async () => {
    (removeRecurring as jest.Mock).mockResolvedValue(undefined);
    await useRecurringStore.getState().remove(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('pay', async () => {
    (payOccurrence as jest.Mock).mockResolvedValue({
      transaction: { id: 9, accountId: 1, kind: 'expense', amountCents: 1, date: 'd', note: null },
      payment: { ...make(1), lastConfirmedAt: '2026-10-15' },
    });
    expect(await useRecurringStore.getState().pay(1, '2026-10-15', 1)).toBe('paid');
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('skip', async () => {
    (skipOccurrence as jest.Mock).mockResolvedValue({ ...make(1), lastConfirmedAt: '2026-10-15' });
    expect(await useRecurringStore.getState().skip(1, '2026-10-15')).toBe('skipped');
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('undo on expense delete (last confirmed set back)', () => {
    useRecurringStore.getState().setLastConfirmed(1, null);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('account delete (the cascade removes its payments)', async () => {
    (removeAccount as jest.Mock).mockResolvedValue(undefined);
    await useAccountsStore.getState().remove(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('account edit (the amount is shown in its currency)', async () => {
    (updateAccount as jest.Mock).mockResolvedValue({ id: 1 });
    await useAccountsStore.getState().update(1, {} as never);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

describe('reminders are not synced when nothing changed', () => {
  it('a failed create, edit, delete, pay or skip', async () => {
    (createRecurring as jest.Mock).mockRejectedValue(new Error('x'));
    (updateRecurring as jest.Mock).mockRejectedValue(new Error('x'));
    (removeRecurring as jest.Mock).mockRejectedValue(new Error('x'));
    (payOccurrence as jest.Mock).mockRejectedValue(new Error('x'));
    (skipOccurrence as jest.Mock).mockRejectedValue(new Error('x'));
    const store = useRecurringStore.getState();
    await store.add(input);
    await store.update(1, input);
    await store.remove(1);
    await store.pay(1, '2026-10-15', 1);
    await store.skip(1, '2026-10-15');
    expect(sync).not.toHaveBeenCalled();
  });

  it('a stale pay or skip (already handled) writes nothing', async () => {
    (payOccurrence as jest.Mock).mockRejectedValue(new AlreadyHandledError(1, '2026-10-15'));
    (skipOccurrence as jest.Mock).mockRejectedValue(new AlreadyHandledError(1, '2026-10-15'));
    await useRecurringStore.getState().pay(1, '2026-10-15', 1);
    await useRecurringStore.getState().skip(1, '2026-10-15');
    expect(sync).not.toHaveBeenCalled();
  });

  it('dismiss never touches reminders', async () => {
    (dismissRecurring as jest.Mock).mockResolvedValue(undefined);
    await useRecurringStore.getState().dismiss(1, '2026-10-15');
    expect(sync).not.toHaveBeenCalled();
  });
});
