import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

export const REMINDER_CHANNEL_ID = "todo-reminders";

type NotificationsModule = typeof import("expo-notifications");

export type ReminderScheduleResult =
  | {
      status: "scheduled";
      notificationId: string;
      nextTriggerAt: string | null;
      scheduledCount: number | null;
    }
  | { status: "denied" }
  | { status: "skipped"; reason: "past" }
  | { status: "failed"; message: string }
  | { status: "unavailable"; reason: "expo-go-android" | "native-module" };

const isAndroidExpoGo =
  Platform.OS === "android" &&
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let notificationsPromise: Promise<NotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;

const loadNotifications = async () => {
  if (isAndroidExpoGo) {
    return null;
  }

  if (!notificationsPromise) {
    notificationsPromise = import("expo-notifications")
      .then((Notifications) => {
        if (!notificationHandlerConfigured) {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldPlaySound: true,
              shouldSetBadge: false,
              shouldShowBanner: true,
              shouldShowList: true
            })
          });
          notificationHandlerConfigured = true;
        }

        return Notifications;
      })
      .catch((error) => {
        console.warn("Notifications are unavailable in this runtime", error);
        return null;
      });
  }

  return notificationsPromise;
};

export const prepareReminderChannel = async () => {
  if (Platform.OS !== "android") {
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
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

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === "granted") {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.status === "granted";
};

const getScheduleDetails = async (
  Notifications: NotificationsModule,
  trigger: any
) => {
  const [nextTriggerDate, scheduledNotifications] = await Promise.all([
    Notifications.getNextTriggerDateAsync(trigger).catch(() => null),
    Notifications.getAllScheduledNotificationsAsync().catch(() => null)
  ]);

  return {
    nextTriggerAt: nextTriggerDate
      ? new Date(nextTriggerDate).toISOString()
      : null,
    scheduledCount: scheduledNotifications?.length ?? null
  };
};

const createReminderContent = (
  Notifications: NotificationsModule,
  input: { taskId: number; title: string; recurring: boolean }
) => ({
  title: input.recurring ? "OneStep daily reminder" : "OneStep reminder",
  body: input.title,
  data: { recurring: input.recurring, taskId: input.taskId },
  priority: Notifications.AndroidNotificationPriority.HIGH,
  sound: "default" as const,
  vibrate: [0, 250, 250, 250]
});

export const scheduleTaskReminder = async (input: {
  taskId: number;
  title: string;
  reminderAt: Date;
}): Promise<ReminderScheduleResult> => {
  if (input.reminderAt.getTime() <= Date.now()) {
    return { status: "skipped", reason: "past" };
  }

  if (isAndroidExpoGo) {
    return { status: "unavailable", reason: "expo-go-android" };
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return { status: "unavailable", reason: "native-module" };
  }

  const permissionGranted = await hasNotificationPermission();
  if (!permissionGranted) {
    return { status: "denied" };
  }

  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: input.reminderAt,
    channelId: REMINDER_CHANNEL_ID
  };

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: createReminderContent(Notifications, {
        taskId: input.taskId,
        title: input.title,
        recurring: false
      }),
      trigger
    });
    const scheduleDetails = await getScheduleDetails(Notifications, trigger);

    return { status: "scheduled", notificationId, ...scheduleDetails };
  } catch (error) {
    console.warn("Could not schedule reminder", error);
    return {
      status: "failed",
      message:
        "Task saved, but Android did not schedule the reminder. Check app notification and exact alarm settings."
    };
  }
};

export const scheduleDailyTaskReminder = async (input: {
  taskId: number;
  title: string;
  hour: number;
  minute: number;
}): Promise<ReminderScheduleResult> => {
  if (isAndroidExpoGo) {
    return { status: "unavailable", reason: "expo-go-android" };
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return { status: "unavailable", reason: "native-module" };
  }

  const permissionGranted = await hasNotificationPermission();
  if (!permissionGranted) {
    return { status: "denied" };
  }

  const trigger = {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour: input.hour,
    minute: input.minute,
    channelId: REMINDER_CHANNEL_ID
  };

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: createReminderContent(Notifications, {
        taskId: input.taskId,
        title: input.title,
        recurring: true
      }),
      trigger
    });
    const scheduleDetails = await getScheduleDetails(Notifications, trigger);

    return { status: "scheduled", notificationId, ...scheduleDetails };
  } catch (error) {
    console.warn("Could not schedule daily reminder", error);
    return {
      status: "failed",
      message:
        "Daily task saved, but Android did not schedule the reminder. Check app notification and exact alarm settings."
    };
  }
};

export const cancelTaskReminder = async (notificationId: string | null) => {
  if (!notificationId) {
    return;
  }

  const Notifications = await loadNotifications();
  if (!Notifications) {
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn("Could not cancel scheduled reminder", error);
  }
};
