"use strict";

// ══════════════════════════════════════════════════════════════════════════
//  AUTH.JS — Authentification serveur JWT + fallback local
//  Catalogue Électrique — SPI Engineering
// ══════════════════════════════════════════════════════════════════════════

var AUTH_SESSION_KEY = "cat_auth_user";   // sessionStorage : { token, user }
var AUTH_SERVER_KEY  = "cat_server_url";  // localStorage : URL serveur

// Compte admin de secours (fallback hors ligne)
var AUTH_ADMIN_FALLBACK = {
  username:    "admin",
  displayName: "Administrateur",
  isAdmin:     true,
  credential: {
    salt: "6013d7f3f4f34ef0974632754e6d1386",
    hash: "70144e1536f3d16f5f218de0f16647f2205f4bd31d5bdb9ef9791c3c43da4506"
  }
};

var AUTH_ADMIN_KEY  = "cat_auth_admin";
var AUTH_USERS_KEY  = "cat_auth_users";

// ── Helpers session ──────────────────────────────────────────────────────

function _authGetSession() {
  try {
    var raw = sessionStorage.getItem(AUTH_SESSION_KEY);
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
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ token: token, user: user }));
}

function authClearUser() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function authSetUser(account) {
  // Fallback local (hors ligne)
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    token: null,
    user: {
      username:    account.username,
      displayName: account.displayName,
      isAdmin:     !!account.isAdmin,
      permissions: account.permissions || _defaultPermissions(account.isAdmin)
    }
  }));
}

function _defaultPermissions(isAdmin) {
  return {
    canEdit:        !!isAdmin,
    canDelete:      !!isAdmin,
    canManageUsers: !!isAdmin,
    canViewDocs:    true,
    canUploadDocs:  !!isAdmin,
    canExport:      !!isAdmin,
    canSyncServer:  !!isAdmin
  };
}

function authHasPermission(perm) {
  var u = authGetCurrentUser();
  if (!u) return false;
  if (u.isAdmin) return true;
  return u.permissions ? !!u.permissions[perm] : false;
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

async function authRefreshMe() {
  var sUrl  = localStorage.getItem(AUTH_SERVER_KEY);
  var token = authGetToken();
  if (!sUrl || !token) return false;
  try {
    var r = await fetch(sUrl + '/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!r.ok) {
      // Token expiré
      authClearUser();
      applyAuthUI();
      showAuthToast('Session expirée — veuillez vous reconnecter');
      return false;
    }
    var user = await r.json();
    authSetSession(token, Object.assign({ permissions: _defaultPermissions(user.isAdmin) }, user));
    return true;
  } catch(e) { return false; }
}

// Rafraîchir le token toutes les 30 min
setInterval(function() {
  if (authIsLoggedIn() && authGetToken()) authRefreshMe();
}, 30 * 60 * 1000);

// ── Authentification locale (fallback hors ligne) ────────────────────────

function authGetAdminCredential() {
  try {
    var raw = localStorage.getItem(AUTH_ADMIN_KEY);
    if (raw) return JSON.parse(raw);
    return AUTH_ADMIN_FALLBACK.credential || null;
  } catch(e) { return AUTH_ADMIN_FALLBACK.credential || null; }
}

function authGetAllAccounts() {
  var adminEntry = Object.assign({}, AUTH_ADMIN_FALLBACK, {
    credential: authGetAdminCredential()
  });
  try {
    var raw   = localStorage.getItem(AUTH_USERS_KEY);
    var extra = raw ? JSON.parse(raw) : [];
    return [adminEntry].concat(extra.filter(function(u) {
      return u.username.toLowerCase() !== 'admin';
    }));
  } catch(e) { return [adminEntry]; }
}

function authSaveExtraAccounts(accounts) {
  var extra = accounts.filter(function(u) {
    return u.username.toLowerCase() !== 'admin';
  });
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(extra));
}

async function sha256hex(str) {
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

async function authLoginLocal(username, password) {
  var accounts = authGetAllAccounts();
  var account  = accounts.find(function(a) {
    return a.username.toLowerCase() === username.toLowerCase();
  });
  if (!account || !account.credential) return false;
  var hash = await sha256hex(account.credential.salt + password);
  if (hash !== account.credential.hash) return false;
  authSetUser(account);
  return true;
}

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
      if (typeof startSyncPolling === 'function' && sUrl) startSyncPolling();
      // Import automatique du catalogue après login si pas encore de données
      var products = typeof window._getProducts === 'function' ? window._getProducts() : null;
      var needsImport = !products || products.length === 0;
      if(needsImport && typeof syncFromServer === 'function'){
        setTimeout(function(){ syncFromServer(false); }, 500);
      }
      return true;
    }
  }

  // 2. Fallback local (hors ligne ou serveur non configuré)
  var ok = await authLoginLocal(username, password);
  if (ok) {
    var user = authGetCurrentUser();
    closeAuthModal();
    applyAuthUI();
    showAuthToast('Connecté en tant que ' + (user ? user.displayName : username) + ' (mode local)');
    if (typeof startSyncPolling === 'function' && sUrl) startSyncPolling();
    return true;
  }

  return false;
}

// ── Logout ───────────────────────────────────────────────────────────────

function authLogout() {
  authLogoutServer(); // async, non bloquant
  authClearUser();
  applyAuthUI();
  showAuthToast('Déconnecté');
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

  // Sections admin
  var testSection = document.getElementById('settingsTestSection');
  if (testSection) testSection.style.display = isAdmin ? '' : 'none';

  // Bouton Utilisateurs : visible admin uniquement
  var btnUsers = document.getElementById('btnOpenUserSettings');
  if (btnUsers) btnUsers.style.display = isAdmin ? 'flex' : 'none';

  var btnFamilyIcons = document.getElementById('btnOpenFamilyIcons');
  if (btnFamilyIcons) btnFamilyIcons.style.display = isAdmin ? 'flex' : 'none';

  var serverButtonsSection = document.getElementById('serverButtonsSection');
  if (serverButtonsSection) serverButtonsSection.style.display = isAdmin ? '' : 'none';

  // Récupérer les permissions granulaires
  var perms = (user && user.permissions) || {};
  var canEdit        = isAdmin || !!perms.canEdit;
  var canDelete      = isAdmin || !!perms.canDelete;
  var canViewDocs    = isAdmin || !!perms.canViewDocs;
  var canUploadDocs  = isAdmin || !!perms.canUploadDocs;
  var canExport      = isAdmin || !!perms.canExport;
  var canSyncServer  = isAdmin || !!perms.canSyncServer;

  // Mode lecture seule
  document.body.classList.toggle('auth-readonly', !loggedIn);

  // Bouton ajouter produit
  var btnAdd = document.getElementById('btnAdd');
  if (btnAdd) btnAdd.style.display = canEdit ? '' : 'none';

  var btnFabAdd = document.getElementById('btnFabAdd');
  if (btnFabAdd) btnFabAdd.style.display = canEdit ? '' : 'none';

  // Bouton ⓘ — visible uniquement si canEdit ou canDelete
  var vmInfoBtn = document.getElementById('vmInfoBtn');
  var showInfo  = isAdmin || (loggedIn && (!!perms.canEdit || !!perms.canDelete));
  if (vmInfoBtn) vmInfoBtn.style.display = showInfo ? '' : 'none';

  // Export catalogue
  var btnExport = document.getElementById('btnExportJSON');
  if (btnExport) btnExport.style.display = canExport ? '' : 'none';
  var btnExportXlsx = document.getElementById('btnExportXLSX');
  if (btnExportXlsx) btnExportXlsx.style.display = canExport ? '' : 'none';

  // Sync serveur manuelle
  var serverButtonsSection = document.getElementById('serverButtonsSection');
  if (serverButtonsSection) serverButtonsSection.style.display = canSyncServer ? '' : 'none';

  // Exposer les permissions pour les autres modules
  window._userPerms = {
    canEdit, canDelete, canViewDocs, canUploadDocs, canExport, canSyncServer, isAdmin, loggedIn
  };

  updateAuthHeaderBtn(loggedIn, user);

  // Rafraîchir la page utilisateurs si ouverte (admin uniquement)
  if (isAdmin && typeof renderUserPage === 'function') renderUserPage();
}

function updateAuthHeaderBtn(loggedIn, user) {
  var btn = document.getElementById('btnAuthToggle');
  if (!btn) return;
  if (loggedIn) {
    btn.title = 'Connecté : ' + (user ? user.displayName : '');
    btn.innerHTML = '<i class="ti ti-logout" aria-hidden="true"></i>';
    btn.onclick = function() { authLogout(); };
  } else {
    btn.title = 'Se connecter';
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
  if (overlay) {
    overlay.classList.remove('show');
    document.body.classList.remove('modal-open');
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
      _bindAddUserForm(true);
      return;
    }
  }

  // Fallback local
  var localUsers = authGetAllAccounts();
  _renderUserList(container, localUsers, false);
  _bindAddUserForm(false);
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
    ? '<span style="font-size:11px;color:#166534;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:4px;padding:2px 7px;margin-left:8px;">🌐 Serveur</span>'
    : '<span style="font-size:11px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:4px;padding:2px 7px;margin-left:8px;">⚠️ Local</span>';

  window._cachedUsers = users; // pour récupérer les permissions au clic Modifier
  var header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;margin-bottom:12px;';
  header.innerHTML = '<span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-soft);">Utilisateurs</span>' + source;
  container.appendChild(header);

  users.forEach(function(u) {
    var isSelf   = user && u.username === user.username;
    var isAdminU = u.isAdmin || u.username === 'admin';
    var perms    = u.permissions || {};

    // Badges permissions
    var permBadges = '';
    if (isAdminU) {
      permBadges = '<span style="font-size:10px;background:#EEF4FF;color:#194093;border-radius:4px;padding:1px 6px;margin-right:3px;">Admin complet</span>';
    } else {
      var permList = [
        ['canEdit','Éditer'],['canDelete','Supprimer'],['canViewDocs','Docs'],
        ['canUploadDocs','Upload'],['canExport','Export'],['canSyncServer','Sync']
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
      + '<div style="font-size:13px;font-weight:600;color:var(--ink);">' + (u.displayName||u.username)
      + '<span style="font-size:11px;color:var(--ink-soft);font-weight:400;margin-left:6px;">@'+u.username+'</span></div>'
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
      if (!confirm('Supprimer l\'utilisateur "' + uname + '" ?')) return;
      var ok = await authDeleteUser(uname);
      if (ok) { showAuthToast('Utilisateur supprimé ✓'); renderUserPage(); }
      else showAuthToast('Erreur suppression', 'err', 3000);
    });
  });
}

function _bindAddUserForm(isServer) {
  var btn = document.getElementById('btnAddUser');
  if (!btn) return;
  var newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', async function() {
    var username = (document.getElementById('newUserUsername')||{value:''}).value.trim();
    var display  = (document.getElementById('newUserDisplay')||{value:''}).value.trim();
    var password = (document.getElementById('newUserPassword')||{value:''}).value;
    var errEl    = document.getElementById('newUserError');
    if (!username || !password) {
      if (errEl) errEl.textContent = 'Identifiant et mot de passe requis.';
      return;
    }
    if (isServer) {
      var ok = await authCreateUser({
        username:    username,
        displayName: display || username,
        password:    password,
        isAdmin:     false,
        permissions: _defaultPermissions(false)
      });
      if (ok) {
        if (errEl) errEl.textContent = '';
        ['newUserUsername','newUserDisplay','newUserPassword'].forEach(function(id){
          var el = document.getElementById(id);
          if (el) el.value = '';
        });
        showAuthToast('Utilisateur créé ✓');
        renderUserPage();
      } else {
        if (errEl) errEl.textContent = 'Erreur — identifiant déjà existant ou serveur inaccessible.';
      }
    }
  });
}

function openAddUserModal() {
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;';
  ov.innerHTML = '<div style="background:var(--paper-card);border-radius:12px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
    + '<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:16px;">Ajouter un utilisateur</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<input id="_nuUsername" placeholder="Identifiant" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_nuDisplay" placeholder="Nom affiché" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<input id="_nuPassword" type="password" placeholder="Mot de passe" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
    + '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;">'
    + '<input type="checkbox" id="_nuAdmin"> Administrateur</label>'
    + '</div>'
    + '<div id="_nuError" style="color:#991B1B;font-size:12px;margin-top:8px;display:none;"></div>'
    + '<div style="display:flex;gap:8px;margin-top:16px;">'
    + '<button id="_nuCancel" style="flex:1;padding:9px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--ink);font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>'
    + '<button id="_nuSubmit" style="flex:2;padding:9px;border-radius:8px;border:none;background:#194093;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">Créer l\'utilisateur</button>'
    + '</div></div>';
  document.body.appendChild(ov);

  ov.querySelector('#_nuCancel').onclick = function() { document.body.removeChild(ov); };
  ov.querySelector('#_nuSubmit').onclick = async function() {
    var username    = ov.querySelector('#_nuUsername').value.trim();
    var displayName = ov.querySelector('#_nuDisplay').value.trim();
    var password    = ov.querySelector('#_nuPassword').value;
    var isAdminNew  = ov.querySelector('#_nuAdmin').checked;
    var errEl       = ov.querySelector('#_nuError');

    if (!username || !password) {
      errEl.textContent = 'Identifiant et mot de passe requis.';
      errEl.style.display = '';
      return;
    }

    var ok = await authCreateUser({
      username:    username,
      displayName: displayName || username,
      password:    password,
      isAdmin:     isAdminNew,
      permissions: _defaultPermissions(isAdminNew)
    });

    if (ok) {
      document.body.removeChild(ov);
      showAuthToast('Utilisateur créé ✓');
      renderUserPage();
    } else {
      errEl.textContent = 'Erreur — identifiant déjà existant ou serveur inaccessible.';
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
  var PERM_LIST = [
    ['canEdit',       'Créer et modifier des produits'],
    ['canDelete',     'Supprimer des produits'],
    ['canViewDocs',   'Voir les documents PDF'],
    ['canUploadDocs', 'Uploader des documents PDF'],
    ['canExport',     'Exporter le catalogue'],
    ['canSyncServer', 'Synchronisation serveur']
  ];

  var safeTitleName = _escapeHtml(displayName || username);
  var safeDisplayValue = _escapeHtml(displayName || '');

  var permCheckboxes = PERM_LIST.map(function(p) {
    var checked = currentPerms[p[0]] ? ' checked' : '';
    var permKey = _escapeHtml(p[0]);
    var permLabel = _escapeHtml(p[1]);
    return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;padding:3px 0;">'
      + '<input type="checkbox" class="_euPerm" data-perm="'+permKey+'"'+checked+'> '+permLabel+'</label>';
  }).join('');

  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:10010;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
  ov.innerHTML = '<div style="background:var(--paper-card);border-radius:12px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
    + '<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:16px;">Modifier — ' + safeTitleName + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px;">'
    + '<input id="_euDisplay" placeholder="Nom affiché" value="' + safeDisplayValue + '" style="padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit;">'
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

// ── Init ─────────────────────────────────────────────────────────────────

function initAuth() {
  applyAuthUI();

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

  // Vérifier token au chargement
  if (authIsLoggedIn() && authGetToken()) {
    authRefreshMe();
  }
}

function authApplyOnProductModal() {
  var vmInfoBtn = document.getElementById('vmInfoBtn');
  // Utiliser les permissions déjà calculées dans applyAuthUI
  var showInfo = window._userPerms ? (window._userPerms.canEdit || window._userPerms.canDelete || window._userPerms.isAdmin) : false;
  if (vmInfoBtn) vmInfoBtn.style.display = showInfo ? '' : 'none';
}