/* =========================================================================
   serveur.js — accès au serveur du Catalogue Électrique

   Commandes IMMO n'a pas son propre compte/serveur : il réutilise tel quel
   celui du Catalogue (même origine, donc même localStorage — un identifiant
   déjà ouvert dans le Catalogue est vu ici sans reconnexion). Seules les clés
   et le format d'en-tête sont repris (voir AUTH_SESSION_KEY/AUTH_SERVER_KEY
   et authHeaders() dans ../../js/auth.js) : le fichier entier n'est PAS
   chargé ici, il pilote aussi tout l'écran de connexion du Catalogue
   (formulaire, rafraîchissement périodique de session, mise à jour de
   #hdrUsername...), qui n'a pas de sens sur cette page séparée.
   ========================================================================= */
(function () {
  "use strict";

  const AUTH_SESSION_KEY = "cat_auth_user";
  const AUTH_SERVER_KEY = "cat_server_url";

  function session() {
    try {
      const raw = localStorage.getItem(AUTH_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  const Serveur = {};

  Serveur.url = () => localStorage.getItem(AUTH_SERVER_KEY);
  Serveur.connecte = () => session() !== null && !!Serveur.url();
  Serveur.utilisateur = () => { const s = session(); return s ? (s.user || s) : null; };
  /** Configuration (sites, entités, signataire, modèles Word...) n'est
   *  ouverte qu'aux administrateurs du Catalogue — même notion que
   *  user.isAdmin côté serveur (voir user_row_to_public, security.py). */
  Serveur.estAdmin = () => { const u = Serveur.utilisateur(); return !!(u && u.isAdmin); };

  function enTetes(avecJson) {
    const s = session();
    const h = {};
    if (avecJson) h["Content-Type"] = "application/json";
    if (s && s.token) h["Authorization"] = "Bearer " + s.token;
    return h;
  }

  /** Requête brute vers le serveur du Catalogue. `opts.corpsJSON`, s'il est
   *  fourni, est sérialisé et poste la bonne en-tête Content-Type — sinon
   *  (ex. FormData pour l'envoi d'un modèle Word) `opts.body` est transmis
   *  tel quel, sans Content-Type forcé : le navigateur doit poser lui-même
   *  la frontière multipart. */
  Serveur.requete = async function (chemin, opts) {
    const base = Serveur.url();
    if (!base) throw new Error("Aucun serveur du Catalogue configuré sur cet appareil.");
    if (!Serveur.connecte()) throw new Error("Connectez-vous au Catalogue Électrique pour utiliser Commandes IMMO.");
    const o = Object.assign({}, opts);
    o.headers = Object.assign(enTetes(o.corpsJSON !== undefined), o.headers || {});
    if (o.corpsJSON !== undefined) {
      o.method = o.method || "POST";
      o.body = JSON.stringify(o.corpsJSON);
      delete o.corpsJSON;
    }
    const r = await fetch(base + chemin, o);
    if (r.status === 401) throw new Error("Session expirée — reconnectez-vous depuis le Catalogue Électrique.");
    if (!r.ok) throw new Error("Erreur serveur (" + r.status + ") sur " + chemin);
    return r;
  };

  /** Même chose, mais lit directement la réponse JSON (cas le plus courant :
   *  config, liste des commandes). */
  Serveur.requeteJSON = async function (chemin, opts) {
    const r = await Serveur.requete(chemin, opts);
    if (r.status === 204) return null;
    const texte = await r.text();
    return texte ? JSON.parse(texte) : null;
  };

  window.Serveur = Serveur;
})();
