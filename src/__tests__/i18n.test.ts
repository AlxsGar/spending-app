import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import i18n from '@/i18n';

function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('plural messages', () => {
  const cases = [
    ['en', 'accounts.deleteMessageWithTransactions', 1, 'This deletes the account and its 1 transaction. This cannot be undone.'],
    ['en', 'accounts.deleteMessageWithTransactions', 4, 'This deletes the account and its 4 transactions. This cannot be undone.'],
    ['es', 'accounts.deleteMessageWithTransactions', 1, 'Esto elimina la cuenta y su 1 transacción. No se puede deshacer.'],
    ['es', 'accounts.deleteMessageWithTransactions', 4, 'Esto elimina la cuenta y sus 4 transacciones. No se puede deshacer.'],
    ['en', 'accounts.currencyChangeMessage', 1, 'The 1 transaction in this account keeps its amount and will show in USD instead of EUR. Nothing is converted.'],
    ['en', 'accounts.currencyChangeMessage', 2, 'The 2 transactions in this account keep their amounts and will show in USD instead of EUR. Nothing is converted.'],
    ['es', 'accounts.currencyChangeMessage', 1, 'La 1 transacción de esta cuenta conserva su monto y se mostrará en USD en lugar de EUR. No se convierte nada.'],
    ['es', 'accounts.currencyChangeMessage', 2, 'Las 2 transacciones de esta cuenta conservan sus montos y se mostrarán en USD en lugar de EUR. No se convierte nada.'],
    // Spanish uses its "many" form for round millions.
    ['es', 'accounts.deleteMessageWithTransactions', 1000000, 'Esto elimina la cuenta y sus 1000000 transacciones. No se puede deshacer.'],
  ] as const;

  it.each(cases)('%s %s with %i', (language, key, count, expected) => {
    expect(i18n.getFixedT(language)(key, { count, from: 'EUR', to: 'USD' })).toBe(expected);
  });
});

describe('translations', () => {
  it('en and es have identical key sets', () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
});
