import * as Haptics from "expo-haptics";
import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "./auth";
import { errorMessage } from "./errors";
import { favoriteStore, type ItemRef, itemKey } from "./favorites";

/** Re-renders the caller whenever any known favorite changes. */
export function useFavoritesVersion(): number {
  return useSyncExternalStore(favoriteStore.subscribe, favoriteStore.version);
}

/** Whether `ref` is a favorite: what the app last learned, else `fallback`. */
export function useIsFavorite(ref: ItemRef | null, fallback = false): boolean {
  useFavoritesVersion();
  return ref ? (favoriteStore.get(ref) ?? fallback) : false;
}

export type ToggleResult = { ok: true; favorited: boolean } | { ok: false; error: string | null };

const inflight = new Set<string>();

/**
 * Adds (`favorited` false) or removes (`favorited` true) a favorite for the signed-in viewer,
 * updating every screen's heart at once and rolling back on failure. A success haptic marks an
 * add. A second tap while the first is in flight is ignored ({ ok: false, error: null }).
 */
export function useToggleFavorite() {
  const { api, me } = useAuth();
  return useCallback(
    async (ref: ItemRef, favorited: boolean): Promise<ToggleResult> => {
      if (!me) return { ok: false, error: "Sign in to keep favorites." };
      const key = itemKey(ref);
      if (inflight.has(key)) return { ok: false, error: null };
      inflight.add(key);
      const item = { recordKey: ref.recordKey, videoId: ref.videoId };
      favoriteStore.set(item, !favorited);
      try {
        const status = favorited ? await api.removeFavorite(item) : await api.addFavorite(item);
        favoriteStore.set(item, status.favorited);
        if (status.favorited)
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
        return { ok: true, favorited: status.favorited };
      } catch (err) {
        favoriteStore.set(item, favorited);
        return {
          ok: false,
          error: errorMessage(
            err,
            favorited ? "Couldn't remove it from favorites." : "Couldn't add it to favorites.",
          ),
        };
      } finally {
        inflight.delete(key);
      }
    },
    [api, me],
  );
}
