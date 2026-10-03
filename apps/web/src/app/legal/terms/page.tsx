import { APP_NAME } from "@app/core";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <article className="prose-sm mx-auto max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold">Terms of use</h1>
      <p>
        {APP_NAME} helps you dig through records listed on Discogs and play them with YouTube&apos;s
        own player. By using it you agree to these terms and to the{" "}
        <a className="text-accent underline" href="https://www.youtube.com/t/terms" rel="noopener">
          YouTube Terms of Service
        </a>
        , which govern every video you play here.
      </p>
      <h2 className="text-lg font-semibold">Playback</h2>
      <p>
        Videos stream from YouTube to your device inside YouTube&apos;s embedded player. We never
        download, store, convert or re-host YouTube audio or video, and the app offers no way to
        record or save it. Listening is free; Pro sells tools such as advanced filters, notes and
        exports, never access to playback.
      </p>
      <h2 className="text-lg font-semibold">Record data</h2>
      <p>
        Record information comes from Discogs&apos; monthly data dumps, released under CC0. Each
        record links to its page on discogs.com.
      </p>
      <h2 className="text-lg font-semibold">Your account</h2>
      <p>
        You can delete your account at any time from the Account page. Deletion removes your crates,
        notes, history and other data within 7 days.
      </p>
      <h2 className="text-lg font-semibold">Subscriptions</h2>
      <p>
        Pro renews until you cancel. Web subscriptions are managed from the Account page; App Store
        and Google Play subscriptions are managed in the store you bought them from.
      </p>
    </article>
  );
}
