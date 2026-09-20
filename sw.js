/* Service Worker — Paradas GPS (caché offline) */
const CACHE = "paradas-gps-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./clientes.html",
  "./styles.css",
  "./app.js",
  "./clientes.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);

      // Network first for navigations; cache fallback offline
      if (req.mode === "navigate") {
        return network.then((res) => res || cached || caches.match("./index.html"));
      }
      return cached || network;
    })
  );
});
