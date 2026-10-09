import type { RecordDetail, ShufflePick } from "@app/api-client";
import { formatDuration, youtubeWatchUrl } from "@app/core";
import { router } from "expo-router";
import { Linking, Pressable, Text, View } from "react-native";
import { detailFor, moreFromScopes, type Scope } from "../lib/scopes";
import { Chip } from "./ui";

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

function Tag({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View
      className={`mb-1.5 mr-1.5 rounded border px-2 py-0.5 ${accent ? "border-accent/60" : "border-line bg-surface-2"}`}
    >
      <Text className={`text-xs ${accent ? "text-accent" : "text-ink"}`}>{label}</Text>
    </View>
  );
}

/**
 * Styles, tempo, tracklist with the playing track highlighted, the Discogs and YouTube links,
 * and the Pro "more from" scopes (shown locked without Pro).
 */
export function RecordDetails({
  pick,
  detail: anyDetail,
  proFilters,
  onScope,
}: {
  pick: ShufflePick;
  detail: RecordDetail | null;
  proFilters: boolean;
  onScope: (scope: Scope) => void;
}) {
  // A late answer for an earlier pick never shows under this one.
  const detail = detailFor(pick, anyDetail);
  const r = pick.record;
  const playing = pick.track?.position;
  return (
    <View testID="record-panel">
      <View className="mb-3 flex-row flex-wrap">
        {r.styles.map((s) => (
          <Tag key={s} label={s} />
        ))}
        {pick.tempo ? (
          <Tag
            label={`${Math.round(pick.tempo.bpm)} BPM${pick.tempo.camelotKey ? ` · ${pick.tempo.camelotKey}` : ""}${pick.tempo.source === "community" ? " · listener votes" : ""}`}
          />
        ) : null}
        {pick.channel?.topic ? <Tag label="Topic channel" accent /> : null}
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
      <MoreFrom pick={pick} detail={detail} proFilters={proFilters} onScope={onScope} />
    </View>
  );
}

function MoreFrom({
  pick,
  detail,
  proFilters,
  onScope,
}: {
  pick: ShufflePick;
  detail: RecordDetail | null;
  proFilters: boolean;
  onScope: (scope: Scope) => void;
}) {
  const scopes = moreFromScopes(pick, detail);
  return (
    <View testID="more-from" className="mt-4">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
        Dig deeper
      </Text>
      <View className="flex-row flex-wrap">
        {scopes.map((s) => (
          <Chip
            key={s.id}
            testID={`scope-${s.id.split(":")[0]}`}
            label={s.label}
            hint={s.hint ?? undefined}
            locked={!proFilters}
            onPress={() => onScope(s)}
          />
        ))}
      </View>
      {proFilters ? null : (
        <Pressable accessibilityRole="link" onPress={() => router.push("/account")}>
          <Text className="text-xs text-accent underline">
            Digging deeper into a release, channel, label or artist is a Pro tool.
          </Text>
        </Pressable>
      )}
    </View>
  );
}
