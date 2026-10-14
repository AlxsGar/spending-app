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

export async function renderWithProviders(ui: ReactElement) {
  // The wrapper keeps the providers in place when tests call rerender.
  const result = render(ui, { wrapper: Providers });
  // Let async icon font loading settle so tests do not warn about act.
  await act(async () => {});
  return result;
}
