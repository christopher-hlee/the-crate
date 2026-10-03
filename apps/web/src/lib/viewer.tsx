"use client";

import { ApiError, type MeResponse } from "@app/api-client";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

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
  return (
    <ViewerContext.Provider value={{ me, loading, isPro: me?.plan === "pro", refresh }}>
      {children}
    </ViewerContext.Provider>
  );
}

export function useViewer(): ViewerState {
  return useContext(ViewerContext);
}
