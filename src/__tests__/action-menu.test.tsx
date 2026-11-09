import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ActionMenu } from '@/components/ui';
import { fakeAnimationTimers, renderWithProviders } from '@/test/render';

fakeAnimationTimers();

const setup = async () => {
  const pay = jest.fn();
  const edit = jest.fn();
  await renderWithProviders(
    <ActionMenu
      accessibilityLabel="Actions for Rent"
      title="Rent"
      subtitle="Due today"
      cancelLabel="Cancel"
      actions={[
        { label: 'Pay Nov 1', icon: 'cash-check', onPress: pay },
        { label: 'Edit', icon: 'pencil', onPress: edit },
      ]}
    />,
  );
  return { pay, edit };
};

describe('ActionMenu', () => {
  it('has a labelled ⋮ button and shows nothing until it is pressed', async () => {
    await setup();
    expect(screen.getByLabelText('Actions for Rent')).toBeTruthy();
    expect(screen.queryByText('Pay Nov 1')).toBeNull();
  });

  it('opens a dialog with the title, the subtitle and the actions in order', async () => {
    await setup();
    fireEvent.press(screen.getByLabelText('Actions for Rent'));
    expect(await screen.findByText('Rent')).toBeTruthy();
    expect(screen.getByText('Due today')).toBeTruthy();
    const labels = screen.getAllByText(/^(Pay Nov 1|Edit)$/).map((node) => node.props.children);
    expect(labels).toEqual(['Pay Nov 1', 'Edit']);
  });

  it('an action closes the dialog and runs once', async () => {
    const { pay, edit } = await setup();
    fireEvent.press(screen.getByLabelText('Actions for Rent'));
    fireEvent.press(await screen.findByText('Pay Nov 1'));
    expect(pay).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Pay Nov 1')).toBeNull());
  });

  it('only the first action press in an open dialog runs, even before it re-renders', async () => {
    const { pay, edit } = await setup();
    fireEvent.press(screen.getByLabelText('Actions for Rent'));
    const payRow = await screen.findByText('Pay Nov 1');
    const editRow = screen.getByText('Edit');
    fireEvent.press(payRow);
    fireEvent.press(editRow);
    fireEvent.press(payRow);
    expect(pay).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  });

  it('Cancel closes it without running anything', async () => {
    const { pay, edit } = await setup();
    fireEvent.press(screen.getByLabelText('Actions for Rent'));
    await screen.findByText('Pay Nov 1');
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Pay Nov 1')).toBeNull());
    expect(pay).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
  });
});
