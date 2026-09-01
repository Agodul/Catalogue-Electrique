  // ---------- Menu ⋮ (Exporter / Importer / Nettoyer) ----------
  // ── Paramètres ──────────────────────────────────────────────────────
  var btnSettings      = document.getElementById('btnSettings');
  var settingsOverlay  = document.getElementById('settingsOverlay');
  var settingsClose    = document.getElementById('settingsClose');
  var settingsFamilyList = document.getElementById('settingsFamilyList');
  var settingsEditingFamily = null; // famille en cours de modif depuis Paramètres

  function renderSettingsFamilies(){
    refreshKnownFamilies();
    // Compter produits par famille
    var counts = {};
    products.forEach(function(p){ if(p.family) counts[p.family] = (counts[p.family]||0)+1; });

    if(knownFamilies.length === 0){
      settingsFamilyList.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:10px 0;">Aucune famille définie.</p>';
      return;
    }
    settingsFamilyList.innerHTML = knownFamilies.sort().map(function(f){
      var icon = getFamilyIcon(f);
      var count = counts[f] || 0;
      return '<div class="family-icon-row-settings" data-family="'+escapeHtml(f)+'">'
        + '<div class="family-icon-thumb" id="settings-thumb-'+escapeHtml(f)+'">'+renderFamilyIconHtml(icon)+'</div>'
        + '<div class="family-icon-name">'+escapeHtml(f)+'</div>'
        + '<div class="family-icon-count">'+count+(count>1?' réf':' réf')+'</div>'
        + '<button class="family-icon-change-btn" data-family="'+escapeHtml(f)+'"><i class="ti ti-pencil"></i></button>'
        + '</div>';
    }).join('');

    settingsFamilyList.querySelectorAll('.family-icon-change-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        settingsEditingFamily = btn.getAttribute('data-family');
        selectedFamilyIcon = getFamilyIcon(settingsEditingFamily);
        iconPickerSearch.value = '';
        renderIconGrid('');
        iconPickerModal.classList.add('show');
      });
    });
  }

  var SERVER_KEY           = 'cat_server_url';
  var SERVER_LAST_SYNC_KEY = 'cat_server_last_sync';
  var CHECKALL_KEY         = 'cat_server_checkall_state'; // dernier snapshot /checkAll connu (par collection)
  var serverUrl  = '';

  function loadServerConfig(){
    serverUrl  = localStorage.getItem(SERVER_KEY) || '';
    updateServerSubtitle();
    if(serverUrl){
      setTimeout(function(){
        // doCheckAllSync()/startSyncPolling() ne tournent QUE pour un compte
        // connecté (retour utilisateur : "lorsque le user n'est plus loggin
        // faudrai arrêté la requête checkAll") — un compte déconnecté ne
        // relance donc plus aucune requête /checkAll en arrière-plan. Le
        // point de statut serveur (updateServerSubtitle) reste alors figé
        // sur son dernier état connu tant qu'on n'est pas reconnecté : choix
        // assumé, au prix de la précision temps réel de ce point pour un
        // utilisateur déconnecté.
        if(typeof authIsLoggedIn === 'function' && authIsLoggedIn()){
          doCheckAllSync();
          startSyncPolling();
          syncDeletions();
        }
      }, 1500);
      // Sync suppressions toutes les 5 minutes (si connecté)
      setInterval(function(){
        if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
        syncDeletions();
      }, 5 * 60 * 1000);
    }
  }

  // Reflète la connectivité RÉELLE, pas juste "un serveur est configuré" —
  // avant, le point restait vert même Wi-Fi coupé (retour utilisateur :
  // "je suis toujours connecté alors que je peux plus taper le serveur").
  // Optimiste par défaut (true) tant qu'aucune vérification n'a encore
  // échoué, pour ne pas afficher rouge par erreur avant le tout premier
  // passage de doCheckAllSync(). Mis à jour à 2 endroits : ici via
  // navigator.onLine (instantané, coupure Wi-Fi/avion) et dans
  // doCheckAllSync() via le résultat réel du fetch (détecte aussi un
  // serveur injoignable alors que le Wi-Fi lui-même fonctionne).
  var _serverReachable = true;
  function updateServerSubtitle(){
    var el = document.getElementById('serverSettingsSub');
    if(!el) return;
    if(!serverUrl){ el.innerHTML = 'Non configuré'; return; }
    var online = typeof navigator === 'undefined' || navigator.onLine !== false;
    var reachable = _serverReachable && online;
    var dotColor = reachable ? '#22C55E' : '#DC2626';
    var suffix = reachable ? '' : (online ? ' — serveur injoignable' : ' — hors connexion');
    el.innerHTML = '<i class="ti ti-circle-filled" style="color:'+dotColor+';font-size:.7em;"></i> '+escapeHtml(serverUrl)+suffix;
  }
  // Réagit immédiatement à une coupure/reprise réseau (pas besoin d'attendre
  // le prochain cycle de 15s de doCheckAllSync) — 'online' relance aussi
  // tout de suite une vérification réelle plutôt que de supposer le serveur
  // à nouveau joignable simplement parce que le Wi-Fi est revenu.
  window.addEventListener('offline', function(){ updateServerSubtitle(); _scheduleServerLogoutCheck(); });
  window.addEventListener('online', function(){
    updateServerSubtitle();
    _cancelServerLogoutCheck();
    if(typeof doCheckAllSync === 'function') doCheckAllSync();
  });

  // ── Déconnexion automatique si le serveur reste injoignable (retour
  // utilisateur : "au bout de 3 secondes, déconnexion + message") ──────────
  // Dès qu'une injoignabilité est détectée (offline, ou échec réel du fetch
  // dans doCheckAllSync ci-dessous), programme UNE vérification 3s plus
  // tard — pas une déconnexion immédiate sur la première détection, pour ne
  // pas délog­ger sur un accroc réseau qui se résorbe tout seul en une
  // fraction de seconde (bascule Wi-Fi/4G...). Si le serveur répond de
  // nouveau avant l'échéance, le timer est annulé (voir 'online' et les
  // branches de succès de doCheckAllSync) — sinon, déconnexion via
  // _authForceLogout (js/auth.js), qui affiche déjà un message clair après
  // rechargement.
  var _serverLogoutTimer = null;
  function _scheduleServerLogoutCheck(){
    if(_serverLogoutTimer || !serverUrl) return;
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
    _serverLogoutTimer = setTimeout(async function(){
      _serverLogoutTimer = null;
      if(!serverUrl) return;
      // Revérifie une dernière fois avant de déconnecter — jamais sur la
      // seule foi d'un état resté figé depuis 3s.
      try{
        var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
        delete h['Content-Type'];
        var r = await fetch(serverUrl + '/checkAll', { headers: h });
        if(r.ok){
          _serverReachable = true;
          updateServerSubtitle();
          return;
        }
      }catch(e){}
      _serverReachable = false;
      updateServerSubtitle();
      if(typeof window._authForceLogout === 'function'){
        window._authForceLogout('Serveur injoignable — déconnexion automatique');
      }
    }, 3000);
  }
  function _cancelServerLogoutCheck(){
    if(_serverLogoutTimer){ clearTimeout(_serverLogoutTimer); _serverLogoutTimer = null; }
  }

  function saveServerConfig(){
    localStorage.setItem(SERVER_KEY, serverUrl);
    updateServerSubtitle();
  }

  // ── Polling /check toutes les 30s ─────────────────────────────────
  var _syncInterval = null;
  var _deletionWarnedRefs = {}; // {ref: true} - évite de répéter l'avertissement de suppression à chaque passage de syncDeletions() tant que la fenêtre reste ouverte sur ce produit

  // Sync complète pour détecter les suppressions côté serveur
  async function syncDeletions(){
    if(!serverUrl) return;
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
    try{
      var getHeaders = typeof window.authHeaders === 'function' ? window.authHeaders() : {};
      delete getHeaders['Content-Type'];
      var r = await fetch(serverUrl+'/pullDatas', { headers: getHeaders });
      if(!r.ok) return;
      var data = await r.json();
      var serverItems = data && Array.isArray(data.items)
        ? data.items.map(function(i){ return i.data; })
        : (Array.isArray(data) ? data : []);
      if(!serverItems.length) return;

      // Construire un Set des refs serveur
      var serverRefs = new Set(serverItems.map(function(p){ return p && p.ref; }).filter(Boolean));

      // Protéger le produit EN COURS D'ÉDITION (fenêtre "Modifier le
      // produit" ouverte) d'une suppression détectée ici — sans ça, un
      // produit supprimé côté serveur par quelqu'un d'autre pendant qu'on le
      // modifie disparaissait silencieusement de products[] sous les pieds
      // de l'utilisateur, en pleine saisie, sans aucun avertissement (retour
      // utilisateur : "j'ai plus de contrôle si il y a eu une suppression de
      // produit sur le serveur"). On le garde tant que la fenêtre reste
      // ouverte, et on prévient clairement — popup bloquante plutôt qu'un
      // toast, l'utilisateur pouvant très bien être absent au moment où
      // cette synchro tourne en arrière-plan (comme la fermeture automatique
      // pour inactivité, voir js/modal-editlock-heartbeat.js).
      var editingProduct = (typeof editingId !== 'undefined' && editingId)
        ? products.find(function(p){ return p.id === editingId; })
        : null;
      var editingRef = editingProduct ? editingProduct.ref : null;

      // Supprimer localement les produits absents du serveur
      var before = products.length;
      products = products.filter(function(p){
        if(p.ref && editingRef && p.ref === editingRef) return true; // jamais retiré pendant l'édition
        return !p.ref || serverRefs.has(p.ref);
      });
      var deleted = before - products.length;

      if(editingRef && !serverRefs.has(editingRef) && !_deletionWarnedRefs[editingRef]){
        _deletionWarnedRefs[editingRef] = true;
        if(typeof customAlert === 'function'){
          customAlert(
            'Produit supprimé côté serveur',
            'Ce produit a été supprimé par quelqu\'un d\'autre pendant que vous le modifiiez. Vos modifications restent locales tant que cette fenêtre reste ouverte — les enregistrer le recréera sur le serveur.'
          );
        }
      }

      if(deleted > 0){
        // [] : cette fonction ne fait QUE retirer localement des produits
        // déjà absents du serveur — rien à repousser (le serveur sait déjà
        // qu'ils n'existent plus, c'est justement pour ça qu'ils sont
        // filtrés ici). save() sans filtre repoussait tout le catalogue
        // local restant, avec createdAt forcé à maintenant sur chacun —
        // même risque que le bug corrigé dans syncFromServer/pushToServer,
        // mais ici déclenché automatiquement en arrière-plan dès qu'UNE
        // suppression est détectée, sur un compte au catalogue local resté
        // en retard (retour utilisateur : "un compte avec des perme[ssions]
        // pour ajouter un produit se connecte avec un vieux catalogue, ça
        // envoie sur le serveur").
        save(true, []);
        var homePage = document.getElementById('homePage');
        var isOnHome = homePage && !homePage.classList.contains('hidden');
        if(isOnHome){ renderHome(); } else { render(); }
      }
    }catch(e){ console.warn('syncDeletions:', e.message); }
  }

  async function doSyncCheck(){
    if(!serverUrl) return;
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
    try{
      var lastSync = localStorage.getItem(SERVER_LAST_SYNC_KEY) || '0';
      var checkUrl = serverUrl+'/check' + (lastSync !== '0' ? '?timestamp='+lastSync : '');
      var chkH = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete chkH['Content-Type'];
      var r = await fetch(checkUrl, { headers: chkH });
      if(!r.ok) return;
      var data = await r.json();
      if(data.count > 0){
        // Il y a des nouveautés → sync différentielle par ref
        await syncFromServer(false);
      }
    }catch(e){ /* silencieux */ }
  }

  // Vérifie en UNE requête l'état (révision/nombre/date) de chaque collection
  // côté serveur (catalogue, blocs, configurations) et ne relance que les
  // requêtes de rafraîchissement dont la collection a réellement changé
  // depuis le dernier check connu (comparaison locale, pas de refetch aveugle).
  async function doCheckAllSync(){
    if(!serverUrl) return;
    // Aucune requête /checkAll sans session active (retour utilisateur :
    // "lorsque le user n'est plus loggin faudrai arrêté la requête
    // checkAll") — y compris la simple vérification de joignabilité qui
    // pilote le point rouge/vert de updateServerSubtitle : ce point reste
    // donc figé sur son dernier état connu tant qu'on n'est pas reconnecté,
    // plutôt que de continuer à sonder le serveur en arrière-plan pour un
    // compte déconnecté.
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
    try{
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      var r = await fetch(serverUrl + '/checkAll', { headers: h });
      if(!r.ok){
        // Ancien serveur sans /checkAll (404) : pas une panne, repli normal
        // sur l'ancien /check.
        if(r.status === 404) return doSyncCheck();
        _serverReachable = false;
        updateServerSubtitle();
        _scheduleServerLogoutCheck();
        return;
      }
      _serverReachable = true;
      updateServerSubtitle();
      _cancelServerLogoutCheck();
      var data = await r.json();
      var prev = {};
      try{ prev = JSON.parse(localStorage.getItem(CHECKALL_KEY) || '{}'); }catch(e){}

      function hasChanged(key){
        var now = data[key], before = prev[key];
        if(!now) return false;
        if(!before) return true; // pas de référence locale → on rattrape par sécurité
        return now.revision !== before.revision || now.count !== before.count || now.changedAt !== before.changedAt;
      }

      var jobs = [];
      if(hasChanged('catalogue')){
        // syncFromServer fait un pull DIFFÉRENTIEL ("/pullDatas?date=...") :
        // par nature, il ne peut jamais voir une suppression (un produit
        // supprimé disparaît juste des résultats, aucun marqueur renvoyé).
        // syncDeletions() fait le pull complet nécessaire pour ça. Avant,
        // elle ne tournait que toutes les 5 min — un produit supprimé par
        // un collègue pouvait donc rester visible jusqu'à 5 min, alors que
        // les ajouts/modifs sont maintenant détectés en ~15s. On la lance
        // ici aussi pour que suppressions et ajouts soient au même rythme.
        jobs.push(syncFromServer(false));
        jobs.push(syncDeletions());
      }
      if(hasChanged('configBlocks') && typeof _armoireFetchBlocks === 'function') jobs.push(_armoireFetchBlocks());
      if(hasChanged('savedConfigs') && typeof _armoireFetchSavedConfigs === 'function') jobs.push(_armoireFetchSavedConfigs());
      // catalogueRequests/bugs : avant, js/requests.js faisait tourner son
      // propre poll indépendant (/checkReq+/checkBugs) toutes les 30s, sans
      // aucun rapport avec ce cycle-ci — deux détections de changement en
      // parallèle pour la même info (retour utilisateur : consolider sur
      // /checkAll). reqUpdateBadge() reste la source des VRAIS chiffres
      // (/checkReq+/checkBugs, déjà vérifiés contre le Swagger réel), on ne
      // fait que réutiliser CE signal-ci pour décider QUAND la relancer —
      // se neutralise déjà seule si personne n'est admin/connecté.
      if((hasChanged('catalogueRequests') || hasChanged('bugs')) && typeof window._reqUpdateBadge === 'function'){
        jobs.push(window._reqUpdateBadge());
      }
      if(jobs.length) await Promise.allSettled(jobs);

      localStorage.setItem(CHECKALL_KEY, JSON.stringify(data));
    }catch(e){
      // Échec réseau (pas juste un HTTP non-ok) — serveur injoignable.
      _serverReachable = false;
      updateServerSubtitle();
      _scheduleServerLogoutCheck();
    }
  }

  function startSyncPolling(){
    stopSyncPolling();
    if(!serverUrl) return;
    // Tourne aussi sans session — doCheckAllSync() gère lui-même ce qui est
    // sauté sans connexion (voir plus haut), mais la vérification de
    // joignabilité (point rouge/vert) doit continuer à tourner toutes les
    // 15s pour tout le monde.
    _syncInterval = setInterval(doCheckAllSync, 15000);
  }

  function stopSyncPolling(){
    if(_syncInterval){ clearInterval(_syncInterval); _syncInterval = null; }
  }

  // Revérifier immédiatement au retour au premier plan — sur mobile,
  // l'onglet mis en arrière-plan (écran verrouillé, appli changée) voit son
  // setInterval fortement ralenti/suspendu par le navigateur, bien plus
  // qu'au bureau où l'onglet reste généralement actif. Le point de statut
  // du serveur (updateServerSubtitle, alimenté par doCheckAllSync) restait
  // donc figé sur son dernier état jusqu'au prochain tic — qui pouvait
  // tarder longtemps, voire jamais vraiment reprendre normalement tant que
  // l'appli restait en arrière-plan (retour utilisateur : "le statut du
  // serveur ne s'actualise pas sur mobile"). Même principe déjà utilisé
  // pour authRefreshMe() (js/auth.js) et la vérification de mise à jour du
  // Service Worker (js/pwa.js).
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && _syncInterval) doCheckAllSync();
  });

  // ── Sync vers serveur ─────────────────────────────────────────────
  // Renvoie true/false selon le succès réel de l'envoi — auparavant la
  // fonction avalait silencieusement toute erreur (token expiré, rejet
  // serveur, coupure réseau...), donnant l'illusion que tout avait bien
  // été synchronisé alors que rien n'était arrivé côté serveur.
  async function pushToServer(changedProducts){
    if(!serverUrl) return true;
    // Un tableau explicitement VIDE veut dire "rien à repousser" — à ne pas
    // confondre avec `undefined` (repli volontaire sur tout le catalogue,
    // réservé aux flux bulk qui ne renseignent pas ce paramètre). Sans cette
    // distinction, passer [] retombait sur ce même repli "tout le
    // catalogue" — dangereux dès qu'un appel légitime n'a justement RIEN à
    // envoyer : dans syncFromServer(), recevoir un produit inconnu en local
    // (compte resté longtemps sans synchroniser) déclenchait ce repli, donc
    // un envoi de la TOTALITÉ du catalogue local — avec createdAt forcé à
    // "maintenant" sur chaque élément juste en dessous, ce qui écrasait
    // silencieusement, sur le serveur, les modifications récentes d'autrui
    // par les anciennes valeurs de ce vieux catalogue local (retour
    // utilisateur : "un compte avec des perme[ssions] pour ajouter un
    // produit se connecte avec un vieux catalogue, ça envoie [tout] sur le
    // serveur").
    if(Array.isArray(changedProducts) && changedProducts.length === 0) return true;
    try{
      // `changedProducts` : sous-ensemble réellement modifié (voir save() dans
      // storage.js) — n'envoyer que ça au lieu de tout le catalogue à chaque
      // sauvegarde. Repli sur la totalité si non fourni (flux bulk existants).
      var base = Array.isArray(changedProducts) && changedProducts.length
        ? changedProducts
        : products;
      var now = Date.now();
      // Pour forcer l'upsert des modifications, on envoie avec createdAt = now
      // Le serveur accepte le plus récent (createdAt) par ref
      var toSend = base.map(function(p){
        return Object.assign({}, p, { createdAt: now });
      });
      var r = await fetch(serverUrl+'/pushDatas', {
        method:'POST',
        headers: typeof window.authHeaders === 'function'
          ? window.authHeaders()
          : {'Content-Type':'application/json'},
        body: JSON.stringify(toSend)
      });
      if(!r.ok){
        console.warn('pushToServer: HTTP', r.status);
        return false;
      }
      return true;
    }catch(e){
      console.warn('pushToServer:', e.message);
      return false;
    }
  }
  // Exposer globalement pour storage.js
  window.pushToServer = pushToServer;

