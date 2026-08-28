  // Retire "_swupdate" de la barre d'adresse une fois son rôle (forcer la
  // navigation après mise à jour, voir plus bas) rempli — même traitement
  // que "_authreload" dans js/auth.js. replaceState ne déclenche pas de
  // nouveau rechargement, juste un nettoyage silencieux de l'URL affichée ;
  // les autres paramètres éventuels (ex. ?share_url=...) sont conservés.
  if(window.location.search.indexOf('_swupdate=') !== -1){
    var _swCleanParams = new URLSearchParams(window.location.search);
    _swCleanParams.delete('_swupdate');
    var _swCleanQs = _swCleanParams.toString();
    window.history.replaceState({}, document.title,
      window.location.pathname + (_swCleanQs ? '?' + _swCleanQs : '') + window.location.hash);
  }

  // ── Version installée (affichée dans Réglages) ─────────────────────
  // Retour utilisateur : pouvoir vérifier soi-même si la dernière version
  // du Service Worker est bien chargée, sans passer par les outils
  // développeur. "Version installée" = nom du cache actuellement ouvert
  // par le SW réellement aux commandes (caches.keys() reflète l'état
  // réel du navigateur, indépendamment de tout ce qu'affiche le code —
  // activate() dans sw.js supprime tout cache autre que l'actif, donc un
  // seul nom "spi-catalogue-v…" doit normalement subsister). Comparée à
  // la dernière version réellement déployée, récupérée via un fetch de
  // sw.js qui ignore le cache HTTP du navigateur — même raison que
  // { cache: 'reload' } au préchargement dans sw.js : sans ça, la
  // comparaison pourrait se faire contre une copie de sw.js elle-même
  // périmée dans le cache HTTP (max-age=600 sur GitHub Pages).
  window._refreshAppVersionInfo = async function(){
    var activeEl   = document.getElementById('appVersionActive');
    var updateRow  = document.getElementById('appVersionUpdateRow');
    if(!activeEl) return;
    activeEl.textContent = '…';
    if(updateRow) updateRow.style.display = 'none';

    var activeVersion = null;
    try{
      if('caches' in window){
        var keys = await caches.keys();
        var swKey = keys.find(function(k){ return k.indexOf('spi-catalogue-v') === 0; });
        if(swKey) activeVersion = swKey.slice('spi-catalogue-v'.length);
      }
    }catch(e){}
    activeEl.textContent = activeVersion || 'inconnue';

    try{
      var r = await fetch('sw.js', { cache: 'reload' });
      if(r.ok){
        var text = await r.text();
        var m = text.match(/spi-catalogue-v(\d+)/);
        if(m && activeVersion && m[1] !== activeVersion && updateRow){
          updateRow.style.display = 'flex';
        }
      }
    }catch(e){}
  };

  // ── Enregistrement du service worker ──────────────────────────────
  // Sans cet appel, sw.js n'est jamais activé : ni le cache hors-ligne,
  // ni l'interception de /share-target (partage natif Android) ne fonctionnent.
  // sw.js doit rester à la racine du site : un service worker ne peut jamais
  // couvrir une portée plus large que le dossier où se trouve son fichier
  // (limitation du navigateur, pas contournable sans en-tête serveur dédié —
  // indisponible sur un hébergement statique comme GitHub Pages).
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      // updateViaCache:'none' → GitHub Pages sert sw.js avec Cache-Control:
      // max-age=600 (pas d'en-tête custom possible sur cet hébergement) ;
      // sans cette option, une vérification de mise à jour survenant moins
      // de 10 min après la précédente pouvait recevoir la copie mise en
      // cache localement par le navigateur au lieu d'aller revérifier
      // auprès du serveur, et ne jamais voir la nouvelle version.
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function(reg){
        // ── Notification de mise à jour (pas de rechargement automatique) ──
        // sw.js appelle déjà self.skipWaiting() + self.clients.claim() côté
        // worker, donc la nouvelle version prend la main en arrière-plan dès
        // qu'elle est détectée — mais on ne recharge JAMAIS la page tout
        // seul, quelle que soit la situation (fenêtre ouverte ou non,
        // configurateur en cours ou non) : ça reste toujours un choix de
        // l'utilisateur, via le bouton "Mettre à jour" ou un F5 manuel. La
        // bannière reste affichée jusqu'à ce que l'un des deux arrive.
        var swUpdateBanner = document.getElementById('swUpdateBanner');
        var swUpdateBtn    = document.getElementById('swUpdateBtn');
        // Positionne la bannière juste sous le header plutôt qu'un top:12px
        // fixe en dur — sur mobile/tablette elle se retrouvait collée tout en
        // haut de l'écran, par-dessus le header (retour utilisateur, capture
        // à l'appui). Même technique que _positionToastStack() (js/storage.js).
        function _positionUpdateBanner(){
          if(!swUpdateBanner) return;
          var header = document.querySelector('header');
          var top = header ? header.getBoundingClientRect().bottom + 12 : 12;
          swUpdateBanner.style.top = top + 'px';
        }
        navigator.serviceWorker.addEventListener('controllerchange', function(){
          if(swUpdateBanner){
            _positionUpdateBanner();
            swUpdateBanner.style.display = 'flex';
          }
        });
        window.addEventListener('resize', _positionUpdateBanner);
        if(swUpdateBtn){
          swUpdateBtn.addEventListener('click', async function(){
            // Réutilise les mêmes détections de saisie non enregistrée que
            // celles déjà utilisées pour confirmer une fermeture au clic/Échap
            // (formulaire produit, caractéristiques techniques, configurateur
            // d'armoire) — un clic manuel sur "Mettre à jour" ne doit pas
            // faire perdre en silence ce que ces fenêtres protègent déjà.
            var warnings = [];
            var mo = document.getElementById('modalOverlay');
            if(mo && mo.classList.contains('open') && typeof hasUnsavedInput === 'function' && hasUnsavedInput()){
              warnings.push('le formulaire produit en cours');
            }
            var so = document.getElementById('specsOverlay');
            if(so && so.style.display !== 'none' && typeof _specsHasChanges === 'function' && _specsHasChanges()){
              warnings.push('les caractéristiques techniques en cours');
            }
            if(Array.isArray(window._armoireDraft) && window._armoireDraft.length > 0){
              warnings.push('la configuration d\'armoire en cours');
            }
            if(warnings.length && typeof customConfirm === 'function'){
              var ok = await customConfirm(
                'Modifications non enregistrées',
                'Mettre à jour maintenant effacera : ' + warnings.join(', ') + '. Continuer ?',
                { okLabel: 'Mettre à jour quand même', danger: true }
              );
              if(!ok) return;
            }
            // location.reload() peut laisser une PWA en mode standalone
            // (ajoutée à l'écran d'accueil, notamment iOS) sur un état
            // figé/blanc une fois le nouveau service worker aux commandes —
            // obligeant à fermer complètement l'app puis la rouvrir pour
            // voir la mise à jour (retour utilisateur). Réassigner
            // location.href vers l'URL EXACTEMENT identique s'est révélé
            // insuffisant en pratique (retour utilisateur : toujours besoin
            // d'un F5 manuel sur desktop, et de fermer l'app sur mobile) —
            // plusieurs navigateurs traitent une navigation vers une URL
            // rigoureusement identique comme un no-op silencieux. Un
            // paramètre de requête inédit force une navigation non ambiguë ;
            // location.replace() (pas .href=) évite d'empiler une entrée
            // d'historique pour ce simple rechargement. Ajouté (pas
            // substitué) aux paramètres déjà présents (ex. ?share_url=...
            // venant d'un partage natif, voir /share-target dans sw.js) pour
            // ne pas les perdre silencieusement au passage.
            // URLSearchParams.set() REMPLACE une éventuelle valeur déjà
            // présente (plutôt qu'une concaténation manuelle) — sans ça,
            // chaque mise à jour ajoutait un nouveau "_swupdate=…" à la
            // suite des précédents au lieu de le remplacer, et l'URL
            // grossissait indéfiniment (même bug que _authreload dans
            // js/auth.js, retour utilisateur).
            var _swParams = new URLSearchParams(window.location.search);
            _swParams.set('_swupdate', Date.now());
            window.location.replace(
              window.location.pathname + '?' + _swParams.toString() + window.location.hash
            );
          });
        }

        // Vérifier explicitement les mises à jour à chaque retour au
        // premier plan — un onglet/PWA resté en arrière-plan plusieurs
        // jours ne revérifie pas sw.js tout seul avant la prochaine
        // navigation complète.
        document.addEventListener('visibilitychange', function(){
          if(document.visibilityState === 'visible') reg.update().catch(function(){});
        });
        // ET aussi à intervalle régulier — visibilitychange ne se déclenche
        // que si l'utilisateur change d'onglet/d'appli puis revient. Un
        // onglet resté ouvert et au premier plan en continu (jamais changé
        // de fenêtre) ne revérifiait donc jamais tout seul, obligeant à un
        // F5 pour voir apparaître la bannière de mise à jour alors que
        // l'onglet n'a jamais quitté le premier plan (retour utilisateur).
        setInterval(function(){
          if(document.visibilityState === 'visible') reg.update().catch(function(){});
        }, 30 * 60 * 1000); // 30 min
      }).catch(function(e){
        console.warn('[PWA] Échec enregistrement service worker:', e.message);
      });
    });
  }

  // ── Popup installation PWA ────────────────────────────────────────
  (function(){
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;
    if(isStandalone) return;

    // La bannière ne s'impose qu'une seule fois : dès qu'elle est fermée
    // (croix, "Plus tard", "Compris" iOS, ou tentative d'installation), on
    // ne la reproposera plus toute seule (retour utilisateur — avant ça
    // elle réapparaissait à chaque rechargement/visite). Une petite bulle
    // façon "Ajouter un produit" reste ensuite disponible dans le coin pour
    // la rouvrir manuellement si l'utilisateur change d'avis plus tard.
    var DISMISS_KEY = 'pwa_install_banner_dismissed';
    var alreadyDismissed = !!localStorage.getItem(DISMISS_KEY);
    function markDismissed(){
      try{ localStorage.setItem(DISMISS_KEY, '1'); }catch(e){}
    }

    var banner       = document.getElementById('pwaInstallBanner');
    var androidZone  = document.getElementById('pwaAndroidZone');
    var iosZone      = document.getElementById('pwaIOSZone');
    var btnInstall   = document.getElementById('pwaInstallBtn');
    var btnLater     = document.getElementById('pwaInstallLater');
    var btnClose     = document.getElementById('pwaInstallClose');
    var btnIOSClose  = document.getElementById('pwaIOSClose');
    var btnBubble    = document.getElementById('btnFabInstall');
    var deferredPrompt = null;

    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    function showBanner(){
      if(btnBubble) btnBubble.style.display = 'none';
      banner.style.display = 'flex';
      if(isIOS){
        iosZone.style.display = 'block';
      } else if(deferredPrompt){
        androidZone.style.display = 'block';
      } else {
        // Android sans prompt encore disponible : afficher quand même
        // androidZone s'affichera dès que beforeinstallprompt se déclenche
        androidZone.style.display = 'block';
      }
    }
    function hideBanner(){
      banner.style.display = 'none';
    }
    function showBubble(){
      if(btnBubble) btnBubble.style.display = 'flex';
    }

    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault();
      deferredPrompt = e;
      if(banner.style.display === 'flex'){
        androidZone.style.display = 'block';
      }
    });

    if(alreadyDismissed){
      showBubble();
    } else {
      setTimeout(showBanner, 3000);
    }

    btnClose.addEventListener('click', function(){ hideBanner(); markDismissed(); showBubble(); });
    if(btnLater)    btnLater.addEventListener('click', function(){ hideBanner(); markDismissed(); showBubble(); });
    if(btnIOSClose) btnIOSClose.addEventListener('click', function(){ hideBanner(); markDismissed(); showBubble(); });
    if(btnBubble)   btnBubble.addEventListener('click', showBanner);

    if(btnInstall){
      btnInstall.addEventListener('click', function(){
        hideBanner();
        markDismissed();
        if(deferredPrompt){
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(){ deferredPrompt = null; });
        } else {
          showBubble();
        }
      });
    }

    window.addEventListener('appinstalled', function(){
      hideBanner();
      markDismissed();
      if(btnBubble) btnBubble.style.display = 'none';
    });
  })();
