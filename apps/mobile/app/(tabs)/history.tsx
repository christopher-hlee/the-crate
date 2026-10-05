import type { HistoryResponse } from "@app/api-client";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HeartButton } from "../../src/components/HeartButton";
import { ItemListPlayer } from "../../src/components/ItemListPlayer";
import { Button, Empty, Notice } from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";
import { favoriteStore } from "../../src/lib/favorites";
import { useFavoritesVersion, useToggleFavorite } from "../../src/lib/useFavorite";

type Item = HistoryResponse["items"][number];

export default function HistoryScreen() {
  const { api, me } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = useToggleFavorite();
  const favoritesVersion = useFavoritesVersion();

  useFocusEffect(
    useCallback(() => {
      if (!me) return;
      api
        .history()
        .then((r) => {
          setItems(r.items);
          setCursor(r.nextCursor);
          setWindowSize(r.window);
        })
        .catch(() => undefined);
    }, [api, me]),
  );

  if (!me)
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
        <Empty title="Your history" body="Sign in to keep the records you've played." />
        <View className="px-6">
          <Button label="Sign in" onPress={() => router.push("/login")} />
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <ItemListPlayer
        items={items}
        extraData={favoritesVersion}
        emptyText="Nothing played yet."
        header={
          <View>
            {windowSize ? (
              <Text className="mb-3 text-ink-2">
                Your last {windowSize.toLocaleString()} plays.
              </Text>
            ) : null}
            {notice ? <Notice>{notice}</Notice> : null}
          </View>
        }
        subtitle={(i) => new Date(i.playedAt).toLocaleString()}
        actions={(item) => {
          const favorited = favoriteStore.get(item) ?? false;
          return (
            <HeartButton
              favorited={favorited}
              onPress={() =>
                void toggle(item, favorited).then((r) => {
                  setNotice(r.ok ? null : r.error);
                })
              }
            />
          );
        }}
        onEndReached={() => {
          if (!cursor) return;
          const c = cursor;
          setCursor(null);
          api
            .history(c)
            .then((r) => {
              setItems((prev) => [...prev, ...r.items]);
              setCursor(r.nextCursor);
            })
            .catch(() => setCursor(c));
        }}
      />
    </SafeAreaView>
  );
}
