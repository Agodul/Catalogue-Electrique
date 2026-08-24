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
      // ── Protection anti-perte : refuser si une fiche produit est déjà
      // en cours d'édition ou de création (modale déjà ouverte) ─────────
      if(_extensionGuardBlocked()) return;
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

  // ── Protection anti-perte partagée (extension + partage) ───────────
  // Ne bloque plus que s'il y a une SAISIE réellement en cours (pas juste
  // une fenêtre restée ouverte sans rien dedans) — mêmes trois zones déjà
  // protégées lors d'une mise à jour du service worker (voir swUpdateBtn
  // dans js/pwa.js) : formulaire produit, caractéristiques techniques,
  // configuration d'armoire en brouillon. Avant, la simple présence de
  // #modalOverlay ouvert (même une fiche "Ajouter un produit" vierge, ou
  // n'importe quelle autre fenêtre — Réglages, Demandes en attente, une
  // fiche produit en simple consultation…) suffisait à tout refuser (retour
  // utilisateur : l'extension/le partage ne devrait pas être bloqué par une
  // fenêtre sans rien en cours). Si rien n'est réellement en cours, ferme
  // tout le reste automatiquement pour laisser la place au nouveau produit.
  function _extensionGuardBlocked(){
    var mo = document.getElementById('modalOverlay');
    if(mo && mo.classList.contains('open') && typeof hasUnsavedInput === 'function' && hasUnsavedInput()){
      showToast('Une fiche produit est en cours de modification. Fermez-la ou enregistrez-la avant de continuer.', 'warn', 5000);
      return true;
    }
    var so = document.getElementById('specsOverlay');
    if(so && so.style.display !== 'none' && typeof _specsHasChanges === 'function' && _specsHasChanges()){
      showToast('Des caractéristiques techniques sont en cours de modification. Fermez-les ou enregistrez-les avant de continuer.', 'warn', 5000);
      return true;
    }
    if(Array.isArray(window._armoireDraft) && window._armoireDraft.length > 0){
      showToast('Une configuration d\'armoire est en cours. Terminez-la ou videz-la avant de continuer.', 'warn', 5000);
      return true;
    }
    if(typeof window._closeAllOverlays === 'function') window._closeAllOverlays();
    return false;
  }

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
    // ── Protection anti-perte : refuser si une fiche est déjà en cours
    // d'édition ou de création — mais on laisse les données en attente
    // dans localStorage (elles seront reprises au prochain déclenchement
    // tant qu'elles ne dépassent pas la limite de 5 min ci-dessous).
    if(_extensionGuardBlocked()) return;
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
      { overlay: 'sugOverlay',        close: 'sugCloseBtn'      },
      { overlay: 'sugPickerOverlay',  close: 'sugPickerCloseBtn' },
      { overlay: 'armoireConfigOverlay', close: 'armoireConfigCloseBtn' },
      { overlay: 'priceModalOverlay', close: 'priceModalClose'  },
      { overlay: 'specsOverlay',      close: 'specsCloseBtn'    },
      { overlay: 'conflictOverlay',   close: 'conflictCloseBtn' },
      { overlay: 'reqDetailOverlay',  close: 'reqDetailClose'   },
      { overlay: 'requestsOverlay',   close: 'requestsPanelClose' },
      { overlay: 'bugReportOverlay',  close: 'bugReportCloseBtn' },
      { overlay: 'compareOverlay',    close: 'compareClose',    classList: true },
      { overlay: 'iconPickerModal',   close: 'iconPickerClose', classList: true },
      { overlay: 'settingsOverlay',   close: 'settingsClose',   classList: true },
      { overlay: 'authOverlay',       close: 'authCloseBtn',    classList: true },
      { overlay: 'modalOverlay',      close: 'modalClose',      classList: true },
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

    // ── Fermeture générale (bottom nav) ─────────────────────────────────
    // Changer d'onglet dans la barre de navigation mobile ne fermait que
    // Paramètres/Configurateur d'armoire/tiroirs/connexion (traités au cas
    // par cas dans _initBottomNav, js/actions.js) — toutes les AUTRES
    // fenêtres de cette liste (caractéristiques, documents, suggestions,
    // demandes, conflits, etc.) restaient ouvertes derrière, invisibles
    // mais toujours actives (retour utilisateur : vérifié sur les autres
    // fenêtres mobiles, plusieurs ne se fermaient pas). Réutilise CETTE
    // même liste MODALS (clic sur le vrai bouton fermer de chacune, pour
    // repasser par sa logique de fermeture propre — ex. confirmation de
    // saisie non enregistrée sur la fiche produit) plutôt que de dupliquer
    // une seconde liste dans actions.js. viewOverlay est volontairement
    // exclu : son bouton fermer peut REMONTER d'un niveau au lieu de
    // fermer (navigation depuis une suggestion, voir closeView() dans
    // js/render.js) — _initBottomNav le ferme donc directement de son côté.
    window._closeAllOverlays = function(exceptOverlayIds){
      var except = exceptOverlayIds || [];
      MODALS.forEach(function(m){
        if(m.overlay === 'viewOverlay') return; // cas spécial, voir commentaire ci-dessus
        if(except.indexOf(m.overlay) !== -1) return;
        if(isVisible(document.getElementById(m.overlay))) triggerClose(m.close);
      });
    };

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

  // ── Remise à zéro du défilement à l'ouverture, pour TOUTES les fenêtres ──
  // Une fenêtre reste dans le DOM entre deux ouvertures (juste masquée) —
  // son scrollTop n'est donc jamais réinitialisé tout seul par le
  // navigateur : la rouvrir (même sur un autre produit/une autre entrée)
  // reprenait exactement là où on l'avait laissée au lieu de repartir du
  // début (retour utilisateur : "corrige la mémorisation de la position du
  // scroll pour tous" — déjà fait au cas par cas pour la fiche produit,
  // généralisé ici à toutes les fenêtres d'un coup plutôt qu'une par une).
  // Générique et à l'épreuve du temps : surveille chaque overlay connu et,
  // dès qu'il passe de masqué à visible (quelle que soit la méthode —
  // style.display ou classList — utilisée pour l'ouvrir), remet à zéro
  // TOUTES les zones défilantes qu'il contient, sans avoir à connaître leur
  // classe exacte ni à modifier chaque fonction d'ouverture éparpillée dans
  // le code.
  ;(function _initScrollReset(){
    var OVERLAY_IDS = [
      'modalOverlay', 'viewOverlay', 'settingsOverlay', 'requestsOverlay',
      'docOverlay', 'priceModalOverlay', 'specsOverlay', 'sugOverlay',
      'sugPickerOverlay', 'conflictOverlay', 'reqDetailOverlay',
      'xlsxImportOverlay', 'authOverlay', 'iconPickerModal', 'compareOverlay',
      'bugReportOverlay', 'armoireConfigOverlay', 'pdfViewerOverlay',
      'filterSheet', 'menuSheet'
    ];
    function isVisible(el){
      var cs = getComputedStyle(el);
      if(cs.display === 'none') return false;
      // .open/.show pilotent la visibilité via transform/opacity sur
      // certaines fenêtres (feuilles mobiles) plutôt que display — s'appuyer
      // aussi sur ces classes en plus de display.
      return true;
    }
    function resetScrollables(root){
      var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      all.forEach(function(el){
        if(el.scrollTop <= 0) return;
        var cs = getComputedStyle(el);
        if(cs.overflowY === 'auto' || cs.overflowY === 'scroll') el.scrollTop = 0;
      });
    }
    OVERLAY_IDS.forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      var wasVisible = isVisible(el) && (el.classList.contains('open') || el.classList.contains('show') || el.style.display !== 'none');
      var mo = new MutationObserver(function(){
        var nowVisible = isVisible(el) && (el.classList.contains('open') || el.classList.contains('show') || el.style.display === 'flex' || el.style.display === 'block');
        if(nowVisible && !wasVisible) resetScrollables(el);
        wasVisible = nowVisible;
      });
      mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
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

