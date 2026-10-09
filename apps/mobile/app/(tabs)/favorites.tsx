// Favorites: free for anyone signed in. One player for the list (ItemListPlayer), paged by
// cursor, with inline notes, a heart to remove, and "Open in YouTube" for plans that have it.

import type { FavoriteItem, MeResponse } from "@app/api-client";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeartButton } from "../../src/components/HeartButton";
import { ItemListPlayer } from "../../src/components/ItemListPlayer";
import { ItemNoteEditor } from "../../src/components/ItemNoteEditor";
import { PlaylistLinks } from "../../src/components/PlaylistLinks";
import { Button, Empty, Notice } from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";
import { errorMessage } from "../../src/lib/errors";
import { favoriteStore, itemKey } from "../../src/lib/favorites";
import { useToggleFavorite } from "../../src/lib/useFavorite";
import { useMounted } from "../../src/lib/useMounted";

export default function FavoritesScreen() {
  const { me } = useAuth();
  if (!me)
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
        <Empty title="Favorites" body="Sign in to keep the records you love. Favorites are free." />
        <View className="px-6">
          <Button label="Sign in" onPress={() => router.push("/login")} />
        </View>
      </SafeAreaView>
    );
  // Tabs stay mounted, so the list is keyed by account: another user's favorites, notes and
  // cursor never show after a switch, not even while the new list loads.
  return <FavoritesList key={me.user.id} me={me} />;
}

function FavoritesList({ me }: { me: MeResponse }) {
  const { api } = useAuth();
  const mounted = useMounted();
  const toggle = useToggleFavorite();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .favorites()
        .then((r) => {
          // Dropped once the account has changed, so the store never learns another's list.
          if (!mounted.current) return;
          setItems(r.items);
          setCursor(r.nextCursor);
          setTotal(r.total);
          favoriteStore.setMany(r.items, true);
        })
        .catch((err) => {
          if (mounted.current) setNotice(errorMessage(err, "Couldn't load your favorites."));
        });
    }, [api, mounted]),
  );

  // The cursor is opaque: it goes back to the server as it came.
  const loadMore = () => {
    if (!cursor) return;
    const c = cursor;
    setCursor(null);
    api
      .favorites(c)
      .then((r) => {
        if (!mounted.current) return;
        setItems((prev) => {
          const have = new Set(prev.map(itemKey));
          return [...prev, ...r.items.filter((i) => !have.has(itemKey(i)))];
        });
        setCursor(r.nextCursor);
        setTotal(r.total);
        favoriteStore.setMany(r.items, true);
      })
      .catch(() => setCursor(c));
  };

  const remove = async (item: FavoriteItem) => {
    setNotice(null);
    const result = await toggle(item, true);
    if (!result.ok) {
      if (result.error) setNotice(result.error);
      return;
    }
    setItems((prev) => prev.filter((i) => itemKey(i) !== itemKey(item)));
    setTotal((t) => (t === null ? t : Math.max(0, t - 1)));
    if (editing === itemKey(item)) setEditing(null);
  };

  const saveNote = async (item: FavoriteItem, note: string | null): Promise<string | null> => {
    try {
      await api.setFavoriteNote({ recordKey: item.recordKey, videoId: item.videoId }, note);
      setItems((prev) => prev.map((i) => (itemKey(i) === itemKey(item) ? { ...i, note } : i)));
      return null;
    } catch (err) {
      return errorMessage(err, "Couldn't save the note.");
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ItemListPlayer
        items={items}
        extraData={editing}
        emptyText="No favorites yet. Tap ♡ on a record in Dig to keep it here."
        onEndReached={loadMore}
        header={
          <View>
            <Text className="mb-1 text-2xl font-semibold text-ink">Favorites</Text>
            {total !== null ? (
              <Text className="mb-3 text-ink-2">
                {total.toLocaleString()} of {me.limits.maxFavorites.toLocaleString()}
              </Text>
            ) : null}
            {notice ? <Notice>{notice}</Notice> : null}
            <PlaylistLinks
              items={items}
              allowed={me.limits.youtubePlaylist}
              partial={cursor !== null}
            />
          </View>
        }
        actions={(item) => {
          const k = itemKey(item);
          return (
            <View className="flex-row items-center">
              {me.limits.notes ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={item.note ? "Edit note" : "Add a note"}
                  onPress={() => setEditing(editing === k ? null : k)}
                  hitSlop={6}
                  className="ml-2 px-2 py-2"
                >
                  <Text className="text-ink-2">{item.note ? "Note" : "+ Note"}</Text>
                </Pressable>
              ) : null}
              <HeartButton favorited onPress={() => void remove(item)} />
            </View>
          );
        }}
        below={(item) => {
          const k = itemKey(item);
          if (editing === k)
            return (
              <ItemNoteEditor
                initial={item.note ?? ""}
                onSave={(note) => saveNote(item, note)}
                onClose={() => setEditing(null)}
              />
            );
          return item.note ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Edit the note"
              onPress={() => setEditing(k)}
            >
              <Text numberOfLines={3} className="mt-1 text-sm text-ink-2">
                {item.note}
              </Text>
            </Pressable>
          ) : null;
        }}
      />
    </SafeAreaView>
  );
}
