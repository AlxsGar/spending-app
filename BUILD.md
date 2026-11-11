# Building Tidy Tally for your phone

This makes a release-mode Android APK with EAS Build and installs it on your own
phone. It is not a store release. Run every command yourself; agents do not run
`eas`.

## 1. Prerequisites

- A free Expo account (https://expo.dev/signup).
- EAS CLI: `npm install -g eas-cli`, or put `npx eas-cli` in place of `eas` in
  every command below.
- For the per-app language test (slice 9c), a phone on Android 13 or newer.

## 2. Get the work onto main (before EAS)

EAS packages the git tree, not your working folder, and `eas init` rewrites
`app.json`. So everything must be committed first:

1. Merge `slice/test-build` into `main` (you do the merge), then
   `git switch main` and `git pull`.
2. Check `git status` is clean. Uncommitted changes are not in the build.

## 3. First time only: link the project

```
git switch -c chore/eas-init
eas login
eas init
```

`eas init` creates the project on your Expo account and writes
`extra.eas.projectId` (and `owner`) into `app.json`. Those are deliberately not
in the repo yet. Commit that change on this branch (and merge it, so later builds
use it), not directly on `main`.

`eas init` needs the slug `tidy-tally` to be free on your Expo account. If it is
taken, `eas init` fails or asks you to pick another. Change `slug` in `app.json`
to something unique (for example `tidy-tally-personal`), commit it, and run
`eas init` again. The slug is not the app name, the package name or the URL
scheme, so nothing else changes.

## 4. Build

```
eas build --platform android --profile preview
```

The first build asks whether to generate an Android keystore. Say yes. The
build runs in the cloud and takes several minutes. Because `eas.json` uses a
remote app version source, the first build may ask for the starting versionCode:
enter 1. After that EAS raises it on every build by itself.

## 5. Install

1. When the build finishes, open the build page (the link printed in the
   terminal, or https://expo.dev under your project, Builds). Download the APK on
   the phone, or scan the QR code on that page with the phone.
2. Android asks to allow installs from this source ("unknown sources" or
   "Install unknown apps"). Allow it for the browser or file app you used.
3. Open the APK and tap Install.

Updating: build again and install the new APK over the old one. The package
name (`com.alexisgarcia.tidytally`) and the signing key are the same, so it
updates in place and keeps your data. The versionCode only goes up, which is
what lets Android accept it.

The signing keystore is managed by EAS. Losing it means you can never update the
installed app, only uninstall and reinstall, which deletes the data. Back it up
once:

1. Run `eas credentials`.
2. Choose Android, then the `preview` (or `production`) build credentials, then
   the option to download the keystore.
3. Save the keystore file, and also write down the keystore password, the key
   alias and the key password. All of them are needed to restore it.

The `eas credentials` menu names are approximate and can differ by eas-cli
version: pick Android, then the build profile, then something like "Keystore" and
"Download", and follow the prompts.

Keep them somewhere safe, outside this repository (a password manager is ideal).
Never commit them.

## 6. Optional: install with adb

With USB debugging on and the phone connected:

```
adb install -r path/to/downloaded.apk
```

`-r` replaces an existing install and keeps its data.

## 7. Versioning

- Change `version` in `app.json` (for example 1.0.0 to 1.1.0) when the release
  is something you want to tell apart by name: new features or a notable fix.
  Rebuilding the same version is fine for small fixes.
- The Android versionCode is automatic: EAS increments it on each preview build.
  With `appVersionSource: "remote"`, the value stored on EAS is the one that
  counts, and `android.versionCode` in `app.json` is ignored. Do not add it.
- To see or change the stored value: `eas build:version:get --platform android`
  and `eas build:version:set --platform android`.

Icons: the icon PNGs in `assets/images/` are committed. Re-render them only on
purpose (sharp is pinned by the lockfile, so the output is repeatable). To change
them, edit `assets/source/*.svg`, run `node scripts/render-assets.mjs`, then
rebuild. `assets/source/preview/sheet.png` stays committed as the record of the
approved design.

## 8. Test checklist

The device test is in `docs/slices.md`, under slices 10a and 10b. The per-app
language test needs Android 13 or later.

## 9. Troubleshooting

- Build fails on credentials: run `eas credentials`, choose Android and the
  `preview` profile, and check that a keystore exists (or let EAS create one).
  The menu names are approximate and can differ by eas-cli version; follow the
  prompts. If
  you are not logged in, run `eas login` again. In a non-interactive shell the
  first build cannot create the keystore, so run it from a normal terminal.
- The build says the project is not configured: run `eas init` (step 3) first.
- The APK will not install over Expo Go or a dev build: a dev build of this app
  has the same package name but a different signing key, so Android refuses the
  update ("App not installed", or a signature conflict). Uninstall the dev build
  first. Uninstalling deletes that copy's data, so use Settings, Backup, Export
  in it first, and import the file in the new app. Expo Go is a different app
  with a different package name, so the APK does not replace it and installs
  next to it; there is nothing to uninstall.
- An older Tidy Tally APK built with a different keystore has the same problem:
  export a backup, uninstall, install the new one, import, or restore the
  original keystore.
- The APK is release mode: there is no dev menu and errors do not show on
  screen. To see logs, connect the phone with USB debugging and run
  `adb logcat '*:E' ReactNative:V ReactNativeJS:V` (the quotes stop zsh from
  expanding the `*`). These filters are a starting point; plain `adb logcat` is
  the fallback. You can also filter by the app with
  `adb logcat --pid=$(adb shell pidof com.alexisgarcia.tidytally)` (unverified).
- Per-app language (slice 9c) only exists on Android 13 or later. On older
  versions the app follows the device language only.
