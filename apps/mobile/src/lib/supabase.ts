import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// Sessions live in the platform keychain/keystore. SecureStore values are capped at 2 KB on
// some platforms, so long values are split across numbered keys.
const CHUNK = 1800;

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    if (!count) return SecureStore.getItemAsync(key);
    let out = "";
    for (let i = 0; i < count; i++) out += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? "";
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    const parts = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < parts; i++)
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(parts));
  },
  async removeItem(key: string): Promise<void> {
    const count = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
    await SecureStore.deleteItemAsync(key);
  },
};

let client: SupabaseClient | null = null;

export function supabase(url: string, anonKey: string): SupabaseClient | null {
  if (!url || !anonKey) return null;
  client ??= createClient(url, anonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  return client;
}
