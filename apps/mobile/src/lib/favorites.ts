// What the app knows about the viewer's favorites, shared by every screen: Dig's heart, the
// Favorites tab and the heart on history and crate rows. Picks and favorites pages fill it in;
// rows the app hasn't seen yet are unknown (shown as not favorited until tapped). Kept in
// memory and cleared when the signed-in user changes.

export type ItemRef = { recordKey: string; videoId: string };

export const itemKey = (ref: ItemRef): string => `${ref.recordKey}/${ref.videoId}`;

export type FavoriteStore = {
  get: (ref: ItemRef) => boolean | undefined;
  set: (ref: ItemRef, favorited: boolean) => void;
  setMany: (refs: readonly ItemRef[], favorited: boolean) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
  /** Changes whenever anything in the store does (for useSyncExternalStore). */
  version: () => number;
};

export function createFavoriteStore(): FavoriteStore {
  const known = new Map<string, boolean>();
  const listeners = new Set<() => void>();
  let version = 0;
  const emit = () => {
    version += 1;
    for (const l of listeners) l();
  };
  const write = (ref: ItemRef, favorited: boolean): boolean => {
    const k = itemKey(ref);
    if (known.get(k) === favorited) return false;
    known.set(k, favorited);
    return true;
  };
  return {
    get: (ref) => known.get(itemKey(ref)),
    set: (ref, favorited) => {
      if (write(ref, favorited)) emit();
    },
    setMany: (refs, favorited) => {
      let changed = false;
      for (const ref of refs) changed = write(ref, favorited) || changed;
      if (changed) emit();
    },
    clear: () => {
      if (known.size === 0) return;
      known.clear();
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
  };
}

export const favoriteStore = createFavoriteStore();
