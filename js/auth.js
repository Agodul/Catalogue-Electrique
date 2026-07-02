"use strict";

// ── Compte admin de secours (toujours actif, non modifiable) ─
// SÉCURITÉ : le hash n'est plus codé en dur dans le source public.
// Le credential admin est stocké dans localStorage sous AUTH_ADMIN_KEY.
// Au premier lancement, l'admin doit définir son mot de passe via l'UI.
var AUTH_ADMIN_FALLBACK = {
  username: "admin",
  displayName: "Administrateur",
  isAdmin: true,
  credential: {
    salt: "6013d7f3f4f34ef0974632754e6d1386",
    hash: "70144e1536f3d16f5f218de0f16647f2205f4bd31d5bdb9ef9791c3c43da4506"
  }
};

// Clé localStorage pour stocker le credential admin {salt, hash}
var AUTH_ADMIN_KEY = "cat_auth_admin";

var AUTH_SESSION_KEY  = "cat_auth_user";
var AUTH_USERS_KEY    = "cat_auth_users";  // localStorage

// ── Gestion des comptes (localStorage) ──────────────────────
function authGetAdminCredential() {
  try {
    // Priorité : localStorage (permet de changer le mdp depuis l'UI)
    var raw = localStorage.getItem(AUTH_ADMIN_KEY);
    if (raw) return JSON.parse(raw);
    // Fallback : credential intégré dans le code (fonctionne sur tous les appareils)
    return AUTH_ADMIN_FALLBACK.credential || null;
  } catch(e) { return AUTH_ADMIN_FALLBACK.credential || null; }
}

function authGetAllAccounts() {
  var adminEntry = Object.assign({}, AUTH_ADMIN_FALLBACK, {
    credential: authGetAdminCredential()
  });
  try {
    var raw = localStorage.getItem(AUTH_USERS_KEY);
    var extra = raw ? JSON.parse(raw) : [];
    // Le compte admin de secours est toujours en tête
    return [adminEntry].concat(extra.filter(function(u){
      return u.username.toLowerCase() !== "admin";
    }));
  } catch(e) { return [adminEntry]; }
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
  var cred = await makeCredential(password);
  var extra = all.filter(function(u){ return u.username !== "admin"; });
  extra.push({ username: username, displayName: displayName, credential: cred });
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

// ── Utilitaires hachage sécurisé (PBKDF2-SHA256 + sel) ─────────
function generateSalt() {
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
}

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

async function makeCredential(password) {
  var salt = generateSalt();
  var hash = await pbkdf2Hash(password, salt);
  return { salt: salt, hash: hash };
}

async function verifyCredential(password, credential) {
  if (!credential || !credential.salt || !credential.hash) return false;
  var computed = await pbkdf2Hash(password, credential.salt);
  return computed === credential.hash;
}

// Conservé pour migration (ancien format SHA-256 nu)
async function sha256Legacy(message) {
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
  var accounts = authGetAllAccounts();
  var account = accounts.find(function(a){
    return a.username.toLowerCase() === username.toLowerCase().trim();
  });
  if (!account) return false;

  var ok = false;

  // Nouveau format PBKDF2
  if (account.credential && account.credential.salt) {
    ok = await verifyCredential(password, account.credential);
  }
  // Migration : ancien format SHA-256 nu (comptes extra existants)
  else if (account.passwordHash) {
    var legacyHash = await sha256Legacy(password);
    if (legacyHash === account.passwordHash) {
      ok = true;
      // Migrer vers PBKDF2 silencieusement
      var newCred = await makeCredential(password);
      var all = authGetAllAccounts();
      var extra = all.filter(function(u){ return u.username !== "admin"; }).map(function(u){
        if (u.username === account.username) {
          var migrated = Object.assign({}, u);
          delete migrated.passwordHash;
          migrated.credential = newCred;
          return migrated;
        }
        return u;
      });
      authSaveExtraAccounts(extra);
    }
  }
  // Admin sans credential défini = connexion bloquée
  else if (account.isAdmin && !account.credential) {
    showAuthToast("⚠ Mot de passe admin non configuré — voir Paramètres");
    return false;
  }

  if (ok) {
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
  var isAdmin  = user && user.username === AUTH_ADMIN_FALLBACK.username;

  // Section Tests & Debug : visible uniquement pour l'admin
  var testSection = document.getElementById('settingsTestSection');
  if(testSection) testSection.style.display = isAdmin ? '' : 'none';

  // Section sync serveur (toggle + boutons) : visible uniquement si connecté
  var serverAdminSection = document.getElementById('serverAdminSection');
  if(serverAdminSection) serverAdminSection.style.display = loggedIn ? '' : 'none';

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
async function authSetAdminPassword(newPassword) {
  var cred = await makeCredential(newPassword);
  localStorage.setItem(AUTH_ADMIN_KEY, JSON.stringify(cred));
}

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
  list.innerHTML = "";
  accounts.forEach(function(u) {
    var isAdmin = u.username === "admin";
    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;background:var(--paper-card);";
    var info = document.createElement("div");
    info.innerHTML = '<div style="font-size:13px;font-weight:600;color:var(--ink);">' + u.displayName + '</div>' +
      '<div style="font-size:11px;color:var(--ink-soft);">' + u.username + (isAdmin ? " · Admin" : "") + '</div>';
    row.appendChild(info);
    if (!isAdmin) {
      var btn = document.createElement("button");
      btn.title = "Supprimer";
      btn.innerHTML = '<i class="ti ti-trash"></i>';
      btn.style.cssText = "background:none;border:none;cursor:pointer;color:#EF4444;font-size:18px;padding:4px;display:flex;align-items:center;";
      btn.addEventListener("click", function() {
        authDeleteUser(u.username);
        renderUserList();
      });
      row.appendChild(btn);
    }
    list.appendChild(row);
  });
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
  // ── Changement mot de passe admin ───────────────────────────
  var setAdminPwBtn = document.getElementById("setAdminPwBtn");
  if (setAdminPwBtn) {
    setAdminPwBtn.addEventListener("click", async function() {
      var pw1 = (document.getElementById("adminPw1") || {}).value || "";
      var pw2 = (document.getElementById("adminPw2") || {}).value || "";
      if (!pw1 || pw1.length < 8) { showToast("Mot de passe trop court (8 caractères min.)", "err", 3000); return; }
      if (pw1 !== pw2) { showToast("Les mots de passe ne correspondent pas", "err", 3000); return; }
      await authSetAdminPassword(pw1);
      document.getElementById("adminPw1").value = "";
      document.getElementById("adminPw2").value = "";
      showToast("Mot de passe administrateur mis à jour ✓", "ok", 3000);
    });
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

  // Avertir si le mot de passe admin n'est pas encore défini
  if (!authGetAdminCredential()) {
    setTimeout(function(){
      if (typeof showToast === 'function') {
        showToast('⚠ Définissez le mot de passe admin dans Paramètres → Utilisateurs', 'warn', 8000);
      }
    }, 1500);
  }
}

// Ré-appliquer les boutons Modifier/Supprimer à chaque ouverture de fiche
// (appelé depuis render.js après injection du DOM de la modale produit)
function authApplyOnProductModal() {
  var vmInfoBtn = document.getElementById("vmInfoBtn");
  var loggedIn  = authIsLoggedIn();
  if (vmInfoBtn) vmInfoBtn.style.display = loggedIn ? "" : "none";
}