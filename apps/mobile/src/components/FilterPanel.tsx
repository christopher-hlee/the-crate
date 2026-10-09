import type { StylesResponse } from "@app/api-client";
import type { Filters } from "@app/core";
import { router } from "expo-router";
import { type ReactNode, useMemo, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import {
  applyKeywords,
  bpmText,
  CAMELOT_KEYS,
  hasFilters,
  MAX_VIEWS_OPTIONS,
  toggleIn,
  withBpm,
} from "../lib/filter-panel";
import { PresetList, SavePresetRow, useSavedFilters } from "./SavedFilters";
import { Button, Chip } from "./ui";

type Props = {
  census: StylesResponse | null;
  filters: Filters;
  onChange: (filters: Filters) => void;
  proFilters: boolean;
  matches: string | null;
};

const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

// iOS number pads have no return key, so the BPM boxes use the keyboard that has one.
const NUMBER_KEYBOARD = Platform.OS === "ios" ? "numbers-and-punctuation" : "number-pad";

const inputClass = "min-h-11 rounded-md border border-line bg-surface-2 px-3 text-ink";

function Label({ children }: { children: ReactNode }) {
  return <Text className="mb-1 mt-2 text-xs text-ink-2">{children}</Text>;
}

/**
 * Text that applies on submit and follows `value` when it changes elsewhere (Clear filters,
 * a saved set), without remounting the box and losing focus.
 */
function useDraft(value: string): [string, (text: string) => void] {
  const [draft, setDraft] = useState(value);
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setDraft(value);
  }
  return [draft, setDraft];
}

/** The filter drawer, inline in the page flow below the pick. */
export function FilterPanel({ census, filters, onChange, proFilters, matches }: Props) {
  const saved = useSavedFilters();
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
      <PresetList saved={saved} filters={filters} proFilters={proFilters} onApply={onChange} />
      <TextInput
        testID="style-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search styles"
        placeholderTextColor="#a89f93"
        className={`mb-2 ${inputClass}`}
      />
      <View className="flex-row flex-wrap">
        {chosen.map((s) => (
          <Chip
            key={s}
            label={`${s} ✕`}
            active
            onPress={() => onChange({ ...filters, styles: toggleIn(chosen, s) })}
          />
        ))}
        {styles
          .filter((s) => !chosen.includes(s.name))
          .map((s) => (
            <Chip
              key={s.name}
              label={`${s.name} · ${s.records.toLocaleString()}`}
              onPress={() => onChange({ ...filters, styles: toggleIn(chosen, s.name) })}
            />
          ))}
      </View>
      {often.length ? (
        <>
          <Label>Often tagged with</Label>
          <View className="flex-row flex-wrap">
            {often.map((s) => (
              <Chip
                key={s}
                label={s}
                onPress={() => onChange({ ...filters, styles: toggleIn(chosen, s) })}
              />
            ))}
          </View>
        </>
      ) : null}
      <Label>Decade</Label>
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
      <Label>Format</Label>
      <View className="flex-row flex-wrap">
        {(census?.formats ?? []).slice(0, 8).map((f) => (
          <Chip
            key={f.name}
            label={f.name}
            active={filters.formats?.includes(f.name)}
            onPress={() => onChange({ ...filters, formats: toggleIn(filters.formats, f.name) })}
          />
        ))}
      </View>
      <Label>Country</Label>
      <View className="flex-row flex-wrap">
        {(census?.countries ?? []).slice(0, 12).map((c) => (
          <Chip
            key={c.name}
            label={c.name}
            active={filters.countries?.includes(c.name)}
            onPress={() => onChange({ ...filters, countries: toggleIn(filters.countries, c.name) })}
          />
        ))}
      </View>
      <Label>Tempo</Label>
      <BpmRange filters={filters} onChange={onChange} />
      <View className="flex-row flex-wrap">
        <Chip
          label="Half and double time"
          active={filters.halfDouble}
          onPress={() =>
            onChange({ ...filters, halfDouble: filters.halfDouble ? undefined : true })
          }
        />
      </View>
      <Label>Key</Label>
      <View className="flex-row flex-wrap">
        <Chip
          label="Compatible keys"
          active={filters.compatibleKeys}
          onPress={() =>
            onChange({ ...filters, compatibleKeys: filters.compatibleKeys ? undefined : true })
          }
        />
        {CAMELOT_KEYS.map((k) => (
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
      <Label>Views on YouTube</Label>
      <View className="flex-row flex-wrap">
        {MAX_VIEWS_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            active={filters.maxViews === o.value}
            onPress={() =>
              onChange({
                ...filters,
                maxViews: filters.maxViews === o.value ? undefined : o.value,
              })
            }
          />
        ))}
      </View>
      <Label>Pro tools</Label>
      {proFilters ? (
        <ProFilters filters={filters} onChange={onChange} />
      ) : (
        <>
          <View className="flex-row flex-wrap">
            {["Keywords", "Topic channels only", "Deep cuts", "More from…"].map((label) => (
              <Chip key={label} label={label} locked />
            ))}
          </View>
          <Pressable accessibilityRole="link" onPress={() => router.push("/account")}>
            <Text className="text-accent underline">
              Pro adds keyword search, topic-channel and deep-cut filters, and “more from” a
              release, channel, label or artist.
            </Text>
          </Pressable>
        </>
      )}
      {hasFilters(filters) ? (
        <Pressable accessibilityRole="button" onPress={() => onChange({})} className="mt-3">
          <Text className="text-ink-2 underline">Clear filters</Text>
        </Pressable>
      ) : null}
      <SavePresetRow saved={saved} filters={filters} proFilters={proFilters} />
    </View>
  );
}

function BpmRange({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const [from, setFrom] = useDraft(bpmText(filters.bpmFrom));
  const [to, setTo] = useDraft(bpmText(filters.bpmTo));
  const dirty = from !== bpmText(filters.bpmFrom) || to !== bpmText(filters.bpmTo);
  const apply = () => {
    const next = withBpm(filters, from, to);
    // Out-of-range text is cleared rather than left looking applied.
    setFrom(bpmText(next.bpmFrom));
    setTo(bpmText(next.bpmTo));
    if (next.bpmFrom !== filters.bpmFrom || next.bpmTo !== filters.bpmTo) onChange(next);
  };
  return (
    <View testID="bpm-range" className="mb-2 flex-row items-center">
      <TextInput
        testID="bpm-from"
        value={from}
        onChangeText={setFrom}
        onSubmitEditing={apply}
        onEndEditing={apply}
        returnKeyType="done"
        keyboardType={NUMBER_KEYBOARD}
        maxLength={5}
        placeholder="BPM from"
        placeholderTextColor="#a89f93"
        className={`mr-2 flex-1 ${inputClass}`}
      />
      <TextInput
        testID="bpm-to"
        value={to}
        onChangeText={setTo}
        onSubmitEditing={apply}
        onEndEditing={apply}
        returnKeyType="done"
        keyboardType={NUMBER_KEYBOARD}
        maxLength={5}
        placeholder="BPM to"
        placeholderTextColor="#a89f93"
        className={`flex-1 ${inputClass}`}
      />
      {dirty ? (
        <View className="ml-2">
          <Button testID="bpm-apply" label="Set" onPress={apply} />
        </View>
      ) : null}
    </View>
  );
}

function ProFilters({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const scopes: { key: "recordKeys" | "channelIds" | "labelIds" | "artistIds"; label: string }[] = [
    { key: "recordKeys", label: "This release" },
    { key: "channelIds", label: "This channel" },
    { key: "labelIds", label: "This label" },
    { key: "artistIds", label: "This artist" },
  ];
  return (
    <View testID="pro-filters">
      <KeywordSearch filters={filters} onChange={onChange} />
      <View className="flex-row flex-wrap">
        <Chip
          testID="topic-only"
          label="Topic channels only"
          hint="Only official audio from YouTube's auto-generated Topic channels"
          active={filters.topicOnly}
          onPress={() => onChange({ ...filters, topicOnly: filters.topicOnly ? undefined : true })}
        />
        <Chip
          label="Deep cuts"
          active={filters.deepCutMin !== undefined}
          onPress={() =>
            onChange({ ...filters, deepCutMin: filters.deepCutMin !== undefined ? undefined : 0.8 })
          }
        />
        {scopes
          .filter((s) => (filters[s.key]?.length ?? 0) > 0)
          .map((s) => (
            <Chip
              key={s.key}
              label={`${s.label} ✕`}
              active
              onPress={() => onChange({ ...filters, [s.key]: undefined })}
            />
          ))}
      </View>
    </View>
  );
}

function KeywordSearch({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const [text, setText] = useDraft(filters.q ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const result = applyKeywords(filters, text);
    if (result.filters === null) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.filters);
  };
  return (
    <View className="mb-2">
      <TextInput
        testID="keyword-search"
        value={text}
        onChangeText={(t) => {
          setText(t);
          setError(null);
        }}
        onSubmitEditing={submit}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={100}
        placeholder="Keywords: artist, label, track, style…"
        placeholderTextColor="#a89f93"
        className={inputClass}
      />
      {error ? <Text className="mt-1 text-xs text-warn">{error}</Text> : null}
    </View>
  );
}
