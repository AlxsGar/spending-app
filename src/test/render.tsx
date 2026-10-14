import { act, render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { PaperProvider } from 'react-native-paper';

import i18n from '@/i18n';
import { paperTheme } from '@/theme';

function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <PaperProvider theme={paperTheme}>{children}</PaperProvider>
    </I18nextProvider>
  );
}

// Paper's FAB.Group, Modal and Dialog finish their open/close animations from a
// timer (Animated's end callback) and then set state. On real timers that
// callback can fire when the test is not inside act(), which prints a React
// "not wrapped in act(...)" warning. Call this once at the top of a test file
// that opens or closes them: timers are then faked, so an animation only ends
// when a test waits (findBy/waitFor advance fake timers themselves). Nothing is
// silenced.
//
// Fake timers also freeze Date, so a test that compares "now" must advance time
// explicitly (jest.setSystemTime / advanceTimersByTime).
//
// At the end of each test the pending timers are drained inside act() and real
// timers are restored. RNTL's auto-cleanup is registered first (when it is
// imported) and Jest runs afterEach hooks in registration order, so the screen
// is already unmounted by then: the drain only makes sure no animation timer is
// left to fire later, outside act(), on a real clock. It does not exercise
// state updates of mounted components.
export function fakeAnimationTimers() {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterEach(async () => {
    try {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
    } finally {
      jest.useRealTimers();
    }
  });
}

export async function renderWithProviders(ui: ReactElement) {
  // The wrapper keeps the providers in place when tests call rerender.
  const result = render(ui, { wrapper: Providers });
  // Let async icon font loading settle so tests do not warn about act.
  await act(async () => {});
  return result;
}
