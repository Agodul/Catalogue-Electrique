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
var _armoireCollapsedFolders = { block: {}, config: {}, order: {} };
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

