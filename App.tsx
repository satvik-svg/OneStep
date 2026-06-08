import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView
} from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import * as SplashScreen from "expo-splash-screen";

import {
  completeTask,
  createTask,
  deleteTask,
  getDailyProgress,
  initializeTasksDatabase,
  listOpenTasks,
  listRecurringTasks,
  updateTaskNotificationId
} from "./src/db/tasks";
import {
  deleteTaskImage,
  persistTaskImage,
  pickTaskImage,
  type PickedTaskImage
} from "./src/services/images";
import {
  cancelTaskReminder,
  prepareReminderChannel,
  scheduleDailyTaskReminder,
  scheduleTaskReminder
} from "./src/services/reminders";
import { refreshHomeScreenWidget } from "./src/services/widget";
import type { DailyProgress, Task } from "./src/types";
import {
  formatDateKeyLabel,
  formatReminderTime,
  formatTodayLabel,
  getDefaultReminderTime,
  getTodayKey,
  parseTodayReminderTime
} from "./src/utils/date";

type TaskListRow =
  | { id: string; title: string; type: "section" }
  | { id: string; task: Task; type: "task" };

type AppTab = "today" | "daily";

SplashScreen.setOptions({
  duration: 250,
  fade: true
});
void SplashScreen.preventAutoHideAsync();

export default function App() {
  return (
    <SafeAreaProvider>
      <TodayApp />
    </SafeAreaProvider>
  );
}

function TodayApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recurringTasks, setRecurringTasks] = useState<Task[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress>({
    completed: 0,
    total: 0
  });
  const [todayKey, setTodayKey] = useState(getTodayKey());
  const [activeTab, setActiveTab] = useState<AppTab>("today");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [wantsReminder, setWantsReminder] = useState(false);
  const [timeText, setTimeText] = useState(getDefaultReminderTime());
  const [selectedImage, setSelectedImage] = useState<PickedTaskImage | null>(
    null
  );
  const [openImageUri, setOpenImageUri] = useState<string | null>(null);
  const [taskPendingDelete, setTaskPendingDelete] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const titleInputRef = useRef<TextInput | null>(null);

  const activeTasks = activeTab === "daily" ? recurringTasks : tasks;
  const composerIsRecurring = activeTab === "daily" || isRecurring;

  const progressLabel =
    dailyProgress.total === 0
      ? "0 of 0 done"
      : `${dailyProgress.completed} of ${dailyProgress.total} done`;
  const progressPercent =
    dailyProgress.total === 0
      ? 0
      : Math.min(100, Math.round((dailyProgress.completed / dailyProgress.total) * 100));

  const activeCountLabel = useMemo(() => {
    const count = activeTasks.length;
    const noun = activeTab === "daily" ? "daily task" : "active task";
    return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
  }, [activeTab, activeTasks.length]);

  const refreshTasks = useCallback(async () => {
    const currentTodayKey = getTodayKey();
    setTodayKey(currentTodayKey);
    const [openTasks, dailyTasks, progress] = await Promise.all([
      listOpenTasks(currentTodayKey),
      listRecurringTasks(currentTodayKey),
      getDailyProgress(currentTodayKey)
    ]);
    setTasks(openTasks);
    setRecurringTasks(dailyTasks);
    setDailyProgress(progress);
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    if (!normalizedSearchQuery) {
      return activeTasks;
    }

    return activeTasks.filter((task) => {
      return task.title.toLowerCase().includes(normalizedSearchQuery);
    });
  }, [activeTasks, normalizedSearchQuery]);

  const taskRows = useMemo<TaskListRow[]>(() => {
    const todayTasks = filteredTasks.filter((task) => task.date === todayKey);
    const earlierTasks = filteredTasks.filter((task) => task.date < todayKey);
    const rows: TaskListRow[] = [];

    if (activeTab === "daily") {
      if (filteredTasks.length > 0) {
        rows.push({
          id: "section-daily",
          title: "Every day",
          type: "section"
        });
        rows.push(
          ...filteredTasks.map((task) => ({
            id: `task-${task.id}`,
            task,
            type: "task" as const
          }))
        );
      }

      return rows;
    }

    if (todayTasks.length > 0) {
      rows.push({ id: "section-today", title: "Today", type: "section" });
      rows.push(
        ...todayTasks.map((task) => ({
          id: `task-${task.id}`,
          task,
          type: "task" as const
        }))
      );
    }

    if (earlierTasks.length > 0) {
      rows.push({
        id: "section-earlier",
        title: "Earlier unfinished",
        type: "section"
      });
      rows.push(
        ...earlierTasks.map((task) => ({
          id: `task-${task.id}`,
          task,
          type: "task" as const
        }))
      );
    }

    return rows;
  }, [activeTab, filteredTasks, todayKey]);

  useEffect(() => {
    let isMounted = true;

    const boot = async () => {
      try {
        await initializeTasksDatabase();
        await prepareReminderChannel();
        const currentTodayKey = getTodayKey();
        const [openTasks, dailyTasks, progress] = await Promise.all([
          listOpenTasks(currentTodayKey),
          listRecurringTasks(currentTodayKey),
          getDailyProgress(currentTodayKey)
        ]);

        if (isMounted) {
          setTodayKey(currentTodayKey);
          setTasks(openTasks);
          setRecurringTasks(dailyTasks);
          setDailyProgress(progress);
        }
      } catch (error) {
        setMessage("Could not load your tasks. Please restart the app.");
        console.warn(error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    boot();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshTasks().catch((error) => {
          setMessage("Could not refresh today's tasks.");
          console.warn(error);
        });
      }
    });

    return () => {
      isMounted = false;
      appStateSubscription.remove();
    };
  }, [refreshTasks]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);
    nextDay.setHours(0, 0, 1, 0);

    const timeout = setTimeout(() => {
      refreshTasks()
        .then(refreshHomeScreenWidget)
        .catch((error) => {
          setMessage("Could not refresh today's tasks.");
          console.warn(error);
        });
    }, Math.max(1000, nextDay.getTime() - now.getTime()));

    return () => clearTimeout(timeout);
  }, [loading, refreshTasks, todayKey]);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch((error) => {
        console.warn("Could not hide splash screen.", error);
      });
    }
  }, [loading]);

  const handlePickImage = async () => {
    setMessage(null);

    try {
      const result = await pickTaskImage();

      if (result.status === "denied") {
        setMessage("Allow photo access to attach an image.");
      }

      if (result.status === "picked") {
        setSelectedImage(result.image);
      }
    } catch (error) {
      setMessage("Could not select the image. Please try again.");
      console.warn(error);
    }
  };

  const handleAddTask = async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setMessage("Add a task title first.");
      return;
    }

    const parsedReminder = wantsReminder
      ? parseTodayReminderTime(timeText)
      : null;

    if (parsedReminder && !parsedReminder.ok) {
      setMessage(parsedReminder.message);
      return;
    }

    setSaving(true);
    setMessage(null);

    let persistedImageUri: string | null = null;
    let taskCreated = false;

    try {
      const reminderDate = parsedReminder?.ok ? parsedReminder.date : null;

      if (selectedImage) {
        persistedImageUri = await persistTaskImage(selectedImage);
      }

      const newTask = await createTask({
        title: trimmedTitle,
        date: getTodayKey(),
        reminderAt: reminderDate ? reminderDate.toISOString() : null,
        imageUri: persistedImageUri,
        isRecurring: composerIsRecurring
      });
      taskCreated = true;

      if (reminderDate) {
        const reminderResult = composerIsRecurring
          ? await scheduleDailyTaskReminder({
              taskId: newTask.id,
              title: newTask.title,
              hour: reminderDate.getHours(),
              minute: reminderDate.getMinutes()
            })
          : await scheduleTaskReminder({
              taskId: newTask.id,
              title: newTask.title,
              reminderAt: reminderDate
            });

        if (reminderResult.status === "scheduled") {
          try {
            await updateTaskNotificationId(
              newTask.id,
              reminderResult.notificationId
            );
          } catch (error) {
            await cancelTaskReminder(reminderResult.notificationId);
            throw error;
          }

          const scheduleLabel = reminderResult.nextTriggerAt
            ? formatReminderTime(reminderResult.nextTriggerAt)
            : formatReminderTime(reminderDate.toISOString());
          setMessage(
            composerIsRecurring
              ? `Daily task saved. Reminder repeats near ${scheduleLabel}.`
              : `Task saved. Reminder scheduled for ${scheduleLabel}.`
          );
        }

        if (reminderResult.status === "denied") {
          setMessage(
            "Task saved. Enable notifications in Android settings for reminders."
          );
        }

        if (reminderResult.status === "skipped") {
          setMessage("Task saved without reminder because the time passed.");
        }

        if (reminderResult.status === "unavailable") {
          setMessage(
            "Task saved. Reminder notifications need a development build on Android, so they are disabled in Expo Go."
          );
        }

        if (reminderResult.status === "failed") {
          setMessage(reminderResult.message);
        }
      }

      setTitle("");
      setIsRecurring(false);
      setWantsReminder(false);
      setTimeText(getDefaultReminderTime());
      setSelectedImage(null);
      await refreshTasks();
      await refreshHomeScreenWidget();
    } catch (error) {
      if (persistedImageUri && !taskCreated) {
        await deleteTaskImage(persistedImageUri);
      }

      setMessage("Could not save the task. Please try again.");
      console.warn(error);
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteTask = async (task: Task) => {
    setBusyTaskId(task.id);
    setMessage(null);

    try {
      if (!task.isRecurring) {
        await cancelTaskReminder(task.notificationId);
      }
      await completeTask(task.id, getTodayKey(), new Date().toISOString());
      await refreshTasks();
      await refreshHomeScreenWidget();
    } catch (error) {
      setMessage("Could not complete the task. Please try again.");
      console.warn(error);
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = (task: Task) => {
    setTaskPendingDelete(task);
  };

  const confirmDeleteTask = async () => {
    if (!taskPendingDelete) {
      return;
    }

    const task = taskPendingDelete;
    setBusyTaskId(task.id);
    setMessage(null);
    setTaskPendingDelete(null);

    try {
      await cancelTaskReminder(task.notificationId);
      await deleteTask(task.id);
      await deleteTaskImage(task.imageUri);
      await refreshTasks();
      await refreshHomeScreenWidget();
    } catch (error) {
      setMessage("Could not delete the task. Please try again.");
      console.warn(error);
    } finally {
      setBusyTaskId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#f8f4ec"
          translucent={false}
        />
        <ActivityIndicator color="#2f6b4f" size="large" />
        <Text style={styles.loadingText}>Loading today</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#f8f4ec"
        translucent={false}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>OneStep</Text>
            <Text style={styles.title}>
              {activeTab === "daily" ? "Daily" : "Today"}
            </Text>
          </View>
          <View style={styles.datePill}>
            <Text style={styles.dateText}>{formatTodayLabel()}</Text>
            <Text style={styles.countText}>{activeCountLabel}</Text>
            <View style={styles.dateProgressTrack}>
              <View
                style={[
                  styles.dateProgressFill,
                  { width: `${progressPercent}%` }
                ]}
              />
            </View>
            <Text style={styles.progressTinyText}>{progressLabel}</Text>
          </View>
        </View>

        <View style={styles.quickAddBox}>
          <View style={styles.quickAddRow}>
            <TextInput
              autoCapitalize="sentences"
              onChangeText={setTitle}
              onSubmitEditing={handleAddTask}
              placeholder={
                activeTab === "daily"
                  ? "Add a daily task"
                  : "Add a task"
              }
              placeholderTextColor="#8d887d"
              returnKeyType="done"
              ref={titleInputRef}
              style={styles.quickTaskInput}
              value={title}
            />
            <Pressable
              disabled={saving}
              onPress={handleAddTask}
              style={({ pressed }) => [
                styles.quickAddButton,
                pressed && styles.buttonPressed,
                saving && styles.buttonDisabled
              ]}
            >
              <Text style={styles.quickAddButtonText}>
                {saving ? "..." : "+"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.quickOptionsRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: composerIsRecurring }}
              onPress={() => setIsRecurring((current) => !current)}
              style={({ pressed }) => [
                styles.optionChip,
                composerIsRecurring && styles.optionChipActive,
                pressed && styles.optionChipPressed
              ]}
            >
              <Text
                style={[
                  styles.optionChipText,
                  composerIsRecurring && styles.optionChipTextActive
                ]}
              >
                Daily
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: wantsReminder }}
              onPress={() => setWantsReminder((current) => !current)}
              style={({ pressed }) => [
                styles.optionChip,
                wantsReminder && styles.optionChipActive,
                pressed && styles.optionChipPressed
              ]}
            >
              <Text
                style={[
                  styles.optionChipText,
                  wantsReminder && styles.optionChipTextActive
                ]}
              >
                Reminder
              </Text>
            </Pressable>

            {wantsReminder ? (
              <View style={styles.compactTimeField}>
                <Text style={styles.compactTimeLabel}>Time</Text>
                <TextInput
                  inputMode="numeric"
                  maxLength={5}
                  onChangeText={setTimeText}
                  placeholder="18:00"
                  placeholderTextColor="#6f675b"
                  style={styles.compactTimeInput}
                  value={timeText}
                />
              </View>
            ) : null}

            <Pressable
              onPress={handlePickImage}
              style={({ pressed }) => [
                styles.optionChip,
                selectedImage && styles.optionChipActive,
                pressed && styles.optionChipPressed
              ]}
            >
              <Text
                style={[
                  styles.optionChipText,
                  selectedImage && styles.optionChipTextActive
                ]}
              >
                Image
              </Text>
            </Pressable>

          </View>

          {selectedImage ? (
            <View style={styles.selectedImageWrap}>
              <Pressable
                accessibilityLabel="Open selected image"
                onPress={() => setOpenImageUri(selectedImage.uri)}
                style={({ pressed }) => [
                  styles.selectedImageButton,
                  pressed && styles.imagePreviewPressed
                ]}
              >
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={styles.selectedImage}
                />
              </Pressable>
              <Text style={styles.selectedImageLabel}>Image attached</Text>
              <Pressable
                hitSlop={8}
                onPress={() => setSelectedImage(null)}
                style={styles.removeImageButton}
              >
                <Text style={styles.removeImageText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {activeTasks.length > 0 || searchQuery ? (
          <TextInput
            autoCapitalize="none"
            onChangeText={setSearchQuery}
            placeholder={
              activeTab === "daily"
                ? "Search daily tasks"
                : "Search active tasks"
            }
            placeholderTextColor="#8d887d"
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
        ) : null}

        {message ? (
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}

        <FlatList
          contentContainerStyle={[
            styles.listContent,
            taskRows.length === 0 && styles.emptyListContent
          ]}
          data={taskRows}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyToday
              activeTab={activeTab}
              hasTasks={activeTasks.length > 0}
              searchQuery={searchQuery.trim()}
            />
          }
          renderItem={({ item }) => {
            if (item.type === "section") {
              return <Text style={styles.sectionTitle}>{item.title}</Text>;
            }

            return (
              <TaskItem
                busy={busyTaskId === item.task.id}
                onComplete={() => handleCompleteTask(item.task)}
                onDelete={() => handleDeleteTask(item.task)}
                onOpenImage={setOpenImageUri}
                task={item.task}
                todayKey={todayKey}
              />
            );
          }}
        />
      </KeyboardAvoidingView>
      <LiquidTabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        onQuickAdd={() => {
          setActiveTab("today");
          titleInputRef.current?.focus();
        }}
      />
      <ImagePreviewModal
        imageUri={openImageUri}
        onClose={() => setOpenImageUri(null)}
      />
      <DeleteConfirmModal
        busy={Boolean(taskPendingDelete && busyTaskId === taskPendingDelete.id)}
        onCancel={() => setTaskPendingDelete(null)}
        onConfirm={confirmDeleteTask}
        task={taskPendingDelete}
      />
    </SafeAreaView>
  );
}

function ImagePreviewModal({
  imageUri,
  onClose
}: {
  imageUri: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={Boolean(imageUri)}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.imageModal}>
        <View style={styles.imageModalHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close image preview"
            onPress={onClose}
            style={({ pressed }) => [
              styles.imageModalClose,
              pressed && styles.imageModalClosePressed
            ]}
          >
            <Text style={styles.imageModalCloseText}>Close</Text>
          </Pressable>
        </View>
        <Pressable onPress={onClose} style={styles.imageModalBody}>
          {imageUri ? (
            <Image
              resizeMode="contain"
              source={{ uri: imageUri }}
              style={styles.imageModalImage}
            />
          ) : null}
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

function DeleteConfirmModal({
  busy,
  onCancel,
  onConfirm,
  task
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  task: Task | null;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={Boolean(task)}
    >
      <View style={styles.confirmOverlay}>
        <Pressable onPress={onCancel} style={styles.confirmBackdrop} />
        <SafeAreaView edges={["bottom"]} style={styles.confirmSheetWrap}>
          <View style={styles.confirmSheet}>
            <View style={styles.confirmHandle} />
            <Text style={styles.confirmTitle}>Delete task?</Text>
            <Text numberOfLines={2} style={styles.confirmTaskTitle}>
              {task?.title}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                disabled={busy}
                onPress={onCancel}
                style={({ pressed }) => [
                  styles.confirmCancel,
                  pressed && styles.confirmButtonPressed
                ]}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.confirmDelete,
                  pressed && styles.confirmButtonPressed,
                  busy && styles.buttonDisabled
                ]}
              >
                <Text style={styles.confirmDeleteText}>
                  {busy ? "Deleting" : "Delete"}
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function LiquidTabBar({
  activeTab,
  onChange,
  onQuickAdd
}: {
  activeTab: AppTab;
  onChange: (tab: AppTab) => void;
  onQuickAdd: () => void;
}) {
  const tabs: { key: AppTab; icon: string; label: string }[] = [
    { key: "today", icon: "\u2302", label: "Home" },
    { key: "daily", icon: "\u21bb", label: "Daily" }
  ];

  return (
    <View style={styles.tabShell} pointerEvents="box-none">
      <View style={styles.tabBarWrap}>
        <BlurView intensity={65} tint="light" style={styles.tabBar}>
          {tabs.map((tab) => {
            const active = activeTab === tab.key;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                key={tab.key}
                onPress={() => onChange(tab.key)}
                style={({ pressed }) => [
                  styles.tabButton,
                  active && styles.tabButtonActive,
                  pressed && styles.tabButtonPressed
                ]}
              >
                <Text
                  style={[styles.tabIcon, active && styles.tabTextActive]}
                >
                  {tab.icon}
                </Text>
                <Text
                  style={[styles.tabLabel, active && styles.tabTextActive]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </BlurView>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick add task"
        onPress={onQuickAdd}
        style={({ pressed }) => [
          styles.tabQuickButtonWrap,
          pressed && styles.tabButtonPressed
        ]}
      >
        <BlurView intensity={65} tint="light" style={styles.tabQuickButton}>
          <Text style={styles.tabQuickIcon}>+</Text>
        </BlurView>
      </Pressable>
    </View>
  );
}

function EmptyToday({
  activeTab,
  hasTasks,
  searchQuery
}: {
  activeTab: AppTab;
  hasTasks: boolean;
  searchQuery: string;
}) {
  if (hasTasks && searchQuery) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No matching tasks</Text>
        <Text style={styles.emptyCopy}>Try a different search word.</Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {activeTab === "daily" ? "No daily tasks yet" : "All clear for today"}
      </Text>
      <Text style={styles.emptyCopy}>
        {activeTab === "daily"
          ? "Add one task and mark it every day."
          : "Add one small task when you are ready."}
      </Text>
    </View>
  );
}

function TaskItem({
  busy,
  onComplete,
  onDelete,
  onOpenImage,
  task,
  todayKey
}: {
  busy: boolean;
  onComplete: () => void;
  onDelete: () => void;
  onOpenImage: (uri: string) => void;
  task: Task;
  todayKey: string;
}) {
  const doneToday = Boolean(task.completedTodayAt);
  const reminderLabel = task.reminderAt
    ? `${formatReminderTime(task.reminderAt)}${
        task.notificationId ? "" : " - not scheduled"
      }`
    : null;
  const dateLabel =
    task.date === todayKey ? null : formatDateKeyLabel(task.date);
  const recurrenceLabel = task.isRecurring ? "Every day" : null;
  const doneLabel = doneToday ? "Done today" : null;
  const metaLabel = [doneLabel, recurrenceLabel, dateLabel, reminderLabel]
    .filter(Boolean)
    .join(" - ");

  return (
    <View style={styles.taskRow}>
      <Pressable
        accessibilityLabel={`Complete ${task.title}`}
        disabled={busy || doneToday}
        hitSlop={8}
        onPress={onComplete}
        style={({ pressed }) => [
          styles.completeButton,
          doneToday && styles.completeButtonDone,
          pressed && styles.completeButtonPressed,
          busy && styles.controlDisabled
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#2f6b4f" size="small" />
        ) : (
          <Text
            style={[
              styles.completeIcon,
              doneToday && styles.completeIconDone
            ]}
          >
            {"\u2713"}
          </Text>
        )}
      </Pressable>

      <View style={styles.taskTextWrap}>
        <Text numberOfLines={2} style={styles.taskTitle}>
          {task.title}
        </Text>
        {metaLabel ? (
          <Text numberOfLines={1} style={styles.reminderMeta}>
            {metaLabel}
          </Text>
        ) : null}
        {task.imageUri ? (
          <Pressable
            accessibilityLabel={`Open image for ${task.title}`}
            onPress={() => onOpenImage(task.imageUri as string)}
            style={({ pressed }) => [
              styles.taskImageButton,
              pressed && styles.imagePreviewPressed
            ]}
          >
            <Image source={{ uri: task.imageUri }} style={styles.taskImage} />
            <Text style={styles.taskImageHint}>Open image</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityLabel={`Delete ${task.title}`}
        disabled={busy}
        hitSlop={8}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && styles.deleteButtonPressed,
          busy && styles.controlDisabled
        ]}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f4ec"
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16
  },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: "#f8f4ec",
    flex: 1,
    justifyContent: "center"
  },
  loadingText: {
    color: "#5b564d",
    fontSize: 15,
    marginTop: 12
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  appName: {
    color: "#2f6b4f",
    fontSize: 16,
    fontWeight: "700"
  },
  title: {
    color: "#25231f",
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 44
  },
  datePill: {
    alignItems: "flex-end",
    backgroundColor: "#ffffff",
    borderColor: "#e2dccf",
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 126,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  dateText: {
    color: "#394a67",
    fontSize: 14,
    fontWeight: "700"
  },
  countText: {
    color: "#766f63",
    fontSize: 12,
    marginTop: 2
  },
  dateProgressTrack: {
    backgroundColor: "#edf0ed",
    borderRadius: 999,
    height: 5,
    marginTop: 7,
    overflow: "hidden",
    width: "100%"
  },
  dateProgressFill: {
    backgroundColor: "#2f6b4f",
    borderRadius: 999,
    height: "100%"
  },
  progressTinyText: {
    color: "#2f6b4f",
    fontSize: 11,
    fontWeight: "900",
    marginTop: 4
  },
  progressPanel: {
    backgroundColor: "#ffffff",
    borderColor: "#e2dccf",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  progressLabel: {
    color: "#34312b",
    fontSize: 13,
    fontWeight: "800"
  },
  progressValue: {
    color: "#2f6b4f",
    fontSize: 13,
    fontWeight: "900"
  },
  progressTrack: {
    backgroundColor: "#edf0ed",
    borderRadius: 999,
    height: 8,
    marginTop: 10,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: "#2f6b4f",
    borderRadius: 999,
    height: "100%"
  },
  quickAddBox: {
    backgroundColor: "#ffffff",
    borderColor: "#e2dccf",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 2,
    padding: 10
  },
  quickAddRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8
  },
  quickTaskInput: {
    backgroundColor: "#fbfaf7",
    borderColor: "#ded7cb",
    borderRadius: 8,
    borderWidth: 1,
    color: "#25231f",
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 12
  },
  quickAddButton: {
    alignItems: "center",
    backgroundColor: "#2f6b4f",
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    width: 48
  },
  quickAddButtonText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 28
  },
  quickOptionsRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 7
  },
  optionChip: {
    alignItems: "center",
    backgroundColor: "#f3f5f4",
    borderColor: "#d8ded9",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 10
  },
  optionChipActive: {
    backgroundColor: "#e4f0e9",
    borderColor: "#94bda4"
  },
  optionChipPressed: {
    opacity: 0.78
  },
  optionChipText: {
    color: "#596057",
    fontSize: 13,
    fontWeight: "800"
  },
  optionChipTextActive: {
    color: "#2f6b4f"
  },
  compactTimeInput: {
    backgroundColor: "transparent",
    color: "#25231f",
    fontSize: 16,
    fontWeight: "900",
    height: 32,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: "center",
    width: 58
  },
  compactTimeField: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#2f6b4f",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10
  },
  compactTimeLabel: {
    color: "#2f6b4f",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  form: {
    backgroundColor: "#ffffff",
    borderColor: "#e2dccf",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderColor: "#e2dccf",
    borderRadius: 8,
    borderWidth: 1,
    color: "#25231f",
    fontSize: 15,
    minHeight: 42,
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 12
  },
  taskInput: {
    backgroundColor: "#fbfaf7",
    borderColor: "#ded7cb",
    borderRadius: 8,
    borderWidth: 1,
    color: "#25231f",
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12
  },
  attachRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  imageButton: {
    alignItems: "center",
    backgroundColor: "#eef3f8",
    borderColor: "#bac9d8",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12
  },
  imageButtonPressed: {
    backgroundColor: "#dfeaf3"
  },
  imageButtonText: {
    color: "#394a67",
    fontSize: 14,
    fontWeight: "800"
  },
  selectedImageWrap: {
    alignItems: "center",
    backgroundColor: "#fbfaf7",
    borderColor: "#e2dccf",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    minHeight: 42,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  selectedImageButton: {
    borderRadius: 8,
    overflow: "hidden"
  },
  selectedImage: {
    backgroundColor: "#f1eee7",
    borderRadius: 8,
    height: 32,
    width: 32
  },
  selectedImageLabel: {
    color: "#394a67",
    flex: 1,
    fontSize: 13,
    fontWeight: "800"
  },
  imagePreviewPressed: {
    opacity: 0.78
  },
  removeImageButton: {
    paddingHorizontal: 4,
    paddingVertical: 6
  },
  removeImageText: {
    color: "#a83d2b",
    fontSize: 13,
    fontWeight: "800"
  },
  reminderRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  checkbox: {
    alignItems: "center",
    borderColor: "#9b9386",
    borderRadius: 6,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  checkboxChecked: {
    backgroundColor: "#2f6b4f",
    borderColor: "#2f6b4f"
  },
  checkboxMark: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 20
  },
  checkboxMarkChecked: {
    color: "#ffffff"
  },
  reminderLabel: {
    color: "#34312b",
    flex: 1,
    fontSize: 15,
    fontWeight: "700"
  },
  timeInput: {
    backgroundColor: "#fbfaf7",
    borderColor: "#c8b79d",
    borderRadius: 8,
    borderWidth: 1,
    color: "#25231f",
    fontSize: 16,
    fontWeight: "700",
    minHeight: 42,
    paddingHorizontal: 12,
    textAlign: "center",
    width: 86
  },
  timeInputDisabled: {
    backgroundColor: "#f1eee7",
    borderColor: "#e1dbd0",
    color: "#9b9386"
  },
  addButton: {
    alignItems: "center",
    backgroundColor: "#2f6b4f",
    borderRadius: 8,
    marginTop: 12,
    minHeight: 48,
    justifyContent: "center"
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  buttonPressed: {
    opacity: 0.86
  },
  buttonDisabled: {
    opacity: 0.62
  },
  messageBox: {
    backgroundColor: "#fff4d7",
    borderColor: "#e3c66f",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12
  },
  messageText: {
    color: "#5c4613",
    fontSize: 14,
    lineHeight: 20
  },
  listContent: {
    gap: 10,
    paddingBottom: 122,
    paddingTop: 12
  },
  sectionTitle: {
    color: "#6f675b",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase"
  },
  emptyListContent: {
    flexGrow: 1
  },
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24
  },
  emptyTitle: {
    color: "#25231f",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center"
  },
  emptyCopy: {
    color: "#6f675b",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
    textAlign: "center"
  },
  taskRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2dccf",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    padding: 12
  },
  completeButton: {
    alignItems: "center",
    backgroundColor: "#edf6ef",
    borderColor: "#94bda4",
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  completeButtonPressed: {
    backgroundColor: "#dcefe2"
  },
  completeButtonDone: {
    backgroundColor: "#2f6b4f",
    borderColor: "#2f6b4f"
  },
  completeIcon: {
    color: "#2f6b4f",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24
  },
  completeIconDone: {
    color: "#ffffff"
  },
  taskTextWrap: {
    flex: 1,
    minWidth: 0
  },
  taskTitle: {
    color: "#25231f",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22
  },
  reminderMeta: {
    color: "#586b8f",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4
  },
  taskImage: {
    backgroundColor: "#f1eee7",
    borderRadius: 8,
    height: 92,
    width: 92
  },
  taskImageButton: {
    alignSelf: "flex-start",
    marginTop: 10
  },
  taskImageHint: {
    color: "#586b8f",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
  },
  imageModal: {
    backgroundColor: "#111111",
    flex: 1
  },
  imageModalHeader: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10
  },
  imageModalClose: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14
  },
  imageModalClosePressed: {
    opacity: 0.82
  },
  imageModalCloseText: {
    color: "#25231f",
    fontSize: 14,
    fontWeight: "800"
  },
  imageModalBody: {
    flex: 1,
    padding: 16
  },
  imageModalImage: {
    height: "100%",
    width: "100%"
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  confirmBackdrop: {
    backgroundColor: "rgba(22, 22, 20, 0.38)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0
  },
  confirmSheetWrap: {
    paddingHorizontal: 14,
    paddingBottom: 8
  },
  confirmSheet: {
    backgroundColor: "#fffdfa",
    borderColor: "rgba(255, 255, 255, 0.72)",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#000000",
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 24
  },
  confirmHandle: {
    alignSelf: "center",
    backgroundColor: "#d7d0c3",
    borderRadius: 999,
    height: 4,
    marginBottom: 14,
    width: 40
  },
  confirmTitle: {
    color: "#25231f",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  confirmTaskTitle: {
    color: "#6f675b",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    textAlign: "center"
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  },
  confirmCancel: {
    alignItems: "center",
    backgroundColor: "#f0ede6",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 46
  },
  confirmDelete: {
    alignItems: "center",
    backgroundColor: "#a83d2b",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 46
  },
  confirmButtonPressed: {
    opacity: 0.82
  },
  confirmCancelText: {
    color: "#34312b",
    fontSize: 15,
    fontWeight: "900"
  },
  confirmDeleteText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "#fff1ee",
    borderColor: "#f0b2a7",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 10
  },
  deleteButtonPressed: {
    backgroundColor: "#ffe2dc"
  },
  deleteButtonText: {
    color: "#a83d2b",
    fontSize: 13,
    fontWeight: "800"
  },
  controlDisabled: {
    opacity: 0.48
  },
  tabShell: {
    bottom: 24,
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    left: 0,
    position: "absolute",
    right: 0
  },
  tabBarWrap: {
    borderRadius: 29,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24
  },
  tabBar: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.45)",
    borderColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 29,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 6,
    minHeight: 58,
    overflow: "hidden",
    padding: 6
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 23,
    gap: 2,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 24
  },
  tabButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderColor: "rgba(255, 255, 255, 1)",
    borderWidth: 1
  },
  tabButtonPressed: {
    opacity: 0.82
  },
  tabIcon: {
    color: "#6f675b",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24
  },
  tabLabel: {
    color: "#6f675b",
    fontSize: 11,
    fontWeight: "900"
  },
  tabTextActive: {
    color: "#2f6b4f"
  },
  tabQuickButtonWrap: {
    borderRadius: 29,
    height: 58,
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    width: 58
  },
  tabQuickButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.45)",
    borderColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 29,
    borderWidth: 1.5,
    flex: 1,
    justifyContent: "center",
    overflow: "hidden"
  },
  tabQuickIcon: {
    color: "#2f6b4f",
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 30
  }
});
