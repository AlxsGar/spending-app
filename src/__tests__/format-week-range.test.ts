import { formatDateRange } from '@/services/format-date';

// Locales separate the parts with thin or no-break spaces; compare with plain ones.
const plain = (text: string) => text.replace(/\s/g, ' ');
const range = (a: Date, b: Date, language: string) => plain(formatDateRange(a, b, language));

describe('formatDateRange', () => {
  it('uses the locale range format for a normal range', () => {
    expect(range(new Date(2026, 10, 9), new Date(2026, 10, 15), 'en')).toBe('Nov 9 – 15');
    expect(range(new Date(2026, 10, 9), new Date(2026, 10, 15), 'es')).toBe('9–15 nov');
  });

  it('handles a range inside a month edge (2-8, 28-31)', () => {
    expect(range(new Date(2026, 10, 2), new Date(2026, 10, 8), 'en')).toBe('Nov 2 – 8');
    expect(range(new Date(2026, 11, 28), new Date(2026, 11, 31), 'es')).toBe('28–31 dic');
  });

  it('handles a range across months', () => {
    expect(range(new Date(2026, 10, 30), new Date(2026, 11, 2), 'en')).toBe('Nov 30 – Dec 2');
    expect(range(new Date(2026, 10, 30), new Date(2026, 11, 2), 'es')).toBe('30 nov – 2 dic');
  });

  it('shows just the day for a single day', () => {
    expect(formatDateRange(new Date(2026, 10, 1), new Date(2026, 10, 1, 18), 'en')).toBe('Nov 1');
    expect(formatDateRange(new Date(2026, 10, 30), new Date(2026, 10, 30), 'es')).toBe('30 nov');
  });

  it('falls back to two full dates when formatRange is missing', () => {
    const original = Intl.DateTimeFormat.prototype.formatRange;
    // @ts-expect-error simulating an engine without formatRange
    Intl.DateTimeFormat.prototype.formatRange = undefined;
    try {
      expect(formatDateRange(new Date(2026, 10, 3), new Date(2026, 10, 9), 'en')).toBe(
        'Nov 3 – Nov 9',
      );
      expect(formatDateRange(new Date(2026, 10, 3), new Date(2026, 10, 9), 'es')).toBe(
        '3 nov – 9 nov',
      );
    } finally {
      Intl.DateTimeFormat.prototype.formatRange = original;
    }
  });
});
