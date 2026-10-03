# Non-negotiable rules

Copied verbatim from `docs/SPEC.md` ("Non-negotiable rules"). These load in every session.
If a task seems to need breaking one, stop and ask the owner. Never work around one.

These come from YouTube's API terms, Discogs' terms, Apple's review guidelines and copyright law. Breaking one can cost the app its API access or its store listing. If a feature seems to need breaking one, stop and ask. Brackets cite YouTube's Developer Policies; RMF is its Required Minimum Functionality page.

**YouTube**

1. Play YouTube content only through the official IFrame player: directly on the web, inside an OS WebView on mobile. \[RMF\]
2. Never download, cache, proxy, transcode or store YouTube audio or video. No offline playback, audio-only extraction or background playback, and no feature that helps users record or capture YouTube audio. \[III.E.1, III.I.7–9\]
3. Never draw anything over the player. Never make it `inert`, set `pointer-events: none` on it, or hide its links and branding. \[RMF; III.I.4–6\]
4. Keep the player at least 200×200 px; target 480×270 or larger for 16:9. A thumbnail that starts playback must be at least 120×70 px. \[RMF\]
5. Autoplay only when more than half the player is visible. Never run two autoplaying players on one screen, and never preload with hidden or muted players. \[RMF\]
6. Never charge for playback or require anything beyond pressing play. Pro sells tools, never listening. \[III.F.3\]
7. Refresh or delete stored YouTube API data within 30 days: titles, durations, view counts, thumbnails, status and region rules. Never derive metrics from it, so view counts never feed a score. \[III.E.4\]
8. Look up each video's Made for Kids status and keep those videos out of the shuffle. \[III.E.4.j\]
9. Get YouTube data only from YouTube Data API v3, using the server-side key. No scraping and no undocumented endpoints. \[III.E.6, III.D.7, III.I.14\]
10. Use exactly one Google Cloud project for this app. The API key stays on the server and never ships in the web bundle or the mobile binary. \[III.D.1\]
11. In mobile WebViews, set the `Referer` to `https://` plus the store app ID, through the WebView's base URL. \[RMF\]
12. Never sell ads on or inside the player. Ads go only on screens whose own content would stand without the YouTube data. \[III.G.1\]
13. Our terms link to YouTube's Terms of Service. Our privacy policy says we use YouTube API Services and links Google's privacy policy. \[III.A\]
14. Don't rebuild YouTube's own browsing experience. Our filters, crates and record data are the added value. \[III.I.1\]
15. Offer account deletion that removes the user's data within 7 days. \[III.E.4.g\]

**Discogs**

16. Build the catalog only from the monthly CC0 data dumps. Don't call the Discogs API in the product, and never show Discogs images, which its terms bar from commercial use.
17. Link every record to its discogs.com page.

**Other sources**

18. Don't use the Spotify Web API for audio features or recommendations.
19. Once GetSongBPM data appears, show a visible link to getsongbpm.com on the site and on both store listings, and stay under 3,000 requests an hour.
20. Every cleared-lane asset needs a recorded rights basis: a US recording from 1925 or earlier, CC0, CC BY, CC BY-SA, or a signed license. Never NC or ND licenses. Nothing is marketed as "cleared" until the owner's lawyer has reviewed these rules.

**Apple and branding**

21. Nothing in the iOS app may save, convert or download third-party media. \[App Store guideline 5.2.3\]
22. Don't use the Samplette name or anything from its branding, copy or design. Don't copy Digga's code.
