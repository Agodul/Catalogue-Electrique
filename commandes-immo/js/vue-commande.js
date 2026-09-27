/* =========================================================================
   vue-commande.js — création et modification d'une commande

   Le formulaire est construit une seule fois puis met à jour l'objet en
   cours de saisie au fil de la frappe : le recomposer à chaque touche ferait
   perdre le focus. Seules les vignettes de captures sont redessinées.
   ========================================================================= */
(function () {
  "use strict";

  let courante = null;      // commande en cours de saisie (copie de travail)
  let estNouvelle = true;
  let modifiee = false;
  let surColler = null;     // écouteur de collage à retirer en quittant la vue
  let idCharge;             // id (ou null si nouvelle) déjà chargé dans `courante`,
                             // undefined tant que rien n'a été chargé — voir rendre()

  const FORMATS_DIRECTS = ["image/png", "image/jpeg"];

  /* --------------------------------------------------------- Cycle de vie */

  function nouvelleCommande() {
    const cfg = Config.config();
    const entite = "SPI";
    return {
      id: U.identifiant(),
      numero: "",
      entite,
      siteCode: "",
      livraisonSiteCode: "",   // vide = suit le site de la commande
      fournisseur: "",
      commercial: "",
      copies: "",
      date: U.aujourdhuiISO(),
      references: "",
      offreNumero: "",
      offreDate: "",
      montant: "",
      delai: "",
      reglement: cfg.entites[entite] ? cfg.entites[entite].reglementDefaut : "",
      captures: [],
      statut: "brouillon",
      creeLe: U.horodatage(),
      modifieLe: U.horodatage(),
      signeeLe: null,
    };
  }

  /** `ferme` : la fenêtre se ferme vraiment (voir App.fermerFenetre, pas le
   *  nettoyage interne du collage à chaque redessin ci-dessous) — la
   *  prochaine ouverture doit repartir de zéro, pas retrouver la commande
   *  quittée. Sans le paramètre, appelé à chaque rendre() pour ne pas
   *  empiler les écouteurs de collage : ne doit PAS oublier `idCharge`,
   *  sinon rendre() recharge une commande vierge à chaque redessin (ex.
   *  après « Ajouter un fournisseur ») et la saisie en cours est perdue. */
  function detacher(ferme) {
    if (surColler) { document.removeEventListener("paste", surColler); surColler = null; }
    if (ferme) idCharge = undefined;
  }

  function aDesModifications() { return modifiee; }

  /* ------------------------------------------------------------- Rendu */

  function rendre(racine, params) {
    const cfg = Config.config();
    const idDemande = params && params.id ? params.id : null;
    // Ne recharge depuis la source que si on ouvre une commande différente
    // de celle déjà en cours d'édition. Sinon (redessin après un dialogue
    // imbriqué — « Ajouter un fournisseur », par exemple, voir ouvrirModale
    // dans js/app.js — ou après signature de cette même commande) on
    // continue d'éditer le même objet `courante`, pour ne pas perdre la
    // saisie en cours à chaque petit aller-retour.
    if (idDemande !== idCharge) {
      const existante = idDemande ? Config.commande(idDemande) : null;
      courante = existante ? U.copieProfonde(existante) : nouvelleCommande();
      estNouvelle = !existante;
      modifiee = false;
      idCharge = idDemande;
    }

    const figee = courante.statut === "signee";
    if (estNouvelle) recalculerNumero();

    // Pas d'entête ici : le titre et la croix de fermeture viennent
    // maintenant du bandeau de la fenêtre (voir le "return" en fin de
    // fonction et App.rafraichirFenetre, js/app.js) — même principe
    // que ouvrirModale, pour que toutes les fenêtres de l'appli, petites ou
    // grandes, partagent le même gabarit qu'au Catalogue Électrique.
    if (figee) {
      racine.appendChild(bandeau("info",
        "Cette commande a été signée le " + U.dateFR((courante.signeeLe || "").slice(0, 10)) +
        ". Elle n'est plus modifiable ; vous pouvez seulement regénérer ses fichiers."));
    }

    /* --- carte 1 : entité, site, destinataire --- */
    const c1 = carte("Destination",
      "L'entité détermine le modèle Word utilisé et les sites disponibles.", "building-factory-2");
    const g1 = U.el("div", { class: "grille" });

    const selEntite = VueListe.selecteur(
      Object.values(cfg.entites).map((e) => ({ v: e.code, t: e.libelle })),
      courante.entite,
      (v) => {
        courante.entite = v;
        const site = Config.site(courante.siteCode);
        // Un site partagé entre SPI et SPIL reste valable après bascule.
        if (!Config.siteAppartient(site, v)) courante.siteCode = "";
        // Le règlement par défaut suit l'entité tant qu'il n'a pas été retouché.
        const defauts = Object.values(cfg.entites).map((e) => e.reglementDefaut);
        if (!courante.reglement || defauts.includes(courante.reglement)) {
          courante.reglement = cfg.entites[v].reglementDefaut;
          inReglement.value = courante.reglement;
        }
        remplirSites();
        remplirLivraison();
        recalculerNumero(); majNumero(); majAdresse();
        marquer();
      }
    );
    selEntite.disabled = figee;
    g1.appendChild(champ("c3", "Entité", selEntite));

    const selSite = U.el("select", {
      onchange: (e) => {
        const ancien = courante.siteCode;
        courante.siteCode = e.target.value;
        // L'adresse de livraison suit le site tant qu'elle n'a pas été
        // choisie explicitement ailleurs.
        if (!courante.livraisonSiteCode || courante.livraisonSiteCode === ancien)
          courante.livraisonSiteCode = courante.siteCode;
        recalculerNumero(); majNumero(); remplirLivraison(); majAdresse(); marquer();
      },
    });
    selSite.disabled = figee;
    g1.appendChild(champ("c4", "Site", selSite));

    const selLivraison = U.el("select", {
      onchange: (e) => { courante.livraisonSiteCode = e.target.value; majAdresse(); marquer(); },
    });
    selLivraison.disabled = figee;
    const zoneAdresse = U.el("div", { class: "indice" });
    g1.appendChild(U.el("div", { class: "c5" }, [
      U.el("label", { class: "champ" }, [
        U.el("span", { text: "Adresse de livraison" }), selLivraison, zoneAdresse,
      ]),
    ]));

    // Fournisseur, puis commercial de ce fournisseur : c'est le nom du
    // commercial qui figure sur le document.
    const selFournisseur = U.el("select", {
      onchange: (e) => {
        courante.fournisseur = e.target.value;
        courante.commercial = "";
        remplirCommerciaux();
        marquer();
      },
    });
    selFournisseur.disabled = figee;
    // Pas d'align-items:center ici : par défaut (stretch), le bouton "+"
    // s'étire à la même hauteur que le select, au lieu de rester petit et
    // centré à côté d'un champ plus haut que lui.
    g1.appendChild(champ("c4", "Fournisseur", U.el("div", {
      style: "display:flex;gap:8px",
    }, [
      selFournisseur,
      U.el("button", {
        class: "secondary small", type: "button", disabled: figee,
        title: "Ajouter un fournisseur au carnet",
        onclick: nouveauFournisseur,
      }, [U.icone("plus")]),
    ])));

    const selCommercial = U.el("select", {
      onchange: (e) => { courante.commercial = e.target.value; marquer(); },
    });
    selCommercial.disabled = figee;
    const boutonCommercial = U.el("button", {
      class: "secondary small", type: "button", disabled: figee,
      title: "Ajouter un commercial à ce fournisseur",
      onclick: nouveauCommercial,
    }, [U.icone("plus")]);
    g1.appendChild(champ("c4", "Commercial (nom porté sur la commande)", U.el("div", {
      style: "display:flex;gap:8px",
    }, [selCommercial, boutonCommercial])));

    g1.appendChild(champ("c4", "Copie(s)", saisie("copies", figee)));
    c1.appendChild(g1);
    racine.appendChild(c1);

    /* --- carte 2 : identification --- */
    const c2 = carte("Identification",
      "Le numéro est calculé à partir de la date, du site et des initiales du signataire.", "file-invoice");
    const g2 = U.el("div", { class: "grille" });
    const inDate = U.el("input", {
      type: "date", value: courante.date, disabled: figee,
      onchange: (e) => { courante.date = e.target.value; recalculerNumero(); majNumero(); marquer(); },
    });
    g2.appendChild(champ("c3", "Date", inDate));
    const affNumero = U.el("div", { class: "numero-affiche", text: courante.numero || "—" });
    g2.appendChild(champ("c4", "N° de commande", affNumero));
    g2.appendChild(champ("c4", "Référence(s)", saisie("references", figee)));
    g2.appendChild(champ("c4", "N° de l'offre de prix", saisie("offreNumero", figee)));
    const inOffreDate = U.el("input", {
      type: "date", value: courante.offreDate || "", disabled: figee,
      onchange: (e) => { courante.offreDate = e.target.value; marquer(); },
    });
    g2.appendChild(champ("c4", "Date de l'offre de prix", inOffreDate));
    c2.appendChild(g2);
    racine.appendChild(c2);

    /* --- carte 3 : captures, texte et tableaux --- */
    const c3 = carte("Captures d'écran, texte et tableaux",
      "Glissez des images, collez-les avec Ctrl+V, cliquez pour parcourir, ou ajoutez un paragraphe de texte libre " +
      "ou un tableau. Le tout est inséré dans l'ordre affiché.",
      "photo");
    const depot = U.el("div", {
      class: "depot",
      onclick: () => { if (!figee) entree.click(); },
      ondragover: (e) => { e.preventDefault(); depot.classList.add("survol"); },
      ondragleave: () => depot.classList.remove("survol"),
      ondrop: (e) => {
        e.preventDefault(); depot.classList.remove("survol");
        if (!figee) importer(e.dataTransfer.files);
      },
    }, [
      U.icone("photo"),
      U.el("div", { text: "Déposer des images ici, coller avec Ctrl+V, ou cliquer pour parcourir" }),
    ]);
    const entree = U.el("input", {
      type: "file", accept: "image/*", multiple: true, style: "display:none",
      onchange: (e) => { importer(e.target.files); e.target.value = ""; },
    });
    const vignettes = U.el("div", { class: "vignettes" });
    if (!figee) c3.appendChild(depot);
    if (!figee) c3.appendChild(U.el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px" }, [
      U.el("button", { class: "secondary", type: "button", onclick: ajouterTexte },
        [U.icone("align-left"), "Ajouter du texte"]),
      U.el("button", { class: "secondary", type: "button", onclick: ajouterTableau },
        [U.icone("files"), "Ajouter un tableau"]),
    ]));
    c3.appendChild(entree);
    c3.appendChild(vignettes);
    racine.appendChild(c3);

    detacher();
    if (!figee) {
      surColler = (e) => {
        const items = (e.clipboardData && e.clipboardData.items) || [];
        const fichiers = [];
        for (const it of items) if (it.kind === "file" && /^image\//.test(it.type)) fichiers.push(it.getAsFile());
        if (fichiers.length) { e.preventDefault(); importer(fichiers); }
      };
      document.addEventListener("paste", surColler);
    }

    /* --- carte 4 : conditions --- */
    const c4 = carte("Conditions", null, "file-text");
    const g4 = U.el("div", { class: "grille" });
    const inMontant = U.el("input", {
      type: "text", value: courante.montant, disabled: figee, placeholder: "12 480,00",
      oninput: (e) => { courante.montant = e.target.value; marquer(); },
      onblur: (e) => {
        const n = U.versNombre(e.target.value);
        if (n !== null) { courante.montant = U.montantFR(n); e.target.value = courante.montant; }
      },
    });
    g4.appendChild(champ("c3", "Montant HT (€)", inMontant));
    g4.appendChild(champ("c3", "Délai", saisie("delai", figee)));
    const inReglement = U.el("textarea", {
      disabled: figee, rows: 3,
      oninput: (e) => { courante.reglement = e.target.value; marquer(); },
    });
    inReglement.value = courante.reglement || "";
    g4.appendChild(champ("c6", "Conditions de règlement", inReglement));
    c4.appendChild(g4);
    racine.appendChild(c4);

    /* --- barre d'actions --- */
    const actions = U.el("div", { class: "panneau", style: "display:flex;gap:10px;flex-wrap:wrap;align-items:center" });
    if (!figee) {
      actions.appendChild(U.el("button", {
        class: "secondary", type: "button", onclick: () => enregistrer(true),
      }, [U.icone("device-floppy"), "Enregistrer le brouillon"]));
    }
    // Deux actions distinctes : on ne régénère que le format dont on a besoin.
    const produire = (format) => async () => {
      if (await enregistrer(false))
        App.produireFichiers(Config.commande(courante.id), [format]);
    };
    // Les deux générations restent groupées, même quand la barre passe à la
    // ligne. Icône seule + couleur du format (mêmes classes que la liste des
    // commandes, voir js/vue-liste.js) plutôt qu'un bouton texte plein
    // bleu identique pour les deux, qui ne les distinguait pas au premier
    // coup d'œil.
    actions.appendChild(U.el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [
      U.el("button", {
        class: "word icon-only", type: "button",
        title: "Produire le document Word", "aria-label": "Générer le .docx",
        onclick: produire("docx"),
      }, [U.icone("file-text")]),
      U.el("button", {
        class: "pdf icon-only", type: "button",
        title: "Produire le PDF", "aria-label": "Générer le .pdf",
        onclick: produire("pdf"),
      }, [U.icone("file-type-pdf")]),
    ]));
    if (!figee) {
      actions.appendChild(U.el("button", {
        class: "secondary", type: "button", onclick: signer,
      }, [U.icone("writing-sign"), "Signer et figer la commande"]));
    }
    actions.appendChild(U.el("div", { class: "indice", style: "margin-left:auto",
      text: "Les fichiers partiront en téléchargement." }));
    racine.appendChild(actions);

    remplirFournisseurs();
    remplirCommerciaux();
    remplirSites();
    remplirLivraison();
    majAdresse();
    rendreVignettes();

    // Icône + titre pour le bandeau de la fenêtre (voir App.rafraichirFenetre,
    // js/app.js) — même icône que le bouton correspondant dans la
    // liste (pencil/eye, voir js/vue-liste.js).
    return {
      icone: estNouvelle ? "plus" : (figee ? "eye" : "pencil"),
      titre: estNouvelle ? "Nouvelle commande" : "Commande " + courante.numero,
    };

    /* ------------------------------------------------------- Fonctions */

    function marquer() { modifiee = true; }

    function saisie(cle, desactive) {
      return U.el("input", {
        type: "text", value: courante[cle] || "", disabled: desactive,
        oninput: (e) => { courante[cle] = e.target.value; marquer(); },
      });
    }

    function majNumero() { affNumero.textContent = courante.numero || "—"; }

    /** (Re)construit la liste des fournisseurs du carnet. */
    function remplirFournisseurs() {
      U.vider(selFournisseur);
      const liste = Config.fournisseurs();
      selFournisseur.appendChild(U.el("option", {
        value: "",
        text: liste.length ? "— choisir un fournisseur —" : "carnet vide — ajouter un fournisseur",
      }));
      for (const f of liste) {
        const o = U.el("option", { value: f.nom, text: f.nom });
        if (f.nom === courante.fournisseur) o.selected = true;
        selFournisseur.appendChild(o);
      }
    }

    /** Commerciaux du fournisseur retenu. */
    function remplirCommerciaux() {
      U.vider(selCommercial);
      const liste = Config.commerciaux(courante.fournisseur);
      const vide = !courante.fournisseur
        ? "choisir d'abord un fournisseur"
        : (liste.length ? "— choisir un commercial —" : "aucun commercial enregistré");
      selCommercial.appendChild(U.el("option", { value: "", text: vide }));
      for (const c of liste) {
        const o = U.el("option", { value: c, text: c });
        if (c === courante.commercial) o.selected = true;
        selCommercial.appendChild(o);
      }
      selCommercial.disabled = figee || !courante.fournisseur;
      boutonCommercial.disabled = figee || !courante.fournisseur;
    }

    function nouveauFournisseur() {
      App.saisir("Nouveau fournisseur", "Raison sociale", "", async (nom) => {
        if (!Config.ajouterFournisseur(nom)) App.toast("info", "Ce fournisseur est déjà enregistré.");
        else await Config.enregistrer();
        courante.fournisseur = String(nom).trim();
        courante.commercial = "";
        remplirFournisseurs();
        remplirCommerciaux();
        marquer();
      });
    }

    function nouveauCommercial() {
      if (!courante.fournisseur) return;
      App.saisir("Nouveau commercial", "Nom chez « " + courante.fournisseur + " »", "", async (nom) => {
        if (!Config.ajouterCommercial(courante.fournisseur, nom))
          App.toast("info", "Ce commercial est déjà enregistré pour ce fournisseur.");
        else await Config.enregistrer();
        courante.commercial = String(nom).trim();
        remplirCommerciaux();
        marquer();
      });
    }

    /** (Re)construit la liste des sites selon l'entité choisie. */
    function remplirSites() {
      const sites = Config.sitesDeLEntite(courante.entite);
      U.vider(selSite);
      const options = [{
        v: "",
        t: sites.length ? "— choisir un site —" : "aucun site rattaché à cette entité",
      }].concat(sites.map((s) => ({
        v: s.code,
        t: s.nom + (Config.siteComplet(s) ? "" : "  (adresse à compléter)"),
      })));
      for (const o of options) {
        const opt = U.el("option", { value: o.v, text: o.t });
        if (o.v === courante.siteCode) opt.selected = true;
        selSite.appendChild(opt);
      }
    }

    /** (Re)construit la liste des adresses de livraison : tous les sites
     *  dont l'adresse est renseignée, regroupés par entité, afin qu'une
     *  commande puisse être livrée sur un site d'une autre entité. */
    function remplirLivraison() {
      const livrables = Config.sitesLivrables();
      U.vider(selLivraison);
      if (!livrables.length) {
        selLivraison.appendChild(U.el("option", {
          value: "", text: "aucune adresse renseignée — voir Configuration",
        }));
        return;
      }
      selLivraison.appendChild(U.el("option", { value: "", text: "— choisir une adresse —" }));
      const ent = Config.entite(courante.entite);
      const groupes = [
        { libelle: "Sites " + (ent ? ent.code : ""),
          sites: livrables.filter((s) => Config.siteAppartient(s, courante.entite)) },
        { libelle: "Autres sites",
          sites: livrables.filter((s) => !Config.siteAppartient(s, courante.entite)) },
      ];
      for (const groupe of groupes) {
        if (!groupe.sites.length) continue;
        const og = U.el("optgroup", { label: groupe.libelle });
        for (const s of groupe.sites) {
          const o = U.el("option", {
            value: s.code,
            text: s.nom + " — " + s.livNom +
                  (s.code === courante.siteCode ? "  (site de la commande)" : ""),
          });
          if (s.code === courante.livraisonSiteCode) o.selected = true;
          og.appendChild(o);
        }
        selLivraison.appendChild(og);
      }
      // Le site de la commande n'a pas d'adresse : rien n'est présélectionné.
      if (!livrables.some((s) => s.code === courante.livraisonSiteCode)) {
        courante.livraisonSiteCode = "";
        selLivraison.value = "";
      }
    }

    function majAdresse() {
      const s = Config.siteLivraison(courante);
      U.vider(zoneAdresse);
      zoneAdresse.className = "indice";
      // Tant qu'aucun site n'a été choisi, l'absence d'adresse est normale —
      // un simple rappel neutre, pas une alerte rouge dès l'ouverture du
      // formulaire (retour utilisateur : le message apparaissait comme une
      // erreur avant même d'avoir pu saisir quoi que ce soit).
      if (!courante.siteCode) {
        zoneAdresse.textContent = "Choisissez un site pour afficher l'adresse de livraison.";
        return;
      }
      if (!s || !Config.siteComplet(s)) {
        zoneAdresse.className = "indice indice-alerte";
        zoneAdresse.textContent = "Le site de la commande n'a pas d'adresse — choisissez-en une ci-dessus.";
        return;
      }
      zoneAdresse.appendChild(U.el("div", { text: s.livNom }));
      for (const l of s.livLignes) zoneAdresse.appendChild(U.el("div", { text: l }));
      if (s.code !== courante.siteCode && courante.siteCode) {
        zoneAdresse.appendChild(U.el("div", {
          style: "margin-top:4px;color:var(--fg-info);font-weight:700",
          text: "Livraison sur un autre site que « " +
                (Config.site(courante.siteCode) || {}).nom + " ».",
        }));
      }
    }

    async function importer(fichiers) {
      const liste = Array.from(fichiers || []).filter((f) => /^image\//.test(f.type));
      if (!liste.length) return;
      for (const f of liste) {
        try {
          courante.captures.push(await preparerImage(f));
        } catch (e) {
          App.toast("err", `Image « ${f.name} » ignorée : ${e.message}`);
        }
      }
      marquer();
      rendreVignettes();
    }

    /** Ajoute un paragraphe de texte libre — un bloc de plus dans le même
     *  tableau que les images, distingué par `type: "texte"` (voir
     *  nouvelleCommande). Inséré dans le document au même titre qu'une
     *  capture, à sa place dans l'ordre affiché. */
    function ajouterTexte() {
      App.saisirTexteRiche("Ajouter du texte", null, null, async (paragraphes, alignements) => {
        courante.captures.push({ id: U.identifiant(), type: "texte", paragraphes, alignements });
        marquer();
        rendreVignettes();
      });
    }

    function modifierTexte(i) {
      const c = courante.captures[i];
      App.saisirTexteRiche("Modifier le texte", U.paragraphesDeBloc(c), U.alignementsDeBloc(c),
        async (paragraphes, alignements) => {
          c.paragraphes = paragraphes;
          c.alignements = alignements;
          delete c.texte; // ancien champ (avant l'éditeur riche) — plus de double source de vérité
          marquer();
          rendreVignettes();
        }, "Enregistrer", "device-floppy");
    }

    /** Ajoute un tableau — même principe qu'un paragraphe de texte libre
     *  ci-dessus, un bloc de plus distingué par `type: "tableau"`, avec
     *  mise en forme riche par cellule (gras/italique/souligné/couleur/
     *  taille, voir App.saisirTableau, js/app.js). */
    function ajouterTableau() {
      App.saisirTableau("Ajouter un tableau", null, null, null, null, null, null,
        async (lignes, largeursCol, hauteursLigne, alignementsCellules, alignementsVerticauxCellules, paragraphesCellules) => {
          courante.captures.push({
            id: U.identifiant(), type: "tableau", lignes, largeursCol, hauteursLigne,
            alignementsCellules, alignementsVerticauxCellules, paragraphesCellules,
          });
          marquer();
          rendreVignettes();
        });
    }

    function modifierTableau(i) {
      const c = courante.captures[i];
      App.saisirTableau(
        "Modifier le tableau", c.lignes, c.largeursCol, c.hauteursLigne,
        c.alignementsCellules, c.alignementsVerticauxCellules, c.paragraphesCellules,
        async (lignes, largeursCol, hauteursLigne, alignementsCellules, alignementsVerticauxCellules, paragraphesCellules) => {
          c.lignes = lignes;
          c.largeursCol = largeursCol;
          c.hauteursLigne = hauteursLigne;
          c.alignementsCellules = alignementsCellules;
          c.alignementsVerticauxCellules = alignementsVerticauxCellules;
          c.paragraphesCellules = paragraphesCellules;
          marquer();
          rendreVignettes();
        }, "Enregistrer", "device-floppy");
    }

    function rendreVignettes() {
      U.vider(vignettes);
      if (!courante.captures.length) {
        vignettes.appendChild(U.el("div", { class: "indice", text: "Aucune capture ni texte pour l'instant." }));
        return;
      }
      courante.captures.forEach((c, i) => {
        const estTexte = c.type === "texte";
        const estTableau = c.type === "tableau";
        let apercu;
        if (estTexte) {
          // Mise en forme (gras, couleur…) non reprise ici : la vignette
          // n'est qu'un aperçu texte brut, voir U.textePlatDeBloc.
          apercu = U.el("div", {
            class: "vignette-texte", text: U.textePlatDeBloc(c),
            title: figee ? "" : "Cliquer pour modifier",
            onclick: figee ? null : () => modifierTexte(i),
          });
        } else if (estTableau) {
          const nbLignes = c.lignes.length;
          const nbColonnes = c.lignes[0] ? c.lignes[0].length : 0;
          apercu = U.el("div", {
            class: "vignette-tableau",
            title: figee ? "" : "Cliquer pour modifier",
            onclick: figee ? null : () => modifierTableau(i),
          }, [
            U.icone("files"),
            U.el("div", { text: `${nbLignes} ligne${nbLignes > 1 ? "s" : ""} × ${nbColonnes} colonne${nbColonnes > 1 ? "s" : ""}` }),
          ]);
        } else {
          apercu = U.el("img", { src: `data:${c.mime};base64,${c.data}`, alt: c.nom || "capture" });
        }
        const libelle = estTexte ? "Texte" : estTableau ? "Tableau" : (c.nom || "capture");
        const v = U.el("div", { class: "vignette" }, [
          apercu,
          U.el("div", { class: "vignette-pied" }, [
            U.el("span", { class: "vignette-nom", text: `${i + 1}. ${libelle}` }),
            figee ? null : U.el("button", {
              class: "secondary small icon-only", type: "button",
              title: "Monter", "aria-label": "Monter", disabled: i === 0,
              onclick: () => { permuter(i, i - 1); },
            }, [U.icone("chevron-up")]),
            figee ? null : U.el("button", {
              class: "secondary small icon-only", type: "button",
              title: "Descendre", "aria-label": "Descendre",
              disabled: i === courante.captures.length - 1,
              onclick: () => { permuter(i, i + 1); },
            }, [U.icone("chevron-down")]),
            figee ? null : U.el("button", {
              class: "danger small icon-only", type: "button",
              title: "Retirer", "aria-label": "Retirer",
              onclick: () => { courante.captures.splice(i, 1); marquer(); rendreVignettes(); },
            }, [U.icone("trash")]),
          ]),
        ]);
        vignettes.appendChild(v);
      });
    }

    function permuter(a, b) {
      const t = courante.captures[a];
      courante.captures[a] = courante.captures[b];
      courante.captures[b] = t;
      marquer();
      rendreVignettes();
    }


    async function signer() {
      const pb = valider();
      if (pb) { App.toast("err", pb); return; }
      if (!Signature.obtenir().tampon) {
        App.toast("err", "Aucun tampon de signature n'est configuré. " +
          "Ajoutez-le dans le menu ⋮ › Ma signature avant de signer.");
        return;
      }
      App.confirmer(
        "Signer la commande " + courante.numero + " ?",
        "Le tampon sera inséré dans le document et la commande ne sera plus modifiable.",
        async () => {
          courante.statut = "signee";
          courante.signeeLe = U.horodatage();
          await enregistrer(false);
          const c = Config.commande(courante.id);
          App.rafraichirFenetre({ id: c.id }); // redessine en figé, sans rouvrir la fenêtre
          // Enchaîne directement sur le fond imbriqué (confirmation → choix
          // du format → aperçu, voir App.produireFichiers) : un jeton posé
          // par ouvrirModale (voir js/app.js) protège chaque maillon,
          // pas besoin d'attendre la fin de l'animation de fermeture du
          // précédent avant d'ouvrir le suivant.
          App.choisir(
            "Commande signée",
            "Quel(s) fichier(s) voulez-vous produire ?",
            [
              { texte: "Word", icone: "file-text", classe: "word", valeur: ["docx"] },
              { texte: "PDF", icone: "file-type-pdf", classe: "pdf", valeur: ["pdf"] },
              { texte: "Les deux", icone: "files", classe: "copper", valeur: ["docx", "pdf"] },
            ],
            (formats) => App.produireFichiers(c, formats)
          );
        }
      );
    }
  }

  /* ------------------------------------------------------ Enregistrement */

  function valider() {
    if (!courante.entite) return "Choisissez une entité.";
    if (!courante.siteCode) return "Choisissez un site.";
    const liv = Config.siteLivraison(courante);
    if (!Config.siteComplet(liv))
      return "Choisissez une adresse de livraison. " +
             (Config.sitesLivrables().length
               ? "Celle du site de la commande n'est pas renseignée."
               : "Aucun site n'a d'adresse : complétez la configuration.");
    if (!courante.fournisseur) return "Choisissez un fournisseur.";
    if (!courante.commercial)
      return "Choisissez le commercial : c'est son nom qui figure sur la commande. " +
             "Ajoutez-le avec le bouton « + » si le carnet n'en propose pas.";
    if (!courante.numero) return "Le numéro de commande n'a pas pu être calculé.";
    return null;
  }

  async function enregistrer(avecMessage) {
    const pb = valider();
    if (pb) { App.toast("err", pb); return false; }
    courante.modifieLe = U.horodatage();
    const copie = U.copieProfonde(courante);
    try {
      await Config.sauverCommande(copie);
    } catch (e) {
      App.toast("err", e.message);
      return false;
    }
    const i = Config.commandes().findIndex((c) => c.id === courante.id);
    if (i >= 0) Config.commandes()[i] = copie;
    else Config.commandes().push(copie);
    estNouvelle = false;
    modifiee = false;
    if (avecMessage) App.toast("ok", `Commande ${courante.numero} enregistrée.`);
    return true;
  }

  function recalculerNumero() {
    if (courante.statut === "signee") return;
    if (!courante.siteCode || !courante.date) { courante.numero = ""; return; }
    const ini = Signature.obtenir().initiales;
    if (Numerotation.doitEtreRecalcule(courante, courante.date, courante.siteCode, ini))
      courante.numero = Numerotation.attribuer(courante.date, courante.siteCode, ini, courante.id);
  }

  /* -------------------------------------------------------- Import image */

  /** Normalise une image importée : PNG et JPEG sont conservés tels quels
   *  (docxtemplater et pdf-lib les acceptent), les autres formats (WebP, GIF…)
   *  sont reconvertis en PNG par le navigateur. */
  async function preparerImage(fichier) {
    let mime = fichier.type;
    let data;
    if (FORMATS_DIRECTS.includes(mime)) {
      data = await U.fichierVersBase64(fichier);
    } else {
      const converti = await convertirEnPng(fichier);
      data = converti;
      mime = "image/png";
    }
    const dim = await U.dimensionsImage(data, mime);
    return {
      id: U.identifiant(),
      type: "image", // absent sur les captures enregistrées avant ce champ : traitées comme image par défaut, voir rendre()/docx.js/pdf.js
      nom: fichier.name || "capture.png",
      mime,
      data,
      largeur: dim.largeur,
      hauteur: dim.hauteur,
    };
  }

  function convertirEnPng(fichier) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(fichier);
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext("2d").drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        try {
          res(cv.toDataURL("image/png").split(",")[1]);
        } catch (e) { rej(new Error("conversion impossible")); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("format d'image non reconnu")); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------ Fabriques */

  function carte(titre, aide, icone) {
    const c = U.el("div", { class: "panneau" });
    c.appendChild(U.el("h2", {}, [icone ? U.icone(icone) : null, titre]));
    if (aide) c.appendChild(U.el("p", { class: "aide", text: aide }));
    return c;
  }

  function champ(classe, libelle, controle) {
    return U.el("div", { class: classe }, [
      U.el("label", { class: "champ" }, [U.el("span", { text: libelle }), controle]),
    ]);
  }

  function bandeau(type, texte) {
    return U.el("div", {
      class: "panneau",
      style: "border-color:var(--line);background:var(--bg-succes);" +
             "display:flex;gap:10px;align-items:center",
    }, [
      U.icone("writing-sign", "ti-titre"),
      U.el("div", { class: "indice", style: "margin:0;color:var(--fg-succes);font-size:12.5px", text: texte }),
    ]);
  }

  window.VueCommande = { rendre, detacher, aDesModifications };
})();
