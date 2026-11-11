// App lock: PIN, biometrics and the wrong-PIN delay.
//
// Everything lock-related lives in expo-secure-store, never in SQLite, so a
// backup export or import cannot read or change it. What is stored:
//   applock.enabled / applock.biometrics   flags ('1' or absent)
//   applock.salt / applock.hash            random salt and the salted, iterated
//                                          SHA-256 of the PIN (never the PIN)
//   applock.failures / applock.until       wrong-PIN state: the count since the
//                                          last correct PIN and the epoch ms
//                                          until which attempts are refused
// The PIN, the hash and the salt are never logged.
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  enabled: 'applock.enabled',
  biometrics: 'applock.biometrics',
  salt: 'applock.salt',
  hash: 'applock.hash',
  failures: 'applock.failures',
  until: 'applock.until',
} as const;

// Every secure-store call passes these options. WHEN_UNLOCKED_THIS_DEVICE_ONLY
// keeps the entries out of iCloud and device-to-device keychain migration, so the
// lock never moves to a restored or new phone: data restored from a phone backup
// opens unlocked, instead of behind a PIN the user may no longer remember. (On
// Android the expo-secure-store config plugin keeps its prefs out of Auto Backup:
// its configureAndroidBackup option defaults to true.)
export const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const secureGet = (key: string) => SecureStore.getItemAsync(key, SECURE_OPTIONS);
const secureSet = (key: string, value: string) =>
  SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
const secureDelete = (key: string) => SecureStore.deleteItemAsync(key, SECURE_OPTIONS);

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
const HASH_ROUNDS = 1000;
const SALT_BYTES = 16;

// The app locks again after more than this long in the background.
export const LOCK_TIMEOUT_MS = 60 * 1000;

// The first wrong PINs cost nothing; after that every extra one waits longer.
export const FREE_ATTEMPTS = 5;
export const DELAYS_MS = [30 * 1000, 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000] as const;
const MAX_DELAY_MS = DELAYS_MS[DELAYS_MS.length - 1];

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH;
}

// True when the app was in the background for more than the timeout. A clock
// that moved backwards (a negative time away) locks too.
export function shouldLockAfterBackground(
  backgroundedAt: number | null,
  now: number,
  timeoutMs: number = LOCK_TIMEOUT_MS,
): boolean {
  if (backgroundedAt === null) return false;
  const away = now - backgroundedAt;
  return away < 0 || away > timeoutMs;
}

// The wait imposed after the n-th wrong PIN in a row (n counts from 1).
export function delayForFailures(failures: number): number {
  if (failures <= FREE_ATTEMPTS - 1) return 0;
  return DELAYS_MS[Math.min(failures - FREE_ATTEMPTS, DELAYS_MS.length - 1)];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  let value = `${salt}:${pin}`;
  for (let round = 0; round < HASH_ROUNDS; round += 1) {
    value = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${value}`);
  }
  return value;
}

// Compares without stopping at the first difference.
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function writeHash(pin: string): Promise<void> {
  const salt = toHex(await Crypto.getRandomBytesAsync(SALT_BYTES));
  const hash = await hashPin(pin, salt);
  await secureSet(KEYS.salt, salt);
  await secureSet(KEYS.hash, hash);
}

async function resetAttempts(): Promise<void> {
  await secureDelete(KEYS.failures);
  await secureDelete(KEYS.until);
}

export type LockFlags = { enabled: boolean; biometrics: boolean };

export async function readLockFlags(): Promise<LockFlags> {
  const [enabled, biometrics, hash] = await Promise.all([
    secureGet(KEYS.enabled),
    secureGet(KEYS.biometrics),
    secureGet(KEYS.hash),
  ]);
  // A lock flag without a stored hash cannot be unlocked; treat it as off.
  return { enabled: enabled === '1' && hash !== null, biometrics: biometrics === '1' };
}

// Turns the lock on with a new PIN. Resets the attempt state.
export async function enableLock(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('Invalid PIN');
  await resetAttempts();
  await writeHash(pin);
  await secureSet(KEYS.enabled, '1');
}

// Replaces the PIN (the caller has already checked the old one, or the user
// proved who they are with biometrics). Resets the attempt state.
export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('Invalid PIN');
  await writeHash(pin);
  await resetAttempts();
}

export async function setBiometricsFlag(on: boolean): Promise<void> {
  if (on) await secureSet(KEYS.biometrics, '1');
  else await secureDelete(KEYS.biometrics);
}

// Removes every lock entry: the lock is off afterwards.
export async function clearLockStorage(): Promise<void> {
  for (const key of Object.values(KEYS)) await secureDelete(key);
}

export type VerifyResult =
  | { result: 'ok' }
  // Wrong PIN. waitMs is the wait that now applies (0 while attempts are free).
  | { result: 'wrong'; waitMs: number }
  // Not checked: an earlier wrong PIN still has a wait running.
  | { result: 'waiting'; waitMs: number };

// The time left on the wait, from the stored until-time. A clock moved back
// cannot stretch it beyond the longest delay.
export async function remainingWaitMs(now: number = Date.now()): Promise<number> {
  const raw = await secureGet(KEYS.until);
  const until = raw === null ? 0 : Number(raw);
  if (!Number.isFinite(until)) return 0;
  return Math.min(Math.max(until - now, 0), MAX_DELAY_MS);
}

export async function verifyPin(pin: string, now: number = Date.now()): Promise<VerifyResult> {
  const waitMs = await remainingWaitMs(now);
  if (waitMs > 0) return { result: 'waiting', waitMs };
  const [salt, hash] = await Promise.all([
    secureGet(KEYS.salt),
    secureGet(KEYS.hash),
  ]);
  if (salt !== null && hash !== null && sameText(await hashPin(pin, salt), hash)) {
    await resetAttempts();
    return { result: 'ok' };
  }
  const stored = Number(await secureGet(KEYS.failures));
  const failures = (Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0) + 1;
  const delay = delayForFailures(failures);
  await secureSet(KEYS.failures, String(failures));
  if (delay > 0) await secureSet(KEYS.until, String(now + delay));
  return { result: 'wrong', waitMs: delay };
}

// ---- Biometrics ------------------------------------------------------------

// Hardware present and at least one fingerprint or face enrolled.
export async function isBiometricsAvailable(): Promise<boolean> {
  try {
    return (
      (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
    );
  } catch {
    return false;
  }
}

// Shows the system prompt. The device passcode is not offered as a fallback:
// the app's own PIN is. Resolves false when cancelled or failed.
export async function authenticateWithBiometrics(
  promptMessage: string,
  cancelLabel: string,
): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel,
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}
