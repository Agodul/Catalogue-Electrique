/* =========================================================================
   signature.js — signataire et tampon, propres à CET appareil/compte

   Contrairement au reste (commandes, sites, entités, modèles Word...), la
   signature n'a rien à faire sur le serveur partagé par toute l'équipe
   (retour utilisateur : "la signature est propre au user pas au serveur") :
   deux personnes différentes utilisant cet outil n'ont ni le même nom, ni le
   même tampon. Conservée en localStorage, propre à ce navigateur — à
   reconfigurer une fois sur chaque appareil, comme deux comptes distincts.
   ========================================================================= */
(function () {
  "use strict";

  const CLE = "commandes-immo:signature";
  const VIDE = { nom: "", initiales: "", fonction: "", tel: "", fax: "", tampon: null };

  const S = {};

  function lire() {
    try {
      const brut = localStorage.getItem(CLE);
      const v = brut ? JSON.parse(brut) : null;
      return v && typeof v === "object" ? Object.assign({}, VIDE, v) : Object.assign({}, VIDE);
    } catch (e) {
      return Object.assign({}, VIDE);
    }
  }

  /** Toujours la copie complète { nom, initiales, fonction, tel, fax, tampon }. */
  S.obtenir = lire;

  /** Fusionne les champs fournis dans la signature déjà enregistrée
   *  (`tampon` compris) et persiste le résultat. */
  S.definir = function (champs) {
    const actuelle = lire();
    Object.assign(actuelle, champs);
    try {
      localStorage.setItem(CLE, JSON.stringify(actuelle));
    } catch (e) {
      throw new Error("Le navigateur refuse d'enregistrer la signature (stockage plein).");
    }
    return actuelle;
  };

  window.Signature = S;
})();
