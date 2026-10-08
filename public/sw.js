const CACHE = "tayoo-v2";
const PRECACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/offline",
];
// Stale-while-revalidate vs network-first is decided per request type below.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Some precache entries may 404 during development — never block install.
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(url).catch(() => null)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Navigations offline: fall back to the precached app shell.
    if (request.mode === "navigate") {
      const shell = await caches.match("/");
      if (shell) return shell;
    }
    throw _err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // API reads: Network-First (fresh data when online, IndexedDB + runtime
  // cache fallback offline; the app layer handles the IndexedDB part).
  if (isSameOrigin && url.pathname.startsWith("/api/")) {
    if (url.pathname.startsWith("/api/auth/")) return; // never cache sessions
    event.respondWith(networkFirst(request, CACHE));
    return;
  }

  // Page navigations: Network-First with app-shell fallback.
  if (request.mode === "navigate" && isSameOrigin) {
    event.respondWith(networkFirst(request, CACHE));
    return;
  }

  // Hashed build assets, fonts and images: Cache-First (immutable).
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf|css|js)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else (same-origin documents/assets): Network-First fallback.
  if (isSameOrigin) {
    event.respondWith(networkFirst(request, CACHE));
  }
});
