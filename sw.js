// Changer cette valeur est ce qui déclenche la mise à jour du Service
// Worker chez les visiteurs (voir js/pwa.js) — nécessaire à chaque
// déploiement où un fichier listé dans FILES ci-dessous a changé. Ne pas
// incrémenter à la main : lancer ./bump-sw-version.sh (à la racine du
// projet) juste avant de déployer, qui calcule et écrit un nouveau numéro
// automatiquement à partir de la date/heure courante.
const CACHE = "spi-catalogue-v20260903172838";

// Cache SÉPARÉ pour les bibliothèques auto-hébergées (FILES_DEFERRED plus
// bas), et versionné par leur CONTENU et non par la date du déploiement :
// elles pèsent 3,3 Mo et ne changent qu'à une montée de version, bien plus
// rarement que le code de l'application. Les ranger dans le cache principal
// les aurait fait retélécharger intégralement à CHAQUE déploiement, puisque
// l'activation purge tout cache dont le nom ne correspond plus. Le numéro
// ci-dessous est réécrit par ./bump-sw-version.sh à partir d'une empreinte
// des fichiers eux-mêmes : il ne bouge que s'ils bougent.
// >>> CACHE_LIBS >>>
const CACHE_LIBS = "spi-catalogue-libs-4408a0c18815f3b4";
// <<< CACHE_LIBS <<<

// ── Listes de précache ───────────────────────────────────────────────────
// GÉNÉRÉES AUTOMATIQUEMENT — ne rien modifier à la main entre les marqueurs
// « >>> » et « <<< » : ./bump-sw-version.sh réécrit tout ce qui s'y trouve à
// partir du contenu réel du disque, à chaque déploiement.
//
// Cette liste était recopiée à la main, et elle avait dérivé dans les deux
// sens : elle réclamait un assets/splash-mobile.mp4 qui n'existe pas (404 à
// chaque installation, absorbé en silence par allSettled), et elle oubliait
// les cinq bibliothèques auto-hébergées — donc export Excel, export ZIP et
// visionneuse PDF indisponibles hors ligne tant qu'ils n'avaient pas été
// utilisés au moins une fois en ligne, ce qui contredit la promesse d'une
// application installable. `node tools/check.mjs` vérifie désormais que ces
// listes et le disque disent la même chose.
//
// Deux listes, pas une :
//   FILES          — la coque de l'application (~700 Ko). Téléchargée avant
//                    que le nouveau service worker ne prenne la main.
//   FILES_DEFERRED — les bibliothèques lourdes (~3,3 Mo : PDF.js, SheetJS,
//                    ExcelJS, JSZip). Téléchargées APRÈS l'activation, sans
//                    la retarder : les faire passer dans l'installation
//                    ajouterait 3,3 Mo d'attente à chaque mise à jour, pour
//                    des fonctionnalités qu'on n'ouvre pas à chaque visite.

// >>> FILES >>>
const FILES = [
  "./",
  "./assets/apple-touch-icon.png",
  "./assets/favicon.ico",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icons/families/svg-accessoire.png",
  "./assets/icons/families/svg-alimentation.png",
  "./assets/icons/families/svg-amplificateur.png",
  "./assets/icons/families/svg-armoire.png",
  "./assets/icons/families/svg-barriere-immaterielle.png",
  "./assets/icons/families/svg-boite-a-bouton.png",
  "./assets/icons/families/svg-borne.png",
  "./assets/icons/families/svg-bouton.png",
  "./assets/icons/families/svg-bride.png",
  "./assets/icons/families/svg-cable-de-liaison.png",
  "./assets/icons/families/svg-cable-de-raccordement.png",
  "./assets/icons/families/svg-cable-moteur-brushless.png",
  "./assets/icons/families/svg-capteur-magnetique.png",
  "./assets/icons/families/svg-capteur-pneumatique.png",
  "./assets/icons/families/svg-capteur.png",
  "./assets/icons/families/svg-carte-entree-plc.png",
  "./assets/icons/families/svg-carte-entree-securite.png",
  "./assets/icons/families/svg-carte-relais-securite.png",
  "./assets/icons/families/svg-carte-sortie-plc.png",
  "./assets/icons/families/svg-carte-sortie-securite.png",
  "./assets/icons/families/svg-chemin-de-cable.png",
  "./assets/icons/families/svg-climatisation.png",
  "./assets/icons/families/svg-colonne-lumineuse.png",
  "./assets/icons/families/svg-communication-reseau.png",
  "./assets/icons/families/svg-connecteur-confectionnables.png",
  "./assets/icons/families/svg-contact-auxiliaire.png",
  "./assets/icons/families/svg-contact-de-porte.png",
  "./assets/icons/families/svg-contacteur.png",
  "./assets/icons/families/svg-controleur-cobot.png",
  "./assets/icons/families/svg-controleur-de-securite.png",
  "./assets/icons/families/svg-controleur.png",
  "./assets/icons/families/svg-disjoncteur.png",
  "./assets/icons/families/svg-eclairage.png",
  "./assets/icons/families/svg-ecran.png",
  "./assets/icons/families/svg-electrovanne.png",
  "./assets/icons/families/svg-fibre-optique.png",
  "./assets/icons/families/svg-generique.png",
  "./assets/icons/families/svg-goulotte.png",
  "./assets/icons/families/svg-identification.png",
  "./assets/icons/families/svg-interrupteur-sectionneur.png",
  "./assets/icons/families/svg-lecteur-code.png",
  "./assets/icons/families/svg-master.png",
  "./assets/icons/families/svg-moteur-brushless.png",
  "./assets/icons/families/svg-plc.png",
  "./assets/icons/families/svg-presse-etoupe.png",
  "./assets/icons/families/svg-prise.png",
  "./assets/icons/families/svg-rail-din.png",
  "./assets/icons/families/svg-reducteur.png",
  "./assets/icons/families/svg-relais-de-securite.png",
  "./assets/icons/families/svg-relais.png",
  "./assets/icons/families/svg-repartiteur.png",
  "./assets/icons/families/svg-repartiteurs-en-y.png",
  "./assets/icons/families/svg-robot-collaboratif.png",
  "./assets/icons/families/svg-robot.png",
  "./assets/icons/families/svg-router.png",
  "./assets/icons/families/svg-switch.png",
  "./assets/icons/families/svg-variateur.png",
  "./assets/icons/families/svg-ventilateur.png",
  "./assets/icons/families/svg-vision.png",
  "./assets/splash.mp4",
  "./assets/three-d-badge.png",
  "./css/styles.css",
  "./index.html",
  "./js/actions-backup.js",
  "./js/actions-compare.js",
  "./js/actions-conflicts.js",
  "./js/actions-core.js",
  "./js/actions-editlock.js",
  "./js/actions-home.js",
  "./js/actions-import-export.js",
  "./js/actions-mobile-chrome.js",
  "./js/actions-save.js",
  "./js/actions-search.js",
  "./js/actions-settings-nav.js",
  "./js/actions-settings-sync.js",
  "./js/actions-sync-core.js",
  "./js/armoireConfig.js",
  "./js/auth.js",
  "./js/familyIcons.js",
  "./js/init.js",
  "./js/modal-autocomplete.js",
  "./js/modal-browse-catalogue.js",
  "./js/modal-core.js",
  "./js/modal-editlock-heartbeat.js",
  "./js/modal-extraction.js",
  "./js/modal-price-history-form.js",
  "./js/modal-ref-duplicate.js",
  "./js/modal-request-review.js",
  "./js/modal-spareparts-form.js",
  "./js/modal-spareparts-suggestions-dnd.js",
  "./js/modal-specs-editor.js",
  "./js/modal-suggestions-autocomplete.js",
  "./js/modal-tabs-price-zone.js",
  "./js/modal-tag-suggestions.js",
  "./js/popup.js",
  "./js/pwa.js",
  "./js/render-card-grid.js",
  "./js/render-documents.js",
  "./js/render-pdf-viewer.js",
  "./js/render-price-helpers.js",
  "./js/render-view-modal-close.js",
  "./js/render-view-modal.js",
  "./js/requests.js",
  "./js/storage.js",
  "./js/templates.js",
  "./manifest.webmanifest",
];
// <<< FILES <<<

// >>> FILES_DEFERRED >>>
const FILES_DEFERRED = [
  "./js/exceljs.min.js",
  "./js/jszip.min.js",
  "./js/pdf.min.js",
  "./js/pdf.worker.min.js",
  "./js/xlsx.full.min.js",
];
// <<< FILES_DEFERRED <<<

// Chemins de FILES_DEFERRED résolus une fois en URL absolues, pour pouvoir
// les reconnaître dans le gestionnaire fetch ci-dessous.
const LIB_URLS = new Set(FILES_DEFERRED.map(f => new URL(f, self.location.href).href));

self.addEventListener("install", event => {
  // Précharger les fichiers statiques en parallèle
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      // Cacher tous les fichiers sauf la vidéo (qui nécessite un traitement spécial)
      const videoFiles = FILES.filter(f => f.endsWith('.mp4') || f.endsWith('.webm'));
      const otherFiles = FILES.filter(f => !f.endsWith('.mp4') && !f.endsWith('.webm'));

      // cache.add(f) respecte le cache HTTP normal du navigateur — sur
      // GitHub Pages (max-age=600 sur les fichiers statiques), un fichier
      // déjà chargé dans les 10 dernières minutes revenait tel quel depuis
      // ce cache HTTP au lieu d'être vraiment retéléchargé, même une fois
      // le numéro de CACHE ci-dessus incrémenté et ce nouveau Service
      // Worker installé — la seule façon fiable de voir la vraie nouvelle
      // version restait un Ctrl+Shift+R (qui vide aussi le cache HTTP), pas
      // le bouton "Mettre à jour" normal de l'app (retour utilisateur :
      // "faut que lorsqu'on clique sur mise à jour ça applique vraiment
      // comme pour une vraie app"). { cache: 'reload' } force un fetch
      // réseau réel pour chaque fichier, en ignorant ce cache HTTP.
      const cacheOthers = Promise.allSettled(otherFiles.map(f =>
        fetch(f, { cache: 'reload' })
          .then(res => { if(res.ok) return cache.put(f, res); })
          .catch(() => null)
      ));

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
  // Tout dans un seul waitUntil, dans cet ordre précis :
  //
  //   1. purge des anciens caches
  //   2. clients.claim() — la page est contrôlée par ce worker à partir d'ici
  //   3. téléchargement des bibliothèques lourdes (FILES_DEFERRED)
  //
  // clients.claim() était appelé HORS de waitUntil : rien ne garantissait
  // qu'il aboutisse avant que le navigateur ne mette le worker en veille.
  // Et l'étape 3 vient bien après, pour ne rien retarder : la page fonctionne
  // dès l'étape 2, les 3,3 Mo se téléchargent pendant qu'elle est déjà à
  // l'écran. waitUntil garde le worker en vie le temps que ça se termine.
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE && k !== CACHE_LIBS).map(k => caches.delete(k))
    );

    await self.clients.claim();

    const cache = await caches.open(CACHE_LIBS);
    await Promise.allSettled(FILES_DEFERRED.map(async f => {
      // Ne pas retélécharger ce que la version précédente a déjà mis en
      // cache : ces bibliothèques ne changent qu'à une montée de version,
      // beaucoup plus rarement que le code de l'application.
      if (await cache.match(f)) return;
      try {
        const res = await fetch(f, { cache: 'reload' });
        if (res.ok) await cache.put(f, res);
      } catch (e) { /* réessayé au prochain démarrage du worker */ }
    }));
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // ── Bypass : toute requête CROSS-ORIGIN (API serveur, CDN, blob:) passe
  // directement au réseau, sans jamais transiter par le cache du SW. Testé
  // par comparaison d'ORIGINE plutôt que par une liste de noms d'hôtes en
  // dur : l'URL du serveur API est configurable par l'utilisateur (Réglages
  // → voir cat_server_url / serverUrlInput dans actions.js), donc figée à
  // la compilation elle se désynchronisait silencieusement dès qu'un autre
  // serveur était configuré — les requêtes API auraient alors pu être
  // servies depuis le cache du SW (stale-while-revalidate ci-dessous),
  // potentiellement avec des données obsolètes. Toutes les ressources de
  // l'app elle-même (FILES ci-dessus) sont en chemin relatif, donc
  // same-origin — aucune n'est concernée par ce bypass.
  if(event.request.url.startsWith('blob:') || url.origin !== self.location.origin){
    event.respondWith(fetch(event.request));
    return;
  }

  // ── Bibliothèques auto-hébergées : cache d'abord ─────────────
  // Fichiers figés (PDF.js, SheetJS, ExcelJS, JSZip) rangés dans CACHE_LIBS,
  // pas dans le cache principal — donc invisibles pour le
  // stale-while-revalidate plus bas, qui ne regarde que CACHE. Sans cette
  // branche, chaque ouverture de la visionneuse PDF ou de l'export Excel
  // repartait sur le réseau et échouait hors ligne, alors même que le
  // fichier était bien en cache. Cache d'abord et pas de revalidation : le
  // contenu ne change qu'avec le nom du cache (voir CACHE_LIBS).
  if(LIB_URLS.has(url.origin + url.pathname)){
    event.respondWith(
      caches.open(CACHE_LIBS)
        .then(cache => cache.match(url.origin + url.pathname))
        .then(cached => cached || fetch(event.request))
        .catch(() => fetch(event.request))
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
