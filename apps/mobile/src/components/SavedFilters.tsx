import type { SavedFilter } from "@app/api-client";
import { type Filters, isEmptyFilter } from "@app/core";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useAuth } from "../lib/auth";
import { errorMessage, isApiError } from "../lib/errors";
import {
  NAME_PROMPT,
  PRESET_LOCKED,
  presetLocked,
  presetMatches,
  presetProblem,
} from "../lib/filter-panel";
import { Button } from "./ui";

const byName = (a: SavedFilter, b: SavedFilter) => a.name.localeCompare(b.name);

/** The viewer's saved filter sets (free for anyone signed in, up to limits.maxSavedFilters). */
export function useSavedFilters() {
  const { api, me } = useAuth();
  const signedIn = Boolean(me);
  const max = me?.limits.maxSavedFilters ?? 0;
  const [items, setItems] = useState<SavedFilter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setItems([]);
      return;
    }
    let live = true;
    api
      .savedFilters()
      .then((r) => live && setItems([...r.items].sort(byName)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, signedIn]);

  const save = useCallback(
    async (name: string, filters: Filters): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const saved = await api.saveFilter({ name: name.trim(), filters });
        setItems((prev) =>
          [...prev.filter((p) => p.id !== saved.id && p.name !== saved.name), saved].sort(byName),
        );
        return true;
      } catch (err) {
        setError(
          errorMessage(err, "Couldn't save these filters. Try again.", {
            pro_required: "These filters use Pro tools. Remove them to save this set, or go Pro.",
          }),
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  const remove = useCallback(
    async (preset: SavedFilter) => {
      setError(null);
      setItems((prev) => prev.filter((p) => p.id !== preset.id));
      try {
        await api.deleteSavedFilter(preset.id);
      } catch (err) {
        if (isApiError(err, "not_found")) return;
        setItems((prev) => [...prev.filter((p) => p.id !== preset.id), preset].sort(byName));
        setError(errorMessage(err, "Couldn't delete that filter set."));
      }
    },
    [api],
  );

  return { signedIn, items, max, error, busy, save, remove };
}

export type SavedFiltersState = ReturnType<typeof useSavedFilters>;

/**
 * Saved sets in a horizontal row: tap to apply, ✕ or press and hold to delete. A set that uses
 * Pro filters stays visible but locked for viewers without them (DECISIONS 36).
 */
export function PresetList({
  saved,
  filters,
  proFilters,
  onApply,
}: {
  saved: SavedFiltersState;
  filters: Filters;
  proFilters: boolean;
  onApply: (filters: Filters) => void;
}) {
  const [lockedNotice, setLockedNotice] = useState(false);
  if (!saved.signedIn || saved.items.length === 0) return null;
  return (
    <View testID="saved-filters" className="mb-2">
      <Text className="mb-1 text-xs text-ink-2">Saved filters</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {saved.items.map((p) => {
          const locked = presetLocked(p.filters, proFilters);
          const active = !locked && presetMatches(p.filters, filters);
          return (
            <View
              key={p.id}
              className={`mr-2 flex-row items-center rounded-full border ${active ? "border-accent bg-accent" : "border-line bg-surface-2"} ${locked ? "opacity-50" : ""}`}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={locked ? `${p.name}, uses Pro filters` : `Apply ${p.name}`}
                accessibilityHint="Press and hold to delete this set"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setLockedNotice(locked);
                  if (!locked) onApply(p.filters);
                }}
                onLongPress={() => void saved.remove(p)}
                className="py-1.5 pl-3 pr-1"
              >
                <Text className={active ? "text-accent-ink" : "text-ink"}>
                  {locked ? `🔒 ${p.name}` : p.name}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${p.name}`}
                hitSlop={8}
                onPress={() => void saved.remove(p)}
                className="py-1.5 pl-1 pr-3"
              >
                <Text className={active ? "text-accent-ink" : "text-ink-2"}>✕</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      {lockedNotice && !proFilters ? (
        <Pressable
          testID="saved-filter-locked"
          accessibilityRole="link"
          onPress={() => router.push("/account")}
          className="mt-1"
        >
          <Text className="text-xs text-accent underline">{PRESET_LOCKED} Go Pro to use it.</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Save these filters": a name and a button, inline at the foot of the filter panel. */
export function SavePresetRow({
  saved,
  filters,
  proFilters,
}: {
  saved: SavedFiltersState;
  filters: Filters;
  proFilters: boolean;
}) {
  const [name, setName] = useState("");
  if (isEmptyFilter(filters)) return saved.error ? <SaveError text={saved.error} /> : null;
  if (!saved.signedIn)
    return (
      <Pressable accessibilityRole="link" onPress={() => router.push("/login")} className="mt-3">
        <Text className="text-accent underline">Sign in to save these filters.</Text>
      </Pressable>
    );
  const problem = presetProblem({ name, filters, saved: saved.items, max: saved.max, proFilters });
  const submit = async () => {
    if (problem) return;
    if (await saved.save(name, filters)) setName("");
  };
  return (
    <View testID="save-filters-row" className="mt-3">
      <Text className="mb-1 text-xs text-ink-2">Save these filters</Text>
      <View className="flex-row items-center">
        <TextInput
          testID="saved-filter-name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
          maxLength={60}
          placeholder="Name this set"
          placeholderTextColor="#a89f93"
          className="mr-2 min-h-11 flex-1 rounded-md border border-line bg-surface-2 px-3 text-ink"
        />
        <Button
          testID="save-filters"
          label="Save"
          busy={saved.busy}
          disabled={problem !== null}
          onPress={() => void submit()}
        />
      </View>
      {problem && problem !== NAME_PROMPT ? (
        <Text className="mt-1 text-xs text-ink-2">{problem}</Text>
      ) : null}
      {saved.error ? <SaveError text={saved.error} /> : null}
    </View>
  );
}

function SaveError({ text }: { text: string }) {
  return (
    <Text accessibilityRole="alert" className="mt-1 text-warn">
      {text}
    </Text>
  );
}
