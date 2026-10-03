// Deterministic synthetic Discogs-shaped data for scale tests and benchmarks. Distributions
// are rough shapes of the real catalog (genre mix, decades, master sizes, link rates); the
// content is invented. Used because the sandbox cannot reach the live dumps.

export type Rng = () => number;

/** Small seeded PRNG (32-bit state, xorshift with a multiply), good enough for test data. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (Math.imul(s, 0x2545f491) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let x = rng() * total;
  for (const [item, w] of items) {
    x -= w;
    if (x < 0) return item;
  }
  return (items[items.length - 1] as readonly [T, number])[0];
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

export const GENRE_WEIGHTS: readonly (readonly [string, number])[] = [
  ["Electronic", 30],
  ["Rock", 25],
  ["Pop", 12],
  ["Funk / Soul", 8],
  ["Jazz", 6],
  ["Hip Hop", 5],
  ["Folk, World, & Country", 5],
  ["Latin", 3],
  ["Reggae", 2],
  ["Classical", 2],
  ["Blues", 1],
  ["Stage & Screen", 1],
  ["Non-Music", 0.5],
];

export const STYLES: Readonly<Record<string, readonly string[]>> = {
  Electronic: [
    "House",
    "Techno",
    "Deep House",
    "Trance",
    "Electro",
    "Ambient",
    "Drum n Bass",
    "Disco",
    "Synth-pop",
    "Minimal",
    "Breakbeat",
    "Downtempo",
    "Acid",
    "Dub Techno",
    "Italo-Disco",
  ],
  Rock: [
    "Pop Rock",
    "Punk",
    "Alternative Rock",
    "Hard Rock",
    "Indie Rock",
    "Psychedelic Rock",
    "Prog Rock",
    "Garage Rock",
    "Shoegaze",
    "Post-Punk",
    "Krautrock",
  ],
  Pop: ["Vocal", "Ballad", "Europop", "Chanson", "Schlager", "City Pop", "Bubblegum"],
  "Funk / Soul": [
    "Soul",
    "Funk",
    "Disco",
    "Rhythm & Blues",
    "Boogie",
    "Northern Soul",
    "Gospel",
    "Neo Soul",
  ],
  Jazz: [
    "Soul-Jazz",
    "Jazz-Funk",
    "Fusion",
    "Hard Bop",
    "Free Jazz",
    "Modal",
    "Big Band",
    "Bossa Nova",
    "Contemporary Jazz",
  ],
  "Hip Hop": [
    "Boom Bap",
    "Instrumental",
    "Conscious",
    "Gangsta",
    "Trip Hop",
    "Cut-up/DJ",
    "Turntablism",
  ],
  "Folk, World, & Country": [
    "Folk",
    "Country",
    "African",
    "Highlife",
    "Afrobeat",
    "Celtic",
    "Bluegrass",
  ],
  Latin: ["Salsa", "Cumbia", "Samba", "Boogaloo", "Bossanova", "Latin Jazz", "MPB"],
  Reggae: ["Roots Reggae", "Dub", "Dancehall", "Ska", "Rocksteady", "Lovers Rock"],
  Classical: ["Modern", "Romantic", "Baroque", "Contemporary", "Opera"],
  Blues: ["Electric Blues", "Chicago Blues", "Delta Blues", "Rhythm & Blues"],
  "Stage & Screen": ["Soundtrack", "Score", "Musical", "Library"],
  "Non-Music": ["Field Recording", "Spoken Word", "Comedy"],
};

export const COUNTRY_WEIGHTS: readonly (readonly [string, number])[] = [
  ["US", 30],
  ["UK", 15],
  ["Germany", 10],
  ["France", 6],
  ["Japan", 6],
  ["Italy", 5],
  ["Netherlands", 4],
  ["Europe", 3],
  ["Canada", 3],
  ["Spain", 3],
  ["Sweden", 2],
  ["Brazil", 2],
  ["Belgium", 2],
  ["Australia", 2],
  ["Russia", 2],
  ["Jamaica", 1],
  ["Nigeria", 0.5],
  ["Colombia", 0.5],
];

const DECADE_WEIGHTS: readonly (readonly [number, number])[] = [
  [1950, 3],
  [1960, 8],
  [1970, 14],
  [1980, 15],
  [1990, 20],
  [2000, 18],
  [2010, 16],
  [2020, 6],
];

export const FORMATS: readonly (readonly [
  { name: string; descriptions: readonly string[] },
  number,
])[] = [
  [
    {
      name: "Vinyl",
      descriptions: ["LP", "Album", '12"', '7"', "Single", "EP", "33 ⅓ RPM", "45 RPM"],
    },
    55,
  ],
  [{ name: "CD", descriptions: ["Album", "Single", "Compilation", "Reissue"] }, 25],
  [{ name: "File", descriptions: ["MP3", "FLAC", "WAV", "Album"] }, 12],
  [{ name: "Cassette", descriptions: ["Album", "Mixtape"] }, 8],
];

export const RARE_DESCRIPTIONS = ["Promo", "Test Pressing", "White Label", "Limited Edition"];

const WORDS = [
  "night",
  "ferry",
  "glass",
  "harbour",
  "signal",
  "drift",
  "copper",
  "rain",
  "velvet",
  "echo",
  "orbit",
  "summer",
  "station",
  "dust",
  "lantern",
  "river",
  "neon",
  "static",
  "fever",
  "garden",
  "mirror",
  "shadow",
  "pulse",
  "satellite",
  "honey",
  "cobalt",
  "midnight",
  "island",
  "machine",
  "tide",
];

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function videoId(rng: Rng): string {
  let s = "";
  for (let i = 0; i < 11; i++) s += ID_ALPHABET[Math.floor(rng() * 64)];
  return s;
}

export function phrase(rng: Rng, min: number, max: number): string {
  const n = min + Math.floor(rng() * (max - min + 1));
  const words: string[] = [];
  for (let i = 0; i < n; i++) words.push(pick(rng, WORDS));
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}

export function year(rng: Rng): number {
  return pickWeighted(rng, DECADE_WEIGHTS) + Math.floor(rng() * 10);
}

export function stylesFor(rng: Rng, genre: string): string[] {
  const pool = STYLES[genre] ?? [];
  const n = 1 + Math.floor(rng() * Math.min(3, pool.length));
  const out = new Set<string>();
  for (let i = 0; i < n; i++) out.add(pick(rng, pool));
  return [...out];
}
