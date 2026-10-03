import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-ink-2">
        <span>
          Record data from{" "}
          <a className="underline" href="https://www.discogs.com" rel="noopener">
            Discogs
          </a>{" "}
          (CC0). Videos play from YouTube.
        </span>
        <Link className="underline" href="/legal/terms">
          Terms
        </Link>
        <Link className="underline" href="/legal/privacy">
          Privacy
        </Link>
        <Link className="underline" href="/legal/attribution">
          Attribution
        </Link>
        <Link className="underline" href="/changelog">
          Changelog
        </Link>
      </div>
    </footer>
  );
}
