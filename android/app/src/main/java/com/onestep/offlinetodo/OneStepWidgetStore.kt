package com.onestep.offlinetodo

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val WIDGET_DATABASE_NAME = "onestep-todos.db"

internal data class OneStepWidgetSummary(
  val completed: Int,
  val total: Int,
  val openCount: Int
)

internal object OneStepWidgetStore {
  fun todayLabel(): String =
    SimpleDateFormat("EEE, d MMM", Locale.US).format(Date())

  fun querySummary(context: Context): OneStepWidgetSummary {
    val todayKey = todayKey()

    return withDatabase(context, OneStepWidgetSummary(0, 0, 0)) { database ->
      val total = singleInt(
        database,
        """
          SELECT COUNT(*) AS total
          FROM tasks
          WHERE
            date = ?
            OR (is_recurring = 1 AND date <= ? AND completed_at IS NULL);
        """.trimIndent(),
        arrayOf(todayKey, todayKey)
      )
      val completed = singleInt(
        database,
        """
          SELECT COUNT(DISTINCT task_completions.task_id) AS completed
          FROM task_completions
          INNER JOIN tasks ON tasks.id = task_completions.task_id
          WHERE task_completions.date = ?
            AND (
              tasks.date = ?
              OR (tasks.is_recurring = 1 AND tasks.date <= ?)
            );
        """.trimIndent(),
        arrayOf(todayKey, todayKey, todayKey)
      )
      val openCount = singleInt(
        database,
        openTasksCountSql(),
        arrayOf(todayKey, todayKey)
      )

      OneStepWidgetSummary(
        completed = completed,
        total = total,
        openCount = openCount
      )
    }
  }

  fun queryOpenTaskTitles(context: Context): List<String> {
    val todayKey = todayKey()

    return withDatabase(context, emptyList()) { database ->
      val titles = mutableListOf<String>()

      database.rawQuery(
        """
          SELECT tasks.title
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
                AND tasks.completed_at IS NULL
                AND task_completions.completed_at IS NULL
              )
            )
          ORDER BY
            tasks.date DESC,
            CASE WHEN tasks.reminder_at IS NULL THEN 1 ELSE 0 END,
            tasks.reminder_at ASC,
            tasks.created_at ASC;
        """.trimIndent(),
        arrayOf(todayKey, todayKey)
      ).use { cursor ->
        while (cursor.moveToNext()) {
          titles.add(cursor.getString(0))
        }
      }

      titles
    }
  }

  private fun todayKey(): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

  private fun databaseFile(context: Context): File =
    File(File(context.filesDir, "SQLite"), WIDGET_DATABASE_NAME)

  private fun <T> withDatabase(
    context: Context,
    fallback: T,
    block: (SQLiteDatabase) -> T
  ): T {
    val databaseFile = databaseFile(context)

    if (!databaseFile.exists()) {
      return fallback
    }

    return try {
      SQLiteDatabase.openDatabase(
        databaseFile.absolutePath,
        null,
        SQLiteDatabase.OPEN_READONLY
      ).use(block)
    } catch (_: Exception) {
      fallback
    }
  }

  private fun singleInt(
    database: SQLiteDatabase,
    sql: String,
    args: Array<String>
  ): Int {
    database.rawQuery(sql, args).use { cursor ->
      return if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }
  }

  private fun openTasksCountSql(): String =
    """
      SELECT COUNT(*)
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
            AND tasks.completed_at IS NULL
            AND task_completions.completed_at IS NULL
          )
        );
    """.trimIndent()
}
