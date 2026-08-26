/* Bypass Shop — minimal service worker.
   Caches the app shell so it opens fast and survives a flaky connection.
   Live inventory data still comes from Supabase over the network. */
const CACHE = "bypass-shop-v53";
const SHELL = [
  "/", "/index.html", "/manifest.webmanifest",
  "/icon.svg", "/icon-192.png", "/icon-512.png",
  "/icon-maskable-512.png", "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // One at a time, not addAll: addAll is all-or-nothing, so a single icon
      // that 404s after a rename would leave the app with no cache at all and
      // nothing working offline. A missing icon should cost that icon only.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Only handle same-origin GETs; let Supabase/API calls go straight to network.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  // Network-first for navigations so staff always get the latest app build,
  // falling back to the cached shell when offline.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for static assets (hashed by Vite, so safe to keep).
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
