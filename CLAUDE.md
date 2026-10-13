# Spending App

An offline spending tracker: payments, expenses, expense reminders, and a
projected end-of-month balance. This is a production app built in small,
reviewed slices, so process matters as much as features.

## Stack

- Expo (React Native, TypeScript, expo-router)
- React Native Paper for UI
- Zustand for state
- expo-sqlite for storage (offline only, no backend, no bank sync)
- expo-notifications for local reminders
- i18next for English and Spanish

## Commands

- `npm run typecheck` - TypeScript, no emit
- `npm run lint` - ESLint
- `npm test` - Jest
- `npx expo start` - run the app (the user does this, agents do not)

If one of these scripts is missing, say so. Do not invent a replacement.

## Architecture rules

1. One theme file: `src/theme.ts`. No colors, font sizes, or spacing values
   anywhere else.
2. Screens never import from `react-native-paper` directly. They use the
   wrappers in `src/components/ui/`.
3. Screens and components never touch SQLite. All data access goes through
   `src/services/`.
4. Every user-visible string goes through i18next, in both `en` and `es`,
   from the first component.
5. Money is stored as integer cents. Format it only at the display edge.
6. Dates are stored as ISO strings in UTC.

## Workflow rules

- Work happens in small vertical slices. One slice, one branch
  (`slice/<short-name>`), never on `main`.
- Slice status lives in `docs/slices.md`.
- A slice is done when: typecheck, lint, and tests pass, the reviewer
  approves, and the user has tried it on a device.
- New dependencies, schema changes, and anything not in the brief need the
  user's approval first.
- Never push, publish, or submit to a store.
