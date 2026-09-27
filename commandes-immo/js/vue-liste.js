/* =========================================================================
   vue-liste.js — index consultable des commandes
   ========================================================================= */
(function () {
  "use strict";

  const filtres = { texte: "", site: "", fournisseur: "", statut: "" };

  function correspond(c) {
    if (filtres.site && c.siteCode !== filtres.site) return false;
    if (filtres.fournisseur && c.fournisseur !== filtres.fournisseur) return false;
    if (filtres.statut && c.statut !== filtres.statut) return false;
    if (filtres.texte) {
      const t = filtres.texte.toLowerCase();
      const foin = [c.numero, c.fournisseur, c.commercial, c.references, c.offreNumero, c.copies]
        .join(" ").toLowerCase();
      if (!foin.includes(t)) return false;
    }
    return true;
  }

  function rendre(racine) {
    const cfg = Config.config();
    const toutes = Config.commandes()
      .slice()
      .sort((a, b) => (b.date + b.creeLe).localeCompare(a.date + a.creeLe));
    const visibles = toutes.filter(correspond);

    // Le bouton « Nouvelle commande » ne vit plus qu'à un seul endroit — le
    // header — pour ne pas en avoir deux qui font la même chose sur l'écran.
    // Le carnet de fournisseurs, lui, a rejoint cette page (retour
    // utilisateur : "ça doit être sur un bouton dans la page d'accueil") —
    // Configuration est réservée aux administrateurs (voir Serveur.estAdmin,
    // app.js), mais ajouter/retirer un fournisseur ou un commercial est un
    // usage courant, pas une tâche d'administration.
    racine.appendChild(U.el("div", { class: "entete-vue" }, [
      U.el("h1", { text: "Commandes" }),
      U.el("span", {
        class: "compteur",
        text: `${toutes.length} commande${toutes.length > 1 ? "s" : ""}`,
      }),
      U.el("div", { class: "actions" }, [
        U.el("button", {
          class: "secondary", type: "button",
          onclick: () => App.ouvrirFenetre("fournisseurs"),
        }, [U.icone("file-invoice"), "Fournisseurs"]),
      ]),
    ]));

    /* --- filtres --- */
    const carteFiltres = U.el("div", { class: "panneau" });
    carteFiltres.appendChild(U.el("h2", {}, [U.icone("search"), "Filtres"]));
    const g = U.el("div", { class: "grille" });
    // data-focus : le champ est reconstruit à chaque frappe, App.rendre()
    // s'en sert pour lui rendre le focus et la position du curseur.
    g.appendChild(champ("c4", "Recherche", U.el("input", {
      type: "text", value: filtres.texte,
      placeholder: "numéro, fournisseur, commercial, référence…",
      dataset: { focus: "recherche" },
      oninput: (e) => { filtres.texte = e.target.value; App.rendre(); },
    })));
    g.appendChild(champ("c3", "Site", selecteur(
      [{ v: "", t: "Tous les sites" }].concat(cfg.sites.map((s) => ({ v: s.code, t: s.nom }))),
      filtres.site, (v) => { filtres.site = v; App.rendre(); }
    )));
    g.appendChild(champ("c3", "Fournisseur", selecteur(
      [{ v: "", t: "Tous les fournisseurs" }].concat(cfg.fournisseurs.map((f) => ({ v: f.nom, t: f.nom }))),
      filtres.fournisseur, (v) => { filtres.fournisseur = v; App.rendre(); }
    )));
    g.appendChild(champ("c3", "État", selecteur(
      [{ v: "", t: "Tous" }, { v: "brouillon", t: "Brouillons" }, { v: "signee", t: "Signées" }],
      filtres.statut, (v) => { filtres.statut = v; App.rendre(); }
    )));
    carteFiltres.appendChild(g);
    racine.appendChild(carteFiltres);

    /* --- tableau --- */
    const carte = U.el("div", { class: "panneau" });
    if (!visibles.length) {
      carte.appendChild(U.el("div", { class: "vide" }, [
        U.icone("file-invoice"),
        U.el("div", { text: toutes.length
          ? "Aucune commande ne correspond à ces filtres."
          : "Aucune commande pour l'instant. Cliquez sur « Nouvelle commande » pour commencer." }),
      ]));
    } else {
      const t = U.el("table", { class: "liste" });
      t.appendChild(U.el("thead", {}, [U.el("tr", {}, [
        U.el("th", { text: "N° de commande" }),
        U.el("th", { text: "Date" }),
        U.el("th", { text: "Entité" }),
        U.el("th", { text: "Site" }),
        U.el("th", { text: "Fournisseur" }),
        U.el("th", { text: "Montant HT" }),
        U.el("th", { text: "État" }),
        U.el("th", { text: "" }),
      ])]));
      const tb = U.el("tbody");
      for (const c of visibles) {
        const site = Config.site(c.siteCode);
        const liv = Config.siteLivraison(c);
        const livAilleurs = liv && site && liv.code !== site.code;
        tb.appendChild(U.el("tr", {}, [
          U.el("td", { class: "num", text: c.numero || "—" }),
          U.el("td", { text: U.dateFR(c.date) }),
          U.el("td", {}, [U.el("span", { class: "etiquette etiquette-entite", text: c.entite })]),
          U.el("td", {}, [
            U.el("div", { text: site ? site.nom : c.siteCode }),
            livAilleurs
              ? U.el("div", { class: "indice", style: "margin-top:2px", text: "livré à " + liv.nom })
              : null,
          ]),
          U.el("td", {}, [
            U.el("div", { text: c.fournisseur || "—" }),
            c.commercial
              ? U.el("div", { class: "indice", style: "margin-top:2px", text: c.commercial })
              : null,
          ]),
          U.el("td", { class: "montant", text: c.montant ? U.montantFR(c.montant) + " €" : "—" }),
          U.el("td", {}, [U.el("span", {
            class: "etiquette " + (c.statut === "signee" ? "etiquette-signee" : "etiquette-brouillon"),
            text: c.statut === "signee" ? "Signée" : "Brouillon",
          })]),
          U.el("td", { class: "actions-cel" }, [
            U.el("button", {
              class: "succes small icon-only", type: "button",
              title: c.statut === "signee" ? "Consulter" : "Ouvrir",
              "aria-label": c.statut === "signee" ? "Consulter" : "Ouvrir",
              onclick: () => App.ouvrirFenetre("commande", { id: c.id }),
            }, [U.icone(c.statut === "signee" ? "eye" : "pencil")]),
            U.el("button", {
              class: "word small icon-only", type: "button",
              title: "Regénérer le document Word", "aria-label": "Regénérer le document Word",
              onclick: () => App.produireFichiers(c, ["docx"]),
            }, [U.icone("file-text")]),
            U.el("button", {
              class: "pdf small icon-only", type: "button",
              title: "Regénérer le PDF", "aria-label": "Regénérer le PDF",
              onclick: () => App.produireFichiers(c, ["pdf"]),
            }, [U.icone("file-type-pdf")]),
            U.el("button", {
              class: "danger small icon-only", type: "button",
              title: "Supprimer la commande", "aria-label": "Supprimer la commande",
              onclick: () => supprimer(c),
            }, [U.icone("trash")]),
          ]),
        ]));
      }
      t.appendChild(tb);
      carte.appendChild(U.el("div", { class: "table-defilante" }, [t]));
    }
    racine.appendChild(carte);
  }

  function supprimer(c) {
    App.confirmer(
      "Supprimer cette commande ?",
      `La commande ${c.numero} sera retirée de la liste. ` +
      "Les fichiers déjà écrits sur le disque ne sont pas supprimés. " +
      "Cette opération est irréversible.",
      async () => {
        try {
          await Config.supprimerCommande(c.id);
        } catch (e) {
          App.toast("err", e.message);
          return;
        }
        const i = Config.commandes().findIndex((x) => x.id === c.id);
        if (i >= 0) Config.commandes().splice(i, 1);
        App.toast("ok", `Commande ${c.numero} supprimée.`);
        App.rendre();
      },
      true
    );
  }

  /* ------------------------------------------------------------ Fabriques */

  function champ(classe, libelle, controle) {
    return U.el("div", { class: classe }, [
      U.el("label", { class: "champ" }, [U.el("span", { text: libelle }), controle]),
    ]);
  }

  function selecteur(options, valeur, onchange) {
    const s = U.el("select", { onchange: (e) => onchange(e.target.value) });
    for (const o of options) {
      const opt = U.el("option", { value: o.v, text: o.t });
      if (o.v === valeur) opt.selected = true;
      s.appendChild(opt);
    }
    return s;
  }

  window.VueListe = { rendre, champ, selecteur };
})();
