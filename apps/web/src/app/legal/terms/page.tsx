import { APP_NAME } from "@app/core";
import type { Metadata } from "next";
import { SupportEmail } from "@/components/SupportEmail";

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
        record or save it. Listening is free; Pro sells tools such as crates, keyword and channel
        filters, share links and exports, never access to playback.
      </p>
      <h2 className="text-lg font-semibold">Record data</h2>
      <p>
        Record information comes from Discogs&apos; monthly data dumps, released under CC0. Each
        record links to its page on discogs.com.
      </p>
      <h2 id="what-you-post" className="scroll-mt-20 text-lg font-semibold">
        What you post
      </h2>
      <p>
        Comments appear publicly next to the record under your display name. Keep them about the
        music. Don&apos;t post:
      </p>
      <ul className="list-inside list-disc space-y-1">
        <li>hate speech, slurs, or attacks on people for who they are;</li>
        <li>harassment, threats, or someone else&apos;s private information;</li>
        <li>spam, advertising or links;</li>
        <li>anything illegal, or anything that infringes someone else&apos;s rights;</li>
        <li>sexually explicit or graphically violent content;</li>
        <li>impersonation of another person, of {APP_NAME} or of its staff.</li>
      </ul>
      <p>
        Comments with links, or with words on our blocked list, are refused before they are posted.
        Anyone signed in with a display name can <strong>report</strong> a comment with its flag
        button; a comment several people report is hidden while we look at it, and we aim to review
        reports within 24 hours. Anyone signed in can <strong>block</strong> a commenter from the
        same row to stop seeing their comments, and unblock them from the Account page; they
        aren&apos;t told.
      </p>
      <p>
        We may remove anything that breaks these rules and suspend or close the accounts that post
        it. To report something urgent or ask about a removal, email <SupportEmail />.
      </p>
      <h2 className="text-lg font-semibold">Your account</h2>
      <p>
        You can delete your account at any time from the Account page. Deletion removes your display
        name, crates, favorites, saved filters, notes, comments, history and other data within 7
        days.
      </p>
      <h2 className="text-lg font-semibold">Subscriptions</h2>
      <p>
        Pro renews until you cancel. Web subscriptions are managed from the Account page; App Store
        and Google Play subscriptions are managed in the store you bought them from.
      </p>
      <h2 className="text-lg font-semibold">Contact</h2>
      <p>
        Questions about these terms, your account or anything posted here: <SupportEmail />.
      </p>
    </article>
  );
}
