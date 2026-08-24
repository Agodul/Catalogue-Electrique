"use strict";

// ═══════════════════════════════════════════════════════════════
//  MODULE DEMANDES (_req)
// ═══════════════════════════════════════════════════════════════

  var _reqPollInterval = null;
  var _reqPanelTab     = 'admin';

  // ── Helpers ───────────────────────────────────────────────────
  function reqServerUrl(){ return localStorage.getItem('cat_server_url') || ''; }
  function reqHeaders(){ return typeof window.authHeaders === 'function' ? window.authHeaders() : {}; }
  function reqCurrentUser(){ return typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null; }
  function reqIsAdmin(){ var u = reqCurrentUser(); return u && u.isAdmin; }

  // ── Badge notification ────────────────────────────────────────
  var _reqLastCount   = 0; // dernier total ABSOLU connu (voir reqUpdateBadge)

  function _reqNotifyAdmin(newCount){
    if(!reqIsAdmin()) return;
    if(newCount <= _reqLastCount) return;
    if(typeof Notification === 'undefined') return;
    if(Notification.permission !== 'granted') return;
    var diff = newCount - _reqLastCount;
    try {
      new Notification('Catalogue SPI — Nouvelle demande', {
        body: diff === 1
          ? 'Une nouvelle demande est en attente de validation.'
          : diff + ' nouvelles demandes sont en attente de validation.',
        // Chemin relatif (pas de "/" en tête) : l'app est déployée dans un
        // sous-dossier (ex. GitHub Pages, /Catalogue-Electrique/ — voir
        // manifest.webmanifest start_url/scope) — un chemin absolu depuis la
        // racine du domaine pointait à côté (bug préexistant, découvert en
        // déplaçant icon-192.png vers assets/).
        icon: 'assets/icon-192.png',
        tag: 'spi-req-badge',
        renotify: true,
        silent: false
      });
    } catch(e) {}
  }

  function _reqAskNotifPermission(){
    if(typeof Notification === 'undefined') return;
    if(Notification.permission === 'default'){
      Notification.requestPermission();
    }
  }

  async function reqUpdateBadge(){
    var sUrl = reqServerUrl();
    if(!sUrl || !reqIsAdmin()) return;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      // Toujours le total ABSOLU actuel (pas de timestamp= filtrant sur les
      // nouvelles entrées) — l'ancienne version cumulait un delta "nouvelles
      // demandes depuis le dernier check" sans jamais rien soustraire quand
      // une demande était résolue/acceptée/refusée : le badge ne pouvait que
      // monter, jamais redescendre (retour utilisateur : badge resté affiché
      // après avoir tout traité). Le payload {count} reste minuscule, pas de
      // coût réel à le refaire à chaque poll plutôt qu'un delta.
      //
      // checkDocsReq n'est PAS ajouté au total : "refs" y compte les
      // demandes ayant au moins un document joint — un sous-ensemble des
      // demandes déjà comptées par checkReq, pas des demandes en plus.
      // Un document joint appartient à une demande déjà comptée (aucun
      // fichier_req n'existe sans son catalogue_req correspondant) — les
      // additionner doublait le compte pour toute demande avec pièce jointe
      // (retour utilisateur : "4 notifs alors que 2 demandes", les deux
      // ayant chacune un fichier joint → 2+2).
      var rData = await fetch(sUrl + '/checkReq', { headers: h, cache: 'no-store' });
      var dData = rData.ok ? await rData.json() : null;
      if(!dData) return; // serveur down, on ne met pas à jour
      var total = (dData && dData.count) || 0;
      // + rapports de bug (API dédiée, comptés séparément — voir mémoire
      // "bug-report-api-migration"). Un échec de /checkBugs (pas encore
      // disponible côté serveur, etc.) ne doit pas empêcher d'afficher au
      // moins le compte des demandes produit.
      // /checkBugs (API dédiée aux bugs) : {count:N} CONFIRMÉ par un test
      // direct du Swagger (la doc ne montrait qu'un exemple générique
      // "string", trompeur). Fallback nombre/chaîne brute conservé par
      // sécurité, mais ne devrait normalement jamais servir.
      try {
        var rBugs = await fetch(sUrl + '/checkBugs', { headers: h, cache: 'no-store' });
        if(rBugs.ok){
          var dBugs = await rBugs.json();
          var nBugs = (dBugs && typeof dBugs === 'object' && typeof dBugs.count === 'number') ? dBugs.count
                    : (typeof dBugs === 'number') ? dBugs
                    : (typeof dBugs === 'string' && dBugs.trim() !== '' && !isNaN(Number(dBugs))) ? Number(dBugs)
                    : 0;
          total += nBugs;
        }
      } catch(eBugs){}
      ['requestsBadge','requestsBadgeMenu'].forEach(function(id){
        var el = document.getElementById(id);
        if(el){ el.textContent = total > 0 ? (total > 99 ? '99+' : total) : ''; el.style.display = total > 0 ? '' : 'none'; }
      });
      // Notif desktop seulement si le total a réellement augmenté depuis le
      // dernier poll (comparaison de deux totaux absolus, donc fiable même
      // si des demandes ont été traitées entretemps).
      if(total > _reqLastCount) _reqNotifyAdmin(total);
      _reqLastCount = total;
    } catch(e) {}
  }

  // ── Polling ───────────────────────────────────────────────────
  function reqStartPolling(){
    reqStopPolling();
    if(!reqServerUrl() || !reqIsAdmin()) return;
    _reqAskNotifPermission();
    reqUpdateBadge();
    _reqPollInterval = setInterval(reqUpdateBadge, 30000);
  }
  function reqStopPolling(){ if(_reqPollInterval){ clearInterval(_reqPollInterval); _reqPollInterval = null; } _reqLastCount = 0; }
  window._reqStartPolling = reqStartPolling;
  window._reqStopPolling  = reqStopPolling;

  // ── Soumettre une demande ─────────────────────────────────────
  window.reqSubmit = async function(payload, existingProduct){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    var username = user.username || user.name || 'user';
    try {
      var h = reqHeaders();
      var now = Date.now();
      var toSend = Object.assign({}, payload, {
        id:           payload.id || ('p_' + now + '_' + Math.random().toString(36).substr(2,6)),
        user:         username,
        createdAt:    payload.createdAt || now,
        updatedAt:    now,
        _reqUser:     username,
        _reqAt:       now,
        _reqOriginal: existingProduct || null
      });
      var r = await fetch(sUrl + '/pushDatasReq', { method:'POST', headers:h, body:JSON.stringify([toSend]) });
      return r.ok;
    } catch(e) { console.warn('reqSubmit:', e); return false; }
  };

  // ── Annuler une demande ───────────────────────────────────────
  window.reqCancel = async function(ref){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    var username = user.username || user.name || 'user';
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(username), { method:'DELETE', headers:h });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(username), { method:'DELETE', headers:h }).catch(function(){});
      return r.ok;
    } catch(e) { return false; }
  };

  // ── Annuler SON PROPRE rapport de bug (API bugs — équivalent de reqCancel
  // ci-dessus pour les demandes produit) ── Pas de garde admin, comme
  // reqCancel : n'importe quel utilisateur connecté peut retirer son propre
  // rapport, contrairement à reqResolveBug (réservé à l'admin).
  // bugId : UUID du bug (champ "id" généré serveur, adressage réel de l'API
  // documentée — ce n'était PAS "ref"+"user" comme l'ancienne API demandes).
  // attachmentId : UUID de la pièce jointe éventuelle, une ressource séparée
  // avec son propre identifiant — peut être null/undefined si aucune image.
  window.reqCancelBug = async function(bugId, attachmentId){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/deleteBugs?id=' + encodeURIComponent(bugId), { method:'DELETE', headers:h });
      if(attachmentId) await fetch(sUrl + '/deleteBugsFiles?attachmentId=' + encodeURIComponent(attachmentId), { method:'DELETE', headers:h }).catch(function(){});
      return r.ok;
    } catch(e) { return false; }
  };

  // ── Transfère les docs/images joints à une demande vers le vrai produit ──
  // reqRef/reqUser : identifient la demande côté _req. productRef : ref du
  // produit réel une fois accepté (généralement identique à reqRef, sauf cas
  // rares de ref changée par l'admin en éditant avant validation).
  // Limite connue : pullDocsReq renvoie un ZIP quand il y a 2+ fichiers, et
  // ce codebase n'a pas de lib de dézippage côté client — seul le cas
  // "1 fichier joint" (de très loin le plus courant) est migré automatique-
  // ment ; au-delà, un avertissement est affiché plutôt que d'échouer en
  // silence ou de risquer une migration incorrecte.
  async function _reqMigrateDocsToProduct(reqRef, reqUser, productRef){
    var sUrl = reqServerUrl(); if(!sUrl) return;
    try {
      var hGet = Object.assign({}, reqHeaders()); delete hGet['Content-Type'];
      var rList = await fetch(sUrl + '/pullDocsReq?nofile=true&ref=' + encodeURIComponent(reqRef) + '&user=' + encodeURIComponent(reqUser), { headers: hGet, cache: 'no-store' });
      if(!rList.ok) return;
      var dList = await rList.json();
      var files = dList && dList.items ? dList.items : [];
      if(!files.length) return;
      if(files.length > 1){
        console.warn('_reqMigrateDocsToProduct: ' + files.length + ' fichiers joints, migration auto limitée à 1 — à récupérer manuellement si besoin.');
        if(typeof showToast === 'function') showToast(files.length + ' fichiers joints à cette demande — un seul a pu être transféré automatiquement', 'warn', 5000);
      }
      var rFile = await fetch(sUrl + '/pullDocsReq?ref=' + encodeURIComponent(reqRef) + '&user=' + encodeURIComponent(reqUser), { headers: hGet, cache: 'no-store' });
      if(!rFile.ok) return;
      var blob = await rFile.blob();
      var cd = rFile.headers.get('Content-Disposition') || '';
      var m = /filename="([^"]*)"/.exec(cd);
      var filename = m ? m[1] : (files[0].filename || 'document');
      if(/\.zip$/i.test(filename)) return; // 2+ fichiers : cas non géré, déjà signalé ci-dessus
      var fd = new FormData();
      fd.append('ref', productRef);
      fd.append('document', blob, filename);
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      await fetch(sUrl + '/pushDocs', { method:'POST', headers:h, body:fd });
    } catch(e) { console.warn('_reqMigrateDocsToProduct:', e); }
  }

  // ── Accepter une demande ──────────────────────────────────────
  // overrideData : si fourni (édition admin), utiliser directement ces données
  //                 au lieu de re-fetcher depuis le serveur
  window.reqAccept = async function(ref, user, overrideData){
    var sUrl = reqServerUrl(); if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = reqHeaders();
      var hGet = Object.assign({}, h); delete hGet['Content-Type'];
      var item;
      if(overrideData){
        // Données déjà éditées côté admin — on les utilise directement
        item = Object.assign({}, overrideData);
      } else {
        // Cas normal : récupérer depuis le serveur
        var r = await fetch(sUrl + '/pullDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { headers: hGet, cache: 'no-store' });
        if(!r.ok) return false;
        var d = await r.json();
        if(!d.items || !d.items.length) return false;
        item = d.items[0].data || {};
      }
      // Garde-fou : un rapport de bug (type:"bug") n'est PAS un produit — ne
      // doit jamais être poussé dans le vrai catalogue via /pushDatas.
      // Nécessaire ici, au niveau le plus bas, car "Accepter tout" boucle
      // sur toutes les demandes sans distinction (voir btnAcceptAllRequests) :
      // un garde-fou seulement dans l'UI de détail n'aurait pas suffi. Ne
      // devrait normalement plus jamais se déclencher depuis la migration
      // vers l'API bugs dédiée (les rapports ne transitent plus par
      // /pullDatasReq) — conservé par sécurité pour d'éventuels rapports
      // historiques encore présents côté serveur dans l'ancien stockage.
      if(item.type === 'bug') return await window.reqResolveBug(ref, item.attachmentId || null);
      delete item._reqUser; delete item._reqAt; delete item._reqOriginal; delete item.user;
      item.updatedAt = Date.now();
      var r2 = await fetch(sUrl + '/pushDatas', { method:'POST', headers:h, body:JSON.stringify([item]) });
      if(!r2.ok) return false;
      // Transférer les documents/images joints à la demande vers le vrai
      // produit avant de les supprimer côté _req — sinon ils disparaissent
      // silencieusement à l'acceptation (retour utilisateur : les fichiers
      // joints doivent suivre le produit une fois validé, pas se perdre).
      await _reqMigrateDocsToProduct(ref, user, item.ref || ref);
      await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:hGet });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:hGet }).catch(function(){});
      return true;
    } catch(e) { console.warn('reqAccept:', e); return false; }
  };

  // ── Joindre des fichiers (PDF/images) à une demande produit déjà envoyée ──
  // Utilisé après reqSubmit() côté "Proposer un produit/une modification"
  // (voir btnSave dans actions.js) — même endpoint et même logique
  // d'upload différé que reqSubmitBug ci-dessous, réutilisé pour éviter la
  // duplication. Un échec d'upload ne remet pas en cause la demande déjà
  // enregistrée, juste signalé en console.
  window.reqUploadAttachedFiles = async function(ref, files){
    var sUrl = reqServerUrl(); if(!sUrl || !files || !files.length) return;
    var user = reqCurrentUser(); if(!user) return;
    var username = user.username || user.name || 'user';
    var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
    for(var i = 0; i < files.length; i++){
      try {
        var fd = new FormData();
        fd.append('ref', ref);
        fd.append('req_user', username);
        fd.append('document', files[i], files[i].name);
        var r = await fetch(sUrl + '/pushDocsReq', { method:'POST', headers:h, body:fd });
        if(!r.ok) console.warn('reqUploadAttachedFiles: échec pour', files[i].name, 'HTTP', r.status);
      } catch(e) { console.warn('reqUploadAttachedFiles:', e); }
    }
  };

  // ── Version affichée de l'app, envoyée comme "appVersion" côté API bugs ──
  // Lue directement dans le Cache Storage plutôt que dupliquée en dur ici :
  // le nom du cache ouvert par sw.js EST déjà la source de vérité de la
  // version ("spi-catalogue-vNNN", voir CACHE dans sw.js) — la relire évite
  // un second numéro de version à maintenir manuellement en synchro.
  async function _reqAppVersion(){
    try {
      if(typeof caches === 'undefined') return '';
      var keys = await caches.keys();
      var match = keys.find(function(k){ return /^spi-catalogue-v\d+$/.test(k); });
      return match ? match.replace('spi-catalogue-', '') : '';
    } catch(e) { return ''; }
  }

  // Normalise un enregistrement brut renvoyé par /pullBugs vers la même
  // forme {ref, user, data} que les items de /pullDatasReq, pour que
  // l'affichage/les actions (déjà écrits pour les demandes produit) restent
  // partagés sans dupliquer tout le rendu.
  // Forme réelle CONFIRMÉE côté serveur (test direct "Try it out" du
  // Swagger, pas juste la doc) : {id, data:{title,description,severity,
  // stepsToReproduce,appVersion}, createdBy, createdAt, updatedAt,
  // attachments:[...]} — même enveloppe que /pullDatasReq (champs à plat
  // enveloppés dans "data"), PAS les champs à plat qu'on aurait pu déduire
  // de la seule doc des paramètres d'entrée. createdAt/updatedAt sont en
  // epoch millisecondes (nombre), pas en chaîne ISO.
  // "attachments" vu vide dans le test (aucune pièce jointe) — la forme de
  // chaque entrée n'a donc pas pu être confirmée : lecture défensive sur
  // "attachmentId"/"id" au cas où, en tolérant aussi une chaîne brute.
  function _reqNormalizeBugItem(b){
    b = b || {};
    var raw = b.data || b; // tolère aussi une forme à plat si jamais elle diffère un jour
    var attachments = Array.isArray(b.attachments) ? b.attachments : [];
    var attId = null;
    if(attachments.length){
      var first = attachments[0];
      attId = (typeof first === 'string') ? first : (first.attachmentId || first.id || null);
    }
    var authorName = b.createdBy || b.user || b.username || b.reportedBy || raw._reqUser || '';
    var atMs = null;
    if(typeof b.createdAt === 'number') atMs = b.createdAt;
    else if(b.createdAt) atMs = Date.parse(b.createdAt) || null;
    else if(b._reqAt) atMs = b._reqAt;
    var data = {
      type: 'bug',
      title: raw.title || '',
      description: raw.description || '',
      severity: raw.severity || '',
      stepsToReproduce: Array.isArray(raw.stepsToReproduce) ? raw.stepsToReproduce : [],
      appVersion: raw.appVersion || '',
      hasImage: !!attId,
      attachmentId: attId,
      _reqUser: authorName,
      _reqAt: atMs
    };
    return { ref: b.id, user: authorName || '—', data: data, attachmentId: attId };
  }

  // ── Signaler un bug ───────────────────────────────────────────
  // API dédiée aux bugs (checkBugs/pushBugs/pullBugs/deleteBugs +
  // pushBugsFiles/pullBugsFiles/deleteBugsFiles), séparée de celle des
  // demandes produit — voir mémoire "bug-report-api-migration". Payload en
  // OBJET UNIQUE (pas un tableau comme /pushDatasReq) avec des champs figés
  // par la doc Swagger : title/description/severity/stepsToReproduce/
  // appVersion. Les IDs sont générés côté serveur (champ "id" renvoyé),
  // contrairement à l'ancienne API où le client générait "ref".
  // imageBlob : fichier binaire déjà compressé (voir _bugCompressImage) ou
  // null. Envoyé séparément via /pushBugsFiles (ressource distincte, avec
  // son propre attachmentId) — jamais en base64 dans le JSON de /pushBugs.
  window.reqSubmitBug = async function(title, description, severity, imageBlob){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    try {
      var h = reqHeaders();
      // stepsToReproduce : pas de champ dédié dans le formulaire (pour ne
      // pas surcharger l'UI sans confirmation des besoins réels) — dérivé
      // au mieux de la description, une ligne = une étape. Le champ étant
      // probablement requis côté API (tableau, pas nullable), on retombe
      // sur la description entière comme étape unique si elle tient sur
      // une seule ligne.
      var steps = (description || '').split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
      if(!steps.length) steps = [description || ''];
      var appVersion = await _reqAppVersion();
      var toSend = {
        title: title,
        description: description,
        severity: severity || 'medium',
        stepsToReproduce: steps,
        appVersion: appVersion
      };
      var r = await fetch(sUrl + '/pushBugs', { method:'POST', headers:h, body:JSON.stringify(toSend) });
      if(!r.ok) return false;
      // Réponse attendue : l'UUID du bug créé (exemple Swagger "string",
      // donc soit une chaîne JSON brute soit un objet {id:...}) — lecture
      // défensive des deux formes.
      var bugId = null;
      try {
        var created = await r.json();
        bugId = (typeof created === 'string') ? created : (created && (created.id || created.bugId)) || null;
      } catch(eParse){}
      if(imageBlob && bugId){
        var hUp = Object.assign({}, reqHeaders()); delete hUp['Content-Type']; // laisser fetch fixer le boundary multipart
        var fd = new FormData();
        fd.append('bug_id', bugId);
        fd.append('attachment', imageBlob, 'capture.jpg');
        var rImg = await fetch(sUrl + '/pushBugsFiles', { method:'POST', headers:hUp, body:fd });
        // Le rapport lui-même est déjà enregistré à ce stade — un échec
        // d'upload de l'image ne doit pas faire perdre tout le rapport,
        // juste signaler que l'image n'est pas jointe.
        if(!rImg.ok) console.warn('reqSubmitBug: image non envoyée, HTTP', rImg.status);
      } else if(imageBlob && !bugId){
        console.warn('reqSubmitBug: bug créé mais id introuvable dans la réponse — image non envoyée');
      }
      return true;
    } catch(e) { console.warn('reqSubmitBug:', e); return false; }
  };

  // ── Marquer un bug comme résolu (supprime le rapport ET l'image jointe le
  //     cas échéant, sans jamais toucher au catalogue produit — API bugs
  //     entièrement séparée de celle des demandes produit) ──
  // bugId : UUID renvoyé par /pushBugs (champ "id"). attachmentId : UUID de
  // la pièce jointe éventuelle (ressource séparée, peut être null).
  window.reqResolveBug = async function(bugId, attachmentId){
    var sUrl = reqServerUrl(); if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/deleteBugs?id=' + encodeURIComponent(bugId), { method:'DELETE', headers:h });
      if(attachmentId) await fetch(sUrl + '/deleteBugsFiles?attachmentId=' + encodeURIComponent(attachmentId), { method:'DELETE', headers:h }).catch(function(){});
      return r.ok;
    } catch(e) { console.warn('reqResolveBug:', e); return false; }
  };

  // ── Refuser une demande ───────────────────────────────────────
  window.reqRefuse = async function(ref, user){
    var sUrl = reqServerUrl(); if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:h });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:h }).catch(function(){});
      return true;
    } catch(e) { return false; }
  };

  // ── Modale détail demande ─────────────────────────────────────
  function reqOpenDetail(item, user){
    var data     = item.data || {};
    // Rapport de bug : rien à voir avec un produit (pas de nom/prix/famille…)
    // — vue dédiée séparée plutôt que de forcer les champs produit ci-dessous
    // sur des données qui n'en ont pas.
    if(data.type === 'bug') return _reqOpenBugDetail(item, user);
    // Produit : ouvre directement le formulaire complet, verrouillé par
    // défaut (fusion de l'ancienne vue résumé + fenêtre "Modifier" séparée
    // en une seule fenêtre — voir _openReviewModal/_reviewSetLocked dans
    // js/modal.js). "Accepter"/"Refuser" agissent directement depuis cet
    // état verrouillé ; "Modifier" déverrouille SUR CETTE MÊME fenêtre,
    // sans en ouvrir une autre (retour utilisateur).
    //
    // Masquer (pas fermer) le panneau "Demandes en attente" AVANT d'ouvrir
    // ce formulaire : #modalOverlay a un z-index bien plus bas (500) que
    // #requestsOverlay (10800), donc il resterait caché derrière sinon
    // (retour utilisateur répété : superposition persistante). _reqHidePanel
    // (pas reqClosePanel) garde son état "ouvert" intact — au retour, elle
    // réapparaît instantanément, comme si elle était restée cachée derrière
    // la fiche plutôt que fermée puis rouverte (retour utilisateur).
    if(typeof _reqHidePanel === 'function') _reqHidePanel();
    if(typeof window._openReviewModal === 'function') window._openReviewModal(item, user, true);
  }

  // Vue détail dédiée pour un rapport de bug — même fenêtre/animation que le
  // détail d'une demande produit, mais un contenu et des actions totalement
  // différents (pas de diff de champs, pas de bouton "Modifier le produit",
  // "Accepter" devient "Marquer résolu" et ne touche jamais /pushDatas).
  function _reqOpenBugDetail(item, user){
    var data    = item.data || {};
    var overlay = document.getElementById('reqDetailOverlay');
    if(!overlay) return;
    var ctx = data.context || {};

    var titleEl = document.getElementById('reqDetailTitle');
    var subtitleEl = document.getElementById('reqDetailSubtitle');
    if(titleEl)    titleEl.innerHTML = '<i class="ti ti-bug"></i> ' + escapeHtml(data.title || 'Bug signalé');
    if(subtitleEl){
      var subParts = [];
      if(user && user !== '—') subParts.push('Signalé par ' + user);
      if(data.severity) subParts.push('Gravité : ' + data.severity);
      if(data._reqAt) subParts.push(new Date(data._reqAt).toLocaleString('fr-FR'));
      subtitleEl.textContent = subParts.join(' · ');
    }

    var body = document.getElementById('reqDetailBody');
    if(!body) return;
    var ctxRows = [
      ['PAGE', ctx.page],
      ['NAVIGATEUR', ctx.userAgent],
      ['FENÊTRE', ctx.viewport]
    ].filter(function(r){ return !!r[1]; });
    var ctxHtml = ctxRows.length
      ? '<div class="vm-meta" style="margin-top:16px;">' + ctxRows.map(function(r){
          return '<div class="vm-meta-item"><label>' + escapeHtml(r[0]) + '</label><span style="word-break:break-all;">' + escapeHtml(r[1]) + '</span></div>';
        }).join('') + '</div>'
      : '';
    // Journal d'erreurs JS capturées juste avant l'envoi (voir popup.js) —
    // utile pour diagnostiquer un vrai bug de code, pas juste un souci
    // d'ergonomie. Vide si rien d'anormal ne s'est produit récemment.
    // Toujours affiché (même vide) : sinon rien ne distingue "le mécanisme a
    // tourné et n'a rien trouvé d'anormal" de "le mécanisme n'a pas marché",
    // ce qui donnait l'impression que la capture de logs était cassée
    // (retour utilisateur, capture à l'appui).
    var logs = Array.isArray(ctx.recentLogs) ? ctx.recentLogs : [];
    var logsHtml = '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin:16px 0 6px;">Journal technique (' + logs.length + ')</div>';
    if(logs.length){
      logsHtml += '<div style="background:#0F172A;color:#E2E8F0;border-radius:8px;padding:10px 12px;font-family:Menlo,Consolas,monospace;font-size:11px;line-height:1.6;max-height:220px;overflow-y:auto;">'
        + logs.map(function(l){
            var color = l.type === 'error' || l.type === 'unhandledrejection' || l.type === 'console.error' ? '#FCA5A5' : '#FCD34D';
            return '<div style="margin-bottom:6px;"><span style="color:#64748B;">[' + escapeHtml(l.type) + ']</span> <span style="color:' + color + ';">' + escapeHtml(l.message||'') + '</span>'
              + (l.source ? '<br><span style="color:#64748B;">' + escapeHtml(l.source) + '</span>' : '')
              + '</div>';
          }).join('')
        + '</div>';
    } else {
      logsHtml += '<div style="color:var(--ink-soft);font-size:12px;font-style:italic;">Aucune erreur ni avertissement récent au moment de l\'envoi.</div>';
    }
    var imageHtml = data.hasImage
      ? '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin:16px 0 6px;">Capture d\'écran</div>'
        + '<div id="reqBugImageWrap" style="color:var(--ink-soft);font-size:12.5px;"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite;"></i> Chargement…</div>'
      : '';
    body.innerHTML =
      '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin-bottom:6px;">Description</div>'
      + '<div class="vm-desc" style="white-space:pre-wrap;">' + escapeHtml(data.description || '(aucune description)') + '</div>'
      + imageHtml
      + ctxHtml
      + logsHtml;

    // L'image n'est jamais dans le JSON (voir reqSubmitBug) — récupérée à
    // part depuis l'API fichiers dédiée aux bugs, via l'UUID de la pièce
    // jointe (attachmentId), distinct de l'UUID du bug lui-même.
    if(data.hasImage && data.attachmentId){
      (function(){
        var sUrl = reqServerUrl();
        var hImg = Object.assign({}, reqHeaders()); delete hImg['Content-Type'];
        fetch(sUrl + '/pullBugsFiles?attachmentId=' + encodeURIComponent(data.attachmentId), { headers: hImg, cache: 'no-store' })
          .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
          .then(function(blob){
            var wrap = document.getElementById('reqBugImageWrap');
            if(!wrap) return; // fenêtre déjà refermée entretemps
            var url = URL.createObjectURL(blob);
            wrap.innerHTML = '<img src="' + url + '" style="max-width:100%;border-radius:8px;border:1px solid var(--line);cursor:zoom-in;">';
            wrap.querySelector('img').addEventListener('click', function(){ window.open(url, '_blank'); });
          })
          .catch(function(e){
            var wrap = document.getElementById('reqBugImageWrap');
            if(wrap) wrap.textContent = 'Image indisponible (' + e.message + ')';
          });
      })();
    }

    var btnAcc = document.getElementById('reqDetailAccept');
    var btnRef = document.getElementById('reqDetailRefuse');
    var btnEdit = document.getElementById('reqDetailEdit');
    // Pas de "Modifier le produit" ni de "Refuser" distinct pour un bug —
    // une seule action : marquer résolu (= supprimer la remontée).
    if(btnEdit) btnEdit.style.display = 'none';
    if(btnRef)  btnRef.style.display  = 'none';
    if(btnAcc){
      btnAcc.style.display = '';
      btnAcc.disabled = false;
      btnAcc.innerHTML = '<i class="ti ti-check"></i> Marquer résolu';
      btnAcc.onclick = async function(){
        btnAcc.disabled = true; btnAcc.textContent = '…';
        var ok = await window.reqResolveBug(item.ref, data.attachmentId || null);
        if(ok){ _reqDetailClose(overlay); showToast('Bug marqué comme résolu ✓', 'ok', 2500); reqOpenPanel(); reqUpdateBadge(); }
        else { btnAcc.disabled = false; btnAcc.innerHTML = '<i class="ti ti-check"></i> Marquer résolu'; }
      };
    }

    document.getElementById('reqDetailClose').onclick = function(){ _reqDetailClose(overlay); };
    overlay.onclick = null;
    overlay.style.display = 'flex';
    overlay.classList.add('open');
    document.body.classList.add('modal-open');
  }

  // Ferme la fenêtre détail demande avec la même animation de sortie que les
  // autres fenêtres centrées — laisse la transition CSS se jouer avant de
  // masquer complètement, sinon la prochaine ouverture réapparaîtrait
  // instantanément (classe déjà présente, rien à (re)déclencher).
  function _reqDetailClose(overlay){
    overlay.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(function(){
      if(!overlay.classList.contains('open')) overlay.style.display = 'none';
    }, 350);
  }


  // ── Charger les demandes admin ────────────────────────────────
  // Deux sources désormais séparées : /pullDatasReq (demandes produit) et
  // /pullBugs (rapports de bug, API dédiée — voir mémoire
  // "bug-report-api-migration") — combinées côté client pour l'affichage.
  // Le filtre type==="bug" sur les items de /pullDatasReq est conservé par
  // sécurité (d'éventuels anciens rapports encore présents côté serveur
  // depuis avant cette migration), mais ne devrait plus jamais rien
  // attraper pour les nouveaux rapports, tous envoyés via /pushBugs.
  async function reqLoadAdminList(){
    var sUrl = reqServerUrl();
    var body = document.getElementById('requestsBody');
    if(!body) return;
    body.innerHTML = '<div class="req-empty"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var rProd = await fetch(sUrl + '/pullDatasReq', { headers: h, cache: 'no-store' });
      if(!rProd.ok) throw new Error('HTTP ' + rProd.status);
      var dProd = await rProd.json();
      var prodRaw = dProd.items || [];

      // Forme de la réponse non confirmée par la doc Swagger (au-delà des
      // champs de chaque bug) — lecture défensive : tableau brut, {items:},
      // ou {data:}.
      var bugItemsRaw = [];
      try {
        var rBugs = await fetch(sUrl + '/pullBugs', { headers: h, cache: 'no-store' });
        if(rBugs.ok){
          var dBugs = await rBugs.json();
          bugItemsRaw = Array.isArray(dBugs) ? dBugs : (dBugs && (dBugs.items || dBugs.data)) || [];
        }
      } catch(eBugs){ console.warn('reqLoadAdminList: /pullBugs indisponible', eBugs); }
      var bugRaw = bugItemsRaw.map(_reqNormalizeBugItem);

      var items = prodRaw.concat(bugRaw);
      if(items.length === 0){
        body.innerHTML = '<div class="req-empty"><i class="ti ti-bell-off" style="font-size:32px;display:block;margin-bottom:8px;"></i>Aucune demande en attente</div>';
        var footer = document.getElementById('requestsFooter');
        if(footer) footer.style.display = 'none';
        return;
      }
      var footer = document.getElementById('requestsFooter');
      if(footer) footer.style.display = 'flex';

      // Séparer d'abord demandes produit / rapports de bug (retour
      // utilisateur : les deux catégories n'ont rien à voir, ne pas les
      // mélanger dans la même liste), puis regrouper par utilisateur DANS
      // chaque catégorie, comme avant.
      function groupByUser(list){
        var byUser = {};
        list.forEach(function(it){
          var data = it.data || {};
          var u = data._reqUser || it.user || '?';
          if(!byUser[u]) byUser[u] = [];
          byUser[u].push({ ref: it.ref, data: data });
        });
        return byUser;
      }
      function renderSection(title, iconHtml, list){
        if(!list.length) return '';
        var byUser = groupByUser(list);
        var html = '<div style="padding:12px 20px 4px;font-size:12px;font-weight:700;color:var(--ink);border-top:1px solid var(--line);">' + iconHtml + ' ' + title + ' — ' + list.length + '</div>';
        Object.keys(byUser).forEach(function(u){
          html += '<div style="padding:8px 20px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);background:var(--paper);"><i class="ti ti-user" style="font-size:12px;"></i> ' + escapeHtml(u) + ' — ' + byUser[u].length + '</div>';
          byUser[u].forEach(function(item){ html += reqRenderAdminItem(item, u); });
        });
        return html;
      }

      var productItems = prodRaw.filter(function(it){ return (it.data||{}).type !== 'bug'; });
      // bugRaw (déjà normalisé ci-dessus) d'abord, puis d'éventuels rapports
      // historiques encore présents côté /pullDatasReq depuis avant la
      // migration (garde-fou, voir commentaire en tête de fonction).
      var bugItems = bugRaw.concat(prodRaw.filter(function(it){ return (it.data||{}).type === 'bug'; }));

      var html = renderSection('Demandes produit', '<i class="ti ti-package"></i>', productItems)
               + renderSection('Bugs signalés', '<i class="ti ti-bug"></i>', bugItems);
      body.innerHTML = html;

      // Clic → modale détail
      body.querySelectorAll('[data-req-detail]').forEach(function(el){
        el.addEventListener('click', function(){
          var ref  = el.getAttribute('data-req-detail');
          var user = el.getAttribute('data-req-user-detail');
          var matchItem = items.find(function(it){ return it.ref === ref; });
          if(matchItem) reqOpenDetail(matchItem, user);
        });
      });
    } catch(e){
      body.innerHTML = '<div class="req-empty">Erreur : ' + escapeHtml(e.message) + '</div>';
    }
  }

  function reqRenderAdminItem(item, user){
    var data   = item.data || {};
    var reqAt  = data._reqAt ? new Date(data._reqAt).toLocaleString('fr-FR') : '';
    var refKey = escapeHtml(item.ref);
    var userKey = escapeHtml(user);
    var isBug  = data.type === 'bug';
    var isNew  = !data._reqOriginal;
    var titleText = isBug ? (data.title || 'Bug signalé') : item.ref;
    var subText   = isBug ? ((data.description||'').slice(0,80) + ((data.description||'').length > 80 ? '…' : '')) : (data.name || '');
    var badgeBg   = isBug ? '#FEE2E2' : (isNew ? '#DCFCE7' : '#FEF3C7');
    var badgeFg   = isBug ? '#991B1B' : (isNew ? '#065F46' : '#92400E');
    var badgeText = isBug ? '<i class="ti ti-bug"></i> Bug' : (isNew ? 'Nouveau' : 'Modification');
    return '<div class="req-item" style="cursor:pointer;" data-req-detail="' + refKey + '" data-req-user-detail="' + userKey + '">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;">'
      +   '<div>'
      +     '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(titleText) + '</div>'
      +     '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(subText) + (reqAt ? ' · ' + reqAt : '') + '</div>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px;">'
      +     '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:' + badgeBg + ';color:' + badgeFg + ';font-weight:700;">' + badgeText + '</span>'
      +     '<i class="ti ti-chevron-right" style="font-size:14px;color:var(--ink-soft);"></i>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Charger mes demandes ──────────────────────────────────────
  // Deux sources séparées, comme reqLoadAdminList — voir son commentaire.
  async function reqLoadMineList(){
    var sUrl = reqServerUrl();
    var body = document.getElementById('requestsBody');
    if(!body) return;
    var user = reqCurrentUser();
    if(!user){ body.innerHTML = '<div class="req-empty">Non connecté</div>'; return; }
    var username = user.username || user.name || '';
    body.innerHTML = '<div class="req-empty"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var rProd = await fetch(sUrl + '/pullDatasReq?user=' + encodeURIComponent(username), { headers: h, cache: 'no-store' });
      if(!rProd.ok) throw new Error('HTTP ' + rProd.status);
      var dProd = await rProd.json();
      var prodRaw = dProd.items || [];

      // /pullBugs ne documente aucun paramètre "user" (seulement id/date) —
      // contrairement à /pullDatasReq. Hypothèse : le serveur scope déjà la
      // réponse via le token d'auth envoyé dans les headers (admin = tout,
      // utilisateur normal = ses propres rapports), comme c'est l'usage pour
      // une API dédiée avec authentification. À vérifier côté serveur si
      // cette liste s'avère incomplète ou trop large en pratique.
      var bugItemsRaw = [];
      try {
        var rBugs = await fetch(sUrl + '/pullBugs', { headers: h, cache: 'no-store' });
        if(rBugs.ok){
          var dBugs = await rBugs.json();
          bugItemsRaw = Array.isArray(dBugs) ? dBugs : (dBugs && (dBugs.items || dBugs.data)) || [];
        }
      } catch(eBugs){ console.warn('reqLoadMineList: /pullBugs indisponible', eBugs); }
      var bugRaw = bugItemsRaw.map(_reqNormalizeBugItem);

      var items = prodRaw.concat(bugRaw);
      var footer = document.getElementById('requestsFooter');
      if(footer) footer.style.display = 'none';
      if(items.length === 0){
        body.innerHTML = '<div class="req-empty"><i class="ti ti-check-circle" style="font-size:32px;display:block;margin-bottom:8px;color:#059669;"></i>Aucune demande en attente</div>';
        return;
      }
      function renderMineItem(it){
        var data  = it.data || {};
        var isBug = data.type === 'bug';
        var reqAt = data._reqAt ? new Date(data._reqAt).toLocaleString('fr-FR') : '';
        var titleText = isBug ? (data.title || 'Bug signalé') : it.ref;
        var subText   = isBug ? ((data.description||'').slice(0,80) + ((data.description||'').length > 80 ? '…' : '')) : (data.name || '');
        return '<div class="req-item">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;">'
          +   '<div><div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(titleText) + '</div>'
          +   '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(subText) + (reqAt ? ' · Soumis le ' + reqAt : '') + '</div></div>'
          +   '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;font-weight:700;">En attente</span>'
          + '</div>'
          + '<div class="req-actions"><button class="req-btn-cancel" data-req-cancel="' + escapeHtml(it.ref) + '" data-req-cancel-bug="' + (isBug ? '1' : '0') + '" data-req-cancel-attachment="' + escapeHtml(data.attachmentId || '') + '"><i class="ti ti-trash"></i> Annuler</button></div>'
          + '</div>';
      }
      // Même séparation que côté admin : demandes produit et bugs signalés
      // dans deux sections distinctes plutôt que mélangés.
      var mineProduct = prodRaw.filter(function(it){ return (it.data||{}).type !== 'bug'; });
      var mineBugs     = bugRaw.concat(prodRaw.filter(function(it){ return (it.data||{}).type === 'bug'; }));
      var html = '';
      if(mineProduct.length){
        html += '<div style="padding:10px 20px 4px;font-size:12px;font-weight:700;color:var(--ink);"><i class="ti ti-package"></i> Demandes produit</div>';
        html += mineProduct.map(renderMineItem).join('');
      }
      if(mineBugs.length){
        html += '<div style="padding:10px 20px 4px;font-size:12px;font-weight:700;color:var(--ink);border-top:1px solid var(--line);"><i class="ti ti-bug"></i> Bugs signalés</div>';
        html += mineBugs.map(renderMineItem).join('');
      }
      body.innerHTML = html;
      body.querySelectorAll('[data-req-cancel]').forEach(function(btn){
        btn.addEventListener('click', async function(){
          var ref = btn.getAttribute('data-req-cancel');
          var isBug = btn.getAttribute('data-req-cancel-bug') === '1';
          var attachmentId = btn.getAttribute('data-req-cancel-attachment') || null;
          if(!(await customConfirm('Annuler la demande ?', 'Annuler la demande pour ' + escapeHtml(ref) + ' ?', { okLabel: 'Annuler la demande', danger: true }))) return;
          btn.disabled = true;
          // Rapport de bug → API dédiée (reqCancelBug), sinon demande
          // produit classique (reqCancel) — deux stockages désormais
          // distincts côté serveur.
          var ok = isBug ? await window.reqCancelBug(ref, attachmentId) : await window.reqCancel(ref);
          if(ok){ showToast('Demande annulée', 'ok', 2000); reqLoadMineList(); }
          else { showToast('Erreur', 'err', 3000); btn.disabled = false; }
        });
      });
    } catch(e){
      body.innerHTML = '<div class="req-empty">Erreur : ' + escapeHtml(e.message) + '</div>';
    }
  }

  // ── Ouvrir le panneau ─────────────────────────────────────────
  function reqOpenPanel(){
    var overlay = document.getElementById('requestsOverlay');
    if(!overlay) return;
    // Fermer la fiche produit si elle est déjà ouverte (ex. revue d'une
    // demande) avant d'afficher ce panneau par-dessus — sinon les deux
    // fenêtres restaient superposées (retour utilisateur, capture à
    // l'appui : "Demandes en attente" ouvert derrière une fiche produit).
    // Passe par requestCloseModal() plutôt qu'un close direct pour respecter
    // la confirmation de saisie non enregistrée si le formulaire est
    // déverrouillé avec des modifications en cours.
    var modalOverlayEl = document.getElementById('modalOverlay');
    if(modalOverlayEl && modalOverlayEl.classList.contains('open') && typeof requestCloseModal === 'function'){
      requestCloseModal();
    }
    // Carte centrée comme les autres fenêtres de l'app (fiche produit,
    // formulaire d'ajout, détail d'une demande) : classe .open déclenche
    // fadeBgEdit + slideUp en CSS. Animation par @keyframes, pas besoin du
    // forçage de reflow requis pour une transition (voir .settings-box).
    overlay.style.display = 'flex';
    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    reqRefreshPanel();
  }

  function reqRefreshPanel(){
    var subtitle  = document.getElementById('requestsPanelSubtitle');
    var tabAdmin  = document.getElementById('reqTabAdmin');
    var tabMine   = document.getElementById('reqTabMine');
    var tabsDiv   = document.getElementById('requestsTabs');
    var isAdmin   = reqIsAdmin();

    // Admins : onglet unique "Demandes reçues", cacher "Mes demandes" et la barre d'onglets
    if(isAdmin){
      if(tabsDiv) tabsDiv.style.display = 'none';
      _reqPanelTab = 'admin';
      reqLoadAdminList();
      if(subtitle) subtitle.textContent = 'Modifications proposées par les utilisateurs';
    } else {
      if(tabsDiv) tabsDiv.style.display = '';
      if(tabAdmin) tabAdmin.style.display = 'none';
      _reqPanelTab = 'mine';
      reqLoadMineList();
      if(subtitle) subtitle.textContent = 'Vos modifications en attente de validation';
    }
  }

  // Masque/révèle le panneau SANS le fermer (garde sa classe .open, son
  // contenu déjà chargé, sa position de scroll) — utilisé quand la fiche
  // produit s'ouvre par-dessus pour une simple consultation (pas
  // accepter/refuser, qui eux changent la liste et doivent la rafraîchir
  // via reqOpenPanel()). Donne l'impression que le panneau est resté "juste
  // caché derrière" la fiche plutôt que fermé puis rouvert avec ré-
  // animation et re-chargement (retour utilisateur).
  function _reqHidePanel(){
    var overlay = document.getElementById('requestsOverlay');
    if(overlay) overlay.style.display = 'none';
  }
  function _reqRevealPanel(){
    var overlay = document.getElementById('requestsOverlay');
    if(overlay && overlay.classList.contains('open')){
      overlay.style.display = 'flex';
      document.body.classList.add('modal-open');
    }
  }

  function reqClosePanel(){
    var overlay = document.getElementById('requestsOverlay');
    if(overlay){
      overlay.classList.remove('open');
      // Laisser l'animation de sortie se terminer avant de masquer
      // complètement (même durée que slideUp/fadeBgEdit, ~350ms).
      setTimeout(function(){
        if(!overlay.classList.contains('open')) overlay.style.display = 'none';
      }, 350);
    }
    document.body.classList.remove('modal-open');
    // Sur mobile/tablette, si "Demandes en attente" a été ouvert DEPUIS le
    // tiroir menu (voir js/actions.js), la croix doit "revenir" au menu
    // plutôt que de retomber sur la page du dessous (retour utilisateur).
    // Ne se déclenche que pour cette entrée précise — pas pour un accepter/
    // refuser (qui rafraîchit la liste sans fermer) ni pour une fermeture
    // depuis le menu ⋮ desktop (jamais mis à true dans ce cas).
    if(window._reqOpenedFromMobileMenu){
      window._reqOpenedFromMobileMenu = false;
      if(typeof window._openMenuSheet === 'function') window._openMenuSheet();
    }
  }

  // ── Init listeners ────────────────────────────────────────────
  // ── Fenêtre "Signaler un bug" ────────────────────────────────────
  // Fichier binaire (Blob), pas du base64 — même logique que les PDF déjà
  // gérés par l'app : l'image part sur /pushDocsReq (multipart), la demande
  // elle-même sur /pushDatasReq ne porte qu'un indicateur (hasImage), jamais
  // les octets. Base64 aurait gonflé le JSON d'~33% et alourdi le
  // chargement de la liste admin (pullDatasReq renvoie tout le JSON, pour
  // toutes les demandes, à chaque ouverture du panneau).
  var _bugReportImageBlob = null;

  function _bugReportResetImage(){
    _bugReportImageBlob = null;
    var wrap  = document.getElementById('bugReportImagePreviewWrap');
    var img   = document.getElementById('bugReportImagePreview');
    var input = document.getElementById('bugReportImageInput');
    var zone  = document.getElementById('bugReportImageDropzone');
    if(wrap)  wrap.style.display = 'none';
    if(img){ if(img.src && img.src.indexOf('blob:') === 0) URL.revokeObjectURL(img.src); img.src = ''; }
    if(input) input.value = '';
    if(zone)  zone.style.display = 'flex';
  }

  // Redimensionne/recompresse côté client avant envoi — une capture d'écran
  // de téléphone brute peut peser plusieurs Mo. 1280px de long côté max +
  // JPEG qualité .72 reste largement lisible pour du diagnostic, jamais
  // destiné à être zoomé au pixel.
  function _bugCompressImage(file){
    return new Promise(function(resolve, reject){
      var img = new Image();
      var reader = new FileReader();
      reader.onload = function(e){ img.src = e.target.result; };
      reader.onerror = reject;
      img.onload = function(){
        var maxSide = 1280;
        var w = img.width, h = img.height;
        if(w > maxSide || h > maxSide){
          if(w >= h){ h = Math.round(h * maxSide / w); w = maxSide; }
          else { w = Math.round(w * maxSide / h); h = maxSide; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(function(blob){
          if(blob) resolve(blob); else reject(new Error('toBlob a échoué'));
        }, 'image/jpeg', 0.72);
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function _bugReportOpen(){
    var overlay  = document.getElementById('bugReportOverlay');
    var title    = document.getElementById('bugReportTitle');
    var severity = document.getElementById('bugReportSeverity');
    var desc     = document.getElementById('bugReportDesc');
    if(!overlay) return;
    if(title)    title.value = '';
    if(severity) severity.value = 'medium';
    if(desc)     desc.value = '';
    _bugReportResetImage();
    overlay.style.display = 'flex';
    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    if(title) setTimeout(function(){ title.focus(); }, 100);
  }
  function _bugReportClose(){
    var overlay = document.getElementById('bugReportOverlay');
    if(!overlay) return;
    overlay.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(function(){
      if(!overlay.classList.contains('open')) overlay.style.display = 'none';
    }, 350);
  }

  function reqInitListeners(){
    var btnReqMenuEl = document.getElementById('btnRequestsMenu');
    if(btnReqMenuEl) btnReqMenuEl.addEventListener('click', function(){ document.getElementById('hdrMenu').classList.remove('open'); reqOpenPanel(); });

    var btnReportBugEl = document.getElementById('btnReportBug');
    if(btnReportBugEl) btnReportBugEl.addEventListener('click', function(){
      var hdrMenuEl = document.getElementById('hdrMenu');
      if(hdrMenuEl) hdrMenuEl.classList.remove('open');
      _bugReportOpen();
    });
    var bugCloseBtn  = document.getElementById('bugReportCloseBtn');
    var bugCancelBtn = document.getElementById('bugReportCancelBtn');
    var bugSubmitBtn = document.getElementById('bugReportSubmitBtn');
    if(bugCloseBtn)  bugCloseBtn.addEventListener('click', _bugReportClose);
    if(bugCancelBtn) bugCancelBtn.addEventListener('click', _bugReportClose);

    var bugImageInput    = document.getElementById('bugReportImageInput');
    var bugImageRemove   = document.getElementById('bugReportImageRemove');
    var bugImageDropzone = document.getElementById('bugReportImageDropzone');

    async function _bugHandleImageFile(file){
      if(!file) return;
      if(!/^image\//.test(file.type)){ showToast('Fichier non reconnu comme image', 'warn', 3000); return; }
      try {
        _bugReportImageBlob = await _bugCompressImage(file);
        var wrap = document.getElementById('bugReportImagePreviewWrap');
        var img  = document.getElementById('bugReportImagePreview');
        if(img)  img.src = URL.createObjectURL(_bugReportImageBlob);
        if(wrap) wrap.style.display = 'block';
        if(bugImageDropzone) bugImageDropzone.style.display = 'none';
      } catch(e){ showToast('Impossible de lire cette image', 'err', 3000); }
    }

    if(bugImageInput) bugImageInput.addEventListener('change', function(){ _bugHandleImageFile(bugImageInput.files[0]); });
    if(bugImageRemove) bugImageRemove.addEventListener('click', _bugReportResetImage);
    var bugImagePreviewEl = document.getElementById('bugReportImagePreview');
    if(bugImagePreviewEl) bugImagePreviewEl.addEventListener('click', function(){
      if(bugImagePreviewEl.src) window.open(bugImagePreviewEl.src, '_blank');
    });

    // Glisser-déposer directement sur la zone
    if(bugImageDropzone){
      ['dragenter','dragover'].forEach(function(evt){
        bugImageDropzone.addEventListener(evt, function(e){
          e.preventDefault(); e.stopPropagation();
          bugImageDropzone.style.background = '#EFF6FF';
          bugImageDropzone.style.borderColor = 'var(--copper)';
        });
      });
      ['dragleave','drop'].forEach(function(evt){
        bugImageDropzone.addEventListener(evt, function(e){
          e.preventDefault(); e.stopPropagation();
          bugImageDropzone.style.background = 'var(--paper)';
          bugImageDropzone.style.borderColor = 'var(--line)';
        });
      });
      bugImageDropzone.addEventListener('drop', function(e){
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if(file) _bugHandleImageFile(file);
      });
    }

    // Coller une image depuis le presse-papiers (Ctrl/Cmd+V) — très pratique
    // pour une capture d'écran déjà copiée (ex. Cmd+Maj+4 sur Mac), sans
    // repasser par un enregistrement de fichier puis un sélecteur.
    document.addEventListener('paste', function(e){
      var overlay = document.getElementById('bugReportOverlay');
      if(!overlay || !overlay.classList.contains('open')) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for(var i = 0; i < items.length; i++){
        if(items[i].type && items[i].type.indexOf('image/') === 0){
          var file = items[i].getAsFile();
          if(file){ e.preventDefault(); _bugHandleImageFile(file); }
          break;
        }
      }
    });

    if(bugSubmitBtn) bugSubmitBtn.addEventListener('click', async function(){
      var titleEl    = document.getElementById('bugReportTitle');
      var severityEl = document.getElementById('bugReportSeverity');
      var desc       = document.getElementById('bugReportDesc');
      var titleText  = titleEl ? titleEl.value.trim() : '';
      var text       = desc ? desc.value.trim() : '';
      var severity   = severityEl ? severityEl.value : 'medium';
      if(!titleText){ showToast('Indique un titre avant d\'envoyer', 'warn', 3000); if(titleEl) titleEl.focus(); return; }
      if(!text){ showToast('Décris le problème avant d\'envoyer', 'warn', 3000); return; }
      bugSubmitBtn.disabled = true; bugSubmitBtn.textContent = 'Envoi…';
      var ok = await window.reqSubmitBug(titleText, text, severity, _bugReportImageBlob);
      bugSubmitBtn.disabled = false; bugSubmitBtn.textContent = 'Envoyer';
      if(ok){ _bugReportClose(); showToast('Bug signalé, merci ✓', 'ok', 3000); }
      else { showToast('Échec de l\'envoi — réessayez', 'err', 3500); }
    });

    // ── Boutons "Proposer un produit" ──
    ['btnProposeProduct','btnFabPropose'].forEach(function(id){
      var btn = document.getElementById(id);
      if(btn) btn.addEventListener('click', function(){
        if(typeof window._openProposeModal === 'function') window._openProposeModal(null);
      });
    });

    // ── Bouton "Proposer une modification" (fiche produit) ──
    var vmProposeBtn = document.getElementById('vmProposeBtn');
    if(vmProposeBtn) vmProposeBtn.addEventListener('click', function(){
      var productId = window._viewingId || null;
      if(typeof window._openProposeModal === 'function') window._openProposeModal(productId);
    });

    var panelClose = document.getElementById('requestsPanelClose');
    if(panelClose) panelClose.addEventListener('click', reqClosePanel);

    var overlay = document.getElementById('requestsOverlay');
    if(overlay) overlay.addEventListener('click', function(e){ if(e.target === this) reqClosePanel(); });

    document.querySelectorAll('.req-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        _reqPanelTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.req-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        reqRefreshPanel();
      });
    });

    var btnAccept = document.getElementById('btnAcceptAllRequests');
    if(btnAccept) btnAccept.addEventListener('click', async function(){
      if(!(await customConfirm('Accepter toutes les demandes ?', '', { okLabel: 'Accepter tout' }))) return;
      var sUrl = reqServerUrl();
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/pullDatasReq', { headers: h, cache: 'no-store' });
      if(!r.ok) return;
      var d = await r.json();
      var items = d.items || [];
      for(var i = 0; i < items.length; i++){
        var it = items[i];
        var user = (it.data || {})._reqUser || it.user || '';
        await window.reqAccept(it.ref, user);
      }
      showToast(items.length + ' demande(s) acceptée(s) ✓', 'ok', 3000);
      reqOpenPanel(); reqUpdateBadge();
    });

    var btnRefuse = document.getElementById('btnRefuseAllRequests');
    if(btnRefuse) btnRefuse.addEventListener('click', async function(){
      if(!(await customConfirm('Refuser toutes les demandes ?', '', { okLabel: 'Refuser tout', danger: true }))) return;
      var sUrl = reqServerUrl();
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/pullDatasReq', { headers: h, cache: 'no-store' });
      if(!r.ok) return;
      var d = await r.json();
      var items = d.items || [];
      for(var i = 0; i < items.length; i++){
        var it = items[i];
        var user = (it.data || {})._reqUser || it.user || '';
        await window.reqRefuse(it.ref, user);
      }
      showToast(items.length + ' demande(s) refusée(s)', 'ok', 3000);
      reqOpenPanel(); reqUpdateBadge();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', reqInitListeners);
  } else {
    reqInitListeners();
  }

  window._reqUpdateBadge = reqUpdateBadge;