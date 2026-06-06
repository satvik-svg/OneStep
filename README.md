# OneStep

OneStep is a simple offline Android todo app built with Expo React Native and TypeScript. It stores tasks on the phone, supports local reminders, shows an Android home-screen widget, and does not need Railway, Render, Firebase, Supabase, or any hosted backend.

## Download APK

When a release is published, the latest APK will be available here:

[Download OneStep APK](https://github.com/satvik-svg/OneStep/releases/latest)

Install the APK on Android, allow installation from that source if Android asks, and OneStep will run like a normal offline app. You do not need Expo Go, Metro, localhost, tunnel mode, or a server for the release APK.

## Features

- Add one-time tasks for today.
- Add daily recurring tasks that return every day.
- Attach one optional image to a task.
- Add optional reminder times like `18:00`.
- Search active tasks by keyword.
- See today's active tasks plus earlier unfinished tasks.
- Mark tasks complete so they disappear from the active Today list.
- Delete tasks permanently and cancel their reminders.
- Track daily progress as completed tasks out of total tasks.
- Keep completed tasks locally for future history features.
- Show active tasks in an Android home-screen widget.
- Refresh the widget from the app when tasks are added, completed, or deleted.

## Tech Stack

- Expo SDK 56
- React Native 0.85
- TypeScript
- `expo-sqlite` for local task storage
- `expo-notifications` for local reminders
- `expo-image-picker` and `expo-file-system` for local task images
- Native Android widget code in `android/`

## How Offline Storage Works

Tasks are stored in a SQLite database on the phone through `expo-sqlite`. The database is named `onestep-todos.db`.

Task data includes:

- task title
- task date
- optional reminder time
- optional notification id
- optional local image URI
- recurring flag
- completion time
- creation time

Daily recurring task completions are stored in a separate local table. That lets a daily task disappear after you complete it today, then appear again tomorrow without creating duplicate tasks every day.

Images are copied into the app's local document folder under `task-images/`. The database stores the local file URI. No task data or image data is uploaded anywhere. If you uninstall the app, Android removes this local app data.

## How Reminders Work

When you add a reminder, the app asks Android for notification permission and schedules a local notification with `expo-notifications`.

One-time tasks schedule one notification for the selected time. Daily tasks schedule a repeating daily notification. The returned notification id is saved in SQLite so the app can cancel it when needed.

Important notes:

- Expo Go on Android cannot test this app's real reminder behavior.
- Use `npm run android`, `npm run android:emulator`, or a release APK to test reminders.
- Android may still adjust exact timing depending on battery optimization and device settings.
- The app declares exact-alarm permissions so reminder timing can be as close as Android allows for a personal offline APK.
- If this app is later published to Google Play, review Google's exact-alarm policy first.

## Android Widget

OneStep includes a native Android home-screen widget. The widget reads the same local SQLite database as the app and shows active tasks plus progress.

The widget is implemented in native Android files under:

```text
android/app/src/main/java/com/onestep/offlinetodo/
android/app/src/main/res/layout/
android/app/src/main/res/xml/
```

Because the widget is native Android code, the `android/` folder must be committed to GitHub. Do not ignore the entire Android folder.

## Local Development

Install Node.js with npm first. Expo SDK 56 needs Node `22.13.x` or newer.

Install dependencies:

```sh
npm install
```

Start on the same Wi-Fi network:

```sh
npm run start:lan
```

Use tunnel mode only if your Wi-Fi or lab network blocks phone-to-laptop connections:

```sh
npm run start:tunnel
```

Run on a USB-connected Android phone:

```sh
npm run android
```

Run on an Android emulator:

```sh
npm run android:emulator
```

Do not use `localhost` for a physical phone. On a phone, `localhost` means the phone itself, not your laptop.

## Build APK Locally

Make sure Java 17 and the Android SDK are installed, then run:

```sh
npm run android:release
```

The APK is created here:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Install it on a USB-connected phone:

```sh
npm run android:install-release
```

Check TypeScript and Android bundling before building:

```sh
npm run typecheck
npm run export:android
```

The current release build is signed with the app's debug keystore so it is easy to share as a direct APK. That is fine for testing and personal GitHub releases. For Google Play or serious public distribution, create a private release keystore and keep it out of Git.

## Publish APK On GitHub

Do not commit the APK into the repository. APK files are large, and GitHub Releases are better for public downloads.

This repository includes a GitHub Actions workflow at:

```text
.github/workflows/release-apk.yml
```

After committing and pushing the project, publish a public APK release like this:

```sh
git tag v1.0.0
git push origin main --tags
```

GitHub Actions will build the APK and attach it to the release. People can then download it from:

[https://github.com/satvik-svg/OneStep/releases/latest](https://github.com/satvik-svg/OneStep/releases/latest)

You can also create a release manually:

1. Open the GitHub repository.
2. Go to `Releases`.
3. Click `Draft a new release`.
4. Create a tag like `v1.0.0`.
5. Upload `android/app/build/outputs/apk/release/app-release.apk`.
6. Publish the release.

## Project Structure

```text
App.tsx                         Main React Native UI
src/db/tasks.ts                 SQLite task database helpers
src/services/reminders.ts       Local notification scheduling
src/services/images.ts          Local task image storage
src/services/widget.ts          JS bridge for widget refresh
src/utils/date.ts               Date helpers
android/                        Native Android app, widget, and splash resources
assets/                         App icon and adaptive icon
```

## Troubleshooting

If the app only works in Expo Go but reminders do not fire, build and install a development or release APK. Android Expo Go does not support this app's full notification behavior.

If a physical phone cannot connect to Metro, use `npm run start:tunnel` or connect the phone by USB and run `npm run android`.

If the splash screen shows an old image, uninstall the old APK first, install the new APK, then force-close and cold-start the app.

If Gradle fails with a Java error, use Java 17:

```sh
java -version
```

If the Android widget does not refresh immediately, remove and add the widget again once after installing a new APK. After that, task changes from the app should refresh the widget.
