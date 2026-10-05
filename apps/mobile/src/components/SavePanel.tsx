import type { Crate } from "@app/api-client";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/errors";
import { HeartButton } from "./HeartButton";
import { Button, Chip } from "./ui";

type Props = {
  item: { recordKey: string; videoId: string };
  favorited: boolean;
  onFavorite: () => void;
  onDone: (message: string, crate?: { id: string; name: string }) => void;
};

const heading = "mb-2 text-xs font-semibold uppercase tracking-wider text-ink-2";

/**
 * Save, inline below the pick (never a modal over the player): favorites for everyone signed
 * in, and the crate picker on plans with crates.
 */
export function SavePanel({ item, favorited, onFavorite, onDone }: Props) {
  const { api, me } = useAuth();
  const hasCrates = me ? me.limits.maxCrates !== 0 : false;
  const [crates, setCrates] = useState<Crate[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCrates) return;
    api
      .crates()
      .then((r) => setCrates(r.crates))
      .catch(() => setCrates([]));
  }, [api, hasCrates]);

  if (!me)
    return (
      <View testID="save-panel" className="py-2">
        <Text className="mb-2 text-ink-2">Sign in to keep favorites and crates.</Text>
        <Button label="Sign in" onPress={() => router.push("/login")} />
      </View>
    );

  const heart = (
    <HeartButton
      testID="save-favorite"
      favorited={favorited}
      onPress={onFavorite}
      label={favorited ? "In your favorites" : "Add to favorites"}
    />
  );

  if (!hasCrates)
    return (
      <View testID="save-panel" className="py-2">
        <Text className={heading}>Save</Text>
        <Text className="mb-1 text-ink">Crates are a Pro tool — favorite records instead.</Text>
        <View className="flex-row">{heart}</View>
        <Pressable accessibilityRole="link" onPress={() => router.push("/account")}>
          <Text className="mt-1 text-xs text-accent underline">
            Favorites are free. See what Pro adds.
          </Text>
        </Pressable>
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
      setError(errorMessage(err, "Couldn't save. Try again."));
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
      setError(errorMessage(err, "Couldn't create the crate."));
      setBusy(false);
    }
  };

  return (
    <View testID="save-panel" className="py-2">
      <View className="mb-1 flex-row">{heart}</View>
      <Text className={heading}>Save to crate</Text>
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
