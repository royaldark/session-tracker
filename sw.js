/**
 * The offline cache (D-17, D-22).
 *
 * Two rules shape everything here:
 *
 * 1. It NEVER auto-activates. There is no `skipWaiting()` on install and no
 *    `clients.claim()`. A new build sits in `waiting` until the page asks for
 *    it, because a service worker that swaps the running code mid-fight is a
 *    tool that fights you — and the page will not ask during an encounter.
 * 2. Assets are cache-first, navigations are network-first. Vite's asset names
 *    are content-hashed and therefore immutable, so serving them from the cache
 *    is always correct; the HTML document is not hashed, so it is fetched when
 *    the network is there and falls back to the cache when it is not.
 *
 * There is no precache manifest: generating one needs a build step, and this
 * populates itself on first visit instead. The honest consequence is that the
 * FIRST load must be online. Every load after it need not be.
 */
const CACHE = "stifinner-v1";

// The app's own root, wherever it is deployed. `/` would be the ORIGIN root,
// which on a GitHub Pages project site is somebody else's page. The worker
// is served from the app's directory, so this resolves to it.
const ROOT = new URL("./", self.location.href).href;

self.addEventListener("install", () => {
  // Deliberately no `skipWaiting()`. See rule 1.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

self.addEventListener("message", (event) => {
  // The page has decided it is safe to swap — never an encounter in progress.
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? caches.match(ROOT)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          // Only successful, non-opaque responses. Caching an error page under
          // an immutable asset name would poison it until the cache is cleared.
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
