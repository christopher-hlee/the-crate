import { ApiError, type Crate } from "@app/api-client";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Empty, Notice } from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";

export default function CratesScreen() {
  const { api, me } = useAuth();
  const [crates, setCrates] = useState<Crate[]>([]);
  const [max, setMax] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!me) return;
    api
      .crates()
      .then((r) => {
        setCrates(r.crates);
        setMax(r.limits.maxCrates);
      })
      .catch(() => undefined);
  }, [api, me]);
  useFocusEffect(load);

  if (!me)
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
        <Empty title="Crates" body="Sign in to keep the records you dig up." />
        <View className="px-6">
          <Button label="Sign in" onPress={() => router.push("/login")} />
        </View>
      </SafeAreaView>
    );

  const create = async () => {
    setError(null);
    try {
      await api.createCrate({ name: name.trim() });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the crate.");
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <FlatList
        data={crates}
        keyExtractor={(c) => c.id}
        contentContainerClassName="p-4"
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="mb-1 text-2xl font-semibold text-ink">Crates</Text>
            {max !== null ? (
              <Text className="mb-3 text-ink-2">
                {crates.length} of {max} crates on Free.
              </Text>
            ) : null}
            {error ? <Notice>{error}</Notice> : null}
            <View className="flex-row items-center">
              <TextInput
                testID="crate-name"
                value={name}
                onChangeText={setName}
                placeholder="New crate name"
                placeholderTextColor="#a89f93"
                maxLength={80}
                className="mr-2 min-h-11 flex-1 rounded-md border border-line bg-surface-2 px-3 text-ink"
              />
              <Button label="Create" disabled={!name.trim()} onPress={() => void create()} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Empty title="No crates yet" body="Save a record from Dig, or create a crate above." />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: "/crates/[id]", params: { id: item.id } })}
            className="mb-2 rounded-md border border-line bg-surface px-4 py-3"
          >
            <Text className="font-medium text-ink">{item.name}</Text>
            <Text className="text-xs text-ink-2">
              {item.itemCount} record{item.itemCount === 1 ? "" : "s"}
              {item.seed !== null ? " · seeded" : ""}
              {item.shareId ? " · shared" : ""}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
