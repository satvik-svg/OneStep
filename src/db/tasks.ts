import * as SQLite from "expo-sqlite";

import type { DailyProgress, NewTaskInput, Task } from "../types";

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
          is_recurring INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS task_completions (
          task_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          completed_at TEXT NOT NULL,
          PRIMARY KEY (task_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_today
          ON tasks(date, completed_at, created_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_recurring
          ON tasks(is_recurring, date, created_at);
        CREATE INDEX IF NOT EXISTS idx_task_completions_date
          ON task_completions(date, task_id);
      `);

      const columns = await database.getAllAsync<{ name: string }>(
        "PRAGMA table_info(tasks);"
      );

      if (!columns.some((column) => column.name === "image_uri")) {
        await database.execAsync("ALTER TABLE tasks ADD COLUMN image_uri TEXT;");
      }

      if (!columns.some((column) => column.name === "is_recurring")) {
        await database.execAsync(
          "ALTER TABLE tasks ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0;"
        );
      }

      await database.execAsync(`
        INSERT OR IGNORE INTO task_completions (
          task_id,
          date,
          completed_at
        )
        SELECT
          id,
          COALESCE(
            strftime('%Y-%m-%d', completed_at, 'localtime'),
            substr(completed_at, 1, 10)
          ),
          completed_at
        FROM tasks
        WHERE is_recurring = 1
          AND completed_at IS NOT NULL
          AND COALESCE(
            strftime('%Y-%m-%d', completed_at, 'localtime'),
            substr(completed_at, 1, 10)
          ) IS NOT NULL;

        UPDATE tasks
        SET completed_at = NULL
        WHERE is_recurring = 1
          AND completed_at IS NOT NULL;
      `);

      return database;
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
};

export const initializeTasksDatabase = async () => {
  await getDatabase();
};

const mapTaskRow = (row: Task): Task => ({
  ...row,
  isRecurring: Boolean(row.isRecurring)
});

export const listOpenTasks = async (todayKey: string): Promise<Task[]> => {
  const database = await getDatabase();

  const rows = await database.getAllAsync<Task>(
    `
      SELECT
        tasks.id,
        tasks.title,
        tasks.date,
        tasks.reminder_at AS reminderAt,
        tasks.notification_id AS notificationId,
        tasks.image_uri AS imageUri,
        tasks.is_recurring AS isRecurring,
        task_completions.completed_at AS completedTodayAt,
        tasks.completed_at AS completedAt,
        tasks.created_at AS createdAt
      FROM tasks
      LEFT JOIN task_completions
        ON task_completions.task_id = tasks.id
        AND task_completions.date = ?
      WHERE
        tasks.date <= ?
        AND (
          (tasks.is_recurring = 0 AND tasks.completed_at IS NULL)
          OR
          (
            tasks.is_recurring = 1
            AND task_completions.completed_at IS NULL
          )
        )
      ORDER BY
        tasks.date DESC,
        CASE WHEN tasks.reminder_at IS NULL THEN 1 ELSE 0 END,
        tasks.reminder_at ASC,
        tasks.created_at ASC;
    `,
    todayKey,
    todayKey
  );

  return rows.map(mapTaskRow);
};

export const listRecurringTasks = async (todayKey: string): Promise<Task[]> => {
  const database = await getDatabase();

  const rows = await database.getAllAsync<Task>(
    `
      SELECT
        tasks.id,
        tasks.title,
        tasks.date,
        tasks.reminder_at AS reminderAt,
        tasks.notification_id AS notificationId,
        tasks.image_uri AS imageUri,
        tasks.is_recurring AS isRecurring,
        task_completions.completed_at AS completedTodayAt,
        tasks.completed_at AS completedAt,
        tasks.created_at AS createdAt
      FROM tasks
      LEFT JOIN task_completions
        ON task_completions.task_id = tasks.id
        AND task_completions.date = ?
      WHERE tasks.is_recurring = 1
        AND tasks.date <= ?
      ORDER BY
        CASE WHEN task_completions.completed_at IS NULL THEN 0 ELSE 1 END,
        CASE WHEN tasks.reminder_at IS NULL THEN 1 ELSE 0 END,
        tasks.reminder_at ASC,
        tasks.created_at ASC;
    `,
    todayKey,
    todayKey
  );

  return rows.map(mapTaskRow);
};

export const getDailyProgress = async (
  todayKey: string
): Promise<DailyProgress> => {
  const database = await getDatabase();

  const totalResult = await database.getFirstAsync<{ total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM tasks
      WHERE
        (is_recurring = 0 AND date = ?)
        OR (is_recurring = 1 AND date <= ?);
    `,
    todayKey,
    todayKey
  );

  const completedResult = await database.getFirstAsync<{ completed: number }>(
    `
      SELECT COUNT(DISTINCT task_completions.task_id) AS completed
      FROM task_completions
      INNER JOIN tasks ON tasks.id = task_completions.task_id
      WHERE task_completions.date = ?
        AND (
          tasks.date = ?
          OR (tasks.is_recurring = 1 AND tasks.date <= ?)
        );
    `,
    todayKey,
    todayKey,
    todayKey
  );

  return {
    completed: completedResult?.completed ?? 0,
    total: totalResult?.total ?? 0
  };
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
        is_recurring,
        completed_at,
        created_at
      )
      VALUES (?, ?, ?, NULL, ?, ?, NULL, ?);
    `,
    [
      input.title.trim(),
      input.date,
      input.reminderAt,
      input.imageUri,
      input.isRecurring ? 1 : 0,
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
    isRecurring: input.isRecurring,
    completedTodayAt: null,
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

export const completeTask = async (
  taskId: number,
  dateKey: string,
  completedAt: string
) => {
  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `
        INSERT OR REPLACE INTO task_completions (
          task_id,
          date,
          completed_at
        )
        VALUES (?, ?, ?);
      `,
      taskId,
      dateKey,
      completedAt
    );

    await database.runAsync(
      `
        UPDATE tasks
        SET completed_at = ?
        WHERE id = ?
          AND is_recurring = 0;
      `,
      completedAt,
      taskId
    );
  });
};

export const deleteTask = async (taskId: number) => {
  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      "DELETE FROM task_completions WHERE task_id = ?;",
      taskId
    );
    await database.runAsync("DELETE FROM tasks WHERE id = ?;", taskId);
  });
};
