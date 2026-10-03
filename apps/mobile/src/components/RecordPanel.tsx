import type { RecordDetail, ShufflePick } from "@app/api-client";
import { formatDuration, youtubeWatchUrl } from "@app/core";
import { Linking, Pressable, Text, View } from "react-native";

function Link({ label, url, muted }: { label: string; url: string; muted?: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      className="mr-4 py-2"
    >
      <Text className={muted ? "text-ink-2 underline" : "text-accent underline"}>{label} ↗</Text>
    </Pressable>
  );
}

/** Styles, tempo, tracklist with the playing track highlighted, and the Discogs and YouTube links. */
export function RecordDetails({
  pick,
  detail,
}: {
  pick: ShufflePick;
  detail: RecordDetail | null;
}) {
  const r = pick.record;
  const playing = pick.track?.position;
  return (
    <View testID="record-panel">
      <View className="mb-3 flex-row flex-wrap">
        {r.styles.map((s) => (
          <View
            key={s}
            className="mb-1.5 mr-1.5 rounded border border-line bg-surface-2 px-2 py-0.5"
          >
            <Text className="text-xs text-ink">{s}</Text>
          </View>
        ))}
        {pick.tempo ? (
          <View className="mb-1.5 mr-1.5 rounded border border-line bg-surface-2 px-2 py-0.5">
            <Text className="text-xs text-ink">
              {Math.round(pick.tempo.bpm)} BPM
              {pick.tempo.camelotKey ? ` · ${pick.tempo.camelotKey}` : ""}
              {pick.tempo.source === "community" ? " · listener votes" : ""}
            </Text>
          </View>
        ) : null}
      </View>
      {detail && detail.tracklist.length > 0 ? (
        <View className="mb-3 rounded-md border border-line">
          {detail.tracklist.map((t, i) => {
            const current = Boolean(t.position) && t.position === playing;
            return (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: positions repeat or are empty on headings
                key={`${t.position}-${i}`}
                className={`flex-row items-baseline border-b border-line px-3 py-1.5 ${current ? "bg-surface-2" : ""}`}
                accessibilityState={{ selected: current }}
              >
                <Text className="w-10 text-ink-2">{t.position}</Text>
                <Text
                  className={`flex-1 ${current ? "font-semibold text-accent" : t.position ? "text-ink" : "text-xs uppercase text-ink-2"}`}
                >
                  {t.title}
                </Text>
                {t.durationS !== null ? (
                  <Text className="text-ink-2">{formatDuration(t.durationS)}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      <View className="flex-row flex-wrap items-center">
        <Link label="View on Discogs" url={r.discogsUrl} />
        <Link label="Video on YouTube" url={youtubeWatchUrl(pick.videoId)} muted />
        {pick.tempo?.source === "getsongbpm" ? (
          <Link label="Tempo via GetSongBPM" url="https://getsongbpm.com" muted />
        ) : null}
      </View>
      {detail && detail.pressings > 1 ? (
        <Text className="mt-1 text-xs text-ink-2">
          {detail.pressings} pressings on Discogs · {detail.videos.length} playable video
          {detail.videos.length === 1 ? "" : "s"}
        </Text>
      ) : null}
    </View>
  );
}
