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
npx expo start
```

For the Android app build on your phone or emulator:

```sh
npx expo run:android --device
```

This uses local Android build tooling. It does not require a hosted server.

## Notes

- Android notification permission is requested only when you add a task with a reminder.
- If notification permission is denied, the task is still saved and the app shows that reminders need permission.
- `SCHEDULE_EXACT_ALARM` is declared for Android 12+ so reminder timing can be as close as Android allows.
