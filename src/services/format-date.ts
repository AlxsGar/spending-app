// Dates are formatted only at the display edge, in the app language.
export function formatShortDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);
}

export function formatLongDate(date: Date, language: string): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}
