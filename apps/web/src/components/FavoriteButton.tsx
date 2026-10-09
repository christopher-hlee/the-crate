"use client";

import { type ApiClient, ApiError } from "@app/api-client";
import { Heart } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useViewer } from "@/lib/viewer";

type Ref = { recordKey: string; videoId: string };
const keyOf = (r: Ref) => `${r.recordKey}/${r.videoId}`;

/** How many single status lookups run at once. */
const LOOKUPS_AT_ONCE = 3;

/**
 * Favorite status for the hearts on one list. History, crates and sequences don't say what is
 * favorited, so the first heart that needs to know loads the viewer's newest favorites page:
 * when that is all of them, every heart is known at once. Otherwise a heart asks for its own
 * status when it scrolls into view, a few at a time.
 */
export function createFavoriteStore(client: ApiClient = api) {
  const known = new Map<string, boolean>();
  const listeners = new Set<() => void>();
  const queue: Ref[] = [];
  const queued = new Set<string>();
  let complete = false;
  let index: Promise<void> | null = null;
  let running = 0;

  const notify = () => {
    for (const l of listeners) l();
  };
  const status = (key: string): boolean | undefined =>
    known.get(key) ?? (complete ? false : undefined);
  const pump = () => {
    while (running < LOOKUPS_AT_ONCE && queue.length > 0) {
      const ref = queue.shift() as Ref;
      running++;
      client
        .favoriteStatus(ref)
        .then((r) => {
          known.set(keyOf(ref), r.favorited);
          notify();
        })
        .catch(() => undefined)
        .finally(() => {
          running--;
          queued.delete(keyOf(ref));
          pump();
        });
    }
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    status,
    /** Records a known status (a toggle, or a list that is all favorites). */
    set(refs: readonly Ref[], favorited: boolean) {
      for (const r of refs) known.set(keyOf(r), favorited);
      notify();
    },
    async resolve(ref: Ref) {
      index ??= client
        .favorites()
        .then((r) => {
          for (const item of r.items) if (!known.has(keyOf(item))) known.set(keyOf(item), true);
          complete = r.nextCursor === null;
          notify();
        })
        .catch(() => undefined);
      await index;
      const key = keyOf(ref);
      if (status(key) !== undefined || queued.has(key)) return;
      queued.add(key);
      queue.push(ref);
      pump();
    },
  };
}

export type FavoriteStore = ReturnType<typeof createFavoriteStore>;

const FavoriteStoreContext = createContext<FavoriteStore | null>(null);
export const FavoriteStoreProvider = FavoriteStoreContext.Provider;

let fallbackStore: FavoriteStore | null = null;
/** Hearts outside a list share one store. */
function defaultStore(): FavoriteStore {
  fallbackStore ??= createFavoriteStore();
  return fallbackStore;
}

type Props = {
  item: Ref;
  /** The record's name, for the button's accessible label. */
  label?: string;
  /** After the server confirms, with the viewer's new favorites total. */
  onChange?: (favorited: boolean, total: number) => void;
  onError?: (message: string) => void;
  className?: string;
};

/** A heart that adds a record to (or removes it from) favorites. Favorites are free. */
export function FavoriteButton({ item, label, onChange, onError, className }: Props) {
  const { me, loading } = useViewer();
  const pathname = usePathname();
  const store = useContext(FavoriteStoreContext) ?? defaultStore();
  const key = keyOf(item);
  const status = useSyncExternalStore(
    store.subscribe,
    () => store.status(key),
    () => undefined,
  );
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userId = me?.user.id ?? null;

  // Look the status up once the heart is near the screen.
  useEffect(() => {
    const el = buttonRef.current;
    if (!userId || !el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [userId, visible]);

  const { recordKey, videoId } = item;
  useEffect(() => {
    if (!userId || !visible || status !== undefined) return;
    void store.resolve({ recordKey, videoId });
  }, [userId, visible, status, store, recordKey, videoId]);

  const name = label ? `Favorite: ${label}` : "Favorite";

  if (!loading && !me) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname || "/")}`}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink",
          className,
        )}
        aria-label={`Sign in to favorite${label ? `: ${label}` : ""}`}
        title="Sign in to keep favorites: they're free"
      >
        <Heart size={16} aria-hidden />
      </Link>
    );
  }

  const pressed = status === true;
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={name}
      aria-pressed={pressed}
      title={pressed ? "Remove from favorites" : "Add to favorites"}
      disabled={loading || busy}
      data-testid="favorite-toggle"
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      onClick={async () => {
        const ref = { recordKey, videoId };
        setBusy(true);
        store.set([ref], !pressed);
        try {
          const r = pressed ? await api.removeFavorite(ref) : await api.addFavorite(ref);
          store.set([ref], r.favorited);
          onChange?.(r.favorited, r.total);
        } catch (err) {
          store.set([ref], pressed);
          onError?.(err instanceof ApiError ? err.message : "Couldn't update your favorites.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Heart size={16} aria-hidden className={pressed ? "fill-accent text-accent" : undefined} />
    </button>
  );
}
