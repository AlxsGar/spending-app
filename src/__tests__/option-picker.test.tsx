import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { OptionPicker } from '@/components/ui';
import { renderWithProviders } from '@/test/render';

const LONG = 'A'.repeat(40);
const options = [
  { value: '1', label: 'Checking' },
  { value: '2', label: LONG },
];

function Harness({ onChange = jest.fn(), errorText }: { onChange?: jest.Mock; errorText?: string }) {
  const [value, setValue] = useState('1');
  return (
    <OptionPicker
      value={value}
      options={options}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      label="Account"
      title="Choose account"
      cancelLabel="Cancel"
      errorText={errorText}
    />
  );
}

const field = () => screen.getByDisplayValue(/Checking|A{40}/, { includeHiddenElements: true });

describe('OptionPicker', () => {
  it('shows the label and the selected option in a read-only field', async () => {
    await renderWithProviders(<Harness />);
    expect(field().props.value).toBe('Checking');
    expect(
      screen.getAllByText('Account', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Choose account')).toBeNull();
  });

  it('cannot be typed into', async () => {
    await renderWithProviders(<Harness />);
    expect(field().props.editable).toBe(false);
    expect(field().props.caretHidden).toBe(true);
    expect(field().props.showSoftInputOnFocus).toBe(false);
  });

  it('is one button announced with its label and value', async () => {
    await renderWithProviders(<Harness />);
    const button = screen.getByRole('button', { name: 'Account, Checking' });
    expect(button).toBeTruthy();
  });

  it('opens the dialog when pressed', async () => {
    await renderWithProviders(<Harness />);
    fireEvent.press(screen.getByLabelText('Account, Checking'));
    expect(await screen.findByText('Choose account')).toBeTruthy();
    expect(screen.getByText(LONG)).toBeTruthy();
  });

  it('selecting an option updates the value and closes', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Harness onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Account, Checking'));
    fireEvent.press(await screen.findByText(LONG));
    expect(onChange).toHaveBeenCalledWith('2');
    await waitFor(() => expect(screen.queryByText('Choose account')).toBeNull());
    expect(field().props.value).toBe(LONG);
    expect(screen.getByLabelText(`Account, ${LONG}`)).toBeTruthy();
  });

  it('Cancel keeps the value', async () => {
    const onChange = jest.fn();
    await renderWithProviders(<Harness onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Account, Checking'));
    await screen.findByText('Choose account');
    fireEvent.press(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Choose account')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
    expect(field().props.value).toBe('Checking');
  });

  it('keeps a long name on one line inside the field', async () => {
    await renderWithProviders(<Harness />);
    fireEvent.press(screen.getByLabelText('Account, Checking'));
    fireEvent.press(await screen.findByText(LONG));
    expect(field().props.numberOfLines).toBe(1);
    expect(field().props.multiline).toBeFalsy();
  });

  it('shows error text like TextField does', async () => {
    await renderWithProviders(<Harness errorText="Choose an account." />);
    expect(screen.getByText('Choose an account.')).toBeTruthy();
  });
});
