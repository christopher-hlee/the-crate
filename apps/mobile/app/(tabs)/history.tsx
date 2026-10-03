import type { HistoryResponse } from "@app/api-client";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ItemListPlayer } from "../../src/components/ItemListPlayer";
import { Button, Empty } from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";

type Item = HistoryResponse["items"][number];

export default function HistoryScreen() {
  const { api, me } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [windowSize, setWindowSize] = useState<number | null>(null);

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
        emptyText="Nothing played yet."
        header={
          windowSize ? (
            <Text className="mb-3 text-ink-2">Your last {windowSize.toLocaleString()} plays.</Text>
          ) : undefined
        }
        subtitle={(i) => new Date(i.playedAt).toLocaleString()}
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
