package com.onestep.offlinetodo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

private const val ACTION_REFRESH = "com.onestep.offlinetodo.WIDGET_REFRESH"

class OneStepWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { widgetId ->
      updateWidget(context, appWidgetManager, widgetId)
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)

    if (intent.action == ACTION_REFRESH) {
      refreshAllWidgets(context)
    }
  }

  companion object {
    fun refreshAllWidgets(context: Context) {
      val appWidgetManager = AppWidgetManager.getInstance(context)
      val componentName = ComponentName(context, OneStepWidgetProvider::class.java)
      val widgetIds = appWidgetManager.getAppWidgetIds(componentName)

      widgetIds.forEach { widgetId ->
        updateWidget(context, appWidgetManager, widgetId)
      }

      if (widgetIds.isNotEmpty()) {
        appWidgetManager.notifyAppWidgetViewDataChanged(
          widgetIds,
          R.id.widget_task_list
        )
      }
    }

    private fun updateWidget(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int
    ) {
      val summary = OneStepWidgetStore.querySummary(context)
      val views = RemoteViews(context.packageName, R.layout.onestep_widget)
      val percent = if (summary.total == 0) {
        0
      } else {
          ((summary.completed.toDouble() / summary.total.toDouble()) * 100).toInt()
          .coerceIn(0, 100)
      }
      val listIntent = Intent(context, OneStepWidgetTasksService::class.java).apply {
        putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
      }

      views.setTextViewText(R.id.widget_date, OneStepWidgetStore.todayLabel())
      views.setTextViewText(R.id.widget_progress_text, "${summary.completed}/${summary.total} done")
      views.setTextViewText(
        R.id.widget_count_text,
          if (summary.openCount == 1) "1 active task" else "${summary.openCount} active tasks"
      )
      views.setProgressBar(R.id.widget_progress, 100, percent, false)
      views.setRemoteAdapter(R.id.widget_task_list, listIntent)
      views.setEmptyView(R.id.widget_task_list, R.id.widget_empty_text)
      views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context))
      views.setOnClickPendingIntent(R.id.widget_refresh, refreshIntent(context))
      views.setPendingIntentTemplate(R.id.widget_task_list, openAppIntent(context))

      appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun openAppIntent(context: Context): PendingIntent {
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        ?: Intent(context, MainActivity::class.java)

      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

      return PendingIntent.getActivity(
        context,
        0,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    private fun refreshIntent(context: Context): PendingIntent {
      val intent = Intent(context, OneStepWidgetProvider::class.java).apply {
        action = ACTION_REFRESH
      }

      return PendingIntent.getBroadcast(
        context,
        1,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
  }
}
