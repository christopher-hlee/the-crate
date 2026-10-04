"use client";

// Archive recordings saved to a crate, and the DAW folder export (Pro). Hidden when the
// archive is off (the API answers 404).

import { ApiError, type CrateAssetsResponseSchema } from "@app/api-client";
import { FolderDown, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { canPickFolder, collectFiles, saveBlob, writeToFolder, zipFor } from "@/lib/daw-export";
import { useViewer } from "@/lib/viewer";

type Assets = z.infer<typeof CrateAssetsResponseSchema>["assets"];

export function CrateArchiveSection({
  crateId,
  crateName,
}: {
  crateId: string;
  crateName: string;
}) {
  const { isPro } = useViewer();
  const [assets, setAssets] = useState<Assets | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .crateAssets(crateId)
      .then((r) => setAssets(r.assets))
      .catch(() => setAssets(null));
  }, [crateId]);

  if (!assets || assets.length === 0) return null;

  const exportFolder = async () => {
    setBusy(true);
    setStatus("Fetching files…");
    try {
      const files = await collectFiles(
        assets,
        (id) => api.assetDownload(id),
        (done, total) => setStatus(`Fetched ${done} of ${total}…`),
      );
      if (canPickFolder()) {
        const wrote = await writeToFolder(crateName, files);
        setStatus(
          wrote
            ? `Wrote ${files.length} WAV files and their rights sidecars.`
            : "Export cancelled.",
        );
      } else {
        saveBlob(
          zipFor(crateName, files),
          `${crateName.replace(/[^\w .-]+/g, " ").trim() || "crate"}.zip`,
          "application/zip",
        );
        setStatus(`Downloaded a ZIP with ${files.length} WAV files and their rights sidecars.`);
      }
    } catch (err) {
      setStatus(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "The export failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="space-y-3 rounded-md border border-line p-4"
      aria-label="Archive recordings"
      data-testid="crate-archive"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 font-semibold">Archive recordings</h2>
        {isPro ? (
          <Button variant="primary" size="sm" onClick={() => void exportFolder()} disabled={busy}>
            <FolderDown size={16} aria-hidden />{" "}
            {canPickFolder() ? "Export to a DAW folder" : "Download as ZIP"}
          </Button>
        ) : (
          <span className="text-sm text-ink-2">DAW folder export is a Pro tool.</span>
        )}
      </div>
      <ul className="divide-y divide-line text-sm">
        {assets.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-1.5">
            <span className="flex-1 truncate">
              {a.artist} – {a.title}
              <span className="text-ink-2"> · {a.rights.basisLabel}</span>
            </span>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Remove ${a.title}`}
              onClick={async () => setAssets((await api.removeCrateAsset(crateId, a.id)).assets)}
            >
              <Trash2 size={16} />
            </Button>
          </li>
        ))}
      </ul>
      {status && (
        <p role="status" className="text-sm text-ink-2">
          {status}
        </p>
      )}
      <p className="text-xs text-ink-2">
        Files land in a folder named after this crate as <code>Artist - Title [BPM KEY].wav</code>,
        each with a <code>.json</code> rights record. Add the parent folder to your DAW's browser
        once (Ableton: Places; FL Studio: browser folders; Logic: All Files).{" "}
        <Link href="/archive" className="underline">
          Browse the archive
        </Link>
        .
      </p>
    </section>
  );
}
