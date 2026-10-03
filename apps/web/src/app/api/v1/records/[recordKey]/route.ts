import { RecordKeySchema } from "@app/api-client";
import { db } from "@/server/db";
import { json, notFound, route } from "@/server/http";
import { getRecord } from "@/server/records";

type Ctx = { params: Promise<{ recordKey: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const recordKey = RecordKeySchema.parse(decodeURIComponent((await params).recordKey));
  const record = await getRecord(db(), recordKey);
  if (!record) throw notFound("That record");
  return json(record, { headers: { "cache-control": "public, max-age=60, s-maxage=600" } });
});
