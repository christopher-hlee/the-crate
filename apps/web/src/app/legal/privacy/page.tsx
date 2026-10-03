import { APP_NAME } from "@app/core";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 leading-relaxed">
      <h1 className="text-2xl font-semibold">Privacy policy</h1>
      <h2 className="text-lg font-semibold">YouTube API Services</h2>
      <p>
        {APP_NAME} uses YouTube API Services. Our servers use the YouTube Data API to check whether
        linked videos can play, and your browser or app plays videos in YouTube&apos;s embedded
        player, which YouTube operates. Google&apos;s use of data is described in the{" "}
        <a
          className="text-accent underline"
          href="https://policies.google.com/privacy"
          rel="noopener"
        >
          Google Privacy Policy
        </a>
        . You can revoke any access you have granted at{" "}
        <a
          className="text-accent underline"
          href="https://security.google.com/settings/security/permissions"
          rel="noopener"
        >
          Google&apos;s security settings
        </a>
        .
      </p>
      <h2 className="text-lg font-semibold">What we keep</h2>
      <ul className="list-inside list-disc space-y-1">
        <li>Your account: an ID and email address from our sign-in provider.</li>
        <li>What you save: crates, notes, tempo and key votes, link suggestions.</li>
        <li>
          History: the plays in your plan&apos;s window (50 on Free, 1,000 on Pro), used to keep
          played records out of your shuffle.
        </li>
        <li>
          Error reports when a video fails to play, and a hashed IP address for rate limiting.
        </li>
        <li>
          Subscription status from Stripe, the App Store or Google Play. We never see card details.
        </li>
      </ul>
      <p>
        Signed out, your list of recently seen videos stays in your browser&apos;s storage and never
        reaches us beyond the shuffle request that uses it.
      </p>
      <p>
        YouTube data we store about videos (titles, durations, view counts, thumbnails,
        availability) is refreshed or deleted within 30 days.
      </p>
      <h2 className="text-lg font-semibold">Deleting your data</h2>
      <p>
        Delete your account from the Account page. Your data is removed within 7 days; most of it
        immediately.
      </p>
    </article>
  );
}
