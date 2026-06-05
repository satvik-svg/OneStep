import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
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

import {
  completeTask,
  createTask,
  deleteTask,
  initializeTasksDatabase,
  listOpenTasks,
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
  scheduleTaskReminder
} from "./src/services/reminders";
import type { Task } from "./src/types";
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

export default function App() {
  return (
    <SafeAreaProvider>
      <TodayApp />
    </SafeAreaProvider>
  );
}

function TodayApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [todayKey, setTodayKey] = useState(getTodayKey());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [wantsReminder, setWantsReminder] = useState(false);
  const [timeText, setTimeText] = useState(getDefaultReminderTime());
  const [selectedImage, setSelectedImage] = useState<PickedTaskImage | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const completedCountLabel = useMemo(() => {
    const count = tasks.length;
    return count === 1 ? "1 task left" : `${count} tasks left`;
  }, [tasks.length]);

  const refreshTasks = useCallback(async () => {
    const currentTodayKey = getTodayKey();
    setTodayKey(currentTodayKey);
    setTasks(await listOpenTasks());
  }, []);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    if (!normalizedSearchQuery) {
      return tasks;
    }

    return tasks.filter((task) => {
      return task.title.toLowerCase().includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, tasks]);

  const taskRows = useMemo<TaskListRow[]>(() => {
    const todayTasks = filteredTasks.filter((task) => task.date === todayKey);
    const earlierTasks = filteredTasks.filter((task) => task.date < todayKey);
    const rows: TaskListRow[] = [];

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
  }, [filteredTasks, todayKey]);

  useEffect(() => {
    let isMounted = true;

    const boot = async () => {
      try {
        await initializeTasksDatabase();
        await prepareReminderChannel();
        const currentTodayKey = getTodayKey();
        const openTasks = await listOpenTasks();

        if (isMounted) {
          setTodayKey(currentTodayKey);
          setTasks(openTasks);
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
        imageUri: persistedImageUri
      });
      taskCreated = true;

      if (reminderDate) {
        const reminderResult = await scheduleTaskReminder({
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
      }

      setTitle("");
      setWantsReminder(false);
      setTimeText(getDefaultReminderTime());
      setSelectedImage(null);
      await refreshTasks();
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
      await cancelTaskReminder(task.notificationId);
      await completeTask(task.id, new Date().toISOString());
      await refreshTasks();
    } catch (error) {
      setMessage("Could not complete the task. Please try again.");
      console.warn(error);
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = (task: Task) => {
    Alert.alert("Delete task?", task.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyTaskId(task.id);
          setMessage(null);

          try {
            await cancelTaskReminder(task.notificationId);
            await deleteTask(task.id);
            await deleteTaskImage(task.imageUri);
            await refreshTasks();
          } catch (error) {
            setMessage("Could not delete the task. Please try again.");
            console.warn(error);
          } finally {
            setBusyTaskId(null);
          }
        }
      }
    ]);
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
            <Text style={styles.title}>Today</Text>
          </View>
          <View style={styles.datePill}>
            <Text style={styles.dateText}>{formatTodayLabel()}</Text>
            <Text style={styles.countText}>{completedCountLabel}</Text>
          </View>
        </View>

        <TextInput
          autoCapitalize="none"
          onChangeText={setSearchQuery}
          placeholder="Search active tasks"
          placeholderTextColor="#8d887d"
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />

        <View style={styles.form}>
          <TextInput
            autoCapitalize="sentences"
            onChangeText={setTitle}
            onSubmitEditing={handleAddTask}
            placeholder="What do you need to do today?"
            placeholderTextColor="#8d887d"
            returnKeyType="done"
            style={styles.taskInput}
            value={title}
          />

          <View style={styles.attachRow}>
            <Pressable
              onPress={handlePickImage}
              style={({ pressed }) => [
                styles.imageButton,
                pressed && styles.imageButtonPressed
              ]}
            >
              <Text style={styles.imageButtonText}>+ Image</Text>
            </Pressable>

            {selectedImage ? (
              <View style={styles.selectedImageWrap}>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={styles.selectedImage}
                />
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

          <View style={styles.reminderRow}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: wantsReminder }}
              hitSlop={8}
              onPress={() => setWantsReminder((current) => !current)}
              style={[
                styles.checkbox,
                wantsReminder && styles.checkboxChecked
              ]}
            >
              <Text
                style={[
                  styles.checkboxMark,
                  wantsReminder && styles.checkboxMarkChecked
                ]}
              >
                {wantsReminder ? "\u2713" : ""}
              </Text>
            </Pressable>
            <Text style={styles.reminderLabel}>Reminder</Text>
            <TextInput
              editable={wantsReminder}
              inputMode="numeric"
              maxLength={5}
              onChangeText={setTimeText}
              placeholder="18:00"
              placeholderTextColor="#a7a196"
              style={[
                styles.timeInput,
                !wantsReminder && styles.timeInputDisabled
              ]}
              value={timeText}
            />
          </View>

          <Pressable
            disabled={saving}
            onPress={handleAddTask}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.buttonPressed,
              saving && styles.buttonDisabled
            ]}
          >
            <Text style={styles.addButtonText}>{saving ? "Saving" : "+ Add"}</Text>
          </Pressable>
        </View>

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
              hasTasks={tasks.length > 0}
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
                task={item.task}
                todayKey={todayKey}
              />
            );
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EmptyToday({
  hasTasks,
  searchQuery
}: {
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
      <Text style={styles.emptyTitle}>All clear for today</Text>
      <Text style={styles.emptyCopy}>Add one small task when you are ready.</Text>
    </View>
  );
}

function TaskItem({
  busy,
  onComplete,
  onDelete,
  task,
  todayKey
}: {
  busy: boolean;
  onComplete: () => void;
  onDelete: () => void;
  task: Task;
  todayKey: string;
}) {
  const reminderLabel = task.reminderAt
    ? `${formatReminderTime(task.reminderAt)}${
        task.notificationId ? "" : " - not scheduled"
      }`
    : null;
  const dateLabel =
    task.date === todayKey ? null : formatDateKeyLabel(task.date);
  const metaLabel = [dateLabel, reminderLabel].filter(Boolean).join(" - ");

  return (
    <View style={styles.taskRow}>
      <Pressable
        accessibilityLabel={`Complete ${task.title}`}
        disabled={busy}
        hitSlop={8}
        onPress={onComplete}
        style={({ pressed }) => [
          styles.completeButton,
          pressed && styles.completeButtonPressed,
          busy && styles.controlDisabled
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#2f6b4f" size="small" />
        ) : (
          <Text style={styles.completeIcon}>{"\u2713"}</Text>
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
          <Image source={{ uri: task.imageUri }} style={styles.taskImage} />
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
    marginBottom: 18
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
    paddingHorizontal: 12,
    paddingVertical: 10
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
    minHeight: 44,
    marginBottom: 12,
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
    flexDirection: "row",
    flex: 1,
    gap: 8,
    minWidth: 0
  },
  selectedImage: {
    backgroundColor: "#f1eee7",
    borderRadius: 8,
    height: 40,
    width: 40
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
    paddingBottom: 28,
    paddingTop: 16
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
  completeIcon: {
    color: "#2f6b4f",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24
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
    marginTop: 10,
    width: 92
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
  }
});
