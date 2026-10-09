# Store listings and review notes

Draft copy for the App Store and Google Play. The product name is still open (`APP_NAME`
is "The Crate" as a working name), and the app IDs default to the spec's placeholder
`com.example.cratedig`. Both have to be final before the first build that goes to review,
because the app ID is also the player's `Referer` (`https://` plus the app ID).

## Listing copy

**Name:** The Crate (working name)

**Subtitle (App Store, 30 characters):** Dig records at random

**Short description (Google Play, 80 characters):** Shuffle through records from every era and style. Save the ones you love.

**Description:**

> Crate digging without the dust. Pick a style, a decade, a country or a format, then
> shuffle: every pick is a real record, with its label, catalog number, year and tracklist,
> playing in YouTube's own player.
>
> - Shuffle through millions of records, filtered your way.
> - See where each record comes from, with a link to its Discogs page.
> - Favorite what you love, save filter sets, and pick up where you left off on the web.
> - Swipe for the next record, press and hold to favorite.
> - Tempo, key and view-count filters, timestamped notes and comments, free.
>
> Listening is free. Pro adds digging tools: crates, keyword search, topic channels, "more from"
> this label, artist or channel, deep cuts, seeded crates you can share, a longer history and
> crate sheets.
>
> Videos play in YouTube's player and stay on YouTube: nothing is downloaded, and nothing
> plays in the background. Record data comes from the Discogs data dumps (CC0). Tempo data
> from GetSongBPM: https://getsongbpm.com

The GetSongBPM link stays in both descriptions once any GetSongBPM tempo appears in the app
(rule 19), and in the in-app Account › About section.

**Keywords (App Store, 100 characters):** vinyl,records,crate digging,discogs,shuffle,funk,soul,jazz,disco,house,samples,dj

**Category:** Music. **Age rating:** 12+ (unrestricted web content in YouTube's player).

## Privacy

App Store privacy details ("Data linked to you"; no tracking, no third-party advertising in
the app):

| Data | Purpose | Notes |
| --- | --- | --- |
| Email address | App functionality | Supabase sign-in |
| User ID | App functionality | Supabase user ID; also RevenueCat's app user ID |
| Purchase history | App functionality | Store subscriptions through RevenueCat |
| Product interaction | App functionality | Play history (record and video played), favorites, crates, saved filters, notes, votes |
| Other user content | App functionality | Display name and comments (public, with rank and Pro badge), comment reports |
| Crash data | App functionality | Sentry, when a DSN is configured |

Google Play data safety matches: the same data, encrypted in transit, deletable in the app
(Account › Delete account) and at `/account` on the web. Account deletion removes user rows
at once and the rest within 7 days (rule 15).

Privacy policy URL: `${WEB_URL}/legal/privacy` (it says the app uses YouTube API Services and
links Google's privacy policy). Terms URL: `${WEB_URL}/legal/terms` (links YouTube's Terms of
Service).

## App Review notes

> **How playback works.** Every video plays in YouTube's official IFrame player, loaded in
> a WebView from youtube.com with the app ID as the Referer, as YouTube's Required Minimum
> Functionality asks. We never download, cache, convert or record audio or video, nothing is
> drawn over the player, and nothing plays in the background: the app has no background
> audio mode, and the player pauses when the app leaves the foreground.
>
> **What the app adds.** The record data (artist, label, catalog number, year, tracklist)
> comes from Discogs' CC0 data dumps, and each record links to its discogs.com page. The
> filters, favorites, crates, comments and history are the app's own features.
>
> **Subscriptions.** Pro is an auto-renewable subscription through in-app purchase. It sells
> digging tools (crates, keyword and channel filters, seeded crates, exports of links); listening
> is free and never needs Pro. Restore purchases is on the Account tab.
>
> **Demo account.** Account › Sign in › "Use a password", with the email and password given in
> App Store Connect. The account has Pro so the Pro tools can be reviewed.
>
> **Account deletion.** Account › Delete account.

Google Play's notes are the same, plus the declaration that the app does not use the
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` permission (it is in `blockedPermissions`).

## Screenshots

6.9" and 6.5" iPhone, 13" iPad, and Play phone and 7" tablet: Dig with a pick playing, the
filter panel open, a crate, History, and Account showing Pro. The player is never cropped or
covered in a screenshot, and no screenshot shows a thumbnail as artwork for the record.

## Owner checklist (Gate 4)

- Final name and app IDs, then `APP_ID_IOS` and `APP_ID_ANDROID` in EAS.
- RevenueCat project, the `pro` entitlement, a default offering with monthly and annual
  packages, the store products, and the public SDK keys in `EXPO_PUBLIC_REVENUECAT_*`.
- A Pro demo account for review: a Supabase user with a password (Auth › Users › Add user)
  and a `subscriptions` row with plan `pro`, no source and a far `expires_at`:
  `insert into subscriptions (user_id, plan, expires_at) values ('<id>', 'pro', now() + interval '1 year');`
- Sandbox testers for the Maestro purchase flow.
- App Review and Google Play review.
