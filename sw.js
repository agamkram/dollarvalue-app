/** Local: stay off. Production: versioned shell, drop leftover caches. */
const CACHE = "dollarvalue-v19";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(["/", "/styles.css?v=19", "/app.js?v=19", "/data/series.json?v=19"])
    )
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
    fetch(req)
      .then((res) => {
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
