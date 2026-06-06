import { NativeModules, Platform } from "react-native";

type OneStepWidgetNativeModule = {
  refresh?: () => Promise<void>;
};

export const refreshHomeScreenWidget = async () => {
  if (Platform.OS !== "android") {
    return;
  }

  const oneStepWidget = NativeModules.OneStepWidget as
    | OneStepWidgetNativeModule
    | undefined;

  if (!oneStepWidget?.refresh) {
    return;
  }

  try {
    await oneStepWidget.refresh();
  } catch (error) {
    console.warn("Could not refresh OneStep widget.", error);
  }
};
