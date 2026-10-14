import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { SuccessHost } from '@/components/ui';
import { showSuccess, useSuccessStore } from '@/stores/success-store';
import type { SuccessFeedback } from '@/stores/success-store';
import { colors, motion } from '@/theme';
import { renderWithProviders } from '@/test/render';

// The real icon needs the font; a stub exposes the name and color it was given.
jest.mock('@/components/ui/AppIcon', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    AppIcon: ({ name, color }: { name: string; color: string }) => (
      <Text testID="icon">{`${name}|${color}`}</Text>
    ),
  };
});

const income: SuccessFeedback = {
  icon: 'arrow-up',
  tone: 'positive',
  message: 'Income saved',
  amountText: '+$100.00',
};
const expense: SuccessFeedback = {
  icon: 'arrow-down',
  tone: 'negative',
  message: 'Expense saved',
  amountText: '−$25.50',
};

const iconText = () => screen.getByTestId('icon').props.children;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  useSuccessStore.setState({ current: null });
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const show = (feedback: SuccessFeedback) => act(() => showSuccess(feedback));

describe('SuccessHost', () => {
  it('shows nothing until showSuccess is called', async () => {
    await renderWithProviders(<SuccessHost />);
    expect(screen.queryByText(income.message)).toBeNull();
  });

  it('shows an income card: arrow-up in accent, message and signed amount', async () => {
    await renderWithProviders(<SuccessHost />);
    await show(income);
    expect(await screen.findByText('Income saved')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('+$100.00').props.style).color).toBe(colors.accent);
    expect(iconText()).toBe('arrow-up|accent');
  });

  it('shows an expense card: arrow-down in alert', async () => {
    await renderWithProviders(<SuccessHost />);
    await show(expense);
    expect(await screen.findByText('Expense saved')).toBeTruthy();
    expect(screen.getByText('−$25.50')).toBeTruthy();
    expect(iconText()).toBe('arrow-down|alert');
    expect(StyleSheet.flatten(screen.getByText('−$25.50').props.style).color).toBe(
      colors.alert,
    );
  });

  it('announces the message and amount, and labels the card as an alert', async () => {
    await renderWithProviders(<SuccessHost />);
    await show(income);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Income saved, +$100.00',
    );
    expect(screen.getByRole('alert', { name: 'Income saved, +$100.00' })).toBeTruthy();
  });

  it('works without an amount', async () => {
    await renderWithProviders(<SuccessHost />);
    await show({ icon: 'check', tone: 'positive', message: 'Done' });
    expect(await screen.findByText('Done')).toBeTruthy();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Done');
  });

  it('tapping the card dismisses it sooner', async () => {
    await renderWithProviders(<SuccessHost />);
    await show(income);
    fireEvent.press(await screen.findByText('Income saved'));
    expect(useSuccessStore.getState().current).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(motion.fadeDuration * 5);
    });
    expect(screen.queryByText('Income saved')).toBeNull();
  });

  it('auto-dismisses after the duration, not before', async () => {
    await renderWithProviders(<SuccessHost />);
    await show(income);
    await act(async () => {
      jest.advanceTimersByTime(motion.successDuration - 1);
    });
    expect(useSuccessStore.getState().current).not.toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(useSuccessStore.getState().current).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(motion.fadeDuration * 5);
    });
    expect(screen.queryByText('Income saved')).toBeNull();
  });

  it('a newer card restarts the timer and replaces the old one', async () => {
    await renderWithProviders(<SuccessHost />);
    await show(income);
    await act(async () => {
      jest.advanceTimersByTime(motion.successDuration - 100);
    });
    await show(expense);
    // The second card gets its own full duration, counted from its own show.
    await act(async () => {
      jest.advanceTimersByTime(motion.successDuration - 1);
    });
    expect(useSuccessStore.getState().current?.message).toBe('Expense saved');
    expect(screen.getByText('Expense saved')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(useSuccessStore.getState().current).toBeNull();
  });

  it('clears the timer on unmount', async () => {
    const { unmount } = await renderWithProviders(<SuccessHost />);
    await show(income);
    unmount();
    // The dismiss timer died with the host: it never fires hide().
    await act(async () => {
      jest.advanceTimersByTime(motion.successDuration * 2);
    });
    expect(useSuccessStore.getState().current).not.toBeNull();
  });

  it('uses a plain fade instead of a spring when reduce motion is on', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const Animated = jest.requireActual('react-native').Animated;
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    await renderWithProviders(<SuccessHost />);
    await show(income);
    await screen.findByText('Income saved');
    await act(async () => {});
    expect(spring).not.toHaveBeenCalled();
    expect(timing).toHaveBeenCalled();
  });

  it('bounces in with a spring by default', async () => {
    const Animated = jest.requireActual('react-native').Animated;
    const spring = jest.spyOn(Animated, 'spring');
    await renderWithProviders(<SuccessHost />);
    await show(income);
    await screen.findByText('Income saved');
    await act(async () => {});
    expect(spring).toHaveBeenCalledTimes(1);
  });
});
