import { Text, View } from "react-native";

/** Shown in place of the dig when there's no connection. The YouTube lane has no offline mode. */
export function OfflineState() {
  return (
    <View
      testID="offline"
      accessibilityRole="alert"
      className="m-4 rounded-lg border border-line bg-surface p-6"
    >
      <Text className="mb-2 text-lg font-semibold text-ink">You're offline</Text>
      <Text className="text-ink-2">
        Digging needs a connection: records play from YouTube as you listen, and nothing is saved
        for offline play. Your crates will be here when you're back online.
      </Text>
    </View>
  );
}
