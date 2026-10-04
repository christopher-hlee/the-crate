import { CreateCommentRequestSchema, RecordKeySchema } from "@app/api-client";
import { getViewer, requireViewer } from "@/server/auth";
import { addComment, listComments } from "@/server/community";
import { db } from "@/server/db";
import { clientIp, json, readJson, route } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";

type Ctx = { params: Promise<{ recordKey: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const recordKey = RecordKeySchema.parse(decodeURIComponent((await params).recordKey));
  const pool = db();
  const viewer = await getViewer(req);
  await rateLimit(pool, "read", { userId: viewer?.userId, ip: clientIp(req) });
  return json(
    { comments: await listComments(pool, recordKey, viewer?.userId ?? null) },
    { headers: { "cache-control": "no-store" } },
  );
});

export const POST = route<Ctx>(async (req, { params }) => {
  const recordKey = RecordKeySchema.parse(decodeURIComponent((await params).recordKey));
  const viewer = await requireViewer(req);
  const pool = db();
  await rateLimit(pool, "comment", { userId: viewer.userId, ip: clientIp(req) });
  const { body } = await readJson(req, CreateCommentRequestSchema);
  return json(await addComment(pool, viewer.userId, recordKey, body), { status: 201 });
});
