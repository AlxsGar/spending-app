# Building Tidy Tally for your phone (local Mac build)

This makes a release-mode Android APK on your Mac and installs it on your own
phone. It is not a store release. There is no EAS and no cloud build. Run every
command yourself; agents do not build.

## 1. Prerequisites

1. Android Studio, with the Android SDK, the SDK platform-tools and the bundled
   JDK (called "JBR"). Open Android Studio once and let its setup wizard
   install the SDK.
2. Environment variables. Add these to `~/.zshrc`:

   ```
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   export PATH="$PATH:$ANDROID_HOME/platform-tools"
   ```

   Then open a new terminal (or run `source ~/.zshrc`).
3. Check them:

   ```
   java -version
   echo $ANDROID_HOME
   adb version
   ```

   `java -version` should report 17, or whatever version the Expo and React
   Native Gradle build requires (recent Android Studio versions bundle JBR 21).
   If Gradle complains about the Java version, install JDK 17 and point
   `JAVA_HOME` at it. `echo` should print the SDK path, and `adb version` should
   print a version. If the Android Studio JDK is in another place on your Mac,
   point `JAVA_HOME` there.
4. In the project folder: `npm install`.
5. For the per-app language test (slice 9c), a phone on Android 13 or newer.

## 2. Build

From the project folder:

```
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

- `expo prebuild` regenerates the `android/` folder from `app.json` (name,
  package, icons, plugins, version). It is git-ignored. Never edit `android/` by
  hand: the next `--clean` prebuild deletes your edits. Change `app.json` instead.
- The first Gradle build downloads a lot and takes several minutes. Later ones
  are faster.
- The APK is written to:

  ```
  android/app/build/outputs/apk/release/app-release.apk
  ```

  This is the standard path for the Expo template. If the build log ends with
  "BUILD SUCCESSFUL" but you do not find the file, run
  `find android/app/build/outputs -name "*.apk"`.

Before every new build, raise `android.versionCode` in `app.json` (see section 5).

## 3. Install

Over USB:

1. On the phone, turn on Developer options and USB debugging, connect it, and
   accept the prompt on the phone.
2. Run `adb devices` and check the phone is listed as "device".
3. Run:

   ```
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

   `-r` replaces an existing install and keeps its data.

Or by file: copy `app-release.apk` to the phone (AirDrop does not work for
Android; use a cable, Android File Transfer, or cloud storage), open it on the
phone, allow installs from that source when Android asks ("Install unknown
apps"), and tap Install.

Updating: build again with a higher `versionCode` and install the same way. The
package name (`com.alexisgarcia.tidytally`) and the signing key are the same, so
it updates in place and keeps your data.

## 4. Signing

- Where the key comes from: the Expo prebuild template's `android/app/build.gradle`
  defines a `debug` signing config that uses a `debug.keystore` file shipped in
  the template, and its `release` build type uses that same debug config. So for
  this soak test the release APK is signed with the template's debug keystore, and
  it should be the same file on every prebuild. Unverified: check after your
  first prebuild. The template is downloaded by `expo prebuild` and is not in
  `node_modules`, so this is from memory. Open `android/app/build.gradle` and look
  at `signingConfigs` and at `buildTypes { release { signingConfig ... } }`.
- Whichever keystore signs the first install must sign every update. If it does
  not, Android refuses the update (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`). The only
  way out is to uninstall the app, which deletes its data. So before you ever
  change signing, export a backup (Settings, Backup, Export) and keep the file.
- Keystore guard. Take the backup copy BEFORE the first install, right after your
  first prebuild and before `./gradlew assembleRelease`:

  ```
  mkdir -p ~/keystores && cp android/app/debug.keystore ~/keystores/tidytally-debug.keystore
  shasum ~/keystores/tidytally-debug.keystore
  ```

  Write the `shasum` down. After every later prebuild, run:

  ```
  cmp android/app/debug.keystore ~/keystores/tidytally-debug.keystore
  ```

  No output means they are identical. If they differ, copy the saved file back
  over the generated one before building:

  ```
  cp ~/keystores/tidytally-debug.keystore android/app/debug.keystore
  ```

  The saved copy in `~/keystores` is the one that must sign every build. Keep it
  outside this repository, and back it up with your other files.
- The debug keystore is public: anyone can sign with it. Never use it for
  anything published. Publishing to a store needs a proper upload keystore that
  you create, back up (file, store password, key alias, key password) and keep
  outside this repository. Never commit a keystore.

## 5. Versioning

Nothing increments the version for you without EAS.

- `android.versionCode` in `app.json` is an integer. Raise it by 1 before every
  new build, or Android will refuse to install the new APK over the old one as an
  update. It currently is 1.
- `version` in `app.json` (for example 1.0.0 to 1.1.0) is the name shown to you.
  Raise it when the release is something you want to tell apart by name: new
  features or a notable fix. Rebuilding the same version is fine for small fixes,
  but still raise `versionCode`.
- Commit the change to `app.json` so the record of what is installed is in git.

## 6. Icons

The icon PNGs in `assets/images/` are committed. Re-render them only on purpose
(sharp is pinned by the lockfile, so the output is repeatable). To change them,
edit `assets/source/*.svg`, run `node scripts/render-assets.mjs`, then rebuild.
`assets/source/preview/sheet.png` stays committed as the record of the approved
design.

## 7. Logs

The APK is release mode: there is no dev menu and errors do not show on screen.
Connect the phone with USB debugging and run:

```
adb logcat '*:E' ReactNative:V ReactNativeJS:V
```

The quotes stop zsh from expanding the `*`. These filters are a starting point;
plain `adb logcat` is the fallback. You can also filter by the app with
`adb logcat --pid=$(adb shell pidof com.alexisgarcia.tidytally)` (unverified).

## 8. Test checklist

The device test is in `docs/slices.md`: slice 10a (the pending icon, splash,
notification icon and app name checks) and slice 10b. The per-app language test
needs Android 13 or later.

## 9. Troubleshooting

- "SDK location not found", or `adb: command not found`: `ANDROID_HOME` or the
  `PATH` is not set in this terminal. Redo section 1, open a new terminal and run
  the three checks. You can also create `android/local.properties` with
  `sdk.dir=/Users/<you>/Library/Android/sdk`, but a clean prebuild deletes it.
- "JAVA_HOME is not set", or a Java version error: `JAVA_HOME` must point to
  the JDK the build needs: Android Studio's bundled JBR, or JDK 17 if Gradle
  rejects that version. Run `java -version` and `echo $JAVA_HOME`.
- Gradle runs out of memory ("OutOfMemoryError", "Java heap space", or the daemon
  disappears): close other heavy apps and run `./gradlew --stop`, then build
  again. If it keeps happening, raise `org.gradle.jvmargs` (for example
  `-Xmx4096m`) in `~/.gradle/gradle.properties`. That file is on your Mac, not in
  the repo, so it survives `--clean` prebuilds.
- `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, or "App not installed" on the phone: the
  APK is signed with a different key than the installed copy, or the
  `versionCode` is not higher. Check `versionCode` first. If it is the key, the
  only way forward is uninstalling the installed copy, which deletes its data. Export a backup first (Settings,
  Backup, Export) and import it afterwards. See section 4.
- Installing over Expo Go or a dev build: a dev build of this app has the same
  package name but a different signing key, so Android refuses the update.
  Uninstall it first, after exporting a backup from it. Expo Go is a different
  app with a different package name, so the APK installs next to it and there is
  nothing to uninstall.
- Per-app language (slice 9c) only exists on Android 13 or later. On older
  versions the app follows the device language only.
