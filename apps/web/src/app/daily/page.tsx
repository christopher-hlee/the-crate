"use client";

import type { DailyResponse } from "@app/api-client";
import { useCallback, useEffect, useState } from "react";
import { SequenceList } from "@/components/SequenceList";
import { api } from "@/lib/api";

export default function DailyPage() {
  const [head, setHead] = useState<DailyResponse | null>(null);
  const load = useCallback(async (page: number) => {
    const r = await api.daily(page);
    if (page === 0) setHead(r);
    return r;
  }, []);
  useEffect(() => {
    document.title = "Daily dig";
  }, []);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-ink-2">Daily dig · {head?.date ?? "today"}</p>
        <h1 className="text-2xl font-semibold">{head?.preset.name ?? "Today's dig"}</h1>
        {head && (
          <p className="text-sm text-ink-2">
            {head.preset.blurb} The same order for everyone, all day (UTC).
          </p>
        )}
      </div>
      <SequenceList load={load} emptyText="Nothing in today's dig yet." />
    </div>
  );
}
