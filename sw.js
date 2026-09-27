/** Local: stay off. Production: versioned shell, drop leftover caches. */
const CACHE = "dollarvalue-v66";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll([
        "/",
        "/about.html",
        "/styles.css?v=66",
        "/app.js?v=66",
        "/data/series.json?v=66",
        "/manifest.webmanifest",
        "/favicon.ico",
        "/favicon-32.png",
        "/icon-192.png",
        "/apple-touch-icon.png",
      ])
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
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          if (req.mode === "navigate") return caches.match("/");
          return new Response("", { status: 504, statusText: "Offline" });
        })
      )
  );
});
