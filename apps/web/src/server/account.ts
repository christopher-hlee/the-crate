import "server-only";
import { deleteUserRows, type Pool, withTransaction } from "@app/db";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Deletes every user row now, then the Supabase auth user. If the auth deletion fails, an
 * account_deletions row lets the worker retry; the user's data is already gone either way.
 */
export async function deleteAccount(db: Pool, userId: string): Promise<void> {
  await withTransaction(db, async (client) => {
    await deleteUserRows(client, userId);
    await client.query(
      "insert into account_deletions (user_id) values ($1) on conflict do nothing",
      [userId],
    );
  });
  const e = env();
  if (e.authMode !== "supabase" || !e.supabaseUrl || !e.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const admin = createClient(e.supabaseUrl, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) throw error;
    await db.query("delete from account_deletions where user_id = $1", [userId]);
  } catch (err) {
    await db.query(
      "update account_deletions set attempts = attempts + 1, last_error = $2 where user_id = $1",
      [userId, err instanceof Error ? err.message : String(err)],
    );
  }
}
