// retry_account_deletions: user rows are deleted at request time by the web app; this job
// retries the external steps (deleting the Supabase auth user) and re-deletes any user rows
// that arrived in the meantime. Everything completes well inside the 7-day promise.

import { deleteUserRows, type Queryable } from "@app/db";

export type AuthAdmin = { deleteUser(userId: string): Promise<void> };

export function supabaseAuthAdmin(
  url: string,
  serviceRoleKey: string,
  doFetch: typeof fetch = fetch,
): AuthAdmin {
  return {
    async deleteUser(userId) {
      const res = await doFetch(
        `${url.replace(/\/$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
        },
      );
      // 404: already gone, which is the goal.
      if (!res.ok && res.status !== 404)
        throw new Error(`Supabase admin delete returned HTTP ${res.status}`);
    },
  };
}

export async function runRetryAccountDeletions(
  db: Queryable,
  auth: AuthAdmin | null,
): Promise<{ completed: number; failed: number }> {
  const pending = await db.query<{ user_id: string }>(
    "select user_id from account_deletions order by requested_at limit 100",
  );
  let completed = 0;
  let failed = 0;
  for (const { user_id } of pending.rows) {
    try {
      await deleteUserRows(db, user_id);
      if (auth) await auth.deleteUser(user_id);
      else throw new Error("Supabase admin credentials are not configured");
      await db.query("delete from account_deletions where user_id = $1", [user_id]);
      completed++;
    } catch (err) {
      failed++;
      await db.query(
        "update account_deletions set attempts = attempts + 1, last_error = $2 where user_id = $1",
        [user_id, err instanceof Error ? err.message : String(err)],
      );
    }
  }
  return { completed, failed };
}
