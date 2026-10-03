import type { Metadata } from "next";

export const metadata: Metadata = { title: "Attribution" };

export default function AttributionPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold">Attribution</h1>
      <p>
        Record data comes from the{" "}
        <a className="text-accent underline" href="https://data.discogs.com/" rel="noopener">
          Discogs data dumps
        </a>
        , released under CC0 by{" "}
        <a className="text-accent underline" href="https://www.discogs.com" rel="noopener">
          Discogs
        </a>
        . Every record links back to its Discogs page. We don&apos;t use or show Discogs images.
      </p>
      <p>
        Videos are YouTube videos played in YouTube&apos;s embedded player and belong to their
        uploaders.
      </p>
      <p>
        Tempo and key data, where shown, comes from{" "}
        <a className="text-accent underline" href="https://getsongbpm.com" rel="noopener">
          GetSongBPM
        </a>
        , AcousticBrainz and votes from listeners.
      </p>
    </article>
  );
}
