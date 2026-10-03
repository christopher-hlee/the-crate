-- Helpers for the monthly catalog build (hand-written; drizzle-kit has no DSL for these).

-- Concatenates arrays across rows; the build dedupes the result.
CREATE AGGREGATE array_cat_agg(anycompatiblearray) (
  SFUNC = array_cat,
  STYPE = anycompatiblearray,
  INITCOND = '{}'
);
--> statement-breakpoint

-- Best tempo and best key per track across sources: highest confidence wins, newest breaks
-- ties. Community rows carry a confidence that grows with agreeing votes, so they can win.
CREATE VIEW track_audio_best AS
SELECT
  coalesce(b.release_id, k.release_id) AS release_id,
  coalesce(b.track_position, k.track_position) AS track_position,
  b.bpm,
  b.source AS bpm_source,
  k.camelot_key,
  k.source AS key_source
FROM (
  SELECT DISTINCT ON (release_id, track_position) release_id, track_position, bpm, source
  FROM track_audio_features
  WHERE bpm IS NOT NULL
  ORDER BY release_id, track_position, confidence DESC NULLS LAST, updated_at DESC
) b
FULL OUTER JOIN (
  SELECT DISTINCT ON (release_id, track_position) release_id, track_position, camelot_key, source
  FROM track_audio_features
  WHERE camelot_key IS NOT NULL
  ORDER BY release_id, track_position, confidence DESC NULLS LAST, updated_at DESC
) k ON k.release_id = b.release_id AND k.track_position = b.track_position;
