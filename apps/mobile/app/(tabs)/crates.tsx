import type { Crate } from "@app/api-client";
import { PLAN_LIMITS } from "@app/core";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Empty, Notice, Section } from "../../src/components/ui";
import { useAuth } from "../../src/lib/auth";
import { errorMessage } from "../../src/lib/errors";

const PRO = PLAN_LIMITS.pro;

/** Shown on plans without crates: what Pro adds, and that favorites are free. */
function CratesUpsell() {
  return (
    <Section title="Crates are a Pro tool">
      <Text testID="crates-upsell" className="mb-3 text-ink-2">
        Pro sorts records into crates ({PRO.maxCrates ?? "unlimited"} crates of up to{" "}
        {PRO.maxItemsPerCrate?.toLocaleString() ?? "any number of"} records), with seeded orders,
        share links and exports. Favorites are free: tap ♡ on any record to keep it.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="primary"
          label="Open favorites"
          onPress={() => router.push("/favorites")}
        />
        <Button label="See Pro" onPress={() => router.push("/account")} />
      </View>
    </Section>
  );
}

export default function CratesScreen() {
  const { api, me } = useAuth();
  const [crates, setCrates] = useState<Crate[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(me);

  const load = useCallback(() => {
    if (!signedIn) return;
    api
      .crates()
      .then((r) => setCrates(r.crates))
      .catch(() => undefined);
  }, [api, signedIn]);
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

  const max = me.limits.maxCrates;
  const hasCrates = max !== 0;

  const create = async () => {
    setError(null);
    try {
      await api.createCrate({ name: name.trim() });
      setName("");
      load();
    } catch (err) {
      setError(errorMessage(err, "Couldn't create the crate."));
    }
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-bg">
      <FlatList
        data={crates}
        keyExtractor={(c) => c.id}
        contentContainerClassName="p-4"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="mb-1 text-2xl font-semibold text-ink">Crates</Text>
            {error ? <Notice>{error}</Notice> : null}
            {hasCrates ? (
              <>
                {max !== null ? (
                  <Text className="mb-3 text-ink-2">
                    {crates.length} of {max} crates.
                  </Text>
                ) : null}
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
              </>
            ) : (
              <CratesUpsell />
            )}
          </View>
        }
        ListEmptyComponent={
          hasCrates ? (
            <Empty title="No crates yet" body="Save a record from Dig, or create a crate above." />
          ) : null
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
