// Money is stored as integer cents and formatted only here, at the display
// edge, with the account's currency and the device locale.
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}
