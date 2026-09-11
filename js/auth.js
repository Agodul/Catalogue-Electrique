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
      // Capturé AVANT showHome() plus bas, qui remet toujours ce drapeau à
      // "0" (voir window._setViewAll, js/storage.js) — sinon un utilisateur
      // qui consultait "Voir tout le catalogue" avant de se connecter se
      // retrouvait renvoyé sur l'accueil après connexion, sans lien avec ce
      // qu'il regardait (retour utilisateur : "corriger l'affichage du
      // catalogue complet lors de la connexion").
      var _wasViewAllBeforeLogin = sessionStorage.getItem('cat_view_all') === '1';
      closeAuthModal();
      applyAuthUI();
      showAuthToast('Connecté en tant que ' + (serverUser.displayName || username));
      // Rafraîchir le rendu pour appliquer les permissions
      if (typeof render === 'function') render();
      if (typeof renderHome === 'function') renderHome();
      if (typeof showHome === 'function') showHome();
      if (_wasViewAllBeforeLogin && typeof showCatalogueAll === 'function') showCatalogueAll();
      document.dispatchEvent(new CustomEvent('spi_auth_changed'));
      if (typeof window._pdfPreloadLib === 'function') window._pdfPreloadLib();
      // Version de l'extension affichée sur le bouton "Télécharger
      // l'extension" (js/actions-plugin-download.js) : l'appel fait au
      // chargement du script échoue silencieusement si l'utilisateur n'était
      // pas déjà connecté à ce moment-là (l'API est authentifiée) — sans ce
      // rappel ici, le sous-texte de version resterait vide jusqu'au
      // prochain rechargement complet de la page (retour utilisateur :
      // "faut attendre que le user se connecte").
      if (typeof window._refreshExtensionVersionDisplay === 'function') window._refreshExtensionVersionDisplay();
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
  // local au serveur") — désormais scindée en deux niveaux d'accès distincts
  // (retour utilisateur : après une restauration de sauvegarde par un admin,
  // les autres utilisateurs connectés n'ont aucun moyen de forcer une
  // resynchronisation en attendant le correctif serveur du "changedAt" —
  // voir doCheckAllSync, js/actions-settings-sync.js) :
  //  - "Charger depuis le serveur" (btnSyncFromServer) : accessible à TOUT
  //    utilisateur connecté. Ne fait que rapatrier l'état serveur dans
  //    l'affichage LOCAL de la personne qui clique (products = data.items,
  //    voir js/actions-settings-nav.js) — aucun risque pour les autres
  //    utilisateurs ni pour le serveur, contrairement à "Envoyer" ci-dessous.
  //  - "Envoyer le catalogue local au serveur" (btnPushToServer) : reste
  //    strictement admin, PAS de permission granulaire configurable ici
  //    (retour utilisateur historique : un dev/admin peut se tromper et
  //    l'activer pour tout le monde côté serveur — ce bouton écrase tout le
  //    catalogue serveur avec la copie locale de qui clique, un risque trop
  //    élevé pour dépendre d'un simple flag serveur). Même traitement que
  //    serverAdminBackupSection juste en dessous.
  var serverButtonsSection = document.getElementById('serverButtonsSection');
  if (serverButtonsSection) serverButtonsSection.style.display = loggedIn ? '' : 'none';
  var btnPushToServer = document.getElementById('btnPushToServer');
  // 'flex' explicite (pas '') : ce bouton a display:flex dans son attribut
  // style HTML pour aligner son icône + son texte — remettre '' n'efface
  // QUE la propriété display du style inline, retombant sur le display
  // par défaut d'un <button> (inline-block), pas sur le display:flex
  // d'origine. Repéré en testant : le texte semblait centré au lieu
  // d'aligné à gauche comme "Charger depuis le serveur" (retour
  // utilisateur : "le envoyer le catalogue local au serveur est encore
  // centrer").
  if (btnPushToServer) btnPushToServer.style.display = isAdmin ? 'flex' : 'none';

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

  // Téléchargement de l'extension Chrome (menu ⋮) — visible pour TOUT
  // utilisateur connecté, pas seulement admin (retour utilisateur : "mettre
  // à disposition l'extension [...] à tous les user loggin"), voir
  // js/actions-plugin-download.js.
  var btnDownloadExtension = document.getElementById('btnDownloadExtension');
  if (btnDownloadExtension) btnDownloadExtension.style.display = loggedIn ? '' : 'none';
  // Envoi d'une nouvelle version : ADMIN uniquement (retour utilisateur :
  // "faudrai pouvoir ajouter depuis le client mais seulement pour les
  // admins") — remplace le fichier distribué à tout le monde.
  var btnUploadExtension = document.getElementById('btnUploadExtension');
  if (btnUploadExtension) btnUploadExtension.style.display = isAdmin ? '' : 'none';

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
  // En-tête "Relations produit" (voir js/templates.js) : même condition
  // que les deux champs qu'il coiffe, sinon il reste affiché seul, sans
  // aucun champ dessous, pour les comptes sans droit d'édition.
  var fRelationsSecHead = document.getElementById('fRelationsSecHead');
  if(fRelationsSecHead) fRelationsSecHead.style.display = canEdit ? '' : 'none';

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
  // Export Excel — même accès que l'import (retour utilisateur : "le export
  // devrait être accessible aussi [si] tu as accès à l'import excel") —
  // aucune action destructive ni écriture ici (juste une lecture des
  // produits déjà visibles dans le catalogue, voir btnExportXlsx dans
  // js/actions-import-export.js, sans aucune vérification de permission au
  // clic), donc pas de raison de le restreindre plus que l'import.
  var btnExportXlsxEl = document.getElementById('btnExportXlsx');
  if(btnExportXlsxEl) btnExportXlsxEl.style.display = (canEdit || canPropose) ? '' : 'none';
  // Import Excel — si droit d'édition directe (canEdit, comme
  // hasDirectEditRights dans js/actions-import-export.js) OU droit de
  // proposer (l'import passe alors par le circuit de demandes — jamais
  // d'écriture directe au catalogue pour ces utilisateurs). Basé sur
  // canEdit et non canExport (retour utilisateur : "je veux que import
  // excel si pas canEdit alors passe en proposition") — canExport ne
  // contrôlait en réalité QUE l'export, le code d'import lui-même a
  // toujours décidé via canEdit/isAdmin ; l'affichage ici ne correspondait
  // donc pas au comportement réel (ex. un utilisateur avec canEdit mais
  // sans canExport ne voyait même pas le bouton, alors que l'import aurait
  // pourtant écrit directement pour lui).
  var btnImportXlsxEl = document.getElementById('btnImportXlsx');
  if(btnImportXlsxEl) btnImportXlsxEl.style.display = (canEdit || canPropose) ? '' : 'none';
  // Sous-titre adapté à la conséquence réelle pour CET utilisateur (retour
  // utilisateur : le texte doit correspondre à la permission) — l'import
  // écrit directement le catalogue pour canEdit, mais passe par une
  // demande à valider par un admin pour un simple "proposeur".
  var btnImportXlsxSub = document.getElementById('btnImportXlsxSub');
  if(btnImportXlsxSub) btnImportXlsxSub.textContent = canEdit ? 'Mise à jour des prix' : 'Propose une mise à jour (validation admin)';
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
  var _hdrToolIds = ['btnCompare','btnDownloadExtension','btnUploadExtension','btnCleanDescs'];
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
  // Masqué pour un utilisateur qui peut éditer directement (canEdit) — il
  // n'a jamais besoin de passer par le circuit de demandes pour modifier un
  // produit, donc rien à y suivre (retour utilisateur). Les admins le
  // voient toujours (ils traitent les demandes des AUTRES), tout comme un
  // utilisateur sans droit d'édition (lui doit passer par une demande).
  var _showReq    = loggedIn && !!_sUrl && (isAdmin || !canEdit);
  if(_btnReqMenu) _btnReqMenu.style.display = _showReq ? '' : 'none';
  if(_reqMenuSep) _reqMenuSep.style.display = _showReq ? '' : 'none';
  // Sous-titre : les admins y traitent les demandes REÇUES des autres
  // utilisateurs, un simple utilisateur n'y voit que le suivi des SIENNES
  // (voir reqRefreshPanel() dans js/requests.js, qui bascule déjà le
  // contenu du panneau lui-même de la même façon).
  var _btnReqMenuSub = document.getElementById('btnRequestsMenuSub');
  if(_btnReqMenuSub) _btnReqMenuSub.textContent = isAdmin ? 'Modifications proposées' : 'Suivi de vos demandes';
  // Titre du bouton lui-même, pas seulement son sous-titre (retour
  // utilisateur : un non-admin n'y voit QUE ses propres demandes/bugs — le
  // libellé doit le refléter, "Demandes en attente" laissant à tort penser
  // qu'il y a une file d'attente à traiter comme pour un admin).
  var _btnReqMenuTitle = document.getElementById('btnRequestsMenuTitle');
  if(_btnReqMenuTitle) _btnReqMenuTitle.textContent = isAdmin ? 'Demandes en attente' : 'Mes demandes en attente';
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

// Safari iOS positionne position:fixed par rapport au viewport de mise en
// page (fixe), pas par rapport à la zone réellement visible — un clavier qui
// s'ouvre ne réduit donc jamais la hauteur que #authOverlay utilise pour
// centrer sa carte (align-items:center, css/styles.css), qui reste alors
// centrée sur une hauteur périmée, avec le bas de la carte (champs/bouton
// "Se connecter") caché derrière le clavier. (La bottom nav a SON PROPRE
// traitement séparé désormais — masquée pendant la saisie, voir
// js/actions-mobile-chrome.js — ceci ne concerne que la carte elle-même.)
// On fait donc suivre #authOverlay à window.visualViewport à la place,
// même remède déjà utilisé pour le configurateur d'armoire
// (_armoireSyncMobileHeight, js/armoireConfig.js) : la carte reste centrée
// dans la zone RÉELLEMENT visible, le fond assombri va bien jusqu'en bas
// (jusqu'à la bottom nav, qui elle suit déjà correctement cette même zone),
// plus de bande découverte.
var _authViewportHandler = null;
function _authSyncViewportHeight(){
  var overlay = document.getElementById('authOverlay');
  if(!overlay || !overlay.classList.contains('show')) return;
  // Desktop/tablette large : pas de clavier logiciel à suivre, laisser le
  // CSS gérer plutôt que polluer avec du inline.
  if(window.innerWidth > 768 || !window.visualViewport){
    overlay.style.position = '';
    overlay.style.top = '';
    overlay.style.left = '';
    overlay.style.width = '';
    overlay.style.height = '';
    return;
  }
  var vv = window.visualViewport;
  overlay.style.position = 'fixed';
  overlay.style.top = vv.offsetTop + 'px';
  overlay.style.left = vv.offsetLeft + 'px';
  overlay.style.width = vv.width + 'px';
  overlay.style.height = vv.height + 'px';
  // Retour utilisateur : "la fenetre de connection qui suis pas le
  // clavier" — même avec la hauteur ci-dessus recalée sur
  // window.visualViewport, iOS Safari ajoute par-dessus le clavier sa
  // propre barre de suggestion "Mots de passe" (accessoire natif du
  // navigateur, pas du contenu web), qui n'est PAS toujours comptée dans
  // visualViewport.height — la mesure ci-dessus peut donc rester trop
  // généreuse de quelques dizaines de pixels, et le champ actif (ou le
  // bouton "Se connecter" plus bas dans la carte) reste caché derrière
  // cette barre malgré le recalcul. Filet de sécurité indépendant de cette
  // mesure imprécise : fait défiler explicitement le CHAMP QUI A LE FOCUS
  // dans la zone réellement visible (#authOverlay reste overflow-y:auto,
  // voir css/styles.css) plutôt que de se fier uniquement au calcul de
  // hauteur. rAF : laisse le navigateur appliquer la nouvelle hauteur/
  // position ci-dessus avant de calculer où défiler.
  requestAnimationFrame(function(){
    var active = document.activeElement;
    if(active && overlay.contains(active) && typeof active.scrollIntoView === 'function'){
      active.scrollIntoView({ block: 'center' });
    }
  });
}

// Retour utilisateur : "la fenetre de connection qui suis pas le clavier"
// — TOUJOURS présent après le filet de sécurité ci-dessus. Constaté en
// direct dans le simulateur : window.visualViewport ne se met JAMAIS à
// jour sur cet appareil/version d'iOS quand le clavier s'ouvre (bug Safari
// documenté — voir recherche menée sur les forums développeurs Apple, iOS
// 26). Tout ce qui précède dans ce fichier (hauteur d'#authOverlay ET son
// propre scrollIntoView) dépend de cette mesure et reste donc aveugle au
// clavier sur un appareil touché par ce bug. Ce filet-ci ne dépend
// D'AUCUNE mesure de viewport : fait défiler l'OVERLAY (overflow-y:auto,
// voir css/styles.css) pour amener le champ qui a le focus tout en haut de
// l'écran (petite marge), uniquement via getBoundingClientRect() — fiable
// que visualViewport fonctionne ou non. Le bouton "Se connecter" peut
// rester sous le clavier si celui-ci est grand, mais le champ EN COURS DE
// SAISIE, lui, reste toujours visible — et la touche Entrée valide déjà la
// connexion (voir _authWirePasswordToggles plus bas) sans avoir besoin de
// voir le bouton.
// Retour utilisateur : "sa devrai monter quand sa detecte un clavier
// mobile" — window.innerWidth <= 768 seul ne suffit pas à dire "un clavier
// logiciel va s'afficher" : une fenêtre desktop simplement rétrécie (souris/
// trackpad, aucun clavier tactile) matche aussi cette largeur. Même
// convention que le reste de l'app pour détecter un VRAI appareil tactile
// (voir js/modal-autocomplete.js, décision d'auto-focus du formulaire
// produit) : pointer:coarse en plus de la largeur, jamais l'un sans
// l'autre.
function _authIsMobileKeyboardDevice(){
  return window.innerWidth <= 768
    && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
}

// Retour utilisateur : "quand je clique sur connection la fenetre monte
// direct alors que le clavier n'est pas sorti" — l'identifiant se
// focalise tout SEUL à l'ouverture de la fenêtre (openAuthModal plus bas
// dans ce fichier, focus programmatique, aucun vrai geste de
// l'utilisateur sur le champ), donc TOUTE prise de focus déclenchait la
// réserve, y compris celle-ci — la carte montait dès l'OUVERTURE de la
// fenêtre, jamais synchronisée avec un clavier qui n'a même pas
// commencé à s'ouvrir. On ne réserve plus désormais qu'après un VRAI
// contact tactile récent sur le champ lui-même (un focus programmatique
// n'est précédé d'aucun touchstart).
var _authLastTouchAt = 0;
document.addEventListener('touchstart', function(e){
  if(e.target && e.target.closest && e.target.closest('#authOverlay')) _authLastTouchAt = Date.now();
}, { passive: true });
function _authScrollFieldToTop(el){
  var overlay = document.getElementById('authOverlay');
  if(!overlay || !el || !_authIsMobileKeyboardDevice()) return;
  var overlayRect = overlay.getBoundingClientRect();
  var elRect = el.getBoundingClientRect();
  var margin = 16;
  overlay.scrollTop += (elRect.top - overlayRect.top) - margin;
}

// Retour utilisateur : "la fenetre de connection qui suis pas le clavier"
// — persistant malgré TOUT ce qui précède (recalage sur visualViewport,
// scrollIntoView, sondage continu, correction du piège flexbox
// align-items). Raison de fond, comprise seulement après coup : sur cet
// appareil, window.visualViewport ne rétrécit JAMAIS quand le clavier
// s'ouvre — donc la carte de connexion, elle, ne déborde JAMAIS
// réellement de #authOverlay du point de vue du DOM (rien à faire
// défiler, le clavier recouvre juste une zone que la mise en page ignore
// complètement). Aucune des corrections précédentes ne pouvait donc
// fonctionner : on ne peut pas faire défiler un contenu qui ne déborde
// pas. Solution : ne plus essayer de MESURER le clavier du tout — se
// contenter de réserver, dès la prise de focus, une hauteur FIXE en bas de
// l'overlay (via padding-bottom), suffisante pour un clavier iOS dans la
// quasi-totalité des cas. Ce padding force un débordement RÉEL de la
// carte, que _authScrollFieldToTop ci-dessus peut alors vraiment faire
// défiler (voir align-items:flex-start, css/styles.css, qui garantit que
// ce débordement reste atteignable).
// Retour utilisateur : "sa monte trop haut" — 380px (premier essai,
// volontairement généreux) dépassait largement un clavier iOS réel,
// laissant un vide sous "Se connecter" et poussant l'en-tête hors écran
// pour rien. _authScrollFieldToTop amène le champ focus à 16px du HAUT de
// l'écran quel que soit le débordement disponible — plus la réserve est
// grande, plus la carte monte, même quand ce n'est pas nécessaire. Valeur
// réduite à une estimation plus réaliste (clavier iOS standard, sans
// marge superflue).
var AUTH_KEYBOARD_RESERVE_PX = 260;
function _authReserveKeyboardSpace(reserve){
  var overlay = document.getElementById('authOverlay');
  if(!overlay || !_authIsMobileKeyboardDevice()) return;
  // setProperty(..., 'important') et non overlay.style.paddingBottom= :
  // #authOverlay a "padding:0 !important" en CSS (mobile, voir
  // css/styles.css) — un style en ligne SANS !important perd contre un
  // !important externe, quelle que soit sa spécificité (constaté en
  // direct : .style.paddingBottom valait bien "380px" mais le padding
  // RENDU restait 0). Un !important posé en ligne l'emporte, lui, sur
  // n'importe quel !important externe.
  if(reserve){
    overlay.style.setProperty('padding-bottom', AUTH_KEYBOARD_RESERVE_PX + 'px', 'important');
  } else {
    overlay.style.removeProperty('padding-bottom');
  }
}

// Génère le HTML d'un champ mot de passe avec bouton œil "maintenir pour
// afficher" — retour utilisateur : après la connexion, étendu à "modifier
// mot de passe" et "création de mot de passe dans ajouter un utilisateur".
// Réutilisé par openChangePasswordModal()/openAddUserModal() plus bas dans
// ce fichier plutôt que de dupliquer le balisage à chaque champ.
// inputStyle DOIT réserver au moins 40px de padding-right pour laisser la
// place au bouton : un style inline (comme ici) est plus prioritaire que la
// règle CSS .auth-password-wrap input{padding-right:40px} (voir
// css/styles.css) qui suffit pour le champ statique de la connexion, mais
// pas pour ces champs générés en JS avec leur propre padding inline.
function _authPasswordFieldHtml(id, placeholder, autocomplete, inputStyle) {
  return '<div class="auth-password-wrap">'
    + '<input id="' + id + '" type="password" placeholder="' + placeholder + '" autocomplete="' + autocomplete + '" style="' + inputStyle + '">'
    + '<button type="button" class="auth-password-toggle" tabindex="-1" title="Maintenir pour afficher" aria-label="Maintenir pour afficher"><i class="ti ti-eye" aria-hidden="true"></i></button>'
    + '</div>';
}

// Attache le comportement "maintenir enfoncé pour afficher, relâcher pour
// remasquer" à tous les boutons .auth-password-toggle trouvés sous root
// (le document entier pour le champ statique de la connexion, ou une
// modale nouvellement créée pour ses champs à elle) — un seul mécanisme
// partagé, voir le retour utilisateur détaillé dans l'appel depuis
// l'initialisation de la connexion plus bas dans ce fichier. mouseleave
// couvre le cas où le pointeur quitte le bouton pendant que le clic est
// toujours maintenu (sinon le mot de passe resterait visible même après
// relâchement ailleurs sur la page). preventDefault sur mousedown/
// touchstart : évite que l'appui ne vole le focus/la sélection du champ.
function _authWirePasswordToggles(root) {
  var toggles = root.querySelectorAll('.auth-password-toggle');
  toggles.forEach(function(toggle) {
    var wrap = toggle.closest('.auth-password-wrap');
    var input = wrap ? wrap.querySelector('input') : null;
    if (!input) return;
    var reveal = function(show) {
      var icon = toggle.querySelector('i');
      input.type = show ? 'text' : 'password';
      if (icon) icon.className = show ? 'ti ti-eye-off' : 'ti ti-eye';
      toggle.title = show ? 'Relâcher pour masquer' : 'Maintenir pour afficher';
      toggle.setAttribute('aria-label', toggle.title);
    };
    toggle.addEventListener('mousedown', function(e) { e.preventDefault(); reveal(true); });
    toggle.addEventListener('mouseup', function() { reveal(false); });
    toggle.addEventListener('mouseleave', function() { reveal(false); });
    toggle.addEventListener('touchstart', function(e) { e.preventDefault(); reveal(true); }, { passive: false });
    toggle.addEventListener('touchend', function() { reveal(false); });
    toggle.addEventListener('touchcancel', function() { reveal(false); });
  });
}

function openAuthModal() {
  var overlay = document.getElementById('authOverlay');
  if (overlay) {
    overlay.classList.add('show');
    document.body.classList.add('modal-open');
    _authSyncViewportHeight();
    if(window.visualViewport && !_authViewportHandler){
      _authViewportHandler = function(){ _authSyncViewportHeight(); };
      window.visualViewport.addEventListener('resize', _authViewportHandler);
      window.visualViewport.addEventListener('scroll', _authViewportHandler);
    }
    // Repart toujours masqué à l'ouverture (le bouton œil #authPasswordToggle
    // plus bas dans ce fichier ne révèle que tant qu'on le maintient
    // enfoncé, donc un relâchement — fermeture de la modale comprise —
    // remasque déjà normalement, mais on force ici au cas où, ex. la modale
    // se referme pendant que le clic est encore maintenu).
    var pwInput = document.getElementById('authPassword');
    var pwToggle = document.getElementById('authPasswordToggle');
    if (pwInput) pwInput.type = 'password';
    if (pwToggle) {
      var pwToggleIcon = pwToggle.querySelector('i');
      if (pwToggleIcon) pwToggleIcon.className = 'ti ti-eye';
      pwToggle.title = 'Maintenir pour afficher';
      pwToggle.setAttribute('aria-label', pwToggle.title);
    }
    setTimeout(function() {
      var inp = document.getElementById('authUsername');
      if (inp) inp.focus();
    }, 100);
  }
}

function closeAuthModal() {
  var overlay = document.getElementById('authOverlay');
  if(_authViewportHandler && window.visualViewport){
    window.visualViewport.removeEventListener('resize', _authViewportHandler);
    window.visualViewport.removeEventListener('scroll', _authViewportHandler);
    _authViewportHandler = null;
  }
  if(overlay){
    overlay.style.position = '';
    overlay.style.top = '';
    overlay.style.left = '';
    overlay.style.width = '';
    overlay.style.height = '';
  }
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
        ['canUploadDocs','Envoyer docs']
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
            // Retour utilisateur : "applique aussi ce menu ⋯ au reste du
            // site" (suite au même menu déjà posé sur les lignes
            // Blocs/Configurations du configurateur d'armoire, voir
            // js/armoireConfig.js). "Modifier"/"Supprimer" rejoignent un
            // menu ⋯ au lieu de deux boutons séparés — .btnEditUser/
            // .btnDelUser gardés tels quels, seuls leurs gestionnaires
            // ci-dessous changent d'emplacement dans le HTML, pas de logique.
            : (isServer
              ? '<div style="position:relative;flex-shrink:0;">'
                + '<button type="button" class="kebab-btn" title="Plus d\'actions" aria-haspopup="true" aria-expanded="false">⋯</button>'
                + '<div class="kebab-menu" role="menu" style="position:absolute;right:0;top:30px;z-index:5;">'
                  + '<button type="button" data-user="'+u.username+'" data-display="'+(u.displayName||u.username)+'" data-admin="'+(isAdminU?'1':'0')+'" class="btnEditUser" role="menuitem"><i class="ti ti-pencil" aria-hidden="true"></i> Modifier</button>'
                  + '<button type="button" data-user="'+u.username+'" class="btnDelUser kebab-menu-danger" role="menuitem"><i class="ti ti-trash" aria-hidden="true"></i> Supprimer</button>'
                + '</div>'
                + '</div>'
              : '')));
    container.appendChild(div);
  });

  // Le menu ⋯ lui-même (ouverture/fermeture) est géré par le helper
  // générique _bindKebabMenuOn (js/popup.js), partagé avec le
  // configurateur d'armoire. Attaché à #settingsOverlay, PAS à document :
  // js/init.js bloque le clic extérieur des fenêtres modales en appelant
  // e.stopPropagation() sur chaque clic à l'intérieur (voir MODALS.forEach
  // dans init.js), ce qui empêcherait tout clic ici d'atteindre un
  // listener posé sur document.
  if(typeof _bindKebabMenuOn === 'function'){
    _bindKebabMenuOn(document.getElementById('settingsOverlay'));
  }

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
      if (!(await customConfirm('Supprimer cet utilisateur ?', 'L\'utilisateur « ' + escapeHtml(uname) + ' » sera supprimé définitivement. Cette opération est irréversible.', { okLabel: 'Supprimer', danger: true }))) return;
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
    // canSyncServer retiré : sync serveur manuelle strictement admin
    // désormais, plus une permission accordable (voir _defaultPermissions).
    // canExport gardé mais désactivé (retour utilisateur : "remet le
    // canExport dans la liste mais faut griser sa case et changer son
    // intitulé") : ne contrôle plus rien depuis que l'accès à Export/Import
    // Excel suit canEdit (voir commentaires sur btnImportXlsx/btnExportXlsx
    // plus haut dans ce fichier) — gardée visible pour ne pas faire
    // disparaître silencieusement une permission encore présente sur des
    // comptes existants, mais grisée pour ne pas laisser croire qu'elle
    // change encore quelque chose.
    ['canExport',      'Exporter le catalogue (obsolète, sans effet)']
  ];

  var permCheckboxes = PERM_LIST.map(function(p) {
    var isLegacy = p[0] === 'canExport';
    var checked = p[0] === 'canViewDocs' ? ' checked' : '';
    var disabled = isLegacy ? ' disabled' : '';
    var labelColor = isLegacy ? 'var(--ink-soft)' : 'var(--ink)';
    var cursor = isLegacy ? 'default' : 'pointer';
    return '<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:'+labelColor+';cursor:'+cursor+';padding:5px 0;">'
      + '<span>'+p[1]+'</span><input type="checkbox" class="_nuPerm toggle-switch toggle-switch-sm" data-perm="'+p[0]+'"'+checked+disabled+'></label>';
  }).join('');

  // Repris de la maquette "Atelier Fiche Produit" (retour utilisateur :
  // "faudra aussi faire pour les autres fen\u00eatre pour avoir une meilleur
  // coh\u00e9rence") \u2014 m\u00eame structure .modal/.modal-head/.modal-body/.modal-foot
  // que la fen\u00eatre produit (js/templates.js) plut\u00f4t qu'une bo\u00eete ad hoc,
  // m\u00eames en-t\u00eates de section \u00e0 pastille d'ic\u00f4ne (.sec-head/.sec-icon,
  // css/styles.css), m\u00eame interrupteur \u00e0 bascule (.toggle-switch) pour le
  // r\u00e9glage Administrateur, m\u00eames classes de bouton (.secondary/.copper)
  // que "Annuler"/"Enregistrer le produit". max-width r\u00e9duit par rapport
  // au .modal par d\u00e9faut (660px) : ce formulaire n'a que 3 champs, pas
  // besoin de la m\u00eame largeur qu'une fiche produit.
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = '<div class="modal" style="max-width:420px;">'
    + '<div class="modal-head"><h3 style="margin:0;font-size:17px;font-weight:600;">Ajouter un utilisateur</h3></div>'
    + '<div class="modal-body">'
    + '<div class="sec-head"><div class="sec-head-left"><span class="sec-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg></span><h4>Identifiants</h4></div></div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<input id="_nuUsername" type="text" placeholder="Identifiant" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_nuDisplay" type="text" placeholder="Nom affich\u00e9" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + _authPasswordFieldHtml('_nuPassword', 'Mot de passe', 'new-password', 'padding:9px 40px 9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;')
    + '</div>'
    + '<div class="sec-head"><div class="sec-head-left"><span class="sec-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg></span><h4>Acc\u00e8s et permissions</h4></div></div>'
    + '<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 0 12px;cursor:pointer;">'
    + '<span style="font-size:13px;color:var(--ink);"><strong>Administrateur</strong> <span style="color:var(--ink-soft);font-weight:400;">(acc\u00e8s complet)</span></span>'
    + '<input type="checkbox" id="_nuAdmin" class="toggle-switch"></label>'
    + '<div id="_nuPermsSection" style="border:1px solid var(--line);border-radius:8px;padding:12px;background:var(--paper);">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;">Permissions individuelles</div>'
    + permCheckboxes
    + '</div>'
    + '<div id="_nuError" style="color:#991B1B;font-size:12px;margin-top:8px;display:none;"></div>'
    + '</div>'
    + '<div class="modal-foot"><div class="left-foot"></div><div style="display:flex;gap:8px;">'
    + '<button id="_nuCancel" class="secondary" type="button">Annuler</button>'
    + '<button id="_nuSubmit" class="copper" type="button">Cr\u00e9er l&#39;utilisateur</button>'
    + '</div></div></div>';
  document.body.appendChild(ov);
  _authWirePasswordToggles(ov);

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
    // canSyncServer retiré : sync serveur manuelle strictement admin
    // désormais, plus une permission accordable (voir _defaultPermissions).
    // canExport gardé mais désactivé — voir commentaire équivalent dans
    // openAddUserModal() juste au-dessus dans ce fichier.
    ['canExport',      'Exporter le catalogue (obsolète, sans effet)']
  ];

  var permCheckboxes = PERM_LIST.map(function(p) {
    var isLegacy  = p[0] === 'canExport';
    var checked   = currentPerms[p[0]] ? ' checked' : '';
    var disabled  = isLegacy ? ' disabled' : '';
    var labelColor = isLegacy ? 'var(--ink-soft)' : 'var(--ink)';
    var cursor    = isLegacy ? 'default' : 'pointer';
    var permKey   = _escapeHtml(p[0]);
    var permLabel = _escapeHtml(p[1]);
    return '<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:'+labelColor+';cursor:'+cursor+';padding:5px 0;">'
      + '<span>'+permLabel+'</span><input type="checkbox" class="_euPerm toggle-switch toggle-switch-sm" data-perm="'+permKey+'"'+checked+disabled+'></label>';
  }).join('');

  // Même structure/traitement que openAddUserModal() juste au-dessus dans
  // ce fichier — voir son commentaire pour le détail (retour utilisateur :
  // cohérence entre fenêtres).
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = '<div class="modal" style="max-width:420px;">'
    + '<div class="modal-head"><h3 style="margin:0;font-size:17px;font-weight:600;">Modifier — ' + safeTitleName + '</h3></div>'
    + '<div class="modal-body">'
    + '<div class="sec-head"><div class="sec-head-left"><span class="sec-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-6 8-6s8 2 8 6"/></svg></span><h4>Identifiants</h4></div></div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<input id="_euDisplay" type="text" placeholder="Nom affiché" value="' + safeDisplayValue + '" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + _authPasswordFieldHtml('_euPassword', 'Nouveau mot de passe (vide = inchangé)', 'new-password', 'padding:9px 40px 9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;')
    + '</div>'
    + '<div class="sec-head"><div class="sec-head-left"><span class="sec-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg></span><h4>Accès et permissions</h4></div></div>'
    + '<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 0 12px;cursor:pointer;">'
    + '<span style="font-size:13px;color:var(--ink);"><strong>Administrateur</strong> <span style="color:var(--ink-soft);font-weight:400;">(accès complet)</span></span>'
    + '<input type="checkbox" id="_euAdmin" class="toggle-switch"' + (isAdminUser ? ' checked' : '') + '></label>'
    + '<div id="_euPermsSection" style="border:1px solid var(--line);border-radius:8px;padding:12px;'+(isAdminUser?'display:none;':'')+'background:var(--paper);">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--ink-soft);margin-bottom:8px;">Permissions individuelles</div>'
    + permCheckboxes
    + '</div>'
    + '<div id="_euError" style="color:#991B1B;font-size:12px;margin-top:8px;display:none;"></div>'
    + '</div>'
    + '<div class="modal-foot"><div class="left-foot"></div><div style="display:flex;gap:8px;">'
    + '<button id="_euCancel" class="secondary" type="button">Annuler</button>'
    + '<button id="_euSubmit" class="copper" type="button">Enregistrer</button>'
    + '</div></div></div>';
  document.body.appendChild(ov);
  _authWirePasswordToggles(ov);

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

  // Même structure/traitement que openAddUserModal() plus haut dans ce
  // fichier — voir son commentaire pour le détail (retour utilisateur :
  // cohérence entre fenêtres).
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = '<div class="modal" style="max-width:380px;">'
    + '<div class="modal-head"><h3 style="margin:0;font-size:17px;font-weight:600;">Changer mon mot de passe</h3></div>'
    + '<div class="modal-body">'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + _authPasswordFieldHtml('_cpCurrent', 'Mot de passe actuel', 'current-password', 'padding:9px 40px 9px 12px;border:1.5px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;')
    + _authPasswordFieldHtml('_cpNew', 'Nouveau mot de passe', 'new-password', 'padding:9px 40px 9px 12px;border:1.5px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;')
    + _authPasswordFieldHtml('_cpConfirm', 'Confirmer le nouveau mot de passe', 'new-password', 'padding:9px 40px 9px 12px;border:1.5px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;width:100%;box-sizing:border-box;')
    + '</div>'
    + '<div id="_cpError" style="color:#DC2626;font-size:12px;margin-top:8px;min-height:16px;"></div>'
    + '</div>'
    + '<div class="modal-foot"><div class="left-foot"></div><div style="display:flex;gap:8px;">'
    + '<button id="_cpCancel" class="secondary" type="button">Annuler</button>'
    + '<button id="_cpSubmit" class="copper" type="button">Enregistrer</button>'
    + '</div></div></div>';
  document.body.appendChild(ov);
  _authWirePasswordToggles(ov);

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
    // Retour utilisateur : "la fenetre de connection qui suis pas le
    // clavier" — window.visualViewport ne se met jamais à jour sur cet
    // appareil quand le clavier s'ouvre, donc la carte ne déborde jamais
    // réellement d'#authOverlay du point de vue du DOM (rien à faire
    // défiler tant qu'on ne force pas ce débordement — voir
    // _authReserveKeyboardSpace). Puis, une fois ce point réglé, NOUVEAU
    // retour utilisateur (deux fois) : "la fenetre monte directe alors que
    // le clavier n'est pas sortie" — un délai + une transition CSS ne
    // suffisaient pas : le VRAI souci est que ce focus se déclenche aussi
    // pour l'auto-focus programmatique à l'OUVERTURE de la fenêtre
    // (openAuthModal plus bas), bien avant qu'un clavier n'ait la moindre
    // raison d'apparaître. Voir _authLastTouchAt ci-dessus : ne réserve
    // désormais que si CE focus fait suite à un vrai contact tactile
    // récent sur le champ, jamais pour un focus programmatique seul.
    if (el) el.addEventListener('focus', function(){
      if (typeof _authSyncViewportHeight === 'function') _authSyncViewportHeight();
      if (Date.now() - _authLastTouchAt > 800) return; // pas un vrai geste récent
      setTimeout(function(){
        if (document.activeElement !== el) return;
        // Réserve une hauteur fixe (voir _authReserveKeyboardSpace) puis
        // fait défiler le champ — dans cet ordre : le débordement doit
        // exister AVANT de pouvoir défiler dedans.
        if (typeof _authReserveKeyboardSpace === 'function') _authReserveKeyboardSpace(true);
        if (typeof _authScrollFieldToTop === 'function') _authScrollFieldToTop(el);
      }, 120);
      // Second passage un peu plus tard, une fois la transition terminée,
      // pour rattraper le temps que la mise en page se stabilise.
      setTimeout(function(){
        if (document.activeElement !== el) return;
        if (typeof _authScrollFieldToTop === 'function') _authScrollFieldToTop(el);
      }, 420);
    });
    if (el) el.addEventListener('blur', function(){
      if (typeof _authReserveKeyboardSpace === 'function') _authReserveKeyboardSpace(false);
    });
  });

  var closeBtn = document.getElementById('authCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);

  // Bouton œil "afficher le mot de passe" — retour utilisateur : "ajoute le
  // moyen de voir le mot de passe écrit en ajoutant un œil", puis précisé :
  // "je veux que le mot de passe ne reste visible que tant que je maintiens
  // le clic/appui enfoncé, et redevient masqué dès que je relâche", puis
  // étendu à "modifier mot de passe" et "ajouter un utilisateur" — voir
  // _authWirePasswordToggles() plus haut dans ce fichier (mécanisme
  // partagé, appelé ici pour le champ statique du formulaire de connexion,
  // et depuis openChangePasswordModal()/openAddUserModal() pour leurs
  // champs générés dynamiquement).
  _authWirePasswordToggles(document);

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