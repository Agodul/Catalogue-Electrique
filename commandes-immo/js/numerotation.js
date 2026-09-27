/* =========================================================================
   numerotation.js — numéro de commande

   Format : JJMMAAAA + CODE_SITE + initiales du signataire
            ex.  07092026VENDINVV
   En cas de deuxième commande le même jour sur le même site, un suffixe
   1, 2, 3… est accolé sans séparateur :  07092026VENDINVV1
   ========================================================================= */
(function () {
  "use strict";

  const N = {};

  N.base = function (dateISO, codeSite, initiales) {
    return U.dateCompacte(dateISO) + String(codeSite || "") + String(initiales || "").toUpperCase();
  };

  /** Attribue le premier numéro libre. `idExclu` permet de renuméroter une
   *  commande existante sans qu'elle entre en conflit avec elle-même. */
  N.attribuer = function (dateISO, codeSite, initiales, idExclu) {
    const base = N.base(dateISO, codeSite, initiales);
    const pris = new Set(
      Config.commandes()
        .filter((c) => c.id !== idExclu && c.numero)
        .map((c) => c.numero)
    );
    if (!pris.has(base)) return base;
    for (let i = 1; i < 1000; i++) {
      const n = base + i;
      if (!pris.has(n)) return n;
    }
    // Filet de sécurité : ne devrait pas arriver en usage réel.
    return base + "-" + U.identifiant();
  };

  /** Le numéro dépend de la date, du site et du signataire : il doit être
   *  recalculé si l'un des trois change tant que la commande est modifiable. */
  N.doitEtreRecalcule = function (commande, dateISO, codeSite, initiales) {
    if (!commande.numero) return true;
    const attendu = N.base(dateISO, codeSite, initiales);
    return !(commande.numero === attendu || new RegExp("^" + attendu + "\\d+$").test(commande.numero));
  };

  window.Numerotation = N;
})();
