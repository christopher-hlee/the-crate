import { ApiError, type CatalogItem, type CrateDetail } from "@app/api-client";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, Share, Text, View } from "react-native";
import { HeartButton } from "../../src/components/HeartButton";
import { ItemListPlayer } from "../../src/components/ItemListPlayer";
import { PlaylistLinks } from "../../src/components/PlaylistLinks";
import { Button, Chip, Notice } from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";
import { favoriteStore } from "../../src/lib/favorites";
import { useFavoritesVersion, useToggleFavorite } from "../../src/lib/useFavorite";

type Tab = "saved" | "seeded";

export default function CrateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, me, getAccessToken } = useAuth();
  const [detail, setDetail] = useState<CrateDetail | null>(null);
  const [sequence, setSequence] = useState<{
    items: CatalogItem[];
    page: number;
    hasMore: boolean;
  } | null>(null);
  const [tab, setTab] = useState<Tab>("saved");
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const toggleFavorite = useToggleFavorite();
  const favoritesVersion = useFavoritesVersion();

  const load = useCallback(() => {
    if (!id) return;
    api
      .crate(id)
      .then(setDetail)
      .catch((err) =>
        setNotice(err instanceof ApiError ? err.message : "Couldn't load the crate."),
      );
  }, [api, id]);
  useEffect(load, [load]);

  const crate = detail?.crate;
  const seeded = crate?.seed !== null && crate?.seed !== undefined;

  useEffect(() => {
    if (!seeded || tab !== "seeded" || sequence || !id) return;
    api
      .sequence(id, 0)
      .then((r) => setSequence({ items: r.items, page: r.page, hasMore: r.hasMore }))
      .catch((err) =>
        setNotice(err instanceof ApiError ? err.message : "Couldn't load the seeded order."),
      );
  }, [api, id, seeded, tab, sequence]);

  const more = () => {
    if (!id || !sequence?.hasMore || loadingMore) return;
    setLoadingMore(true);
    api
      .sequence(id, sequence.page + 1)
      .then((r) =>
        setSequence({ items: [...sequence.items, ...r.items], page: r.page, hasMore: r.hasMore }),
      )
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  };

  const share = async () => {
    if (!id) return;
    try {
      const r = await api.share(id);
      await Share.share({ message: r.url, url: r.url });
      load();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Couldn't share the crate.");
    }
  };

  // Crate sheets are links and metadata only: no audio, video or thumbnails.
  const exportSheet = async (format: "csv" | "json") => {
    if (!id) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(api.exportUrl(id, format), {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok)
        throw new Error(
          res.status === 403 ? "Crate sheets are a Pro tool." : `Export failed (${res.status}).`,
        );
      await Share.share({
        message: await res.text(),
        title: `${crate?.name ?? "Crate"}.${format}`,
      });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Export failed.");
    }
  };

  const remove = (item: CatalogItem) => {
    if (!id) return;
    api
      .removeItem(id, { recordKey: item.recordKey, videoId: item.videoId })
      .then(setDetail)
      .catch((err) => setNotice(err instanceof ApiError ? err.message : "Couldn't remove it."));
  };

  const heart = (item: CatalogItem) => {
    const favorited = favoriteStore.get(item) ?? false;
    return (
      <HeartButton
        favorited={favorited}
        onPress={() =>
          void toggleFavorite(item, favorited).then((r) => {
            if (!r.ok && r.error) setNotice(r.error);
          })
        }
      />
    );
  };

  const deleteCrate = () =>
    Alert.alert("Delete this crate?", "The records stay in the catalog; only this crate goes.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void api
            .deleteCrate(id ?? "")
            .then(() => router.back())
            .catch(() => setNotice("Couldn't delete the crate.")),
      },
    ]);

  const header = (
    <View>
      {notice ? <Notice>{notice}</Notice> : null}
      {seeded ? (
        <View className="mb-2 flex-row">
          <Chip label="Saved records" active={tab === "saved"} onPress={() => setTab("saved")} />
          <Chip label="Seeded order" active={tab === "seeded"} onPress={() => setTab("seeded")} />
        </View>
      ) : null}
      <View className="mb-3 flex-row flex-wrap gap-2">
        {me?.limits.createShared ? (
          <Button label={crate?.shareId ? "Share link" : "Share"} onPress={() => void share()} />
        ) : null}
        {me?.limits.crateExport ? (
          <>
            <Button label="Export CSV" onPress={() => void exportSheet("csv")} />
            <Button label="Export JSON" onPress={() => void exportSheet("json")} />
          </>
        ) : null}
        <Button variant="ghost" label="Delete crate" onPress={deleteCrate} />
      </View>
      <PlaylistLinks
        items={tab === "seeded" && seeded ? (sequence?.items ?? []) : (detail?.items ?? [])}
        allowed={Boolean(me?.limits.youtubePlaylist)}
        partial={tab === "seeded" && seeded && Boolean(sequence?.hasMore)}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: crate?.name ?? "Crate" }} />
      {/* One player per screen: the tabs swap the list, never add a second player. */}
      {tab === "seeded" && seeded ? (
        <ItemListPlayer
          key="seeded"
          items={sequence?.items ?? []}
          header={header}
          extraData={favoritesVersion}
          actions={heart}
          onEndReached={more}
          emptyText="No records match this crate's filters."
        />
      ) : (
        <ItemListPlayer
          key="saved"
          items={detail?.items ?? []}
          header={header}
          extraData={favoritesVersion}
          emptyText="This crate is empty. Save records from Dig to fill it."
          actions={(item) => (
            <View className="flex-row items-center">
              {heart(item)}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove from crate"
                onPress={() => remove(item)}
                className="ml-1 px-2 py-2"
              >
                <Text className="text-ink-2">Remove</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}
