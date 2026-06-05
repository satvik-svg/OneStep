# OneStep Offline Todo

OneStep is a simple Android-first Expo app for daily todos. It stores tasks on the phone with SQLite and schedules reminder notifications locally, so it does not need Railway, Render, Firebase, Supabase, or any paid backend service.

## Features

- Add tasks for today.
- Optionally add a reminder time in 24-hour format, such as `18:00`.
- Show only today's incomplete tasks.
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

## Notes

- Android notification permission is requested only when you add a task with a reminder.
- If notification permission is denied, the task is still saved and the app shows that reminders need permission.
- `SCHEDULE_EXACT_ALARM` is declared for Android 12+ so reminder timing can be as close as Android allows.
