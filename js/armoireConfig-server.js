// ── Serveur : blocs et configurations sauvegardées ───────────────────────

function _armoireApi(path, opts){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl) return Promise.reject(new Error('Aucun serveur configuré'));
  return fetch(sUrl + path, Object.assign({ headers: authHeaders() }, opts || {})).then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function _armoireFetchBlocks(){
  return _armoireApi('/configBlocks').then(function(list){
    _armoireSetBlocksFromServer(list);
    _armoireRenderBlocksList();
  }).catch(function(e){
    // Échec silencieux auparavant — impossible de savoir si la liste
    // affichée est juste vide ou périmée suite à une requête ratée (retour
    // utilisateur : oblige à F5 pour voir un bloc qu'on vient de créer,
    // signe d'un échec de ce fetch avalé sans message).
    console.warn('_armoireFetchBlocks:', e && e.message);
    if(typeof showToast === 'function') showToast('Liste des blocs non actualisée — réessayez', 'warn', 3000);
  });
}

// Retour utilisateur, capture à l'appui : des entrées "Brouillon — X"
// dupliquées et VISIBLES dans la liste "Blocs" partagée par toute l'équipe
// ("lorsque je modifie la config en cours c'est automatiquement ajouté aux
// blocs [...] je voulais que ça reste que dans la configuration en cours").
// Cause : draft/username (voir plus bas) ne reviennent apparemment pas
// fidèlement de CE serveur une fois enregistrés (schéma pas encore accepté
// en écriture malgré la confirmation reçue) — _armoireFindServerDraft ne
// retrouvait donc JAMAIS sa propre entrée via draft===true, recréait une
// nouvelle entrée à CHAQUE sauvegarde automatique au lieu de la remplacer
// (_armoireServerDraftId restait toujours null), d'où l'empilement.
// Préfixe distinctif, jamais choisi par un vrai bloc (l'utilisateur ne tape
// jamais lui-même ce nom) : sert de repli fiable pour reconnaître/filtrer un
// brouillon même si draft/username ne sont pas persistés tels quels.
var ARMOIRE_DRAFT_NAME_PREFIX = 'Brouillon — ';

// Retrouve, parmi les entrées /configBlocks déjà chargées (_armoireBlocks),
// celle qui est LE brouillon serveur précis recherché pour L'UTILISATEUR
// CONNECTÉ — jamais celui d'un autre compte, même si le serveur en
// renvoyait un par erreur. `name` optionnel : par défaut le nom
// "principal" (compte à un seul brouillon actif, cas historique) — passer
// un nom explicite pour retrouver un emplacement PRÉCIS parmi plusieurs
// (voir _armoireOtherDraftSlots).
// Retour utilisateur, capture à l'appui (repéré en testant plusieurs
// emplacements à la fois) : matcher n'IMPORTE QUELLE entrée draft===true de
// ce compte dès qu'aucun nom précis n'était demandé — un repli hérité de
// l'époque où un compte n'avait jamais qu'UN SEUL brouillon actif, donc
// "n'importe lequel" = "le bon" — devenait ambigu et pouvait retomber sur
// le MAUVAIS emplacement dès que plusieurs coexistaient. Le NOM (le champ
// qui, lui, revient fidèlement — voir ARMOIRE_DRAFT_NAME_PREFIX plus haut,
// contrairement à draft/username) est donc désormais TOUJOURS le critère
// décisif, jamais contournable.
function _armoireFindServerDraft(name){
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  if(!username) return null;
  var expectedName = name || (ARMOIRE_DRAFT_NAME_PREFIX + username);
  var matches = _armoireBlocks.filter(function(b){
    if(!b) return false;
    // N'exige username QUE s'il est présent sur l'entrée (pour rester
    // utilisable même si ce champ ne revient pas fidèlement, voir plus haut).
    return b.name === expectedName && (!b.username || b.username === username);
  });
  if(!matches.length) return null;
  // Retour utilisateur, capture à l'appui : des doublons du même brouillon
  // peuvent momentanément coexister (voir _armoireDetectOtherDraftSlots, qui
  // les nettoie mais après coup) — le plus RÉCENT (createdAt) est toujours
  // celui qui reflète vraiment le dernier contenu enregistré, jamais un
  // simple premier trouvé arbitraire.
  return matches.reduce(function(best, b){
    return (!best || (b.createdAt || 0) > (best.createdAt || 0)) ? b : best;
  }, null);
}

// Repère TOUS les brouillons actifs (draft===true) du compte connecté,
// autres que celui actuellement chargé dans _armoireDraft (identifié par
// _armoireServerDraftId) — appelée après chaque _armoireFetchBlocks() pour
// que le sélecteur reste correct même après un rechargement de page (pas
// seulement juste après une réconciliation "Garder"/"Mettre de côté").
function _armoireDetectOtherDraftSlots(){
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  if(!username){ _armoireOtherDraftSlots = []; _armoireRenderDraftSwitcher(); return; }
  var prefix = ARMOIRE_DRAFT_NAME_PREFIX + username;
  var activeName = _armoireActiveDraftName || prefix;
  var mine = _armoireBlocks.filter(function(b){
    if(!b) return false;
    if(b.draft === true && b.username === username) return true;
    // Même repli nom que _armoireFindServerDraft, pour les mêmes raisons.
    return typeof b.name === 'string' && b.name.indexOf(prefix) === 0 && (!b.username || b.username === username);
  });
  // Retour utilisateur, capture à l'appui : plusieurs pastilles "Autre
  // config." avec EXACTEMENT le même nombre de références que l'active —
  // ce ne sont jamais de VRAIES configurations distinctes, mais le même
  // bug serveur déjà documenté plus haut (draft/username ne reviennent pas
  // toujours fidèlement une fois enregistrés, si bien que _armoireReplaceEntry
  // recrée parfois une entrée au lieu de remplacer l'ancienne) qui refaisait
  // déjà s'empiler des doublons AVANT ce chantier — simplement invisibles
  // jusqu'ici puisque seul _armoireFindServerDraft (un .find, premier
  // trouvé) les consultait. Un nom (ARMOIRE_DRAFT_NAME_PREFIX+username, ou
  // son suffixe "(2)") identifie un SEUL emplacement logique : regrouper par
  // nom et ne garder que le plus récent élimine les doublons de l'affichage,
  // et supprimer les autres còté serveur évite qu'ils ne réapparaissent
  // indéfiniment à chaque ouverture.
  var byName = {};
  mine.forEach(function(b){
    var key = b.name || '';
    if(!byName[key] || (b.createdAt || 0) > (byName[key].createdAt || 0)) byName[key] = b;
  });
  mine.forEach(function(b){
    if(byName[b.name || ''] === b) return; // le plus récent de son nom : à garder
    _armoireMarkEntryRetired('/configBlocks', b.id);
    _armoireApi('/configBlocks/' + encodeURIComponent(b.id), { method: 'DELETE' }).catch(function(e){
      console.warn('_armoireDetectOtherDraftSlots (nettoyage doublon):', e && e.message);
    });
  });
  _armoireOtherDraftSlots = Object.keys(byName).filter(function(name){
    var b = byName[name];
    return name !== activeName && b.id !== _armoireServerDraftId;
  }).map(function(name){
    var b = byName[name];
    // Clé stable (voir _armoireGetOrCreateSlotKey) : réutilise celle déjà
    // connue pour cet id/nom (ex. déjà vu comme actif ou lors d'un précédent
    // rafraîchissement), n'en crée une nouvelle que pour un emplacement
    // JAMAIS encore rencontré cette session — évite qu'un simple
    // rafraîchissement (après chaque synchro) ne fasse sauter les lignes.
    return { id: b.id, name: b.name, items: Array.isArray(b.items) ? b.items : [], key: _armoireGetOrCreateSlotKey(b.id, b.name) };
  });
  _armoireRenderDraftSwitcher();
}

// Retour utilisateur : "faudrait pouvoir en avoir plusieurs" — le nombre
// d'emplacements actifs n'est plus limité à 2 (conflit "Garder"/"Mettre de
// côté" à la connexion) : ce nom sert à identifier chaque NOUVEAU brouillon
// créé volontairement (voir _armoireCreateNewDraftSlot, mais aussi
// _armoireReconcileOwnerOnLogin et _armoireRenameDraftSlot) sans jamais
// entrer en collision avec un nom déjà pris. Cherche à la fois dans
// _armoireBlocks (source serveur, déjà rafraîchie par l'appelant) ET dans
// l'état en mémoire (_armoireActiveDraftName/_armoireOtherDraftSlots) — un
// emplacement tout juste créé côté page peut ne pas encore être remonté par
// le serveur.
// `label` optionnel (retour utilisateur : "faudrait pouvoir mettre un nom
// sur la config en cours") : un nom choisi par l'utilisateur s'insère après
// le préfixe technique (ex. "Brouillon — jdupont · Armoire salle 3"),
// extrait ensuite pour l'affichage par _armoireDraftLabelFromName — sans
// label, retombe sur l'ancien schéma numéroté (" (2)", " (3)"…). Un
// éventuel doublon (même label déjà pris, ou aucun label et nom principal
// déjà pris) reçoit lui aussi un suffixe numérique, jamais de collision
// silencieuse. `excludeName` : le propre nom actuel de l'emplacement qu'on
// est en train de renommer (voir _armoireRenameDraftSlot), pour ne pas se
// considérer soi-même comme "déjà pris" en renommant vers un nom inchangé.
function _armoireNextDraftSlotName(username, label, excludeName){
  var prefix = ARMOIRE_DRAFT_NAME_PREFIX + username;
  var base = label ? (prefix + ' · ' + label) : prefix;
  var used = {};
  _armoireBlocks.forEach(function(b){
    if(!b || typeof b.name !== 'string' || b.name === excludeName) return;
    if(b.draft === true && b.username === username) used[b.name] = true;
    else if(b.name.indexOf(prefix) === 0 && (!b.username || b.username === username)) used[b.name] = true;
  });
  if(_armoireActiveDraftName && _armoireActiveDraftName !== excludeName) used[_armoireActiveDraftName] = true;
  _armoireOtherDraftSlots.forEach(function(s){ if(s.name && s.name !== excludeName) used[s.name] = true; });
  if(!used[base]) return base;
  var n = 2;
  while(used[base + ' (' + n + ')']) n++;
  return base + ' (' + n + ')';
}

// Extrait le nom choisi par l'utilisateur (voir _armoireNextDraftSlotName)
// d'un nom serveur complet, pour l'affichage dans le sélecteur — chaîne
// vide si cet emplacement n'a jamais été nommé (retombe alors sur "Active"/
// "Config N" côté rendu, voir _armoireRenderDraftSwitcher).
function _armoireDraftLabelFromName(name, username){
  if(typeof name !== 'string') return '';
  var prefix = ARMOIRE_DRAFT_NAME_PREFIX + username;
  if(name.indexOf(prefix) !== 0) return '';
  var rest = name.slice(prefix.length).replace(/ \(\d+\)$/, ''); // retire un éventuel " (N)" de désambiguïsation
  var m = rest.match(/^ · (.+)$/);
  return m ? m[1] : '';
}

// Retour utilisateur : "faudrait pouvoir mettre un nom sur la config en
// cours" — renomme un emplacement (actif si slotIndex===-1, sinon
// _armoireOtherDraftSlots[slotIndex]) via une simple boîte de saisie
// (customPrompt, déjà utilisée ailleurs dans ce fichier pour le même genre
// de question). Laisser le champ vide retire le nom personnalisé et
// retombe sur l'affichage générique ("Active"/"Config N").
async function _armoireRenameDraftSlot(slotIndex){
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  if(!username) return;
  var isActive = slotIndex === -1;
  var slot = isActive ? null : _armoireOtherDraftSlots[slotIndex];
  if(!isActive && !slot) return;
  var currentName = isActive ? (_armoireActiveDraftName || (ARMOIRE_DRAFT_NAME_PREFIX + username)) : slot.name;
  var currentLabel = _armoireDraftLabelFromName(currentName, username);
  var newLabel = await customPrompt(
    'Nommer cette configuration',
    'Un nom facultatif pour la reconnaître facilement dans le sélecteur (laisser vide pour revenir au nom générique) :',
    currentLabel
  );
  if(newLabel === null) return; // annulé
  newLabel = newLabel.trim();
  var newName = _armoireNextDraftSlotName(username, newLabel, currentName);
  if(newName === currentName) return; // rien de changé
  if(isActive){
    _armoireActiveDraftName = newName;
    // Le simple changement de nom n'est jamais détecté par
    // _armoireMarkDraftChanged (qui ne compare que les articles, jamais le
    // nom) — synchro forcée explicitement ici, même si le contenu, lui,
    // n'a pas bougé, SEULEMENT si cet emplacement existe déjà côté serveur
    // (sinon rien à renommer là-bas pour l'instant, le nouveau nom partira
    // avec sa toute première sauvegarde).
    if(_armoireServerDraftId) await _armoireSyncDraftToServer();
    _armoireRenderDraftSwitcher();
  } else {
    slot.name = newName;
    if(slot.id){
      try{
        var created = await _armoireReplaceEntry('/configBlocks', slot.id, { draft: true, name: newName, folder: '', items: slot.items });
        var fresh = await _armoireApi('/configBlocks');
        _armoireSetBlocksFromServer(fresh);
        var updated = _armoireFindServerDraft(newName);
        slot.id = updated ? updated.id : ((created && created.id) || null);
      }catch(e){ console.warn('_armoireRenameDraftSlot:', e && e.message); }
    }
    // Le remplacement ci-dessus change l'id serveur de cet emplacement —
    // fait le lien vers SA clé stable existante (voir _armoireActiveSlotKey
    // plus haut) pour que cette ligne ne saute pas de position juste parce
    // qu'on l'a renommée.
    _armoireSlotKeyByIdentity[_armoireSlotIdentity(slot.id, slot.name)] = slot.key;
    _armoireRenderDraftSwitcher();
  }
}

// Bouton "+" de la fenêtre de gestion — démarre un tout NOUVEL emplacement
// vide, sans jamais perdre celui en cours : relégué dans
// _armoireOtherDraftSlots (seulement s'il contient vraiment quelque chose,
// pour ne pas faire apparaître une ligne "Configuration (0)" inutile après
// un simple double clic). Retour utilisateur : "lorsqu'on clique dessus
// faut demander le nom" — demandé D'ABORD, avant même de créer quoi que ce
// soit : annuler la boîte de saisie n'ajoute donc aucune configuration
// vide, contrairement à l'ancien comportement (créée vide, à renommer
// ensuite via le crayon).
async function _armoireCreateNewDraftSlot(){
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  if(!username) return; // jamais affiché sans compte connecté, gardé par prudence
  var label = await customPrompt(
    'Nouvelle configuration',
    'Un nom facultatif pour la reconnaître facilement dans le sélecteur (laisser vide pour un nom générique) :',
    ''
  );
  if(label === null) return; // annulé : aucune configuration créée
  label = label.trim();
  // Même flush préalable que _armoireSwitchDraftSlot, pour la même raison
  // (ne jamais laisser une modification pas encore partie vers le serveur
  // derrière soi en changeant d'emplacement) — fait APRÈS la boîte de
  // saisie, pour ne rien déclencher inutilement si elle est annulée.
  if(_armoireDraftSyncTimer){
    clearTimeout(_armoireDraftSyncTimer);
    _armoireDraftSyncTimer = null;
    await _armoireSyncDraftToServer();
  }
  if(_armoireDraft.length){
    _armoireOtherDraftSlots.push({
      id: _armoireServerDraftId,
      name: _armoireActiveDraftName || (ARMOIRE_DRAFT_NAME_PREFIX + username),
      items: _armoireDraft.slice(),
      key: _armoireActiveSlotKey // reste la même ligne, à sa place, juste plus active
    });
  }
  _armoireDraft = [];
  _armoireServerDraftId = null;
  _armoireActiveDraftName = _armoireNextDraftSlotName(username, label);
  // Toute nouvelle identité, jamais une continuité de l'emplacement qu'on
  // vient de quitter (contrairement à _armoireSwitchDraftSlot/un simple
  // renommage) — voir _armoireEnsureActiveSlotKey, qui sinon confondrait ce
  // tout nouvel emplacement avec l'ancien actif.
  _armoireActiveSlotKey = _armoireSlotKeySeq++;
  _armoireDraftLastSavedItemsJson = null; // vide, rien à sauvegarder tant qu'aucun produit n'y est ajouté
  _armoireRenderDraft();
  _armoireRenderDraftSwitcher();
}

// Petit "✕" sur chaque pastille "Autre config." — sans ça, un compte qui
// crée librement de nouveaux emplacements (voir ci-dessus) n'aurait aucun
// moyen de s'en débarrasser une fois inutiles, contrairement à l'actif
// (déjà nettoyable via "Vider", voir _armoireMarkDraftChanged).
async function _armoireDeleteDraftSlot(slotIndex){
  var slot = _armoireOtherDraftSlots[slotIndex];
  if(!slot) return;
  var count = Array.isArray(slot.items) ? slot.items.length : 0;
  var ok = await customConfirm(
    'Supprimer cette configuration ?',
    'Cette configuration (' + count + ' référence' + (count > 1 ? 's' : '') + ') sera définitivement supprimée. Cette opération est irréversible.',
    { okLabel: 'Supprimer', danger: true }
  );
  if(!ok) return;
  _armoireOtherDraftSlots.splice(slotIndex, 1);
  _armoireRenderDraftSwitcher();
  if(slot.id){
    _armoireMarkEntryRetired('/configBlocks', slot.id);
    _armoireApi('/configBlocks/' + encodeURIComponent(slot.id), { method: 'DELETE' })
      .catch(function(e){ console.warn('_armoireDeleteDraftSlot:', e && e.message); });
  }
}

// Bouton compact "Configuration en cours" — retour utilisateur : "qu'on
// puisse naviguer de l'une à l'autre facilement", puis "faudrait pouvoir en
// avoir plusieurs", puis "pour la liste des config faudrait l'afficher dans
// une fenêtre car si on en a beaucoup ça devient incompréhensible". Une
// rangée de pastilles (l'ancien design) redevenait illisible et débordait
// sur plusieurs lignes dès 4-5 emplacements actifs — remplacée par UN SEUL
// bouton compact ouvrant la vraie liste dans une fenêtre dédiée (voir
// _armoireOpenDraftListModal plus bas), qui n'a elle aucune limite de
// largeur/nombre de lignes.
// Retour utilisateur : "qu'on puisse créer une nouvelle config lorsqu'on a
// juste une seule configuration en cours" — ce bouton restait auparavant
// masqué tant qu'un seul emplacement existait, ce qui rendait le "+" de la
// fenêtre de gestion (voir _armoireOpenDraftListModal) inatteignable sans
// déjà en avoir au moins deux. Reste donc désormais visible dès qu'un
// compte est connecté, même avec une seule configuration.
function _armoireRenderDraftSwitcher(){
  // Toujours en premier : garde la clé stable de l'emplacement actif à jour
  // AVANT toute construction de HTML (bouton compact ou fenêtre de gestion),
  // qu'un id/nom vienne tout juste de changer (synchro, renommage) ou non
  // (voir _armoireEnsureActiveSlotKey).
  _armoireEnsureActiveSlotKey();
  var el = document.getElementById('armoireDraftSwitcher');
  if(el){
    var isLoggedIn = typeof authIsLoggedIn === 'function' && authIsLoggedIn();
    if(!isLoggedIn){
      el.style.display = 'none';
      el.innerHTML = '';
    } else {
      el.style.display = 'flex';
      var total = _armoireOtherDraftSlots.length + 1;
      el.innerHTML = '<button type="button" id="armoireDraftListOpenBtn" style="display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer;">'
        + '<i class="ti ti-layout-grid" style="font-size:14px;"></i>' + total + ' configuration' + (total > 1 ? 's actives' : ' active')
        + '</button>';
    }
  }
  // Garde la fenêtre de gestion à jour si elle est déjà ouverte — un seul
  // point de rafraîchissement pour les deux (voir
  // _armoireRenderDraftListModalBody), plutôt que de le refaire après
  // chaque action (bascule/renommage/suppression/création) une par une.
  _armoireRenderDraftListModalBody();
}

// Contenu de la fenêtre "Configurations en cours" — une ligne par
// emplacement, jamais tronquée ni contrainte en largeur contrairement à
// l'ancienne rangée de pastilles. Retour utilisateur : "faudrait que la
// config qui devient visible passe en bleu sans devoir tout faire bouger" —
// les lignes sont triées par CLÉ STABLE (voir _armoireActiveSlotKey plus
// haut), jamais "l'actif d'abord" : basculer ne fait donc plus que déplacer
// la couleur cuivre d'une ligne à l'autre, chaque ligne restant à sa place.
function _armoireDraftListRowsHtml(){
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  var rows = [{
    key: _armoireActiveSlotKey,
    isActive: true,
    arrIndex: -1,
    label: _armoireDraftLabelFromName(_armoireActiveDraftName || (username ? ARMOIRE_DRAFT_NAME_PREFIX + username : ''), username),
    count: _armoireDraft.length
  }];
  _armoireOtherDraftSlots.forEach(function(slot, i){
    rows.push({
      key: slot.key || 0,
      isActive: false,
      arrIndex: i,
      label: _armoireDraftLabelFromName(slot.name, username),
      count: Array.isArray(slot.items) ? slot.items.length : 0
    });
  });
  rows.sort(function(a, b){ return a.key - b.key; });
  var html = rows.map(function(row, pos){
    var num = pos + 1;
    var name = row.label ? escapeHtml(row.label) : (row.isActive ? 'Configuration active' : ('Configuration ' + num));
    var countText = row.count + ' référence' + (row.count > 1 ? 's' : '');
    var info = '<div style="flex:1;min-width:0;">'
      + '<div style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + name + '</div>'
      + '<div style="font-size:11.5px;' + (row.isActive ? 'opacity:.85;' : 'color:var(--ink-soft);') + '">' + countText + '</div>'
      + '</div>';
    if(row.isActive){
      return '<div class="armoire-draft-list-row" data-slot="-1" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--copper);background:var(--copper);color:#fff;cursor:default;">'
        + '<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.25);color:#fff;font-size:11.5px;font-weight:700;flex-shrink:0;">' + num + '</span>'
        + info
        + '<button type="button" class="armoire-draft-list-rename" data-rename="-1" title="Nommer cette configuration" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:50%;background:none;color:rgba(255,255,255,.9);font-size:13px;cursor:pointer;flex-shrink:0;"><i class="ti ti-pencil"></i></button>'
        + '</div>';
    }
    return '<div class="armoire-draft-list-row" data-slot="' + row.arrIndex + '" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;">'
      + '<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--line);color:var(--ink-soft);font-size:11.5px;font-weight:700;flex-shrink:0;">' + num + '</span>'
      + info
      + '<button type="button" class="armoire-draft-list-rename" data-rename="' + row.arrIndex + '" title="Nommer cette configuration" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:50%;background:none;color:var(--ink-soft);font-size:13px;cursor:pointer;flex-shrink:0;"><i class="ti ti-pencil"></i></button>'
      + '<button type="button" class="armoire-draft-list-del" data-del="' + row.arrIndex + '" title="Supprimer cette configuration" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:50%;background:none;color:var(--ink-soft);font-size:15px;cursor:pointer;flex-shrink:0;">✕</button>'
      + '</div>';
  }).join('');
  // Bouton "+" déplacé dans l'en-tête de la fenêtre (voir
  // _armoireOpenDraftListModal) — retour utilisateur : "à côté de la
  // croix", plus facile à trouver qu'une ligne pointillée en bas de liste,
  // surtout une fois qu'il faut scroller pour l'atteindre.
  return html;
}

var _armoireDraftListModalEl = null;

function _armoireDraftListEscHandler(e){ if(e.key === 'Escape') _armoireCloseDraftListModal(); }

// Fenêtre dédiée listant TOUTES les configurations actives — retour
// utilisateur : "si on en a beaucoup ça devient incompréhensible" avec
// l'ancienne rangée de pastilles. Reste ouverte pendant qu'on renomme/
// supprime/bascule/crée plusieurs emplacements d'affilée (voir
// _armoireRenderDraftListModalBody, rafraîchie automatiquement par
// _armoireRenderDraftSwitcher après chacune de ces actions) — jamais besoin
// de la rouvrir entre deux opérations.
function _armoireOpenDraftListModal(){
  if(_armoireDraftListModalEl) return; // déjà ouverte
  var overlay = document.createElement('div');
  overlay.className = 'spi-popup-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:var(--z-popup,11000);background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML =
    '<div style="background:var(--paper,#fff);border-radius:12px;padding:20px;max-width:440px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:var(--font-sans,inherit);">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
    + '<div style="font-size:18px;font-weight:700;color:var(--ink,#1e293b);">Configurations en cours</div>'
    // Retour utilisateur : "le bouton pour créer une nouvelle config à côté
    // de la croix" — déplacé depuis une ligne pointillée en bas de liste
    // (moins visible, surtout après avoir scrollé) vers l'en-tête, à côté
    // du bouton de fermeture, toujours à portée de clic.
    + '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">'
    + '<button type="button" id="_armoireDraftListNewBtn" title="Démarrer une nouvelle configuration" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:50%;background:var(--copper);color:#fff;font-size:16px;cursor:pointer;"><i class="ti ti-plus"></i></button>'
    + '<button type="button" id="_armoireDraftListCloseBtn" style="border:none;background:none;font-size:18px;color:var(--ink-soft,#64748b);cursor:pointer;line-height:1;padding:4px;">✕</button>'
    + '</div>'
    + '</div>'
    + '<div style="font-size:13px;color:var(--ink-soft,#64748b);margin-bottom:14px;">Cliquez sur une configuration pour y basculer.</div>'
    + '<div id="_armoireDraftListBody" style="overflow-y:auto;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;"></div>'
    + '</div>';
  document.body.appendChild(overlay);
  _armoireDraftListModalEl = overlay;
  _armoireRenderDraftListModalBody();
  overlay.querySelector('#_armoireDraftListCloseBtn').addEventListener('click', _armoireCloseDraftListModal);
  overlay.querySelector('#_armoireDraftListNewBtn').addEventListener('click', _armoireCreateNewDraftSlot);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) _armoireCloseDraftListModal(); });
  overlay.querySelector('#_armoireDraftListBody').addEventListener('click', function(e){
    // Suppression/renommage vérifiés EN PREMIER : imbriqués dans la même
    // ligne que la bascule, closest('.armoire-draft-list-row') remonterait
    // sinon jusqu'à elle et basculerait au lieu de supprimer/renommer.
    var delBtn = e.target.closest ? e.target.closest('.armoire-draft-list-del') : null;
    if(delBtn){ _armoireDeleteDraftSlot(parseInt(delBtn.getAttribute('data-del'), 10)); return; }
    var renameBtn = e.target.closest ? e.target.closest('.armoire-draft-list-rename') : null;
    if(renameBtn){ _armoireRenameDraftSlot(parseInt(renameBtn.getAttribute('data-rename'), 10)); return; }
    var row = e.target.closest ? e.target.closest('.armoire-draft-list-row') : null;
    if(!row) return;
    var idx = parseInt(row.getAttribute('data-slot'), 10);
    if(idx >= 0) _armoireSwitchDraftSlot(idx);
  });
  document.addEventListener('keydown', _armoireDraftListEscHandler);
}

function _armoireCloseDraftListModal(){
  if(!_armoireDraftListModalEl) return;
  if(_armoireDraftListModalEl.parentNode) document.body.removeChild(_armoireDraftListModalEl);
  _armoireDraftListModalEl = null;
  document.removeEventListener('keydown', _armoireDraftListEscHandler);
}

// Reconstruit le contenu de la fenêtre si elle est ouverte — no-op sinon
// (appelée depuis _armoireRenderDraftSwitcher à chaque changement réel,
// qu'elle soit affichée ou non).
function _armoireRenderDraftListModalBody(){
  if(!_armoireDraftListModalEl) return;
  var body = _armoireDraftListModalEl.querySelector('#_armoireDraftListBody');
  if(body) body.innerHTML = _armoireDraftListRowsHtml();
}

// Échange l'emplacement actuellement chargé dans _armoireDraft avec l'un
// des autres emplacements actifs (_armoireOtherDraftSlots[slotIndex]) —
// flush d'abord toute synchro en attente (pour ne jamais perdre une
// modification pas encore partie vers le serveur avant de basculer
// ailleurs), comme le fait déjà _armoireClose().
async function _armoireSwitchDraftSlot(slotIndex){
  var target = _armoireOtherDraftSlots[slotIndex];
  if(!target) return;
  if(_armoireDraftSyncTimer){
    clearTimeout(_armoireDraftSyncTimer);
    _armoireDraftSyncTimer = null;
    await _armoireSyncDraftToServer();
  }
  var current = {
    id: _armoireServerDraftId,
    name: _armoireActiveDraftName || ((typeof authGetCurrentUser === 'function' && authGetCurrentUser()) ? (ARMOIRE_DRAFT_NAME_PREFIX + authGetCurrentUser().username) : null),
    items: _armoireDraft.slice(),
    // Conserve la clé stable de l'ancien actif (voir _armoireActiveSlotKey
    // plus haut) — cette ligne doit rester à SA place dans la liste, pas
    // sauter là où était l'ancienne cible.
    key: _armoireActiveSlotKey
  };
  _armoireOtherDraftSlots.splice(slotIndex, 1, current);
  _armoireDraft = Array.isArray(target.items) ? target.items.slice() : [];
  _armoireServerDraftId = target.id;
  _armoireActiveDraftName = target.name;
  // La clé de la cible devient la clé active — c'est CETTE ligne qui doit
  // passer en bleu sur place, jamais en repassant par la position 1.
  _armoireActiveSlotKey = target.key;
  // Contenu déjà connu du serveur tel quel : évite qu'un simple
  // changement d'onglet soit pris pour une modification à resynchroniser
  // (voir _armoireMarkDraftChanged — null, pas "[]", pour un emplacement
  // vide : c'est la valeur sentinelle qu'elle attend pour "rien de neuf").
  _armoireDraftLastSavedItemsJson = _armoireDraft.length ? JSON.stringify(_armoireDraft) : null;
  _armoireRenderDraft();
  _armoireRenderDraftSwitcher();
}

// Appelée après _armoireFetchBlocks() (voir _armoireOpen) — repère le
// brouillon serveur de l'utilisateur et décide s'il faut l'adopter. Retour
// utilisateur : "faut que le serveur soit prioritaire" — mais PAS
// aveuglément : une modification plus RÉCENTE faite dans CETTE page (pas
// encore partie vers le serveur — voir ARMOIRE_DRAFT_SYNC_DELAY_MS) ne doit
// jamais être écrasée par une version serveur plus ancienne. Comparaison par
// horodatage : serverDraft.createdAt (une
// toute nouvelle entrée à chaque sauvegarde — _armoireSyncDraftToServer
// recrée plutôt que modifie, l'API n'ayant pas de PUT/PATCH, voir
// _armoireReplaceEntry) contre _armoireDraftLocalSavedAt (mis à jour à
// chaque sauvegarde locale réelle) — le plus récent des deux gagne.
function _armoireSyncDraftFromServer(){
  // Retour utilisateur : "a tu fais un max d'essei" — en testant le cas où
  // le panneau est ouvert PENDANT que la boîte de dialogue de
  // _armoireReconcileOwnerOnLogin attend encore une réponse (ouvrir le
  // configurateur juste après une connexion, avant d'avoir répondu "Garder"/
  // "Mettre de côté"), ce timestamp-vs-timestamp ci-dessous s'exécutait EN
  // MÊME TEMPS et écrasait déjà _armoireDraft de son côté — la
  // réconciliation répondait alors sur un brouillon local qui n'était plus
  // le bon (silencieusement remplacé par le brouillon serveur pendant que
  // l'utilisateur lisait encore la question). _armoireReconcilingOwner
  // (posé/retiré par _armoireReconcileOwnerOnLogin) fait de cette décision
  // "plus récent gagne" un cas par défaut, jamais actif tant qu'une
  // réconciliation par propriétaire est en cours de résolution.
  if(_armoireReconcilingOwner) return;
  var serverDraft = _armoireFindServerDraft(_armoireActiveDraftName);
  _armoireServerDraftId = serverDraft ? serverDraft.id : null;
  // Retour utilisateur : "qu'on puisse naviguer de l'une à l'autre
  // facilement" — reconstruit le sélecteur à CHAQUE ouverture (pas
  // seulement juste après une réconciliation), pour qu'un second
  // emplacement créé sur un autre appareil réapparaisse bien ici aussi.
  _armoireDetectOtherDraftSlots();
  if(!serverDraft || !Array.isArray(serverDraft.items) || !serverDraft.items.length) return;
  var serverSavedAt = typeof serverDraft.createdAt === 'number' ? serverDraft.createdAt : 0;
  if(_armoireDraft.length && _armoireDraftLocalSavedAt >= serverSavedAt) return; // local plus récent (ou égal) : on le garde
  var restored = serverDraft.items.filter(function(it){
    return it && typeof it.ref === 'string' && it.ref && typeof it.qty === 'number' && it.qty > 0;
  });
  if(!restored.length) return;
  _armoireDraft = restored;
  // Retour utilisateur : "retire les notif pour la récupération local et
  // celle pour entre différent appareil" — reprise silencieuse, plus de
  // toast ici.
  _armoireRenderDraft(); // met aussi _armoireDraftLocalSavedAt à jour (voir _armoireMarkDraftChanged)
}

// Anti-rafale (voir ARMOIRE_DRAFT_SYNC_DELAY_MS) — appelée à chaque
// modification réelle du brouillon (_armoireRenderDraft), jamais à chaque
// caractère tapé/clic +/- individuellement.
function _armoireScheduleDraftSync(){
  if(_armoireEditingEntry) return; // même garde que _armoireMarkDraftChanged — jamais PENDANT l'édition d'un bloc/config existant
  // Retour utilisateur : "je veux que la demande de mise de côté ce fasse
  // lorsqu'on clique sur le configurateur" — tant que _armoireDraftOwner ne
  // correspond pas encore au compte connecté (brouillon construit anonyme,
  // ou par un AUTRE compte, jamais encore réconcilié via
  // _armoireReconcileOwnerOnLogin, déclenchée à l'ouverture du panneau —
  // voir _armoireOpen), ne synchronise PAS vers le serveur : sinon un
  // simple "Ajouter à la configuration" depuis une fiche produit, AVANT
  // même d'avoir ouvert le configurateur une seule fois après la connexion,
  // pousserait déjà silencieusement ce brouillon vers le compte tout juste
  // connecté — exactement ce que la boîte de dialogue "Garder"/"Mettre de
  // côté" est censée empêcher.
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  if(username && _armoireDraftOwner !== username) return;
  clearTimeout(_armoireDraftSyncTimer);
  _armoireDraftSyncTimer = setTimeout(_armoireSyncDraftToServer, ARMOIRE_DRAFT_SYNC_DELAY_MS);
}

function _armoireSyncDraftToServer(){
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  if(!username) return; // pas connecté : rien de synchronisable, pas de compte serveur

  if(!_armoireDraft.length){
    // Brouillon vidé (enregistré comme bloc/config, ou retiré à la main) —
    // supprime l'entrée serveur plutôt que de la laisser suggérer, sur un
    // autre appareil, un travail en cours qui n'existe plus.
    if(!_armoireServerDraftId) return;
    var idToDelete = _armoireServerDraftId;
    _armoireServerDraftId = null;
    _armoireMarkEntryRetired('/configBlocks', idToDelete);
    _armoireApi('/configBlocks/' + encodeURIComponent(idToDelete), { method: 'DELETE' })
      .catch(function(e){ console.warn('_armoireSyncDraftToServer (suppression):', e && e.message); });
    return;
  }

  // username n'est PAS envoyé ici — le serveur le déduit lui-même du token
  // (voir authHeaders()/_armoireApi), jamais du corps de la requête (cohérent
  // avec l'exemple de POST fourni : aucun champ username dedans, seulement en
  // retour du GET) — l'envoyer serait de toute façon ignoré, voire risqué si
  // le serveur devait un jour le prendre en compte tel quel.
  // Nom : _armoireActiveDraftName si un emplacement SECONDAIRE a été
  // explicitement nommé (voir _armoireReconcileOwnerOnLogin/
  // _armoireSwitchDraftSlot), sinon le nom "principal" historique — un
  // compte à un seul brouillon actif ne voit donc aucun changement ici.
  var draftName = _armoireActiveDraftName || (ARMOIRE_DRAFT_NAME_PREFIX + username);
  var body = { draft: true, name: draftName, folder: '', items: _armoireDraft };
  var apiCall = _armoireServerDraftId
    ? _armoireReplaceEntry('/configBlocks', _armoireServerDraftId, body)
    : _armoireApi('/configBlocks', { method: 'POST', body: JSON.stringify(body) });
  // Pas de dépendance à la forme exacte de la réponse POST (id renvoyé ou
  // non, jamais inspecté par _armoireSaveBlock/_armoireSaveConfig non plus)
  // — un nouveau GET /configBlocks fait autorité pour retrouver le vrai id
  // serveur fraîchement créé.
  // "return" ici (pas juste apiCall.then(...) en fire-and-forget) : voir
  // window._performSwUpdate (js/pwa.js), qui doit pouvoir ATTENDRE la fin
  // de cette synchro avant de recharger la page en cas de mise à jour —
  // sinon _armoireServerDraftId n'est jamais mis à jour à temps (retour
  // utilisateur ci-dessous).
  return apiCall
    .then(function(){ return _armoireApi('/configBlocks'); })
    .then(function(list){
      _armoireSetBlocksFromServer(list);
      var mine = _armoireFindServerDraft(_armoireActiveDraftName);
      _armoireServerDraftId = mine ? mine.id : null;
      _armoireDetectOtherDraftSlots();
      // Retour utilisateur : "quand j'ouvre le configurateur j'ai toujours
      // la notif [reprise depuis un autre appareil]" — _armoireDraftLocalSavedAt
      // (pris au moment de l'ÉDITION, AVANT l'anti-rafale de
      // ARMOIRE_DRAFT_SYNC_DELAY_MS et l'aller-retour réseau ci-dessus) est
      // mécaniquement TOUJOURS antérieur au createdAt que le serveur vient
      // d'attribuer à cette même entrée. Sans ce rattrapage, la toute
      // prochaine ouverture — même sur CET appareil, sans aucun autre
      // appareil impliqué — trouvait donc systématiquement le serveur "plus
      // récent" que le local et réaffichait le brouillon qu'on venait
      // pourtant tout juste d'y envoyer, avec le toast donnant l'impression
      // trompeuse qu'un autre appareil avait modifié la configuration.
      var confirmedAt = (mine && typeof mine.createdAt === 'number') ? mine.createdAt : Date.now();
      if(confirmedAt > _armoireDraftLocalSavedAt) _armoireDraftLocalSavedAt = confirmedAt;
    })
    .catch(function(e){ console.warn('_armoireSyncDraftToServer:', e && e.message); });
}

// Retour utilisateur : "j'aimerais que le configurateur soit disponible
// lorsqu'on n'est pas loggé mais comment faire pour pas avoir de problème
// lorsqu'on se reconnecte avec le système de synchro entre appareils ?" —
// puis "je veux que la demande de mise de côté ce fasse lorsqu'on clique
// sur le configurateur" : appelée depuis _armoireOpen() (pas à la connexion
// elle-même, voir plus bas) — se connecter ne doit rien interrompre si on
// ne va pas forcément utiliser le configurateur tout de suite ; la question
// n'apparaît qu'au moment où on clique vraiment dessus. Décisions utilisateur :
// - Si le brouillon local n'appartient pas déjà à ce compte (anonyme, ou
//   laissé par un AUTRE compte sur un poste partagé) ET que le compte a
//   lui-même déjà un brouillon serveur non vide : demander lequel garder
//   ("Garder celle de cet appareil" / "Mettre de côté celle de cet
//   appareil") — jamais de choix automatique, jamais de perte silencieuse.
// - Retour utilisateur : "lorsqu'on clique sur mettre de côté ça fasse en
//   sorte qu'on ait deux config en cours et qu'on puisse naviguer de
//   l'une à l'autre facilement" (les DEUX boutons, "Garder" compris,
//   suivant sa réponse à la clarification posée) : celle qui n'est PAS
//   choisie comme active n'est plus archivée dans Blocs — elle reste, elle
//   aussi, une configuration EN COURS, à part entière, juste synchronisée
//   sous un second nom serveur pour ne jamais se confondre avec la
//   première (voir _armoireActiveDraftName/ARMOIRE_DRAFT_NAME_PREFIX), et
//   accessible depuis le sélecteur ajouté au-dessus de "Configuration en
//   cours" (voir _armoireRenderDraftSwitcher/_armoireOtherDraftSlots).
// - Si le compte n'a PAS encore de brouillon serveur, le brouillon local
//   est adopté directement (rien à réconcilier, un seul emplacement).
// Retourne true si une décision de propriétaire a réellement été prise et
// appliquée (donc déjà synchronisée/en cours de synchronisation vers le
// compte) — _armoireOpen() (voir plus bas) s'en sert pour savoir s'il doit
// encore lancer le flux normal _armoireFetchBlocks().then(_armoireSyncDraftFromServer)
// après coup, ou surtout PAS : ce flux compare juste des horodatages et
// pourrait retomber sur l'ANCIENNE entrée serveur (celle qu'on vient tout
// juste de remplacer, si le serveur n'a pas encore digéré le
// POST+DELETE — voir _armoireReplaceEntry) et défaire silencieusement la
// décision que l'utilisateur vient de prendre.
async function _armoireReconcileOwnerOnLogin(){
  var me = (typeof authGetCurrentUser === 'function') ? authGetCurrentUser() : null;
  var username = me && me.username;
  if(!username) return false; // jamais appelé sans connexion réussie, mais gardé par prudence
  if(_armoireDraftOwner === username) return false; // déjà le brouillon de ce compte, rien à réconcilier
  if(!_armoireDraft.length){
    // Rien localement à protéger : aucun conflit possible, on peut adopter
    // l'identité tout de suite plutôt que de laisser _armoireDraftOwner à
    // null — sinon un ajout ultérieur depuis une fiche produit (sans
    // rouvrir le configurateur entre-temps) resterait bloqué par le
    // garde-fou de _armoireScheduleDraftSync (propriétaire encore "null" !==
    // ce compte), repéré en testant précisément ce cas.
    _armoireDraftOwner = username;
    return false;
  }

  // Copie figée AVANT le premier "await" : _armoireDraft (la variable, pas
  // cette copie) reste libre de bouger entre-temps (l'utilisateur peut
  // continuer à cliquer, ou — sans le verrou ci-dessus — une autre synchro
  // pourrait s'exécuter) sans jamais fausser la décision prise ici sur ce
  // qu'était RÉELLEMENT le brouillon de cet appareil au moment de la connexion.
  var localItemsSnapshot = _armoireDraft.slice();
  _armoireReconcilingOwner = true;
  var finalItems = localItemsSnapshot;
  try{
    try{ await _armoireFetchBlocks(); }catch(e){ /* tant pis, continue avec _armoireBlocks déjà connu */ }
    var serverDraft = _armoireFindServerDraft();
    _armoireServerDraftId = serverDraft ? serverDraft.id : null;
    var serverItems = (serverDraft && Array.isArray(serverDraft.items)) ? serverDraft.items.filter(function(it){
      return it && typeof it.ref === 'string' && it.ref && typeof it.qty === 'number' && it.qty > 0;
    }) : [];

    var otherName = null; // nom serveur du SECOND emplacement, s'il en faut un (voir plus bas)
    var finalAlreadyOnServer = false; // finalItems correspond-il déjà tel quel à une entrée serveur existante ?
    if(serverItems.length){
      var keepLocal = await customConfirm(
        'Deux configurations en cours',
        'Cet appareil a une configuration en cours (' + localItemsSnapshot.length + ' référence' + (localItemsSnapshot.length > 1 ? 's' : '') + '), et votre compte en a déjà une autre (' + serverItems.length + ' référence' + (serverItems.length > 1 ? 's' : '') + '). Les deux resteront actives — un sélecteur permettra de passer de l\'une à l\'autre.',
        { okLabel: 'Garder celle de cet appareil', cancelLabel: 'Mettre de côté celle de cet appareil' }
      );
      otherName = _armoireNextDraftSlotName(username);
      if(keepLocal){
        // Le brouillon déjà sur le compte reste tel quel côté serveur
        // (même id, même nom "principal") — juste relégué en second
        // emplacement, retrouvable via le sélecteur. Celui de CET appareil
        // devient l'actif affiché, mais n'a encore JAMAIS été synchronisé
        // sous ce second nom : _armoireDraftLastSavedItemsJson=null (voir
        // plus bas) force sa toute première sauvegarde juste après.
        _armoireOtherDraftSlots = [{ id: serverDraft.id, name: serverDraft.name, items: serverItems, key: _armoireGetOrCreateSlotKey(serverDraft.id, serverDraft.name) }];
        finalItems = localItemsSnapshot;
        _armoireActiveDraftName = otherName;
        _armoireServerDraftId = null;
      } else {
        // Le brouillon de CET appareil n'a lui non plus jamais existé côté
        // serveur — le créer tout de suite (plutôt que d'attendre un futur
        // _armoireScheduleDraftSync qui ne partirait que si on rebascule un
        // jour dessus) pour qu'il soit déjà "fiable" (survit à la
        // fermeture de l'onglet) dès la fin de cette réconciliation, sans
        // dépendre d'une action supplémentaire de l'utilisateur.
        var newOtherId = null;
        try{
          await _armoireApi('/configBlocks', { method: 'POST', body: JSON.stringify({ draft: true, name: otherName, folder: '', items: localItemsSnapshot }) });
          var freshList = await _armoireApi('/configBlocks');
          _armoireSetBlocksFromServer(freshList);
          var createdOther = _armoireFindServerDraft(otherName);
          newOtherId = createdOther ? createdOther.id : null;
        }catch(e){ console.warn('_armoireReconcileOwnerOnLogin (second emplacement):', e && e.message); }
        _armoireOtherDraftSlots = [{ id: newOtherId, name: otherName, items: localItemsSnapshot, key: _armoireGetOrCreateSlotKey(newOtherId, otherName) }];
        finalItems = serverItems;
        _armoireActiveDraftName = serverDraft.name;
        _armoireServerDraftId = serverDraft.id;
        finalAlreadyOnServer = true;
      }
      if(typeof showToast === 'function') showToast('Deux configurations actives — utilisez le sélecteur pour passer de l\'une à l\'autre ✓', 'ok', 5000);
    }
  }catch(e){
    console.warn('_armoireReconcileOwnerOnLogin:', e && e.message);
  }
  _armoireReconcilingOwner = false;
  // _armoireDraftOwner n'est modifié NULLE PART ailleurs que juste ici
  // (voir _armoireMarkDraftChanged plus haut) : c'est cette ligne, et
  // elle seule, qui fait officiellement de ce compte le propriétaire du
  // brouillon — après quoi les sauvegardes/synchros suivantes (ajout depuis
  // une fiche produit compris) reprennent normalement sans autre question.
  _armoireDraftOwner = username;
  _armoireDraft = finalItems;
  // "Mettre de côté" : finalItems EST déjà le contenu connu du serveur tel
  // quel (entrée "principale" inchangée) — pas de resynchro immédiate
  // inutile. Dans tous les autres cas ("Garder", ou pas de conflit du
  // tout) : finalItems n'a jamais été confirmé sous CE nom, forcer la
  // sauvegarde (null, jamais "déjà identique") comme avant ce chantier.
  _armoireDraftLastSavedItemsJson = finalAlreadyOnServer ? JSON.stringify(finalItems) : null;
  _armoireRenderDraft(); // persiste (avec le bon owner), affiche, et programme la synchro vers ce compte
  _armoireRenderDraftSwitcher();
  return true;
}
// Retour utilisateur : "je veux que la demande de mise de côté ce fasse
// lorsqu'on clique sur le configurateur" — appelée depuis _armoireOpen()
// (voir plus bas), plus sur l'évènement 'spi_auth_changed' comme au tout
// premier essai.

function _armoireFetchSavedConfigs(){
  return _armoireApi('/configSavedConfigs').then(function(list){
    _armoireSetSavedConfigsFromServer(list);
    _armoireRenderSavedList();
  }).catch(function(e){
    console.warn('_armoireFetchSavedConfigs:', e && e.message);
    if(typeof showToast === 'function') showToast('Liste des configurations non actualisée — réessayez', 'warn', 3000);
  });
}

function _armoireListItemHtml(entry, kind){
  var isBlock = kind === 'block';
  // "Insérer"/"Ajouter" : la seule action qu'on utilise vraiment en
  // parcourant la liste, reste donc seule visible en plein (copper) — les
  // blocs comme les configurations fusionnent dans le brouillon en cours
  // sans l'écraser (_armoireMergeItems). Pour les configurations, "Charger"
  // (qui REMPLACE le brouillon, avec confirmation) reste disponible à côté
  // en bouton secondaire neutre (retour utilisateur : "faudrai ajouter la
  // possibilité de pouvoir ajouter plusieurs configuration déjà enregistrée
  // à une configuration en cours" — Charger seul ne permettait pas de
  // combiner plusieurs configurations enregistrées).
  var primaryLabel = isBlock ? 'Insérer' : 'Ajouter';
  var primaryClass = isBlock ? 'armoire-block-insert' : 'armoire-config-insert';
  var delClass = isBlock ? 'armoire-block-del' : 'armoire-config-del';
  var infoClass = isBlock ? 'armoire-block-info' : 'armoire-config-info';
  var editClass = isBlock ? 'armoire-block-edit' : 'armoire-config-edit';
  // Suppression réservée aux comptes ayant le droit d'édition ou de
  // suppression — le configurateur est ouvert à tout utilisateur connecté,
  // mais pas la suppression des blocs/configs de tout le monde. canDelete
  // spécifiquement (pas canEdit) : retour utilisateur — un compte avec
  // juste le droit d'édition ne doit même pas voir la croix.
  var perms = window._userPerms || {};
  var canDeleteEntry = !!(perms.canDelete || perms.isAdmin);
  // Modifier : porté par canEdit (pas canDelete) — c'est une action
  // d'édition, distincte de la suppression, avec sa propre permission.
  var canEditEntry = !!(perms.canEdit || perms.isAdmin);
  // Retour utilisateur : "je trouve que les boutons comme ça sont très mal
  // intégrés au site" — rond bleu plein, pastille copper, puis 2-3 carrés
  // vert/bleu/rouge : 4 couleurs pour 5 actions, sans hiérarchie. "Voir le
  // contenu"/"Modifier"/"Supprimer" (consultées ponctuellement, pas à
  // chaque ligne) rejoignent désormais un menu ⋯, seules les actions
  // qu'on utilise en parcourant la liste restent des boutons visibles.
  var menuItems =
      '<button type="button" class="' + infoClass + '" role="menuitem"><i class="ti ti-info-circle" aria-hidden="true"></i> Voir le contenu</button>'
    + (canEditEntry ? '<button type="button" class="' + editClass + '" role="menuitem"><i class="ti ti-pencil" aria-hidden="true"></i> Modifier</button>' : '')
    + (canDeleteEntry ? '<button type="button" class="' + delClass + ' kebab-menu-danger" role="menuitem"><i class="ti ti-trash" aria-hidden="true"></i> Supprimer</button>' : '');
  return '<div class="armoire-list-row" data-id="' + escapeHtml(entry.id) + '" style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--line);">'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(entry.name) + '</div>'
    + '<div style="font-size:11px;color:var(--ink-soft);">' + entry.items.length + ' référence' + (entry.items.length > 1 ? 's' : '') + '</div>'
    + '</div>'
    + '<button type="button" class="' + primaryClass + '" style="padding:6px 12px;border-radius:7px;border:none;background:var(--copper);color:#fff;cursor:pointer;font-size:11.5px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:4px;"><i class="ti ti-plus" aria-hidden="true"></i> ' + primaryLabel + '</button>'
    + (!isBlock ? '<button type="button" class="armoire-config-load" title="Remplacer la configuration en cours par celle-ci" style="padding:6px 12px;border-radius:7px;border:1px solid var(--line);background:var(--paper-card);color:var(--ink);cursor:pointer;font-size:11.5px;font-weight:600;white-space:nowrap;">Charger</button>' : '')
    + '<div style="position:relative;flex-shrink:0;">'
      + '<button type="button" class="kebab-btn" title="Plus d\'actions" aria-haspopup="true" aria-expanded="false"><i class="ti ti-dots" aria-hidden="true"></i></button>'
      + '<div class="kebab-menu" role="menu" style="position:absolute;right:0;top:30px;z-index:5;">'
        + menuItems
      + '</div>'
    + '</div>'
    + '</div>';
}

// Le menu ⋯ lui-même (ouverture/fermeture, un seul ouvert à la fois) est
// géré par le helper générique _bindKebabMenuOn/_closeAllKebabMenus
// (js/popup.js), partagé avec js/auth.js (liste des utilisateurs). Reste
// ici uniquement le point d'attache spécifique au configurateur : appelé
// depuis _armoireOpen(), voir plus bas.
function _armoireBindRowMenuOnce(){
  _bindKebabMenuOn(document.getElementById('armoireConfigOverlay'));
}

// Détail du contenu d'un bloc / d'une configuration (popup au clic sur "i")
function _armoireShowEntryDetails(entry){
  var rows = entry.items.map(function(it){
    var p = _armoireProductByRef(it.ref);
    var name = p ? (p.name || p.ref) : it.ref;
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;">'
      + '<div class="sug-list-photo" style="width:32px;height:32px;flex-shrink:0;">' + (p ? _armoirePhotoHtml(p) : '<i class="ti ti-photo-off"></i>') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:12.5px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(name) + '</div>'
      + '<div style="font-size:11px;color:#94a3b8;">' + escapeHtml(it.ref) + '</div>'
      + '</div>'
      + '<div style="font-size:12px;font-weight:600;color:#64748b;flex-shrink:0;">×' + (it.qty || 1) + '</div>'
      + '</div>';
  }).join('');
  customAlert(escapeHtml(entry.name), '<div style="max-height:min(50vh,340px);overflow-y:auto;overflow-x:hidden;box-sizing:border-box;margin:-4px 0 -4px;padding-right:12px;text-align:left;white-space:normal;">' + rows + '</div>');
}

// Détail des délais par référence (popup au clic sur la case "Délai max") —
// triés du plus long au plus court, pour repérer d'un coup d'œil quelles
// références tirent le délai global vers le haut.
function _armoireShowLeadTimesDetails(){
  var rows = _armoireDraft.map(function(it){
    var p = _armoireProductByRef(it.ref);
    var name = p ? (p.name || it.ref) : it.ref;
    var days = p ? _armoireParseLeadTimeDays(p.leadTime) : null;
    return { ref: it.ref, name: name, days: days, leadTime: p ? (p.leadTime || '') : '' };
  }).sort(function(a, b){
    if(a.days == null && b.days == null) return 0;
    if(a.days == null) return 1;
    if(b.days == null) return -1;
    return b.days - a.days;
  });
  var knownDays = rows.filter(function(r){ return r.days != null; }).map(function(r){ return r.days; });
  var maxDays = knownDays.length ? Math.max.apply(null, knownDays) : null;
  var html = rows.map(function(r){
    var isMax = r.days != null && maxDays != null && r.days === maxDays;
    var delayLabel = r.days != null ? _armoireFormatLeadDays(r.days) : (r.leadTime || 'Non renseigné');
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(r.name) + '</div>'
      + '<div style="font-size:11px;color:var(--ink-soft);">' + escapeHtml(r.ref) + '</div>'
      + '</div>'
      + '<div style="font-size:12px;font-weight:700;color:' + (isMax ? 'var(--copper-deep)' : 'var(--ink-soft)') + ';flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:4px;">'
        + (isMax ? '<i class="ti ti-alert-triangle" style="font-size:13px;" aria-hidden="true"></i>' : '')
        + escapeHtml(delayLabel)
      + '</div>'
      + '</div>';
  }).join('');
  customAlert('Délais par référence', '<div style="max-height:min(50vh,340px);overflow-y:auto;overflow-x:hidden;box-sizing:border-box;margin:-4px 0 -4px;padding-right:12px;text-align:left;white-space:normal;">' + html + '</div>');
}

// Regroupe une liste de blocs/configs par leur champ "folder" (texte libre,
// saisi à l'enregistrement — voir _armoirePromptNameAndFolder). '' (vide)
// = "Sans dossier", toujours affiché en dernier ; les autres dossiers sont
// triés alphabétiquement.
function _armoireGroupByFolder(list){
  var groups = {};
  var order = [];
  list.forEach(function(entry){
    var f = (entry.folder || '').trim();
    if(!groups[f]){ groups[f] = []; order.push(f); }
    groups[f].push(entry);
  });
  order.sort(function(a, b){
    if(a === '') return 1;
    if(b === '') return -1;
    return a.localeCompare(b, 'fr');
  });
  return { groups: groups, order: order };
}

// Rendu partagé blocs/configs — sections par dossier, repliables (retour
// utilisateur). kind : 'block' ou 'config', utilisé pour le libellé vide,
// le texte des lignes (_armoireListItemHtml) et pour isoler l'état replié
// de chaque liste (_armoireCollapsedFolders).
function _armoireRenderGroupedList(list, kind, emptyMessage){
  var el = document.getElementById(kind === 'block' ? 'armoireConfigBlocksList' : 'armoireConfigSavedList');
  if(!el) return;
  if(!list.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12px;padding:14px 8px;">' + emptyMessage + '</div>';
    return;
  }
  var g = _armoireGroupByFolder(list);
  var collapsedMap = _armoireCollapsedFolders[kind];
  // Replié par défaut (retour utilisateur) : un dossier jamais encore
  // touché cette session démarre fermé plutôt qu'ouvert. Ne seed que les
  // clés absentes — un dossier déjà déplié/replié manuellement par
  // l'utilisateur garde son état d'un rendu à l'autre (ex. après l'ajout
  // d'un nouveau bloc, la liste se re-rend sans tout refermer).
  g.order.forEach(function(folderKey){
    if(!(folderKey in collapsedMap)) collapsedMap[folderKey] = true;
  });
  el.innerHTML = g.order.map(function(folderKey){
    var entries = g.groups[folderKey];
    var label = folderKey || 'Sans dossier';
    var isCollapsed = !!collapsedMap[folderKey];
    var header = '<div class="armoire-folder-header" data-folder="' + escapeHtml(folderKey) + '" style="display:flex;align-items:center;gap:6px;padding:8px 4px 4px;cursor:pointer;user-select:none;">'
      + '<i class="ti ti-chevron-' + (isCollapsed ? 'right' : 'down') + '" style="font-size:13px;color:var(--ink-soft);flex-shrink:0;"></i>'
      + '<i class="ti ti-folder" style="font-size:13px;color:var(--ink-soft);flex-shrink:0;"></i>'
      + '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);">' + escapeHtml(label) + '</span>'
      + '<span style="font-size:11px;color:var(--ink-soft);">— ' + entries.length + '</span>'
      + '</div>';
    var rows = isCollapsed ? '' : entries.map(function(entry){ return _armoireListItemHtml(entry, kind); }).join('');
    return header + rows;
  }).join('');
}

function _armoireRenderBlocksList(){
  // Exclut les brouillons personnels — stockés dans /configBlocks pour
  // réutiliser le même endpoint, mais jamais destinés à apparaître dans la
  // liste "Blocs" partagée par toute l'équipe. draft===true d'abord, repli
  // sur le préfixe de nom (voir ARMOIRE_DRAFT_NAME_PREFIX/
  // _armoireFindServerDraft) si ce champ ne revient pas fidèlement de ce
  // serveur — retour utilisateur, capture à l'appui : sans ce repli, des
  // brouillons restaient visibles et insérables comme de vrais blocs.
  var realBlocks = _armoireBlocks.filter(function(b){
    if(!b) return true;
    if(b.draft === true) return false;
    if(typeof b.name === 'string' && b.name.indexOf(ARMOIRE_DRAFT_NAME_PREFIX) === 0) return false;
    return true;
  });
  _armoireRenderGroupedList(realBlocks, 'block', 'Aucun bloc enregistré pour l\'instant.');
}

function _armoireRenderSavedList(){
  _armoireRenderGroupedList(_armoireSavedConfigs, 'config', 'Aucune configuration enregistrée pour l\'instant.');
}

