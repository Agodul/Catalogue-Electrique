const CACHE = "spi-catalogue-v2";

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
  // Supprimer les anciens caches
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
  // iOS envoie un GET vers /Catalogue-Electrique/share-target?url=...
  if(url.pathname.includes("share-target")){
    const sharedUrl   = url.searchParams.get("url")   || "";
    const sharedTitle = url.searchParams.get("title") || "";
    const sharedText  = url.searchParams.get("text")  || "";

    // Extraire la meilleure URL parmi les paramètres
    const targetUrl = sharedUrl || sharedText || "";

    // Rediriger vers l'app avec l'URL en paramètre
    const redirectTo = new URL("/Catalogue-Electrique/", self.location.origin);
    if(targetUrl) redirectTo.searchParams.set("share_url", targetUrl);
    if(sharedTitle) redirectTo.searchParams.set("share_title", sharedTitle);

    event.respondWith(
      Response.redirect(redirectTo.toString(), 302)
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