import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@app/core", "@app/db", "@app/api-client"],
  serverExternalPackages: ["pg", "pg-copy-streams"],
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
