export type Task = {
  id: number;
  title: string;
  date: string;
  reminderAt: string | null;
  notificationId: string | null;
  imageUri: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type NewTaskInput = {
  title: string;
  date: string;
  reminderAt: string | null;
  imageUri: string | null;
};
