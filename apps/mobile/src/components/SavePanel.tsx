import { ApiError, type Crate } from "@app/api-client";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { Button, Chip } from "./ui";

type Props = {
  item: { recordKey: string; videoId: string };
  onDone: (message: string, crate?: { id: string; name: string }) => void;
};

/** Save to crate, inline below the pick (never a modal over the player). */
export function SavePanel({ item, onDone }: Props) {
  const { api, me } = useAuth();
  const [crates, setCrates] = useState<Crate[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    api
      .crates()
      .then((r) => setCrates(r.crates))
      .catch(() => setCrates([]));
  }, [api, me]);

  if (!me)
    return (
      <View testID="save-panel" className="py-2">
        <Text className="mb-2 text-ink-2">Sign in to keep records in crates.</Text>
        <Button label="Sign in" onPress={() => router.push("/login")} />
      </View>
    );

  const save = async (crate: Crate) => {
    setBusy(true);
    setError(null);
    try {
      await api.addItem(crate.id, item);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone(`Saved to ${crate.name}.`, { id: crate.id, name: crate.name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const crate = await api.createCrate({ name: name.trim() });
      setName("");
      await save(crate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the crate.");
      setBusy(false);
    }
  };

  return (
    <View testID="save-panel" className="py-2">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">
        Save to crate
      </Text>
      {error ? <Text className="mb-2 text-warn">{error}</Text> : null}
      <View className="flex-row flex-wrap">
        {(crates ?? []).map((c) => (
          <Chip key={c.id} label={`${c.name} (${c.itemCount})`} onPress={() => void save(c)} />
        ))}
      </View>
      <View className="mt-1 flex-row items-center">
        <TextInput
          testID="new-crate-name"
          value={name}
          onChangeText={setName}
          placeholder="New crate"
          placeholderTextColor="#a89f93"
          maxLength={80}
          className="mr-2 min-h-11 flex-1 rounded-md border border-line bg-surface-2 px-3 text-ink"
          onSubmitEditing={() => void create()}
        />
        <Button
          label="Create and save"
          onPress={() => void create()}
          busy={busy}
          disabled={!name.trim()}
        />
      </View>
    </View>
  );
}
