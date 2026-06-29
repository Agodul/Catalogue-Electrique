"use strict";

// ── Compte admin de secours (toujours actif, non modifiable) ─
var AUTH_ADMIN_FALLBACK = {
  username: "admin",
  displayName: "Administrateur",
  passwordHash: "84b5514fd9e2a1ce65bb7e0a4ab0112ecd2cce4aa5ced9445f97ece6a23914d4",
  isAdmin: true
};

var AUTH_SESSION_KEY  = "spi_auth_user";
var AUTH_USERS_KEY    = "spi_auth_users";  // localStorage

// ── Gestion des comptes (localStorage) ──────────────────────
function authGetAllAccounts() {
  try {
    var raw = localStorage.getItem(AUTH_USERS_KEY);
    var extra = raw ? JSON.parse(raw) : [];
    // Le compte admin de secours est toujours en tête
    return [AUTH_ADMIN_FALLBACK].concat(extra.filter(function(u){
      return u.username.toLowerCase() !== "admin";
    }));
  } catch(e) { return [AUTH_ADMIN_FALLBACK]; }
}

function authSaveExtraAccounts(accounts) {
  // Ne jamais sauvegarder le compte admin de secours
  var extra = accounts.filter(function(u){
    return u.username.toLowerCase() !== "admin";
  });
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(extra));
}

async function authAddUser(username, displayName, password) {
  username = username.trim().toLowerCase();
  displayName = displayName.trim();
  if (!username || !displayName || !password) return { ok: false, msg: "Tous les champs sont requis." };
  var all = authGetAllAccounts();
  if (all.find(function(u){ return u.username === username; })) {
    return { ok: false, msg: "Cet identifiant existe déjà." };
  }
  var hash = await sha256(password);
  var extra = all.filter(function(u){ return u.username !== "admin"; });
  extra.push({ username: username, displayName: displayName, passwordHash: hash });
  authSaveExtraAccounts(extra);
  return { ok: true };
}

function authDeleteUser(username) {
  if (username.toLowerCase() === "admin") return; // protégé
  var all = authGetAllAccounts();
  var extra = all.filter(function(u){
    return u.username !== "admin" && u.username !== username;
  });
  authSaveExtraAccounts(extra);
}

// ── Utilitaire SHA-256 (Web Crypto API natif) ────────────────
async function sha256(message) {
  var msgBuffer = new TextEncoder().encode(message.toLowerCase().trim());
  var hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function(b){ return b.toString(16).padStart(2,"0"); }).join("");
}

// ── État de session ──────────────────────────────────────────
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
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    username: account.username,
    displayName: account.displayName
  }));
}

function authLogout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  applyAuthUI();
  showAuthToast("Déconnecté");
}

// ── Tentative de connexion ───────────────────────────────────
async function authLogin(username, password) {
  var hash = await sha256(password);
  var accounts = authGetAllAccounts();
  var account = accounts.find(function(a){
    return a.username.toLowerCase() === username.toLowerCase().trim()
        && a.passwordHash === hash;
  });
  if (account) {
    authSetUser(account);
    closeAuthModal();
    applyAuthUI();
    showAuthToast("Connecté en tant que " + account.displayName);
    return true;
  }
  return false;
}

// ── Appliquer l'UI selon l'état de connexion ─────────────────
function applyAuthUI() {
  var loggedIn = authIsLoggedIn();
  var user     = authGetCurrentUser();

  // Corps de page : classe pour CSS
  document.body.classList.toggle("auth-readonly", !loggedIn);

  // Bouton "Ajouter un produit"
  var btnAdd = document.getElementById("btnAdd");
  if (btnAdd) btnAdd.style.display = loggedIn ? "" : "none";

  // Bouton FAB +
  var btnFabAdd = document.getElementById("btnFabAdd");
  if (btnFabAdd) btnFabAdd.style.display = loggedIn ? "" : "none";

  // Bouton "i" (menu actions fiche produit) — masqué si non connecté
  var vmInfoBtn = document.getElementById("vmInfoBtn");
  if (vmInfoBtn) vmInfoBtn.style.display = loggedIn ? "" : "none";

  // Bouton connexion / déconnexion dans le header
  updateAuthHeaderBtn(loggedIn, user);
  // Bouton Utilisateurs (visible admin seulement)
  applyUserSettingsBtnVisibility();
}

// ── Bouton login/logout dans le header ──────────────────────
function updateAuthHeaderBtn(loggedIn, user) {
  var btn = document.getElementById("btnAuthToggle");
  if (!btn) return;
  if (loggedIn) {
    btn.title = "Déconnexion (" + user.displayName + ")";
    btn.innerHTML = '<i class="ti ti-logout" aria-hidden="true"></i>';
    btn.onclick = function(){ authLogout(); };
  } else {
    btn.title = "Se connecter";
    btn.innerHTML = '<i class="ti ti-login" aria-hidden="true"></i>';
    btn.onclick = function(){ openAuthModal(); };
  }
}

// ── Modale login ─────────────────────────────────────────────
function openAuthModal() {
  var overlay = document.getElementById("authOverlay");
  if (!overlay) return;
  document.getElementById("authUsername").value = "";
  document.getElementById("authPassword").value = "";
  document.getElementById("authError").textContent = "";
  overlay.classList.add("show");
  setTimeout(function(){ document.getElementById("authUsername").focus(); }, 100);
}

function closeAuthModal() {
  var overlay = document.getElementById("authOverlay");
  if (overlay) overlay.classList.remove("show");
}

async function submitAuthForm() {
  var username = document.getElementById("authUsername").value;
  var password = document.getElementById("authPassword").value;
  var errorEl  = document.getElementById("authError");
  var btn      = document.getElementById("authSubmitBtn");

  if (!username || !password) {
    errorEl.textContent = "Veuillez remplir tous les champs.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Vérification…";

  var ok = await authLogin(username, password);
  if (!ok) {
    errorEl.textContent = "Identifiant ou mot de passe incorrect.";
    document.getElementById("authPassword").value = "";
  }

  btn.disabled = false;
  btn.textContent = "Se connecter";
}

// ── Toast discret ─────────────────────────────────────────────
function showAuthToast(msg) {
  var t = document.getElementById("authToast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(function(){ t.classList.remove("show"); }, 2500);
}


// ── Gestion utilisateurs (sous-page Paramètres) ──────────────
function openUserSettingsPage() {
  var main = document.querySelector(".settings-body");
  var page = document.getElementById("settingsUserPage");
  if (!main || !page) return;
  main.style.display = "none";
  page.style.display = "flex";
  renderUserList();
}

function closeUserSettingsPage() {
  var main = document.querySelector(".settings-body");
  var page = document.getElementById("settingsUserPage");
  if (!main || !page) return;
  page.style.display = "none";
  main.style.display = "";
}

function renderUserList() {
  var list = document.getElementById("userList");
  if (!list) return;
  var accounts = authGetAllAccounts();
  list.innerHTML = accounts.map(function(u) {
    var isAdmin = u.username === "admin";
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;background:var(--paper-card);">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:600;color:var(--ink);">' + u.displayName + '</div>' +
        '<div style="font-size:11px;color:var(--ink-soft);">' + u.username + (isAdmin ? ' · Admin' : '') + '</div>' +
      '</div>' +
      (isAdmin ? '' :
        '<button onclick="authDeleteUser(\'' + u.username + '\');renderUserList();" ' +
        'style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:18px;padding:4px;display:flex;align-items:center;" title="Supprimer">' +
        '<i class="ti ti-trash"></i></button>') +
    '</div>';
  }).join("");
}

function initUserSettingsPage() {
  var btnOpen = document.getElementById("btnOpenUserSettings");
  if (btnOpen) {
    btnOpen.addEventListener("click", openUserSettingsPage);
  }
  var btnBack = document.getElementById("btnUserPageBack");
  if (btnBack) {
    btnBack.addEventListener("click", closeUserSettingsPage);
  }
  var btnAdd = document.getElementById("btnAddUser");
  if (btnAdd) {
    btnAdd.addEventListener("click", async function() {
      var username = (document.getElementById("newUserUsername").value || "").trim();
      var display  = (document.getElementById("newUserDisplay").value  || "").trim();
      var password = (document.getElementById("newUserPassword").value || "").trim();
      var errEl    = document.getElementById("newUserError");
      var result   = await authAddUser(username, display, password);
      if (result.ok) {
        document.getElementById("newUserUsername").value = "";
        document.getElementById("newUserDisplay").value  = "";
        document.getElementById("newUserPassword").value = "";
        errEl.textContent = "";
        renderUserList();
      } else {
        errEl.textContent = result.msg;
      }
    });
  }
}

// Afficher/cacher le bouton Utilisateurs selon le statut admin
function applyUserSettingsBtnVisibility() {
  var btn = document.getElementById("btnOpenUserSettings");
  if (!btn) return;
  var user = authGetCurrentUser();
  var isAdmin = user && user.username === "admin";
  btn.style.display = isAdmin ? "flex" : "none";
}


// ── Fix iOS : scroll l'input dans la zone visible quand le clavier s'ouvre ──
(function(){
  if(!/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  document.addEventListener('focusin', function(e){
    var el = e.target;
    if(el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    setTimeout(function(){
      el.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 300);
  });
})();

// ── Init ──────────────────────────────────────────────────────
function initAuth() {
  // Fermer modale sur clic overlay
  var overlay = document.getElementById("authOverlay");
  if (overlay) {
    // La modale ne se ferme PAS en cliquant en dehors

  // Bouton croix pour fermer
  var closeBtn = document.getElementById("authCloseBtn");
  if (closeBtn) closeBtn.addEventListener("click", function(){ closeAuthModal(); });
  }

  // Soumettre avec Entrée
  var fields = ["authUsername", "authPassword"];
  fields.forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener("keydown", function(e){
      if (e.key === "Enter") submitAuthForm();
    });
  });

  // Bouton soumettre
  var btn = document.getElementById("authSubmitBtn");
  if (btn) btn.addEventListener("click", submitAuthForm);

  // Gestion sous-page utilisateurs
  initUserSettingsPage();
  // Appliquer l'UI au chargement
  applyAuthUI();
}

// Ré-appliquer les boutons Modifier/Supprimer à chaque ouverture de fiche
// (appelé depuis render.js après injection du DOM de la modale produit)
function authApplyOnProductModal() {
  var vmInfoBtn = document.getElementById("vmInfoBtn");
  var loggedIn  = authIsLoggedIn();
  if (vmInfoBtn) vmInfoBtn.style.display = loggedIn ? "" : "none";
}
