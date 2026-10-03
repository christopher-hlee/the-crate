import { DEFAULT_APP_ID } from "@app/core";

type Extra = { appIdIos?: string; appIdAndroid?: string; apiUrl?: string };

/** Static config, separated from expo-constants so it can be tested without a device. */
export function appConfig(extra: Extra | undefined, platform: "ios" | "android" | string) {
  const appId = (platform === "android" ? extra?.appIdAndroid : extra?.appIdIos) ?? DEFAULT_APP_ID;
  return {
    appId,
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? extra?.apiUrl ?? "https://thecrate.example",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    authMode:
      process.env.EXPO_PUBLIC_AUTH_MODE === "dev" ? ("dev" as const) : ("supabase" as const),
    revenueCatKey:
      platform === "android"
        ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  };
}
