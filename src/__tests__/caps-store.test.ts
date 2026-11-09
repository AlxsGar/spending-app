import { listCaps, saveGlobalCap } from '@/services/soft-caps';
import { useCapsStore } from '@/stores/caps-store';

jest.mock('@/services/soft-caps', () => ({
  listCaps: jest.fn(),
  saveGlobalCap: jest.fn(),
}));

const cap = (id: number, accountId: number | null, amountCents = 100) => ({
  id,
  accountId,
  period: 'week' as const,
  amountCents,
});

beforeEach(() => {
  jest.clearAllMocks();
  useCapsStore.setState({ caps: [], status: 'idle', saveError: false });
});

describe('caps store', () => {
  it('loads once, goes ready, and ends in error when the read fails', async () => {
    (listCaps as jest.Mock).mockResolvedValueOnce([cap(1, null)]);
    await useCapsStore.getState().load();
    expect(useCapsStore.getState()).toMatchObject({ status: 'ready', caps: [cap(1, null)] });

    (listCaps as jest.Mock).mockRejectedValueOnce(new Error('db'));
    useCapsStore.setState({ status: 'idle' });
    await useCapsStore.getState().load();
    expect(useCapsStore.getState().status).toBe('error');
  });

  it('setGlobal saves, then reads the caps again', async () => {
    (saveGlobalCap as jest.Mock).mockResolvedValue(undefined);
    (listCaps as jest.Mock).mockResolvedValue([cap(1, null, 500)]);
    const ok = await useCapsStore
      .getState()
      .setGlobal({ amount: '5', period: 'week' }, 'MXN');
    expect(ok).toBe(true);
    expect(saveGlobalCap).toHaveBeenCalledWith({ amount: '5', period: 'week' }, 'MXN');
    expect(useCapsStore.getState()).toMatchObject({ caps: [cap(1, null, 500)], saveError: false });
  });

  it('setGlobal reports a failed save and keeps the caps', async () => {
    useCapsStore.setState({ caps: [cap(1, null)], status: 'ready' });
    (saveGlobalCap as jest.Mock).mockRejectedValue(new Error('db'));
    const ok = await useCapsStore.getState().setGlobal({ amount: '5', period: 'week' }, 'MXN');
    expect(ok).toBe(false);
    expect(useCapsStore.getState()).toMatchObject({ caps: [cap(1, null)], saveError: true });
  });

  it('the newest read wins when two overlap', async () => {
    let finishFirst: (rows: unknown[]) => void = () => {};
    (listCaps as jest.Mock)
      .mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValueOnce([cap(2, null, 900)]);
    const first = useCapsStore.getState().refresh();
    await useCapsStore.getState().refresh();
    finishFirst([cap(1, null, 100)]);
    await first;
    expect(useCapsStore.getState().caps).toEqual([cap(2, null, 900)]);
  });

  it('dropForAccount removes only that account cap', () => {
    useCapsStore.setState({ caps: [cap(1, null), cap(2, 7), cap(3, 8)], status: 'ready' });
    useCapsStore.getState().dropForAccount(7);
    expect(useCapsStore.getState().caps.map((item) => item.id)).toEqual([1, 3]);
  });
});
