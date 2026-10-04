// Rights rules for the cleared lane (rule 20). Every asset carries a rights record, and
// nothing is listed unless checkRights passes. These rules are drafts until the owner's
// lawyer reviews them; the lane stays behind FEATURE_CLEARED_LANE and unlisted until then.

import { z } from "zod";

export const RIGHTS_BASES = ["us_pd", "cc0", "cc_by", "cc_by_sa", "signed_license"] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export const RIGHTS_BASIS_LABELS: Record<RightsBasis, string> = {
  us_pd: "US public domain (recording)",
  cc0: "CC0 1.0",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  signed_license: "Signed licence",
};

export const DATE_EVIDENCE_KINDS = [
  "discography",
  "label_dating",
  "dated_document",
  "archive_catalog",
] as const;

export const DateEvidenceSchema = z.object({
  kind: z.enum(DATE_EVIDENCE_KINDS),
  /** What the evidence says, e.g. "DAHR matrix B-29999, recorded 1924-03-11". */
  citation: z.string().trim().min(3).max(500),
  url: z.url().nullable(),
});

export const RightsRecordSchema = z.object({
  basis: z.enum(RIGHTS_BASES),
  /** Where the recording came from. */
  sourceUrl: z.url(),
  licenseUrl: z.url().nullable(),
  /** Year of first publication (US public domain runs from publication). */
  recordingYear: z.number().int().min(1877).max(2100).nullable(),
  dateEvidence: z.array(DateEvidenceSchema).max(10),
  /** Required for CC BY and CC BY-SA: who to credit and how. */
  attribution: z.string().trim().min(1).max(500).nullable(),
  /** Signed licences: the contract's reference. */
  licenseRef: z.string().trim().min(1).max(200).nullable(),
  /** Signed licences: when the grant ends (ISO date), if it does. */
  licenseExpiresAt: z.string().nullable(),
});
export type RightsRecord = z.infer<typeof RightsRecordSchema>;

/**
 * The latest publication year whose US sound recordings are in the public domain on a date,
 * under 17 U.S.C. § 1401 as amended by the Music Modernization Act (2018): pre-1923
 * recordings from 2022; 1923–1946 after 100 years; 1947–1956 after 110 years; everything
 * fixed before 15 February 1972 from 15 February 2067; later recordings after 95 years.
 * Returns null before 2022. Years are UTC calendar years, as terms run to 31 December.
 */
export function usRecordingPdCutoffYear(on: Date): number | null {
  const y = on.getUTCFullYear();
  if (y < 2022) return null;
  if (y <= 2023) return 1922;
  if (y <= 2047) return y - 101;
  if (y <= 2057) return 1946;
  if (y <= 2066) return y - 111;
  if (y === 2067) return on.getTime() >= Date.UTC(2067, 1, 15) ? 1971 : 1956;
  return y - 96;
}

/** The stored cutoff (set by pd_rollover, possibly held back by hand), never past the law. */
export function effectivePdCutoff(stored: number | null, on: Date): number | null {
  const legal = usRecordingPdCutoffYear(on);
  if (stored === null || legal === null) return null;
  return Math.min(stored, legal);
}

export type LicenseClass = { basis: "cc0" | "cc_by" | "cc_by_sa" } | { rejected: string };

const CC_URL = /^https?:\/\/(?:www\.)?creativecommons\.org(\/[^?#]*)?(?:[?#].*)?$/i;

/** Classifies a licence URL. Only CC0, CC BY and CC BY-SA pass; NC and ND never do. */
export function classifyLicenseUrl(url: string): LicenseClass {
  if (!/^https?:\/\/[^\s/]+/i.test(url)) return { rejected: "Not a URL." };
  const m0 = CC_URL.exec(url.trim());
  if (!m0)
    return {
      rejected:
        "Only Creative Commons licence URLs are recognised; anything else needs a signed licence.",
    };
  const path = (m0[1] ?? "/").toLowerCase();
  if (/^\/publicdomain\/zero\/1\.0(\/|$)/.test(path)) return { basis: "cc0" };
  if (/^\/publicdomain\/mark\//.test(path))
    return {
      rejected:
        "The Public Domain Mark is a label, not a licence: use the US public-domain basis with date evidence.",
    };
  const m = /^\/licenses\/([a-z+-]+)\/(\d\.\d)(\/|$)/.exec(path);
  if (!m) return { rejected: "Unrecognised Creative Commons URL." };
  const kind = m[1] ?? "";
  if (/(^|-)nc(-|$)/.test(kind) || /(^|-)nd(-|$)/.test(kind))
    return { rejected: "NC and ND licences are never accepted." };
  if (kind === "by") return { basis: "cc_by" };
  if (kind === "by-sa") return { basis: "cc_by_sa" };
  return { rejected: `The ${kind} licence is not accepted.` };
}

export type RightsCheck =
  | { ok: true; problems: [] }
  | { ok: false; problems: string[]; held?: true };

/** Applies the rights rules to one record. `held` means it may pass once a later year is public domain. */
export function checkRights(
  record: RightsRecord,
  ctx: { usPdCutoffYear: number | null; now: Date },
): RightsCheck {
  const problems: string[] = [];
  let held = false;
  const license = record.licenseUrl ? classifyLicenseUrl(record.licenseUrl) : null;
  if (license && "rejected" in license && /NC and ND/.test(license.rejected))
    problems.push(license.rejected);

  switch (record.basis) {
    case "us_pd": {
      if (record.recordingYear === null)
        problems.push("A public-domain recording needs its year of publication.");
      else if (ctx.usPdCutoffYear === null || record.recordingYear > ctx.usPdCutoffYear) {
        problems.push(
          `US recordings are public domain only through ${ctx.usPdCutoffYear ?? "(none yet)"}.`,
        );
        held = true;
      }
      if (record.dateEvidence.length === 0)
        problems.push("A public-domain recording needs date evidence.");
      break;
    }
    case "cc0":
    case "cc_by":
    case "cc_by_sa": {
      if (!license) problems.push("A Creative Commons basis needs the licence URL.");
      else if ("rejected" in license) {
        if (!problems.includes(license.rejected)) problems.push(license.rejected);
      } else if (license.basis !== record.basis)
        problems.push(`The licence URL is ${license.basis}, not ${record.basis}.`);
      if ((record.basis === "cc_by" || record.basis === "cc_by_sa") && !record.attribution)
        problems.push("CC BY and CC BY-SA need an attribution line.");
      break;
    }
    case "signed_license": {
      if (!record.licenseRef) problems.push("A signed licence needs its reference.");
      if (
        record.licenseExpiresAt &&
        new Date(record.licenseExpiresAt).getTime() <= ctx.now.getTime()
      )
        problems.push("The signed licence has expired.");
      break;
    }
  }
  if (problems.length === 0) return { ok: true, problems: [] };
  return held && problems.length === 1
    ? { ok: false, problems, held: true }
    : { ok: false, problems };
}
