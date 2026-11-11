import { screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { LockLoadError } from '@/components/lock-load-error';
import { Screen, ScreenScroll, useScrollEndStyle } from '@/components/ui';
import { layout, sizes, spacing } from '@/theme';
import { renderWithProviders } from '@/test/render';

const insets = { top: 30, right: 0, bottom: 0, left: 0 };

function Probe() {
  return <View testID="probe" style={useScrollEndStyle()} />;
}

const styleOf = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe('Screen layout', () => {
  it('keeps the side margins, a small top gap and no bottom padding', async () => {
    await renderWithProviders(
      <Screen>
        <View />
      </Screen>,
    );

    const style = styleOf('screen-content');
    expect(style.paddingHorizontal).toBe(spacing.lg);
    expect(style.paddingTop).toBe(layout.screenTop);
    expect(layout.screenTop).toBeLessThan(spacing.xl);
    expect(style.paddingBottom).toBeUndefined();
    expect(style.paddingVertical).toBeUndefined();
  });

  it('a headerless screen adds the status bar inset on top', async () => {
    await renderWithProviders(
      <SafeAreaInsetsContext.Provider value={insets}>
        <Screen headerless>
          <View />
        </Screen>
      </SafeAreaInsetsContext.Provider>,
    );

    expect(styleOf('screen-content').paddingTop).toBe(layout.screenTop + insets.top);
    expect(styleOf('screen-content').paddingHorizontal).toBe(spacing.lg);
  });

  it('a screen under a header ignores the inset (the header already has it)', async () => {
    await renderWithProviders(
      <SafeAreaInsetsContext.Provider value={insets}>
        <Screen>
          <View />
        </Screen>
      </SafeAreaInsetsContext.Provider>,
    );

    expect(styleOf('screen-content').paddingTop).toBe(layout.screenTop);
  });

  it('the lock-load error screen is headerless', async () => {
    await renderWithProviders(
      <SafeAreaInsetsContext.Provider value={insets}>
        <LockLoadError />
      </SafeAreaInsetsContext.Provider>,
    );

    expect(styleOf('screen-content').paddingTop).toBe(layout.screenTop + insets.top);
  });

  it('gives scroll content the stack-screen end padding by default', async () => {
    await renderWithProviders(
      <Screen>
        <Probe />
      </Screen>,
    );

    expect(styleOf('probe').paddingBottom).toBe(layout.scrollEnd);
  });

  it('adds nothing above a tab bar without the FAB', async () => {
    await renderWithProviders(
      <Screen bottom="tabBar">
        <Probe />
      </Screen>,
    );

    expect(styleOf('probe').paddingBottom).toBe(0);
  });

  it('lets the last row scroll clear of the FAB', async () => {
    await renderWithProviders(
      <Screen bottom="fab">
        <Probe />
      </Screen>,
    );

    expect(styleOf('probe').paddingBottom).toBe(layout.fabClearance);
    // The FAB plus Paper's 16 px margin under it.
    expect(layout.fabClearance).toBeGreaterThanOrEqual(sizes.fab + spacing.lg);
  });

  it('ScreenScroll pads the content container and keeps the caller style', async () => {
    await renderWithProviders(
      <Screen bottom="fab">
        <ScreenScroll contentContainerStyle={{ gap: spacing.xl }}>
          <View />
        </ScreenScroll>
      </Screen>,
    );

    const style = StyleSheet.flatten(
      screen.getByTestId('screen-scroll').props.contentContainerStyle,
    );
    expect(style).toEqual({ gap: spacing.xl, paddingBottom: layout.fabClearance });
  });
});
