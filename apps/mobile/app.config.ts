import type { ExpoConfig } from "expo/config";

type BuildEnv = Record<string, string | undefined>;

const on = (v: string | undefined) =>
  ["1", "true", "on", "yes"].includes((v ?? "").trim().toLowerCase());

/**
 * The Expo config for a build. The app ID feeds the player WebView's Referer (https:// plus the
 * app ID), so it must match the store listing. The YouTube lane never plays in the background:
 * a default build has no background audio mode at all. Only a build made with
 * FEATURE_CLEARED_LANE gets background playback, for the archive's own audio; the YouTube
 * player still pauses whenever the app leaves the foreground.
 */
export function buildConfig(env: BuildEnv): ExpoConfig {
  const iosId = env.APP_ID_IOS ?? "com.example.cratedig";
  const androidId = env.APP_ID_ANDROID ?? iosId;
  const archive = on(env.FEATURE_CLEARED_LANE);
  return {
    name: "The Crate",
    slug: "the-crate",
    scheme: "thecrate",
    version: "0.1.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    ios: {
      bundleIdentifier: iosId,
      supportsTablet: true,
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      package: androidId,
      // Only the network; nothing is ever recorded.
      permissions: ["INTERNET", "ACCESS_NETWORK_STATE"],
      blockedPermissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        ...(archive ? [] : ["android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"]),
      ],
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-web-browser",
      [
        "expo-audio",
        {
          microphonePermission: false,
          recordAudioAndroid: false,
          enableBackgroundRecording: false,
          enableBackgroundPlayback: archive,
        },
      ],
    ],
    experiments: { typedRoutes: false },
    extra: {
      appIdIos: iosId,
      appIdAndroid: androidId,
      apiUrl: env.EXPO_PUBLIC_API_URL ?? "https://thecrate.example",
      archive,
    },
  };
}

export default buildConfig(process.env);
