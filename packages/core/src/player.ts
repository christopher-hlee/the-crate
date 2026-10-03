// YouTube IFrame player constants shared by web and mobile.

export const IFRAME_API_URL = "https://www.youtube.com/iframe_api";

/**
 * Error codes that mean this video cannot play here: invalid parameter (2), HTML5 player
 * error (5), not found or private (100), embedding disallowed (101, 150). On any of them the
 * client reports the video and moves to the next pick.
 */
export const REPORTABLE_PLAYER_ERRORS = [2, 5, 100, 101, 150] as const;
export type PlayerErrorCode = (typeof REPORTABLE_PLAYER_ERRORS)[number];

export function isReportablePlayerError(code: number): code is PlayerErrorCode {
  return (REPORTABLE_PLAYER_ERRORS as readonly number[]).includes(code);
}

/** The only player parameters we use (player rule 2). `origin` is added on the web. */
export const PLAYER_VARS = { playsinline: 1, controls: 1, rel: 0 } as const;

export const PLAYER_MIN_SIZE = { width: 200, height: 200 } as const;
export const PLAYER_DESKTOP_MIN = { width: 480, height: 270 } as const;
/** A thumbnail that starts playback must be at least this big (rule 4). */
export const THUMBNAIL_MIN = { width: 120, height: 70 } as const;

export const PLAYER_STATE = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
} as const;

/** Autoplay is allowed only when more than this share of the player is visible (rule 5). */
export const AUTOPLAY_VISIBLE_RATIO = 0.5;
