"use strict";

// ═══════════════════════════════════════════════════════════════
//  MODULE DEMANDES (_req)
// ═══════════════════════════════════════════════════════════════

  var _reqPanelTab     = 'product'; // onglet actif : 'product' ou 'bug' (plus une histoire de rôle — voir reqRefreshPanel)
  // Filtre par gravité, onglet "Bugs signalés" uniquement (retour
  // utilisateur : "je voudrai pouvoir les filtrer par niveau de gravité") —
  // '' = toutes. Appliqué côté client sur la liste déjà récupérée (voir
  // reqLoadAdminList/reqLoadMineList), pas de paramètre serveur dédié pour
  // ça dans /pullBugs.
  var _reqSeverityFilter = '';

  // Mêmes libellés FR que le <select> du formulaire d'envoi (voir
  // bugReportOverlay, js/templates.js) — retour utilisateur : "les remontées
  // (le niveau de gravité) se font en anglais". Le champ "severity" est
  // stocké et renvoyé par l'API en anglais brut ('low'/'medium'/'high'/
  // 'critical', voir _reqNormalizeBugItem plus bas) : jamais traduit avant
  // affichage nulle part (ni dans le détail d'un bug, ni dans la liste) —
  // corrigé en passant systématiquement par ce mapper avant de l'afficher.
  var REQ_SEVERITY_LABELS = { low: 'Faible', medium: 'Moyenne', high: 'Élevée', critical: 'Critique — bloquant' };
  // Valeur inconnue/absente : on affiche la valeur brute plutôt que de la
  // masquer (mieux vaut un mot en anglais visible qu'une gravité qui
  // disparaît silencieusement si l'API renvoie un jour autre chose).
  function _reqSeverityLabel(sev){ return REQ_SEVERITY_LABELS[sev] || sev || ''; }

  // ── Helpers ───────────────────────────────────────────────────
  function reqServerUrl(){ return localStorage.getItem('cat_server_url') || ''; }
  function reqHeaders(){ return typeof window.authHeaders === 'function' ? window.authHeaders() : {}; }
  function reqCurrentUser(){ return typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null; }
  function reqIsAdmin(){ var u = reqCurrentUser(); return u && u.isAdmin; }

  // Défense en profondeur : ne JAMAIS faire confiance aveuglément au filtre
  // serveur ?request=true de /pullDatas — retour utilisateur, capture à
  // l'appui : côté admin, le CATALOGUE ENTIER (~598 produits) apparaissait
  // comme "demandes en attente", chaque produit réel marqué "Nouveau" (le
  // filtre serveur ne filtrait rien). Sans ce garde-fou, reqRefuse/reqCancel
  // (_reqDiscardPendingRow) auraient alors purement et simplement SUPPRIMÉ
  // le produit réel cliqué en pensant traiter une demande — un simple clic
  // sur "Refuser"/"Tout refuser" aurait vidé le catalogue. Toute liste tirée
  // de /pullDatas?request=true repasse donc par ce filtre côté CLIENT avant
  // d'être utilisée nulle part, quel que soit ce que le serveur a vraiment
  // filtré.
  function _reqIsPending(it){ return !!(it && it.data && it.data.request === true); }

  // ── Badge notification ────────────────────────────────────────
  var _reqLastCount        = 0; // dernier total ABSOLU connu (badge combiné — voir reqUpdateBadge)
  var _reqLastCountProduct = 0; // dernier total ABSOLU des demandes PRODUIT (notif séparée)
  var _reqLastCountBug     = 0; // dernier total ABSOLU des BUGS signalés (notif séparée)

  // Deux notifications distinctes (tag différent chacune, donc elles
  // s'empilent au lieu de s'écraser) plutôt qu'une seule notif combinée —
  // demandes produit et bugs signalés n'appellent pas la même réaction de
  // l'admin, autant les distinguer dès la notif système (retour utilisateur).
  function _reqNotify(kind, newCount, lastCount){
    if(!reqIsAdmin()) return;
    if(newCount <= lastCount) return;
    if(typeof Notification === 'undefined') return;
    if(Notification.permission !== 'granted') return;
    var diff = newCount - lastCount;
    var isBug = kind === 'bug';
    try {
      new Notification(isBug ? 'Catalogue SPI — Bug signalé' : 'Catalogue SPI — Nouvelle demande', {
        body: isBug
          ? (diff === 1 ? 'Un nouveau bug a été signalé.' : diff + ' nouveaux bugs ont été signalés.')
          : (diff === 1 ? 'Une nouvelle demande est en attente de validation.' : diff + ' nouvelles demandes sont en attente de validation.'),
        // Chemin relatif (pas de "/" en tête) : l'app est déployée dans un
        // sous-dossier (ex. GitHub Pages, /Catalogue-Electrique/ — voir
        // manifest.webmanifest start_url/scope) — un chemin absolu depuis la
        // racine du domaine pointait à côté (bug préexistant, découvert en
        // déplaçant icon-192.png vers assets/).
        icon: 'assets/icon-192.png',
        tag: isBug ? 'spi-req-badge-bug' : 'spi-req-badge-product',
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
      // /checkReq a disparu du serveur (nouveau swagger, retour utilisateur
      // "il y a des api qui ont été supprimé sur le serveur du dev") : les
      // demandes produit vivent maintenant dans la MÊME collection que le
      // catalogue réel (/pushDatas/pullDatas), distinguées par le champ
      // data.request (true = demande en attente, absent/false = produit
      // réel) — voir reqSubmit ci-dessous. Aucun endpoint de comptage dédié
      // pour ce filtre (/checkDatas ne prend qu'un paramètre timestamp, pas
      // request) : on récupère la liste complète via /pullDatas?request=true
      // et on compte côté client. Payload plus lourd qu'un simple {count},
      // mais c'est la seule option que le nouveau swagger expose.
      var rData = await fetch(sUrl + '/pullDatas?request=true', { headers: h, cache: 'no-store' });
      if(!rData.ok) return; // serveur down, on ne met pas à jour
      var dData = await rData.json();
      var reqItems = (dData && Array.isArray(dData.items)) ? dData.items
                   : Array.isArray(dData) ? dData : [];
      reqItems = reqItems.filter(_reqIsPending);
      // Filtre type==="bug" conservé par sécurité (d'éventuelles demandes
      // historiques d'avant la migration vers l'API bugs dédiée) — voir le
      // même filtre dans reqLoadAdminList plus bas.
      var nProduct = reqItems.filter(function(it){ return ((it && it.data) || {}).type !== 'bug'; }).length;
      // + rapports de bug (API dédiée, comptés séparément — voir mémoire
      // "bug-report-api-migration"). Un échec de /checkBugs (pas encore
      // disponible côté serveur, etc.) ne doit pas empêcher d'afficher au
      // moins le compte des demandes produit.
      // /checkBugs (API dédiée aux bugs) : {count:N} CONFIRMÉ par un test
      // direct du Swagger (la doc ne montrait qu'un exemple générique
      // "string", trompeur). Fallback nombre/chaîne brute conservé par
      // sécurité, mais ne devrait normalement jamais servir.
      var nBugs = 0;
      try {
        var rBugs = await fetch(sUrl + '/checkBugs', { headers: h, cache: 'no-store' });
        if(rBugs.ok){
          var dBugs = await rBugs.json();
          nBugs = (dBugs && typeof dBugs === 'object' && typeof dBugs.count === 'number') ? dBugs.count
                : (typeof dBugs === 'number') ? dBugs
                : (typeof dBugs === 'string' && dBugs.trim() !== '' && !isNaN(Number(dBugs))) ? Number(dBugs)
                : 0;
        }
      } catch(eBugs){}
      var total = nProduct + nBugs;
      ['requestsBadge','requestsBadgeMenu'].forEach(function(id){
        var el = document.getElementById(id);
        if(el){ el.textContent = total > 0 ? (total > 99 ? '99+' : total) : ''; el.style.display = total > 0 ? '' : 'none'; }
      });
      // Deux notifs desktop distinctes, chacune comparée à son propre
      // dernier total connu (comparaison de deux totaux absolus, donc
      // fiable même si des demandes ont été traitées entretemps) — une
      // demande produit qui arrive ne doit jamais déclencher/renommer la
      // notif "bug signalé", et inversement.
      if(nProduct > _reqLastCountProduct) _reqNotify('product', nProduct, _reqLastCountProduct);
      if(nBugs    > _reqLastCountBug)     _reqNotify('bug',     nBugs,    _reqLastCountBug);
      _reqLastCountProduct = nProduct;
      _reqLastCountBug     = nBugs;
      _reqLastCount = total;
    } catch(e) {}
  }

  // ── Polling ───────────────────────────────────────────────────
  // Plus de setInterval dédié ici — doCheckAllSync() (js/actions-settings-sync.js, toutes
  // les 15s) appelle déjà /checkAll qui inclut catalogue-request/bugs
  // (revision/count/changedAt) ; il relance reqUpdateBadge() UNIQUEMENT
  // quand l'un des deux a changé, via window._reqUpdateBadge ci-dessous,
  // plutôt qu'un second poll totalement indépendant toutes les 30s qui
  // refaisait le même travail de détection en double (retour utilisateur :
  // consolider sur /checkAll). reqUpdateBadge() elle-même continue
  // d'appeler /pullDatas?request=true et /checkBugs pour le VRAI décompte —
  // seul le déclenchement change, pas la source des chiffres affichés.
  function reqStartPolling(){
    reqStopPolling();
    if(!reqServerUrl() || !reqIsAdmin()) return;
    // N'autorise plus que les notifications navigateur ici — l'appel
    // immédiat à reqUpdateBadge() qui suivait a été retiré : la connexion
    // (js/auth.js, authLogin) déclenche maintenant doCheckAllSync()
    // directement, qui rappelle déjà window._reqUpdateBadge() lui-même SI
    // catalogue-request/bugs a changé depuis le dernier état connu (et
    // sinon, l'ancien compte affiché reste juste correct tel quel — pas la
    // peine de refaire la requête pour un résultat identique). Le
    // faire ici EN PLUS aurait dupliqué le même poll deux fois de suite à
    // chaque connexion.
    _reqAskNotifPermission();
  }
  function reqStopPolling(){ _reqLastCount = 0; _reqLastCountProduct = 0; _reqLastCountBug = 0; }
  window._reqStartPolling = reqStartPolling;
  window._reqStopPolling  = reqStopPolling;
  window._reqUpdateBadge  = reqUpdateBadge;

  // ── Soumettre une demande ─────────────────────────────────────
  // /pushDatasReq a disparu — une demande est maintenant un item /pushDatas
  // ordinaire, marqué data.request:true pour le distinguer d'un produit
  // réel. /pullDatas accepte désormais un paramètre "request" (bool) pour
  // les retrouver sans les mélanger au catalogue en direct (voir
  // reqLoadAdminList/reqLoadMineList plus bas).
  //
  // ATTENTION ref = clé unique côté serveur (une seule ligne par ref, que ce
  // soit le produit réel ou sa demande — /pushDatas fait un upsert par ref,
  // voir catalogue_core.py). Pour une demande de NOUVEAU produit ça ne pose
  // aucun problème (rien n'existe encore sous cette ref). Mais pour une
  // demande de MODIFICATION, écraser purement et simplement la ligne avec le
  // contenu proposé (ancien comportement) fait disparaître le produit réel
  // du catalogue pendant toute la durée de la revue, et le supprime
  // définitivement si la demande est refusée/annulée (constaté par test :
  // reqRefuse/reqCancel ne faisaient qu'un /deleteDatas?ref= sur cette même
  // ligne). Solution demandée : la ligne garde TOUJOURS les valeurs réelles
  // actuelles au niveau racine de "data", et seuls les champs proposés
  // (différents de l'existant) sont isolés dans data.requestFields — annuler
  // ou refuser la demande n'a alors plus qu'à retirer requestFields/request
  // pour restaurer le produit, jamais besoin de supprimer la ligne (voir
  // _reqDiscardPendingRow plus bas, utilisé par reqRefuse/reqCancel).
  function _reqComputeChangedFields(original, proposed){
    var out = {};
    Object.keys(proposed || {}).forEach(function(k){
      var origVal = original ? original[k] : undefined;
      if(JSON.stringify(proposed[k]) !== JSON.stringify(origVal)) out[k] = proposed[k];
    });
    return out;
  }
  window.reqSubmit = async function(payload, existingProduct){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    var username = user.username || user.name || 'user';
    try {
      var h = reqHeaders();
      var now = Date.now();
      // Modification : base = valeurs réelles actuelles (jamais écrasées tant
      // que la demande n'est pas acceptée) + requestFields = uniquement ce
      // qui change. Nouveau produit : rien de réel à protéger, la ligne EST
      // la proposition, pas de requestFields.
      var isModification = !!existingProduct;
      var base = isModification ? Object.assign({}, existingProduct) : Object.assign({}, payload);
      var toSend = Object.assign({}, base, {
        ref:           payload.ref,
        id:            payload.id || (existingProduct && existingProduct.id) || ('p_' + now + '_' + Math.random().toString(36).substr(2,6)),
        user:          username,
        createdAt:     (existingProduct && existingProduct.createdAt) || payload.createdAt || now,
        updatedAt:     now,
        request:       true,
        requestFields: isModification ? _reqComputeChangedFields(existingProduct, payload) : null,
        _reqUser:      username,
        _reqAt:        now
      });
      var r = await fetch(sUrl + '/pushDatas', { method:'POST', headers:h, body:JSON.stringify([toSend]) });
      return r.ok;
    } catch(e) { console.warn('reqSubmit:', e); return false; }
  };

  // ── Abandonner une demande en attente sans jamais supprimer un produit
  //     réel (voir le commentaire au-dessus de reqSubmit/requestFields) ──
  // Une demande de MODIFICATION (data.requestFields présent, même vide) : la
  // ligne partagée avec le produit réel est simplement restaurée à son état
  // actuel (requestFields/request retirés) via /pushDatas — jamais de
  // /deleteDatas dessus, sinon le produit réel disparaîtrait avec la demande.
  // Une demande de NOUVEAU produit (requestFields absent) : rien de réel
  // derrière, suppression classique.
  async function _reqDiscardPendingRow(sUrl, ref, h){
    var r = await fetch(sUrl + '/pullDatas?request=true&ref=' + encodeURIComponent(ref), { headers: h, cache: 'no-store' });
    if(!r.ok) return false;
    var d = await r.json();
    // _reqIsPending : si ce "ref" est en fait un produit réel (filtre serveur
    // cassé/ignoré, voir son commentaire), on ne le supprime surtout pas —
    // on se comporte comme s'il n'y avait rien à annuler/refuser.
    var items = ((d && d.items) || []).filter(_reqIsPending);
    if(!items.length) return true; // déjà absent (annulé/refusé entretemps), ou jamais une vraie demande : rien à faire
    var item = items[0].data || {};
    if(item.requestFields){
      delete item._reqUser; delete item._reqAt; delete item.user; delete item.requestFields;
      item.request = false;
      item.updatedAt = Date.now();
      var hPost = Object.assign({}, h, { 'Content-Type': 'application/json' });
      var r2 = await fetch(sUrl + '/pushDatas', { method:'POST', headers: hPost, body: JSON.stringify([item]) });
      return r2.ok;
    }
    var r3 = await fetch(sUrl + '/deleteDatas?ref=' + encodeURIComponent(ref), { method:'DELETE', headers:h });
    return r3.ok;
  }

  // ── Annuler une demande ───────────────────────────────────────
  // /deleteDatasReq a disparu — la demande EST l'entrée /pushDatas
  // elle-même (data.request:true), identifiée par sa "ref" comme n'importe
  // quel /deleteDatas au niveau de l'API, mais voir _reqDiscardPendingRow
  // ci-dessus : plus un simple /deleteDatas direct pour une modification.
  // Plus de requestId/uuid distinct à résoudre au préalable (voir l'ancien
  // _reqResolveId, retiré). "id" reste accepté en 2e argument par compat
  // arrière avec les appelants existants mais n'est plus utilisé.
  window.reqCancel = async function(ref, id){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var ok = await _reqDiscardPendingRow(sUrl, ref, h);
      await _reqDeleteAttachedDocs(sUrl, ref, h);
      return ok;
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

  // ── Documents joints à une demande ──────────────────────────────
  // /pushDocsReq, /pullDocsReq et /deleteDocsReq ont tous disparu : un
  // document joint à une demande est maintenant un /pushDocs ordinaire,
  // marqué metadata.request:true (retour utilisateur : "pour les docsReq tu
  // dois ajouter dans le champs metadata 'request' avec true ou false").
  // /pullDocs et /deleteDocs n'ont PAS de paramètre "request" pour filtrer —
  // contrairement à /pullDatas ci-dessus. Un simple /deleteDocs?ref=
  // (pluriel, tout supprimer d'un coup) serait donc dangereux pour une
  // demande de MODIFICATION d'un produit déjà réel : la demande partage
  // alors la même ref que ses documents déjà en place, et /deleteDocs?ref=
  // les supprimerait TOUS, y compris les documents réels. Les fonctions
  // ci-dessous énumèrent donc chaque document un par un (nofile=true, léger,
  // pas de téléchargement du fichier) et ne touchent, via /deleteDoc?uuid=
  // (singulier), qu'à ceux dont metadata.request vaut true.
  function _reqParseDocMetadata(f){
    try { return typeof f.metadata === 'string' ? (JSON.parse(f.metadata) || {}) : (f.metadata || {}); }
    catch(e){ return {}; }
  }
  async function _reqListAttachedDocs(sUrl, ref, h){
    try {
      var r = await fetch(sUrl + '/pullDocs?nofile=true&ref=' + encodeURIComponent(ref), { headers: h, cache: 'no-store' });
      if(!r.ok) return [];
      var d = await r.json();
      var files = (d && d.items) || [];
      return files.filter(function(f){ return _reqParseDocMetadata(f).request === true; });
    } catch(e){ return []; }
  }

  // Supprime, un par un, les documents marqués metadata.request:true pour
  // cette ref — voir le commentaire en tête de section sur pourquoi pas de
  // suppression groupée par ref.
  async function _reqDeleteAttachedDocs(sUrl, ref, h){
    var files = await _reqListAttachedDocs(sUrl, ref, h);
    for(var i = 0; i < files.length; i++){
      if(files[i].uuid){
        await fetch(sUrl + '/deleteDoc?uuid=' + encodeURIComponent(files[i].uuid), { method:'DELETE', headers:h }).catch(function(){});
      }
    }
  }

  // ── Transfère les docs/images joints à une demande vers le vrai produit ──
  // reqRef : ref de la demande. productRef : ref du produit réel une fois
  // accepté (généralement identique à reqRef, sauf cas rares de ref changée
  // par l'admin en éditant avant validation). Chaque document est
  // retéléchargé puis repoussé SANS metadata.request (donc plus marqué comme
  // une demande) — /pushDocs n'offrant pas de mise à jour de métadonnées
  // seule sans réenvoyer le fichier, un aller-retour complet reste
  // nécessaire même si productRef === reqRef. Réutilise _fetchPdfByName
  // (js/render-documents.js, gère déjà le cas ZIP multi-fichiers) plutôt que
  // de dupliquer cette logique — contrairement à l'ancienne version limitée
  // à 1 seul fichier joint.
  // Retourne true si la demande avait au moins un document joint (qu'il ait
  // pu être migré intégralement ou non) — réutilisé par reqAccept juste en
  // dessous pour ne PAS appeler _reqDeleteAttachedDocs quand il n'y a rien à
  // nettoyer.
  async function _reqMigrateDocsToProduct(reqRef, reqUser, productRef){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    try {
      var hGet = Object.assign({}, reqHeaders()); delete hGet['Content-Type'];
      var files = await _reqListAttachedDocs(sUrl, reqRef, hGet);
      if(!files.length) return false;
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      for(var i = 0; i < files.length; i++){
        await new Promise(function(resolve){
          _fetchPdfByName(sUrl, reqRef, files[i].filename, hGet, function(err, ab, filename){
            if(err){ console.warn('_reqMigrateDocsToProduct:', err); resolve(); return; }
            var fd = new FormData();
            fd.append('ref', productRef);
            fd.append('document', new Blob([ab]), filename);
            fetch(sUrl + '/pushDocs', { method:'POST', headers:h, body:fd }).catch(function(){}).then(resolve);
          });
        });
      }
      return true;
    } catch(e) { console.warn('_reqMigrateDocsToProduct:', e); return false; }
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
        // Données déjà éditées côté admin — on les utilise directement.
        item = Object.assign({}, overrideData);
      } else {
        // Cas normal : récupérer depuis le serveur. /pullDatasReq a disparu
        // — même remplacement que reqLoadAdminList/reqLoadMineList plus bas
        // (/pullDatas?request=true).
        var r = await fetch(sUrl + '/pullDatas?request=true&ref=' + encodeURIComponent(ref), { headers: hGet, cache: 'no-store' });
        if(!r.ok) return false;
        var d = await r.json();
        // _reqIsPending : filtre défensif, voir son commentaire — ne jamais
        // traiter un produit réel (filtre serveur cassé/ignoré) comme une
        // demande à "accepter".
        var items = ((d && d.items) || []).filter(_reqIsPending);
        if(!items.length) return false;
        item = items[0].data || {};
      }
      // Garde-fou : un rapport de bug (type:"bug") n'est PAS un produit — ne
      // doit jamais être poussé dans le vrai catalogue via /pushDatas.
      // Nécessaire ici, au niveau le plus bas, car "Accepter tout" boucle
      // sur toutes les demandes sans distinction (voir btnAcceptAllRequests) :
      // un garde-fou seulement dans l'UI de détail n'aurait pas suffi. Ne
      // devrait normalement plus jamais se déclencher depuis la migration
      // vers l'API bugs dédiée (les rapports ne transitent plus par ici) —
      // conservé par sécurité pour d'éventuels rapports historiques encore
      // présents côté serveur dans l'ancien stockage.
      if(item.type === 'bug') return await window.reqResolveBug(ref, item.attachmentId || null);
      // Applique les champs proposés (data.requestFields, voir reqSubmit)
      // par-dessus les valeurs réelles avant de valider — absent quand
      // overrideData vient déjà du formulaire (état final déjà résolu par
      // l'admin) ou pour une nouvelle proposition (rien à fusionner).
      if(item.requestFields) Object.assign(item, item.requestFields);
      delete item._reqUser; delete item._reqAt; delete item.user; delete item.requestFields;
      // N'est plus une demande : redevient un produit réel du catalogue.
      item.request = false;
      item.updatedAt = Date.now();
      var r2 = await fetch(sUrl + '/pushDatas', { method:'POST', headers:h, body:JSON.stringify([item]) });
      if(!r2.ok) return false;
      var finalRef = item.ref || ref;
      // Transférer les documents/images joints à la demande vers le vrai
      // produit avant de les supprimer — sinon ils disparaissent
      // silencieusement à l'acceptation (retour utilisateur : les fichiers
      // joints doivent suivre le produit une fois validé, pas se perdre).
      var hadDocs = await _reqMigrateDocsToProduct(ref, user, finalRef);
      if(hadDocs) await _reqDeleteAttachedDocs(sUrl, ref, hGet);
      // La demande d'origine (ref) n'a besoin d'être supprimée séparément
      // que si l'admin a changé la ref pendant la revue (overrideData) :
      // sinon, le /pushDatas ci-dessus a déjà remplacé la même ligne EN
      // PLACE (même ref, request passé à false juste au-dessus) — un
      // /deleteDatas supplémentaire sur cette même ref supprimerait alors le
      // produit qu'on vient tout juste d'accepter. Hypothèse de travail sur
      // le nouveau modèle "une seule collection, ref comme clé" (nouveau
      // swagger) — à confirmer avec le développeur serveur si un doublon ou
      // une suppression inattendue apparaît en pratique.
      if(finalRef !== ref){
        await fetch(sUrl + '/deleteDatas?ref=' + encodeURIComponent(ref), { method:'DELETE', headers:hGet }).catch(function(){});
      }
      return true;
    } catch(e) { console.warn('reqAccept:', e); return false; }
  };

  // ── Joindre des fichiers (PDF/images) à une demande produit déjà envoyée ──
  // Utilisé après reqSubmit() côté "Proposer un produit/une modification"
  // (voir btnSave dans actions.js). /pushDocsReq a disparu — un document
  // joint à une demande est maintenant un /pushDocs ordinaire (ref = celle
  // de la demande), marqué metadata.request:true pour le distinguer d'un
  // document déjà réel (voir la section "Documents joints à une demande"
  // plus haut). Un échec d'upload ne remet pas en cause la demande déjà
  // enregistrée, juste signalé en console.
  window.reqUploadAttachedFiles = async function(ref, files){
    var sUrl = reqServerUrl(); if(!sUrl || !files || !files.length) return;
    var user = reqCurrentUser(); if(!user) return;
    var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
    for(var i = 0; i < files.length; i++){
      try {
        var fd = new FormData();
        fd.append('ref', ref);
        fd.append('document', files[i], files[i].name);
        fd.append('metadata', JSON.stringify({ request: true }));
        var r = await fetch(sUrl + '/pushDocs', { method:'POST', headers:h, body:fd });
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
        // "bugId" (camelCase) — CONFIRMÉ par un test direct du Swagger,
        // pas "bug_id" comme documenté ailleurs par erreur.
        fd.append('bugId', bugId);
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
  // id : n'est plus utilisé (conservé en 3e argument par compat arrière avec
  // les appelants existants) — voir reqCancel/_reqDiscardPendingRow juste
  // au-dessus, même logique : une demande de modification refusée restaure
  // le produit réel plutôt que de le supprimer avec la ligne.
  window.reqRefuse = async function(ref, user, id){
    var sUrl = reqServerUrl(); if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var ok = await _reqDiscardPendingRow(sUrl, ref, h);
      await _reqDeleteAttachedDocs(sUrl, ref, h);
      return ok;
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
    // js/modal-request-review.js). "Accepter"/"Refuser" agissent directement depuis cet
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
      if(data.severity) subParts.push('Gravité : ' + _reqSeverityLabel(data.severity));
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
            wrap.querySelector('img').addEventListener('click', function(){ window._showImageLightbox(url); });
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
    document.body.classList.remove('modal-open');
    function hideNow(){
      overlay.classList.remove('open');
      overlay.style.display = 'none';
    }
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(overlay, hideNow);
    } else {
      hideNow();
    }
  }


  // ── Charger les demandes admin ────────────────────────────────
  // Deux sources désormais séparées : /pullDatas?request=true (demandes
  // produit — /pullDatasReq a disparu, voir reqSubmit) et /pullBugs
  // (rapports de bug, API dédiée — voir mémoire "bug-report-api-migration")
  // — combinées côté client pour l'affichage. Le filtre type==="bug" sur les
  // items de /pullDatas?request=true est conservé par sécurité (d'éventuels
  // anciens rapports encore présents côté serveur depuis avant cette
  // migration), mais ne devrait plus jamais rien attraper pour les nouveaux
  // rapports, tous envoyés via /pushBugs.
  // type : 'product' (par défaut) ou 'bug' — deux pages distinctes plutôt
  // qu'une liste combinée avec des en-têtes de section (retour utilisateur :
  // demandes produit et bugs signalés n'ont rien à voir, ne devraient même
  // pas se retrouver dans le même écran).
  async function reqLoadAdminList(type){
    type = type === 'bug' ? 'bug' : 'product';
    var sUrl = reqServerUrl();
    var body = document.getElementById('requestsBody');
    if(!body) return;
    body.innerHTML = '<div class="req-empty"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var rProd = await fetch(sUrl + '/pullDatas?request=true', { headers: h, cache: 'no-store' });
      if(!rProd.ok) throw new Error('HTTP ' + rProd.status);
      var dProd = await rProd.json();
      var prodRaw = ((dProd && dProd.items) || (Array.isArray(dProd) ? dProd : [])).filter(_reqIsPending);

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

      var productItems = prodRaw.filter(function(it){ return (it.data||{}).type !== 'bug'; });
      // bugRaw (déjà normalisé ci-dessus) d'abord, puis d'éventuels rapports
      // historiques encore présents côté /pullDatasReq depuis avant la
      // migration (garde-fou, voir commentaire en tête de fonction).
      var bugItems = bugRaw.concat(prodRaw.filter(function(it){ return (it.data||{}).type === 'bug'; }));
      var items = (type === 'bug') ? bugItems : productItems;
      // Filtre par gravité (onglet bugs uniquement, voir _reqSeverityFilter
      // plus haut) — appliqué APRÈS le choix bug/produit ci-dessus, jamais
      // sur les demandes produit qui n'ont pas ce champ.
      if(type === 'bug' && _reqSeverityFilter){
        items = items.filter(function(it){ return (it.data||{}).severity === _reqSeverityFilter; });
      }

      var footer = document.getElementById('requestsFooter');
      if(items.length === 0){
        // Distingue "rien à afficher parce que le filtre exclut tout" de
        // "vraiment aucun bug" — sinon le message laisse croire à tort que
        // la boîte est vide alors qu'un filtre de gravité est juste actif
        // (retour utilisateur : filtre par gravité).
        var emptyMsg = (type === 'bug')
          ? (_reqSeverityFilter ? 'Aucun bug avec cette gravité' : 'Aucun bug signalé')
          : 'Aucune demande en attente';
        body.innerHTML = '<div class="req-empty"><i class="ti ti-bell-off" style="font-size:32px;display:block;margin-bottom:8px;"></i>' + emptyMsg + '</div>';
        if(footer) footer.style.display = 'none';
        return;
      }
      // "Tout accepter"/"Tout refuser" n'agissent que sur /pullDatasReq (voir
      // leurs handlers) — pas d'équivalent groupé pour les bugs (chacun se
      // marque résolu individuellement), donc pas de footer sur cet onglet.
      if(footer) footer.style.display = (type === 'bug') ? 'none' : 'flex';

      // Map (pas un objet brut) : un nom d'utilisateur "__proto__"/
      // "constructor"/"toString"/etc. réécrirait silencieusement le
      // prototype de l'objet au lieu d'ajouter une entrée — la demande de
      // CET utilisateur disparaissait alors totalement de la liste admin,
      // sans erreur (trouvé en stress-testant, même piège déjà évité par
      // localMap dans js/actions-sync-core.js pour les refs produit).
      function groupByUser(list){
        var byUser = new Map();
        list.forEach(function(it){
          var data = it.data || {};
          var u = data._reqUser || it.user || '?';
          if(!byUser.has(u)) byUser.set(u, []);
          byUser.get(u).push({ ref: it.ref, data: data });
        });
        return byUser;
      }
      var byUser = groupByUser(items);
      var html = '';
      byUser.forEach(function(userItems, u){
        html += '<div style="padding:8px 20px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);background:var(--paper);"><i class="ti ti-user" style="font-size:12px;"></i> ' + escapeHtml(u) + ' — ' + userItems.length + '</div>';
        userItems.forEach(function(item){ html += reqRenderAdminItem(item, u); });
      });
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
    var isNew  = !data.requestFields;
    var titleText = isBug ? (data.title || 'Bug signalé') : item.ref;
    var subText   = isBug ? ((data.description||'').slice(0,80) + ((data.description||'').length > 80 ? '…' : '')) : (data.name || '');
    // Badge coloré par GRAVITÉ pour un bug (plutôt qu'un badge "Bug"
    // générique identique pour tous) — retour utilisateur : voir la gravité
    // d'un coup d'œil dans la liste, pas seulement en ouvrant le détail.
    // Couleurs les plus vives réservées à "critique" (le plus urgent) ;
    // "medium" par défaut si la gravité est absente/inconnue.
    var REQ_SEVERITY_COLORS = { critical: ['#FEE2E2', '#991B1B'], high: ['#FFEDD5', '#9A3412'], medium: ['#FEF3C7', '#92400E'], low: ['#E5E7EB', '#374151'] };
    var sevColors = REQ_SEVERITY_COLORS[data.severity] || REQ_SEVERITY_COLORS.medium;
    var badgeBg   = isBug ? sevColors[0] : (isNew ? '#DCFCE7' : '#FEF3C7');
    var badgeFg   = isBug ? sevColors[1] : (isNew ? '#065F46' : '#92400E');
    var badgeText = isBug ? ('<i class="ti ti-bug"></i> ' + escapeHtml(_reqSeverityLabel(data.severity) || 'Bug')) : (isNew ? 'Nouveau' : 'Modification');
    return '<div class="req-item" style="cursor:pointer;" data-req-detail="' + refKey + '" data-req-user-detail="' + userKey + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
      +   '<div style="min-width:0;">'
      +     '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(titleText) + '</div>'
      +     '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(subText) + (reqAt ? ' · ' + reqAt : '') + '</div>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      +     '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:' + badgeBg + ';color:' + badgeFg + ';font-weight:700;">' + badgeText + '</span>'
      +     '<i class="ti ti-chevron-right" style="font-size:14px;color:var(--ink-soft);"></i>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Charger mes demandes ──────────────────────────────────────
  // type : 'product' (par défaut) ou 'bug' — même page unique par type que
  // reqLoadAdminList, voir son commentaire.
  async function reqLoadMineList(type){
    type = type === 'bug' ? 'bug' : 'product';
    var sUrl = reqServerUrl();
    var body = document.getElementById('requestsBody');
    if(!body) return;
    var user = reqCurrentUser();
    if(!user){ body.innerHTML = '<div class="req-empty">Non connecté</div>'; return; }
    var username = user.username || user.name || '';
    body.innerHTML = '<div class="req-empty"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';
    var footer = document.getElementById('requestsFooter');
    if(footer) footer.style.display = 'none'; // jamais d'action groupée sur "Mes demandes"
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      // /pullDatasReq?user= a disparu avec le reste de l'API _req —
      // /pullDatas?request=true n'a pas de paramètre "user" équivalent (voir
      // le nouveau swagger) : on récupère TOUTES les demandes en attente et
      // on filtre côté client sur data._reqUser, le champ qui portait déjà
      // l'auteur (voir reqSubmit) — même principe défensif que le filtre
      // déjà en place ci-dessous pour /pullBugs.
      var rProd = await fetch(sUrl + '/pullDatas?request=true', { headers: h, cache: 'no-store' });
      if(!rProd.ok) throw new Error('HTTP ' + rProd.status);
      var dProd = await rProd.json();
      var prodAll = ((dProd && dProd.items) || (Array.isArray(dProd) ? dProd : [])).filter(_reqIsPending);
      var prodRaw = prodAll.filter(function(it){ return ((it && it.data) || {})._reqUser === username; });

      // /pullBugs ne documente aucun paramètre "user" (seulement id/date).
      // L'hypothèse de départ était que le serveur scope déjà la réponse via
      // le token d'auth envoyé dans les headers (admin = tout, utilisateur
      // normal = ses propres rapports) — CONFIRMÉE FAUSSE en pratique
      // (retour utilisateur : connecté avec un compte non-admin, la fenêtre
      // "Demandes en attente" est identique à celle d'un admin) : le serveur
      // renvoie TOUS les bugs à TOUT le monde, sans tenir compte du token.
      // Filtre client ajouté ci-dessous en filet de sécurité, même principe
      // que le filtre par _reqUser juste au-dessus — sans lui, un
      // utilisateur normal verrait les bugs signalés par les AUTRES en plus
      // des siens dans "Mes demandes".
      var bugItemsRaw = [];
      try {
        var rBugs = await fetch(sUrl + '/pullBugs', { headers: h, cache: 'no-store' });
        if(rBugs.ok){
          var dBugs = await rBugs.json();
          bugItemsRaw = Array.isArray(dBugs) ? dBugs : (dBugs && (dBugs.items || dBugs.data)) || [];
        }
      } catch(eBugs){ console.warn('reqLoadMineList: /pullBugs indisponible', eBugs); }
      var bugRaw = bugItemsRaw.map(_reqNormalizeBugItem).filter(function(it){ return it.user === username; });

      var mineProduct = prodRaw.filter(function(it){ return (it.data||{}).type !== 'bug'; });
      var mineBugs     = bugRaw.concat(prodRaw.filter(function(it){ return (it.data||{}).type === 'bug'; }));
      var items = (type === 'bug') ? mineBugs : mineProduct;
      // Même filtre par gravité que la liste admin (reqLoadAdminList).
      if(type === 'bug' && _reqSeverityFilter){
        items = items.filter(function(it){ return (it.data||{}).severity === _reqSeverityFilter; });
      }

      if(items.length === 0){
        var emptyMsgMine = (type === 'bug')
          ? (_reqSeverityFilter ? 'Aucun bug avec cette gravité' : 'Aucun bug signalé')
          : 'Aucune demande en attente';
        body.innerHTML = '<div class="req-empty"><i class="ti ti-check-circle" style="font-size:32px;display:block;margin-bottom:8px;color:#059669;"></i>' + emptyMsgMine + '</div>';
        return;
      }
      function renderMineItem(it){
        var data  = it.data || {};
        var isBug = data.type === 'bug';
        var reqAt = data._reqAt ? new Date(data._reqAt).toLocaleString('fr-FR') : '';
        var titleText = isBug ? (data.title || 'Bug signalé') : it.ref;
        var subText   = isBug ? ((data.description||'').slice(0,80) + ((data.description||'').length > 80 ? '…' : '')) : (data.name || '');
        return '<div class="req-item">'
          + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
          +   '<div style="min-width:0;"><div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(titleText) + '</div>'
          +   '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(subText) + (reqAt ? ' · Soumis le ' + reqAt : '') + '</div></div>'
          +   '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;font-weight:700;flex-shrink:0;">En attente</span>'
          + '</div>'
          + '<div class="req-actions"><button class="req-btn-cancel" data-req-cancel="' + escapeHtml(it.ref) + '" data-req-cancel-id="' + escapeHtml(it.id || '') + '" data-req-cancel-bug="' + (isBug ? '1' : '0') + '" data-req-cancel-attachment="' + escapeHtml(data.attachmentId || '') + '"><i class="ti ti-trash"></i> Annuler</button></div>'
          + '</div>';
      }
      body.innerHTML = items.map(renderMineItem).join('');
      body.querySelectorAll('[data-req-cancel]').forEach(function(btn){
        btn.addEventListener('click', async function(){
          var ref = btn.getAttribute('data-req-cancel');
          var id = btn.getAttribute('data-req-cancel-id') || '';
          var isBug = btn.getAttribute('data-req-cancel-bug') === '1';
          var attachmentId = btn.getAttribute('data-req-cancel-attachment') || null;
          if(!(await customConfirm('Annuler la demande ?', 'Annuler la demande pour ' + escapeHtml(ref) + ' ? Cette opération est irréversible.', { okLabel: 'Annuler la demande', danger: true }))) return;
          btn.disabled = true;
          // Rapport de bug → API dédiée (reqCancelBug), sinon demande
          // produit classique (reqCancel) — deux stockages désormais
          // distincts côté serveur.
          var ok = isBug ? await window.reqCancelBug(ref, attachmentId) : await window.reqCancel(ref, id);
          if(ok){ showToast('Demande annulée', 'ok', 2000); reqLoadMineList(type); }
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
      // On ouvre le panneau des demandes, pas la fiche produit : ignorer un
      // éventuel _modalReturnToViewId (voir js/modal-autocomplete.js) pour
      // que requestCloseModal() ne rouvre pas la fiche par-dessus.
      window._modalReturnToViewId = null;
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

  // Les onglets sont maintenant PAR TYPE (Demandes produit / Bugs signalés),
  // toujours tous les deux visibles quel que soit le rôle — avant, un seul
  // onglet "actif" existait par rôle (admin : "Demandes reçues" combinant
  // les deux catégories ; utilisateur normal : "Mes demandes" idem), avec
  // les deux catégories mélangées à l'intérieur via des en-têtes de section
  // (retour utilisateur : demandes produit et bugs signalés n'ont rien à
  // voir, autant leur donner chacun sa page plutôt qu'une simple section).
  // Le rôle continue de décider la SOURCE (file d'attente admin vs mes
  // propres soumissions), indépendamment de l'onglet (type) sélectionné.
  function reqRefreshPanel(){
    var isAdmin = reqIsAdmin();
    // Titre de la fenêtre lui-même (pas seulement le bouton qui l'ouvre,
    // voir btnRequestsMenuTitle dans js/auth.js) — même logique, pour ne pas
    // laisser un non-admin sur un titre générique "Demandes en attente" qui
    // suggère à tort une file d'attente à traiter comme pour un admin.
    var panelTitle = document.getElementById('requestsPanelTitle');
    if(panelTitle) panelTitle.textContent = isAdmin ? 'Demandes en attente' : 'Mes demandes en attente';
    if(isAdmin){
      reqLoadAdminList(_reqPanelTab);
    } else {
      reqLoadMineList(_reqPanelTab);
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
    // Sur mobile/tablette, si "Demandes en attente" a été ouvert DEPUIS le
    // tiroir menu (voir js/actions-mobile-chrome.js), la croix doit "revenir" au menu
    // plutôt que de retomber sur la page du dessous (retour utilisateur).
    // Ne se déclenche que pour cette entrée précise — pas pour un accepter/
    // refuser (qui rafraîchit la liste sans fermer) ni pour une fermeture
    // depuis le menu ⋮ desktop (jamais mis à true dans ce cas).
    var reopenMenu = !!window._reqOpenedFromMobileMenu;
    if(reopenMenu) window._reqOpenedFromMobileMenu = false;
    if(typeof window._setHeaderBackMode === 'function') window._setHeaderBackMode('requestsPanelClose', 'requestsBackBtn', false);
    function afterClose(){
      // Rouvrir le menu seulement une fois le panneau réellement masqué —
      // le rouvrir avant que l'animation de fermeture (fadeBgOut) soit
      // terminée empilait un instant son fond grisé par-dessus celui du
      // menu tout juste réouvert (même correctif que pour Paramètres, voir
      // closeSettingsOverlay dans js/actions-compare.js — retour utilisateur :
      // "souci d'overlay").
      if(reopenMenu && typeof window._openMenuSheet === 'function') window._openMenuSheet();
    }
    if(overlay){
      function hideNow(){
        overlay.classList.remove('open');
        overlay.style.display = 'none';
        afterClose();
      }
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(overlay, hideNow);
      } else {
        hideNow();
      }
    } else {
      afterClose();
    }
    document.body.classList.remove('modal-open');
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
    // Sur mobile, si "Signaler un bug" a été ouvert DEPUIS le tiroir menu
    // (voir msWithBack('msReportBug', ...) dans js/actions-mobile-chrome.js), la croix
    // (ou "Annuler", ou un envoi réussi — tout passe par ici) doit "revenir"
    // au menu plutôt que de retomber sur la page du dessous — même principe
    // que Paramètres/Demandes/Connexion/Comparateur.
    var reopenMenu = !!window._bugReportOpenedFromMobileMenu;
    if(reopenMenu) window._bugReportOpenedFromMobileMenu = false;
    if(typeof window._setHeaderBackMode === 'function') window._setHeaderBackMode('bugReportCloseBtn', 'bugReportBackBtn', false);
    function afterClose(){
      // Rouvrir le menu seulement une fois le panneau réellement masqué,
      // sinon les deux fonds grisés se superposent un instant.
      if(reopenMenu && typeof window._openMenuSheet === 'function') window._openMenuSheet();
    }
    if(!overlay){ afterClose(); return; }
    document.body.classList.remove('modal-open');
    function hideNow(){
      overlay.classList.remove('open');
      overlay.style.display = 'none';
      afterClose();
    }
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(overlay, hideNow);
    } else {
      hideNow();
    }
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
      if(bugImagePreviewEl.src) window._showImageLightbox(bugImagePreviewEl.src);
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

    // ── "Proposer une modification" (fiche produit) — item du menu ⓘ,
    // à la place de "Modifier la fiche" quand canEdit est absent ──
    var vmProposeMenuBtn = document.getElementById('vmProposeMenuBtn');
    if(vmProposeMenuBtn) vmProposeMenuBtn.addEventListener('click', function(){
      var vmInfoMenuEl = document.getElementById('vmInfoMenu');
      if(vmInfoMenuEl) vmInfoMenuEl.classList.remove('open');
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
        // Le filtre par gravité n'a de sens que sur l'onglet "Bugs
        // signalés" — masqué sur "Demandes produit" (ce champ n'existe pas
        // pour ce type). La sélection en cours est conservée d'un onglet à
        // l'autre plutôt que réinitialisée : si l'utilisateur revient sur
        // "Bugs" après être passé sur "Demandes produit", son filtre est
        // toujours actif.
        var sevWrap = document.getElementById('reqSeverityFilterWrap');
        if(sevWrap) sevWrap.style.display = (_reqPanelTab === 'bug') ? 'block' : 'none';
        reqRefreshPanel();
      });
    });

    var reqSeverityFilterEl = document.getElementById('reqSeverityFilter');
    if(reqSeverityFilterEl) reqSeverityFilterEl.addEventListener('change', function(){
      _reqSeverityFilter = reqSeverityFilterEl.value;
      reqRefreshPanel();
    });

    var btnAccept = document.getElementById('btnAcceptAllRequests');
    if(btnAccept) btnAccept.addEventListener('click', async function(){
      if(!(await customConfirm('Accepter toutes les demandes ?', '', { okLabel: 'Accepter tout' }))) return;
      var sUrl = reqServerUrl();
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      // /pullDatasReq a disparu — /pullDatas?request=true (voir reqSubmit).
      // Filtre type!=="bug" par sécurité, même raison que reqLoadAdminList.
      var r = await fetch(sUrl + '/pullDatas?request=true', { headers: h, cache: 'no-store' });
      if(!r.ok) return;
      var d = await r.json();
      var items = ((d && d.items) || (Array.isArray(d) ? d : []))
        .filter(_reqIsPending)
        .filter(function(it){ return ((it && it.data) || {}).type !== 'bug'; });
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
      if(!(await customConfirm('Refuser toutes les demandes ?', 'Toutes les demandes en attente seront rejetées. Cette opération est irréversible.', { okLabel: 'Refuser tout', danger: true }))) return;
      var sUrl = reqServerUrl();
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      // /pullDatasReq a disparu — /pullDatas?request=true (voir reqSubmit).
      var r = await fetch(sUrl + '/pullDatas?request=true', { headers: h, cache: 'no-store' });
      if(!r.ok) return;
      var d = await r.json();
      // _reqIsPending d'abord : voir son commentaire — sans ce filtre, "Tout
      // refuser" aurait bouclé sur le catalogue entier via reqRefuse (chaque
      // appel individuel reste protégé par _reqDiscardPendingRow, mais
      // autant ne même pas tenter l'appel sur des centaines de vrais
      // produits).
      var items = ((d && d.items) || (Array.isArray(d) ? d : []))
        .filter(_reqIsPending)
        .filter(function(it){ return ((it && it.data) || {}).type !== 'bug'; });
      for(var i = 0; i < items.length; i++){
        var it = items[i];
        var user = (it.data || {})._reqUser || it.user || '';
        await window.reqRefuse(it.ref, user, it.id);
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