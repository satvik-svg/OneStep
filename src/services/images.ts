import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";

const IMAGE_DIRECTORY = `${FileSystem.documentDirectory ?? ""}task-images/`;

export type PickedTaskImage = {
  fileName: string | null;
  uri: string;
};

export type PickTaskImageResult =
  | { status: "picked"; image: PickedTaskImage }
  | { status: "canceled" }
  | { status: "denied" };

const getImageExtension = (fileName: string | null, uri: string) => {
  const source = fileName || uri;
  const match = /\.([a-zA-Z0-9]+)(?:\?|#|$)/.exec(source);
  return match ? match[1].toLowerCase() : "jpg";
};

const ensureImageDirectory = async () => {
  if (!FileSystem.documentDirectory) {
    throw new Error("Document directory is unavailable.");
  }

  await FileSystem.makeDirectoryAsync(IMAGE_DIRECTORY, { intermediates: true });
};

export const pickTaskImage = async (): Promise<PickTaskImageResult> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return { status: "denied" };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: false,
    mediaTypes: "images",
    quality: 0.75
  });

  if (result.canceled || !result.assets[0]) {
    return { status: "canceled" };
  }

  return {
    status: "picked",
    image: {
      fileName: result.assets[0].fileName ?? null,
      uri: result.assets[0].uri
    }
  };
};

export const persistTaskImage = async (image: PickedTaskImage) => {
  await ensureImageDirectory();

  const extension = getImageExtension(image.fileName, image.uri);
  const destination = `${IMAGE_DIRECTORY}${Date.now()}-${Math.round(
    Math.random() * 1000000
  )}.${extension}`;

  await FileSystem.copyAsync({
    from: image.uri,
    to: destination
  });

  return destination;
};

export const deleteTaskImage = async (uri: string | null) => {
  if (!uri) {
    return;
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch (error) {
    console.warn("Could not delete task image", error);
  }
};
