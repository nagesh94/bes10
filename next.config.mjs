import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Plain JavaScript, deliberately — not next.config.ts.
 *
 * A TypeScript config has to be compiled before it can be read, and Next does
 * that with a platform-specific native SWC binary. On the server that failed
 * with "Failed to load native binding", which stops `next start` before the
 * app gets anywhere: the production build was fine, but the config could not
 * be parsed to start serving it.
 *
 * A .mjs config needs no compilation and no native binding, so booting the app
 * depends on nothing beyond Node itself. Type checking is kept through the
 * JSDoc annotation below, which editors honour exactly like the imported type.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // A build while `npm run dev` is running otherwise fights the dev server
  // for .next and fails collecting page data. Set NEXT_DIST_DIR to send a
  // one-off build somewhere else.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  /**
   * Standalone output is for a lean deploy and must be opt-in: Next's hosting
   * adapters do their own packaging, and a standalone build confuses them.
   */
  ...(process.env.BUILD_STANDALONE === "true" ? { output: "standalone" } : {}),

  /**
   * Pin the trace root to this directory.
   *
   * Next walks up looking for a lockfile and finds a stray one in the home
   * directory two levels above the project. It then treats that as the
   * workspace root, so `.next/standalone` comes out nested under
   * `Desktop/besapp/` — which quietly breaks the standalone deploy, because
   * `server.js` is not where the deploy script expects it.
   */
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),

  // Nothing is gained by telling the internet which framework version this is.
  poweredByHeader: false,

  // The design canvas lives in the repo but is not part of the app build.
  // `templates/` is checked: nothing reads it at runtime — uploaded templates
  // live in object storage — so excluding it is safe.
  outputFileTracingExcludes: {
    "*": ["./design/**", "./docs/**", "./templates/**"],
  },

  /**
   * Force the brand assets into the server bundle.
   *
   * `docx-kit` and the quotation PDF read `public/brand/*` off disk through
   * `process.cwd()` — the wordmark, the emblem and the vendor signature that
   * get embedded into generated documents. Next's tracing cannot see those
   * reads, because the paths are built at runtime rather than imported, and
   * `public/` is served as static files rather than bundled into functions.
   */
  outputFileTracingIncludes: {
    "/**": ["./public/brand/**"],
  },

  experimental: {
    // Server Actions carry photo uploads from the field; the default 1 MB cap
    // is too small even after client-side compression.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },

  /**
   * Security headers.
   *
   * No Content-Security-Policy yet, and that is a deliberate omission rather
   * than an oversight: Next's inline bootstrap scripts need either a nonce or
   * 'unsafe-inline', and a CSP written without testing every page tends to be
   * discovered broken by a technician on a roof. The headers below carry no
   * such risk. HSTS is set at the TLS terminator, not here, because this app
   * is also reachable over plain HTTP on localhost.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // The field app uses the camera for rooftop photos; the rest off.
            value: "camera=(self), microphone=(), geolocation=(self), payment=()",
          },
        ],
      },
      {
        /**
         * Presigned URLs and generated documents must never be cached by a
         * proxy — a signed URL in a shared cache is a document handed to the
         * next user.
         */
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

// next-intl wraps the config to register its request handler. Without this
// wrapper the app loses locale handling entirely — en/hi switching, and the
// server-side message loading every page depends on.
export default withNextIntl(nextConfig);
