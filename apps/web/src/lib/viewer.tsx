"use client";

import { ApiError, type MeResponse } from "@app/api-client";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import { AUTH_MODE, supabaseBrowser } from "./supabase-browser";

type ViewerState = {
  me: MeResponse | null;
  loading: boolean;
  isPro: boolean;
  refresh: () => Promise<void>;
};

const ViewerContext = createContext<ViewerState>({
  me: null,
  loading: true,
  isPro: false,
  refresh: async () => {},
});

export function ViewerProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Supabase sessions can change outside our own calls: another tab signs in or out, or the
  // session expires. Reload the viewer when the signed-in user changes or updates.
  const userId = useRef<string | null>(null);
  useEffect(() => {
    userId.current = me?.user.id ?? null;
  }, [me]);
  useEffect(() => {
    if (AUTH_MODE === "dev") return;
    const supabase = supabaseBrowser();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const changed = (session?.user.id ?? null) !== userId.current;
      // Defer: supabase-js asks callbacks not to await other calls inside the listener.
      if (changed || event === "USER_UPDATED") setTimeout(() => void refresh(), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  return (
    <ViewerContext.Provider value={{ me, loading, isPro: me?.plan === "pro", refresh }}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
