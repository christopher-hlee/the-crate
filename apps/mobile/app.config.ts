import type { ExpoConfig } from "expo/config";

// The app ID feeds the player WebView's Referer (https:// plus the app ID), so it must match
// the store listing. The product name is still open; DEFAULT_APP_ID is the spec's placeholder.
const iosId = process.env.APP_ID_IOS ?? "com.example.cratedig";
const androidId = process.env.APP_ID_ANDROID ?? iosId;

const config: ExpoConfig = {
  name: "The Crate",
  slug: "the-crate",
  scheme: "thecrate",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: iosId,
    supportsTablet: true,
    // No background audio mode in Info.plist: the YouTube lane never plays in the background.
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: androidId,
    // Only the network; no storage or media permissions (nothing is ever saved or recorded).
    permissions: ["INTERNET", "ACCESS_NETWORK_STATE"],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  plugins: ["expo-router", "expo-secure-store", "expo-web-browser"],
  experiments: { typedRoutes: false },
  extra: {
    appIdIos: iosId,
    appIdAndroid: androidId,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://thecrate.example",
  },
};

export default config;
