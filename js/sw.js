const CACHE = "spi-catalogue-v226";

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
  "./js/storage.js",
  "./js/pdf.min.js",
  "./js/pdf.worker.min.js",
  "./assets/splash.mp4"
];

self.addEventListener("install", event => {
  // Précharger les fichiers statiques en parallèle
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return Promise.allSettled(
        FILES.map(f => cache.add(f).catch(() => null))
      );
    }).then(() => self.skipWaiting())
  );
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

  // ── Vidéos : gestion des Range requests depuis le cache ──────────
  if(url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm')){
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(event.request.url); // match sans Range header
        if(!cached) return fetch(event.request);

        const rangeHeader = event.request.headers.get('range');
        if(!rangeHeader) return cached;

        // Gérer la requête Range depuis le blob en cache
        const blob = await cached.blob();
        const total = blob.size;
        const [, start, end] = rangeHeader.match(/bytes=(\d+)-(\d*)/) || [];
        const startByte = parseInt(start) || 0;
        const endByte   = end ? parseInt(end) : total - 1;
        const chunk     = blob.slice(startByte, endByte + 1);

        return new Response(chunk, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Type':  cached.headers.get('Content-Type') || 'video/mp4',
            'Content-Range': 'bytes ' + startByte + '-' + endByte + '/' + total,
            'Content-Length': String(endByte - startByte + 1),
            'Accept-Ranges':  'bytes'
          }
        });
      })
    );
    return;
  }

  // ── Stale-While-Revalidate : cache immédiat + màj en arrière-plan ─
  event.respondWith(
    caches.open(CACHE).then(cache => {
      return cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(network => {
          // Mettre en cache uniquement les réponses valides de même origine
          if(network && network.status === 200 && event.request.method === 'GET'){
            cache.put(event.request, network.clone());
          }
          return network;
        }).catch(() => cached); // Si réseau KO → garder le cache

        // Retourner le cache immédiatement si disponible, sinon attendre le réseau
        return cached || fetchPromise;
      });
    })
  );
});