  // ── Enregistrement du service worker ──────────────────────────────
  // Sans cet appel, sw.js n'est jamais activé : ni le cache hors-ligne,
  // ni l'interception de /share-target (partage natif Android) ne fonctionnent.
  // sw.js doit rester à la racine du site : un service worker ne peut jamais
  // couvrir une portée plus large que le dossier où se trouve son fichier
  // (limitation du navigateur, pas contournable sans en-tête serveur dédié —
  // indisponible sur un hébergement statique comme GitHub Pages).
  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(e){
        console.warn('[PWA] Échec enregistrement service worker:', e.message);
      });
    });
  }

  // ── Popup installation PWA ────────────────────────────────────────
  (function(){
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;
    if(isStandalone) return;

    var banner       = document.getElementById('pwaInstallBanner');
    var androidZone  = document.getElementById('pwaAndroidZone');
    var iosZone      = document.getElementById('pwaIOSZone');
    var btnInstall   = document.getElementById('pwaInstallBtn');
    var btnLater     = document.getElementById('pwaInstallLater');
    var btnClose     = document.getElementById('pwaInstallClose');
    var btnIOSClose  = document.getElementById('pwaIOSClose');
    var deferredPrompt = null;

    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    function showBanner(){
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

    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault();
      deferredPrompt = e;
      if(banner.style.display === 'flex'){
        androidZone.style.display = 'block';
      }
    });

    setTimeout(showBanner, 3000);

    btnClose.addEventListener('click', hideBanner);
    if(btnLater)   btnLater.addEventListener('click', hideBanner);
    if(btnIOSClose) btnIOSClose.addEventListener('click', hideBanner);

    if(btnInstall){
      btnInstall.addEventListener('click', function(){
        hideBanner();
        if(deferredPrompt){
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(){ deferredPrompt = null; });
        }
      });
    }

    window.addEventListener('appinstalled', hideBanner);
  })();
