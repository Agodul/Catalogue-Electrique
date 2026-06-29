"use strict";

// ── Compte admin de secours (toujours actif, non modifiable) ─────────────────
// SÉCURITÉ : le hash n'est plus codé en dur dans le source.
// Au premier lancement, si aucun hash n'est stocké, l'admin doit définir
// son mot de passe via la fonction authSetAdminPassword() ou depuis l'UI.
var AUTH_ADMIN_FALLBACK_USERNAME = "admin";
var AUTH_ADMIN_FALLBACK_DISPLAYNAME = "Administrateur";

var AUTH_SESSION_KEY   = "spi_auth_user";
var AUTH_USERS_KEY     = "spi_auth_users";   // localStorage
var AUTH_ADMIN_KEY     = "spi_auth_admin";   // localStorage (hash admin séparé)

// ── PBKDF2 avec sel (remplace SHA-256 nu) ────────────────────────────────────
// Génère un sel aléatoire de 16 octets (hex)
function generateSalt() {
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

// Dérive une clé depuis password + salt avec PBKDF2-SHA-256, 100 000 itérations
async function pbkdf2Hash(password, salt) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password.trim()), "PBKDF2", false, ["deriveBits"]
  );
  var bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

// Objet {salt, hash} sérialisable
async function makeCredential(password) {
  var salt = generateSalt();
  var hash = await pbkdf2Hash(password, salt);
  return { salt: salt, hash: hash };
}

// Vérifie password contre un objet {salt, hash}
async function verifyCredential(password, credential) {
  if (!credential || !credential.salt || !credential.hash) return false;
  var hash = await pbkdf2Hash(password, credential.salt);
  return hash === credential.hash;
}

// ── Gestion du compte admin ──────────────────────────────────────────────────
function authGetAdminCredential() {
  try {
    var raw = localStorage.getItem(AUTH_ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

async function authSetAdminPassword(newPassword) {
  var cred = await makeCredential(newPassword);
  localStorage.setItem(AUTH_ADMIN_KEY, JSON.stringify(cred));
}

// ── Gestion des comptes utilisateurs (localStorage) ──────────────────────────
function authGetAllAccounts() {
  var adminCred = authGetAdminCredential();
  // L'admin est toujours en tête ; son credential est stocké séparément
  var adminEntry = {
    username: AUTH_ADMIN_FALLBACK_USERNAME,
    displayName: AUTH_ADMIN_FALLBACK_DISPLAYNAME,
    credential: adminCred,
    isAdmin: true
  };
  try {
    var raw = localStorage.getItem(AUTH_USERS_KEY);
    var extra = raw ? JSON.parse(raw) : [];
    return [adminEntry].concat(extra.filter(function(u){
      return u.username.toLowerCase() !== AUTH_ADMIN_FALLBACK_USERNAME;
    }));
  } catch(e) { return [adminEntry]; }
}

function authSaveExtraAccounts(extra) {
  // Ne jamais sauvegarder le compte admin dans la liste extra
  var filtered = extra.filter(function(u){
    return u.username.toLowerCase() !== AUTH_ADMIN_FALLBACK_USERNAME;
  });
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(filtered));
}

async function authAddUser(username, displayName, password) {
  username = username.trim().toLowerCase();
  displayName = displayName.trim();
  if (!username || !displayName || !password) return { ok: false, msg: "Tous les champs sont requis." };
  var all = authGetAllAccounts();
  if (all.find(function(u){ return u.username === username; })) {
    return { ok: false, msg: "Cet identifiant existe déjà." };
  }
  var cred = await makeCredential(password);
  var extra = all.filter(function(u){ return u.username !== AUTH_ADMIN_FALLBACK_USERNAME; });
  extra.push({ username: username, displayName: displayName, credential: cred });
  authSaveExtraAccounts(extra);
  return { ok: true };
}

function authDeleteUser(username) {
  if (username.toLowerCase() === AUTH_ADMIN_FALLBACK_USERNAME) return; // protégé
  var all = authGetAllAccounts();
  var extra = all.filter(function(u){
    return u.username !== AUTH_ADMIN_FALLBACK_USERNAME && u.username !== username;
  });
  authSaveExtraAccounts(extra);
}

// ── État de session ───────────────────────────────────────────────────────────
function authGetCurrentUser() {
  try {
    var raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function authIsLoggedIn() {
  return authGetCurrentUser() !== null;
}

function authSetUser(account) {
  // Ne stocker que les infos d'affichage, jamais le credential
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: account.username,
    displayName: account.displayName,
    isAdmin: !!account.isAdmin
  }));
}

function authLogout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  showAuthToast("Déconnecté");
}

// ── Tentative de connexion ────────────────────────────────────────────────────
async function authLogin(username, password) {
  var accounts = authGetAllAccounts();
  var account = accounts.find(function(a){
    return a.username.toLowerCase() === username.toLowerCase().trim();
  });
  if (!account) {
    return false;
  }
  var ok = await verifyCredential(password, account.credential);
  if (ok) {
    authSetUser(account);
    closeAuthModal();
    applyAuthUI();
    showAuthToast("Connecté en tant que " + account.displayName);
    return true;
  }
  return false;
}

// ── UI Auth ───────────────────────────────────────────────────────────────────
function showAuthToast(msg) {
  if (typeof showToast === 'function') showToast(msg, 'ok', 2500);
}

function closeAuthModal() {
  var modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('open');
}

function applyAuthUI() {
  var user = authGetCurrentUser();
  var loggedIn = !!user;

  var authBtn = document.getElementById('authBtn');
  var authLabel = document.getElementById('authLabel');
  var logoutBtn = document.getElementById('logoutBtn');
  var usersBtn = document.getElementById('usersBtn');

  if (authLabel) authLabel.textContent = loggedIn ? (user.displayName || user.username) : 'Connexion';
  if (logoutBtn) logoutBtn.style.display = loggedIn ? '' : 'none';
  if (authBtn) authBtn.style.display = loggedIn ? 'none' : '';

  // Bouton Utilisateurs (visible admin seulement)
  var isAdmin = user && user.username === AUTH_ADMIN_FALLBACK_USERNAME;
  if (usersBtn) usersBtn.style.display = isAdmin ? '' : 'none';

  // Afficher/cacher les éléments nécessitant une connexion
  document.querySelectorAll('[data-auth-required]').forEach(function(el){
    el.style.display = loggedIn ? '' : 'none';
  });
}

// ── Initialisation du module auth ─────────────────────────────────────────────
function initAuth() {
  applyAuthUI();

  // Vérifier si l'admin n'a pas encore de mot de passe configuré
  var adminCred = authGetAdminCredential();
  if (!adminCred) {
    // Afficher un avertissement pour forcer la configuration du mot de passe admin
    setTimeout(function(){
      showToast('⚠ Configurez le mot de passe administrateur dans Paramètres → Utilisateurs', 'warn', 8000);
    }, 1500);
  }

  var loginBtn = document.getElementById('authLoginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async function(){
      var username = (document.getElementById('authUsername').value || '').trim();
      var password = document.getElementById('authPassword').value;
      document.getElementById('authPassword').value = '';
      if (!username || !password) {
        showToast('Identifiant et mot de passe requis', 'warn', 3000);
        return;
      }
      var ok = await authLogin(username, password);
      if (!ok) {
        showToast('Identifiant ou mot de passe incorrect', 'err', 3000);
      }
    });
  }

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(){
      authLogout();
      applyAuthUI();
    });
  }

  var openAuthBtn = document.getElementById('authBtn');
  if (openAuthBtn) {
    openAuthBtn.addEventListener('click', function(){
      var modal = document.getElementById('authModal');
      if (modal) modal.classList.add('open');
      var fields = ['authUsername', 'authPassword'];
      fields.forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
    });
  }

  // Panneau de gestion des utilisateurs (admin)
  var usersBtn = document.getElementById('usersBtn');
  if (usersBtn) {
    usersBtn.addEventListener('click', function(){
      refreshUsersList();
      var panel = document.getElementById('usersPanel');
      if (panel) panel.classList.toggle('open');
    });
  }

  var addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', async function(){
      var username = (document.getElementById('newUserUsername').value || '').trim();
      var display  = (document.getElementById('newUserDisplay').value || '').trim();
      var password = (document.getElementById('newUserPassword').value || '').trim();
      var result   = await authAddUser(username, display, password);
      if (result.ok) {
        showToast('Utilisateur créé', 'ok', 2500);
        document.getElementById('newUserUsername').value = '';
        document.getElementById('newUserDisplay').value  = '';
        document.getElementById('newUserPassword').value = '';
        refreshUsersList();
      } else {
        showToast(result.msg, 'err', 3000);
      }
    });
  }

  // Changement mot de passe admin
  var setAdminPwBtn = document.getElementById('setAdminPwBtn');
  if (setAdminPwBtn) {
    setAdminPwBtn.addEventListener('click', async function(){
      var pw1 = (document.getElementById('adminPw1') || {}).value || '';
      var pw2 = (document.getElementById('adminPw2') || {}).value || '';
      if (!pw1 || pw1.length < 8) { showToast('Mot de passe trop court (8 car. min)', 'err', 3000); return; }
      if (pw1 !== pw2) { showToast('Les mots de passe ne correspondent pas', 'err', 3000); return; }
      await authSetAdminPassword(pw1);
      document.getElementById('adminPw1').value = '';
      document.getElementById('adminPw2').value = '';
      showToast('Mot de passe administrateur mis à jour', 'ok', 3000);
    });
  }
}

function refreshUsersList() {
  var list = document.getElementById('usersListContainer');
  if (!list) return;
  var accounts = authGetAllAccounts();
  var u = authGetCurrentUser();
  list.innerHTML = accounts.map(function(a){
    var isAdmin = a.username === AUTH_ADMIN_FALLBACK_USERNAME;
    var isSelf  = u && u.username === a.username;
    var noCredWarning = isAdmin && !authGetAdminCredential()
      ? ' <span style="color:#A32D2D;font-size:11px;">⚠ mot de passe non défini</span>' : '';
    return '<div class="user-row">'
      + '<span class="user-display">'+escapeHtml(a.displayName)+'</span>'
      + '<span class="user-name">@'+escapeHtml(a.username)+'</span>'
      + noCredWarning
      + (!isAdmin && !isSelf
          ? '<button class="user-delete-btn" data-username="'+escapeHtml(a.username)+'"><i class="ti ti-trash"></i></button>'
          : '<span style="font-size:11px;color:var(--ink-soft)">'+(isAdmin?'admin':''+(isSelf?' (vous)':''))+'</span>')
      + '</div>';
  }).join('');

  list.querySelectorAll('.user-delete-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var uname = btn.getAttribute('data-username');
      if (confirm('Supprimer l\'utilisateur "' + uname + '" ?')) {
        authDeleteUser(uname);
        refreshUsersList();
        showToast('Utilisateur supprimé', 'ok', 2000);
      }
    });
  });
}

// Afficher/cacher le bouton Utilisateurs selon le statut admin
function updateUsersButtonVisibility() {
  var user = authGetCurrentUser();
  var isAdmin = user && user.username === AUTH_ADMIN_FALLBACK_USERNAME;
  var usersBtn = document.getElementById('usersBtn');
  if (usersBtn) usersBtn.style.display = isAdmin ? '' : 'none';
}