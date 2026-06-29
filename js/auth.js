// ============================================================
// auth.js — Authentification locale (SHA-256, sessionStorage)
// ============================================================
// Pour ajouter un compte : copier un objet dans ACCOUNTS et
// remplacer passwordHash par le hash SHA-256 du mot de passe.
// Outil en ligne pour générer un hash : https://emn178.github.io/online-tools/sha256.html
// ============================================================
"use strict";

// ── Comptes autorisés ────────────────────────────────────────
// passwordHash = SHA-256 du mot de passe en minuscules
var AUTH_ACCOUNTS = [
  {
    username: "admin",
    displayName: "Administrateur",
    // Mot de passe par défaut : spi2024
    // Pour changer : générer le SHA-256 du nouveau mot de passe
    passwordHash: "84b5514fd9e2a1ce65bb7e0a4ab0112ecd2cce4aa5ced9445f97ece6a23914d4"
  },
  {
    username: "simon",
    displayName: "Simon",
    passwordHash: "faa53a912302e80abe48c94c0487c1c6e1d791b8734ea0c23c42f7694670efe3"
  }
];

var AUTH_SESSION_KEY = "spi_auth_user";

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
  var account = AUTH_ACCOUNTS.find(function(a){
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

  // Bouton "i" (menu actions fiche produit) — masqué si non connecté
  var vmInfoBtn = document.getElementById("vmInfoBtn");
  if (vmInfoBtn) vmInfoBtn.style.display = loggedIn ? "" : "none";

  // Bouton connexion / déconnexion dans le header
  updateAuthHeaderBtn(loggedIn, user);
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