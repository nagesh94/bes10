import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Pwa } from "@/components/shell/pwa";
import "@/styles/globals.css";

/** 800 carries the dashboard's figures; nothing else goes above 700. */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

/** Devanagari sets ~15% wider than Latin, so nothing is sized to fit English. */
const notoDeva = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-deva",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "BHIM Solar CRM",
    template: "%s · BHIM Solar CRM",
  },
  applicationName: "BHIM CRM",
  description:
    "Residential rooftop solar, from first call to subsidy — PM Surya Ghar.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "BHIM CRM",
    // The bar is painted by the app's own chrome colour, so iOS should not
    // draw its own over the top.
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // The app bar is deep module glass in both themes, so the system bar
  // above it is the same colour either way.
  themeColor: "#081E36",
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom stays available: a 60-year-old reading a consumer number off
  // a phone in the sun needs it, and locking it would fail WCAG 1.4.4.
  maximumScale: 5,
  viewportFit: "cover",
};

/**
 * Paints the stored theme before first render so the app never flashes the
 * wrong one. Reads localStorage, which the account's saved theme mirrors.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var t = localStorage.getItem("bhim_theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${archivo.variable} ${plexMono.variable} ${notoDeva.variable} font-sans antialiased`}
      >
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        <Pwa />
      </body>
    </html>
  );
}
