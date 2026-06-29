const CACHE = "spi-catalogue-v3";

const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // ── Intercepter le share target ──────────────────────────────────
  if(url.pathname.endsWith("share-target")){
    const sharedUrl   = url.searchParams.get("url")   || "";
    const sharedTitle = url.searchParams.get("title") || "";
    const sharedText  = url.searchParams.get("text")  || "";

    // Prendre la meilleure URL disponible
    const targetUrl = sharedUrl || sharedText || "";

    // Rediriger vers index.html avec les paramètres
    const redirectTo = "/Catalogue-Electrique/index.html";
    const qs = new URLSearchParams();
    if(targetUrl)   qs.set("share_url",   targetUrl);
    if(sharedTitle) qs.set("share_title", sharedTitle);

    event.respondWith(
      Response.redirect(redirectTo + "?" + qs.toString(), 302)
    );
    return;
  }

  // ── Cache-first pour les fichiers statiques ───────────────────────
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});