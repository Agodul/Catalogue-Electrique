// sw.js — Service Worker Catalogue Électrique SPI
const CACHE_NAME = 'catalogue-elec-v1';

// Fichiers à mettre en cache pour le fonctionnement hors-ligne
const ASSETS = [
  './Catalogue_Electrique.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.10.0/dist/tabler-icons.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Installation : mise en cache des ressources essentielles
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('SW: mise en cache initiale');
      // On cache ce qu'on peut, on ignore les erreurs réseau
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(() => console.warn('Impossible de cacher:', url)))
      );
    })
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// Fetch : stratégie "cache d'abord, réseau en fallback"
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        // On met à jour le cache avec la nouvelle réponse
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(function() {
        // Hors-ligne et pas dans le cache : renvoyer le HTML principal
        if (event.request.destination === 'document') {
          return caches.match('./Catalogue_Electrique.html');
        }
      });
    })
  );
});
