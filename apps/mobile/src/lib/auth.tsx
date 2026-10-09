import { ApiError, createApiClient, type MeResponse } from "@app/api-client";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { config } from "./config";
import { favoriteStore } from "./favorites";
import { supabase } from "./supabase";

const DEV_USER_KEY = "crate.devUser";

type AuthState = {
  me: MeResponse | null;
  loading: boolean;
  api: ReturnType<typeof createApiClient>;
  getAccessToken: () => Promise<string | null>;
  refresh: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** Resolves false when the person cancels or dismisses the sign-in sheet. */
  signInWithProvider: (provider: "google" | "apple") => Promise<boolean>;
  signInAsDevUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function randomUuid(): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sb = supabase(config.supabaseUrl, config.supabaseAnonKey);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Mobile sends the Supabase access token as a Bearer token (or a dev token locally).
  const getAccessToken = useCallback(async () => {
    if (config.authMode === "dev") {
      const id = await SecureStore.getItemAsync(DEV_USER_KEY);
      return id ? `dev:${id}` : null;
    }
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    return data.session?.access_token ?? null;
  }, [sb]);

  const api = useMemo(
    () => createApiClient({ baseUrl: config.apiUrl, getAccessToken }),
    [getAccessToken],
  );

  const refresh = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch (err) {
      // Only a rejected session signs the viewer out; a network blip keeps what we had.
      if (err instanceof ApiError && err.status === 401) setMe(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // What the app knows about favorites belongs to one user.
  const userId = me?.user.id ?? null;
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    favoriteStore.clear();
  }, [userId]);

  useEffect(() => {
    void refresh();
    const sub = sb?.auth.onAuthStateChange(() => void refresh());
    return () => sub?.data.subscription.unsubscribe();
  }, [sb, refresh]);

  // Magic links land here: thecrate://auth-callback?code=…
  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url || !sb) return;
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code === "string") await sb.auth.exchangeCodeForSession(code);
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => void handle(e.url));
    return () => sub.remove();
  }, [sb]);

  const redirectTo = Linking.createURL("/auth-callback");

  const value: AuthState = {
    me,
    loading,
    api,
    getAccessToken,
    refresh,
    async signInWithEmail(email) {
      if (!sb) throw new Error("Sign-in isn't configured.");
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
    },
    // For accounts that have a password, such as the App Review demo account.
    async signInWithPassword(email, password) {
      if (!sb) throw new Error("Sign-in isn't configured.");
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signInWithProvider(provider) {
      if (!sb) throw new Error("Sign-in isn't configured.");
      const { data, error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw error ?? new Error("No sign-in URL");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      // Cancelled or dismissed: not an error, but not signed in either.
      if (result.type !== "success") return false;
      const params = Linking.parse(result.url).queryParams ?? {};
      const code = params.code;
      if (typeof code !== "string") {
        const reason = params.error_description ?? params.error;
        throw new Error(typeof reason === "string" ? reason : "Sign-in didn't finish. Try again.");
      }
      const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        // On Android the redirect can also reach the deep-link handler, which may have
        // exchanged the code first; a session means sign-in worked either way.
        const { data: now } = await sb.auth.getSession();
        if (!now.session) throw exchangeError;
      }
      await refresh();
      return true;
    },
    async signInAsDevUser() {
      await SecureStore.setItemAsync(DEV_USER_KEY, randomUuid());
      // Throws on failure, so the sign-in screen stays put and shows the error.
      setMe(await api.me());
    },
    async signOut() {
      if (config.authMode === "dev") await SecureStore.deleteItemAsync(DEV_USER_KEY);
      else await sb?.auth.signOut();
      setMe(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
