// Offline support.
// Built version (dist/): the build injects BUILD_VERSION and PRECACHE (every file the app needs),
// and assets are served cache-first. A new build installs in the background and waits until the
// player taps "Update" (the page sends SKIP_WAITING), so nobody is switched mid-puzzle.
// Source version (running from the repo): network-first with a cache fallback, so edits show up.
const BUILD_VERSION = "dev";
const PRECACHE = ["./", "index.html"];

const IS_BUILT = BUILD_VERSION !== "dev";
const CACHE_NAME = `logic-puzzles-${BUILD_VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // `cache: "reload"` bypasses the HTTP cache so a new version never precaches stale copies.
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })))
    )
  );
  if (!IS_BUILT) self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("logic-puzzles") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: request.mode === "navigate" });
  if (cached) return cached;
  try {
    return await fetch(request);
  } catch {
    if (request.mode === "navigate") return caches.match("index.html");
    return Response.error();
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    return cached || (request.mode === "navigate" ? cache.match("index.html") : Response.error());
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(IS_BUILT ? cacheFirst(request) : networkFirst(request));
});
