import "server-only";
import type { Note } from "@app/api-client";
import { limitsFor, type Plan } from "@app/core";
import { type Pool, withTransaction } from "@app/db";
import { limitReached, proRequired } from "./http";

type NoteRow = {
  id: string;
  record_key: string;
  video_id: string;
  at_seconds: number | null;
  body: string;
  created_at: Date;
};

const NOTE_COLUMNS = "id, record_key, video_id, at_seconds, body, created_at";

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  recordKey: r.record_key,
  videoId: r.video_id,
  atSeconds: r.at_seconds,
  body: r.body,
  createdAt: r.created_at.toISOString(),
});

export function requireNotes(plan: Plan): void {
  if (!limitsFor(plan).notes) throw proRequired("Timestamped notes", true);
}

/** The viewer's notes on one video, by timestamp. */
export async function listNotes(db: Pool, userId: string, videoId: string): Promise<Note[]> {
  const res = await db.query<NoteRow>(
    `select ${NOTE_COLUMNS} from notes
      where user_id = $1 and video_id = $2 order by at_seconds asc nulls last, created_at desc`,
    [userId, videoId],
  );
  return res.rows.map(toNote);
}

/** Adds a note, up to the plan's cap per user. */
export async function addNote(
  db: Pool,
  userId: string,
  plan: Plan,
  note: { recordKey: string; videoId: string; atSeconds?: number | null; body: string },
): Promise<Note> {
  requireNotes(plan);
  const row = await withTransaction(db, async (client) => {
    // Serialise per user so two tabs can't both slip past the cap.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 17))", [userId]);
    const n = (
      await client.query<{ n: number }>("select count(*)::int as n from notes where user_id = $1", [
        userId,
      ])
    ).rows[0]?.n;
    const max = limitsFor(plan).maxNotes;
    if ((n ?? 0) >= max)
      throw limitReached(`You can keep up to ${max.toLocaleString("en-US")} notes.`);
    const res = await client.query<NoteRow>(
      `insert into notes (user_id, record_key, video_id, at_seconds, body) values ($1, $2, $3, $4, $5)
       returning ${NOTE_COLUMNS}`,
      [userId, note.recordKey, note.videoId, note.atSeconds ?? null, note.body],
    );
    return res.rows[0] as NoteRow;
  });
  return toNote(row);
}
