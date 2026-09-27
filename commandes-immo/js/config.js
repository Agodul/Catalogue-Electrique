/* =========================================================================
   config.js — configuration par défaut et accès à la base

   Vide au premier lancement, comme le Catalogue Électrique lui-même (0
   produit tant que rien n'a été ajouté) : ni adresse, ni modèle Word ne sont
   pré-remplis dans le code — tout vit désormais sur le serveur (retour
   utilisateur : "les modèles Word vont être stockés sur le serveur ainsi que
   les différentes adresses [...] je veux que ce soit vide comme pour le
   catalogue"), à saisir une fois dans l'écran Configuration puis partagé par
   toute l'équipe. Les sites eux-mêmes ne sont plus une liste figée dans le
   code : comme le carnet de fournisseurs, ce sont des entrées ajoutées/
   retirées depuis l'écran Configuration (retour utilisateur : "pour la liste
   des sites elle se fera comme pour la liste des fournisseurs [...] je ne
   veux rien en dur"), voir C.ajouterSite/C.supprimerSite plus bas.

   Le signataire et son tampon n'ont PAS leur place ici : propres à la
   personne qui signe, pas à l'équipe (retour utilisateur : "la signature est
   propre au user pas au serveur") — voir signature.js, en localStorage.
   ========================================================================= */
(function () {
  "use strict";

  const CONFIG_INITIALE = {
    version: 1,
    entites: {
      SPI: { code: "SPI", libelle: "SPI", factNom: "", factLignes: [], reglementDefaut: "" },
      SPIL: { code: "SPIL", libelle: "SPIL (SPI Logistic)", factNom: "", factLignes: [], reglementDefaut: "" },
    },
    // [{ code: "VENDIN", nom: "Vendin", entites: [], livNom: "", livLignes: [] }]
    sites: [],
    // [{ nom: "ETS DUPONT", commerciaux: ["M. Martin", …] }]
    fournisseurs: [],
    repartitionValidee: false,  // passe à true quand un admin a vérifié SPI/SPIL
  };

  const C = {
    base: null, // { config, commandes: [] }
  };

  C.baseVide = () => ({ config: U.copieProfonde(CONFIG_INITIALE), commandes: [] });

  /** Charge la configuration ET les commandes depuis le serveur du Catalogue
   *  Électrique (voir serveur.js) — partagées par toute l'équipe, plus
   *  propres à cet appareil (retour utilisateur : "le projet commande immo
   *  doit fonctionner avec le serveur du catalogue"). La configuration est
   *  complétée avec les champs par défaut absents, utile si sa forme évolue
   *  entre deux versions de l'outil. */
  C.charger = async function () {
    const configServeur = await Serveur.requeteJSON("/commandesImmoConfig");
    const commandesServeur = (await Serveur.requeteJSON("/commandesImmoOrders")) || [];
    const base = {
      config: fusionner(U.copieProfonde(CONFIG_INITIALE), configServeur || {}),
      commandes: commandesServeur,
    };
    normaliserFournisseurs(base.config);
    normaliserSites(base.config);
    C.base = base;
    return base;
  };

  /** N'enregistre que la CONFIGURATION (signataire, sites, entités,
   *  fournisseurs, tampon...) — une seule ligne côté serveur, partagée par
   *  toute l'équipe. Les commandes, elles, s'enregistrent individuellement
   *  (voir C.sauverCommande/C.supprimerCommande ci-dessous) : renvoyer toute
   *  la base à chaque commande créée/modifiée écraserait sans le savoir une
   *  commande qu'un autre poste vient d'ajouter entre-temps. */
  C.enregistrer = async function () {
    await Serveur.requete("/commandesImmoConfig", { method: "PUT", corpsJSON: C.base.config });
  };

  /** Crée ou remplace UNE commande sur le serveur. L'id est choisi côté
   *  CLIENT dès la création (voir U.identifiant, utils.js) et inclus dans
   *  `commande` : le serveur fait un upsert dessus (POST sert donc aussi
   *  bien à créer qu'à mettre à jour, voir commandesimmo_routes.py côté
   *  serveur). */
  C.sauverCommande = async function (commande) {
    await Serveur.requete("/commandesImmoOrders", { method: "POST", corpsJSON: commande });
  };

  C.supprimerCommande = async function (id) {
    await Serveur.requete("/commandesImmoOrders/" + encodeURIComponent(id), { method: "DELETE" });
  };

  /** Restaure une sauvegarde exportée (voir App.importerBase, app.js) :
   *  remplace la configuration ET la totalité des commandes sur le serveur —
   *  toutes les commandes actuellement sur le serveur sont supprimées avant
   *  d'y recréer celles de la sauvegarde, pour un remplacement fidèle plutôt
   *  qu'une simple fusion. */
  C.remplacerTout = async function (base) {
    await Serveur.requete("/commandesImmoConfig", { method: "PUT", corpsJSON: base.config || {} });
    for (const ancienne of C.commandes()) {
      try { await C.supprimerCommande(ancienne.id); }
      catch (e) { console.warn("suppression impossible pendant la restauration", ancienne.id, e); }
    }
    for (const commande of (base.commandes || [])) {
      await C.sauverCommande(commande);
    }
    await C.charger();
  };

  /** Le rattachement était une entité unique (`entite`). Il devient une
   *  liste (`entites`), un site pouvant relever de SPI et de SPIL à la fois.
   *  Les configurations existantes sont reprises sans perte. */
  function normaliserSites(config) {
    for (const s of config.sites || []) {
      if (!Array.isArray(s.entites)) {
        s.entites = s.entite ? [s.entite] : [];
      }
      s.entites = s.entites.filter((e) => config.entites[e]);
      delete s.entite;
      if (!Array.isArray(s.livLignes)) s.livLignes = [];
    }
  }

  /** Le carnet ne contenait au départ que des noms. Chaque entrée devient
   *  un fournisseur avec sa liste de commerciaux, sans rien perdre. */
  function normaliserFournisseurs(config) {
    config.fournisseurs = (config.fournisseurs || []).map((f) =>
      typeof f === "string"
        ? { nom: f, commerciaux: [] }
        : { nom: String(f.nom || ""), commerciaux: Array.isArray(f.commerciaux) ? f.commerciaux : [] }
    ).filter((f) => f.nom);
  }

  function fusionner(defaut, actuel) {
    if (Array.isArray(defaut)) return Array.isArray(actuel) ? actuel : defaut;
    if (defaut && typeof defaut === "object") {
      const r = {};
      for (const k of new Set([...Object.keys(defaut), ...Object.keys(actuel || {})]))
        r[k] = k in defaut ? fusionner(defaut[k], (actuel || {})[k]) : (actuel || {})[k];
      return r;
    }
    return actuel === undefined ? defaut : actuel;
  }

  /* -------------------------------------------------------------- Accès */

  C.config = () => C.base.config;
  C.commandes = () => C.base.commandes;

  C.site = (code) => C.config().sites.find((s) => s.code === code) || null;
  C.entite = (code) => C.config().entites[code] || null;

  C.sitesDeLEntite = (codeEntite) =>
    C.config().sites.filter((s) => (s.entites || []).includes(codeEntite));

  C.siteAppartient = (site, codeEntite) =>
    !!site && (site.entites || []).includes(codeEntite);

  /** Sites sans aucune entité : inutilisables tant qu'on ne les rattache pas. */
  C.sitesSansEntite = () => C.config().sites.filter((s) => !(s.entites || []).length);

  /** Un site est utilisable si son adresse de livraison est renseignée. */
  C.siteComplet = function (site) {
    return !!(site && site.livNom && site.livLignes && site.livLignes.length);
  };

  C.sitesIncomplets = () => C.config().sites.filter((s) => !C.siteComplet(s));

  /** Sites dont l'adresse de livraison est utilisable, toutes entités
   *  confondues : une commande SPI peut être livrée sur un site SPIL. */
  C.sitesLivrables = () => C.config().sites.filter(C.siteComplet);

  /** Site retenu pour l'adresse de livraison d'une commande.
   *  `livraisonSiteCode` peut désigner un autre site que celui de la
   *  commande ; les commandes enregistrées avant l'ajout de ce champ
   *  retombent naturellement sur leur propre site. */
  C.siteLivraison = function (commande) {
    if (!commande) return null;
    return C.site(commande.livraisonSiteCode || commande.siteCode);
  };

  /** Dérive un code compact et stable à partir du nom saisi ("Saint-Vulbas"
   *  -> "SAINTVULBAS") : c'est ce code, pas le nom, qui entre dans le numéro
   *  de commande (voir numerotation.js) — il ne doit donc jamais changer une
   *  fois attribué, même si le nom affiché est corrigé plus tard. */
  function coderSite(nom) {
    return String(nom || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  /** Un site, comme un fournisseur, s'ajoute et se retire depuis l'écran
   *  Configuration — plus de liste figée dans le code (retour utilisateur :
   *  "je ne veux rien en dur"). */
  C.ajouterSite = function (nom) {
    const n = String(nom || "").trim();
    if (!n) return false;
    const code = coderSite(n);
    if (!code) return false;
    const liste = C.config().sites;
    if (liste.some((s) => s.code === code)) return false;
    liste.push({ code, nom: n, entites: [], livNom: "", livLignes: [] });
    liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return true;
  };

  C.supprimerSite = function (code) {
    const liste = C.config().sites;
    const i = liste.findIndex((s) => s.code === code);
    if (i >= 0) liste.splice(i, 1);
  };

  /* ------------------------------------------------- Carnet fournisseurs */

  C.fournisseurs = () => C.config().fournisseurs;

  C.fournisseur = (nom) =>
    C.config().fournisseurs.find((f) => f.nom === nom) || null;

  /** Commerciaux d'un fournisseur ; tableau vide si le fournisseur est
   *  inconnu, pour que l'appelant n'ait pas à tester. */
  C.commerciaux = function (nom) {
    const f = C.fournisseur(nom);
    return f ? f.commerciaux : [];
  };

  C.ajouterFournisseur = function (nom) {
    const n = String(nom || "").trim();
    if (!n) return false;
    const liste = C.config().fournisseurs;
    if (liste.some((f) => f.nom.toLowerCase() === n.toLowerCase())) return false;
    liste.push({ nom: n, commerciaux: [] });
    liste.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return true;
  };

  C.supprimerFournisseur = function (nom) {
    const liste = C.config().fournisseurs;
    const i = liste.findIndex((f) => f.nom === nom);
    if (i >= 0) liste.splice(i, 1);
  };

  C.ajouterCommercial = function (nomFournisseur, commercial) {
    const f = C.fournisseur(nomFournisseur);
    const c = String(commercial || "").trim();
    if (!f || !c) return false;
    if (f.commerciaux.some((x) => x.toLowerCase() === c.toLowerCase())) return false;
    f.commerciaux.push(c);
    f.commerciaux.sort((a, b) => a.localeCompare(b, "fr"));
    return true;
  };

  C.supprimerCommercial = function (nomFournisseur, commercial) {
    const f = C.fournisseur(nomFournisseur);
    if (!f) return;
    const i = f.commerciaux.indexOf(commercial);
    if (i >= 0) f.commerciaux.splice(i, 1);
  };

  /** Nom porté sur le document : c'est le commercial. Les commandes créées
   *  avant l'ajout du champ retombent sur la raison sociale, pour rester
   *  reproductibles à l'identique. */
  C.destinataire = (commande) =>
    (commande && (commande.commercial || commande.fournisseur)) || "";

  C.commande = (id) => C.commandes().find((c) => c.id === id) || null;

  window.Config = C;
})();
