import { MAX_AMOUNT_CENTS, formatSignedMoney, parseAmountToCents } from '@/services/money';

const cents = (input: string, currency = 'USD') => {
  const result = parseAmountToCents(input, currency);
  return result.ok ? result.cents : result.code;
};

describe('parseAmountToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,5', 1250],
    ['12.50', 1250],
    ['12,50', 1250],
    ['0.01', 1],
    ['0,01', 1],
    ['0.1', 10],
    ['007', 700],
    ['19.99', 1999],
    ['1.15', 115],
    ['  12.50  ', 1250],
  ])('reads %p as %p cents', (input, expected) => {
    expect(cents(input)).toBe(expected);
  });

  it('has no float rounding bugs', () => {
    // 1.005 * 100 and 0.07 * 100 are wrong in floats; here they never get multiplied.
    expect(cents('0.07')).toBe(7);
    expect(cents('4.35')).toBe(435);
    expect(cents('8.2')).toBe(820);
  });

  describe('whitespace and separators', () => {
    it('trims the ends', () => {
      expect(cents(' 1 234.56 ')).toBe(123456);
    });
    it('accepts interior spaces only as thousands grouping', () => {
      expect(cents('1 234')).toBe(123400);
      expect(cents('12 345 678,90')).toBe(1234567890);
      expect(cents('1 234.5')).toBe(123450);
      expect(cents('1 23')).toBe('invalid');
      expect(cents('12 3456')).toBe('invalid');
      expect(cents('1  234')).toBe('invalid');
    });
    it('rejects ambiguous separators instead of guessing', () => {
      expect(cents('1,234.56')).toBe('invalid');
      expect(cents('1.234,56')).toBe('invalid');
      expect(cents('1,234,567')).toBe('invalid');
      expect(cents('1.2.3')).toBe('invalid');
      // A lone separator is a decimal point, so 3 digits after it is too many.
      expect(cents('1,234')).toBe('tooManyDecimals');
      expect(cents('1.234')).toBe('tooManyDecimals');
    });
    it('needs digits on both sides of the separator', () => {
      expect(cents('.5')).toBe('invalid');
      expect(cents('5.')).toBe('invalid');
      expect(cents('.')).toBe('invalid');
      expect(cents(',')).toBe('invalid');
    });
  });

  it('rejects empty, text and symbols', () => {
    expect(cents('')).toBe('empty');
    expect(cents('   ')).toBe('empty');
    expect(cents('abc')).toBe('invalid');
    expect(cents('12a')).toBe('invalid');
    expect(cents('$12')).toBe('invalid');
    expect(cents('1e3')).toBe('invalid');
    expect(cents('12 EUR')).toBe('invalid');
  });

  it('rejects zero and negatives', () => {
    expect(cents('0')).toBe('notPositive');
    expect(cents('0.00')).toBe('notPositive');
    expect(cents('-5')).toBe('notPositive');
    expect(cents('-0.01')).toBe('notPositive');
    expect(cents('−5')).toBe('notPositive');
    expect(cents('+5')).toBe('invalid');
  });

  it('allows the maximum and rejects anything above', () => {
    expect(MAX_AMOUNT_CENTS).toBe(99_999_999_999);
    expect(cents('999999999.99')).toBe(MAX_AMOUNT_CENTS);
    expect(cents('999,999,999.99')).toBe('invalid');
    expect(cents('999 999 999,99')).toBe(MAX_AMOUNT_CENTS);
    expect(cents('1000000000')).toBe('tooLarge');
    expect(cents('1000000000.00')).toBe('tooLarge');
    expect(cents('99999999999999999999')).toBe('tooLarge');
  });

  it('allows at most 2 decimals, none for JPY', () => {
    expect(cents('1.999')).toBe('tooManyDecimals');
    expect(cents('0.001')).toBe('tooManyDecimals');
    expect(cents('500', 'JPY')).toBe(50000);
    expect(cents('1 500', 'JPY')).toBe(150000);
    expect(cents('500.5', 'JPY')).toBe('decimalsNotAllowed');
    expect(cents('500,00', 'JPY')).toBe('decimalsNotAllowed');
    expect(cents('0', 'JPY')).toBe('notPositive');
  });
});

describe('formatSignedMoney', () => {
  it('uses a real minus for negatives and an optional plus', () => {
    expect(formatSignedMoney(-2550, 'USD')).toBe('−$25.50');
    expect(formatSignedMoney(2550, 'USD')).toBe('$25.50');
    expect(formatSignedMoney(2550, 'USD', { showPlus: true })).toBe('+$25.50');
    expect(formatSignedMoney(0, 'USD', { showPlus: true })).toBe('$0.00');
  });
});
