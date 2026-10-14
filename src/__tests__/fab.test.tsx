import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { Fab } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

const actions = (onA: () => void, onB: () => void) => [
  { key: 'a', label: 'Option A', icon: 'plus', onPress: onA },
  { key: 'b', label: 'Option B', icon: 'plus', onPress: onB },
];

describe('Fab', () => {
  it('stays closed after losing and regaining focus', async () => {
    const list = actions(jest.fn(), jest.fn());
    const { rerender } = await renderWithProviders(<Fab label="Add" actions={list} />);

    fireEvent.press(screen.getByLabelText('Add'));
    expect(await screen.findByLabelText('Option A')).toBeTruthy();

    rerender(<Fab label="Add" actions={list} visible={false} />);
    rerender(<Fab label="Add" actions={list} visible />);

    await waitFor(() => {
      expect(screen.queryByLabelText('Option A')).toBeNull();
      expect(screen.queryByLabelText('Option B')).toBeNull();
    });
  });

  it('opens, runs the pressed action, and closes', async () => {
    const onA = jest.fn();
    const onB = jest.fn();
    await renderWithProviders(<Fab label="Add" actions={actions(onA, onB)} />);

    // Paper hides the action items from accessibility while closed, so the
    // actions are looked up by their accessibility label.
    expect(screen.queryByLabelText('Option A')).toBeNull();
    fireEvent.press(screen.getByLabelText('Add'));
    expect(await screen.findByLabelText('Option A')).toBeTruthy();
    expect(screen.getByLabelText('Option B')).toBeTruthy();

    // Paper marks the inner label hidden from accessibility, but it is the
    // pressable target.
    fireEvent.press(screen.getByText('Option B', { includeHiddenElements: true }));

    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByLabelText('Option A')).toBeNull();
      expect(screen.queryByLabelText('Option B')).toBeNull();
    });
  });
});
