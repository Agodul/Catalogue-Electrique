  // ── Verrou "en cours d'édition" ─────────────────────────────────────
  // Empêche deux utilisateurs de modifier le même produit en même temps
  // (retour utilisateur). Bricolage volontaire sur l'API produit EXISTANTE
  // (/pushDatas) plutôt qu'une vraie API de verrou dédiée côté serveur (qui
  // n'existe pas) : le verrou est juste deux champs ordinaires du produit,
  // _editingBy/_editingAt, pas un mécanisme atomique — voir withoutServerFields
  // ci-dessus, qui les exclut du calcul de conflit (poser/retirer ce verrou
  // n'est jamais un vrai conflit éditorial). Limite connue et acceptée : deux
  // utilisateurs cliquant "Modifier" à quelques centaines de ms d'intervalle
  // pourraient théoriquement passer tous les deux (fenêtre de course de
  // l'ordre d'un aller-retour réseau) — seule une vraie API de verrou
  // atomique côté serveur éliminerait ça complètement.
  // 10 min : au-delà, verrou considéré abandonné (onglet fermé/planté sans
  // libérer) côté client plutôt qu'un blocage définitif. AUCUNE purge
  // n'existe côté serveur — tout le cycle de vie du verrou (pose, lecture,
  // expiration, nettoyage) est géré côté client. Un verrou expiré n'est
  // donc jamais bloquant (voir _checkProductEditLockBlocks plus bas), mais
  // sans nettoyage actif ses champs resteraient sur le produit indéfiniment
  // tant que personne ne retente une édition dessus (qui les écraserait) —
  // _fetchAllLockedProducts s'en charge activement à chaque appel : tout
  // verrou expiré parmi les fiches reçues est nettoyé au passage plutôt que
  // simplement listé comme verrouillé.
  var EDIT_LOCK_TTL_MS = 10 * 60 * 1000;

  function _editLockCurrentUser(){
    var u = typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null;
    return u ? (u.username || u.name || null) : null;
  }

  // Identifiant unique par ONGLET (pas par compte) — sessionStorage : régénéré
  // à chaque nouvel onglet/fenêtre, conservé tant que cet onglet reste ouvert
  // (survit à un F5 dans ce même onglet). Nécessaire car le verrou comparait
  // jusqu'ici uniquement le NOM D'UTILISATEUR (_editingBy !== me) — deux
  // sessions connectées sous le MÊME compte (deux onglets, deux appareils, un
  // compte partagé par plusieurs personnes) se voyaient donc comme "moi-même"
  // l'une l'autre, et pouvaient éditer le même produit en parallèle sans
  // jamais être bloquées (retour utilisateur : "comment on fait quand c'est
  // deux sessions identiques ?"). Comparer l'ID de session plutôt que le nom
  // distingue bien deux onglets même identiquement connectés.
  // Math.random() n'est pas un générateur cryptographiquement sûr (issue
  // CodeQL "Insecure randomness") — prévisible en théorie, ce qui permettrait
  // à quelqu'un de deviner/forger un ID de session ou de produit. Remplacé
  // partout dans ce fichier (verrou d'édition + ID produit) par
  // crypto.getRandomValues(), la source d'aléa fournie par le navigateur
  // lui-même pour cet usage. Alphabet base36 (0-9a-z) comme avant, juste la
  // source d'aléa change — aucun format d'ID existant n'est cassé.
  function _secureRandomBase36(len){
    var out = '';
    while(out.length < len){
      var buf = new Uint8Array(1);
      window.crypto.getRandomValues(buf);
      out += (buf[0] % 36).toString(36);
    }
    return out.slice(0, len);
  }

  function _editLockSessionId(){
    try {
      var id = sessionStorage.getItem('cat_edit_lock_session');
      if(!id){
        id = 'sess_' + Date.now() + '_' + _secureRandomBase36(8);
        sessionStorage.setItem('cat_edit_lock_session', id);
      }
      return id;
    } catch(e){
      // sessionStorage indisponible (navigation privée stricte, etc.) —
      // repli sur un ID généré une fois en mémoire pour la durée de la page.
      if(!window._editLockSessionIdFallback){
        window._editLockSessionIdFallback = 'sess_' + Date.now() + '_' + _secureRandomBase36(8);
      }
      return window._editLockSessionIdFallback;
    }
  }

  // Lit l'état du verrou DIRECTEMENT depuis /pullDatas, sans passer par
  // syncFromServer()/le mécanisme habituel de fusion : pour un compte admin,
  // ce mécanisme ne réécrit JAMAIS products[idx] avec le contenu serveur
  // pour une ref déjà connue localement tant qu'aucun conflit n'est résolu
  // via la modale dédiée ("Local conservé par défaut pour l'admin", voir
  // plus haut) — un verrou posé par un AUTRE admin ne serait donc jamais vu
  // par ce biais. Lecture brute, en parallèle, sans toucher à products[].
  // Renvoie {fetched:true, state} en cas de succès (state=null si la ref est
  // introuvable côté serveur — cas normal), ou {fetched:false, state:null}
  // si le serveur n'a pas pu être joint — DISTINCT de "pas de verrou" : voir
  // _tryLockProductForEdit, qui bloque l'édition dans ce second cas (retour
  // utilisateur : l'édition hors-ligne ne devrait pas être possible tant
  // qu'un serveur est configuré, impossible sinon de savoir si quelqu'un
  // d'autre édite déjà ce produit).
  async function _fetchServerLockState(p){
    if(!serverUrl || !p) return { fetched:true, state:null };
    try {
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      // ?ref= : filtrer sur CE produit plutôt qu'un /pullDatas sans
      // paramètre (dump complet du catalogue) — confirmé fonctionnel côté
      // serveur réel (retour utilisateur, capture Swagger à l'appui), et
      // bien plus fiable/rapide qu'un dump complet à chaque clic sur
      // "Modifier" pour un catalogue de plusieurs centaines de produits.
      var url = serverUrl + '/pullDatas' + (p.ref ? '?ref=' + encodeURIComponent(p.ref) : '');
      var r = await fetch(url, { headers: h, cache: 'no-store' });
      if(!r.ok) return { fetched:false, state:null };
      var data = await r.json();
      var items = (data && Array.isArray(data.items)) ? data.items.map(function(it){ return it.data; }) : (Array.isArray(data) ? data : []);
      var found = items.find(function(it){ return it && (it.id === p.id || (p.ref && it.ref === p.ref)); }) || null;
      return { fetched:true, state: found };
    } catch(e){ return { fetched:false, state:null }; }
  }

  // Vérification partagée par _tryLockProductForEdit (avant d'ouvrir
  // "Modifier") ET deleteProduct (avant "Supprimer", voir
  // js/render-card-grid.js) — un
  // produit en cours d'édition par quelqu'un d'autre ne devrait pas non plus
  // pouvoir être supprimé sous ses pieds (retour utilisateur). Retourne
  // {blocked:false} si l'action peut continuer, {blocked:true, message,
  // lockedBy?} sinon (lockedBy seulement si le blocage vient d'un verrou
  // actif — pas d'une simple impossibilité de vérifier).
  async function _checkProductEditLockBlocks(p, actionVerb){
    actionVerb = actionVerb || 'modifier';
    if(!serverUrl || !p) return { blocked:false }; // pas de serveur configuré du tout = usage solo, rien à coordonner
    var me = _editLockCurrentUser();
    // Hors-ligne : impossible de vérifier si quelqu'un d'autre édite déjà ce
    // produit — bloquer plutôt que risquer un conflit découvert bien plus
    // tard à la resynchronisation (retour utilisateur). navigator.onLine
    // donne une réponse instantanée dans le cas évident (pas de réseau du
    // tout) ; le fetch ci-dessous reste la vérification faisant foi (attrape
    // aussi les cas où onLine ment : portail captif, serveur down, etc.).
    if(typeof navigator !== 'undefined' && navigator.onLine === false){
      return { blocked:true, message: 'Vous semblez hors connexion — impossible de vérifier si ce produit est déjà en cours de modification. Reconnectez-vous avant de le ' + actionVerb + '.' };
    }
    var check = await _fetchServerLockState(p);
    if(!check.fetched){
      return { blocked:true, message: 'Impossible de joindre le serveur pour vérifier ce produit — vérifiez votre connexion avant de le ' + actionVerb + '.' };
    }
    var serverState = check.state;
    var mySessionId = _editLockSessionId();
    // Verrou posé par CET onglet précis (même ID de session) → jamais
    // bloquant, qu'importe le nom d'utilisateur (ex. re-cliquer "Modifier"
    // sur un produit déjà ouvert dans ce même onglet). Absence de
    // _editingSessionId (verrou posé par une version plus ancienne de
    // l'app, avant ce correctif) : repli sur la comparaison par nom
    // d'utilisateur d'avant, pour ne pas bloquer à tort pendant la
    // transition.
    var isMySession = serverState && serverState._editingSessionId
      ? serverState._editingSessionId === mySessionId
      : (serverState && serverState._editingBy === me);
    if(serverState && serverState._editingBy && !isMySession && serverState._editingAt && (Date.now() - serverState._editingAt) < EDIT_LOCK_TTL_MS){
      // lockedBy exposé à part (en plus de "message", déjà composé pour un
      // affichage texte brut) pour que l'appelant puisse construire une
      // popup HTML en échappant lui-même ce nom (voir vmEditBtn dans
      // js/render-view-modal-close.js et deleteProduct dans
      // js/render-card-grid.js) — un nom d'utilisateur reste une donnée
      // dynamique, jamais insérée telle quelle dans du HTML.
      // Même compte mais autre session (deux onglets/appareils connectés
      // sous le même identifiant) : message dédié plutôt que d'afficher à
      // l'utilisateur son propre nom, ce qui prêterait à confusion.
      var sameAccountOtherSession = serverState._editingBy === me;
      return {
        blocked:true,
        lockedBy: serverState._editingBy,
        message: sameAccountOtherSession
          ? 'Vous êtes déjà en train de modifier ce produit depuis un autre onglet ou un autre appareil — terminez ou fermez cette autre session avant de continuer ici.'
          : serverState._editingBy + ' est en cours de modification de ce produit — réessayez dans quelques instants.'
      };
    }
    return { blocked:false };
  }
  window._checkProductEditLockBlocks = _checkProductEditLockBlocks;

  // Appelé au clic sur "Modifier" (voir vmEditBtn dans js/render-view-modal-close.js), AVANT
  // d'ouvrir le formulaire. Retourne {ok:true} si l'édition peut commencer,
  // {ok:false, message, lockedBy?} sinon.
  async function _tryLockProductForEdit(p){
    if(!serverUrl || !p) return { ok:true };
    var check = await _checkProductEditLockBlocks(p, 'modifier');
    if(check.blocked) return { ok:false, message: check.message, lockedBy: check.lockedBy };
    // Poser le verrou : push immédiat sur la base du contenu LOCAL (celui
    // affiché/édité par CET utilisateur — cohérent avec "Local conservé par
    // défaut pour l'admin" ci-dessus, on ne veut pas écraser silencieusement
    // un contenu local avec une copie serveur potentiellement plus ancienne
    // juste pour poser un verrou), en y ajoutant _editingBy/_editingAt (nom
    // affiché) et _editingSessionId (identité réelle du verrou — voir
    // _checkProductEditLockBlocks : distingue deux onglets/appareils même
    // connectés sous le même compte).
    var me = _editLockCurrentUser();
    var idx = products.findIndex(function(x){ return x.id === p.id; });
    var toLock = Object.assign({}, p, { _editingBy: me || 'Utilisateur', _editingAt: Date.now(), _editingSessionId: _editLockSessionId() });
    if(idx !== -1) products[idx] = toLock;
    await pushToServer([toLock]);
    return { ok:true };
  }
  window._tryLockProductForEdit = _tryLockProductForEdit;

  // Libère le verrou posé ci-dessus — appelé à la fermeture du formulaire
  // (voir closeModal dans js/modal-editlock-heartbeat.js), qu'il s'agisse d'un Enregistrer
  // (déjà nettoyé explicitement dans btnSave, ceci est alors sans effet) ou
  // d'un Annuler/fermeture directe (seul cas où c'est réellement utile,
  // sinon le verrou resterait posé jusqu'à expiration du TTL ci-dessus). Ne
  // libère JAMAIS un verrou posé par quelqu'un d'autre (vérifie _editingBy
  // === moi) — sans cette garde, appeler cette fonction depuis un contexte
  // qui n'a jamais posé le verrou (ex. mode "Proposer une modification" sur
  // le même produit) pourrait effacer à tort le verrou d'un tiers.
  async function _releaseProductEditLock(id){
    if(!serverUrl || !id) return;
    var idx = products.findIndex(function(x){ return x.id === id; });
    if(idx === -1) return;
    var p = products[idx];
    var me = _editLockCurrentUser();
    // Comparaison par ID de session (pas juste le nom) : sans ça, un second
    // onglet connecté sous le MÊME compte pouvait libérer par erreur le
    // verrou posé par un premier onglet toujours en train d'éditer (les deux
    // se ressemblaient comme "moi-même" par nom d'utilisateur seul). Repli
    // sur le nom si le produit local n'a pas encore ce champ (verrou posé
    // avant ce correctif).
    var isMySession = p._editingSessionId
      ? p._editingSessionId === _editLockSessionId()
      : (p._editingBy === me);
    if(!p._editingBy || !isMySession) return;
    delete p._editingBy;
    delete p._editingAt;
    delete p._editingSessionId;
    await pushToServer([p]);
  }
  window._releaseProductEditLock = _releaseProductEditLock;

  // Rafraîchit _editingAt sur le verrou déjà posé par CETTE session —
  // appelé périodiquement par le "heartbeat" (voir js/modal-editlock-heartbeat.js,
  // _startEditLockHeartbeat) tant que l'utilisateur interagit réellement
  // avec le formulaire "Modifier le produit" (retour utilisateur : sans ça,
  // éditer une fiche plus de 10 min d'affilée laisserait quelqu'un d'autre
  // commencer à éditer la même fiche en même temps — voir EDIT_LOCK_TTL_MS
  // plus haut et le nettoyage actif des verrous périmés dans
  // syncFromServer). Le heartbeat lui-même ne rafraîchit que sur activité
  // récente (frappe/clic dans le formulaire) — un onglet resté ouvert sans
  // personne devant doit continuer à laisser le verrou expirer normalement,
  // ce nettoyage-ci ne change rien à cette logique. Même garde que
  // _releaseProductEditLock : ne touche jamais un verrou qui n'est pas le
  // nôtre.
  async function _refreshProductEditLock(id){
    if(!serverUrl || !id) return;
    var idx = products.findIndex(function(x){ return x.id === id; });
    if(idx === -1) return;
    var p = products[idx];
    var me = _editLockCurrentUser();
    var isMySession = p._editingSessionId
      ? p._editingSessionId === _editLockSessionId()
      : (p._editingBy === me);
    if(!p._editingBy || !isMySession) return;
    p._editingAt = Date.now();
    await pushToServer([p]);
  }
  window._refreshProductEditLock = _refreshProductEditLock;

  // ── Déverrouillage manuel (admin) ────────────────────────────────────
  // Contrepartie de _releaseProductEditLock ci-dessus, mais SANS la
  // vérification "isMySession" : tout l'intérêt est justement de lever le
  // verrou de QUELQU'UN D'AUTRE, posé par une session qui a planté/fermé
  // son onglet sans jamais relâcher — sinon il faut attendre l'expiration
  // du TTL (10 min, EDIT_LOCK_TTL_MS ci-dessus) sans recours (retour
  // utilisateur). Lecture directe via /pullDatas (comme
  // _fetchServerLockState), jamais via syncFromServer()/le merge habituel,
  // pour ne déclencher aucune UI de résolution de conflit ici — cette page
  // ne fait que lister/déverrouiller, jamais fusionner de contenu produit.
  async function _fetchAllLockedProducts(){
    if(!serverUrl) return { fetched:false, locked:[] };
    try{
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      var r = await fetch(serverUrl + '/pullDatas', { headers: h, cache: 'no-store' });
      if(!r.ok) return { fetched:false, locked:[] };
      var data = await r.json();
      var items = (data && Array.isArray(data.items)) ? data.items.map(function(it){ return it.data; }) : (Array.isArray(data) ? data : []);
      var allLocked = items.filter(function(p){ return p && p._editingBy; });

      // Pas de purge serveur (voir EDIT_LOCK_TTL_MS ci-dessus) : nettoyer
      // ici, activement, tout verrou trouvé au-delà du TTL parmi les fiches
      // fraîchement reçues plutôt que de simplement le lister comme
      // "verrouillé" — sinon un verrou abandonné (crash/fermeture d'onglet)
      // reste affiché indéfiniment tant que personne ne le déverrouille à la
      // main ou ne retente une édition sur ce produit précis.
      var now = Date.now();
      var fresh = [];
      var cleanups = [];
      allLocked.forEach(function(p){
        var age = typeof p._editingAt === 'number' ? (now - p._editingAt) : null;
        if(age !== null && age >= EDIT_LOCK_TTL_MS){
          cleanups.push(_adminForceUnlockProduct(p));
        } else {
          fresh.push(p);
        }
      });
      if(cleanups.length) await Promise.all(cleanups);

      return { fetched:true, locked: fresh };
    }catch(e){ return { fetched:false, locked:[] }; }
  }
  window._fetchAllLockedProducts = _fetchAllLockedProducts;

  // Force le retrait du verrou d'un produit, quelle que soit la session qui
  // l'a posé — action explicite déclenchée par un admin depuis Paramètres →
  // Fiches verrouillées, avec confirmation dans l'UI avant l'appel (voir
  // renderSettingsLockedPage). p vient du dump serveur brut (pas forcément
  // dans products[] localement) — met aussi à jour products[] par cohérence
  // si l'entrée y existe déjà.
  async function _adminForceUnlockProduct(p){
    if(!serverUrl || !p) return false;
    var clean = Object.assign({}, p);
    delete clean._editingBy;
    delete clean._editingAt;
    delete clean._editingSessionId;
    var ok = await pushToServer([clean]);
    if(ok){
      var idx = products.findIndex(function(x){ return x.id === p.id || (p.ref && x.ref === p.ref); });
      if(idx !== -1){
        delete products[idx]._editingBy;
        delete products[idx]._editingAt;
        delete products[idx]._editingSessionId;
      }
    }
    return ok;
  }
  window._adminForceUnlockProduct = _adminForceUnlockProduct;

  // ── Vérifie qu'un changement d'icône de famille a bien été persisté par le
  // serveur — un fetch qui répond 200 ne garantit pas que le serveur a
  // effectivement conservé le champ familyIcon (il peut l'ignorer/le
  // rejeter silencieusement). On relit les données pour s'en assurer et on
  // alerte clairement si l'icône affichée par le serveur ne correspond pas.
  async function verifyFamilyIconOnServer(family, expectedIcon, refs){
    if(!serverUrl || !refs || !refs.length) return;
    try{
      // Laisser le temps au push (déclenché par save()) d'arriver au serveur
      await new Promise(function(r){ setTimeout(r, 1500); });
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      var r = await fetch(serverUrl+'/pullDatas', { headers: h });
      if(!r.ok) return;
      var data = await r.json();
      var serverItems = data && Array.isArray(data.items)
        ? data.items.map(function(i){ return i.data; })
        : (Array.isArray(data) ? data : []);
      var mismatched = refs.filter(function(ref){
        var sp = serverItems.find(function(x){ return x && x.ref === ref; });
        return sp && sp.familyIcon !== expectedIcon;
      });
      if(mismatched.length){
        showToast('Le serveur n\'a pas confirmé la nouvelle icône de "'+family+'" (vérifiez la configuration serveur)', 'warn', 6000);
        console.warn('verifyFamilyIconOnServer: mismatch pour', mismatched);
      }
    }catch(e){ console.warn('verifyFamilyIconOnServer:', e.message); }
  }

