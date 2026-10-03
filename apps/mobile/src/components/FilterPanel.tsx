import type { StylesResponse } from "@app/api-client";
import type { Filters } from "@app/core";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Chip } from "./ui";

type Props = {
  census: StylesResponse | null;
  filters: Filters;
  onChange: (filters: Filters) => void;
  proFilters: boolean;
  matches: string | null;
};

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

function toggle(list: string[] | undefined, value: string): string[] | undefined {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return set.size ? [...set] : undefined;
}

/** The filter drawer, inline in the page flow below the pick. */
export function FilterPanel({ census, filters, onChange, proFilters, matches }: Props) {
  const [query, setQuery] = useState("");
  const styles = useMemo(() => {
    const all = census?.styles ?? [];
    const q = query.trim().toLowerCase();
    return (q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all).slice(0, 24);
  }, [census, query]);
  const chosen = filters.styles ?? [];
  const often = useMemo(() => {
    const out = new Set<string>();
    for (const name of chosen)
      for (const o of census?.styles.find((s) => s.name === name)?.often ?? [])
        if (!chosen.includes(o)) out.add(o);
    return [...out].slice(0, 8);
  }, [census, chosen]);
  const decade =
    filters.yearFrom !== undefined && filters.yearTo === filters.yearFrom + 9
      ? filters.yearFrom
      : null;

  return (
    <View testID="filter-panel" className="py-2">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-2">Filters</Text>
        {matches ? <Text className="text-xs text-ink-2">{matches} records</Text> : null}
      </View>
      <TextInput
        testID="style-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search styles"
        placeholderTextColor="#a89f93"
        className="mb-2 min-h-11 rounded-md border border-line bg-surface-2 px-3 text-ink"
      />
      <View className="flex-row flex-wrap">
        {chosen.map((s) => (
          <Chip
            key={s}
            label={`${s} ✕`}
            active
            onPress={() => onChange({ ...filters, styles: toggle(chosen, s) })}
          />
        ))}
        {styles
          .filter((s) => !chosen.includes(s.name))
          .map((s) => (
            <Chip
              key={s.name}
              label={`${s.name} · ${s.records.toLocaleString()}`}
              onPress={() => onChange({ ...filters, styles: toggle(chosen, s.name) })}
            />
          ))}
      </View>
      {often.length ? (
        <>
          <Text className="mb-1 mt-1 text-xs text-ink-2">Often tagged with</Text>
          <View className="flex-row flex-wrap">
            {often.map((s) => (
              <Chip
                key={s}
                label={s}
                onPress={() => onChange({ ...filters, styles: toggle(chosen, s) })}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text className="mb-1 mt-2 text-xs text-ink-2">Decade</Text>
      <View className="flex-row flex-wrap">
        {DECADES.map((d) => (
          <Chip
            key={d}
            label={`${d}s`}
            active={decade === d}
            onPress={() =>
              onChange(
                decade === d
                  ? { ...filters, yearFrom: undefined, yearTo: undefined }
                  : { ...filters, yearFrom: d, yearTo: d + 9 },
              )
            }
          />
        ))}
      </View>
      <Text className="mb-1 mt-2 text-xs text-ink-2">Format</Text>
      <View className="flex-row flex-wrap">
        {(census?.formats ?? []).slice(0, 8).map((f) => (
          <Chip
            key={f.name}
            label={f.name}
            active={filters.formats?.includes(f.name)}
            onPress={() => onChange({ ...filters, formats: toggle(filters.formats, f.name) })}
          />
        ))}
      </View>
      <Text className="mb-1 mt-2 text-xs text-ink-2">Country</Text>
      <View className="flex-row flex-wrap">
        {(census?.countries ?? []).slice(0, 12).map((c) => (
          <Chip
            key={c.name}
            label={c.name}
            active={filters.countries?.includes(c.name)}
            onPress={() => onChange({ ...filters, countries: toggle(filters.countries, c.name) })}
          />
        ))}
      </View>
      <Text className="mb-1 mt-2 text-xs text-ink-2">Pro tools</Text>
      {proFilters ? (
        <ProFilters filters={filters} onChange={onChange} />
      ) : (
        <>
          <View className="flex-row flex-wrap">
            {["Tempo", "Key", "Deep cuts", "Max views", "Label", "Artist"].map((label) => (
              <Chip key={label} label={label} locked />
            ))}
          </View>
          <Pressable accessibilityRole="link" onPress={() => router.push("/account")}>
            <Text className="text-accent underline">
              Pro adds tempo, key, deep-cut, label and artist filters.
            </Text>
          </Pressable>
        </>
      )}
      {Object.keys(filters).length ? (
        <Pressable accessibilityRole="button" onPress={() => onChange({})} className="mt-3">
          <Text className="text-ink-2 underline">Clear filters</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const KEYS = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();

function num(text: string): number | undefined {
  const n = Number(text);
  return text.trim() && Number.isFinite(n) && n >= 20 && n <= 400 ? n : undefined;
}

function ProFilters({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [from, setFrom] = useState(filters.bpmFrom ? String(filters.bpmFrom) : "");
  const [to, setTo] = useState(filters.bpmTo ? String(filters.bpmTo) : "");
  const applyBpm = () => onChange({ ...filters, bpmFrom: num(from), bpmTo: num(to) });
  return (
    <View testID="pro-filters">
      <View className="mb-2 flex-row items-center">
        <TextInput
          value={from}
          onChangeText={setFrom}
          onEndEditing={applyBpm}
          keyboardType="number-pad"
          placeholder="BPM from"
          placeholderTextColor="#a89f93"
          className="mr-2 min-h-11 flex-1 rounded-md border border-line bg-surface-2 px-3 text-ink"
        />
        <TextInput
          value={to}
          onChangeText={setTo}
          onEndEditing={applyBpm}
          keyboardType="number-pad"
          placeholder="BPM to"
          placeholderTextColor="#a89f93"
          className="min-h-11 flex-1 rounded-md border border-line bg-surface-2 px-3 text-ink"
        />
      </View>
      <View className="flex-row flex-wrap">
        <Chip
          label="Half and double time"
          active={filters.halfDouble}
          onPress={() =>
            onChange({ ...filters, halfDouble: filters.halfDouble ? undefined : true })
          }
        />
        <Chip
          label="Deep cuts"
          active={filters.deepCutMin !== undefined}
          onPress={() =>
            onChange({ ...filters, deepCutMin: filters.deepCutMin !== undefined ? undefined : 0.8 })
          }
        />
        <Chip
          label="Compatible keys"
          active={filters.compatibleKeys}
          onPress={() =>
            onChange({ ...filters, compatibleKeys: filters.compatibleKeys ? undefined : true })
          }
        />
      </View>
      <View className="flex-row flex-wrap">
        {KEYS.map((k) => (
          <Chip
            key={k}
            label={k}
            active={filters.key === k}
            onPress={() =>
              onChange({ ...filters, key: filters.key === k ? undefined : (k as Filters["key"]) })
            }
          />
        ))}
      </View>
    </View>
  );
}
