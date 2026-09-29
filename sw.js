/** Local: stay off. Production: versioned shell, drop leftover caches. */
const CACHE = "dollarvalue-v84";

const SHELL = [
  "/",
  "/about.html",
  "/styles.css?v=84",
  "/app.js?v=84",
  "/data/series.json?v=84",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-32.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      // One at a time: addAll is all-or-nothing, so a single missing file
      // would mean no service worker at all and no offline app.
      await Promise.all(SHELL.map((url) => c.add(url).catch(() => {})));
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Vercel Web Analytics is injected at the edge. Do not cache it.
  if (new URL(req.url).pathname.startsWith("/_vercel/")) return;
  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch (err) {
        const hit = await caches.match(req);
        if (hit) return hit;
        // Every branch has to end in a Response. Handing respondWith an
        // undefined cache miss fails the whole request instead of the page.
        if (req.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});
