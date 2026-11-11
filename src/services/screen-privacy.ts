import { Platform } from 'react-native';
import {
  allowScreenCaptureAsync,
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  preventScreenCaptureAsync,
} from 'expo-screen-capture';

const KEY = 'app-lock';
const IOS_BLUR_INTENSITY = 1;

// Hides the app in the OS recent apps / app switcher while the lock is on.
// Android: FLAG_SECURE (blank preview; screenshots and recording are blocked too).
// iOS: a blur only, so screenshots stay allowed. Errors are logged and swallowed:
// this must never break the lock or the app.
// Returns false when the native call failed (the caller may retry later).
export async function setScreenPrivacy(on: boolean): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      if (on) await preventScreenCaptureAsync(KEY);
      else await allowScreenCaptureAsync(KEY);
    } else if (Platform.OS === 'ios') {
      if (on) await enableAppSwitcherProtectionAsync(IOS_BLUR_INTENSITY);
      else await disableAppSwitcherProtectionAsync();
    }
    return true;
  } catch (failure) {
    console.error('[screen-privacy] could not update the screen protection:', failure);
    return false;
  }
}
