import type { ChangelogResponse } from "@app/api-client";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { Empty } from "../src/components/ui";
import { useAuth } from "../src/lib/auth";

export default function ChangelogScreen() {
  const { api } = useAuth();
  const [entries, setEntries] = useState<ChangelogResponse["entries"] | null>(null);
  useEffect(() => {
    api
      .changelog()
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, [api]);
  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: "What's new" }} />
      <FlatList
        data={entries ?? []}
        keyExtractor={(e) => e.id}
        contentContainerClassName="p-4"
        ListEmptyComponent={entries ? <Empty title="Nothing yet" /> : null}
        renderItem={({ item }) => (
          <View className="mb-3 rounded-md border border-line bg-surface p-4">
            <Text className="text-xs uppercase text-ink-2">
              {item.kind === "data" ? "Catalog" : "App"} ·{" "}
              {new Date(item.publishedAt).toLocaleDateString()}
            </Text>
            <Text className="mb-1 font-semibold text-ink">{item.title}</Text>
            <Text className="text-ink-2">{item.body}</Text>
          </View>
        )}
      />
    </View>
  );
}
