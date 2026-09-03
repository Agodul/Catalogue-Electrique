"use strict";

// ══════════════════════════════════════════════════════════════════════════
//  AUTH.JS — Authentification serveur JWT
//  Catalogue Électrique — SPI Engineering
// ══════════════════════════════════════════════════════════════════════════

var AUTH_SESSION_KEY = "cat_auth_user";   // localStorage : { token, user }
var AUTH_SERVER_KEY  = "cat_server_url";  // localStorage : URL serveur

// ── Helpers session ──────────────────────────────────────────────────────
// localStorage (pas sessionStorage) : sur mobile, l'OS termine souvent le
// processus de la PWA en arrière-plan pour libérer de la mémoire, ce qui
// vide sessionStorage et forçait une reconnexion à chaque réouverture.

function _authGetSession() {
  try {
    var raw = localStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

// Retourne l'objet user (pas la session complète)
function authGetCurrentUser() {
  var s = _authGetSession();
  if (!s) return null;
  return s.user || s; // compatibilité session locale et JWT
}

function authIsLoggedIn() {
  return _authGetSession() !== null;
}

function authGetToken() {
  var s = _authGetSession();
  return s ? (s.token || null) : null;
}

function authSetSession(token, user) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ token: token, user: user }));
}

function authClearUser() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}


// Longueur minimale d'un mot de passe. UNE seule constante, appliquée aux
// trois endroits qui en saisissent un (création par un admin, modification
// d'un compte par un admin, changement par l'utilisateur lui-même) : la
// création n'exigeait qu'un champ non vide, là où le changement imposait déjà
// 6 caractères. Un admin pouvait donc créer un compte avec un mot de passe
// d'un seul caractère, que son titulaire ne pouvait ensuite plus jamais
// reproduire lui-même. Porté à 8, le plancher courant aujourd'hui.
// ⚠ Contrôle de confort côté navigateur : il évite une saisie manifestement
// trop faible, il ne remplace pas la même règle côté serveur, qui est la
// seule à s'appliquer à une requête forgée.
var AUTH_PASSWORD_MIN = 8;

function _defaultPermissions(isAdmin) {
  return {
    canEdit:        !!isAdmin,
    canDelete:      !!isAdmin,
    canManageUsers: !!isAdmin,
    canViewDocs:    true,
    canUploadDocs:  !!isAdmin,
    canExport:      !!isAdmin
    // canSyncServer retiré (retour utilisateur : trop risqué comme
    // permission granulaire configurable côté serveur — un dev/admin peut
    // se tromper et l'activer pour tout le monde, comme constaté en vrai.
    // "Charger depuis le serveur"/"Envoyer le catalogue local au serveur"
    // écrasent respectivement TOUT products[] local ou TOUT le catalogue
    // serveur (upsert complet, voir pushCatalogToServer) — un mauvais
    // moment pour ça (copie locale périmée) écrase silencieusement le
    // travail de quelqu'un d'autre. applyAuthUI() n'utilise donc plus
    // cette clé du tout, quoi que le serveur renvoie dans
    // user.permissions — ces deux boutons sont désormais strictement
    // admin, au même titre que serverAdminBackupSection juste à côté qui
    // l'était déjà pour la même raison).
  };
}

// ── Authentification serveur ─────────────────────────────────────────────

async function authLoginServer(username, password) {
  var sUrl = localStorage.getItem(AUTH_SERVER_KEY);
  if (!sUrl) return null;
  try {
    var r = await fetch(sUrl + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    if (!r.ok) return null;
    var data = await r.json();
    if (data && data.token && data.user) {
      authSetSession(data.token, Object.assign({ permissions: _defaultPermissions(data.user.isAdmin) }, data.user));
      return data.user;
    }
    return null;
  } catch(e) {
    console.warn('authLoginServer:', e.message);
    return null;
  }
}

async function authLogoutServer() {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (sUrl && token) {
    try {
      await fetch(sUrl + '/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } catch(e) {}
  }
}

// ── Déconnexion automatique si le serveur ne reconnaît plus la session, ou
// n'est plus joignable (retour utilisateur : ne pas laisser l'app croire
// l'utilisateur connecté dans ces deux cas). Centralisé ici pour être
// appelé aussi bien depuis authRefreshMe() (sondage périodique) que depuis
// l'intercepteur fetch() global ci-dessous (réaction immédiate dès qu'une
// requête authentifiée quelconque essuie un 401, sans attendre le prochain
// sondage). Le flag évite le spam de toasts si plusieurs requêtes en 401
// arrivent en parallèle.
var _authForceLogoutInProgress = false;

// Ferme les fenêtres qui nécessitent d'être connecté et qui pouvaient déjà
// être ouvertes AVANT la déconnexion (forcée ou manuelle) — applyAuthUI()
// ne fait que cacher/griser des boutons pour un prochain affichage, il ne
// referme jamais une fenêtre déjà ouverte à l'écran. Sans ça, un formulaire
// produit ouvert avant la coupure restait pleinement utilisable (champs
// actifs, bouton Enregistrer cliquable) tant que la page n'était pas
// rechargée — l'utilisateur pouvait continuer à modifier/enregistrer alors
// qu'il n'était plus authentifié (retour utilisateur : "je pouvais encore
// faire des modifications... même des trucs pas dispo sans connexion").
function _authCloseSensitiveUI() {
  var modalOverlay = document.getElementById('modalOverlay');
  if (modalOverlay && modalOverlay.classList.contains('open')) {
    if (typeof closeModal === 'function') closeModal();
    else modalOverlay.classList.remove('open');
  }
  if (typeof window._closeSettingsOverlay === 'function') window._closeSettingsOverlay();
  if (typeof _armoireClose === 'function') _armoireClose();
  if (typeof reqClosePanel === 'function') reqClosePanel();
  // Caractéristiques techniques / Parcourir le catalogue : peuvent rester
  // ouvertes PAR-DESSUS le formulaire produit (fenêtres imbriquées) — fermer
  // le formulaire ci-dessus ne les referme pas automatiquement, elles sont
  // restées éditables (retour utilisateur, même préoccupation que pour le
  // formulaire principal).
  if (typeof window._specsCloseModal === 'function') window._specsCloseModal();
  if (typeof window._sugPickerClose === 'function') window._sugPickerClose();
  var compareOverlay = document.getElementById('compareOverlay');
  if (compareOverlay) {
    if (typeof window._closeOverlayAnimated === 'function') {
      window._closeOverlayAnimated(compareOverlay, function(){ compareOverlay.classList.remove('show'); });
    } else {
      compareOverlay.classList.remove('show');
    }
  }
  document.body.classList.remove('modal-open');
}

// Clé sessionStorage : fait traverser le message ("Déconnecté", "Session
// expirée…") par-dessus le rechargement instantané ci-dessous — sans ça, un
// rechargement à 0ms ne laisse jamais le temps au toast de s'afficher, donc
// plus moyen de savoir POURQUOI on vient d'être déconnecté (utile surtout
// pour une déconnexion forcée). Ré-affiché juste après le rechargement, voir
// initAuth() plus bas.
var AUTH_POST_RELOAD_TOAST_KEY = 'cat_post_reload_toast';

// Recharge la page après une déconnexion (forcée ou manuelle) — repart d'un
// état JS totalement vierge plutôt que de compter sur chaque fenêtre/chaque
// variable d'état pour se remettre elle-même à jour correctement. Instantané
// (retour utilisateur) : aucun délai avant le rechargement.
// PAS location.reload() : même bug déjà rencontré (et corrigé) pour la
// bannière de mise à jour du service worker (voir js/pwa.js) — sur une PWA
// en mode standalone (ajoutée à l'écran d'accueil, notamment iOS),
// location.reload() peut laisser l'app figée/blanche, obligeant à la fermer
// complètement puis la rouvrir. Même remède ici : location.replace() vers
// l'URL courante + un paramètre de requête inédit pour forcer une
// navigation non ambiguë (une URL rigoureusement identique est traitée
// comme un no-op silencieux par plusieurs navigateurs), sans empiler
// d'entrée d'historique.
function _authReloadAfterLogout(reason) {
  try { if (reason) sessionStorage.setItem(AUTH_POST_RELOAD_TOAST_KEY, reason); } catch(e) {}
  // URLSearchParams.set() REMPLACE une éventuelle valeur déjà présente
  // (plutôt qu'une concaténation manuelle) — sans ça, chaque déconnexion
  // ajoutait un nouveau "_authreload=…" à la suite des précédents au lieu
  // de le remplacer, et l'URL grossissait indéfiniment à chaque
  // déconnexion/reconnexion (retour utilisateur).
  var params = new URLSearchParams(window.location.search);
  params.set('_authreload', Date.now());
  window.location.replace(
    window.location.pathname + '?' + params.toString() + window.location.hash
  );
}

function _authForceLogout(reason) {
  if (!authIsLoggedIn() || _authForceLogoutInProgress) return;
  _authForceLogoutInProgress = true;
  authClearUser();
  applyAuthUI();
  _authCloseSensitiveUI();
  if (typeof window._reqStopPolling === 'function') window._reqStopPolling();
  // Rechargement instantané : le toast ne peut plus s'afficher avant (voir
  // _authReloadAfterLogout) — il traverse le rechargement via sessionStorage
  // et se ré-affiche juste après, plutôt que d'être posé ici pour rien.
  _authReloadAfterLogout(reason);
  setTimeout(function(){ _authForceLogoutInProgress = false; }, 2000);
}

// Nombre d'échecs réseau consécutifs (serveur injoignable, pas une simple
// réponse d'erreur) avant de considérer l'utilisateur déconnecté — évite de
// délogger sur un simple accroc réseau ponctuel (bascule wifi/4G...), tout
// en réagissant sans attendre indéfiniment si le serveur reste injoignable.
var _authUnreachableCount = 0;
var AUTH_UNREACHABLE_THRESHOLD = 2;

async function authRefreshMe() {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (!sUrl || !token) return false;
  try {
    var r = await fetch(sUrl + '/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) {
      _authUnreachableCount = 0; // le serveur a répondu : il est joignable
      if (r.status === 401) {
        // Token explicitement rejeté (expiré, révoqué, compte supprimé...)
        _authForceLogout('Session expirée — veuillez vous reconnecter');
      }
      // Autres codes (403, 5xx...) : erreur ponctuelle, pas forcément liée
      // à la session — ne pas déconnecter sur la seule foi de ce statut.
      return false;
    }
    _authUnreachableCount = 0;
    var user = await r.json();
    authSetSession(token, Object.assign({ permissions: _defaultPermissions(user.isAdmin) }, user));
    return true;
  } catch(e) {
    // Échec réseau (pas de réponse du tout) : serveur injoignable.
    _authUnreachableCount++;
    if (_authUnreachableCount >= AUTH_UNREACHABLE_THRESHOLD) {
      _authForceLogout('Serveur injoignable — déconnexion automatique');
    }
    return false;
  }
}

// Intercepte fetch() globalement : toute réponse 401 provenant du serveur
// configuré, pendant qu'une session est active, signifie que ce serveur ne
// reconnaît plus le token (compte supprimé, mot de passe changé ailleurs,
// sessions perdues après redémarrage serveur...) — déconnexion immédiate au
// lieu d'attendre le prochain sondage périodique. Volontairement limité au
// 401 (non-authentifié) et pas au 403 (authentifié mais action refusée pour
// raison de permission — ne doit jamais déclencher une déconnexion).
(function _installAuthFetchGuard(){
  var _origFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    return _origFetch(input, init).then(function(res){
      try {
        var sUrl = localStorage.getItem(AUTH_SERVER_KEY);
        var urlStr = typeof input === 'string' ? input : (input && input.url) || '';
        if (sUrl && res.status === 401 && urlStr.indexOf(sUrl) === 0 && authIsLoggedIn()) {
          _authForceLogout('Session expirée — veuillez vous reconnecter');
        }
      } catch(e) {}
      return res;
    });
  };
})();

// Sondage périodique : toutes les 3 min (au lieu de 30 min) — sert à la fois
// à rafraîchir le token ET à détecter une perte de connexion serveur assez
// tôt, sans attendre qu'une action utilisateur déclenche une requête.
setInterval(function() {
  if (authIsLoggedIn() && authGetToken()) authRefreshMe();
}, 3 * 60 * 1000);

// Revérifier immédiatement au retour au premier plan (PWA rouverte après
// avoir été mise en arrière-plan un moment) plutôt que d'attendre jusqu'à
// 3 min — la session a pu devenir invalide ou le serveur injoignable
// pendant l'absence.
document.addEventListener('visibilitychange', function(){
  if (document.visibilityState === 'visible' && authIsLoggedIn() && authGetToken()) {
    authRefreshMe();
  }
});

// ── Login principal (serveur d'abord, fallback local) ────────────────────

async function authLogin(username, password) {
  var sUrl = localStorage.getItem(AUTH_SERVER_KEY);

  // 1. Essayer le serveur si configuré
  if (sUrl) {
    var serverUser = await authLoginServer(username, password);
    if (serverUser) {
      closeAuthModal();
      applyAuthUI();
      showAuthToast('Connecté en tant que ' + (serverUser.displayName || username));
      // Rafraîchir le rendu pour appliquer les permissions
      if (typeof render === 'function') render();
      if (typeof renderHome === 'function') renderHome();
      if (typeof showHome === 'function') showHome();
      document.dispatchEvent(new CustomEvent('spi_auth_changed'));
      if (typeof window._pdfPreloadLib === 'function') window._pdfPreloadLib();
      // Démarrer le polling demandes si admin (garde déjà l'admin/serveur en
      // interne — ne fait plus qu'autoriser les notifications navigateur,
      // voir requests.js : le premier /checkReq+/checkBugs immédiat qu'elle
      // déclenchait ici a été retiré, doublon avec doCheckAllSync juste en
      // dessous).
      if (typeof window._reqStartPolling === 'function') window._reqStartPolling();
      // Un SEUL /checkAll à la connexion (au lieu de deux appels
      // systématiques en parallèle : /checkReq+/checkBugs immédiats via
      // _reqStartPolling ci-dessus, ET /pullDatas à +300ms via
      // syncFromServer — aucun des deux ne regardait si quoi que ce soit
      // avait réellement changé). C'est /checkAll lui-même (doCheckAllSync,
      // js/actions-settings-sync.js) qui décide ENSUITE, collection par
      // collection (revision/count/changedAt comparés au dernier état
      // local connu), lesquels de ces appels sont réellement nécessaires :
      // pullDatas+syncDeletions si le catalogue a changé, configBlocks/
      // savedConfigs si l'armoire a changé, checkReq+checkBugs (via
      // window._reqUpdateBadge, qui se neutralise déjà seul si
      // non-admin) si les demandes/bugs ont changé. Rien de perdu à la
      // toute première connexion : hasChanged() traite l'absence de
      // référence locale comme "a changé", donc tout est rattrapé quand
      // même — retour utilisateur : "à la connexion faut uniquement faire
      // un checkAll puis après selon les permissions faire les appels
      // dont la revision a changé". Même principe déjà en place pour une
      // session restaurée au chargement de la page (loadServerConfig,
      // js/actions-settings-sync.js), auquel cette connexion interactive
      // s'aligne maintenant.
      if (typeof startSyncPolling === 'function' && sUrl) startSyncPolling();
      if (typeof doCheckAllSync === 'function') doCheckAllSync();
      return true;
    }
  }

    return false;
}

// ── Logout ───────────────────────────────────────────────────────────────

function authLogout() {
  authLogoutServer(); // async, non bloquant
  authClearUser();
  _authCloseSensitiveUI();
  if (typeof window._reqStopPolling === 'function') window._reqStopPolling();
  // Rechargement instantané : le toast traverse le rechargement via
  // sessionStorage (voir _authReloadAfterLogout) plutôt que d'être affiché
  // ici pour rien.
  _authReloadAfterLogout('Déconnecté');
}

// ── Gestion utilisateurs serveur ─────────────────────────────────────────

async function authFetchUsers() {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (!sUrl || !token) return null;
  try {
    var r = await fetch(sUrl + '/users', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

async function authCreateUser(userData) {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (!sUrl || !token) return false;
  try {
    var r = await fetch(sUrl + '/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(userData)
    });
    return r.ok;
  } catch(e) { return false; }
}

// Changement de son PROPRE mot de passe.
//
// Le constat, et ce qu'il change : cette action passait par authUpdateUser(),
// donc par PUT /users/<username> — la route d'ADMINISTRATION des comptes, la
// même que celle qui sert à cocher « administrateur » ou à modifier les
// permissions de quelqu'un. Si le serveur autorise un compte à s'éditer
// lui-même sans filtrer les champs reçus, alors cette route accepte aussi
// isAdmin et permissions : n'importe quel utilisateur peut se promouvoir
// administrateur avec une requête forgée.
//
// Cette fonction ferme le chemin ACCIDENTEL : le corps envoyé ne peut
// contenir que { password }, construit ici et jamais fusionné avec un objet
// venant de l'appelant. Le formulaire ne peut donc plus transporter autre
// chose par inadvertance, aujourd'hui ou après une refonte.
//
// ⚠ Elle ne ferme PAS le chemin DÉLIBÉRÉ : la route reste ouverte côté
// serveur, et une requête forgée à la main ne passe pas par ce code. Le
// correctif complet appartient au serveur, qui n'est pas dans ce dépôt :
//   • soit exposer un POST /me/password (ancien + nouveau mot de passe), et
//     réserver PUT /users/<username> aux seuls administrateurs ;
//   • soit, sur PUT /users/<username>, n'accepter d'un compte agissant sur
//     lui-même qu'une liste blanche de champs — password, displayName — et
//     ignorer isAdmin comme permissions.
// Tant que l'un des deux n'est pas fait, la vulnérabilité reste ouverte.
async function authChangeOwnPassword(username, newPassword) {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (!sUrl || !token || !username || !newPassword) return false;
  try {
    var r = await fetch(sUrl + '/users/' + encodeURIComponent(username), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      // Littéral construit sur place : aucun autre champ ne peut s'y glisser.
      body: JSON.stringify({ password: String(newPassword) })
    });
    return r.ok;
  } catch(e) { return false; }
}

// Route d'administration des comptes : réservée aux écrans d'administration
// (créer, modifier, supprimer un utilisateur). Pour changer SON PROPRE mot de
// passe, passer par authChangeOwnPassword() ci-dessus, jamais par ici.
async function authUpdateUser(username, data) {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (!sUrl || !token) return false;
  try {
    var r = await fetch(sUrl + '/users/' + encodeURIComponent(username), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(data)
    });
    return r.ok;
  } catch(e) { return false; }
}

async function authDeleteUser(username) {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (!sUrl || !token) return false;
  try {
    var r = await fetch(sUrl + '/users/' + encodeURIComponent(username), {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    return r.ok;
  } catch(e) { return false; }
}

// ── Header Authorization pour toutes les requêtes serveur ────────────────

function authHeaders() {
  var token = authGetToken();
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

// Exposer globalement pour actions.js
window.authHeaders = authHeaders;

// ── UI Auth ──────────────────────────────────────────────────────────────

function applyAuthUI() {
  var loggedIn = authIsLoggedIn();
  var user     = authGetCurrentUser();
  var isAdmin  = user && user.isAdmin;

  // Bouton Utilisateurs : visible admin uniquement
  var btnUsers = document.getElementById('btnOpenUserSettings');
  if (btnUsers) btnUsers.style.display = isAdmin ? 'flex' : 'none';

  // Bouton Nettoyer descriptions : visible admin uniquement
  var btnClean = document.getElementById('btnCleanDescs');
  if (btnClean) btnClean.style.display = isAdmin ? '' : 'none';

  // Bouton Mon compte : visible pour les non-admins connectés
  var btnMyAccount2 = document.getElementById('btnOpenMyAccount');
  if (btnMyAccount2) btnMyAccount2.style.display = (loggedIn && !isAdmin) ? 'flex' : 'none';

  // Boutons dans l'en-tête de la page utilisateurs (admin uniquement)
  var btnAdminPw = document.getElementById('btnAdminChangePassword');
  var btnAddUserOpenBtn = document.getElementById('btnAddUserOpen');
  var sUrlPw2 = localStorage.getItem(AUTH_SERVER_KEY);
  if (btnAdminPw) btnAdminPw.style.display = (isAdmin && sUrlPw2) ? 'flex' : 'none';
  if (btnAddUserOpenBtn) btnAddUserOpenBtn.style.display = (isAdmin && sUrlPw2) ? 'flex' : 'none';


  var btnFamilyIcons = document.getElementById('btnOpenFamilyIcons');
  if (btnFamilyIcons) btnFamilyIcons.style.display = isAdmin ? 'flex' : 'none';

  // Bouton Fiches verrouillées : visible admin uniquement (voir
  // showSettingsLockedPage dans js/actions-settings-nav.js et
  // _adminForceUnlockProduct dans js/actions-editlock.js).
  var btnLockedProducts = document.getElementById('btnOpenLockedProducts');
  if (btnLockedProducts) btnLockedProducts.style.display = isAdmin ? 'flex' : 'none';

  // Sous-titre du menu "Paramètres" adapté à ce que CET utilisateur y voit
  // réellement — "Icônes des familles" n'est visible que pour un admin
  // (juste au-dessus) ; un non-admin n'y trouve que "Mon compte" et le
  // serveur (retour utilisateur : le sous-titre restait figé, pas à jour
  // avec les permissions, contrairement aux autres déjà corrigés).
  var btnSettingsSub = document.getElementById('btnSettingsSub');
  if (btnSettingsSub) btnSettingsSub.textContent = isAdmin ? 'Icônes des familles, Serveur' : 'Mon compte, Serveur';

  // Sync serveur manuelle ("Charger depuis le serveur"/"Envoyer le catalogue
  // local au serveur") — strictement admin, PAS de permission granulaire
  // configurable ici (retour utilisateur : un dev/admin peut se tromper et
  // l'activer pour tout le monde côté serveur — ces deux boutons écrasent
  // respectivement tout products[] local ou tout le catalogue serveur, un
  // risque trop élevé pour dépendre d'un simple flag serveur). Même
  // traitement que serverAdminBackupSection juste en dessous.
  var serverButtonsSection = document.getElementById('serverButtonsSection');
  if (serverButtonsSection) serverButtonsSection.style.display = isAdmin ? '' : 'none';

  // Récupérer les permissions granulaires
  var perms = (user && user.permissions) || {};
  var canEdit        = isAdmin || !!perms.canEdit;
  var canDelete      = isAdmin || !!perms.canDelete;
  var canViewDocs    = isAdmin || !!perms.canViewDocs;
  var canUploadDocs  = isAdmin || !!perms.canUploadDocs;
  var canExport      = isAdmin || !!perms.canExport;

  // Mode lecture seule
  document.body.classList.toggle('auth-readonly', !loggedIn);

  // Bouton ajouter produit
  var btnAdd = document.getElementById('btnAdd');
  if (btnAdd) btnAdd.style.display = canEdit ? '' : 'none';

  var btnFabAdd = document.getElementById('btnFabAdd');
  if (btnFabAdd) btnFabAdd.style.display = canEdit ? '' : 'none';

  // Bouton "Configurateur d'armoire" (accueil) — tout utilisateur connecté
  var btnOpenArmoireConfig = document.getElementById('btnOpenArmoireConfig');
  if (btnOpenArmoireConfig) btnOpenArmoireConfig.style.display = loggedIn ? '' : 'none';
  // Même accès, mais permanent (pas seulement l'accueil) — bulle flottante
  // au-dessus de "Ajouter un produit" plutôt qu'une entrée de menu (retour
  // utilisateur : "je ne veux pas le bouton configurateur dans le menu mais
  // juste au dessus du petit plus", voir .fab-stack dans index.html).
  var btnFabArmoireConfig = document.getElementById('btnFabArmoireConfig');
  if (btnFabArmoireConfig) btnFabArmoireConfig.style.display = loggedIn ? '' : 'none';

  // Boutons "Proposer" : visibles si connecté + serveur + pas de permission canEdit
  var _sUrlReq   = localStorage.getItem('cat_server_url') || '';
  var canPropose = loggedIn && !canEdit && !!_sUrlReq;

  // Bouton ⓘ — visible si canEdit/canDelete (Modifier/Supprimer dans le
  // menu) OU canPropose (Proposer une modification y prend alors la place
  // de Modifier — voir vmProposeMenuBtn plus bas, retour utilisateur : "le
  // bouton proposer modification prenne la place de modifier lorsque le
  // user n'a pas la permission").
  var vmInfoBtn = document.getElementById('vmInfoBtn');
  var showInfo  = isAdmin || (loggedIn && (!!perms.canEdit || !!perms.canDelete || canPropose));
  if (vmInfoBtn) vmInfoBtn.style.display = showInfo ? '' : 'none';

  // Bouton "Proposer un produit" dans le header (remplacement de btnAdd)
  var btnPropose = document.getElementById('btnProposeProduct');
  if (btnPropose) btnPropose.style.display = canPropose ? '' : 'none';

  // Bouton FAB "proposer" (remplacement de btnFabAdd)
  var btnFabPropose = document.getElementById('btnFabPropose');
  if (btnFabPropose) btnFabPropose.style.display = canPropose ? '' : 'none';

  // Bouton "Signaler un bug" : visible pour TOUT utilisateur connecté (avec
  // serveur configuré), contrairement à "Proposer un produit" — un bug peut
  // être trouvé par n'importe qui, pas seulement les comptes sans droit
  // d'édition. Réactivé : le backend dédié aux bugs (checkBugs/pushBugs/
  // pullBugs/deleteBugs + BugsFiles) est en place côté serveur — voir
  // mémoire "bug-report-api-migration" et js/requests.js (reqSubmitBug
  // etc.), migrés hors de l'ancienne API des demandes produit.
  var btnReportBug = document.getElementById('btnReportBug');
  if (btnReportBug) btnReportBug.style.display = (loggedIn && !!_sUrlReq) ? '' : 'none';

  // Champs suggestions / pièces de rechange : visibles uniquement pour
  // canEdit/admin — la 2e ligne manquait à l'ajout de "Pièces de rechange"
  // (calqué sur Suggestions mais cette permission n'avait pas été reportée),
  // laissant ce champ visible pour tout le monde alors que Suggestions
  // restait masqué pour les comptes sans droit d'édition : incohérence
  // repérée en revoyant l'agencement de la fenêtre.
  var fSuggestionsRow = document.getElementById('fSuggestionsRow');
  if(fSuggestionsRow) fSuggestionsRow.style.display = canEdit ? '' : 'none';
  var fSparePartsRow = document.getElementById('fSparePartsRow');
  if(fSparePartsRow) fSparePartsRow.style.display = canEdit ? '' : 'none';

  // "Proposer une modification" sur la fiche produit — DANS le menu ⓘ, à la
  // place de "Modifier la fiche" (jamais les deux en même temps : canPropose
  // implique !canEdit) — remplace l'ancien bouton circulaire séparé
  // #vmProposeBtn à côté du ⓘ (retour utilisateur : le rendait redondant/
  // confus une fois les deux boutons visibles ensemble pour un compte
  // canDelete-sans-canEdit).
  var vmProposeMenuBtn = document.getElementById('vmProposeMenuBtn');
  if (vmProposeMenuBtn) vmProposeMenuBtn.style.display = canPropose ? '' : 'none';

  // Export/Import JSON — admin uniquement
  ['btnExport','btnImport'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.style.display = isAdmin ? '' : 'none';
  });
  // Export Excel — si permission canExport
  var btnExportXlsxEl = document.getElementById('btnExportXlsx');
  if(btnExportXlsxEl) btnExportXlsxEl.style.display = canExport ? '' : 'none';
  // Import Excel — si permission canExport (édition directe) OU droit de
  // proposer (l'import passe alors par le circuit de demandes — jamais
  // d'écriture directe au catalogue pour ces utilisateurs).
  var btnImportXlsxEl = document.getElementById('btnImportXlsx');
  if(btnImportXlsxEl) btnImportXlsxEl.style.display = (canExport || canPropose) ? '' : 'none';
  // Sous-titre adapté à la conséquence réelle pour CET utilisateur (retour
  // utilisateur : le texte doit correspondre à la permission) — l'import
  // écrit directement le catalogue pour canExport, mais passe par une
  // demande à valider par un admin pour un simple "proposeur".
  var btnImportXlsxSub = document.getElementById('btnImportXlsxSub');
  if(btnImportXlsxSub) btnImportXlsxSub.textContent = canExport ? 'Mise à jour des prix' : 'Propose une mise à jour (validation admin)';
  // Cacher les titres de rubrique ("Données"/"Outils") et leur séparateur
  // quand TOUS les boutons qu'ils annoncent sont masqués — sans ça un titre
  // pouvait rester affiché seul, sans aucun bouton dessous (retour
  // utilisateur, capture à l'appui : "DONNÉES" visible alors que ni
  // Export/Import JSON ni Export/Import Excel n'étaient autorisés pour cet
  // utilisateur). Même logique que updateMenuAuth() dans
  // js/actions-mobile-chrome.js (tiroir menu mobile), qui gérait déjà
  // correctement ce cas — celui-ci manquait côté menu ⋮ desktop.
  function _hdrAllHidden(ids){
    return ids.every(function(id){
      var el = document.getElementById(id);
      return !el || el.style.display === 'none';
    });
  }
  var _hdrDataIds = ['btnExport','btnImport','btnExportXlsx','btnImportXlsx'];
  var _hdrToolIds = ['btnCompare','btnCleanDescs'];
  var _hdrTitles  = document.querySelectorAll('#hdrMenu .hdr-menu-section-title');
  var _hdrSeps    = document.querySelectorAll('#hdrMenu .hdr-menu-sep');
  if(_hdrTitles[0]) _hdrTitles[0].style.display = _hdrAllHidden(_hdrDataIds) ? 'none' : '';
  if(_hdrTitles[1]) _hdrTitles[1].style.display = _hdrAllHidden(_hdrToolIds) ? 'none' : '';
  if(_hdrSeps[0]) _hdrSeps[0].style.display = _hdrAllHidden(_hdrDataIds) ? 'none' : '';
  if(_hdrSeps[1]) _hdrSeps[1].style.display = _hdrAllHidden(_hdrToolIds) ? 'none' : '';

  // Sauvegarde/restauration serveur — admin uniquement, comme
  // serverButtonsSection plus haut désormais.
  var serverAdminBackupSection = document.getElementById('serverAdminBackupSection');
  if (serverAdminBackupSection) serverAdminBackupSection.style.display = isAdmin ? '' : 'none';

  // Exposer les permissions pour les autres modules
  window._userPerms = {
    canEdit, canDelete, canViewDocs, canUploadDocs, canExport, isAdmin, loggedIn, canPropose
  };

  updateAuthHeaderBtn(loggedIn, user);

  // Bouton demandes dans le menu hamburger
  var _btnReqMenu = document.getElementById('btnRequestsMenu');
  var _reqMenuSep = document.getElementById('reqMenuSep');
  var _sUrl       = localStorage.getItem('cat_server_url') || '';
  var _showReq    = loggedIn && !!_sUrl;
  if(_btnReqMenu) _btnReqMenu.style.display = _showReq ? '' : 'none';
  if(_reqMenuSep) _reqMenuSep.style.display = _showReq ? '' : 'none';
  // Sous-titre : les admins y traitent les demandes REÇUES des autres
  // utilisateurs, un simple utilisateur n'y voit que le suivi des SIENNES
  // (voir reqRefreshPanel() dans js/requests.js, qui bascule déjà le
  // contenu du panneau lui-même de la même façon).
  var _btnReqMenuSub = document.getElementById('btnRequestsMenuSub');
  if(_btnReqMenuSub) _btnReqMenuSub.textContent = isAdmin ? 'Modifications proposées' : 'Suivi de vos demandes';
  if(!loggedIn){
    var _badge     = document.getElementById('requestsBadge');
    var _badgeMenu = document.getElementById('requestsBadgeMenu');
    if(_badge)     { _badge.style.display = 'none'; _badge.textContent = ''; }
    if(_badgeMenu) { _badgeMenu.style.display = 'none'; _badgeMenu.textContent = ''; }
  }

  // Rafraîchir la page utilisateurs si ouverte (admin uniquement)
  if (isAdmin && typeof renderUserPage === 'function') renderUserPage();

  // ── Nettoyage des séparateurs orphelins du menu ⋮ ──────────────────
  // Un .hdr-menu-sep sans AUCUN item visible juste avant OU juste après lui
  // (boutons masqués par manque de permission / déconnexion) laissait un
  // fin liseré gris sous le coin arrondi du menu — quelques px à peine en
  // isolation, mais bien visible une fois arrondi par le border-radius du
  // menu (retour utilisateur, capture à l'appui : "zone grise" en haut du
  // menu quand peu d'items restent visibles, desktop). Recalculé en entier
  // à chaque appel (pas seulement masqué, aussi réaffiché si besoin) :
  // couvre toute combinaison de permissions sans avoir à lister chaque cas
  // à la main comme reqMenuSep le faisait pour le sien.
  document.querySelectorAll('#hdrMenu .hdr-menu-sep').forEach(function(sep){
    var hasVisiblePrev = false;
    for(var prev = sep.previousElementSibling; prev; prev = prev.previousElementSibling){
      if(getComputedStyle(prev).display !== 'none'){ hasVisiblePrev = true; break; }
    }
    var hasVisibleNext = false;
    for(var next = sep.nextElementSibling; next; next = next.nextElementSibling){
      if(getComputedStyle(next).display !== 'none'){ hasVisibleNext = true; break; }
    }
    sep.style.display = (hasVisiblePrev && hasVisibleNext) ? '' : 'none';
  });
}

function updateAuthHeaderBtn(loggedIn, user) {
  var btn = document.getElementById('btnAuthToggle');
  if (!btn) return;
  var nameEl = document.getElementById('hdrUsername');
  if (loggedIn) {
    btn.title = 'Connecté : ' + (user ? user.displayName : '');
    btn.innerHTML = '<i class="ti ti-logout" aria-hidden="true"></i>';
    if(nameEl){ nameEl.textContent = user ? (user.displayName || user.username || '') : ''; nameEl.style.display = ''; }
    btn.onclick = function() { authLogout(); };
  } else {
    btn.title = 'Se connecter';
    if(nameEl){ nameEl.textContent = ''; nameEl.style.display = 'none'; }
    btn.innerHTML = '<i class="ti ti-login" aria-hidden="true"></i>';
    btn.onclick = function() { openAuthModal(); };
  }
}

// ── Modale login ─────────────────────────────────────────────────────────

function openAuthModal() {
  var overlay = document.getElementById('authOverlay');
  if (overlay) {
    overlay.classList.add('show');
    document.body.classList.add('modal-open');
    setTimeout(function() {
      var inp = document.getElementById('authUsername');
      if (inp) inp.focus();
    }, 100);
  }
}

function closeAuthModal() {
  var overlay = document.getElementById('authOverlay');
  // Sur mobile, si la connexion a été ouverte DEPUIS le tiroir menu (voir
  // msAuth dans js/actions-mobile-chrome.js), la croix (ou une connexion réussie — les
  // deux passent par ici) doit "revenir" au menu plutôt que de retomber sur
  // la page du dessous — même principe que Paramètres/Demandes/Signaler un
  // bug/Comparateur.
  var reopenMenu = !!window._authOpenedFromMobileMenu;
  if (reopenMenu) window._authOpenedFromMobileMenu = false;
  if (typeof window._setHeaderBackMode === 'function') window._setHeaderBackMode('authCloseBtn', 'authBackBtn', false);
  function afterClose() {
    // Rouvrir le menu seulement une fois la modale réellement masquée,
    // sinon les deux fonds grisés se superposent un instant.
    if (reopenMenu && typeof window._openMenuSheet === 'function') window._openMenuSheet();
  }
  if (overlay) {
    document.body.classList.remove('modal-open');
    if (typeof window._closeOverlayAnimated === 'function') {
      window._closeOverlayAnimated(overlay, function(){ overlay.classList.remove('show'); afterClose(); });
    } else {
      overlay.classList.remove('show');
      afterClose();
    }
  } else {
    afterClose();
  }
  var errEl = document.getElementById('authError');
  if (errEl) errEl.textContent = '';
}

function showAuthToast(msg) {
  if (typeof showToast === 'function') showToast(msg, 'ok', 2500);
}

// ── Page utilisateurs ────────────────────────────────────────────────────

async function renderUserPage() {
  var container = document.getElementById('userList');
  if (!container) return;

  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();

  // Si serveur configuré → charger depuis le serveur
  if (sUrl && token) {
    var serverUsers = await authFetchUsers();
    if (serverUsers) {
      _renderUserList(container, serverUsers, true);
      return;
    }
  }

  // Pas de serveur → message
  container.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:12px 0;">Connectez-vous au serveur pour gérer les utilisateurs.</p>';
}

function _renderUserList(container, users, isServer) {
  var user    = authGetCurrentUser();
  var isAdmin = user && user.isAdmin;

  container.innerHTML = '';

  if (!isAdmin) {
    container.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;">Accès réservé à l\'administrateur.</p>';
    return;
  }

  var source = isServer
    ? '<span style="font-size:11px;color:#166534;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:4px;padding:2px 7px;margin-left:8px;"><i class="ti ti-world"></i> Serveur</span>'
    : '<span style="font-size:11px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:4px;padding:2px 7px;margin-left:8px;"><i class="ti ti-alert-triangle"></i> Local</span>';

  window._cachedUsers = users; // pour récupérer les permissions au clic Modifier
  // Fonction d'échappement XSS locale
  function _esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;margin-bottom:12px;';
  header.innerHTML = '<span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft);">Utilisateurs</span>' + source;
  container.appendChild(header);

  users.forEach(function(u) {
    var isSelf   = user && u.username === user.username;
    var isAdminU = u.isAdmin || u.username === 'admin';
    var perms    = u.permissions || {};  // Badges permissions
    var permBadges = '';
    if (isAdminU) {
      permBadges = '<span style="font-size:10px;background:#EEF4FF;color:#194093;border-radius:4px;padding:1px 6px;margin-right:3px;">Admin complet</span>';
    } else {
      var permList = [
        ['canEdit','Éditer'],['canDelete','Supprimer'],['canViewDocs','Docs'],
        ['canExport','Export']
      ];
      permList.forEach(function(p) {
        var active = !!perms[p[0]];
        permBadges += '<span style="font-size:10px;background:'+(active?'#F0FDF4':'#F9FAFB')+';color:'+(active?'#166534':'#94A3B8')+';border-radius:4px;padding:1px 6px;margin-right:3px;">'+p[1]+'</span>';
      });
    }

    var div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;margin-bottom:8px;background:var(--paper-card);';
    div.innerHTML = '<div style="width:34px;height:34px;border-radius:50%;background:'+(isAdminU?'#194093':'#e2e8f0')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + '<i class="ti '+(isAdminU?'ti-shield-check':'ti-user')+'" style="color:'+(isAdminU?'#fff':'#64748b')+';font-size:16px;"></i></div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:600;color:var(--ink);">' + _esc(u.displayName||u.username)
      + '<span style="font-size:11px;color:var(--ink-soft);font-weight:400;margin-left:6px;">@'+_esc(u.username)+'</span></div>'
      + '<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:2px;">' + permBadges + '</div>'
      + '</div>'
      + (isSelf
          ? '<span style="font-size:11px;color:var(--ink-soft);padding:4px 8px;">(vous)</span>'
          : (u.username.toLowerCase() === 'admin'
            ? '<span style="font-size:11px;color:var(--ink-soft);padding:4px 8px;">Protégé</span>'
            : (isServer
              ? '<div style="display:flex;gap:6px;flex-shrink:0;">'
                + '<button data-user="'+u.username+'" data-display="'+(u.displayName||u.username)+'" data-admin="'+(isAdminU?'1':'0')+'" class="btnEditUser" style="padding:5px 10px;border-radius:6px;border:1px solid #194093;background:var(--paper-card);color:#194093;font-size:12px;cursor:pointer;font-family:inherit;">Modifier</button>'
                + '<button data-user="'+u.username+'" class="btnDelUser" style="padding:5px 10px;border-radius:6px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;font-size:12px;cursor:pointer;font-family:inherit;">✕</button>'
                + '</div>'
              : '')));
    container.appendChild(div);
  });

  // Boutons modifier
  container.querySelectorAll('.btnEditUser').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var uname   = this.getAttribute('data-user');
      var display = this.getAttribute('data-display');
      var isAdm   = this.getAttribute('data-admin') === '1';
      var perms = _cachedUsers ? (_cachedUsers.find(function(u){ return u.username===uname; })||{}).permissions||{} : {};
      openEditUserModal(uname, display, isAdm, perms);
    });
  });

  // Boutons supprimer
  container.querySelectorAll('.btnDelUser').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var uname = this.getAttribute('data-user');
      if (!(await customConfirm('Supprimer cet utilisateur ?', 'L\'utilisateur « ' + escapeHtml(uname) + ' » sera supprimé définitivement.', { okLabel: 'Supprimer', danger: true }))) return;
      var ok = await authDeleteUser(uname);
      if (ok) { showAuthToast('Utilisateur supprimé ✓'); renderUserPage(); }
      else showAuthToast('Erreur suppression', 'err', 3000);
    });
  });
}

// L'ancien formulaire d'ajout d'utilisateur inline (#btnAddUser,
// #newUserUsername, #newUserDisplay, #newUserPassword, #newUserError) a été
// retiré d'index.html au profit de la fenêtre openAddUserModal() ci-dessous.
// La fonction qui s'y accrochait sortait donc immédiatement à chaque appel
// depuis renderUserPage() : supprimée.

function openAddUserModal() {
  var PERM_LIST = [
    ['canEdit',        'Créer et modifier des produits'],
    ['canDelete',      'Supprimer des produits'],
    ['canViewDocs',    'Voir les documents PDF'],
    ['canUploadDocs',  'Envoyer des documents PDF'],
    ['canExport',      'Exporter le catalogue']
    // canSyncServer retiré : sync serveur manuelle strictement admin
    // désormais, plus une permission accordable (voir _defaultPermissions).
  ];

  var permCheckboxes = PERM_LIST.map(function(p) {
    var checked = p[0] === 'canViewDocs' ? ' checked' : '';
    return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;padding:2px 0;">'
      + '<input type="checkbox" class="_nuPerm" data-perm="'+p[0]+'"'+checked+'> '+p[1]+'</label>';
  }).join('');

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
  ov.innerHTML = '<div style="background:var(--paper-card);border-radius:12px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
    + '<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:16px;">Ajouter un utilisateur</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<input id="_nuUsername" type="text" placeholder="Identifiant" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_nuDisplay" type="text" placeholder="Nom affich\u00e9" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_nuPassword" type="password" placeholder="Mot de passe" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;padding:6px 0;border-top:1px solid var(--line);margin-top:4px;">'
    + '<input type="checkbox" id="_nuAdmin"> <strong>Administrateur</strong> (acc\u00e8s complet)</label>'
    + '<div id="_nuPermsSection" style="border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--paper);">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;">Permissions individuelles</div>'
    + permCheckboxes
    + '</div>'
    + '</div>'
    + '<div id="_nuError" style="color:#991B1B;font-size:12px;margin-top:8px;display:none;"></div>'
    + '<div style="display:flex;gap:8px;margin-top:16px;">'
    + '<button id="_nuCancel" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>'
    + '<button id="_nuSubmit" style="flex:2;padding:9px;border-radius:8px;border:none;background:#194093;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Cr\u00e9er l&#39;utilisateur</button>'
    + '</div></div>';
  document.body.appendChild(ov);

  ov.querySelector('#_nuCancel').onclick = function() { document.body.removeChild(ov); };

  ov.querySelector('#_nuAdmin').addEventListener('change', function() {
    var sec = ov.querySelector('#_nuPermsSection');
    if (sec) sec.style.display = this.checked ? 'none' : '';
  });

  // Repasser la bordure en gris dès que l'utilisateur corrige le champ
  // concerné, plutôt que d'attendre un nouveau clic sur "Créer".
  var REQ_BORDER = '1.5px solid #DC2626';
  var OK_BORDER  = '1px solid var(--line)';
  ov.querySelector('#_nuUsername').addEventListener('input', function() {
    if (this.value.trim()) this.style.border = OK_BORDER;
  });
  ov.querySelector('#_nuPassword').addEventListener('input', function() {
    if (this.value) this.style.border = OK_BORDER;
  });

  ov.querySelector('#_nuSubmit').onclick = async function() {
    var usernameEl  = ov.querySelector('#_nuUsername');
    var passwordEl  = ov.querySelector('#_nuPassword');
    var username    = usernameEl.value.trim();
    var displayName = ov.querySelector('#_nuDisplay').value.trim();
    var password    = passwordEl.value;
    var isAdminNew  = ov.querySelector('#_nuAdmin').checked;
    var errEl       = ov.querySelector('#_nuError');

    usernameEl.style.border = username ? OK_BORDER : REQ_BORDER;
    passwordEl.style.border = password ? OK_BORDER : REQ_BORDER;

    if (!username || !password) {
      errEl.textContent = 'Identifiant et mot de passe requis.';
      errEl.style.display = '';
      return;
    }
    if (password.length < AUTH_PASSWORD_MIN) {
      errEl.textContent = 'Mot de passe : ' + AUTH_PASSWORD_MIN + ' caractères minimum.';
      errEl.style.display = '';
      passwordEl.style.border = REQ_BORDER;
      return;
    }

    var permsNew = _defaultPermissions(isAdminNew);
    if (!isAdminNew) {
      ov.querySelectorAll('._nuPerm').forEach(function(cb) {
        permsNew[cb.getAttribute('data-perm')] = cb.checked;
      });
      permsNew.canViewDocs = true;
    }

    var ok = await authCreateUser({
      username:    username,
      displayName: displayName || username,
      password:    password,
      isAdmin:     isAdminNew,
      permissions: permsNew
    });

    if (ok) {
      document.body.removeChild(ov);
      showAuthToast('Utilisateur cr\u00e9\u00e9 \u2713');
      renderUserPage();
    } else {
      errEl.textContent = 'Erreur \u2014 identifiant d\u00e9j\u00e0 existant ou serveur inaccessible.';
      errEl.style.display = '';
    }
  };
}
function openEditUserModal(username, displayName, isAdminUser, currentPerms) {
  currentPerms = currentPerms || {};

  function _escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var safeTitleName   = _escapeHtml(displayName || username);
  var safeDisplayValue = _escapeHtml(displayName || '');

  var PERM_LIST = [
    ['canEdit',        'Créer et modifier des produits'],
    ['canDelete',      'Supprimer des produits'],
    ['canViewDocs',    'Voir les documents PDF'],
    ['canUploadDocs',  'Envoyer des documents PDF'],
    ['canExport',      'Exporter le catalogue']
    // canSyncServer retiré : sync serveur manuelle strictement admin
    // désormais, plus une permission accordable (voir _defaultPermissions).
  ];

  var permCheckboxes = PERM_LIST.map(function(p) {
    var checked   = currentPerms[p[0]] ? ' checked' : '';
    var permKey   = _escapeHtml(p[0]);
    var permLabel = _escapeHtml(p[1]);
    return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;padding:3px 0;">'
      + '<input type="checkbox" class="_euPerm" data-perm="'+permKey+'"'+checked+'> '+permLabel+'</label>';
  }).join('');

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
  ov.innerHTML = '<div style="background:var(--paper-card);border-radius:12px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
    + '<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:16px;">Modifier — ' + safeTitleName + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<input id="_euDisplay" type="text" placeholder="Nom affiché" value="' + safeDisplayValue + '" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_euPassword" type="password" placeholder="Nouveau mot de passe (vide = inchangé)" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;padding:4px 0;border-top:1px solid var(--line);margin-top:4px;">'
    + '<input type="checkbox" id="_euAdmin"' + (isAdminUser ? ' checked' : '') + '> <strong>Administrateur</strong> (accès complet)</label>'
    + '<div id="_euPermsSection" style="border:1px solid var(--line);border-radius:8px;padding:12px;'+(isAdminUser?'display:none;':'')+'background:var(--paper);">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;">Permissions individuelles</div>'
    + permCheckboxes
    + '</div>'
    + '</div>'
    + '<div id="_euError" style="color:#991B1B;font-size:12px;margin-top:8px;display:none;"></div>'
    + '<div style="display:flex;gap:8px;margin-top:16px;">'
    + '<button id="_euCancel" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>'
    + '<button id="_euSubmit" style="flex:2;padding:9px;border-radius:8px;border:none;background:#194093;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Enregistrer</button>'
    + '</div></div>';
  document.body.appendChild(ov);

  // Toggle section permissions
  ov.querySelector('#_euAdmin').addEventListener('change', function() {
    var sec = ov.querySelector('#_euPermsSection');
    if (sec) sec.style.display = this.checked ? 'none' : '';
  });

  ov.querySelector('#_euCancel').onclick = function() { document.body.removeChild(ov); };
  ov.querySelector('#_euSubmit').onclick = async function() {
    var displayNew  = ov.querySelector('#_euDisplay').value.trim();
    var passwordNew = ov.querySelector('#_euPassword').value;
    var isAdminNew  = ov.querySelector('#_euAdmin').checked;
    var errEl       = ov.querySelector('#_euError');

    // Champ laissé vide = mot de passe inchangé ; s'il est rempli, il obéit à
    // la même règle qu'ailleurs (voir AUTH_PASSWORD_MIN).
    if (passwordNew && passwordNew.length < AUTH_PASSWORD_MIN) {
      errEl.textContent = 'Mot de passe : ' + AUTH_PASSWORD_MIN + ' caractères minimum.';
      errEl.style.display = '';
      ov.querySelector('#_euPassword').style.border = REQ_BORDER;
      return;
    }

    // Récupérer permissions cochées
    var permsNew = _defaultPermissions(isAdminNew);
    if (!isAdminNew) {
      ov.querySelectorAll('._euPerm').forEach(function(cb) {
        permsNew[cb.getAttribute('data-perm')] = cb.checked;
      });
      permsNew.canViewDocs = true; // toujours autorisé

    }

    var data = { isAdmin: isAdminNew, permissions: permsNew };
    if (displayNew) data.displayName = displayNew;
    if (passwordNew) data.password = passwordNew;

    var ok = await authUpdateUser(username, data);
    if (ok) {
      document.body.removeChild(ov);
      showAuthToast('Utilisateur modifié ✓');
      renderUserPage();
    } else {
      errEl.textContent = 'Erreur — serveur inaccessible ou droits insuffisants.';
      errEl.style.display = '';
    }
  };
}

function openChangePasswordModal() {
  var user = authGetCurrentUser();
  var sUrl = localStorage.getItem(AUTH_SERVER_KEY);
  if (!user || !sUrl) return;

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = '<div style="background:var(--paper-card);border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
    + '<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:16px;">Changer mon mot de passe</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<input id="_cpCurrent" type="password" placeholder="Mot de passe actuel" autocomplete="current-password" style="padding:9px 12px;border:1.5px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_cpNew" type="password" placeholder="Nouveau mot de passe" autocomplete="new-password" style="padding:9px 12px;border:1.5px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_cpConfirm" type="password" placeholder="Confirmer le nouveau mot de passe" autocomplete="new-password" style="padding:9px 12px;border:1.5px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '</div>'
    + '<div id="_cpError" style="color:#DC2626;font-size:12px;margin-top:8px;min-height:16px;"></div>'
    + '<div style="display:flex;gap:8px;margin-top:16px;">'
    + '<button id="_cpCancel" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>'
    + '<button id="_cpSubmit" style="flex:2;padding:9px;border-radius:8px;border:none;background:#194093;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Enregistrer</button>'
    + '</div></div>';
  document.body.appendChild(ov);

  // Même comportement que la modale "Ajouter un utilisateur" (openAddUserModal) :
  // bordure rouge sur le champ fautif en plus du message d'erreur, qui repasse
  // au gris dès que l'utilisateur corrige ce champ précis — au lieu du seul
  // message générique d'avant, sans aucun repère visuel sur quel champ est en
  // cause (retour utilisateur, capture à l'appui).
  var REQ_BORDER = '1.5px solid #DC2626';
  var OK_BORDER  = '1.5px solid var(--line)';
  var cpCurrentEl = ov.querySelector('#_cpCurrent');
  var cpNewEl     = ov.querySelector('#_cpNew');
  var cpConfirmEl = ov.querySelector('#_cpConfirm');
  [cpCurrentEl, cpNewEl, cpConfirmEl].forEach(function(el){
    el.addEventListener('input', function(){ this.style.border = OK_BORDER; });
  });

  ov.querySelector('#_cpCancel').onclick = function() { document.body.removeChild(ov); };
  ov.querySelector('#_cpSubmit').onclick = async function() {
    var pwCur  = cpCurrentEl.value;
    var pw1    = cpNewEl.value;
    var pw2    = cpConfirmEl.value;
    var errEl  = ov.querySelector('#_cpError');
    errEl.textContent = '';
    cpCurrentEl.style.border = OK_BORDER;
    cpNewEl.style.border     = OK_BORDER;
    cpConfirmEl.style.border = OK_BORDER;

    if (!pwCur) { errEl.textContent = 'Saisissez votre mot de passe actuel.'; cpCurrentEl.style.border = REQ_BORDER; return; }
    if (!pw1)   { errEl.textContent = 'Saisissez un nouveau mot de passe.'; cpNewEl.style.border = REQ_BORDER; return; }
    if (pw1.length < AUTH_PASSWORD_MIN) { errEl.textContent = 'Minimum ' + AUTH_PASSWORD_MIN + ' caractères.'; cpNewEl.style.border = REQ_BORDER; return; }
    if (pw1 !== pw2) { errEl.textContent = 'Les mots de passe ne correspondent pas.'; cpNewEl.style.border = REQ_BORDER; cpConfirmEl.style.border = REQ_BORDER; return; }

    try {
      var r = await fetch(sUrl + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, password: pwCur })
      });
      if (!r.ok) { errEl.textContent = 'Mot de passe actuel incorrect.'; cpCurrentEl.style.border = REQ_BORDER; return; }
    } catch(e) { errEl.textContent = 'Impossible de joindre le serveur.'; return; }

    var ok = await authChangeOwnPassword(user.username, pw1);
    if (ok) {
      document.body.removeChild(ov);
      showAuthToast('Mot de passe modifié ✓');
    } else {
      errEl.textContent = 'Erreur serveur.';
    }
  };
}

function initAuth() {
  applyAuthUI();
  // Ré-affiche le toast ("Déconnecté", "Session expirée…") posé juste avant
  // le rechargement instantané de la page (voir _authReloadAfterLogout) —
  // sessionStorage plutôt que localStorage : ne doit survivre qu'à CE
  // rechargement précis, pas traîner indéfiniment si l'onglet reste ouvert
  // ou est rouvert plus tard.
  try {
    var _postReloadMsg = sessionStorage.getItem(AUTH_POST_RELOAD_TOAST_KEY);
    if (_postReloadMsg) {
      sessionStorage.removeItem(AUTH_POST_RELOAD_TOAST_KEY);
      showAuthToast(_postReloadMsg);
    }
  } catch(e) {}
  // Retire "_authreload" de la barre d'adresse une fois son rôle (forcer la
  // navigation, voir _authReloadAfterLogout) rempli — replaceState ne
  // déclenche pas de nouveau rechargement, juste un nettoyage silencieux de
  // l'URL affichée. Les AUTRES paramètres éventuels (ex. ?_swupdate=...) sont
  // conservés, seul celui-ci est retiré.
  if (window.location.search.indexOf('_authreload=') !== -1) {
    var _cleanParams = new URLSearchParams(window.location.search);
    _cleanParams.delete('_authreload');
    var _cleanQs = _cleanParams.toString();
    window.history.replaceState({}, document.title,
      window.location.pathname + (_cleanQs ? '?' + _cleanQs : '') + window.location.hash);
  }
  // Notifier les composants (bottom nav, menu sheet) après applyAuthUI —
  // même délai réutilisé pour démarrer le polling des demandes en attente
  // sur une session déjà active (pas de authLogin() cette fois, la session
  // vient de localStorage). initAuth() s'exécute avant que requests.js soit
  // chargé (ordre des scripts) : window._reqStartPolling n'existe pas encore
  // à cet instant précis, un appel direct ici ne fait donc rien silencieuse-
  // ment — d'où le report dans ce setTimeout, exécuté une fois tous les
  // scripts chargés (retour utilisateur, capture à l'appui : badge absent
  // malgré de vraies demandes en attente pour un admin déjà connecté).
  setTimeout(function(){
    document.dispatchEvent(new CustomEvent('spi_auth_changed'));
    if(authIsLoggedIn() && typeof window._reqStartPolling === 'function') window._reqStartPolling();
  }, 300);

  // Bouton "Se connecter"
  async function doLogin() {
    var username = document.getElementById('authUsername').value.trim();
    var password = document.getElementById('authPassword').value;
    var errEl    = document.getElementById('authError');
    if (errEl) errEl.textContent = '';
    var ok = await authLogin(username, password);
    if (!ok && errEl) errEl.textContent = 'Identifiants incorrects.';
  }

  var submitBtn = document.getElementById('authSubmitBtn');
  if (submitBtn) submitBtn.addEventListener('click', doLogin);

  // Touche Entrée dans les champs
  ['authUsername', 'authPassword'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doLogin();
    });
  });

  var closeBtn = document.getElementById('authCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);

  // Navigation gérée dans actions.js
  // Bouton Mon compte → ouvre directement la modale changement mot de passe
  var btnMyAcc = document.getElementById('btnOpenMyAccount');
  if (btnMyAcc) btnMyAcc.addEventListener('click', function() {
    openChangePasswordModal();
  });

  // Vérifier token au chargement
  if (authIsLoggedIn() && authGetToken()) {
    authRefreshMe();
  }

  // Bouton "Mon mot de passe" dans l'en-tête de la page utilisateurs
  var btnAdminChangePw = document.getElementById('btnAdminChangePassword');
  if (btnAdminChangePw) btnAdminChangePw.addEventListener('click', function() { openChangePasswordModal(); });

  // Bouton "Ajouter" dans l'en-tête de la page utilisateurs
  var btnAddUserOpen = document.getElementById('btnAddUserOpen');
  if (btnAddUserOpen) btnAddUserOpen.addEventListener('click', function() { openAddUserModal(); });
}

function authApplyOnProductModal() {
  var vmInfoBtn = document.getElementById('vmInfoBtn');
  var vmProposeMenuBtn = document.getElementById('vmProposeMenuBtn');
  // Utiliser les permissions déjà calculées dans applyAuthUI — canPropose
  // inclus (voir plus haut) : le menu ⓘ héberge désormais aussi "Proposer
  // une modification" à la place de "Modifier la fiche".
  var perms = window._userPerms || {};
  var showInfo = !!(perms.canEdit || perms.canDelete || perms.isAdmin || perms.canPropose);
  if (vmInfoBtn) vmInfoBtn.style.display = showInfo ? '' : 'none';
  if (vmProposeMenuBtn) vmProposeMenuBtn.style.display = perms.canPropose ? '' : 'none';
}