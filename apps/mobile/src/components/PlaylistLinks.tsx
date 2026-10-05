import { router } from "expo-router";
import { useMemo } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { playlistParts } from "../lib/playlist";
import { Button, Chip } from "./ui";

/**
 * "Open in YouTube" (Pro, limits.youtubePlaylist): one youtube.com link per 50 playable videos,
 * opened in YouTube's own app or site. Playing in this app stays free; this is an export tool.
 */
export function PlaylistLinks({
  items,
  allowed,
  partial,
}: {
  items: readonly { videoId: string; available: boolean }[];
  allowed: boolean;
  /** More of the list exists than is loaded. */
  partial?: boolean;
}) {
  const parts = useMemo(() => playlistParts(items), [items]);
  if (parts.length === 0) return null;
  if (!allowed)
    return (
      <View testID="youtube-playlist-locked" className="mb-3">
        <View className="flex-row">
          <Chip label="Open in YouTube" locked />
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push("/account")}>
          <Text className="text-xs text-accent underline">
            Pro opens this list as YouTube playlists, 50 videos at a time.
          </Text>
        </Pressable>
      </View>
    );
  return (
    <View testID="youtube-playlist" className="mb-3">
      {parts.length > 1 ? (
        <Text className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-2">
          Open in YouTube
        </Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {parts.map((p) => (
          <Button
            key={p.url}
            label={p.label}
            accessibilityHint={`Opens ${p.count} video${p.count === 1 ? "" : "s"} in YouTube`}
            onPress={() => void Linking.openURL(p.url).catch(() => undefined)}
          />
        ))}
      </View>
      <Text className="mt-1 text-xs text-ink-2">
        {partial
          ? "Covers the records loaded so far; scroll down to load more."
          : "Opens as an unsaved playlist you can keep in your YouTube account."}
      </Text>
    </View>
  );
}
