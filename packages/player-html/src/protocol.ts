// Typed messages between the native app and the player page inside the WebView. Both sides
// validate every message with these schemas (zod/mini keeps the page bundle small).

import * as z from "zod/mini";

const VideoId = z.string().check(z.regex(/^[A-Za-z0-9_-]{11}$/));

/** Native → page. */
export const NativeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("load"),
    videoId: VideoId,
    startSeconds: z.optional(z.number().check(z.gte(0))),
    /** Play right away. Native sends true only for a tap while the player is fully on screen. */
    autoplay: z.boolean(),
  }),
  z.object({ type: z.literal("play") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("seek"), seconds: z.number().check(z.gte(0)) }),
]);
export type NativeMessage = z.infer<typeof NativeMessageSchema>;

/** Page → native. */
export const PageMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({
    type: z.literal("state"),
    videoId: z.nullable(VideoId),
    /** YouTube player state: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
    state: z.number(),
    currentTime: z.number(),
  }),
  z.object({ type: z.literal("error"), videoId: z.nullable(VideoId), code: z.number() }),
]);
export type PageMessage = z.infer<typeof PageMessageSchema>;

export function parseNativeMessage(raw: unknown): NativeMessage | null {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const parsed = NativeMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePageMessage(raw: unknown): PageMessage | null {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  const parsed = PageMessageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
