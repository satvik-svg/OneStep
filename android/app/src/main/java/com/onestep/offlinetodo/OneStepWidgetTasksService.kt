package com.onestep.offlinetodo

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

class OneStepWidgetTasksService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
    TasksFactory(applicationContext)

  private class TasksFactory(
    private val context: Context
  ) : RemoteViewsFactory {
    private var taskTitles: List<String> = emptyList()

    override fun onCreate() = Unit

    override fun onDataSetChanged() {
      taskTitles = OneStepWidgetStore.queryOpenTaskTitles(context)
    }

    override fun onDestroy() {
      taskTitles = emptyList()
    }

    override fun getCount(): Int = taskTitles.size

    override fun getViewAt(position: Int): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.onestep_widget_task_item)
      val title = taskTitles.getOrNull(position).orEmpty()

      views.setTextViewText(R.id.widget_task_title, "• $title")
      views.setOnClickFillInIntent(R.id.widget_task_title, Intent())

      return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = false
  }
}
