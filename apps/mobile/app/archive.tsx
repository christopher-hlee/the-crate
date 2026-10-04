// The archive on mobile (flagged, unlisted): its own public-domain and CC audio, so it can
// keep recordings offline and play in the background. The YouTube lane can do neither.

import { ApiError, type Asset } from "@app/api-client";
import { decodeWav, encodeWav, type Peaks, regionsFromChops, sliceAudio } from "@app/core";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Stack } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Sleeve } from "../src/components/Sleeve";
import { Button, Empty, Notice } from "../src/components/ui";
import { Waveform } from "../src/components/Waveform";
import {
  archiveEnabled,
  cacheFile,
  downloadToCache,
  keepOffline,
  offlineUri,
  removeOffline,
} from "../src/lib/archive";
import { useAuth } from "../src/lib/auth";

function ArchivePlayer({ asset }: { asset: Asset }) {
  const { api, me, getAccessToken } = useAuth();
  const [localUri, setLocalUri] = useState(() => offlineUri(asset.id));
  const player = useAudioPlayer(localUri ?? asset.previewUrl);
  const status = useAudioPlayerStatus(player);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [markers, setMarkers] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const loaded = useRef(false);
  const duration = asset.durationS ?? status.duration ?? 0;

  useEffect(() => {
    loaded.current = false;
    fetch(asset.peaksUrl)
      .then((r) => (r.ok ? (r.json() as Promise<Peaks>) : null))
      .then(setPeaks)
      .catch(() => setPeaks(null));
    if (me)
      api
        .chops(asset.id)
        .then((c) => setMarkers(c.markers))
        .catch(() => undefined)
        .finally(() => {
          loaded.current = true;
        });
  }, [api, me, asset.id, asset.peaksUrl]);

  useEffect(() => {
    if (!me || !loaded.current) return;
    const t = setTimeout(() => void api.saveChops(asset.id, markers).catch(() => undefined), 600);
    return () => clearTimeout(t);
  }, [api, me, asset.id, markers]);

  // Lock-screen controls keep Android playing in the background (archive audio only).
  useEffect(() => {
    if (status.playing)
      player.setActiveForLockScreen(true, { title: asset.title, artist: asset.artist });
  }, [status.playing, player, asset.title, asset.artist]);

  const regions = useMemo(
    () => (duration ? regionsFromChops(markers, duration) : []),
    [markers, duration],
  );

  const exportWav = async (region: (typeof regions)[number] | null) => {
    setBusy(region ? `chop-${region.index}` : "full");
    setNotice(null);
    try {
      const d = await api.assetDownload(asset.id, region ?? undefined);
      const token = await getAccessToken();
      const master = await downloadToCache(
        d.wavUrl,
        "master.wav",
        token ? { authorization: `Bearer ${token}` } : {},
      );
      const bytes = await master.bytes();
      const file = cacheFile(
        `${d.fileStem}.wav`,
        region
          ? encodeWav(sliceAudio(decodeWav(bytes), region.startSeconds, region.endSeconds), 16)
          : bytes,
      );
      // The share sheet's "Save to Files" puts the WAV wherever the user's DAW reads from.
      await Sharing.shareAsync(file.uri, {
        mimeType: "audio/wav",
        UTI: "com.microsoft.waveform-audio",
        dialogTitle: d.fileStem,
      });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "The export failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View testID="archive-player">
      <Waveform
        peaks={peaks}
        progress={duration ? status.currentTime / duration : 0}
        markers={markers}
        duration={duration}
        onSeek={(s) => void player.seekTo(s)}
      />
      <View className="my-2 flex-row flex-wrap items-center gap-2">
        <Button
          variant="primary"
          label={status.playing ? "Pause" : "Play"}
          onPress={() => (status.playing ? player.pause() : player.play())}
        />
        <Button
          label="Chop here"
          onPress={() => {
            const t = Math.round(status.currentTime * 1000) / 1000;
            if (t > 0 && t < duration) setMarkers((m) => [...m, t].sort((a, b) => a - b));
          }}
        />
        <Button
          variant="ghost"
          label="Undo chop"
          disabled={!markers.length}
          onPress={() => setMarkers((m) => m.slice(0, -1))}
        />
        <Text className="text-ink-2">
          {status.currentTime.toFixed(1)}s / {duration.toFixed(1)}s
        </Text>
      </View>
      {notice ? <Notice>{notice}</Notice> : null}
      {regions.length > 1
        ? regions.map((r) => (
            <View key={r.index} className="flex-row items-center border-b border-line py-1.5">
              <Pressable
                className="flex-1"
                onPress={() => {
                  void player.seekTo(r.startSeconds);
                  player.play();
                }}
              >
                <Text className="text-ink">
                  Chop {r.index}: {r.startSeconds.toFixed(1)}–{r.endSeconds.toFixed(1)}s
                </Text>
              </Pressable>
              {me?.plan === "pro" ? (
                <Button
                  variant="ghost"
                  label="WAV"
                  busy={busy === `chop-${r.index}`}
                  onPress={() => void exportWav(r)}
                />
              ) : null}
            </View>
          ))
        : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        {localUri ? (
          <Button
            label="Remove offline copy"
            onPress={() => {
              removeOffline(asset.id);
              setLocalUri(null);
            }}
          />
        ) : (
          <Button
            label="Keep offline"
            busy={busy === "offline"}
            onPress={async () => {
              setBusy("offline");
              try {
                setLocalUri(await keepOffline(asset));
              } catch {
                setNotice("Couldn't save it for offline listening.");
              } finally {
                setBusy(null);
              }
            }}
          />
        )}
        {me?.plan === "pro" ? (
          <Button
            variant="primary"
            label="Save WAV to Files"
            busy={busy === "full"}
            onPress={() => void exportWav(null)}
          />
        ) : (
          <Text className="text-ink-2">Listening is free. WAV export is a Pro tool.</Text>
        )}
      </View>
      <View className="mt-4 rounded-md border border-line p-3" testID="rights">
        <Text className="text-ink">
          {asset.rights.basisLabel}
          {asset.rights.recordingYear ? ` · published ${asset.rights.recordingYear}` : ""}
        </Text>
        {asset.rights.attribution ? (
          <Text className="text-ink-2">Credit: {asset.rights.attribution}</Text>
        ) : null}
        {asset.rights.dateEvidence.map((e) => (
          <Text key={e.citation} className="text-ink-2">
            Date evidence: {e.citation}
          </Text>
        ))}
        <View className="flex-row gap-4">
          <Pressable onPress={() => void Linking.openURL(asset.rights.sourceUrl)}>
            <Text className="text-accent underline">Source ↗</Text>
          </Pressable>
          {asset.rights.licenseUrl ? (
            <Pressable onPress={() => void Linking.openURL(asset.rights.licenseUrl ?? "")}>
              <Text className="text-accent underline">Licence ↗</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function ArchiveScreen() {
  const { api } = useAuth();
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!archiveEnabled) return;
    // Archive audio may keep playing with the screen off; the YouTube player still pauses.
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    api
      .assets()
      .then((r) => {
        setAssets(r.assets);
        setSelected(r.assets[0] ?? null);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Couldn't load the archive."),
      );
  }, [api]);

  if (!archiveEnabled) return <Empty title="Not available" />;

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: "Archive (preview)" }} />
      <ScrollView contentContainerClassName="p-4">
        {error ? <Notice>{error}</Notice> : null}
        {selected ? (
          <View className="mb-4">
            <View className="mb-3 flex-row items-center">
              <Sleeve
                label={selected.label}
                catno={selected.catno}
                year={selected.year}
                styles={selected.styles}
                size={64}
              />
              <View className="ml-3 flex-1">
                <Text className="text-ink-2">{selected.artist}</Text>
                <Text className="text-lg font-semibold text-ink">{selected.title}</Text>
              </View>
            </View>
            <ArchivePlayer key={selected.id} asset={selected} />
          </View>
        ) : null}
        <FlatList
          scrollEnabled={false}
          data={assets ?? []}
          keyExtractor={(a) => a.id}
          ListEmptyComponent={assets ? <Empty title="Nothing here yet" /> : null}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelected(item)}
              className={`mb-2 rounded-md border px-3 py-2 ${selected?.id === item.id ? "border-accent bg-surface-2" : "border-line bg-surface"}`}
            >
              <Text className="font-medium text-ink">{item.title}</Text>
              <Text className="text-xs text-ink-2">
                {[
                  item.artist,
                  item.year,
                  item.rights.basisLabel,
                  offlineUri(item.id) ? "offline" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </Pressable>
          )}
        />
      </ScrollView>
    </View>
  );
}
