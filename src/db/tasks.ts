import * as SQLite from "expo-sqlite";

import type { NewTaskInput, Task } from "../types";

const DB_NAME = "onestep-todos.db";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDatabase = async () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DB_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          date TEXT NOT NULL,
          reminder_at TEXT,
          notification_id TEXT,
          image_uri TEXT,
          completed_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_today
          ON tasks(date, completed_at, created_at);
      `);

      const columns = await database.getAllAsync<{ name: string }>(
        "PRAGMA table_info(tasks);"
      );

      if (!columns.some((column) => column.name === "image_uri")) {
        await database.execAsync("ALTER TABLE tasks ADD COLUMN image_uri TEXT;");
      }

      return database;
    });
  }

  return databasePromise;
};

export const initializeTasksDatabase = async () => {
  await getDatabase();
};

export const listOpenTasks = async (): Promise<Task[]> => {
  const database = await getDatabase();

  return database.getAllAsync<Task>(
    `
      SELECT
        id,
        title,
        date,
        reminder_at AS reminderAt,
        notification_id AS notificationId,
        image_uri AS imageUri,
        completed_at AS completedAt,
        created_at AS createdAt
      FROM tasks
      WHERE completed_at IS NULL
      ORDER BY
        date DESC,
        CASE WHEN reminder_at IS NULL THEN 1 ELSE 0 END,
        reminder_at ASC,
        created_at ASC;
    `
  );
};

export const createTask = async (input: NewTaskInput): Promise<Task> => {
  const database = await getDatabase();
  const createdAt = new Date().toISOString();
  const result = await database.runAsync(
    `
      INSERT INTO tasks (
        title,
        date,
        reminder_at,
        notification_id,
        image_uri,
        completed_at,
        created_at
      )
      VALUES (?, ?, ?, NULL, ?, NULL, ?);
    `,
    [
      input.title.trim(),
      input.date,
      input.reminderAt,
      input.imageUri,
      createdAt
    ]
  );

  return {
    id: Number(result.lastInsertRowId),
    title: input.title.trim(),
    date: input.date,
    reminderAt: input.reminderAt,
    notificationId: null,
    imageUri: input.imageUri,
    completedAt: null,
    createdAt
  };
};

export const updateTaskNotificationId = async (
  taskId: number,
  notificationId: string
) => {
  const database = await getDatabase();

  await database.runAsync(
    "UPDATE tasks SET notification_id = ? WHERE id = ?;",
    notificationId,
    taskId
  );
};

export const completeTask = async (taskId: number, completedAt: string) => {
  const database = await getDatabase();

  await database.runAsync(
    "UPDATE tasks SET completed_at = ? WHERE id = ?;",
    completedAt,
    taskId
  );
};

export const deleteTask = async (taskId: number) => {
  const database = await getDatabase();

  await database.runAsync("DELETE FROM tasks WHERE id = ?;", taskId);
};
