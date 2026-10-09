// zod schemas for the parts of videos.list we request. Unknown fields are ignored.

import { z } from "zod";

const Thumbnail = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const VideoItemSchema = z.object({
  id: z.string(),
  snippet: z
    .object({
      title: z.string().optional(),
      thumbnails: z.record(z.string(), Thumbnail).optional(),
      channelId: z.string().optional(),
      channelTitle: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  contentDetails: z
    .object({
      duration: z.string().optional(),
      regionRestriction: z
        .object({
          allowed: z.array(z.string()).optional(),
          blocked: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
  status: z
    .object({
      uploadStatus: z.string().optional(),
      privacyStatus: z.string().optional(),
      embeddable: z.boolean().optional(),
      madeForKids: z.boolean().optional(),
    })
    .optional(),
  statistics: z.object({ viewCount: z.string().optional() }).optional(),
});

export type VideoItem = z.infer<typeof VideoItemSchema>;

export const VideosListResponseSchema = z.object({
  items: z.array(VideoItemSchema).default([]),
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string().optional(),
    errors: z
      .array(z.object({ reason: z.string().optional(), domain: z.string().optional() }))
      .optional(),
  }),
});
