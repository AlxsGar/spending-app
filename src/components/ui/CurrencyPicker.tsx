import { OptionPicker } from './OptionPicker';

type Props<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  label: string;
  title: string;
  cancelLabel: string;
  errorText?: string;
};

// A currency is its own label, so this is OptionPicker with value = label.
export function CurrencyPicker<T extends string>({ options, ...rest }: Props<T>) {
  return (
    <OptionPicker
      {...rest}
      options={options.map((option) => ({ value: option, label: option }))}
    />
  );
}
