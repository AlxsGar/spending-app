import { en } from '@/i18n/en';
import { es } from '@/i18n/es';

function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('translations', () => {
  it('en and es have identical key sets', () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
});
