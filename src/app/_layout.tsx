import { DarkTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider } from 'react-i18next';
import { PaperProvider } from 'react-native-paper';

import { AppGate } from '@/components/app-gate';
import i18n from '@/i18n';
import { colors, paperTheme } from '@/theme';

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accentSecondary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.surface,
    notification: colors.alert,
  },
};

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={navigationTheme}>
          <StatusBar style="light" />
          <AppGate />
        </ThemeProvider>
      </PaperProvider>
    </I18nextProvider>
  );
}
