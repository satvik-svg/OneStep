package com.onestep.offlinetodo

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OneStepWidgetModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "OneStepWidget"

  @ReactMethod
  fun refresh(promise: Promise) {
    try {
      OneStepWidgetProvider.refreshAllWidgets(reactContext)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("ERR_WIDGET_REFRESH", error)
    }
  }
}
