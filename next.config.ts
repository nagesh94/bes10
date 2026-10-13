import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // A build while `npm run dev` is running otherwise fights the dev server
  // for .next and fails collecting page data. Set NEXT_DIST_DIR to send a
  // one-off build somewhere else.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The design canvas lives in the repo but is not part of the app build.
  outputFileTracingExcludes: {
    "*": ["./design/**", "./docs/**"],
  },
  experimental: {
    // Server Actions carry photo uploads from the field; the default 1 MB cap
    // is too small even after client-side compression.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default withNextIntl(nextConfig);
