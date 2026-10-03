import type { CatalogItem } from "@app/api-client";
import { useFocusEffect } from "expo-router";
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { config } from "../lib/config";
import { type PlayerHandle, PlayerWebView } from "../player/PlayerWebView";
import { Sleeve } from "./Sleeve";
import { Empty, Notice } from "./ui";

type Props<T extends CatalogItem> = {
  items: T[];
  actions?: (item: T, index: number) => ReactNode;
  header?: ReactElement;
  emptyText?: string;
  onEndReached?: () => void;
  subtitle?: (item: T) => string | null;
};

const keyOf = (i: CatalogItem) => `${i.recordKey}/${i.videoId}`;

/** One player for a list of records. Rows start playback on a tap; the first playable row is cued. */
export function ItemListPlayer<T extends CatalogItem>({
  items,
  actions,
  header,
  emptyText = "Nothing here yet.",
  onEndReached,
  subtitle,
}: Props<T>) {
  const { api } = useAuth();
  const player = useRef<PlayerHandle>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const first = items.find((i) => i.available);

  useEffect(() => {
    if (current || !first) return;
    setCurrent(keyOf(first));
    player.current?.load(first.videoId, { autoplay: false });
  }, [current, first]);

  useFocusEffect(useCallback(() => () => player.current?.pause(), []));

  const currentItem = items.find((i) => keyOf(i) === current);

  return (
    <View className="flex-1">
      {first ? (
        <PlayerWebView
          ref={player}
          appId={config.appId}
          onUnplayable={(videoId, code) => {
            void api.report(videoId, code).catch(() => undefined);
            setNotice("That video can't play here right now. It has been reported for a recheck.");
          }}
          onPlayLogged={(videoId, seconds) => {
            if (currentItem?.videoId === videoId)
              void api
                .logPlay({ recordKey: currentItem.recordKey, videoId, seconds })
                .catch(() => undefined);
          }}
        />
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item, i) => `${keyOf(item)}-${i}`}
        ListHeaderComponent={
          <View className="px-4 pt-3">
            {header}
            {notice ? <Notice>{notice}</Notice> : null}
          </View>
        }
        ListEmptyComponent={<Empty title={emptyText} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => {
          const r = item.record;
          const active = keyOf(item) === current;
          return (
            <View
              className={`mx-4 mb-2 flex-row items-center rounded-md border px-3 py-2 ${active ? "border-accent bg-surface-2" : "border-line bg-surface"}`}
            >
              <Pressable
                testID={`item-${index}`}
                accessibilityRole="button"
                accessibilityLabel={r ? `Play ${r.artist} – ${r.title}` : "Unavailable record"}
                disabled={!item.available}
                className="flex-1 flex-row items-center"
                onPress={() => {
                  setCurrent(keyOf(item));
                  setNotice(null);
                  player.current?.load(item.videoId, { autoplay: true });
                }}
              >
                <Sleeve
                  label={r?.label}
                  catno={r?.catno}
                  year={r?.year}
                  styles={r?.styles}
                  size={44}
                />
                <View className="ml-3 flex-1">
                  <Text
                    numberOfLines={1}
                    className={item.available ? "font-medium text-ink" : "text-ink-2 line-through"}
                  >
                    {r ? `${r.artist} – ${r.title}` : "No longer in the catalog"}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-ink-2">
                    {subtitle?.(item) ??
                      [r?.track?.title, r?.year, r?.label].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </Pressable>
              {actions?.(item, index)}
            </View>
          );
        }}
      />
    </View>
  );
}
