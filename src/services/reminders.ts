import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export const REMINDER_CHANNEL_ID = "todo-reminders";

export type ReminderScheduleResult =
  | { status: "scheduled"; notificationId: string }
  | { status: "denied" }
  | { status: "skipped"; reason: "past" };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

export const prepareReminderChannel = async () => {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "Todo reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2f6b4f",
    sound: "default"
  });
};

const hasNotificationPermission = async () => {
  await prepareReminderChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === "granted") {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.status === "granted";
};

export const scheduleTaskReminder = async (input: {
  taskId: number;
  title: string;
  reminderAt: Date;
}): Promise<ReminderScheduleResult> => {
  if (input.reminderAt.getTime() <= Date.now()) {
    return { status: "skipped", reason: "past" };
  }

  const permissionGranted = await hasNotificationPermission();
  if (!permissionGranted) {
    return { status: "denied" };
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "OneStep reminder",
      body: input.title,
      data: { taskId: input.taskId },
      sound: true
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.reminderAt,
      channelId: REMINDER_CHANNEL_ID
    }
  });

  return { status: "scheduled", notificationId };
};

export const cancelTaskReminder = async (notificationId: string | null) => {
  if (!notificationId) {
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn("Could not cancel scheduled reminder", error);
  }
};
