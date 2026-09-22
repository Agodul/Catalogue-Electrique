// ── Configurateur d'armoire (admin) ──────────────────────────────────────
// Aucune IA, aucun calcul automatique : l'admin choisit lui-même les
// produits en parcourant le catalogue et compose une configuration à la
// main — exactement comme il le ferait sur papier, en plus rapide.
// Deux niveaux de réutilisation, pensés pour des armoires qui ne se
// répètent jamais à l'identique :
//   - un BLOC = un sous-ensemble réutilisable (ex. "Bloc PLC standard"),
//     inséré en un clic dans une configuration en cours ;
//   - une CONFIGURATION = une armoire complète déjà assemblée, rechargeable
//     telle quelle pour repartir d'une base proche.
"use strict";

var _armoireDraft = []; // [{ref, qty}]

// Retour utilisateur : "je ne veux plus de localstorage pour les config je
// veux garder que le serveur en cas de crash" puis "il faudrait que seule
// la config anonyme soit enregistrée dans le local" — un compte CONNECTÉ n'a
// plus aucune copie locale : le serveur (voir _armoireSyncDraftToServer/
// _armoireSyncDraftFromServer plus bas) est sa seule sauvegarde, rouvrir le
// configurateur récupère le dernier état synchronisé. Un visiteur NON
// connecté n'a lui aucune notion de compte côté serveur — sans copie
// locale, sa configuration ne survivrait à AUCUN rechargement ; cette clé
// reste donc utilisée, mais SEULEMENT pour lui (voir _armoireMarkDraftChanged
// et _armoireRestoreLocalDraftIfAnonymous plus bas, qui vérifient
// authIsLoggedIn() avant d'y toucher).
var ARMOIRE_DRAFT_STORAGE_KEY = 'cat_armoire_draft';

// Dernier contenu RÉELLEMENT envoyé/connu (JSON) — évite de reprogrammer une
// synchro à chaque simple RÉ-AFFICHAGE sans rapport avec une modification
// (ex. _armoireOpen() rend le brouillon déjà en mémoire dès l'ouverture,
// avant même d'avoir vérifié le serveur).
var _armoireDraftLastSavedItemsJson = null;

// Horodatage (ms) de la dernière modification RÉELLE de ce brouillon en
// mémoire, dans CETTE page — comparé à serverDraft.createdAt dans
// _armoireSyncDraftFromServer pour décider qui, du serveur ou de cette page,
// est le plus à jour (retour utilisateur : "faut que le serveur soit
// prioritaire" pour la reprise multi-appareils, mais sans écraser une
// modification plus récente faite ICI, dans la même page, qui n'aurait pas
// encore eu le temps de partir vers le serveur — anti-rafale, voir
// ARMOIRE_DRAFT_SYNC_DELAY_MS). Contrairement à avant, ne survit plus à un
// rechargement (remis à 0 par défaut) : sans copie locale, il n'y a plus
// rien à comparer avant la toute première synchro de cette page.
var _armoireDraftLocalSavedAt = 0;

// Retour utilisateur : "j'aimerais que le configurateur soit disponible
// lorsqu'on n'est pas loggé mais comment faire pour pas avoir de problème
// lorsqu'on se reconnecte avec le système de synchro entre appareils ?" —
// ce brouillon (en mémoire, voir plus haut) peut désormais s'accumuler SANS
// être connecté. _armoireDraftOwner retient à QUI il appartient (username,
// ou null si construit anonymement dans CETTE page) pour détecter, si on se
// connecte SANS recharger la page (voir _armoireReconcileOwnerOnLogin plus
// bas), qu'il ne s'agit peut-être pas du brouillon déjà sur le compte qui
// vient de se connecter.
var _armoireDraftOwner = null;

// Retour utilisateur : "a tu fais un max d'essei" — posé à true pendant
// toute la durée de _armoireReconcileOwnerOnLogin (y compris pendant
// l'attente de la réponse à la boîte de dialogue "Garder"/"Mettre de côté"),
// pour qu'AUCUN autre code (ni _armoireSyncDraftFromServer, ni le retaguage
// de propriétaire dans _armoireMarkDraftChanged juste en dessous) ne vienne
// trancher à la place de l'utilisateur ou court-circuiter sa décision
// pendant qu'elle est encore en attente — repéré en testant précisément ce
// cas de figure : ouvrir le panneau juste après une connexion, avant
// d'avoir répondu à la boîte de dialogue.
var _armoireReconcilingOwner = false;

// Renvoie true si le contenu a réellement changé depuis le dernier appel —
// _armoireRenderDraft() (juste en dessous) ne programme une synchro
// (_armoireScheduleDraftSync) que dans ce cas. N'écrit dans localStorage que
// pour un visiteur NON connecté (voir ARMOIRE_DRAFT_STORAGE_KEY plus haut) —
// un compte connecté n'a plus aucune copie locale, y compris pour nettoyer
// une éventuelle trace anonyme laissée avant sa connexion (sinon un visiteur
// suivant, anonyme, sur le même appareil partagé, la retrouverait à tort).
function _armoireMarkDraftChanged(){
  // Ne jamais avancer PENDANT l'édition d'un bloc/config existant :
  // _armoireDraft contient alors TEMPORAIREMENT le contenu de l'entrée
  // éditée (voir _armoireStartEditEntry/_armoireDraftBackup plus bas), pas
  // la vraie configuration en cours de l'utilisateur.
  if(_armoireEditingEntry) return false;
  var isLoggedIn = typeof authIsLoggedIn === 'function' && authIsLoggedIn();
  if(_armoireDraft.length){
    var itemsJson = JSON.stringify(_armoireDraft);
    if(itemsJson === _armoireDraftLastSavedItemsJson) return false; // contenu inchangé
    // Retour utilisateur : "je veux que la demande de mise de côté ce fasse
    // lorsqu'on clique sur le configurateur" — _armoireDraftOwner n'est
    // JAMAIS modifié ici, sur une simple modification de contenu (ex.
    // "Ajouter à la configuration" depuis une fiche produit, avant même
    // d'avoir ouvert le configurateur) : seule _armoireReconcileOwnerOnLogin
    // (déclenchée à l'ouverture du panneau, voir _armoireOpen) a le droit de
    // décider à qui appartient ce brouillon. Tant que le panneau n'a pas été
    // ouvert après une connexion, le brouillon continue de vivre en mémoire
    // sous son propriétaire actuel (potentiellement encore "anonyme") sans
    // se synchroniser vers le compte tout juste connecté dans son dos (voir
    // le même garde-fou dans _armoireScheduleDraftSync plus bas).
    _armoireDraftLastSavedItemsJson = itemsJson;
    _armoireDraftLocalSavedAt = Date.now();
    try{
      if(isLoggedIn) localStorage.removeItem(ARMOIRE_DRAFT_STORAGE_KEY);
      else localStorage.setItem(ARMOIRE_DRAFT_STORAGE_KEY, itemsJson);
    }catch(e){
      // Navigation privée / quota dépassé : tant pis, pas de sauvegarde de
      // secours possible, mais ça ne doit jamais faire planter le
      // configurateur pour autant.
    }
  } else {
    if(_armoireDraftLastSavedItemsJson === null) return false; // déjà vide : rien de réellement nouveau
    _armoireDraftLastSavedItemsJson = null;
    _armoireDraftLocalSavedAt = 0;
    // Repéré en testant "Vider" un compte connecté (voir le chantier
    // multi-emplacements ci-dessus, mais un bug préexistant, pas nouveau) :
    // remettre _armoireDraftOwner à null ICI empêchait ensuite
    // _armoireScheduleDraftSync() de programmer la suppression côté serveur
    // (son garde-fou compare _armoireDraftOwner au compte connecté — voir
    // plus bas — et le trouvait aussitôt "différent" puisqu'on venait de
    // l'effacer nous-mêmes), laissant l'entrée serveur orpheline pour de bon
    // (jamais nettoyée, y compris à la fermeture du panneau). Un compte
    // connecté reste propriétaire de SON brouillon même vide — seul un
    // visiteur anonyme doit repartir de zéro (owner=null) pour qu'une
    // éventuelle connexion ultérieure déclenche bien une vraie réconciliation.
    if(!isLoggedIn) _armoireDraftOwner = null;
    try{ localStorage.removeItem(ARMOIRE_DRAFT_STORAGE_KEY); }catch(e){}
  }
  return true;
}

// Retour utilisateur : "il faudrait que seule la config anonyme soit
// enregistrée dans le local" — restaure le brouillon anonyme laissé sur cet
// appareil, mais SEULEMENT si personne n'est déjà connecté à ce chargement
// de page (un compte connecté récupère sa propre configuration depuis le
// serveur, voir _armoireOpen/_armoireSyncDraftFromServer — jamais depuis une
// trace locale qui pourrait appartenir à quelqu'un d'autre sur un poste
// partagé).
function _armoireRestoreLocalDraftIfAnonymous(){
  if(typeof authIsLoggedIn === 'function' && authIsLoggedIn()) return;
  try{
    var raw = localStorage.getItem(ARMOIRE_DRAFT_STORAGE_KEY);
    if(!raw) return;
    var items = JSON.parse(raw);
    if(!Array.isArray(items)) return;
    var restored = items.filter(function(it){
      return it && typeof it.ref === 'string' && it.ref && typeof it.qty === 'number' && it.qty > 0;
    });
    if(!restored.length) return;
    _armoireDraft = restored;
    // Le prochain _armoireRenderDraft() (ex. à l'ouverture du panneau) va
    // re-sauvegarder ce même contenu tel quel — sans ceci, ce simple
    // ré-affichage serait pris pour une modification réelle (voir
    // _armoireMarkDraftChanged ci-dessus).
    _armoireDraftLastSavedItemsJson = JSON.stringify(_armoireDraft);
  }catch(e){
    // Contenu corrompu/illisible : on repart simplement d'un brouillon vide
    // plutôt que de faire planter le chargement de la page.
  }
}
_armoireRestoreLocalDraftIfAnonymous();

// Retour utilisateur : "je voudrais que les brouillons soient enregistrés
// automatiquement sur le serveur [...] comme ça on peut la reprendre sur
// notre tel ou un autre pc avec le même identifiant" — réutilise
// /configBlocks (même endpoint que les vrais blocs partagés) plutôt qu'un
// nouvel endpoint dédié : chaque entrée porte désormais draft (booléen,
// false par défaut pour un vrai bloc partagé) — schéma confirmé par le
// serveur. username (identifiant du propriétaire) est lui aussi présent sur
// chaque entrée, mais rempli PAR LE SERVEUR depuis le token : jamais envoyé
// dans le corps d'une requête, seulement lu sur ce qui revient (voir
// _armoireFindServerDraft). Un brouillon (draft: true) n'est donc JAMAIS
// mélangé à la liste "Blocs" visible (filtrée sur draft !== true, voir
// _armoireRenderBlocksList) : invisible pour le reste de l'équipe, un seul
// par utilisateur (id retrouvé/mis à jour via _armoireServerDraftId, jamais
// dupliqué).
var _armoireServerDraftId = null; // id de CE brouillon sur le serveur, si déjà créé
var _armoireDraftSyncTimer = null;
var ARMOIRE_DRAFT_SYNC_DELAY_MS = 1500; // anti-rafale : pas un appel réseau à chaque frappe/clic +/-

// Retour utilisateur : "on va fiabiliser la création d'armoire puis se
// connecter [...] lorsqu'on clique sur mettre de côté ça fasse en sorte
// qu'on ait deux config en cours et qu'on puisse naviguer de l'une à
// l'autre facilement" — remplace l'ancien comportement (la configuration
// non gardée était archivée comme un bloc nommé, dans
// ARMOIRE_SETASIDE_FOLDER, invisible depuis "Configuration en cours").
// Désormais _armoireDraft reste "l'emplacement actif affiché" (tout le
// reste du code — ajout/retrait/quantité/rendu — continue de fonctionner
// sans changement), et _armoireOtherDraftSlots retient les AUTRES
// brouillons actifs du même compte, chacun déjà synchronisé côté serveur
// (jamais uniquement en mémoire, sinon perdu à la fermeture de l'onglet —
// but même de ce chantier : "fiabiliser").
// Forme : [{ id, name, items }].
var _armoireOtherDraftSlots = [];

// Nom de l'entrée serveur correspondant au brouillon actuellement chargé
// dans _armoireDraft. null = pas encore choisi, _armoireSyncDraftToServer
// retombe alors sur le nom "principal" (ARMOIRE_DRAFT_NAME_PREFIX +
// username), exactement le comportement d'avant ce chantier — un compte
// qui n'a jamais eu qu'un seul brouillon actif ne voit donc aucune
// différence. Ce n'est QUE lorsqu'un second emplacement existe (voir
// _armoireReconcileOwnerOnLogin/_armoireSwitchDraftSlot) qu'un nom
// distinct (suffixé) est assigné, pour que les deux entrées /configBlocks
// ne se confondent jamais l'une avec l'autre.
var _armoireActiveDraftName = null;

// Retour utilisateur : "faudrait que la config qui devient visible passe en
// bleu sans devoir tout faire bouger" — avant ceci, l'emplacement actif
// était TOUJOURS dessiné en première position dans le sélecteur/la fenêtre
// de gestion, et _armoireSwitchDraftSlot échangeait le CONTENU entre cette
// position 1 et celle cliquée : basculer donnait donc l'impression que les
// lignes se mélangeaient (le contenu cliqué "sautait" en haut, un autre
// contenu apparaissait là où on avait cliqué), au lieu que la ligne cliquée
// devienne simplement bleue sur PLACE. Chaque emplacement reçoit maintenant
// une clé stable, propre à cette page (jamais persistée, jamais envoyée au
// serveur), qui ne change JAMAIS pour ce même emplacement logique — y
// compris après un renommage ou une resynchronisation qui change son id
// serveur (voir _armoireEnsureActiveSlotKey plus bas, qui fait le lien).
// Le rendu (_armoireDraftListRowsHtml) trie toujours par cette clé plutôt
// que de mettre l'actif en tête : seule la couleur bascule d'une ligne à
// l'autre, jamais leur position respective.
var _armoireSlotKeySeq = 1;
var _armoireSlotKeyByIdentity = {}; // "id:X" ou "name:Y" -> clé stable
var _armoireActiveSlotKey = 0; // 0 = pas encore attribuée (avant le tout premier rendu)
function _armoireSlotIdentity(id, name){
  return id ? ('id:' + id) : ('name:' + (name || ''));
}
// Retrouve la clé déjà connue pour cette identité (id serveur si présent,
// sinon nom), ou lui en attribue une toute nouvelle si c'est la première
// fois qu'on la rencontre.
function _armoireGetOrCreateSlotKey(id, name){
  var identity = _armoireSlotIdentity(id, name);
  if(!_armoireSlotKeyByIdentity[identity]) _armoireSlotKeyByIdentity[identity] = _armoireSlotKeySeq++;
  return _armoireSlotKeyByIdentity[identity];
}
// Appelée après CHAQUE changement de _armoireServerDraftId/_armoireActiveDraftName
// qui représente TOUJOURS le même emplacement logique (resynchronisation,
// renommage, adoption au chargement) — jamais après _armoireSwitchDraftSlot
// (qui assigne lui-même explicitement la clé de la cible) ni
// _armoireCreateNewDraftSlot (qui assigne lui-même une clé toute neuve,
// jamais une continuité) : ces deux-là gèrent _armoireActiveSlotKey de leur
// côté, en connaissance de cause.
function _armoireEnsureActiveSlotKey(){
  var identity = _armoireSlotIdentity(_armoireServerDraftId, _armoireActiveDraftName);
  if(_armoireActiveSlotKey){
    // Fait le lien : ce nouvel id/nom (venant de changer suite à une
    // synchro/un renommage) désigne le MÊME emplacement, jamais une clé
    // neuve qui le ferait sauter de position dans la liste.
    _armoireSlotKeyByIdentity[identity] = _armoireActiveSlotKey;
  } else {
    _armoireActiveSlotKey = _armoireGetOrCreateSlotKey(_armoireServerDraftId, _armoireActiveDraftName);
  }
}

// Retour utilisateur : "regarde pourquoi lorsque je nomme depuis l'actif ça
// me recrée une config" — remplacer une entrée serveur (renommer, ou toute
// sauvegarde automatique du brouillon actif, aucun PUT/PATCH disponible —
// voir _armoireReplaceEntry) fait un POST de la nouvelle PUIS un DELETE de
// l'ancienne. Sur CE serveur, déjà connu pour ne pas persister certains
// champs fidèlement (voir ARMOIRE_DRAFT_NAME_PREFIX plus haut), ce DELETE
// peut ne pas être immédiatement répercuté sur le GET suivant — l'ancienne
// entrée, sous son ANCIEN nom, réapparaissait alors comme un tout nouvel
// "autre emplacement" fantôme (le renommage ne change jamais le nom d'UNE
// entrée existante, contrairement à une simple modification de contenu, la
// déduplication par nom déjà en place — voir _armoireDetectOtherDraftSlots —
// ne pouvait donc rien y faire). Toute entrée qu'on a nous-mêmes demandé de
// supprimer (remplacement compris) est retenue ici pour le reste de la
// session — jamais réaffichée, même si le serveur la sert encore un moment.
// Clé "basePath:id" (un id n'est unique qu'au sein d'une même collection).
var _armoireRetiredEntryIds = {};
function _armoireMarkEntryRetired(basePath, id){
  if(id !== null && id !== undefined) _armoireRetiredEntryIds[basePath + ':' + id] = true;
}
function _armoireIsEntryRetired(basePath, id){
  return !!_armoireRetiredEntryIds[basePath + ':' + id];
}
// Remplace toute affectation directe de _armoireBlocks depuis une réponse
// serveur — filtre les entrées retirées (voir ci-dessus) avant qu'elles ne
// puissent réapparaître dans les Blocs, le sélecteur de brouillons, etc.
function _armoireSetBlocksFromServer(list){
  var arr = Array.isArray(list) ? list : _armoireBlocks;
  _armoireBlocks = arr.filter(function(b){ return !(b && _armoireIsEntryRetired('/configBlocks', b.id)); });
}
function _armoireSetSavedConfigsFromServer(list){
  var arr = Array.isArray(list) ? list : _armoireSavedConfigs;
  _armoireSavedConfigs = arr.filter(function(b){ return !(b && _armoireIsEntryRetired('/configSavedConfigs', b.id)); });
}

var _armoireBlocks = [];
var _armoireSavedConfigs = [];
var _armoireActiveTab = 'blocks';
// Dossiers repliés (retour utilisateur : ranger blocs/configs par dossier) —
// clé = nom du dossier ('' = "Sans dossier"), true = replié. En mémoire
// seulement (pas persisté), séparé par kind pour ne pas lier l'état des
// blocs à celui des configurations.
var _armoireCollapsedFolders = { block: {}, config: {} };
// Bloc/config en cours de modification (retour utilisateur : pouvoir
// éditer un bloc/une config existant, pas juste renommer) — { id, kind
// ('block'|'config'), name, folder } le temps de l'édition, sinon null.
// "Enregistrer" écrase alors l'entrée d'origine (POST le nouveau contenu
// PUIS DELETE l'ancien) plutôt que d'en créer une nouvelle en double.
var _armoireEditingEntry = null;
// Sauvegarde de _armoireDraft pendant l'édition d'un bloc/config (voir
// _armoireStartEditEntry) — retour utilisateur : éditer un bloc ne doit
// JAMAIS obliger à vider/perdre la configuration en cours de composition.
// _armoireDraft est temporairement remplacé par le contenu de l'entrée
// éditée (pour réutiliser tel quel tout le reste de l'UI de composition —
// recherche, +/-, retrait), puis restauré ici à l'annulation ou à la fin de
// l'édition.
var _armoireDraftBackup = null;

function _armoireProductByRef(ref){
  return (window.products || []).find(function(p){ return p.ref === ref; });
}

// ── Brouillon en cours ───────────────────────────────────────────────────

function _armoireAddToDraft(ref, qty){
  qty = qty || 1;
  var existing = _armoireDraft.find(function(it){ return it.ref === ref; });
  if(existing) existing.qty += qty;
  else _armoireDraft.push({ ref: ref, qty: qty });
  _armoireRenderDraft();
}

function _armoireSetQty(ref, qty){
  var item = _armoireDraft.find(function(it){ return it.ref === ref; });
  if(!item) return;
  if(qty <= 0){ _armoireDraft = _armoireDraft.filter(function(it){ return it.ref !== ref; }); }
  else item.qty = qty;
  _armoireRenderDraft();
}

function _armoireRemoveFromDraft(ref){
  _armoireDraft = _armoireDraft.filter(function(it){ return it.ref !== ref; });
  _armoireRenderDraft();
}

function _armoireMergeItems(items){
  items.forEach(function(it){ _armoireAddToDraft(it.ref, it.qty || 1); });
}

// ── Statistiques (prix total, délai moyen) ───────────────────────────────
// Le délai (p.leadTime) est un champ libre ("3-5 jours", "2 semaines",
// "sur commande"...) : on en extrait une estimation en jours quand c'est
// possible, sinon le produit est simplement exclu de la moyenne.
function _armoireParseLeadTimeDays(str){
  if(!str) return null;
  var s = String(str).toLowerCase();
  var m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:[-–à]\s*(\d+(?:[.,]\d+)?))?\s*(jour|jours|j\b|semaine|semaines|sem\b|mois|month)/);
  if(!m) return null;
  var n1 = parseFloat(m[1].replace(',', '.'));
  var n2 = m[2] ? parseFloat(m[2].replace(',', '.')) : null;
  var avg = n2 != null ? (n1 + n2) / 2 : n1;
  var mult = /^sem/.test(m[3]) ? 7 : (/^mois|month/.test(m[3]) ? 30 : 1);
  return avg * mult;
}

function _armoireFormatLeadDays(days){
  var rounded = Math.round(days);
  if(rounded < 1) return '< 1 jour';
  if(rounded < 14) return rounded + ' jour' + (rounded > 1 ? 's' : '');
  var weeks = Math.round(days / 7);
  return weeks + ' semaine' + (weeks > 1 ? 's' : '');
}

function _armoireComputeStats(){
  var totalPrice = 0, hasPrice = false, leadDays = [];
  // Le délai qui compte réellement pour pouvoir tout assembler est celui de
  // la référence la plus lente (on attend toutes les pièces avant de monter
  // l'armoire) — une moyenne seule masque ce goulot d'étranglement quand une
  // référence traîne loin derrière les autres (retour utilisateur). On garde
  // sa référence pour pouvoir l'afficher, pas juste le nombre de jours.
  var maxLeadDays = null, maxLeadRef = null;
  _armoireDraft.forEach(function(it){
    var p = _armoireProductByRef(it.ref);
    if(!p) return;
    var unit = parsePriceNumber(p.price);
    if(unit != null){ totalPrice += unit * it.qty; hasPrice = true; }
    var days = _armoireParseLeadTimeDays(p.leadTime);
    if(days != null){
      leadDays.push(days);
      if(maxLeadDays === null || days > maxLeadDays){ maxLeadDays = days; maxLeadRef = it.ref; }
    }
  });
  var avgLeadDays = leadDays.length ? (leadDays.reduce(function(a, b){ return a + b; }, 0) / leadDays.length) : null;
  return { totalPrice: hasPrice ? totalPrice : null, avgLeadDays: avgLeadDays, maxLeadDays: maxLeadDays, maxLeadRef: maxLeadRef, leadCount: leadDays.length };
}

// Affichées en permanence (retour utilisateur), même brouillon vide — avant,
// tout le bloc disparaissait tant qu'aucun produit n'était ajouté ;
// _armoireComputeStats() gère déjà nativement un brouillon vide (renvoie des
// stats à null), donc les 3 cases s'affichent alors avec "—" plutôt que de
// masquer le bloc entier.
function _armoireRenderStats(){
  var el = document.getElementById('armoireConfigStats');
  if(!el) return;
  var stats = _armoireComputeStats();
  var priceHtml = stats.totalPrice != null
    ? stats.totalPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    : '—';
  var countSuffix = stats.leadCount < _armoireDraft.length ? ' <span style="opacity:.6;font-weight:500;">(' + stats.leadCount + '/' + _armoireDraft.length + ')</span>' : '';
  var leadAvgHtml = stats.avgLeadDays != null ? '~' + _armoireFormatLeadDays(stats.avgLeadDays) + countSuffix : '—';
  // Délai le plus long = la vraie durée d'attente avant de pouvoir tout
  // assembler (bloqué par la référence la plus lente) — la moyenne seule
  // masque ce cas quand une référence traîne loin derrière les autres.
  var leadMaxHtml = stats.maxLeadDays != null ? _armoireFormatLeadDays(stats.maxLeadDays) + countSuffix : '—';
  el.style.display = 'flex';
  el.innerHTML =
    '<div style="flex:1;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:0;">'
      + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;">Prix total</div>'
      + '<div style="font-size:13.5px;font-weight:700;color:var(--copper-deep);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + priceHtml + '</div>'
    + '</div>'
    + '<div style="flex:1;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:0;">'
      + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;">Délai moyen</div>'
      + '<div style="font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + leadAvgHtml + '</div>'
    + '</div>'
    + '<div class="armoire-stat-delai-max" style="flex:1;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:0;' + (stats.leadCount ? 'cursor:pointer;' : '') + '"' + (stats.leadCount ? ' title="Voir le détail des délais par référence"' : '') + '>'
      + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;">Délai max' + (stats.leadCount ? ' <i class="ti ti-list-details" style="font-size:11px;vertical-align:-1px;" aria-hidden="true"></i>' : '') + '</div>'
      + '<div style="font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + leadMaxHtml + '</div>'
    + '</div>';
}

// Regroupe le brouillon par fournisseur — même règle que l'export Excel
// (product.supplier, repli sur product.brand si non renseigné) — pour que
// "Demander un prix" par bouton corresponde exactement au découpage déjà
// utilisé dans les feuilles Excel séparées.
function _armoireGroupDraftBySupplier(){
  var groups = {}, order = [];
  _armoireDraft.forEach(function(it){
    var p = _armoireProductByRef(it.ref);
    var supplier = (p && p.supplier && p.supplier.trim()) ? p.supplier.trim() : ((p && p.brand) ? p.brand : 'Fournisseur non renseigné');
    if(!groups[supplier]){ groups[supplier] = []; order.push(supplier); }
    groups[supplier].push({ ref: it.ref, qty: it.qty, p: p });
  });
  order.sort(function(a, b){ return a.localeCompare(b, 'fr'); });
  return { groups: groups, order: order };
}

// Ouvre le client mail par défaut avec une demande de prix pré-rédigée pour
// UN SEUL fournisseur (les autres produits du brouillon n'y figurent pas) —
// même formulation que la version Excel abandonnée (retour utilisateur :
// une demande de prix, pas une commande ferme), mais ici directement depuis
// l'app plutôt que dans le fichier exporté (pas de risque de corrompre le
// classeur, voir l'historique de cette fonctionnalité).
// Séparé de _armoireOpenSupplierMailto pour rester testable sans déclencher
// une vraie navigation (window.location.href) à chaque vérification.
function _armoireBuildSupplierMailto(supplier){
  var grouped = _armoireGroupDraftBySupplier();
  var items = grouped.groups[supplier];
  if(!items || !items.length) return null;
  var lines = ['Bonjour,', '', 'Pourriez-vous nous communiquer votre meilleur tarif ainsi que les délais de livraison pour les références suivantes :', ''];
  var qty = 0;
  items.forEach(function(it){
    var name = it.p ? (it.p.name || '') : '';
    lines.push('- ' + it.ref + (name ? ' — ' + name : '') + ' (x' + it.qty + ')');
    qty += it.qty;
  });
  lines.push('');
  lines.push('Quantité totale : ' + qty);
  lines.push('');
  lines.push('Merci d\'avance,');
  var subject = 'Demande de prix — ' + supplier;
  return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));
}

function _armoireOpenSupplierMailto(supplier){
  var mailto = _armoireBuildSupplierMailto(supplier);
  if(mailto) window.location.href = mailto;
}

// Popup de choix quand plusieurs fournisseurs sont présents dans le
// brouillon — un bouton par fournisseur (avec son nombre de références),
// même principe que _armoirePromptSaveKind. Retourne le nom choisi, ou null
// si annulé.
function _armoirePromptSupplierChoice(order, groups){
  return new Promise(function(resolve){
    var buttonsHtml = order.map(function(supplier, i){
      return '<button class="_armoireSupplierChoiceBtn" data-i="' + i + '" style="padding:10px 14px;border-radius:8px;border:1px solid var(--line,#C9D0D8);background:#fff;color:#1e293b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;">'
        + '<span>' + escapeHtml(supplier) + '</span>'
        + '<span style="font-weight:500;color:#64748b;font-size:12px;white-space:nowrap;">' + groups[supplier].length + ' réf.</span>'
        + '</button>';
    }).join('');
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Demande de prix à quel fournisseur ?</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Un email par fournisseur — choisis à qui l\'envoyer.</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        buttonsHtml +
        '<button id="_popupCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>' +
      '</div>'
    );
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    overlay.querySelectorAll('._armoireSupplierChoiceBtn').forEach(function(btn){
      btn.addEventListener('click', function(){ close(order[parseInt(btn.getAttribute('data-i'), 10)]); });
    });
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(null); });
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(null); });
    document.addEventListener('keydown', function onKey(e){
      if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(null); }
    });
  });
}

// Bouton "Demande de devis" de la rangée principale — raccourci vers les
// mêmes emails par fournisseur déjà disponibles un par un dans la section
// "Par fournisseur" du panneau (utile quand cette section est hors champ,
// notamment sur mobile). Un seul fournisseur → envoi direct, sans question
// inutile ; plusieurs → popup de choix ci-dessus.
async function _armoireQuoteRequest(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant de demander un prix.', 'warn');
    return;
  }
  // Toujours afficher la liste des fournisseurs, même s'il n'y en a qu'un
  // seul (retour utilisateur) — plus de raccourci direct, l'utilisateur voit
  // systématiquement à qui il envoie avant que le mail ne s'ouvre.
  var grouped = _armoireGroupDraftBySupplier();
  var chosen = await _armoirePromptSupplierChoice(grouped.order, grouped.groups);
  if(chosen) _armoireOpenSupplierMailto(chosen);
}

// Retour utilisateur : "je spam la suppression de produit qui est dans la
// configuration en cours j'ai un crash site sur mobile" — CE N'EST PAS un
// spam de requêtes réseau (retirer un article ne parle jamais au serveur
// dans l'instant : voir ARMOIRE_DRAFT_SYNC_DELAY_MS plus haut, la synchro
// est anti-rafale). C'est un spam de RENDUS : chaque tap reconstruisait
// intégralement et de façon SYNCHRONE tout le DOM du panneau (liste,
// stats, sélecteur, badge) sur le fil principal — sous rafale de taps
// rapprochés (plusieurs par frame, facile sur mobile où le tactile déclenche
// souvent plus d'évènements que prévu), ce genre de réécriture répétée du
// DOM est un déclencheur connu de plantage de Safari iOS. _armoireDraft
// (l'état) reste mis à jour immédiatement à chaque appel ; seul le rendu
// visuel est désormais regroupé en un seul par frame (requestAnimationFrame)
// au lieu d'un par tap.
var _armoireDraftRenderQueued = false;
function _armoireRenderDraft(){
  // Appelée à chaque modification réelle du brouillon (ajout/quantité/
  // retrait/vidage/chargement d'une config enregistrée) — le point d'entrée
  // unique le plus fiable pour garder la synchro serveur à jour. Fait
  // TOUJOURS son travail immédiatement (jamais différé), contrairement au
  // rendu visuel ci-dessous : c'est ce qui détecte un changement réel et
  // programme la synchro, doit donc refléter CHAQUE appel, même groupés.
  // _armoireScheduleDraftSync() UNIQUEMENT si _armoireMarkDraftChanged() a
  // détecté un changement réel — sinon un simple ré-affichage sans rapport
  // avec une modification (ex. _armoireOpen() qui rend le brouillon déjà en
  // mémoire) programmait quand même un aller-retour serveur inutile
  // (recréation de l'entrée avec un nouvel id/horodatage, voir
  // _armoireReplaceEntry — aucun PUT/PATCH disponible côté serveur) pour un
  // contenu pourtant identique.
  if(_armoireMarkDraftChanged()) _armoireScheduleDraftSync();
  if(_armoireDraftRenderQueued) return;
  _armoireDraftRenderQueued = true;
  var raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function(fn){ setTimeout(fn, 16); };
  raf(function(){
    _armoireDraftRenderQueued = false;
    _armoireRenderDraftNow();
  });
}

function _armoireRenderDraftNow(){
  var el = document.getElementById('armoireConfigDraftList');
  if(!el) return;
  _armoireRenderStats();
  _armoireUpdateMobileDraftBadge();
  // Repéré en testant la reprise après rechargement (compte déjà connecté,
  // deux emplacements déjà actifs côté serveur) : _armoireDetectOtherDraftSlots
  // (appelée par _armoireSyncDraftFromServer AVANT que _armoireDraft ne soit
  // remplacé par le brouillon serveur restauré) rendait déjà le sélecteur,
  // mais avec l'ancien compte "Active (0)" — jamais rafraîchi depuis. Ce
  // point d'entrée central (seul appelé après CHAQUE changement réel de
  // _armoireDraft) garde le nombre affiché à jour dans tous les cas.
  _armoireRenderDraftSwitcher();
  if(!_armoireDraft.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:24px 8px;">Aucun produit pour l\'instant — cherche à gauche et clique « + ».</div>';
    return;
  }
  el.innerHTML = _armoireDraft.map(function(it){
    var p = _armoireProductByRef(it.ref);
    return '<div class="armoire-draft-row" data-ref="' + escapeHtml(it.ref) + '" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);">'
      + '<div class="sug-list-photo" style="width:32px;height:32px;">' + (p ? _armoirePhotoHtml(p) : '<i class="ti ti-photo-off"></i>') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      // Ref dans un <span> tronqué séparé des badges (plutôt que sur la même
      // div) : sinon un badge juste après une référence longue se retrouvait
      // caché par l'ellipsis de troncature plutôt qu'affiché à côté.
      + '<div style="display:flex;align-items:center;min-width:0;">'
      + '<span style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(it.ref) + '</span>'
      + (p ? _productBadgesCompactHtml(p) : '')
      + '</div>'
      + '<div style="font-size:11px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p ? (p.name || '') : 'Référence introuvable dans le catalogue') + '</div>'
      + '</div>'
      // Retour utilisateur : "ajoute le [bouton i] aussi côté configuration
      // en cours" — même bouton/même classe CSS que la colonne de gauche
      // (.armoire-search-info, voir _armoireProductRowHtml et
      // _armoireOpenProductView plus bas), pour consulter la fiche d'un
      // article déjà ajouté sans devoir le rechercher à nouveau à gauche.
      + '<button type="button" class="armoire-search-info" title="Voir la fiche produit"><i class="ti ti-info-circle" aria-hidden="true"></i></button>'
      + '<button type="button" class="armoire-qty-minus" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;font-size:14px;line-height:1;flex-shrink:0;box-sizing:border-box;">−</button>'
      // Quantité modifiable directement (retour utilisateur : cliquer 49
      // fois sur "+" pour atteindre 50 pièces n'est pas praticable). Les
      // boutons +/- restent pour les petits ajustements ponctuels.
      // Retour utilisateur : "fait en sorte que les boutons soit a la même
      // taille que le bouton i" — même hauteur/rayon que .armoire-search-info
      // (26px, border-radius:7px) pour les 3 éléments du groupe -/qty/+.
      + '<input type="number" class="armoire-qty-input" inputmode="numeric" min="1" step="1" value="' + it.qty + '" style="width:38px;height:26px;text-align:center;font-size:12.5px;font-weight:600;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:2px 2px;flex-shrink:0;background:var(--paper);box-sizing:border-box;">'
      + '<button type="button" class="armoire-qty-plus" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;font-size:14px;line-height:1;flex-shrink:0;box-sizing:border-box;">+</button>'
      + '<button type="button" class="armoire-item-remove" title="Retirer" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;background:none;border:none;color:var(--ink-soft);font-size:15px;cursor:pointer;flex-shrink:0;">✕</button>'
      + '</div>';
  }).join('');
}

// ── Recherche produits, rangée en dossiers famille ───────────────────────
// Sans recherche active : dossiers par famille (comme la page d'accueil),
// repliés/dépliés SUR PLACE façon accordéon — retour utilisateur : "unifie
// le comportement [...] et configurateur d'armoire" — même mécanique que
// "Parcourir le catalogue" (_sugPickerOpenGroups, js/modal-browse-catalogue.js)
// plutôt que l'ancienne navigation "on entre dans le dossier, la liste des
// familles est remplacée, un lien retour revient en arrière". Dès qu'on tape
// dans la recherche, elle porte sur tout le catalogue, toutes familles
// confondues (liste plate, pas de dossiers).

var _armoireOpenFamilies = {}; // { famille: true } — dossiers actuellement dépliés, plusieurs à la fois

// Retour utilisateur : "ajoute un bouton pour afficher les deux catalogues
// ou non" — le configurateur d'armoire parcourait jusqu'ici TOUJOURS
// l'ensemble du catalogue (window.products, sans filtre), utile pour une
// armoire qui mélange réellement du matériel électrique et pneumatique. Le
// bouton #armoireSearchScopeBtn (voir _armoireToggleSearchScope/
// _armoireSyncSearchScopeBtn plus bas) permet de limiter la recherche/le
// parcours au seul catalogue actuellement affiché (window._getActiveDomain,
// js/storage.js) quand ce mélange n'est pas voulu. true par défaut : garde
// le comportement déjà connu tant qu'on ne l'a pas explicitement restreint.
var _armoireSearchAllDomains = true;

// Liste de produits à parcourir/rechercher dans CE panneau — remplace tous
// les "window.products || []" utilisés jusqu'ici par les fonctions
// d'affichage ci-dessous.
function _armoireScopedProducts(){
  var all = window.products || [];
  if(_armoireSearchAllDomains) return all;
  var domain = typeof window._getActiveDomain === 'function' ? window._getActiveDomain() : 'electrique';
  return all.filter(function(p){ return productDomain(p) === domain; });
}

function _armoireSyncSearchScopeBtn(){
  var btn   = document.getElementById('armoireSearchScopeBtn');
  var icon  = document.getElementById('armoireSearchScopeIcon');
  var label = document.getElementById('armoireSearchScopeLabel');
  if(!btn || !icon || !label) return;
  if(_armoireSearchAllDomains){
    btn.style.border = '1px solid var(--copper)';
    btn.style.background = 'var(--copper)';
    btn.style.color = '#fff';
    btn.title = 'Recherche dans les deux catalogues — cliquer pour limiter au catalogue actif';
    icon.className = 'ti ti-apps';
    label.textContent = 'Tous';
  } else {
    var domain = typeof window._getActiveDomain === 'function' ? window._getActiveDomain() : 'electrique';
    var isPneu = domain === 'pneumatique';
    btn.style.border = '1px solid var(--line)';
    btn.style.background = 'var(--paper)';
    btn.style.color = 'var(--ink)';
    btn.title = 'Recherche limitée au catalogue ' + (isPneu ? 'pneumatique' : 'électrique') + ' — cliquer pour chercher dans les deux';
    icon.className = isPneu ? 'ti ti-wind' : 'ti ti-bolt';
    label.textContent = isPneu ? 'Pneumatique' : 'Électrique';
  }
}

function _armoireToggleSearchScope(){
  _armoireSearchAllDomains = !_armoireSearchAllDomains;
  _armoireSyncSearchScopeBtn();
  var searchInput = document.getElementById('armoireConfigSearch');
  _armoireRenderSearchResults(searchInput ? searchInput.value : '');
}

// Même vignette que "Produits suggérés" (.sug-list-photo) — miniature fixe
// 44×44 avec repli sur une icône si pas de photo ou en erreur de chargement.
function _armoirePhotoHtml(p){
  return p.photo
    ? '<img src="' + escapeHtml(p.photo) + '" alt="' + escapeHtml(p.name || p.ref) + '" loading="lazy" data-fallback="photo-icon">'
    : '<i class="ti ti-photo-off"></i>';
}

function _armoireProductRowHtml(p){
  return '<div class="armoire-search-row sug-list-item" data-ref="' + escapeHtml(p.ref) + '" style="cursor:default;margin-bottom:6px;">'
    + '<div class="sug-list-photo">' + _armoirePhotoHtml(p) + '</div>'
    + '<div class="sug-list-body">'
    + '<div class="sug-list-ref">' + escapeHtml(p.ref || '') + _productBadgesCompactHtml(p) + '</div>'
    + '<div class="sug-list-name">' + escapeHtml(p.name || '') + (p.family ? ' · ' + escapeHtml(p.family) : '') + '</div>'
    + '</div>'
    // Retour utilisateur : "ajouter un bouton i [...] afin de pouvoir
    // regarder la fiche produit lors du choix de composant" — voir
    // _armoireOpenProductView plus bas, qui gère l'affichage par-dessus le
    // configurateur (jamais fait jusqu'ici pour la fiche produit).
    // Style en dur dans css/styles.css (.armoire-search-info, apparié à
    // .kebab-btn) — jamais la classe .kebab-btn elle-même, voir le
    // commentaire juste au-dessus de .armoire-search-info dans ce fichier.
    + '<button type="button" class="armoire-search-info" title="Voir la fiche produit"><i class="ti ti-info-circle" aria-hidden="true"></i></button>'
    // Icône ti-plus (pas un caractère "+" brut) : un glyphe de police de
    // caractères classique ne tombe pas forcément pile au centre optique
    // de sa boîte de ligne (retour utilisateur : "+" mal centré) — une
    // icône, elle, est dessinée pour ça, même principe que le "+" déjà
    // utilisé ailleurs dans ce fichier (armoire-draft-slot-new,
    // _armoireListItemHtml).
    + '<button type="button" class="armoire-search-add" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:7px;border:none;background:var(--copper);color:#fff;cursor:pointer;font-size:15px;line-height:1;flex-shrink:0;"><i class="ti ti-plus" aria-hidden="true"></i></button>'
    + '</div>';
}

// Ouvre la fiche produit complète (#viewOverlay/openView, voir
// js/render-view-modal.js) PAR-DESSUS le configurateur d'armoire — jamais
// nécessaire jusqu'ici : la fiche a le z-index le plus bas de toute
// l'échelle (--z-overlay, voir css/styles.css), le configurateur un des
// plus hauts (10600, en dur dans index.html). Sans ajustement, la fiche
// s'ouvrirait invisible, cachée derrière. Tout reste localisé ICI (jamais
// une ligne ajoutée dans render-view-modal(-close).js, qui n'ont pas à
// savoir que le configurateur existe) : un MutationObserver réagit à la
// fermeture de la fiche (retrait de sa classe "open") pour annuler le
// rehaussement de z-index, et pour remettre body.modal-open — que
// closeView() retire sans savoir que le configurateur, lui, reste ouvert
// derrière, ce qui déverrouillerait sinon le défilement de la page et
// referait passer l'en-tête au-dessus du panneau encore ouvert.
function _armoireOpenProductView(ref){
  var p = _armoireProductByRef(ref);
  if(!p || typeof openView !== 'function') return;
  var viewOverlay = document.getElementById('viewOverlay');
  if(viewOverlay){
    viewOverlay.style.zIndex = '10650';
    // Retour utilisateur : "quand je clique sur le i et que je veux voir
    // les caractéristiques ou autre ça s'ouvre pas" (puis, même symptôme :
    // "corrige la position de la fenêtre de commentaire qui s'affiche
    // derrière les autres") — Caractéristiques/Documents/Produits associés/
    // Pièces de rechange/Commentaires réutilisent tous une fenêtre commune
    // (#sugOverlay, #docOverlay, #specsOverlay, #sugPickerOverlay,
    // #commentsModalOverlay, #commentsNewOverlay pour "Nouveau"/"Modifier"),
    // qui restent à leur z-index habituel (10100 à 10650, voir index.html)
    // — plus bas ou à égalité avec le viewOverlay rehaussé ci-dessus, donc
    // ils s'ouvraient bien mais rendaient CACHÉS derrière la fiche produit.
    // On les rehausse aussi le temps que la fiche est ouverte dans ce
    // contexte, et on restaure leur z-index d'origine à la fermeture
    // (comme pour viewOverlay).
    var subOverlayIds = ['sugOverlay', 'docOverlay', 'specsOverlay', 'sugPickerOverlay', 'commentsModalOverlay', 'commentsNewOverlay'];
    var subOverlayPrevZ = {};
    subOverlayIds.forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      subOverlayPrevZ[id] = el.style.zIndex;
      el.style.zIndex = '10700';
    });
    var observer = new MutationObserver(function(){
      if(viewOverlay.classList.contains('open')) return;
      viewOverlay.style.zIndex = '';
      subOverlayIds.forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.style.zIndex = subOverlayPrevZ[id] || '';
      });
      var armoireOverlay = document.getElementById('armoireConfigOverlay');
      if(armoireOverlay && armoireOverlay.style.display !== 'none') document.body.classList.add('modal-open');
      observer.disconnect();
    });
    observer.observe(viewOverlay, { attributes: true, attributeFilter: ['class'] });
  }
  openView(p.id);
}

function _armoireRenderFamilyFolders(){
  var el = document.getElementById('armoireConfigSearchResults');
  if(!el) return;
  var all = _armoireScopedProducts();
  var grouped = {};
  var order = [];
  all.forEach(function(p){
    var f = p.family || '(Sans famille)';
    if(!grouped[f]){ grouped[f] = []; order.push(f); }
    grouped[f].push(p);
  });
  order.sort(function(a, b){ return a.localeCompare(b, 'fr'); });
  if(!order.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:16px 8px;">Aucun produit dans le catalogue.</div>';
    return;
  }
  // Groupe accordéon (.sug-picker-group/-title/-chevron/-count) — mêmes
  // classes que "Parcourir le catalogue" (js/modal-browse-catalogue.js),
  // seul le contenu diffère (liste compacte .armoire-family-list ici, une
  // grille de cartes à sélection multiple là-bas — l'ajout à la config
  // reste au clic sur "+", inchangé).
  el.innerHTML = order.map(function(f){
    var items = grouped[f];
    var open = !!_armoireOpenFamilies[f];
    return '<div class="sug-picker-group'+(open?' open':'')+'" data-family="' + escapeHtml(f) + '">'
      + '<div class="sug-picker-group-title">'
      +   '<i class="ti ti-chevron-right sug-picker-group-chevron"></i>'
      +   '<i class="ti ti-folder" style="color:var(--copper);flex-shrink:0;"></i>'
      +   escapeHtml(f) + ' <span class="sug-picker-group-count">(' + items.length + ')</span>'
      + '</div>'
      + '<div class="armoire-family-list">' + items.map(_armoireProductRowHtml).join('') + '</div>'
      + '</div>';
  }).join('');
  el.querySelectorAll('.sug-picker-group-title').forEach(function(titleEl){
    titleEl.addEventListener('click', function(){
      var groupEl = titleEl.parentNode;
      var fam = groupEl.getAttribute('data-family');
      var nowOpen = !groupEl.classList.contains('open');
      groupEl.classList.toggle('open', nowOpen);
      _armoireOpenFamilies[fam] = nowOpen;
    });
  });
}

function _armoireRenderSearchResults(query){
  var el = document.getElementById('armoireConfigSearchResults');
  if(!el) return;
  var norm = normalizeSearch(query || '');

  if(!norm){
    _armoireRenderFamilyFolders();
    return;
  }

  var all = _armoireScopedProducts();
  var results = all.filter(function(p){
    // Tags inclus dans la recherche, comme sur le catalogue principal
    // (voir getFilteredProducts/scoreProductMatch, js/storage.js) — retour
    // utilisateur : "ajouter la recherche par tags dans le configurateur
    // d'armoire".
    var tags = normalizeSearch((p.tags || []).join(' '));
    return normalizeSearch(p.ref || '').indexOf(norm) !== -1
        || normalizeSearch(p.name || '').indexOf(norm) !== -1
        || tags.indexOf(norm) !== -1;
  }).slice(0, 60);
  if(!results.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:16px 8px;">Aucun résultat.</div>';
    return;
  }
  el.innerHTML = results.map(_armoireProductRowHtml).join('');
}

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

// ── Export Excel (une feuille par fournisseur) ───────────────────────────
// But : envoyer directement le fichier au fournisseur pour passer commande.
// Regroupe par fournisseur (p.supplier), avec repli sur la marque (p.brand)
// quand le fournisseur n'est pas renseigné.
// Évite les artefacts de virgule flottante (ex. 42.660000000000004) dans
// les cellules Excel — arrondi bancaire simple au centime.
function _armoireRound2(n){
  return n == null ? n : Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Chargement paresseux d'ExcelJS (export Excel du configurateur) ─────────
// Remplace l'ancien duo SheetJS + JSZip (qui rouvrait le fichier généré pour
// y injecter à la main du XML de mise en forme conditionnelle / validation
// de données, ces deux fonctionnalités étant absentes de la version
// gratuite de SheetJS) : ExcelJS les écrit nativement via son API, donc plus
// aucune manipulation manuelle de fichier — moins de risque de corruption
// qu'avec le bricolage précédent. Auto-hébergé (js/exceljs.min.js), même
// principe que ensureXLSX (js/actions-core.js) pour le reste de l'app (import/
// comparaison/tarifs), qui continue d'utiliser SheetJS et n'est pas
// concerné par ce changement.
var _exceljsLoadPromise = null;
function ensureExcelJS(){
  if(window.ExcelJS) return Promise.resolve();
  if(_exceljsLoadPromise) return _exceljsLoadPromise;
  _exceljsLoadPromise = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = 'js/exceljs.min.js';
    s.onload = function(){ resolve(); };
    s.onerror = function(){ _exceljsLoadPromise = null; reject(new Error('Échec du chargement de la librairie Excel')); };
    document.head.appendChild(s);
  });
  return _exceljsLoadPromise;
}

// Même protection anti-injection de formule que _patchXlsxFormulaInjection
// (js/actions-core.js) pour le reste de l'app : neutralise toute cellule texte
// commençant par =, +, -, @ (ou tabulation/retour chariot) en la préfixant
// d'une apostrophe, pour qu'Excel l'affiche comme du texte brut au lieu de
// l'interpréter comme une formule (référence, produit ou fournisseur dont
// le nom commencerait ainsi — accidentellement ou non).
function _armoireSanitizeExcelRow(row){
  return row.map(function(v){
    if(typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
    return v;
  });
}

async function _armoireExportExcel(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'exporter.', 'warn');
    return;
  }
  var name = await customPrompt('Exporter en Excel', 'Nom de la configuration (utilisé pour le fichier) :', 'Configuration armoire');
  if(name === null) return; // annulé
  name = (name || '').trim() || 'Configuration armoire';

  try{ await ensureExcelJS(); }catch(err){ if(typeof showToast === 'function') showToast(err.message, 'err'); return; }

  var groups = {};
  var allItems = [];
  var grandTotal = 0, grandHasPrice = false, grandQty = 0;
  var allLeadDays = [];
  // Référence qui bloque la livraison complète (délai le plus long) — voir
  // même raisonnement que _armoireComputeStats : la moyenne seule masque ce
  // goulot d'étranglement.
  var grandMaxLead = null, grandMaxLeadItem = null;
  _armoireDraft.forEach(function(it){
    var p = _armoireProductByRef(it.ref);
    var supplier = (p && p.supplier && p.supplier.trim()) ? p.supplier.trim() : ((p && p.brand) ? p.brand : 'Fournisseur non renseigné');
    var unitPrice = p ? _armoireRound2(parsePriceNumber(p.price)) : null;
    var total = unitPrice != null ? _armoireRound2(unitPrice * it.qty) : null;
    var leadDays = p ? _armoireParseLeadTimeDays(p.leadTime) : null;
    var item = {
      supplier: supplier,
      ref: it.ref,
      name: p ? (p.name || '') : '',
      brand: p ? (p.brand || '') : '',
      qty: it.qty,
      unitPrice: unitPrice,
      total: total,
      leadTime: p ? (p.leadTime || '') : ''
    };
    if(!groups[supplier]) groups[supplier] = [];
    groups[supplier].push(item);
    allItems.push(item);
    grandQty += it.qty;
    if(total != null){ grandTotal += total; grandHasPrice = true; }
    if(leadDays != null){
      allLeadDays.push(leadDays);
      if(grandMaxLead === null || leadDays > grandMaxLead){ grandMaxLead = leadDays; grandMaxLeadItem = item; }
    }
  });
  var supplierNames = Object.keys(groups).sort();
  var grandAvgLead = allLeadDays.length ? (allLeadDays.reduce(function(a, b){ return a + b; }, 0) / allLeadDays.length) : null;
  var stamp = new Date().toISOString().slice(0, 10);

  var wb = new ExcelJS.Workbook();

  // ── Feuille 1 : Récapitulatif — vue d'ensemble + suivi de commande ──────
  // Colonnes de suivi (Statut, dates) laissées à compléter à la main : la
  // feuille sert de tableau de gestion de commande une fois les commandes
  // passées auprès de chaque fournisseur.
  var summaryWs = wb.addWorksheet('Récapitulatif');
  summaryWs.addRow(_armoireSanitizeExcelRow(['Configuration', name]));
  summaryWs.addRow(['Date d\'export', stamp]);
  summaryWs.addRow(['Nombre de fournisseurs', supplierNames.length]);
  summaryWs.addRow(['Nombre de références', allItems.length]);
  summaryWs.addRow(['Quantité totale', grandQty]);
  summaryWs.addRow(['Prix total estimé (€)', grandHasPrice ? _armoireRound2(grandTotal) : 'N/C']);
  summaryWs.addRow(['Délai moyen estimé', grandAvgLead != null ? _armoireFormatLeadDays(grandAvgLead) : 'N/C']);
  summaryWs.addRow(['Délai le plus long estimé', grandMaxLead != null ? _armoireFormatLeadDays(grandMaxLead) + ' (' + grandMaxLeadItem.ref + (grandMaxLeadItem.name ? ' — ' + grandMaxLeadItem.name : '') + ')' : 'N/C']);
  summaryWs.addRow([]);
  summaryWs.addRow(['RÉPARTITION PAR FOURNISSEUR']);
  summaryWs.addRow(['Fournisseur', 'Références', 'Quantité', 'Montant (€)', 'Délai estimé']);
  supplierNames.forEach(function(supplier){
    var rows = groups[supplier];
    var supTotal = 0, supHasPrice = false, supQty = 0, supLead = [];
    rows.forEach(function(r){
      supQty += r.qty;
      if(r.total != null){ supTotal += r.total; supHasPrice = true; }
      var d = _armoireParseLeadTimeDays(r.leadTime);
      if(d != null) supLead.push(d);
    });
    var supAvg = supLead.length ? (supLead.reduce(function(a, b){ return a + b; }, 0) / supLead.length) : null;
    summaryWs.addRow(_armoireSanitizeExcelRow([supplier, rows.length, supQty, supHasPrice ? _armoireRound2(supTotal) : 'N/C', supAvg != null ? _armoireFormatLeadDays(supAvg) : 'N/C']));
  });
  summaryWs.addRow([]);
  summaryWs.addRow(['DÉTAIL DES ARTICLES — SUIVI DE COMMANDE']);
  // "N° commande" réintégré (retour utilisateur) entre Commandé et Livré —
  // texte libre (numéro/référence fournisseur, format variable d'un
  // fournisseur à l'autre, pas de validation dessus).
  summaryWs.addRow(['Fournisseur', 'Référence', 'Désignation', 'Marque', 'Quantité', 'Prix unitaire (€)', 'Prix total (€)', 'Délai', 'Commandé', 'N° commande', 'Livré', 'Date de réception prévue', 'Statut']);
  // Ligne du premier article du tableau — sert à adresser les cellules I/K/L
  // (Commandé/Livré/Date prévue — J = N° commande, non utilisé dans les
  // formules) de chaque ligne pour la formule Statut et pour la mise en
  // forme conditionnelle ci-dessous. rowCount compte déjà la ligne d'en-tête
  // qu'on vient de pousser, donc +1 = 1ère ligne d'article (numérotation
  // Excel 1-indexée, une ligne = un article).
  var detailFirstRow = summaryWs.rowCount + 1;
  allItems.forEach(function(r){
    // Commandé/Livré : texte "✓"/vide (vide par défaut = pas encore), avec
    // une liste déroulante à un seul choix ("✓") posée dessus plus bas — ce
    // qui revient à une case à cocher (clic sur la flèche → coché ; Suppr →
    // décoché), plus pratique sur mobile qu'un VRAI/FAUX tapé à la main, et
    // compatible avec toutes les versions d'Excel (retour utilisateur : parc
    // majoritairement en Office 2016) contrairement aux cases à cocher
    // natives (365 récent uniquement). N° commande (entre les deux) reste du
    // texte libre, sans liste déroulante.
    summaryWs.addRow(_armoireSanitizeExcelRow([r.supplier, r.ref, r.name, r.brand, r.qty, r.unitPrice, r.total, r.leadTime, '', '', '', '']));
  });
  var lastRow = detailFirstRow + allItems.length - 1;
  // Colonne "Statut" (M) : un indicateur texte/symbole recalculé par Excel à
  // chaque ouverture du fichier (TODAY()), donc qui reste à jour tout seul
  // dans le temps sans qu'on ait besoin de ré-exporter (retour utilisateur).
  allItems.forEach(function(r, idx){
    var rowNum = detailFirstRow + idx;
    var formula = 'IF(K' + rowNum + '="✓","✅ Reçu",IF(AND(I' + rowNum + '="✓",L' + rowNum + '<>"",TODAY()>L' + rowNum + '),"⚠️ En retard",IF(I' + rowNum + '="✓","🕒 En cours","")))';
    summaryWs.getCell('M' + rowNum).value = { formula: formula };
  });
  [22, 16, 38, 18, 10, 14, 14, 14, 11, 16, 9, 18, 14].forEach(function(w, i){
    summaryWs.getColumn(i + 1).width = w;
  });
  if(allItems.length){
    // Couleur de fond de la colonne Statut, écrite nativement par ExcelJS
    // (pas de couleur "en dur" sur chaque cellule : une vraie règle Excel,
    // recalculée à chaque ouverture comme la formule elle-même). Rouge =
    // commandé mais pas livré et date prévue dépassée ; vert = livré.
    // fgColor ET bgColor sont fixés à la même couleur : Excel lui-même
    // écrit toujours les deux pour un remplissage uni (vérifié sur un
    // fichier de référence) — ExcelJS n'écrit que fgColor par défaut, ce qui
    // s'est révélé insuffisant dans certaines versions d'Excel (le texte de
    // la formule se met à jour normalement, mais la couleur ne s'affiche
    // pas — retour utilisateur sur Excel 365 Mac).
    summaryWs.addConditionalFormatting({
      ref: 'M' + detailFirstRow + ':M' + lastRow,
      rules: [
        {
          type: 'expression',
          formulae: ['AND($I' + detailFirstRow + '="✓",$K' + detailFirstRow + '<>"✓",$L' + detailFirstRow + '<>"",TODAY()>$L' + detailFirstRow + ')'],
          style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' }, bgColor: { argb: 'FFFFC7CE' } } }
        },
        {
          type: 'expression',
          formulae: ['$K' + detailFirstRow + '="✓"'],
          style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' }, bgColor: { argb: 'FFC6EFCE' } } }
        }
      ]
    });
    // Liste déroulante à une seule valeur ("✓") sur Commandé/Livré — voir
    // commentaire plus haut. allowBlank permet de laisser la cellule vide
    // (pas encore fait) sans qu'Excel ne considère ça comme une erreur.
    // N° commande (J) n'a volontairement aucune validation — texte libre.
    for(var rn = detailFirstRow; rn <= lastRow; rn++){
      var dv = { type: 'list', allowBlank: true, formulae: ['"✓"'] };
      summaryWs.getCell('I' + rn).dataValidation = dv;
      summaryWs.getCell('K' + rn).dataValidation = dv;
    }
  }

  // ── Une feuille par fournisseur — prête à envoyer telle quelle ──────────
  var usedNames = { 'récapitulatif': true };
  supplierNames.forEach(function(supplier){
    var rows = groups[supplier];
    var base = supplier.replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || 'Fournisseur';
    var finalName = base, i = 2;
    while(usedNames[finalName.toLowerCase()]){ finalName = base.slice(0, 28) + ' (' + i + ')'; i++; }
    usedNames[finalName.toLowerCase()] = true;
    var ws = wb.addWorksheet(finalName);
    ws.addRow(['Référence', 'Désignation', 'Marque', 'Quantité', 'Prix unitaire (€)', 'Prix total (€)', 'Délai']);
    var groupTotal = 0, groupHasPrice = false;
    rows.forEach(function(r){
      if(r.total != null){ groupTotal += r.total; groupHasPrice = true; }
      ws.addRow(_armoireSanitizeExcelRow([r.ref, r.name, r.brand, r.qty, r.unitPrice, r.total, r.leadTime]));
    });
    ws.addRow([]);
    ws.addRow(['', '', '', '', 'Total', groupHasPrice ? _armoireRound2(groupTotal) : '']);
    [16, 40, 16, 9, 14, 14, 16].forEach(function(w, i){
      ws.getColumn(i + 1).width = w;
    });
  });

  var fileSlug = name.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '_') || 'Configuration';
  var xlsxFilename = 'SPI_' + fileSlug + '_' + stamp + '.xlsx';

  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var dlA = document.createElement('a');
  dlA.href = URL.createObjectURL(blob);
  dlA.download = xlsxFilename;
  document.body.appendChild(dlA);
  dlA.click();
  document.body.removeChild(dlA);
  setTimeout(function(){ URL.revokeObjectURL(dlA.href); }, 10000);

  if(typeof showToast === 'function') showToast('Export Excel généré ✓ (' + supplierNames.length + ' fournisseur' + (supplierNames.length > 1 ? 's' : '') + ')', 'ok');
}

// Noms de dossiers déjà utilisés dans une liste (pour l'autocomplete du
// champ Dossier à l'enregistrement) — dédupliqués, triés, jamais la clé
// vide ("Sans dossier" n'est pas un dossier à proposer en autocomplete).
// Un POST qui répond 200 ne garantit pas que le serveur a réellement
// conservé le champ "folder" — certaines API minimalistes se contentent de
// renvoyer tel quel le corps envoyé sans vraiment le stocker (même
// constat déjà fait pour "familyIcon", voir verifyFamilyIconOnServer dans
// js/actions-editlock.js). Vérifié ici en relisant la liste fraîchement récupérée
// (pas la réponse du POST, qui pourrait être un simple écho) : si le
// dossier saisi n'a pas été conservé, on le dit clairement plutôt que de
// laisser l'entrée retomber silencieusement dans "Sans dossier".
function _armoireVerifyFolderPersisted(list, name, expectedFolder){
  if(!expectedFolder) return; // rien à vérifier si aucun dossier saisi
  var saved = list.find(function(e){ return e.name === name; });
  if(saved && (saved.folder || '').trim() !== expectedFolder){
    if(typeof showToast === 'function'){
      showToast('« ' + name + ' » enregistré, mais le serveur n\'a pas conservé le dossier « ' + expectedFolder + ' » — limitation côté serveur.', 'warn', 6000);
    }
    console.warn('_armoireVerifyFolderPersisted: dossier non conservé par le serveur pour', name, '— attendu:', expectedFolder, 'reçu:', saved && saved.folder);
  }
}

function _armoireExistingFolderNames(list){
  var seen = {};
  var out = [];
  list.forEach(function(entry){
    var f = (entry.folder || '').trim();
    if(f && !seen[f]){ seen[f] = true; out.push(f); }
  });
  return out.sort(function(a, b){ return a.localeCompare(b, 'fr'); });
}

// Popup à deux champs (Nom + Dossier facultatif) pour l'enregistrement d'un
// bloc/d'une configuration — retour utilisateur : ranger par dossier, en
// texte libre comme le champ Famille des produits (autocomplete sur les
// dossiers déjà utilisés, mais on peut aussi en taper un nouveau). Calqué
// sur customPrompt (js/popup.js) pour rester visuellement cohérent, mais
// à deux champs, donc pas réutilisable telle quelle.
function _armoirePromptNameAndFolder(title, nameMessage, existingFolders, defaults, okLabel){
  defaults = defaults || {};
  okLabel = okLabel || 'Enregistrer';
  return new Promise(function(resolve){
    var datalistId = '_armoireFolderDatalist';
    var datalistHtml = '<datalist id="' + datalistId + '">' + existingFolders.map(function(f){
      return '<option value="' + escapeHtml(f) + '"></option>';
    }).join('') + '</datalist>';
    var safeDefaultName = defaults.name ? String(defaults.name).replace(/"/g, '&quot;') : '';
    var safeDefaultFolder = defaults.folder ? String(defaults.folder).replace(/"/g, '&quot;') : '';
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">' + escapeHtml(title) + '</div>' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;">NOM</label>' +
      '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">' + escapeHtml(nameMessage) + '</div>' +
      '<input id="_armoireNameInput" type="text" value="' + safeDefaultName + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--line,#C9D0D8);font-size:14px;font-family:inherit;margin-bottom:14px;" />' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;">DOSSIER (facultatif)</label>' +
      '<input id="_armoireFolderInput" type="text" value="' + safeDefaultFolder + '" list="' + datalistId + '" placeholder="ex. Automates, Sécurité…" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--line,#C9D0D8);font-size:14px;font-family:inherit;margin-bottom:20px;" />' +
      datalistHtml +
      '<div style="display:flex;gap:8px;">' +
        '<button id="_popupCancel" style="flex:1;padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>' +
        '<button id="_popupOk" style="flex:1;padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:var(--copper,#194093);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">' + escapeHtml(okLabel) + '</button>' +
      '</div>'
    );
    var nameInput   = overlay.querySelector('#_armoireNameInput');
    var folderInput = overlay.querySelector('#_armoireFolderInput');
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    function submit(){ close({ name: nameInput.value, folder: folderInput.value }); }
    overlay.querySelector('#_popupOk').addEventListener('click', submit);
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(null); });
    // Pas de fermeture au clic en dehors de la fenêtre (retour utilisateur :
    // un clic à côté annulait silencieusement l'enregistrement, en faisant
    // perdre le nom déjà tapé) — seuls les boutons et Échap ferment cette
    // popup désormais.
    nameInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); folderInput.focus(); }
      if(e.key === 'Escape'){ e.preventDefault(); close(null); }
    });
    folderInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); submit(); }
      if(e.key === 'Escape'){ e.preventDefault(); close(null); }
    });
    setTimeout(function(){ nameInput.focus(); nameInput.select(); }, 30);
  });
}

// Écrase l'entrée d'origine par le nouveau contenu : POST le nouveau
// d'abord, DELETE l'ancien SEULEMENT si le POST a réussi (pour ne jamais
// perdre l'original si l'enregistrement du nouveau contenu échoue). L'API
// n'expose pas de PUT/PATCH — un DELETE+POST est le seul moyen de "mettre à
// jour" une entrée sans dupliquer.
function _armoireReplaceEntry(basePath, oldId, body){
  return _armoireApi(basePath, { method: 'POST', body: JSON.stringify(body) })
    .then(function(created){
      // Retirée dès MAINTENANT (pas seulement si le DELETE ci-dessous
      // réussit) — voir _armoireRetiredEntryIds plus haut : qu'il réussisse,
      // échoue, ou tarde à se répercuter côté serveur, cette ancienne entrée
      // ne doit plus jamais réapparaître pour le reste de cette session.
      _armoireMarkEntryRetired(basePath, oldId);
      return _armoireApi(basePath + '/' + encodeURIComponent(oldId), { method: 'DELETE' })
        .catch(function(e){ console.warn('_armoireReplaceEntry: ancienne entrée non supprimée:', e && e.message); })
        .then(function(){ return created; });
    });
}

// Popup à 2 boutons "Bloc" / "Configuration" — remplace les deux anciens
// boutons "Enregistrer comme bloc"/"Enregistrer la configuration" par un
// seul bouton "Enregistrer" (retour utilisateur : fusionner pour libérer
// une place dans la rangée de boutons, voir _armoireSaveChoice ci-dessous).
function _armoirePromptSaveKind(){
  return new Promise(function(resolve){
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Enregistrer comme…</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Un bloc est réutilisable dans d\'autres configurations ; une configuration est l\'armoire complète telle quelle.</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<button id="_armoireKindBlock" style="padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:#fff;color:var(--copper-deep,#194093);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;"><i class="ti ti-package" aria-hidden="true"></i> Bloc réutilisable</button>' +
        '<button id="_armoireKindConfig" style="padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:var(--copper,#194093);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;"><i class="ti ti-device-floppy" aria-hidden="true"></i> Configuration complète</button>' +
        '<button id="_popupCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>' +
      '</div>'
    );
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    overlay.querySelector('#_armoireKindBlock').addEventListener('click', function(){ close('block'); });
    overlay.querySelector('#_armoireKindConfig').addEventListener('click', function(){ close('config'); });
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(null); });
    // Pas de fermeture au clic en dehors de la fenêtre (retour utilisateur :
    // un clic à côté annulait silencieusement l'enregistrement) — seuls les
    // boutons ci-dessus et Échap permettent de fermer cette popup.
    document.addEventListener('keydown', function onKey(e){
      if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(null); }
    });
  });
}

// Bouton "Enregistrer" fusionné — demande le type SEULEMENT quand c'est
// ambigu (nouvel enregistrement) ; en édition, le type est déjà fixé par
// l'entrée en cours d'édition, donc pas de question inutile (voir
// _armoireUpdateEditingBanner, qui adapte déjà le libellé du bouton).
async function _armoireSaveChoice(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'enregistrer.', 'warn');
    return;
  }
  if(_armoireEditingEntry && _armoireEditingEntry.kind === 'block'){ _armoireSaveBlock(); return; }
  if(_armoireEditingEntry && _armoireEditingEntry.kind === 'config'){ _armoireSaveConfig(); return; }
  var kind = await _armoirePromptSaveKind();
  if(kind === 'block') _armoireSaveBlock();
  else if(kind === 'config') _armoireSaveConfig();
}

async function _armoireSaveBlock(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'enregistrer un bloc.', 'warn');
    return;
  }
  var editing = _armoireEditingEntry && _armoireEditingEntry.kind === 'block' ? _armoireEditingEntry : null;
  var result = await _armoirePromptNameAndFolder(
    editing ? 'Modifier le bloc' : 'Enregistrer comme bloc',
    'Nom du bloc (ex. « Bloc PLC standard ») :',
    _armoireExistingFolderNames(_armoireBlocks),
    editing ? { name: editing.name, folder: editing.folder } : null,
    editing ? 'Mettre à jour' : 'Enregistrer'
  );
  if(!result || !result.name || !result.name.trim()) return;
  var name = result.name.trim();
  var folder = (result.folder || '').trim();
  var body = { name: name, folder: folder, items: _armoireDraft };
  var apiCall = editing
    ? _armoireReplaceEntry('/configBlocks', editing.id, body)
    : _armoireApi('/configBlocks', { method: 'POST', body: JSON.stringify(body) });
  apiCall
    .then(function(){
      if(typeof showToast === 'function') showToast('Bloc « ' + name + ' » ' + (editing ? 'mis à jour' : 'enregistré') + ' ✓', 'ok');
      _armoireEditingEntry = null;
      // En édition, restaurer la configuration en cours mise de côté (voir
      // _armoireStartEditEntry) — jamais perdue. Hors édition, comportement
      // inchangé : le brouillon se vide après avoir enregistré un bloc.
      if(editing){ _armoireDraft = _armoireDraftBackup || []; _armoireDraftBackup = null; }
      else { _armoireDraft = []; }
      _armoireRenderDraft();
      _armoireUpdateEditingBanner();
      _armoireFetchBlocks().then(function(){
        _armoireVerifyFolderPersisted(_armoireBlocks, name, folder);
      });
    })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireSaveConfig(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'enregistrer la configuration.', 'warn');
    return;
  }
  var editing = _armoireEditingEntry && _armoireEditingEntry.kind === 'config' ? _armoireEditingEntry : null;
  var result = await _armoirePromptNameAndFolder(
    editing ? 'Modifier la configuration' : 'Enregistrer la configuration',
    'Nom de la configuration (ex. « Armoire PLC 20E/16S ») :',
    _armoireExistingFolderNames(_armoireSavedConfigs),
    editing ? { name: editing.name, folder: editing.folder } : null,
    editing ? 'Mettre à jour' : 'Enregistrer'
  );
  if(!result || !result.name || !result.name.trim()) return;
  var name = result.name.trim();
  var folder = (result.folder || '').trim();
  var body = { name: name, folder: folder, items: _armoireDraft };
  var apiCall = editing
    ? _armoireReplaceEntry('/configSavedConfigs', editing.id, body)
    : _armoireApi('/configSavedConfigs', { method: 'POST', body: JSON.stringify(body) });
  apiCall
    .then(function(){
      if(typeof showToast === 'function') showToast('Configuration « ' + name + ' » ' + (editing ? 'mise à jour' : 'enregistrée') + ' ✓', 'ok');
      _armoireEditingEntry = null;
      // En édition, restaurer la configuration en cours mise de côté (voir
      // _armoireStartEditEntry) — jamais perdue. Hors édition, vider le
      // brouillon (retour utilisateur : même comportement qu'un bloc, pas
      // besoin de "Vider" à la main après avoir enregistré).
      if(editing){ _armoireDraft = _armoireDraftBackup || []; _armoireDraftBackup = null; }
      else { _armoireDraft = []; }
      _armoireRenderDraft();
      _armoireUpdateEditingBanner();
      _armoireFetchSavedConfigs().then(function(){
        _armoireVerifyFolderPersisted(_armoireSavedConfigs, name, folder);
      });
    })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireDeleteBlock(id){
  // Le bouton ✕ est déjà masqué sans ce droit (voir _armoireListItemHtml),
  // mais cette fonction reste techniquement accessible directement (console,
  // autre appel) — vérifier ici aussi plutôt que de se reposer uniquement
  // sur l'UI (même garde que deleteProduct dans js/render-card-grid.js).
  var _perms = window._userPerms || {};
  if(!(_perms.canDelete || _perms.isAdmin)){
    if(typeof showToast === 'function') showToast('Droit de suppression requis', 'err', 3000);
    return;
  }
  // Retour utilisateur : "pour tout ce qui est suppression de produit etc.
  // faudrait préciser que c'est irréversible" — ce popup n'avait auparavant
  // aucun message du tout (chaîne vide), rien n'indiquait que c'était
  // définitif.
  if(!(await customConfirm('Supprimer ce bloc ?', 'Ce bloc sera supprimé définitivement. Cette opération est irréversible.', { okLabel: 'Supprimer', danger: true }))) return;
  _armoireMarkEntryRetired('/configBlocks', id);
  _armoireApi('/configBlocks/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(){ _armoireFetchBlocks(); })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireDeleteSavedConfig(id){
  var _perms = window._userPerms || {};
  if(!(_perms.canDelete || _perms.isAdmin)){
    if(typeof showToast === 'function') showToast('Droit de suppression requis', 'err', 3000);
    return;
  }
  if(!(await customConfirm('Supprimer cette configuration ?', 'Cette configuration sera supprimée définitivement. Cette opération est irréversible.', { okLabel: 'Supprimer', danger: true }))) return;
  _armoireMarkEntryRetired('/configSavedConfigs', id);
  _armoireApi('/configSavedConfigs/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(){ _armoireFetchSavedConfigs(); })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireLoadSavedConfig(config){
  if(_armoireDraft.length && !(await customConfirm('Remplacer la configuration en cours ?', 'Remplacer la configuration en cours par « ' + escapeHtml(config.name) + ' » ?', { okLabel: 'Remplacer' }))) return;
  _armoireDraft = config.items.map(function(it){ return { ref: it.ref, qty: it.qty || 1 }; });
  _armoireRenderDraft();
}

// ── Modifier un bloc/une configuration existant ──────────────────────────
// Met de côté _armoireDraft (jamais vidé/perdu, voir _armoireDraftBackup)
// et le remplace TEMPORAIREMENT par le contenu de l'entrée éditée, pour
// réutiliser telle quelle toute l'UI de composition (recherche, +/-,
// retrait) — restauré par _armoireCancelEditEntry ou à la fin de
// _armoireSaveBlock/_armoireSaveConfig. Retour utilisateur : éditer un
// bloc/une config ne doit jamais obliger à supprimer/vider une
// configuration en cours de création.
async function _armoireStartEditEntry(entry, kind){
  _armoireDraftBackup = _armoireDraft;
  _armoireDraft = entry.items.map(function(it){ return { ref: it.ref, qty: it.qty || 1 }; });
  _armoireEditingEntry = { id: entry.id, kind: kind, name: entry.name, folder: entry.folder || '' };
  _armoireRenderDraft();
  _armoireUpdateEditingBanner();
  // Fermer le tiroir Blocs/Configurations s'il est ouvert (mobile) pour
  // laisser place à la zone de composition, puis y basculer.
  var drawerClose = document.getElementById('armoireBlocksDrawerClose');
  if(drawerClose && drawerClose.offsetParent !== null) drawerClose.click();
  if(typeof _armoireSetMobileView === 'function') _armoireSetMobileView('draft');
}

// Restaure la configuration en cours telle qu'elle était avant l'édition —
// aucune donnée de l'utilisateur n'est jamais perdue, qu'il annule
// explicitement ou qu'il vide/ferme pendant l'édition.
function _armoireCancelEditEntry(){
  _armoireEditingEntry = null;
  _armoireDraft = _armoireDraftBackup || [];
  _armoireDraftBackup = null;
  _armoireRenderDraft();
  _armoireUpdateEditingBanner();
}

function _armoireUpdateEditingBanner(){
  var banner = document.getElementById('armoireEditingBanner');
  var textEl = document.getElementById('armoireEditingBannerText');
  if(!banner) return;
  if(_armoireEditingEntry){
    banner.classList.remove('closing');
    banner.style.display = 'flex';
    if(textEl) textEl.innerHTML = '<i class="ti ti-pencil"></i> Modification de « ' + escapeHtml(_armoireEditingEntry.name) + ' »';
  } else if(banner.style.display !== 'none'){
    // Animée (glissement+fondu vers le haut, voir css/styles.css) plutôt
    // qu'un disparition instantanée — retour utilisateur : animations sur
    // les différents éléments du configurateur. Le if ci-dessus évite de
    // relancer une fermeture déjà terminée (cette fonction est appelée à
    // chaque changement du brouillon, pas seulement en sortie d'édition).
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(banner, function(){ banner.style.display = 'none'; });
    } else {
      banner.style.display = 'none';
    }
  }
  // Bouton Enregistrer fusionné (bloc + configuration, voir
  // _armoireSaveChoice) : en édition, on sait déjà de quel type il s'agit
  // (impossible de "changer d'avis" en cours d'édition — voir
  // _armoireSaveChoice, qui saute directement le choix dans ce cas), le
  // libellé le reflète directement sans passer par le popup de choix.
  var saveBtn = document.getElementById('armoireConfigSaveBtn');
  if(saveBtn){
    if(_armoireEditingEntry && _armoireEditingEntry.kind === 'block'){
      saveBtn.innerHTML = '<i class="ti ti-pencil" style="font-size:15px;" aria-hidden="true"></i> Mettre à jour le bloc';
    } else if(_armoireEditingEntry && _armoireEditingEntry.kind === 'config'){
      saveBtn.innerHTML = '<i class="ti ti-pencil" style="font-size:15px;" aria-hidden="true"></i> Mettre à jour la configuration';
    } else {
      saveBtn.innerHTML = '<i class="ti ti-device-floppy" style="font-size:15px;" aria-hidden="true"></i> Enregistrer';
    }
  }
}

// ── Onglets Blocs / Configurations ───────────────────────────────────────

function _armoireSwitchTab(tab){
  _armoireActiveTab = tab;
  document.querySelectorAll('.armoire-tab-btn').forEach(function(btn){
    var active = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('active', active);
  });
  var blocksEl = document.getElementById('armoireConfigBlocksList');
  var savedEl = document.getElementById('armoireConfigSavedList');
  if(blocksEl) blocksEl.style.display = tab === 'blocks' ? '' : 'none';
  if(savedEl) savedEl.style.display = tab === 'configs' ? '' : 'none';
}

// ── Tiroir "Blocs / Configurations" — partagés
// entre tous les utilisateurs connectés, pas propres à chacun (d'où le
// libellé neutre plutôt que "Mes...", retour utilisateur). ─────────────
// Ouvert à la demande par-dessus la liste de familles (voir CSS
// .armoire-blocks-drawer) au lieu d'être empilé en permanence dessous.

function _armoireOpenBlocksDrawer(){
  var drawer = document.getElementById('armoireBlocksDrawer');
  if(drawer) drawer.style.display = 'flex';
  if(!_armoireDrawerOutsideHandler){
    _armoireDrawerOutsideHandler = function(e){
      var d = document.getElementById('armoireBlocksDrawer');
      var trigger = document.getElementById('armoireBlocksDrawerTrigger');
      if(!d || d.style.display === 'none') return;
      if(d.contains(e.target) || (trigger && trigger.contains(e.target))) return;
      // Un clic sur/dans une popup ouverte par-dessus (ex. "Voir le
      // contenu" au clic sur le petit "i", via customAlert) n'est pas un
      // clic "à l'extérieur" du panneau — sans ce garde-fou, fermer cette
      // popup fermait aussi le panneau Blocs/Configurations en dessous
      // (retour utilisateur).
      if(e.target.closest && e.target.closest('.spi-popup-overlay')) return;
      _armoireCloseBlocksDrawer();
    };
    document.addEventListener('mousedown', _armoireDrawerOutsideHandler);
  }
}

// instant (défaut false) : saute l'animation de fermeture — utilisé
// seulement pour remettre le tiroir à l'état fermé en arrière-plan (à
// l'ouverture/fermeture du configurateur lui-même, voir _armoireOpen/
// _armoireClose plus bas), où une animation supplémentaire n'aurait rien à
// montrer (le tiroir n'a jamais été visible) et ne ferait que retarder
// inutilement le display:none. Une vraie fermeture demandée par
// l'utilisateur (croix, clic à l'extérieur) reste animée — retour
// utilisateur : "ajouter des animations pour les ouverture et fermeture des
// différents éléments dans le configurateur d'armoire".
function _armoireCloseBlocksDrawer(instant){
  var drawer = document.getElementById('armoireBlocksDrawer');
  if(!drawer || drawer.style.display === 'none') return;
  if(instant || typeof window._closeOverlayAnimated !== 'function'){
    drawer.classList.remove('closing');
    drawer.style.display = 'none';
    return;
  }
  window._closeOverlayAnimated(drawer, function(){ drawer.style.display = 'none'; });
}

var _armoireDrawerOutsideHandler = null;

// ── Bascule mobile "Parcourir" / "Ma configuration" ──────────────────────
// Sous 768px, empiler les deux colonnes moitié-moitié les rendait
// inutilisables (listes minuscules, double scroll) — une seule colonne
// plein écran à la fois, sélectionnée via cette bascule. Sans effet sur
// desktop où les deux colonnes restent affichées côte à côte (CSS).
var _armoireMobileView = 'browse';

function _armoireSetMobileView(view){
  _armoireMobileView = view;
  document.querySelectorAll('.armoire-mobile-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.getAttribute('data-view') === view);
  });
  var browseEl = document.querySelector('.armoire-cfg-browse');
  var draftEl = document.querySelector('.armoire-cfg-draft');
  if(browseEl) browseEl.classList.toggle('armoire-mobile-hidden', view !== 'browse');
  if(draftEl) draftEl.classList.toggle('armoire-mobile-hidden', view !== 'draft');
}

function _armoireUpdateMobileDraftBadge(){
  var badge = document.getElementById('armoireMobileDraftBadge');
  if(!badge) return;
  if(_armoireDraft.length){
    badge.textContent = _armoireDraft.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ── Ouverture / fermeture ────────────────────────────────────────────────

// Retour utilisateur : "corriger le problème de fenêtre avec le clavier"
// (capture à l'appui : le pied de page de la modale flottant au milieu de
// l'écran, l'accueil visible dans l'espace resté découvert en dessous, puis
// le clavier) — CE fichier calculait encore la position/hauteur de la
// modale en JS via window.visualViewport (voir l'historique retiré ici),
// exactement le même piège déjà rencontré et corrigé pour la fenêtre de
// connexion (voir js/auth.js/index.html, interactive-widget=resizes-
// content) : visualViewport ne reflète pas toujours fidèlement la hauteur
// ajoutée par les barres d'accessoire d'iOS au-dessus du clavier (suggestion
// de mot, "Mots de passe"/Face ID…), donc une modale dimensionnée dessus
// peut s'arrêter avant la vraie limite visible. index.html porte déjà
// interactive-widget=resizes-content pour TOUTE la page : le viewport de
// mise en page lui-même rétrécit quand le clavier s'ouvre, qu'une modale
// l'utilise via du CSS position:fixed ou non — plus besoin de le
// recalculer à la main ici. #armoireConfigModal (voir css/styles.css)
// s'ancre donc désormais en pur CSS (position:fixed; bottom:var(--nav-h)),
// sans plus aucune ligne de JS ; le seul cas que le CSS seul ne peut pas
// connaître (la bottom-nav qui se masque PENDANT la saisie, voir
// _navHideOnKeyboardCheck, js/actions-mobile-chrome.js) est géré par un
// sélecteur :has() dédié (body:has(.bottom-nav-kb-hidden) #armoireConfigModal).

function _armoireOpen(){
  var overlay = document.getElementById('armoireConfigOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');
  _armoireBindRowMenuOnce();
  _armoireOpenFamilies = {}; // dossiers repliés à chaque (ré)ouverture, comme "Parcourir le catalogue"
  var searchInput = document.getElementById('armoireConfigSearch');
  if(searchInput) searchInput.value = '';
  _armoireSyncSearchScopeBtn();
  _armoireCloseBlocksDrawer(true); // remise à zéro silencieuse, le tiroir n'a jamais été visible
  _armoireSetMobileView('browse');
  // Retour utilisateur : "cache le bouton Enregistrer du configurateur
  // lorsqu'on n'est pas loggé" — "Enregistrer" poste sur /configBlocks ou
  // /configSavedConfigs (voir _armoireSaveChoice), qui exigent un compte
  // côté serveur comme le reste des Blocs/Configurations partagés (voir
  // juste plus bas) : un clic sans être connecté n'aurait de toute façon
  // jamais pu aboutir. Recalculé à CHAQUE ouverture plutôt qu'une fois pour
  // toutes : une connexion/déconnexion referme déjà le panneau au passage
  // (voir _authCloseSensitiveUI dans js/auth.js), donc rouvrir est le seul
  // moment où l'état a besoin d'être réévalué.
  var saveBtnVisibility = document.getElementById('armoireConfigSaveBtn');
  if(saveBtnVisibility) saveBtnVisibility.style.display = (typeof authIsLoggedIn === 'function' && authIsLoggedIn()) ? '' : 'none';
  _armoireRenderDraft();
  _armoireRenderSearchResults('');
  _armoireSwitchTab(_armoireActiveTab);
  // Retour utilisateur : "pourquoi j'ai cette notif alors que je ne suis pas
  // connecté ?" (capture à l'appui : "Liste des blocs/configurations non
  // actualisée — réessayez" dès l'ouverture, en anonyme) — /configBlocks et
  // /configSavedConfigs exigent un compte côté serveur ; les appeler quand
  // même pour un visiteur anonyme échoue systématiquement (pas un aléa
  // réseau ponctuel que "réessayez" pourrait résoudre) et affichait ces deux
  // avertissements à chaque ouverture. La configuration en cours (locale,
  // propre à cet appareil, voir plus haut) reste pleinement utilisable sans
  // connexion ; seuls les Blocs/Configurations partagés de l'équipe
  // requièrent un compte, et restent donc simplement vides tant qu'on ne
  // s'est pas connecté, sans essai voué à l'échec ni faux avertissement.
  if(typeof authIsLoggedIn === 'function' && authIsLoggedIn()){
    // Retour utilisateur : "je veux que la demande de mise de côté ce fasse
    // lorsqu'on clique sur le configurateur" — _armoireReconcileOwnerOnLogin
    // (conflit entre le brouillon de cet appareil et celui déjà sur le
    // compte, voir plus haut) se résout D'ABORD, avant tout le reste :
    // _armoireFetchBlocks()/_armoireSyncDraftFromServer juste en dessous ne
    // doivent chercher/adopter le brouillon serveur qu'une fois cette
    // décision prise, jamais en même temps (la réconciliation pose déjà son
    // propre verrou _armoireReconcilingOwner pendant qu'elle attend une
    // réponse, mais les enchaîner reste plus simple à suivre que les laisser
    // courir en parallèle).
    (typeof _armoireReconcileOwnerOnLogin === 'function' ? _armoireReconcileOwnerOnLogin() : Promise.resolve(false)).then(function(handled){
      // handled === true : une décision "Garder"/"Mettre de côté" vient
      // d'être prise et déjà appliquée/synchronisée par
      // _armoireReconcileOwnerOnLogin elle-même. Ne PAS relancer
      // _armoireSyncDraftFromServer juste après : ce flux ne fait que
      // comparer des horodatages et pourrait retomber sur l'ANCIENNE entrée
      // serveur qu'on vient tout juste de remplacer si le serveur n'a pas
      // encore digéré le POST+DELETE (voir _armoireReplaceEntry) —
      // repéré en testant précisément ce cas : la décision de l'utilisateur
      // se faisait silencieusement défaire l'instant d'après. Seul
      // _armoireFetchBlocks() (pour peupler la liste "Blocs" à parcourir)
      // reste utile ici.
      if(handled){
        _armoireFetchBlocks();
        _armoireFetchSavedConfigs();
        return;
      }
      // Retour utilisateur : "reprendre sur notre tel ou un autre pc avec le
      // même identifiant" — _armoireBlocks doit être à jour (contient
      // éventuellement le brouillon serveur) avant de chercher dedans.
      _armoireFetchBlocks().then(_armoireSyncDraftFromServer);
      _armoireFetchSavedConfigs();
    });
  } else {
    _armoireRenderBlocksList();
    _armoireRenderSavedList();
  }
}

function _armoireClose(){
  // Ne doit jamais rester ouverte par-dessus un configurateur fermé/masqué
  // (voir _armoireOpenDraftListModal).
  _armoireCloseDraftListModal();
  // Filet de sécurité : fermer le configurateur en pleine édition d'un
  // bloc/config ne doit jamais laisser la vraie configuration en cours
  // remplacée par le contenu édité — restaure silencieusement (voir
  // _armoireCancelEditEntry, jamais perdre la configuration de l'utilisateur).
  if(_armoireEditingEntry) _armoireCancelEditEntry();
  // Retour utilisateur : "reprendre sur notre tel ou un autre pc" — force la
  // synchronisation serveur immédiatement à la fermeture plutôt que
  // d'attendre le délai anti-rafale (ARMOIRE_DRAFT_SYNC_DELAY_MS) : sans ça,
  // fermer le configurateur puis changer d'appareil dans la seconde et demie
  // qui suit pouvait reprendre une version un cran en retard.
  if(_armoireDraftSyncTimer){
    clearTimeout(_armoireDraftSyncTimer);
    _armoireDraftSyncTimer = null;
    _armoireSyncDraftToServer();
  }
  var overlay = document.getElementById('armoireConfigOverlay');
  document.body.classList.remove('modal-open');
  _armoireCloseBlocksDrawer(true); // toute la fenêtre disparaît déjà — pas besoin d'une seconde anim en plus
  function teardown(){
    if(overlay) overlay.style.display = 'none';
  }
  if(overlay && typeof window._closeOverlayAnimated === 'function'){
    window._closeOverlayAnimated(overlay, teardown);
  } else {
    teardown();
  }
}

(function _initArmoireConfig(){
  var btnOpen = document.getElementById('btnOpenArmoireConfig');
  if(btnOpen) btnOpen.addEventListener('click', _armoireOpen);

  // Second point d'entrée, accessible depuis n'importe quelle page — voir
  // index.html, #btnFabArmoireConfig (bulle flottante juste au-dessus de
  // "Ajouter un produit") : contrairement à #btnOpenArmoireConfig (page
  // d'accueil uniquement, invisible dès qu'on parcourt le catalogue), ce
  // bouton reste joignable en permanence. Essayé d'abord comme entrée de
  // menu (⋮ desktop + tiroir mobile), puis retour utilisateur : "je ne veux
  // pas le bouton configurateur dans le menu mais juste au dessus du petit
  // plus".
  var btnFabArmoireConfig = document.getElementById('btnFabArmoireConfig');
  if(btnFabArmoireConfig) btnFabArmoireConfig.addEventListener('click', _armoireOpen);

  var btnClose = document.getElementById('armoireConfigCloseBtn');
  if(btnClose) btnClose.addEventListener('click', _armoireClose);

  var btnDrawerTrigger = document.getElementById('armoireBlocksDrawerTrigger');
  if(btnDrawerTrigger) btnDrawerTrigger.addEventListener('click', _armoireOpenBlocksDrawer);

  var btnDrawerClose = document.getElementById('armoireBlocksDrawerClose');
  if(btnDrawerClose) btnDrawerClose.addEventListener('click', _armoireCloseBlocksDrawer);

  var searchInput = document.getElementById('armoireConfigSearch');
  if(searchInput) searchInput.addEventListener('input', function(){ _armoireRenderSearchResults(searchInput.value); });

  var searchScopeBtn = document.getElementById('armoireSearchScopeBtn');
  if(searchScopeBtn) searchScopeBtn.addEventListener('click', _armoireToggleSearchScope);

  var searchResultsEl = document.getElementById('armoireConfigSearchResults');
  if(searchResultsEl) searchResultsEl.addEventListener('click', function(e){
    var infoBtn = e.target.closest ? e.target.closest('.armoire-search-info') : null;
    if(infoBtn){
      var infoRow = infoBtn.closest('.armoire-search-row');
      if(infoRow) _armoireOpenProductView(infoRow.getAttribute('data-ref'));
      return;
    }
    var addBtn = e.target.closest ? e.target.closest('.armoire-search-add') : null;
    if(addBtn){
      var row = addBtn.closest('.armoire-search-row');
      if(row) _armoireAddToDraft(row.getAttribute('data-ref'), 1);
    }
    // L'ouverture/fermeture des dossiers famille (.sug-picker-group-title)
    // est câblée directement dans _armoireRenderFamilyFolders() ci-dessus —
    // même mécanique que "Parcourir le catalogue" (un addEventListener par
    // titre à chaque rendu, pas de délégation ici).
  });

  var draftEl = document.getElementById('armoireConfigDraftList');
  if(draftEl) draftEl.addEventListener('click', function(e){
    var row = e.target.closest ? e.target.closest('.armoire-draft-row') : null;
    if(!row) return;
    var ref = row.getAttribute('data-ref');
    var item = _armoireDraft.find(function(it){ return it.ref === ref; });
    if(!item) return;
    if(e.target.closest('.armoire-search-info')) _armoireOpenProductView(ref);
    else if(e.target.closest('.armoire-qty-plus')) _armoireSetQty(ref, item.qty + 1);
    else if(e.target.closest('.armoire-qty-minus')) _armoireSetQty(ref, item.qty - 1);
    else if(e.target.closest('.armoire-item-remove')) _armoireRemoveFromDraft(ref);
  });
  // Saisie directe de la quantité : sur "change" (perte de focus / Entrée)
  // uniquement, jamais sur "input" (à chaque frappe) — _armoireSetQty
  // déclenche _armoireRenderDraft() qui reconstruit tout le innerHTML de la
  // liste, ce qui détruirait le champ en cours de frappe et ferait perdre
  // le focus/curseur après chaque caractère tapé.
  if(draftEl) draftEl.addEventListener('change', function(e){
    var input = e.target.closest ? e.target.closest('.armoire-qty-input') : null;
    if(!input) return;
    var row = input.closest('.armoire-draft-row');
    if(!row) return;
    var n = parseInt(input.value, 10);
    if(!n || n < 1) n = 1;
    _armoireSetQty(row.getAttribute('data-ref'), n);
  });
  // Entrée valide immédiatement sans attendre un blur manuel (déclenche le
  // "change" ci-dessus via blur()).
  if(draftEl) draftEl.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && e.target.classList && e.target.classList.contains('armoire-qty-input')){
      e.preventDefault();
      e.target.blur();
    }
  });

  // Bouton compact "N configurations actives" — délégation sur le
  // conteneur stable plutôt que sur le bouton lui-même, régénéré à chaque
  // _armoireRenderDraftSwitcher() (un listener posé directement dessus
  // serait perdu au premier re-rendu). Ouvre la fenêtre de gestion, voir
  // _armoireOpenDraftListModal.
  var switcherEl = document.getElementById('armoireDraftSwitcher');
  if(switcherEl) switcherEl.addEventListener('click', function(e){
    if(e.target.closest && e.target.closest('#armoireDraftListOpenBtn')) _armoireOpenDraftListModal();
  });

  // Délégation sur le conteneur des stats plutôt que sur la case elle-même :
  // son innerHTML est régénéré à chaque _armoireRenderStats(), un listener
  // posé directement sur la case serait perdu au premier re-rendu.
  var statsEl = document.getElementById('armoireConfigStats');
  if(statsEl) statsEl.addEventListener('click', function(e){
    if(e.target.closest('.armoire-stat-delai-max')) _armoireShowLeadTimesDetails();
  });

  var clearBtn = document.getElementById('armoireConfigClearBtn');
  if(clearBtn) clearBtn.addEventListener('click', async function(){
    if(!_armoireDraft.length) return;
    if(!(await customConfirm('Vider la configuration en cours ?', 'Toutes les références ajoutées seront retirées. Cette opération est irréversible.', { okLabel: 'Vider', danger: true }))) return;
    if(_armoireEditingEntry){
      // Vider pendant une édition = l'abandonner — restaure la
      // configuration en cours mise de côté (voir _armoireCancelEditEntry)
      // plutôt que de la remplacer par du vide : jamais perdre la vraie
      // configuration de l'utilisateur (retour utilisateur).
      _armoireCancelEditEntry();
      return;
    }
    _armoireDraft = [];
    _armoireRenderDraft();
  });

  var exportBtn = document.getElementById('armoireConfigExportBtn');
  if(exportBtn) exportBtn.addEventListener('click', _armoireExportExcel);

  var quoteBtn = document.getElementById('armoireConfigQuoteBtn');
  if(quoteBtn) quoteBtn.addEventListener('click', _armoireQuoteRequest);

  var saveBtn = document.getElementById('armoireConfigSaveBtn');
  if(saveBtn) saveBtn.addEventListener('click', _armoireSaveChoice);

  document.querySelectorAll('.armoire-tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ _armoireSwitchTab(btn.getAttribute('data-tab')); });
  });

  document.querySelectorAll('.armoire-mobile-tab').forEach(function(btn){
    btn.addEventListener('click', function(){ _armoireSetMobileView(btn.getAttribute('data-view')); });
  });

  var blocksListEl = document.getElementById('armoireConfigBlocksList');
  if(blocksListEl) blocksListEl.addEventListener('click', async function(e){
    var folderHeader = e.target.closest ? e.target.closest('.armoire-folder-header') : null;
    if(folderHeader){
      var fKey = folderHeader.getAttribute('data-folder');
      _armoireCollapsedFolders.block[fKey] = !_armoireCollapsedFolders.block[fKey];
      _armoireRenderBlocksList();
      return;
    }
    var row = e.target.closest ? e.target.closest('.armoire-list-row') : null;
    if(!row) return;
    var id = row.getAttribute('data-id');
    var block = _armoireBlocks.find(function(b){ return b.id === id; });
    if(!block) return;
    if(e.target.closest('.armoire-block-insert')){
      // Retour utilisateur : "Insérer" un bloc fusionne exactement comme
      // "Ajouter" une configuration (même confirmation ci-dessous) — testé
      // exprès, même souci de fusion silencieuse. Un bloc étant pensé comme
      // un kit réutilisable, on demande EN PLUS combien d'exemplaires
      // ajouter (multiplie chaque quantité du bloc) plutôt que de forcer à
      // cliquer "Insérer" N fois de suite pour N kits identiques.
      var qtyStr = await customPrompt('Ajouter « ' + block.name + ' »', 'Combien d\'exemplaires de ce bloc voulez-vous ajouter ?', '1');
      if(qtyStr === null) return; // annulé
      var qtyTrimmed = qtyStr.trim();
      if(!/^\d+$/.test(qtyTrimmed) || parseInt(qtyTrimmed, 10) < 1){
        if(typeof showToast === 'function') showToast('Quantité invalide — entrez un nombre entier positif', 'err', 3500);
        return;
      }
      var multiplier = parseInt(qtyTrimmed, 10);
      var scaledItems = block.items.map(function(it){ return { ref: it.ref, qty: (it.qty || 1) * multiplier }; });
      if(_armoireDraft.length && !(await customConfirm(
        'Ajouter « ' + escapeHtml(block.name) + ' » ?',
        'Les ' + scaledItems.length + ' référence' + (scaledItems.length > 1 ? 's' : '') + ' de « ' + escapeHtml(block.name) + ' »' + (multiplier > 1 ? ' (×' + multiplier + ')' : '') + ' seront ajoutées à votre configuration en cours (' + _armoireDraft.length + ' référence' + (_armoireDraft.length > 1 ? 's' : '') + ' actuellement). Les quantités des références déjà présentes seront cumulées.',
        { okLabel: 'Ajouter' }
      ))) return;
      _armoireMergeItems(scaledItems);
      if(typeof showToast === 'function') showToast('« ' + block.name + ' » ajouté' + (multiplier > 1 ? ' (×' + multiplier + ')' : '') + ' à la configuration en cours ✓', 'ok', 2000);
    }
    else if(e.target.closest('.armoire-block-del')) _armoireDeleteBlock(id);
    else if(e.target.closest('.armoire-block-info')) _armoireShowEntryDetails(block);
    else if(e.target.closest('.armoire-block-edit')) _armoireStartEditEntry(block, 'block');
  });

  var savedListEl = document.getElementById('armoireConfigSavedList');
  if(savedListEl) savedListEl.addEventListener('click', async function(e){
    var folderHeaderCfg = e.target.closest ? e.target.closest('.armoire-folder-header') : null;
    if(folderHeaderCfg){
      var fKeyCfg = folderHeaderCfg.getAttribute('data-folder');
      _armoireCollapsedFolders.config[fKeyCfg] = !_armoireCollapsedFolders.config[fKeyCfg];
      _armoireRenderSavedList();
      return;
    }
    var row = e.target.closest ? e.target.closest('.armoire-list-row') : null;
    if(!row) return;
    var id = row.getAttribute('data-id');
    var config = _armoireSavedConfigs.find(function(c){ return c.id === id; });
    if(!config) return;
    if(e.target.closest('.armoire-config-insert')){
      // Retour utilisateur : "ajouter une fenêtre de confirmation lorsqu'on
      // souhaite ajouter une configuration à notre configuration en cours"
      // — contrairement à "Charger" (_armoireLoadSavedConfig), qui REMPLACE
      // et demandait déjà confirmation, "Ajouter" fusionne silencieusement
      // (les quantités des références déjà présentes sont cumulées, voir
      // _armoireAddToDraft) sans qu'on l'ait forcément voulu. Même
      // convention que "Remplacer" : pas de confirmation si la config en
      // cours est encore vide (rien à perturber).
      if(_armoireDraft.length && !(await customConfirm(
        'Ajouter « ' + escapeHtml(config.name) + ' » ?',
        'Les ' + config.items.length + ' référence' + (config.items.length > 1 ? 's' : '') + ' de « ' + escapeHtml(config.name) + ' » seront ajoutées à votre configuration en cours (' + _armoireDraft.length + ' référence' + (_armoireDraft.length > 1 ? 's' : '') + ' actuellement). Les quantités des références déjà présentes seront cumulées.',
        { okLabel: 'Ajouter' }
      ))) return;
      _armoireMergeItems(config.items);
      if(typeof showToast === 'function') showToast('« ' + config.name + ' » ajoutée à la configuration en cours ✓', 'ok', 2000);
    }
    else if(e.target.closest('.armoire-config-load')) _armoireLoadSavedConfig(config);
    else if(e.target.closest('.armoire-config-del')) _armoireDeleteSavedConfig(id);
    else if(e.target.closest('.armoire-config-info')) _armoireShowEntryDetails(config);
    else if(e.target.closest('.armoire-config-edit')) _armoireStartEditEntry(config, 'config');
  });

  var editingCancelBtn = document.getElementById('armoireEditingCancelBtn');
  if(editingCancelBtn) editingCancelBtn.addEventListener('click', _armoireCancelEditEntry);
})();
