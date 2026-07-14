const CACHE = "spi-catalogue-v350";

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
  "./js/requests.js",
  "./js/render.js",
  "./js/storage.js",
  "./viewer.html",
  "./assets/splash.mp4",
  "./assets/splash-mobile.mp4"
];

// Origines à ne jamais intercepter (CDN, API externe)
const PASSTHROUGH = [
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'spice-api.spiservices.fr',
  'blob:'
];

self.addEventListener("install", event => {
  // Précharger les fichiers statiques en parallèle
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cacher tous les fichiers sauf la vidéo (qui nécessite un traitement spécial)
      const videoFiles = FILES.filter(f => f.endsWith('.mp4') || f.endsWith('.webm'));
      const otherFiles = FILES.filter(f => !f.endsWith('.mp4') && !f.endsWith('.webm'));

      const cacheOthers = Promise.allSettled(otherFiles.map(f => cache.add(f).catch(() => null)));

      // Vidéo : fetch sans Range header et stocker avec URL absolue comme clé
      const cacheVideos = Promise.allSettled(videoFiles.map(async f => {
        try {
          const absUrl = new URL(f, self.location.href).href;
          const res = await fetch(absUrl, { headers: {} });
          if(res.ok){
            await cache.put(absUrl, res.clone());
          }
        } catch(e) { console.warn('SW video cache failed:', e); }
      }));

      return Promise.allSettled([cacheOthers, cacheVideos]);
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

  // ── Bypass : CDN et API externe passent directement au réseau ───
  if(PASSTHROUGH.some(function(h){ return event.request.url.startsWith('blob:') || url.hostname === h; })){
    event.respondWith(fetch(event.request));
    return;
  }

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

  // ── Vidéos : Range requests depuis le cache ──────────────────
  if(url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm')){
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE);
        const absUrl = url.origin + url.pathname;

        // Chercher dans le cache (ignorer Range header)
        let cached = await cache.match(absUrl, { ignoreSearch: true });

        if(!cached){
          // Pas en cache : fetch complet et stocker
          try {
            const fullReq = new Request(absUrl, { headers: {}, mode: 'cors', credentials: 'same-origin' });
            const netRes  = await fetch(fullReq);
            if(netRes.ok){
              await cache.put(absUrl, netRes.clone());
              cached = netRes;
            }
          } catch(e) {}
        }

        if(!cached) return fetch(event.request).catch(() => new Response('', {status:503}));

        const rangeHeader = event.request.headers.get('range');
        if(!rangeHeader) return cached.clone();

        // Servir le bon chunk
        const blob      = await cached.clone().blob();
        const total     = blob.size;
        const parts     = rangeHeader.replace('bytes=','').split('-');
        const startByte = parseInt(parts[0]) || 0;
        const endByte   = parts[1] ? parseInt(parts[1]) : total - 1;
        const chunk     = blob.slice(startByte, endByte + 1);

        return new Response(chunk, {
          status: 206,
          headers: {
            'Content-Type':   'video/mp4',
            'Content-Range':  'bytes ' + startByte + '-' + endByte + '/' + total,
            'Content-Length': String(endByte - startByte + 1),
            'Accept-Ranges':  'bytes'
          }
        });
      } catch(e) {
        return fetch(event.request).catch(() => new Response('', {status:503}));
      }
    })());
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