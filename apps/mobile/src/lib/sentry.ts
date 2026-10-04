import * as Sentry from "@sentry/react-native";

/** Error reporting when EXPO_PUBLIC_SENTRY_DSN is set; a no-op otherwise. */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false });
}

export const withSentry = Sentry.wrap;
