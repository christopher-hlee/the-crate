import Constants from "expo-constants";
import { Platform } from "react-native";
import { appConfig } from "../config";

export const config = appConfig(
  Constants.expoConfig?.extra as Parameters<typeof appConfig>[0],
  Platform.OS,
);
