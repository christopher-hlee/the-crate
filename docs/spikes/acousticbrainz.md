# Spike: AcousticBrainz tempo and key

Status: the importer is built (`pnpm worker acousticbrainz:import <mapping.csv>`); the mapping
has not been built, because the build sandbox cannot reach the MusicBrainz or AcousticBrainz
dumps. This note is what to run, and how to decide.

## Why

AcousticBrainz stopped collecting in 2022, but its final dumps hold BPM and key estimates for
millions of MusicBrainz recordings under CC0. GetSongBPM covers popular tracks; AcousticBrainz
can fill in the long tail, at a lower confidence (`SOURCE_CONFIDENCE.acousticbrainz = 0.5`
against GetSongBPM's 0.8), so either source or enough agreeing listener votes win over it.

## The join

1. **MusicBrainz → Discogs.** The MusicBrainz database dump (CC0 core data) has URL
   relationships from releases to `https://www.discogs.com/release/<id>`. Join `l_release_url`
   with `url` where the URL matches that pattern to get `(mb_release_gid, discogs_release_id)`.
2. **Release → tracks.** `medium` and `track` give each recording's position on the release.
   MusicBrainz numbers tracks per medium (`1`, `2`); Discogs uses `A1`, `B2` on vinyl. Map by
   order: the n-th track on medium m in MusicBrainz is the n-th positioned track of the m-th
   side or disc in the Discogs tracklist (from our `releases.tracklist`). Keep only releases
   where both sides have the same track count, so the mapping is unambiguous.
3. **Recording → AcousticBrainz.** The AcousticBrainz high-level and low-level dumps are keyed
   by recording MBID. Take `rhythm.bpm` and `tonal.key_key` + `tonal.key_scale` from the
   low-level data; where a recording has several submissions, take the median BPM and the most
   common key.
4. Write `discogs_release_id,track_position,bpm,key,scale` and import it.

## Decision rule (Phase 2 gate)

Import if, on a sample of 1,000 playable record videos with a matched track:

- at least 15% gain a tempo they don't already have from GetSongBPM or votes, and
- where both AcousticBrainz and GetSongBPM have a value, at least 85% agree within ±2 BPM
  (counting half and double time as agreement).

Measure before and after with `pnpm worker tempo:coverage --out reports/tempo-coverage.json`.
