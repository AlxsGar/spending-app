// Money is stored as integer cents and formatted only here, at the display
// edge, with the account's currency and the device locale.
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

const MINUS = '−';

// Signed display: a real minus sign for negatives, an optional plus for
// positives, so meaning never depends on color alone.
export function formatSignedMoney(
  cents: number,
  currency: string,
  options: { showPlus?: boolean } = {},
): string {
  if (cents < 0) return `${MINUS}${formatMoney(-cents, currency)}`;
  if (cents > 0 && options.showPlus) return `+${formatMoney(cents, currency)}`;
  return formatMoney(cents, currency);
}

// 999,999,999.99 in cents.
export const MAX_AMOUNT_CENTS = 99_999_999_999;

// Currencies that have no minor unit in this app.
const NO_DECIMAL_CURRENCIES: readonly string[] = ['JPY'];

export type AmountParseError =
  | 'empty'
  | 'invalid'
  | 'notPositive'
  | 'tooLarge'
  | 'decimalsNotAllowed'
  | 'tooManyDecimals';

export type AmountParseResult =
  | { ok: true; cents: number }
  | { ok: false; code: AmountParseError };

// Whitespace that may appear as a thousands grouping: space, no-break space,
// narrow no-break space.
const GROUP_SPACE = /[   ]/;

// Parses what the user typed into integer cents, with integer-only math (the
// text is split, never multiplied as a float). Every currency is scaled by
// 100, so 500 JPY is stored as 50000.
//
// Rules, so ambiguous input is rejected instead of guessed:
// - Leading and trailing whitespace is ignored.
// - Interior spaces are accepted only as thousands grouping: a first group of
//   1 to 3 digits followed by groups of exactly 3 ("1 234", "12 345 678").
// - Exactly one "." or "," is the decimal separator. If both appear, or one
//   appears more than once ("1,234.56", "1.234,56", "1,234,567"), the input is
//   invalid, because the separator could be a thousands mark. "1,234" is read
//   as a decimal and rejected for having 3 decimals.
// - A separator needs digits on both sides (".5" and "5." are invalid).
// - A leading "-" (or any sign) is not a number here: negatives are rejected.
export function parseAmountToCents(input: string, currency: string): AmountParseResult {
  const text = input.replace(/^\s+|\s+$/g, '');
  if (text.length === 0) return { ok: false, code: 'empty' };
  if (text.startsWith('-') || text.startsWith(MINUS)) return { ok: false, code: 'notPositive' };

  let integerPart = text;
  let fractionPart = '';
  const separators = text.match(/[.,]/g) ?? [];
  if (separators.length > 1) return { ok: false, code: 'invalid' };
  if (separators.length === 1) {
    const index = text.search(/[.,]/);
    integerPart = text.slice(0, index);
    fractionPart = text.slice(index + 1);
    if (!/^\d+$/.test(fractionPart)) return { ok: false, code: 'invalid' };
  }

  if (GROUP_SPACE.test(integerPart)) {
    if (!/^\d{1,3}([   ]\d{3})+$/.test(integerPart)) return { ok: false, code: 'invalid' };
    integerPart = integerPart.replace(/[   ]/g, '');
  }
  if (!/^\d+$/.test(integerPart)) return { ok: false, code: 'invalid' };

  if (fractionPart.length > 0) {
    if (NO_DECIMAL_CURRENCIES.includes(currency)) return { ok: false, code: 'decimalsNotAllowed' };
    if (fractionPart.length > 2) return { ok: false, code: 'tooManyDecimals' };
  }

  const whole = integerPart.replace(/^0+(?=\d)/, '');
  // 9 digits is the most the maximum allows, and keeps the math exact.
  if (whole.length > 9) return { ok: false, code: 'tooLarge' };
  const cents = Number(whole) * 100 + Number(fractionPart.padEnd(2, '0') || '0');
  if (cents <= 0) return { ok: false, code: 'notPositive' };
  if (cents > MAX_AMOUNT_CENTS) return { ok: false, code: 'tooLarge' };
  return { ok: true, cents };
}
