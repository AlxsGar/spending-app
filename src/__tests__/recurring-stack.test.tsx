import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { RecurringStack } from '@/components/recurring-stack';
import {
  LAYER_TEST_ID,
  SWIPE_TEST_ID,
  layerCount,
  shouldDismissSwipe,
} from '@/components/ui/CardStack';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';
import { getDefaultCurrency, listAccounts } from '@/services/accounts';
import {
  dayToDate,
  dismissRecurring,
  getRecurring,
  listRecurring,
  toDay,
} from '@/services/recurring';
import type { RecurringPayment } from '@/services/recurring';
import { AlreadyHandledError, payOccurrence } from '@/services/recurring-actions';
import { useAccountsStore } from '@/stores/accounts-store';
import { useRecurringStore } from '@/stores/recurring-store';
import { useSuccessStore } from '@/stores/success-store';
import { useTransactionsStore } from '@/stores/transactions-store';
import { silenceConsoleError } from '@/test/console-error';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';
import { colors, deck, motion, sizes, spacing } from '@/theme';

fakeAnimationTimers();
// Failed saves are logged as "[recurring] <action> failed:".
const consoleError = silenceConsoleError();

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/services/accounts', () => ({
  listAccounts: jest.fn(),
  getDefaultCurrency: jest.fn(),
  FALLBACK_CURRENCY: 'MXN',
}));
jest.mock('@/services/recurring', () => ({
  ...jest.requireActual('@/services/recurring'),
  listRecurring: jest.fn(),
  dismissRecurring: jest.fn(),
  getRecurring: jest.fn(),
}));
jest.mock('@/services/recurring-actions', () => ({
  ...jest.requireActual('@/services/recurring-actions'),
  payOccurrence: jest.fn(),
}));

const account = (id: number, name: string, currency: 'USD' | 'JPY') => ({
  id,
  name,
  icon: 'bank' as const,
  currency,
  inGlobalCap: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  balanceAnchorCents: 0,
  balanceAnchorAt: null,
});
const savings = account(7, 'Savings', 'USD');
const yen = account(8, 'Yen wallet', 'JPY');

const payment = (
  id: number,
  name: string,
  amountCents: number,
  extra: Partial<RecurringPayment> = {},
): RecurringPayment => ({
  id,
  accountId: 7,
  name,
  amountCents,
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
  ...extra,
});

const inDays = (days: number) => {
  const now = new Date();
  return toDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
};
const fmt = (day: string) =>
  new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(dayToDate(day));

const rent = () => payment(1, 'Rent', 120000, { startDate: inDays(3) });
const phone = () => payment(2, 'Phone', 1000, { startDate: inDays(1) });
const overdue = () => payment(3, 'Loan', 25000, { startDate: inDays(-4) });

const load = async (payments: RecurringPayment[], accounts = [savings, yen]) => {
  (listAccounts as jest.Mock).mockResolvedValue(accounts);
  (listRecurring as jest.Mock).mockResolvedValue(payments);
  await renderWithProviders(<RecurringStack />);
};

// The card's accessible name, as the stack builds it.
const cardName = (name: string) => new RegExp(`^${name}, `);

beforeEach(() => {
  jest.clearAllMocks();
  mockPush.mockClear();
  (getDefaultCurrency as jest.Mock).mockResolvedValue('MXN');
  (dismissRecurring as jest.Mock).mockResolvedValue(undefined);
  // The refresh after a stale pay: the payment as the database has it.
  (getRecurring as jest.Mock).mockImplementation(async (id: number) =>
    useRecurringStore.getState().payments.find((item) => item.id === id)
      ? { ...useRecurringStore.getState().payments.find((item) => item.id === id), lastConfirmedAt: inDays(3) }
      : null,
  );
  (payOccurrence as jest.Mock).mockImplementation(
    async ({ paymentId, occurrence, accountId }: { paymentId: number; occurrence: string; accountId: number }) => {
      const stored = useRecurringStore.getState().payments.find((item) => item.id === paymentId);
      return {
        transaction: {
          id: 500,
          accountId,
          kind: 'expense' as const,
          amountCents: stored?.amountCents ?? 0,
          date: new Date().toISOString(),
          note: stored?.note ?? null,
          recurringId: paymentId,
          recurringOccurrence: occurrence,
          createdAt: new Date().toISOString(),
        },
        payment: { ...(stored as RecurringPayment), lastConfirmedAt: occurrence },
      };
    },
  );
  useAccountsStore.setState({ accounts: [], status: 'idle', saveError: false });
  useRecurringStore.setState({ payments: [], status: 'idle' });
  useTransactionsStore.setState({ transactions: [], status: 'idle' });
  useSuccessStore.setState({ current: null });
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('which cards show', () => {
  it('shows nothing at all while loading and when there are no recurring payments', async () => {
    await load([]);
    await waitFor(() => expect(useRecurringStore.getState().status).toBe('ready'));
    expect(screen.queryByText(en.recurring.sectionTitle)).toBeNull();
    expect(screen.queryByText(en.recurring.card.seeAll)).toBeNull();
  });

  it('shows the soonest card on top with name, amount, account and due date, and the badge counts the cards', async () => {
    await load([rent(), phone()]);
    expect(await screen.findByText('Phone')).toBeTruthy();
    expect(screen.getByText('$10.00')).toBeTruthy();
    // Top line: account and due date, in one text.
    expect(screen.getByText(`Savings · Due ${fmt(inDays(1))}`)).toBeTruthy();
    // Rent is behind the top card: only a textless layer, so its text is not there.
    expect(screen.queryByText('Rent')).toBeNull();
    expect(screen.getByLabelText('2 payments due soon')).toBeTruthy();
    expect(screen.getByText(en.recurring.card.seeAll)).toBeTruthy();
    // The count is no longer in the section header.
  });

  it('puts an overdue card on top and marks it with the alert label and icon, not by color alone', async () => {
    await load([phone(), overdue()]);
    expect(await screen.findByText('Loan')).toBeTruthy();
    expect(screen.queryByText('Phone')).toBeNull();
    const line = screen.getByText(`Overdue · ${fmt(inDays(-4))}`);
    expect(StyleSheet.flatten(line.props.style).color).toBe(colors.alert);
    expect(screen.getByText('Savings · ')).toBeTruthy();
    expect(screen.getByLabelText(/^Loan, \$250\.00, Savings, Overdue · /)).toBeTruthy();
    expect(screen.getByLabelText('2 payments due soon')).toBeTruthy();
  });

  describe('the deck', () => {
    const layers = () => screen.queryAllByTestId(LAYER_TEST_ID, { includeHiddenElements: true });
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        payment(index + 1, `Pay ${index + 1}`, 100, { startDate: inDays(index + 1) }),
      );

    it.each([
      [1, 0],
      [2, 1],
      [3, 2],
      [5, 2],
    ])('with %i cards there are %i textless layers', async (cards, expected) => {
      await load(many(cards));
      await screen.findByText('Pay 1');
      expect(layers()).toHaveLength(expected);
      expect(layerCount(cards)).toBe(expected);
    });

    it('layers are hidden from screen readers, not touchable, and have no text', async () => {
      await load(many(3));
      await screen.findByText('Pay 1');
      for (const layer of layers()) {
        expect(layer.props.accessibilityElementsHidden).toBe(true);
        expect(layer.props.importantForAccessibility).toBe('no-hide-descendants');
        expect(layer.props.pointerEvents).toBe('none');
      }
      expect(screen.queryByText('Pay 2')).toBeNull();
      expect(screen.queryByText('Pay 3')).toBeNull();
    });

    it('on an overdue card the account shrinks first; the icon and the overdue text never do', async () => {
      await load([overdue(), phone()]);
      const account = await screen.findByText('Savings · ');
      const overdueText = screen.getByText(`Overdue · ${fmt(inDays(-4))}`);
      expect(StyleSheet.flatten(account.props.style).flexShrink).toBe(1);
      expect(StyleSheet.flatten(overdueText.props.style).flexShrink).toBeUndefined();
      // In that row, the account text is the only element that may shrink: the
      // icon and the overdue text keep their size.
      let row = account.parent;
      while (row && StyleSheet.flatten(row.props.style)?.flexDirection !== 'row') row = row.parent;
      expect(row).toBeTruthy();
      const shrinkers = row!.findAll(
        (item) => StyleSheet.flatten(item.props.style)?.flexShrink !== undefined,
      );
      expect(shrinkers.length).toBeGreaterThan(0);
      for (const item of shrinkers) {
        expect(item === account || account.findAll((inner) => inner === item).length > 0 || item.findAll((inner) => inner === account).length > 0).toBe(true);
      }
    });

    it('layer offsets, widths and tints come from the theme deck', async () => {
      await load(many(3));
      await screen.findByText('Pay 1');
      const [deepest, nearest] = layers();
      const pose = (node: typeof nearest) => {
        const style = StyleSheet.flatten(node.props.style);
        const transform = style.transform as { translateY?: number; scaleX?: number }[];
        return {
          opacity: style.opacity,
          translateY: transform.find((item) => item.translateY !== undefined)?.translateY,
          scaleX: transform.find((item) => item.scaleX !== undefined)?.scaleX,
        };
      };
      // Each layer is the text color at the theme's tint opacity.
      for (const layer of [deepest, nearest]) {
        const fills = layer.findAll(
          (item) => StyleSheet.flatten(item.props.style)?.backgroundColor === colors.text,
        );
        expect(fills.length).toBeGreaterThan(0);
      }
      expect(pose(nearest)).toEqual({
        opacity: deck.layerTints[0],
        translateY: deck.layerOffset,
        scaleX: deck.layerWidths[0],
      });
      expect(pose(deepest)).toEqual({
        opacity: deck.layerTints[1],
        translateY: 2 * deck.layerOffset,
        scaleX: deck.layerWidths[1],
      });
    });

    it('the badge shows the card count with two or more cards, and not with one', async () => {
      await load(many(5));
      expect(await screen.findByLabelText('5 payments due soon')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
    });

    it('the badge sits inside the card corner, never outside the deck bounds, and the top line leaves room', async () => {
      await load(many(3));
      const badge = (await screen.findByLabelText('3 payments due soon')).parent;
      // Walk up to the wrapper that positions the badge.
      let node = badge;
      while (node && StyleSheet.flatten(node.props.style)?.position !== 'absolute') node = node.parent;
      const style = StyleSheet.flatten(node?.props.style);
      expect(style.top).toBe(deck.badgeInset);
      expect(style.right).toBe(deck.badgeInset);
      expect(style.top).toBeGreaterThanOrEqual(0);
      expect(style.right).toBeGreaterThanOrEqual(0);
      expect(style.bottom).toBeUndefined();
      expect(style.left).toBeUndefined();
      // The first line stops short of the badge.
      const line = screen.getByText(/^Savings · Due /);
      let wrapper = line.parent;
      while (wrapper && StyleSheet.flatten(wrapper.props.style)?.marginRight === undefined) {
        wrapper = wrapper.parent;
      }
      expect(StyleSheet.flatten(wrapper?.props.style).marginRight).toBe(
        Math.max(0, sizes.badge + deck.badgeInset + spacing.xs - spacing.lg),
      );
    });

    it('no badge and no layers with one card', async () => {
      await load(many(1));
      await screen.findByText('Pay 1');
      expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
      expect(layers()).toHaveLength(0);
    });

    it('the summary card has no layers and no badge', async () => {
      await load([payment(1, 'Far', 100, { startDate: inDays(30) })]);
      await screen.findByText('1 recurring payment');
      expect(layers()).toHaveLength(0);
      expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
    });

    it('the next card moves up after a dismissal, and the deck loses a layer', async () => {
      await load(many(3));
      await screen.findByText('Pay 1');
      expect(layers()).toHaveLength(2);
      fireEvent.press(await screen.findByLabelText(cardName('Pay 1')));
      fireEvent.press(await screen.findByRole('button', { name: en.recurring.card.dismiss }));
      expect(await screen.findByText('Pay 2')).toBeTruthy();
      expect(layers()).toHaveLength(1);
      expect(screen.getByLabelText('2 payments due soon')).toBeTruthy();
    });

    it('has no "and N more" text', async () => {
      await load(many(4));
      await screen.findByText('Pay 1');
      expect(screen.queryByText(/more/i)).toBeNull();
    });
  });

  it('leaves out payments due later than 7 days, inactive ones and dismissed occurrences', async () => {
    await load([
      payment(1, 'Later', 100, { startDate: inDays(8) }),
      payment(2, 'Edge', 100, { startDate: inDays(7) }),
      payment(3, 'Off', 100, { startDate: inDays(1), active: false }),
      payment(4, 'Hidden', 100, { startDate: inDays(2), dismissedAt: inDays(2) }),
    ]);
    expect(await screen.findByText('Edge')).toBeTruthy();
    expect(screen.queryByText('Later')).toBeNull();
    expect(screen.queryByText('Off')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
    // One card left: no badge.
    expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
  });

  it('shows a payment without an account as "Not set" in the default currency', async () => {
    await load([payment(1, 'Loose', 4500, { accountId: null, startDate: inDays(1) })]);
    expect(await screen.findByText('Loose')).toBeTruthy();
    expect(screen.getByText(`Not set · Due ${fmt(inDays(1))}`)).toBeTruthy();
    expect(screen.getByText('MX$45.00')).toBeTruthy();
  });

  it('shows one summary card with plural text when nothing is due, and it opens the list', async () => {
    await load([
      payment(1, 'Far', 100, { startDate: inDays(30) }),
      payment(2, 'Off', 100, { startDate: inDays(1), active: false }),
    ]);
    expect(await screen.findByText('2 recurring payments')).toBeTruthy();
    expect(screen.getByText(en.recurring.card.summaryHint)).toBeTruthy();
    expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
    fireEvent.press(screen.getByText('2 recurring payments'));
    expect(mockPush).toHaveBeenCalledWith('/recurring');
  });

  it('uses the singular summary for one payment', async () => {
    await load([payment(1, 'Far', 100, { startDate: inDays(30) })]);
    expect(await screen.findByText('1 recurring payment')).toBeTruthy();
  });

  it('See all opens the Recurring payments screen', async () => {
    await load([rent()]);
    fireEvent.press(await screen.findByText(en.recurring.card.seeAll));
    expect(mockPush).toHaveBeenCalledWith('/recurring');
  });

  it('is in Spanish too, with the Spanish plurals', async () => {
    await i18n.changeLanguage('es');
    await load([rent(), phone()]);
    expect(await screen.findByLabelText('2 pagos próximos')).toBeTruthy();
    expect(screen.getByText(es.recurring.card.seeAll)).toBeTruthy();
    expect(screen.getByText(/^Savings · Vence el /)).toBeTruthy();
  });

  it('says Sin definir and Vencido in Spanish on the top line', async () => {
    await i18n.changeLanguage('es');
    await load([payment(1, 'Loose', 100, { accountId: null, startDate: inDays(-2) })]);
    expect(await screen.findByText('Loose')).toBeTruthy();
    expect(screen.getByText('Sin definir · ')).toBeTruthy();
    expect(screen.getByText(/^Vencido · /)).toBeTruthy();
  });

  it('shows an error with retry when the recurring payments fail to load', async () => {
    (listAccounts as jest.Mock).mockResolvedValue([savings]);
    (listRecurring as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await renderWithProviders(<RecurringStack />);
    expect(await screen.findByText(en.recurring.card.loadError)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] list failed:', expect.any(Error));
    (listRecurring as jest.Mock).mockResolvedValue([rent()]);
    fireEvent.press(screen.getByText(en.common.retry));
    expect(await screen.findByText('Rent')).toBeTruthy();
  });
});

describe('the modal', () => {
  it('opens on a tap with the summary, Dismiss and Paid', async () => {
    await load([rent()]);
    fireEvent.press(await screen.findByLabelText(cardName('Rent')));
    expect(await screen.findByRole('button', { name: en.recurring.card.dismiss })).toBeTruthy();
    expect(screen.getByRole('button', { name: en.recurring.card.paid })).toBeTruthy();
    // The amount is on the card and in the modal.
    expect(screen.getAllByText('$1,200.00')).toHaveLength(2);
  });

  it('Dismiss in the modal hides the card in the store and the database, and closes', async () => {
    await load([rent(), phone()]);
    fireEvent.press(await screen.findByLabelText(cardName('Phone')));
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.card.dismiss }));

    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledWith(2, inDays(1)));
    await waitFor(() =>
      expect(useRecurringStore.getState().payments.find((item) => item.id === 2)?.dismissedAt).toBe(
        inDays(1),
      ),
    );
    // Rent is now on top; one card left.
    expect(await screen.findByText('Rent')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: en.recurring.card.paid })).toBeNull(),
    );
    // Dismiss does not touch the confirmation.
    expect(useRecurringStore.getState().payments.find((item) => item.id === 2)?.lastConfirmedAt).toBeNull();
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('keeps the modal open with an error when the dismissal cannot be saved', async () => {
    (dismissRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    await load([rent()]);
    fireEvent.press(await screen.findByLabelText(cardName('Rent')));
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.card.dismiss }));
    expect(await screen.findByText(en.recurring.card.dismissError)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] dismiss failed:', expect.any(Error));
    expect(useRecurringStore.getState().payments[0].dismissedAt).toBeNull();
    // One card left: no badge.
    expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
  });
});

describe('swipe to dismiss', () => {
  const swipe = (translationX: number, velocityX = 0) =>
    act(() => {
      fireGestureHandler(getByGestureTestId(SWIPE_TEST_ID), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: Math.min(translationX, 20) },
        { state: State.ACTIVE, translationX },
        { state: State.END, translationX, velocityX },
      ]);
    });

  it('decides by distance or speed to the right only', () => {
    expect(shouldDismissSwipe(motion.swipeDistance, 0)).toBe(true);
    expect(shouldDismissSwipe(motion.swipeDistance - 1, 0)).toBe(false);
    expect(shouldDismissSwipe(10, motion.swipeVelocity)).toBe(true);
    expect(shouldDismissSwipe(10, motion.swipeVelocity - 1)).toBe(false);
    expect(shouldDismissSwipe(-200, -2000)).toBe(false);
  });

  it('a long swipe right dismisses the top card', async () => {
    await load([rent(), phone()]);
    await screen.findByText('Phone');
    swipe(motion.swipeDistance + 40);
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledWith(2, inDays(1)));
    expect(await screen.findByText('Rent')).toBeTruthy();
    expect(screen.queryByText('Phone')).toBeNull();
    // One card left: no badge.
    expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
  });

  it('a fast flick dismisses it even over a short distance', async () => {
    await load([rent()]);
    await screen.findByText('Rent');
    swipe(30, motion.swipeVelocity + 100);
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledWith(1, inDays(3)));
  });

  it('a short, slow swipe leaves the card where it is', async () => {
    await load([rent()]);
    await screen.findByText('Rent');
    swipe(motion.swipeDistance - 30);
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(dismissRecurring).not.toHaveBeenCalled();
    expect(screen.getByText('Rent')).toBeTruthy();
  });

  it('with reduce motion on, the swipe still dismisses (no slide)', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await load([rent()]);
    await screen.findByText('Rent');
    swipe(motion.swipeDistance + 40);
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledWith(1, inDays(3)));
  });

  it('brings the card back when the dismissal cannot be saved', async () => {
    (dismissRecurring as jest.Mock).mockRejectedValue(new Error('db'));
    await load([rent()]);
    await screen.findByText('Rent');
    swipe(motion.swipeDistance + 40);
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalled());
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(useRecurringStore.getState().payments[0].dismissedAt).toBeNull();
    // It can be swiped again.
    (dismissRecurring as jest.Mock).mockResolvedValue(undefined);
    await act(async () => {});
    swipe(motion.swipeDistance + 40);
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledTimes(2));
  });

  it('offers Dismiss as an accessibility action on the top card, and as a button in the modal', async () => {
    await load([rent()]);
    const card = await screen.findByLabelText(cardName('Rent'));
    expect(card.props.accessibilityActions).toEqual([
      { name: 'dismiss', label: en.recurring.card.dismiss },
    ]);
    expect(card.props.accessibilityHint).toBe(en.recurring.card.hint);
    act(() => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    });
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledWith(1, inDays(3)));
    await waitFor(() => expect(screen.queryByText('Rent')).toBeNull());
  });
});

describe('repeated triggers before a re-render', () => {
  it('the dismiss accessibility action fired twice dismisses once', async () => {
    await load([rent()]);
    const card = await screen.findByLabelText(cardName('Rent'));
    act(() => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    });
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledTimes(1));
  });

  it('two swipe ends dismiss once', async () => {
    await load([rent()]);
    await screen.findByText('Rent');
    act(() => {
      const target = getByGestureTestId(SWIPE_TEST_ID);
      for (let i = 0; i < 2; i++) {
        fireGestureHandler(target, [
          { state: State.BEGAN },
          { state: State.ACTIVE, translationX: 200 },
          { state: State.END, translationX: 200, velocityX: 0 },
        ]);
      }
    });
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledTimes(1));
  });

  it('a second action after a failed one is allowed again', async () => {
    (dismissRecurring as jest.Mock).mockRejectedValueOnce(new Error('db'));
    await load([rent()]);
    const card = await screen.findByLabelText(cardName('Rent'));
    act(() => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    });
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledTimes(1));
    await act(async () => {});
    act(() => {
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dismiss' } });
    });
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledTimes(2));
  });

  it('Paid pressed twice in the same tick pays once', async () => {
    await load([rent()]);
    fireEvent.press(await screen.findByLabelText(cardName('Rent')));
    const paid = await screen.findByRole('button', { name: en.recurring.card.paid });
    act(() => {
      fireEvent.press(paid);
      fireEvent.press(paid);
    });
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
    expect(useTransactionsStore.getState().transactions).toHaveLength(1);
  });

  it('Dismiss pressed twice, or Paid then Dismiss, writes once', async () => {
    await load([rent()]);
    fireEvent.press(await screen.findByLabelText(cardName('Rent')));
    const dismiss = await screen.findByRole('button', { name: en.recurring.card.dismiss });
    const paid = screen.getByRole('button', { name: en.recurring.card.paid });
    act(() => {
      fireEvent.press(dismiss);
      fireEvent.press(dismiss);
      fireEvent.press(paid);
    });
    await waitFor(() => expect(dismissRecurring).toHaveBeenCalledTimes(1));
    expect(payOccurrence).not.toHaveBeenCalled();
  });

  it('an account row tapped twice pays once', async () => {
    await load([payment(1, 'Loose', 4500, { accountId: null, startDate: inDays(1) })]);
    fireEvent.press(await screen.findByLabelText(cardName('Loose')));
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.card.paid }));
    const row = await screen.findByText('Yen wallet');
    act(() => {
      fireEvent.press(row);
      fireEvent.press(row);
    });
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
  });
});

describe('Paid', () => {
  const openPaid = async (name: string) => {
    fireEvent.press(await screen.findByLabelText(cardName(name)));
    fireEvent.press(await screen.findByRole('button', { name: en.recurring.card.paid }));
  };

  it('with an account records one linked expense for that occurrence, confirms it and shows the success card', async () => {
    await load([rent(), phone()]);
    await openPaid('Phone');

    await waitFor(() =>
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 2,
        occurrence: inDays(1),
        accountId: 7,
      }),
    );
    expect(payOccurrence).toHaveBeenCalledTimes(1);
    const added = useTransactionsStore.getState().transactions;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      accountId: 7,
      kind: 'expense',
      amountCents: 1000,
      recurringId: 2,
      recurringOccurrence: inDays(1),
    });
    expect(useRecurringStore.getState().payments.find((item) => item.id === 2)?.lastConfirmedAt).toBe(
      inDays(1),
    );
    expect(useSuccessStore.getState().current).toMatchObject({
      message: en.recurring.pay.recorded,
      detail: 'Phone',
      tone: 'negative',
    });
    // Phone's occurrence is paid, so its card is gone and Rent is on top.
    expect(await screen.findByText('Rent')).toBeTruthy();
    // One card left: no badge.
    expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
    expect(screen.queryByRole('button', { name: en.recurring.card.paid })).toBeNull();
  });

  it('the success text is in Spanish', async () => {
    await i18n.changeLanguage('es');
    await load([rent()]);
    fireEvent.press(await screen.findByLabelText(cardName('Rent')));
    fireEvent.press(await screen.findByRole('button', { name: es.recurring.card.paid }));
    await waitFor(() =>
      expect(useSuccessStore.getState().current).toMatchObject({
        message: es.recurring.pay.recorded,
        detail: 'Rent',
      }),
    );
  });

  it('a stale card (already paid elsewhere) closes the dialog with no "Payment recorded" card and no error', async () => {
    (payOccurrence as jest.Mock).mockRejectedValue(new AlreadyHandledError(1, inDays(3)));
    await load([rent()]);
    await openPaid('Rent');
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: en.recurring.card.paid })).toBeNull(),
    );
    expect(useSuccessStore.getState().current).toBeNull();
    expect(screen.queryByText(en.recurring.pay.error)).toBeNull();
    expect(useTransactionsStore.getState().transactions).toHaveLength(0);
    expect(consoleError()).not.toHaveBeenCalled();
    // The stale card is gone: the refreshed payment is confirmed for it.
    await waitFor(() => expect(screen.queryByText('Rent')).toBeNull());
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe(inDays(3));
  });

  it('a genuine double tap in one dialog shows the success card once', async () => {
    const shown: string[] = [];
    const unsubscribe = useSuccessStore.subscribe((state) => {
      if (state.current) shown.push(state.current.message);
    });
    await load([rent()]);
    fireEvent.press(await screen.findByLabelText(cardName('Rent')));
    const paid = await screen.findByRole('button', { name: en.recurring.card.paid });
    act(() => {
      fireEvent.press(paid);
      fireEvent.press(paid);
    });
    await waitFor(() => expect(shown).toEqual([en.recurring.pay.recorded]));
    expect(payOccurrence).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('can pay an occurrence that is not due yet (inside the window)', async () => {
    await load([payment(1, 'Soon', 5000, { startDate: inDays(7) })]);
    await openPaid('Soon');
    await waitFor(() => expect(payOccurrence).toHaveBeenCalledWith(expect.objectContaining({ occurrence: inDays(7) })));
  });

  it('pays an overdue occurrence with that occurrence, not today', async () => {
    await load([overdue()]);
    await openPaid('Loan');
    await waitFor(() =>
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 3,
        occurrence: inDays(-4),
        accountId: 7,
      }),
    );
  });

  it('after a dismissed overdue occurrence, the next one shows as a normal card and can be paid', async () => {
    // Weekly: the occurrence 4 days ago is overdue and dismissed; the next is in 3 days.
    await load([
      payment(4, 'Weekly', 2000, { unit: 'week', startDate: inDays(-4), dismissedAt: inDays(-4) }),
    ]);
    expect(await screen.findByText(`Savings · Due ${fmt(inDays(3))}`)).toBeTruthy();
    expect(screen.queryByText(/^Overdue/)).toBeNull();
    // One card left: no badge.
    expect(screen.queryByLabelText(/payments? due soon/)).toBeNull();
    await openPaid('Weekly');
    await waitFor(() =>
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 4,
        occurrence: inDays(3),
        accountId: 7,
      }),
    );
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBe(inDays(3));
  });

  it('with no account asks which one, in the same dialog, and pays from the chosen one', async () => {
    await load([payment(1, 'Loose', 4500, { accountId: null, startDate: inDays(1) })]);
    await openPaid('Loose');

    // One dialog at a time: the account list replaces the summary.
    expect(await screen.findByText(en.recurring.pay.accountTitle)).toBeTruthy();
    expect(screen.queryByRole('button', { name: en.recurring.card.paid })).toBeNull();
    expect(payOccurrence).not.toHaveBeenCalled();
    // Required: there is no way to pay without choosing (Cancel only leaves).
    fireEvent.press(screen.getByText('Yen wallet'));

    await waitFor(() =>
      expect(payOccurrence).toHaveBeenCalledWith({
        paymentId: 1,
        occurrence: inDays(1),
        accountId: 8,
      }),
    );
    // The payment's own account is untouched; only the expense has the account.
    expect(useRecurringStore.getState().payments[0].accountId).toBeNull();
    expect(useTransactionsStore.getState().transactions[0]).toMatchObject({
      accountId: 8,
      amountCents: 4500,
    });
    expect(useSuccessStore.getState().current).toMatchObject({ detail: 'Loose' });
  });

  it('Cancel in the account list pays nothing and closes', async () => {
    await load([payment(1, 'Loose', 4500, { accountId: null, startDate: inDays(1) })]);
    await openPaid('Loose');
    await screen.findByText(en.recurring.pay.accountTitle);
    fireEvent.press(screen.getByText(en.common.cancel));
    await waitFor(() => expect(screen.queryByText(en.recurring.pay.accountTitle)).toBeNull());
    expect(payOccurrence).not.toHaveBeenCalled();
    expect(useTransactionsStore.getState().transactions).toHaveLength(0);
  });

  it('with no accounts at all explains and offers Add account', async () => {
    await load([payment(1, 'Loose', 4500, { accountId: null, startDate: inDays(1) })], []);
    await openPaid('Loose');
    expect(await screen.findByText(en.recurring.pay.noAccounts)).toBeTruthy();
    fireEvent.press(screen.getByText(en.transactions.noAccountsAction));
    expect(mockPush).toHaveBeenCalledWith('/account/new');
    expect(payOccurrence).not.toHaveBeenCalled();
  });

  it('keeps the modal open with an inline error when the payment cannot be saved', async () => {
    (payOccurrence as jest.Mock).mockRejectedValue(new Error('db'));
    await load([rent()]);
    await openPaid('Rent');
    expect(await screen.findByText(en.recurring.pay.error)).toBeTruthy();
    expect(consoleError()).toHaveBeenCalledWith('[recurring] pay failed:', expect.any(Error));
    expect(useTransactionsStore.getState().transactions).toHaveLength(0);
    expect(useRecurringStore.getState().payments[0].lastConfirmedAt).toBeNull();
    expect(useSuccessStore.getState().current).toBeNull();
    // Still there to try again.
    expect(screen.getByRole('button', { name: en.recurring.card.paid })).toBeTruthy();
  });
});

describe('the day changes', () => {
  it('re-evaluates the cards at midnight', async () => {
    jest.setSystemTime(new Date(2026, 10, 5, 23, 59, 0));
    await load([payment(1, 'Rent', 100, { startDate: '2026-11-06' })]);
    expect(await screen.findByText('Savings · Due Nov 6, 2026')).toBeTruthy();

    await act(async () => {
      jest.setSystemTime(new Date(2026, 10, 6, 0, 0, 5));
      jest.advanceTimersByTime(90_000);
    });
    expect(await screen.findByText('Savings · Due today')).toBeTruthy();
  });

  it('re-evaluates when the app returns to the foreground', async () => {
    const handlers: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      type: string,
      handler: (state: string) => void,
    ) => {
      if (type === 'change') handlers.push(handler);
      return { remove: jest.fn() };
    }) as never);
    jest.setSystemTime(new Date(2026, 10, 5, 12, 0, 0));
    await load([payment(1, 'Rent', 100, { startDate: '2026-11-05' })]);
    expect(await screen.findByText('Savings · Due today')).toBeTruthy();

    // The phone slept for two days; the midnight timer never ran.
    jest.setSystemTime(new Date(2026, 10, 7, 12, 0, 0));
    expect(screen.getByText('Savings · Due today')).toBeTruthy();
    act(() => {
      handlers.forEach((handler) => handler('active'));
    });
    expect(await screen.findByText('Overdue · Nov 5, 2026')).toBeTruthy();
    expect(screen.queryByText('Savings · Due today')).toBeNull();
  });
});
