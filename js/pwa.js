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
        navigator.serviceWorker.addEventListener('controllerchange', function(){
          if(swUpdateBanner) swUpdateBanner.style.display = 'flex';
        });
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
            window.location.reload();
          });
        }

        // Vérifier explicitement les mises à jour à chaque retour au
        // premier plan — un onglet/PWA resté en arrière-plan plusieurs
        // jours ne revérifie pas sw.js tout seul avant la prochaine
        // navigation complète.
        document.addEventListener('visibilitychange', function(){
          if(document.visibilityState === 'visible') reg.update().catch(function(){});
        });
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
