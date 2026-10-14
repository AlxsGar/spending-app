import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SettingRow } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

describe('SettingRow', () => {
  it('shows the label and its control', async () => {
    await renderWithProviders(
      <SettingRow label="Language">
        <Text>control</Text>
      </SettingRow>,
    );
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByText('control')).toBeTruthy();
    expect(screen.queryByText('Could not save')).toBeNull();
  });

  it('shows the error line when errorText is set', async () => {
    await renderWithProviders(
      <SettingRow label="Language" errorText="Could not save">
        <Text>control</Text>
      </SettingRow>,
    );
    expect(screen.getByText('Could not save')).toBeTruthy();
  });
});
