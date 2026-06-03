const pad = (value: number) => value.toString().padStart(2, "0");

export const getTodayKey = (date = new Date()) => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatTodayLabel = (date = new Date()) => {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
};

export const formatReminderTime = (isoDate: string) => {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(isoDate));
};

export const getDefaultReminderTime = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export type ParsedReminder =
  | { ok: true; date: Date }
  | { ok: false; message: string };

export const parseTodayReminderTime = (
  input: string,
  now = new Date()
): ParsedReminder => {
  const trimmed = input.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);

  if (!match) {
    return { ok: false, message: "Use a time like 18:00." };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return { ok: false, message: "Use a valid 24-hour time." };
  }

  const reminderDate = new Date(now);
  reminderDate.setHours(hours, minutes, 0, 0);

  if (reminderDate.getTime() <= now.getTime()) {
    return { ok: false, message: "Choose a future time for today." };
  }

  return { ok: true, date: reminderDate };
};
