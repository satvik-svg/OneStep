# OneStep Offline Todo

OneStep is a simple Android-first Expo app for daily todos. It stores tasks on the phone with SQLite and schedules reminder notifications locally, so it does not need Railway, Render, Firebase, Supabase, or any paid backend service.

## Features

- Add tasks for today.
- Attach one optional image to a task.
- Optionally add a reminder time in 24-hour format, such as `18:00`.
- Search active tasks by keyword.
- Show today's incomplete tasks and earlier unfinished tasks.
- Mark a task complete to remove it from the Today list.
- Delete a task and cancel its reminder.
- Keep completed tasks in local SQLite with `completedAt`.

## Run It

Install Node.js with npm first. Expo SDK 56 needs Node `22.13.x` or newer.

```sh
npm install
npm run start:lan
```

Use the QR code from `start:lan` only when your phone and laptop are on the same Wi-Fi network and the network allows devices to talk to each other.

Do not use `localhost` for a physical phone. `localhost` / `127.0.0.1` means "this same device", so a phone cannot reach your laptop through `exp://127.0.0.1:8082`.

If your lab Wi-Fi blocks local device connections, use the tunnel command:

```sh
npm run start:tunnel
```

Tunnel mode uses the internet only for development preview. The app itself still stores todos offline on the phone and does not use a paid backend.

For a USB-connected Android phone:

```sh
npm run android
```

For an Android emulator:

```sh
npm run android:emulator
```

This uses local Android build tooling. It does not require a hosted server.

To check Metro/Babel errors without opening the app:

```sh
npm run export:android
```

If a port is already busy, stop the old Metro terminal with `Ctrl+C`, or run Expo with another port:

```sh
npx expo start --lan --clear --port 8084
```

## Local Storage

Tasks are stored in a SQLite database file on the phone through `expo-sqlite`. The database name is `onestep-todos.db`, and each task keeps its title, date, optional reminder time, optional notification id, optional image URI, completion time, and creation time.

Attached images are copied into the app's local document folder under `task-images/`, and the database stores the local file URI. No task or image data is sent to a server. Restarting the app keeps the tasks and images because they persist in app-local storage. Uninstalling the app removes that local data.

## Reminders

When a reminder time is chosen, the app saves the task first, then asks Android to schedule one local notification for that exact task time. The returned notification id is stored with the task, so completing or deleting the task can cancel the pending notification.

Expo Go on Android cannot run the full notifications module needed for this app, so reminders are skipped there and the task is still saved. To test real reminders, run a development build with `npm run android` or `npm run android:emulator`.

## Notes

- Android notification permission is requested only when you add a task with a reminder.
- If notification permission is denied, the task is still saved and the app shows that reminders need permission.
- `SCHEDULE_EXACT_ALARM` is declared for Android 12+ so reminder timing can be as close as Android allows.
- In Android Expo Go, todos work but reminder notifications are skipped with an in-app message. Use `npm run android` or `npm run android:emulator` for a development build when testing real reminders.
