// The cleared-lane import manifest: one entry per recording, with its rights record. Assets
// are curated by hand (a person checks the evidence); the pipeline only enforces the rules.

import { RightsRecordSchema } from "@app/core";
import { z } from "zod";

export const ManifestItemSchema = z.object({
  /** Stable ID for the recording, e.g. "dahr-b-29999". Re-imports update by slug. */
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/),
  artist: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  year: z.number().int().min(1877).max(2100).nullable().default(null),
  label: z.string().trim().max(200).nullable().default(null),
  catno: z.string().trim().max(100).nullable().default(null),
  styles: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  /** An http(s) URL or a path relative to the manifest. */
  audio: z.string().min(1),
  bpm: z.number().min(20).max(400).nullable().default(null),
  camelotKey: z
    .string()
    .regex(/^(1[0-2]|[1-9])[AB]$/)
    .nullable()
    .default(null),
  rights: RightsRecordSchema,
});
export type ManifestItem = z.infer<typeof ManifestItemSchema>;

export const ManifestSchema = z.object({ assets: z.array(ManifestItemSchema).min(1).max(10_000) });
export type Manifest = z.infer<typeof ManifestSchema>;
