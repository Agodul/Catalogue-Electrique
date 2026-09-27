/* =========================================================================
   pwa.js — service worker et notification de mise à jour

   Même service worker que le Catalogue Électrique (sw.js, à la racine du
   site, portée sur toute l'origine) : l'enregistrer aussi depuis cette page
   garantit la mise à jour et le hors-ligne même pour un visiteur dont la
   toute première page ouverte est Commande IMMO, jamais le Catalogue —
   l'enregistrement est idempotent (le navigateur réutilise la registration
   existante si une autre page l'a déjà fait). Version volontairement plus
   courte que js/pwa.js (Catalogue Électrique) : celle-là synchronise aussi
   un brouillon de configurateur d'armoire avant de recharger, sans rapport
   avec cet outil — seule la commande en cours de saisie (VueCommande) a
   besoin d'un garde-fou équivalent ici.
   ========================================================================= */
(function () {
  "use strict";

  // Nettoie "_swupdate" de la barre d'adresse une fois son rôle (forcer une
  // vraie navigation après mise à jour, voir lancerMiseAJour) rempli — même
  // traitement que le Catalogue Électrique.
  if (window.location.search.indexOf("_swupdate=") !== -1) {
    const params = new URLSearchParams(window.location.search);
    params.delete("_swupdate");
    const qs = params.toString();
    window.history.replaceState({}, document.title,
      window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
  }

  if (!("serviceWorker" in navigator)) return;

  async function lancerMiseAJour() {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        const dejaActif = navigator.serviceWorker.controller && !reg.waiting && !reg.installing;
        if (!dejaActif) {
          await new Promise((resolve) => {
            let fini = false;
            function terminer() { if (!fini) { fini = true; clearInterval(sonde); resolve(); } }
            navigator.serviceWorker.addEventListener("controllerchange", terminer, { once: true });
            let ecoule = 0;
            const sonde = setInterval(() => {
              ecoule += 500;
              const pret = navigator.serviceWorker.controller && !reg.waiting && !reg.installing;
              if (pret || ecoule >= 20000) terminer();
            }, 500);
          });
        }
      }
    } catch (e) { /* on recharge quand même ci-dessous */ }

    const params = new URLSearchParams(window.location.search);
    params.set("_swupdate", Date.now());
    window.location.replace(window.location.pathname + "?" + params.toString() + window.location.hash);
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
      const banner = U.$("#swUpdateBanner");
      const btn = U.$("#swUpdateBtn");

      function positionner() {
        if (!banner) return;
        const header = document.querySelector("header");
        const top = header ? header.getBoundingClientRect().bottom + 12 : 12;
        banner.style.top = top + "px";
      }

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!banner) return;
        positionner();
        banner.style.display = "flex";
      });
      window.addEventListener("resize", positionner);

      if (btn) {
        btn.addEventListener("click", () => {
          // Une commande en cours d'édition a ses propres modifications non
          // enregistrées (voir App.fermerFenetre) — même garde-fou avant de
          // recharger la page sous ses pieds.
          const dansUneCommande = typeof VueCommande !== "undefined"
            && typeof VueCommande.aDesModifications === "function"
            && VueCommande.aDesModifications();
          if (dansUneCommande) {
            App.confirmer(
              "Modifications non enregistrées",
              "Mettre à jour maintenant rechargera la page : la commande en cours de saisie " +
              "(texte, image, champ…) sera perdue. Continuer ?",
              lancerMiseAJour,
              true
            );
          } else {
            lancerMiseAJour();
          }
        });
      }

      // Revérifier à chaque retour au premier plan, et à intervalle
      // régulier pour un onglet resté ouvert sans jamais changer de fenêtre
      // — même double mécanisme que le Catalogue Électrique.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
      setInterval(() => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      }, 30 * 60 * 1000);
    }).catch((e) => {
      console.warn("[PWA] Échec enregistrement service worker :", e.message);
    });
  });
})();
