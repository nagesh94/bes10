/**
 * BHIM CRM service worker.
 *
 * Deliberately conservative. This app shows one household's documents and
 * money to one signed-in person, so nothing that comes back from a page or
 * an API request is ever stored — a cached page would otherwise outlive the
 * session and could be served to the next person to open the app on a shared
 * site phone.
 *
 * What is cached is only what is identical for everyone: the build's static
 * assets, the icons, the brand images, and one offline page.
 *
 * Installers lose signal on roofs and in basements, so a navigation that
 * fails falls back to that page rather than the browser's dinosaur.
 */

const VERSION = "bhim-v1";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

const PRECACHE = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon.svg",
  "/brand/bhim-wordmark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Immutable, content-hashed, and the same for every account. */
function isBuildAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never the auth routes, never the API, never a signed document URL.
  if (url.pathname.startsWith("/api/")) return;

  if (isBuildAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline.html").then((hit) => hit ?? Response.error()),
      ),
    );
  }
});
