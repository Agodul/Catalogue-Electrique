  // ── Navigation Paramètres ─────────────────────────────────────────
  var settingsFamilyPage  = document.getElementById('settingsFamilyPage');
  var settingsServerPage  = document.getElementById('settingsServerPage');
  var settingsUserPage    = document.getElementById('settingsUserPage');
  var settingsLockedPage  = document.getElementById('settingsLockedPage');
  var btnOpenFamilyIcons  = document.getElementById('btnOpenFamilyIcons');
  var btnFamilyPageBack   = document.getElementById('btnFamilyPageBack');
  var btnOpenServerSettings = document.getElementById('btnOpenServerSettings');
  var btnServerPageBack   = document.getElementById('btnServerPageBack');
  var serverUrlInput      = document.getElementById('serverUrlInput');
  var serverTestResult    = document.getElementById('serverTestResult');

  // .settings-header (titre "Paramètres" + croix/flèche de fermeture) est un
  // frère de .settings-body ET de chaque sous-page — jamais masqué par les
  // fonctions show* ci-dessous à l'origine, donc affiché EN PERMANENCE
  // au-dessus de la sous-page active. Chaque sous-page a pourtant déjà sa
  // propre flèche ← (retour à CETTE liste Paramètres) — les deux empilées
  // donnaient deux flèches ← visibles en même temps mais qui ne ramènent
  // PAS au même endroit (l'une revient au menu mobile, l'autre juste à la
  // liste Paramètres) — retour utilisateur : "j'ai deux flèches qui ne
  // retournent pas au même endroit". Masquer l'en-tête général dès qu'une
  // sous-page a sa propre navigation résout l'ambiguïté : un seul niveau de
  // retour visible à la fois, comme une pile d'écrans classique.
  var settingsHeaderEl = document.querySelector('.settings-header');
  function showSettingsMain(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = '';
    document.querySelector('.settings-body').style.display = '';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'none';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
  }
  function showSettingsFamilyPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'flex';
    settingsServerPage.style.display = 'none';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
    renderSettingsFamilies();
  }
  function showSettingsUserPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
    if(settingsUserPage){ settingsUserPage.style.display = 'flex'; if(typeof renderUserPage==='function') renderUserPage(); }
  }
  function showSettingsServerPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'flex';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
    serverUrlInput.value = serverUrl;

  }
  function showSettingsLockedPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'none';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage){ settingsLockedPage.style.display = 'flex'; renderSettingsLockedPage(); }
  }

  // Formate un délai en secondes en texte court ("à l'instant", "12 min",
  // "1 h 05") — usage unique ici, pas besoin d'un utilitaire partagé.
  function _formatLockAge(ms){
    var min = Math.floor(ms / 60000);
    if(min < 1) return 'à l\'instant';
    if(min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    var rem = min % 60;
    return h + ' h' + (rem ? ' ' + String(rem).padStart(2, '0') : '');
  }

  async function renderSettingsLockedPage(){
    var listEl = document.getElementById('settingsLockedList');
    if(!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:20px 8px;"><i class="ti ti-loader-2" style="font-size:18px;"></i><br>Chargement…</div>';
    var result = await _fetchAllLockedProducts();
    if(!result.fetched){
      listEl.innerHTML = '<div style="text-align:center;color:#DC2626;font-size:12.5px;padding:20px 8px;">Impossible de joindre le serveur.</div>';
      return;
    }
    if(!result.locked.length){
      listEl.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:20px 8px;">Aucune fiche verrouillée actuellement.</div>';
      return;
    }
    var now = Date.now();
    listEl.innerHTML = result.locked.map(function(p){
      var age = p._editingAt ? (now - p._editingAt) : null;
      var expired = age != null && age > EDIT_LOCK_TTL_MS;
      var ageLabel = age != null ? _formatLockAge(age) : '?';
      return '<div class="locked-product-row" data-id="' + escapeHtml(p.id || '') + '" data-ref="' + escapeHtml(p.ref || '') + '" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:12.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.ref || p.name || '(sans référence)') + '</div>'
        + '<div style="font-size:11px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.name || '') + '</div>'
        + '<div style="font-size:11px;color:' + (expired ? '#059669' : '#DC2626') + ';margin-top:3px;">'
          + 'Verrouillé par <strong>' + escapeHtml(p._editingBy || '?') + '</strong> — depuis ' + ageLabel
          + (expired ? ' (expiré — plus bloquant pour personne, sera nettoyé par la purge serveur)' : '')
        + '</div>'
        + '</div>'
        // min-width:130px : ce bouton bascule vers "Déverrouillage…" pendant
        // l'appel réseau (voir plus bas) — mesuré ~103px pour "Déverrouiller"
        // contre ~123px pour "Déverrouillage…", sans largeur fixe il
        // rétrécissait/grossissait visiblement au clic (retour utilisateur :
        // "je voudrai que la taille soit fixe [...] ça fait trop amateur").
        + '<button type="button" class="locked-product-unlock" style="flex-shrink:0;min-width:130px;padding:8px 12px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">Déverrouiller</button>'
        + '</div>';
    }).join('');
  }

  var btnLockedPageBack = document.getElementById('btnLockedPageBack');
  if(btnLockedPageBack) btnLockedPageBack.addEventListener('click', function(){ showSettingsMain(); });
  var btnLockedPageRefresh = document.getElementById('btnLockedPageRefresh');
  if(btnLockedPageRefresh) btnLockedPageRefresh.addEventListener('click', function(){ renderSettingsLockedPage(); });
  var btnOpenLockedProducts = document.getElementById('btnOpenLockedProducts');
  if(btnOpenLockedProducts) btnOpenLockedProducts.addEventListener('click', function(){ showSettingsLockedPage(); });
  var settingsLockedListEl = document.getElementById('settingsLockedList');
  if(settingsLockedListEl) settingsLockedListEl.addEventListener('click', async function(e){
    var btn = e.target.closest ? e.target.closest('.locked-product-unlock') : null;
    if(!btn) return;
    var row = btn.closest('.locked-product-row');
    if(!row) return;
    var id = row.getAttribute('data-id');
    var ref = row.getAttribute('data-ref');
    var refLabel = ref || id;
    // refLabel vient d'une ref/id produit (saisie possible par n'importe
    // quel utilisateur autorisé à ajouter un produit) — échappé avant
    // insertion dans le popup HTML, comme les autres appels de
    // customConfirm/customAlert du projet (issue CodeQL "DOM text
    // reinterpreted as HTML" : ce site-ci ne le faisait pas encore).
    var ok = typeof customConfirm === 'function'
      ? await customConfirm('Déverrouiller cette fiche ?', 'Utilise ceci seulement si tu es sûr que ' + escapeHtml(refLabel) + ' n\'est plus en cours de modification par personne (crash/fermeture du navigateur). Continuer ?', { okLabel: 'Déverrouiller', danger: true })
      : confirm('Déverrouiller ' + refLabel + ' ?');
    if(!ok) return;
    btn.disabled = true;
    btn.textContent = 'Déverrouillage…';
    var result = await _fetchAllLockedProducts();
    var fresh = result.fetched ? result.locked.find(function(x){ return x.id === id || (ref && x.ref === ref); }) : null;
    var success = fresh ? await _adminForceUnlockProduct(fresh) : false;
    if(success){
      if(typeof showToast === 'function') showToast('Fiche ' + refLabel + ' déverrouillée ✓', 'ok');
      renderSettingsLockedPage();
    } else {
      if(typeof showToast === 'function') showToast('Échec du déverrouillage — réessaie.', 'err');
      btn.disabled = false;
      btn.textContent = 'Déverrouiller';
    }
  });

  btnOpenFamilyIcons.addEventListener('click', function(){ showSettingsFamilyPage(); });
  var btnOpenUserSettings = document.getElementById('btnOpenUserSettings');
  if(btnOpenUserSettings) btnOpenUserSettings.addEventListener('click', function(){ showSettingsUserPage(); });

  // Bouton Mon compte géré dans auth.js
  var btnUserPageBack = document.getElementById('btnUserPageBack');
  if(btnUserPageBack) btnUserPageBack.addEventListener('click', function(){ showSettingsMain(); });
  btnOpenFamilyIcons.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; });
  btnOpenFamilyIcons.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; });
  btnFamilyPageBack.addEventListener('click', function(){ showSettingsMain(); });

  btnOpenServerSettings.addEventListener('click', function(){ showSettingsServerPage(); });
  btnOpenServerSettings.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; });
  btnOpenServerSettings.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; });
  btnServerPageBack.addEventListener('click', function(){ showSettingsMain(); });

  // Vérifie qu'un serveur répond, avec un timeout court : une IP mal saisie
  // ou injoignable ne doit pas faire attendre l'utilisateur indéfiniment.
  function pingServerUrl(url){
    return new Promise(function(resolve){
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = setTimeout(function(){ if(ctrl) ctrl.abort(); }, 4000);
      fetch(url+'/health', ctrl ? {signal: ctrl.signal} : {})
        .then(function(r){ clearTimeout(timer); resolve(!!r.ok); })
        .catch(function(){ clearTimeout(timer); resolve(false); });
    });
  }

  // Test connexion
  document.getElementById('btnTestServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'');
    serverTestResult.style.display = 'block';
    // Sans ce contrôle, un champ vide déclenchait quand même un fetch — vers
    // une URL relative résolue sur la page elle-même — et affichait "HTTP
    // 404" comme si un vrai serveur avait répondu, message trompeur (retour
    // utilisateur).
    if(!url){
      serverTestResult.style.background = '#FEE2E2';
      serverTestResult.style.color = '#991B1B';
      serverTestResult.textContent = '✗ Entrez une URL avant de tester.';
      return;
    }
    serverTestResult.style.background = '#F1F5F9';
    serverTestResult.style.color = 'var(--ink)';
    serverTestResult.textContent = 'Connexion en cours…';
    try{
      var r = await fetch(url+'/health');
      if(r.ok){
        serverTestResult.style.background = '#ECFDF5';
        serverTestResult.style.color = '#065F46';
        serverTestResult.textContent = '✓ Serveur disponible';
      } else {
        throw new Error('HTTP '+r.status);
      }
    }catch(e){
      serverTestResult.style.background = '#FEE2E2';
      serverTestResult.style.color = '#991B1B';
      serverTestResult.textContent = '✗ Impossible de joindre le serveur : '+e.message;
    }
  });

  // Enregistrer config


  document.getElementById('btnSaveServer').addEventListener('click', async function(){
    var newUrl     = serverUrlInput.value.trim().replace(/\/+$/, '');
    var urlChanged = newUrl && newUrl !== serverUrl;

    // Si l'adresse a changé, vérifier qu'elle répond avant d'aller plus loin —
    // sinon la fenêtre de connexion s'affichait même pour un serveur injoignable
    // (IP mal saisie, serveur éteint...), ce qui n'a rien à faire là.
    if(urlChanged){
      var btnSaveServerEl = this;
      btnSaveServerEl.disabled = true;
      var reachable = await pingServerUrl(newUrl);
      btnSaveServerEl.disabled = false;
      if(!reachable){
        showToast('Serveur injoignable à cette adresse — vérifiez l\'IP et le port.', 'err', 4000);
        return;
      }
    }

    serverUrl  = newUrl;
    saveServerConfig();
    if(serverUrl) startSyncPolling(); else stopSyncPolling();

    // Si nouvelle URL et pas connecté → ouvrir la fenêtre de login d'abord
    if(urlChanged && serverUrl && typeof authIsLoggedIn === 'function' && !authIsLoggedIn()){
      showToast('Veuillez vous connecter pour importer le catalogue', 'warn', 3500);
      if(typeof openAuthModal === 'function') openAuthModal();
      showSettingsMain();
      return;
    }

    // Si l'URL vient d'être définie → import automatique du catalogue
    if(urlChanged && serverUrl){
      showToast('Import du catalogue depuis le serveur…', 'ok', 2500);
      try{
        var pullHeaders = typeof window.authHeaders === 'function' ? window.authHeaders() : {};
          delete pullHeaders['Content-Type'];
          var r = await fetch(serverUrl+'/pullDatas', { headers: pullHeaders });
        if(!r.ok) throw new Error('HTTP '+r.status);
        var data = await r.json();
        if(data && Array.isArray(data.items)){
          products = data.items.map(function(item){ return item.data; });
        } else if(Array.isArray(data)){
          products = data;
        } else {
          throw new Error('Format invalide');
        }
        // [] : products vient d'être remplacé par les données DU serveur —
        // les repousser serait un aller-retour inutile (et re-timbrerait
        // inutilement createdAt sur tout le catalogue, voir les autres
        // correctifs de ce type dans ce fichier).
        save(true, []);
        localStorage.setItem(SERVER_LAST_SYNC_KEY, Date.now().toString());
        // Fermer les paramètres et afficher la home proprement
        showSettingsMain();
        if(typeof window._closeSettingsOverlay === 'function') window._closeSettingsOverlay();
        document.body.classList.remove('modal-open');
        var homePage = document.getElementById('homePage');
        var catalogueWrap = document.getElementById('catalogueWrap');
        var hdrCountChip = document.getElementById('hdrCountChip');
        if(homePage) homePage.classList.remove('hidden');
        if(catalogueWrap) catalogueWrap.style.display = 'none';
        if(hdrCountChip) hdrCountChip.style.display = 'none';
        render();
        renderHome();
        showToast(products.length+' produits importés depuis le serveur ✓', 'ok', 3000);
        return;
      }catch(e){
        showToast('Import automatique échoué : '+e.message, 'err', 4000);
      }
    } else {
      showToast('Configuration serveur enregistrée ✓', 'ok', 2500);
    }
    showSettingsMain();
  });

  // Charger depuis serveur
  document.getElementById('btnSyncFromServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    try{
      var initH = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete initH['Content-Type'];
      var r = await fetch(url+'/pullDatas', { headers: initH });
      if(!r.ok) throw new Error('HTTP '+r.status);
      var data = await r.json();
      // Format serveur : { count: N, items: [ { ref, data: {...produit} } ] }
      if(data && Array.isArray(data.items)){
        products = data.items.map(function(item){ return item.data; });
      } else if(Array.isArray(data)){
        products = data;
      } else {
        throw new Error('Format invalide');
      }
      // [] : voir commentaire équivalent juste au-dessus (import auto au
      // changement d'URL serveur) — products vient d'être remplacé par les
      // données DU serveur, rien à repousser.
      save(true, []);
      localStorage.setItem(SERVER_LAST_SYNC_KEY, Date.now().toString());
      // Fermer les paramètres
      if(typeof window._closeSettingsOverlay === 'function') window._closeSettingsOverlay();
      document.body.classList.remove('modal-open');
      // Réinitialiser et afficher la home
      var homePage = document.getElementById('homePage');
      var catalogueWrap = document.getElementById('catalogueWrap');
      var hdrCountChip = document.getElementById('hdrCountChip');
      if(homePage) homePage.classList.remove('hidden');
      if(catalogueWrap) catalogueWrap.style.display = 'none';
      if(hdrCountChip) hdrCountChip.style.display = 'none';
      render();
      renderHome();
      showToast(products.length+' produits chargés depuis le serveur ✓', 'ok', 2500);
    }catch(e){
      showToast('Erreur : '+e.message, 'warn', 3000);
    }
  });

  // Envoyer vers serveur
  document.getElementById('btnPushToServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    var res = await pushCatalogToServer({ url: url });
    if(res.ok) showToast(res.upserted+' envoyé(s), catalogue synchronisé ✓', 'ok', 3000);
    else showToast('Erreur : '+(res.message || 'aucun serveur configuré'), 'warn', 3000);
  });

