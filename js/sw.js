const CACHE = "spi-catalogue-v44";

const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./css/styles.css",
  "./js/actions.js",
  "./js/auth.js",
  "./js/init.js",
  "./js/modal.js",
  "./js/pwa.js",
  "./js/render.js",
  "./js/storage.js"
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

    const targetUrl = sharedUrl || sharedText || "";

    // ── SÉCURITÉ : valider le schéma avant de rediriger ──────────
    let safeTargetUrl = "";
    if(targetUrl){
      try {
        const parsed = new URL(targetUrl);
        if(parsed.protocol === "https:" || parsed.protocol === "http:"){
          safeTargetUrl = parsed.href;
        }
      } catch(e) {}
    }

    // Rediriger vers index.html à la racine (GitHub Pages)
    const redirectTo = "/Catalogue-Electrique/index.html";
    const qs = new URLSearchParams();
    if(safeTargetUrl)  qs.set("share_url",   safeTargetUrl);
    if(sharedTitle)    qs.set("share_title", sharedTitle.substring(0, 200));

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