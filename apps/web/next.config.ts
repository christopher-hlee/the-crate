import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@app/core", "@app/db", "@app/api-client", "@app/assets"],
  serverExternalPackages: [
    "pg",
    "pg-copy-streams",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
  poweredByHeader: false,
  env: {
    // Public Supabase values; the spec names them without the NEXT_PUBLIC_ prefix.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_AUTH_MODE:
      process.env.AUTH_MODE ??
      (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "dev"),
    // OAuth buttons on the login page, a comma list such as "google,apple". Each provider must
    // also be enabled in the Supabase project. Unset: email sign-in only.
    NEXT_PUBLIC_AUTH_PROVIDERS: process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "",
    // Ad space for plans with ads ("1", "true", "on" or "yes"). Off by default.
    NEXT_PUBLIC_FEATURE_ADS: process.env.NEXT_PUBLIC_FEATURE_ADS ?? "",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
