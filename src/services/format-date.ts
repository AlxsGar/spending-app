// Dates are formatted only at the display edge, in the app language.
export function formatShortDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);
}

// A date range in the locale's own range format ("Nov 3 – 9" in English, "3–9
// nov" in Spanish; a range across months is whatever the locale does), or just
// the day when start and end are the same day. Where Intl has no formatRange (an
// older engine) it falls back to two full dates ("Nov 3 – Nov 9", "3 nov – 9 nov").
export function formatDateRange(start: Date, end: Date, language: string): string {
  const formatter = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' });
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return formatter.format(start);
  if (typeof formatter.formatRange === 'function') return formatter.formatRange(start, end);
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function formatLongDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
