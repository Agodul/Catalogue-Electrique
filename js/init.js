// ---------- Init ----------
  load();
  render();
  // S'assurer que catalogueWrap est caché et homePage visible au démarrage
  var _cw = document.getElementById('catalogueWrap');
  var _hp = document.getElementById('homePage');
  if(_cw) _cw.style.display = 'none';
  if(_hp) _hp.classList.remove('hidden');
  showHome();

  // Afficher le splash uniquement au premier démarrage (pas au F5)
  var splash = document.getElementById('app-splash');
  if(splash){
    var isFirstLoad = !sessionStorage.getItem('app_started');
    if(isFirstLoad){
      sessionStorage.setItem('app_started', '1');
      // La vidéo se ferme seule à la fin via onended
      // Fallback si la vidéo ne démarre pas (3s max)
      setTimeout(function(){
        if(document.getElementById('app-splash')){
          splash.classList.add('hide');
          document.body.classList.remove('splash-active');
          setTimeout(function(){
            if(splash.parentNode) splash.parentNode.removeChild(splash);
          }, 400);
        }
      }, 5000);
    } else {
      // F5 ou rechargement → supprimer immédiatement
      if(splash.parentNode) splash.parentNode.removeChild(splash);
    }
  }

  // Restaurer "Voir tout le catalogue" si actif avant F5
  if(sessionStorage.getItem('cat_view_all') === '1'){
    setTimeout(function(){
      if(typeof showCatalogueAll === 'function') showCatalogueAll();
    }, 100);
  }

  tryReconnectOnLoad();

  // ── Auth ────────────────────────────────────────────────────────
  if(typeof initAuth === 'function') initAuth();

  // ── Share Target iOS/Android (PWA) ───────────────────────────────
  (function handleShareTarget(){
    var params     = new URLSearchParams(window.location.search);
    var shareUrl   = params.get('share_url');
    var shareTitle = params.get('share_title');
    if(!shareUrl) return;

    // ── SÉCURITÉ : valider l'URL avant tout traitement ───────────
    try {
      var parsed = new URL(shareUrl);
      // N'accepter que http:// et https://
      if(parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        console.warn('[ShareTarget] URL rejetée (protocole non autorisé):', parsed.protocol);
        showToast('URL partagée invalide', 'err', 4000);
        return;
      }
      // Reconstruire l'URL depuis l'objet parsé (évite les injections via fragments malformés)
      shareUrl = parsed.href;
    } catch(e) {
      console.warn('[ShareTarget] URL malformée rejetée:', shareUrl);
      showToast('URL partagée invalide', 'err', 4000);
      return;
    }

    // Nettoyer l'URL du navigateur
    window.history.replaceState({}, document.title, window.location.pathname);

    setTimeout(function(){
      // Bloquer si non connecté
      if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()){
        showToast('Connexion requise pour ajouter un produit', 'warn', 4000);
        return;
      }
      // Basculer vers le catalogue si on est sur l'accueil
      if(homePage && !homePage.classList.contains('hidden')){
        showCatalogueAll();
      }
      // Ouvrir la modale d'ajout
      openModal(null);

      setTimeout(function(){
        if(fUrl) fUrl.value = shareUrl;
        if(shareTitle && fName) fName.value = escapeHtml ? shareTitle.substring(0, 200) : shareTitle;
        switchTab('auto');
        showToast('Récupération de la page en cours…', 'ok', 3000);

        // ── Extraction automatique via proxies ─────────────────────
        var shareProxies = [
          'https://api.allorigins.win/get?url=' + encodeURIComponent(shareUrl),
          'https://corsproxy.io/?' + encodeURIComponent(shareUrl),
          'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(shareUrl)
        ];

        function tryShareProxy(idx){
          if(idx >= shareProxies.length){
            showToast('Extraction impossible — collez le code source manuellement', 'warn', 5000);
            return;
          }
          fetch(shareProxies[idx])
            .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
            .then(function(text){
              var html = text;
              try{ var j=JSON.parse(text); if(j.contents) html=j.contents; }catch(e){}
              if(!html || html.length < 100) throw new Error('Contenu vide');
              if(html.indexOf('&lt;') !== -1 && html.indexOf('<html') === -1){
                var ta = document.createElement('textarea');
                ta.innerHTML = html;
                html = ta.value;
              }
              fHtml.value = html;
              fUrl.value  = shareUrl;
              document.getElementById('btnExtract').click();
              showToast('Extraction réussie via partage ✓', 'ok', 3500);
            })
            .catch(function(){ tryShareProxy(idx+1); });
        }

        tryShareProxy(0);

      }, 350);
    }, 600);
  })();
  // showHome() déjà appelé en début d'init

  // ═══════════════════════════════════════════════════════════════
  //  EXTENSION CHROME — Injection via localStorage
  //  Le content script de l'extension écrit le HTML complet de la
  //  page fournisseur dans localStorage, puis déclenche cet événement.
  //  L'app reprend exactement le même pipeline que "Coller le code source".
  // ═══════════════════════════════════════════════════════════════
  function triggerExtensionExtraction(){
    // Bloquer si non connecté
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()){
      showToast('Connexion requise pour importer via l\'extension', 'warn', 4000);
      return;
    }
    var html = '';
    var url  = '';
    try{
      html = localStorage.getItem('cat_pending_html') || '';
      url  = localStorage.getItem('cat_pending_url')  || '';
      var ts = parseInt(localStorage.getItem('cat_pending_ts') || '0', 10);
      // Ignorer si données trop vieilles (> 5 min)
      if(!html || (Date.now() - ts) > 5 * 60 * 1000) return;
      // Nettoyer immédiatement pour éviter un double-déclenchement
      localStorage.removeItem('cat_pending_html');
      localStorage.removeItem('cat_pending_url');
      localStorage.removeItem('cat_pending_ts');
    }catch(e){ return; }

    // ── SÉCURITÉ : valider l'URL provenant du localStorage ───────
    if(url){
      try {
        var parsedUrl = new URL(url);
        if(parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:'){
          console.warn('[Extension] URL rejetée (protocole non autorisé):', parsedUrl.protocol);
          url = '';
        } else {
          url = parsedUrl.href;
        }
      } catch(e) {
        console.warn('[Extension] URL malformée ignorée');
        url = '';
      }
    }

    // Nettoyer le flag bridge dans l'URL
    if(window.location.search.includes('cat_bridge=1')){
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Ouvrir la modale, injecter le HTML dans le textarea, déclencher l'extraction
    setTimeout(function(){
      openModal(null);
      setTimeout(function(){
        fHtml.value = html;
        fUrl.value  = url;
        // Déclencher le même bouton que le copier-coller manuel
        document.getElementById('btnExtract').click();
        showToast('Extraction depuis l\'extension Chrome ✓', 'ok', 3500);
      }, 300);
    }, 700);
  }

  // Cas 1 : catalogue déjà ouvert → le content script envoie un CustomEvent
  window.addEventListener('spi_extension_ready', function(){
    triggerExtensionExtraction();
  });

  // Cas 2 : catalogue vient d'être ouvert avec ?cat_bridge=1
  // Le content script écrit dans localStorage puis dispatch spi_extension_ready
  // → déjà géré par l'écouteur ci-dessus, rien de plus nécessaire ici.
  // ── Gestionnaire centralisé Escape + blocage clic extérieur ──────
  // Chaque entrée : [overlayId, closeBtnId ou nomFonction]
  // La fermeture se fait toujours via le bouton close (réutilise la logique existante)
  ;(function _initModalEscape(){
    var MODALS = [
      { overlay: 'pdfViewerOverlay',  close: 'pdfViewerClose'  },
      { overlay: 'viewOverlay',       close: 'vmCloseBtn',      classList: true },
      { overlay: 'docOverlay',        close: 'docCloseBtn'      },
      { overlay: 'priceModalOverlay', close: 'priceModalClose'  },
      { overlay: 'conflictOverlay',   close: 'conflictClose'    },
      { overlay: 'whatsNewOverlay',   close: 'btnWNClose'       },
      { overlay: 'reqDetailOverlay',  close: 'reqDetailClose'   },
      { overlay: 'compareOverlay',    close: 'compareClose',    classList: true },
      { overlay: 'iconPickerModal',   close: 'iconPickerClose', classList: true },
    ];

    function isVisible(el){
      if(!el) return false;
      var s = el.style.display;
      // gère display:flex/block et classList .open/.show
      if(s && s !== 'none') return true;
      if(el.classList.contains('open') || el.classList.contains('show')) return true;
      return false;
    }

    function triggerClose(closeId){
      var btn = document.getElementById(closeId);
      if(btn) btn.click();
    }

    // Escape : ferme la modale la plus haute (z-index) visible
    document.addEventListener('keydown', function(e){
      if(e.key !== 'Escape') return;
      // Trier par z-index décroissant pour fermer la plus haute en premier
      var visible = MODALS.filter(function(m){
        return isVisible(document.getElementById(m.overlay));
      }).sort(function(a, b){
        var za = parseInt((document.getElementById(a.overlay)||{style:{}}).style.zIndex) || 0;
        var zb = parseInt((document.getElementById(b.overlay)||{style:{}}).style.zIndex) || 0;
        return zb - za;
      });
      if(visible.length > 0) triggerClose(visible[0].close);
    });

    // Bloquer le clic extérieur sur tous les overlays listés
    MODALS.forEach(function(m){
      var overlay = document.getElementById(m.overlay);
      if(!overlay) return;
      overlay.addEventListener('click', function(e){
        // Bloquer — ne rien faire si on clique en dehors de la modale
        e.stopPropagation();
      });
    });
  })();

  // ── Initialiser la bottom nav et le bottom sheet ──
  if(typeof window._initFilterSheet === 'function') window._initFilterSheet();
  if(typeof window._initBottomNav   === 'function') window._initBottomNav();
  if(typeof window._initMenuSheet   === 'function') window._initMenuSheet();

  // ── Bloquer le menu contextuel (clic droit / appui long) et le drag sur les images ──
  document.addEventListener('contextmenu', function(e){
    if(e.target && e.target.tagName === 'IMG') e.preventDefault();
  });
  document.addEventListener('dragstart', function(e){
    if(e.target && e.target.tagName === 'IMG') e.preventDefault();
  });

