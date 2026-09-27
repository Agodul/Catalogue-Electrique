/* =========================================================================
   vue-config.js — paramétrage de l'outil

   Même présentation que Paramètres au Catalogue Électrique (retour
   utilisateur : "il faudrait que cette fenêtre soit comme l'image 2") : un
   menu de lignes cliquables (icône + titre + sous-titre + chevron), chacune
   ouvrant son propre écran avec un simple bouton de retour, plutôt qu'une
   longue page où toutes les cartes s'empilent. `page` est un état LOCAL à ce
   module (pas dans App.ouvrirFenetre/App.rafraichirFenetre, génériques et
   partagés avec les autres fenêtres) : naviguer entre le menu et un écran ne
   fait que changer cette variable puis redessiner, exactement comme changer
   un champ redessine déjà la fenêtre ailleurs dans ce fichier.

   Tout est enregistré au moment où le champ est quitté (événement change),
   pour qu'aucune saisie ne soit perdue faute d'avoir cliqué sur un bouton.
   ========================================================================= */
(function () {
  "use strict";

  let indicateur = null;
  let page = "menu"; // "menu" | "modeles" | "sites" | "entites"

  async function sauver() {
    try {
      await Config.enregistrer();
      signaler("Enregistré");
    } catch (e) {
      App.toast("err", e.message);
    }
  }

  function signaler(txt) {
    if (!indicateur) return;
    indicateur.textContent = txt;
    indicateur.style.opacity = "1";
    clearTimeout(signaler._t);
    signaler._t = setTimeout(() => { indicateur.style.opacity = "0"; }, 1800);
  }

  /** Change d'écran et redessine — la fenêtre passe systématiquement en haut
   *  (contrairement à une simple modification de champ, qui reste où
   *  l'utilisateur était) : un changement d'écran est une vraie navigation,
   *  pas une édition sur place. */
  function naviguerVers(p) {
    page = p;
    App.rafraichirFenetre();
    const zone = U.$(".win-corps--vue");
    if (zone) zone.scrollTop = 0;
  }

  function rendre(racine) {
    const cfg = Config.config();
    indicateur = U.el("span", {
      class: "indice", style: "opacity:0;transition:opacity .3s;color:var(--moss);font-weight:700",
    });
    racine.appendChild(indicateur);

    if (page === "modeles") { racine.appendChild(retour()); racine.appendChild(sectionModeles()); }
    else if (page === "sites") { racine.appendChild(retour()); racine.appendChild(sectionSites(cfg)); }
    else if (page === "entites") { racine.appendChild(retour()); racine.appendChild(sectionEntites(cfg)); }
    else racine.appendChild(menu(cfg));

    return { icone: "settings", titre: "Configuration" };
  }

  /* --------------------------------------------------------------- Menu */

  function retour() {
    return U.el("button", {
      type: "button", class: "secondary small", style: "margin-bottom:14px;",
      onclick: () => naviguerVers("menu"),
    }, [U.icone("arrow-left"), "Configuration"]);
  }

  /** Une ligne du menu — même gabarit que .settings-row-btn au Catalogue
   *  Électrique (icône colorée, titre, sous-titre, chevron) : classe
   *  réellement partagée (voir css/styles.css), le reste en style en ligne
   *  comme là-bas (chaque ligne a sa propre couleur d'icône). */
  function ligneMenu(icone, fondIcone, couleurIcone, titre, sousTitre, onclick) {
    return U.el("button", {
      type: "button", class: "settings-row-btn",
      style: "display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;" +
             "border-radius:10px;background:var(--paper-card);cursor:pointer;text-align:left;" +
             "transition:border-color .15s;margin-bottom:8px;font-family:inherit;",
      onclick,
    }, [
      U.el("span", {
        style: "width:38px;height:38px;border-radius:8px;background:" + fondIcone + ";" +
               "display:flex;align-items:center;justify-content:center;flex-shrink:0;",
      }, [U.el("i", { class: "ti ti-" + icone, style: "font-size:20px;color:" + couleurIcone + ";" })]),
      U.el("span", {}, [
        U.el("span", { style: "display:block;font-size:13px;font-weight:700;color:var(--ink);", text: titre }),
        U.el("span", { style: "display:block;font-size:11px;color:var(--ink-soft);margin-top:2px;", text: sousTitre }),
      ]),
      U.el("i", { class: "ti ti-chevron-right", style: "margin-left:auto;color:var(--ink-soft);font-size:16px;" }),
    ]);
  }

  function sousTitreModeles() {
    const manquants = Modeles.codes().filter((c) => !Modeles.disponible(c));
    if (!manquants.length) return "SPI et SPIL chargés";
    if (manquants.length === Modeles.codes().length) return "Aucun modèle chargé";
    return "Modèle " + manquants.join(" et ") + " manquant";
  }

  function sousTitreSites(cfg) {
    const n = cfg.sites.length;
    if (!n) return "Aucun site enregistré";
    const incomplets = Config.sitesIncomplets().length;
    return n + " site" + (n > 1 ? "s" : "") + (incomplets ? " · " + incomplets + " à compléter" : "");
  }

  function menu(cfg) {
    const frag = U.el("div", {});

    // Rappel du compte connecté — même gabarit que "Version installée" au
    // Catalogue Électrique : un encart informatif, sans chevron ni action,
    // pas une ligne de menu (rien à ouvrir derrière).
    const connecte = typeof Serveur !== "undefined" && Serveur.connecte();
    const u = connecte ? Serveur.utilisateur() : null;
    const compte = U.el("div", {
      style: "margin-bottom:14px;padding:12px 14px;border-radius:10px;background:var(--paper);" +
             "border:1px solid var(--line);font-size:12px;",
    });
    if (connecte) {
      compte.appendChild(U.el("div", { style: "color:var(--ink-soft);", text:
        "Connecté au Catalogue Électrique" + (u && (u.displayName || u.username)
          ? " en tant que " + (u.displayName || u.username) : "") }));
      compte.appendChild(U.el("div", { style: "color:var(--ink-soft);margin-top:2px;",
        text: "Commandes et configuration sont partagées avec toute l'équipe." }));
    } else {
      compte.appendChild(U.el("div", { style: "color:var(--warn);font-weight:600;",
        text: "Non connecté au Catalogue Électrique : rien ne peut être enregistré." }));
      compte.appendChild(U.el("a", {
        href: "index.html", style: "display:inline-block;margin-top:4px;color:var(--copper);font-weight:600;",
        text: "Ouvrir le Catalogue Électrique →",
      }));
    }
    frag.appendChild(compte);

    frag.appendChild(ligneMenu("file-text", "#EFF6FF", "#194093",
      "Modèles Word", sousTitreModeles(), () => naviguerVers("modeles")));
    frag.appendChild(ligneMenu("building-factory-2", "#ECFDF5", "#059669",
      "Sites et rattachement aux entités", sousTitreSites(cfg), () => naviguerVers("sites")));
    frag.appendChild(ligneMenu("file-invoice", "#FFF7ED", "#EA580C",
      "Entités juridiques", "Adresses de facturation, SPI et SPIL", () => naviguerVers("entites")));

    return frag;
  }

  /* --------------------------------------------------------- Modèles */

  function sectionModeles() {
    const c = carte("Modèles Word",
      "Un modèle par entité. Ce sont de vrais fichiers .docx : ouvrez-les dans " +
      "Word, modifiez la mise en page, et remettez-les en place — rien à " +
      "recompiler. Le PDF suit le modèle (logo, en-tête, mentions légales).",
      "file-text");

    c.appendChild(U.el("p", { class: "indice", style: "margin-bottom:14px" },
      ["Le modèle chargé ici est envoyé sur le serveur du Catalogue Électrique " +
       "et partagé par toute l'équipe : toute modification doit repasser par cet écran."]));

    for (const code of Modeles.codes()) {
      const etat = Modeles.etat(code);
      const ligne = U.el("div", {
        style: "display:flex;gap:12px;align-items:center;flex-wrap:wrap;" +
               "padding:10px 0;border-bottom:1px solid #EEF1F5",
      });

      ligne.appendChild(U.el("div", { style: "width:60px;font-weight:700", text: code }));

      const info = U.el("div", { style: "flex:1;min-width:220px" });
      if (!etat) {
        info.appendChild(U.el("div", { class: "indice indice-alerte", style: "margin:0",
          text: "Aucun modèle — les commandes " + code + " ne peuvent pas être produites." }));
      } else {
        info.appendChild(U.el("div", { text: etat.nom }));
        info.appendChild(U.el("div", { class: "indice", style: "margin:0",
          text: "chargé sur le serveur du Catalogue — partagé par toute l'équipe · " +
                Math.round(etat.taille / 1024) + " Ko" }));
        const manquantes = Modeles.balisesManquantes(etat.octets);
        if (manquantes.length) {
          info.appendChild(U.el("div", { class: "indice indice-alerte", style: "margin:2px 0 0",
            text: "Balises absentes : " + manquantes.map((b) => "{" + b + "}").join(", ") +
                  " — les données correspondantes ne seront pas reportées." }));
        }
      }
      ligne.appendChild(info);

      const entree = U.el("input", {
        type: "file", accept: ".docx", style: "display:none",
        onchange: async (e) => {
          const fichier = e.target.files[0];
          e.target.value = "";
          if (!fichier) return;
          try {
            const r = await Modeles.importer(code, fichier);
            if (r.manquantes.length) {
              App.toast("info", "Modèle " + code + " chargé, mais il manque les balises " +
                r.manquantes.map((b) => "{" + b + "}").join(", ") + ".");
            } else {
              App.toast("ok", "Modèle " + code + " chargé sur le serveur.");
            }
            App.rafraichirFenetre();
          } catch (err) {
            App.toast("err", err.message);
          }
        },
      });
      const actions = U.el("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [
        U.el("button", {
          class: etat ? "secondary small" : "copper", type: "button",
          onclick: () => entree.click(),
        }, [U.icone("upload"), etat ? "Remplacer" : "Charger le modèle"]),
        etat ? U.el("button", {
          class: "danger small icon-only", type: "button",
          title: "Retirer ce modèle du serveur", "aria-label": "Retirer ce modèle du serveur",
          onclick: async () => {
            try {
              await Modeles.oublier(code);
              ModeleInfos.viderCache();
              App.rafraichirFenetre();
            } catch (err) {
              App.toast("err", err.message);
            }
          },
        }, [U.icone("trash")]) : null,
        entree,
      ]);
      ligne.appendChild(actions);
      c.appendChild(ligne);
    }
    return c;
  }

  /* ------------------------------------------------------------ Sites */

  function sectionSites(cfg) {
    const incomplets = Config.sitesIncomplets().length;
    const c = carte("Sites et rattachement aux entités",
      "Ajoutez les sites du Groupe, cochez la ou les entités dont relève chacun " +
      "— certains sites sont à la fois SPI et SPIL. L'adresse de livraison " +
      "saisie ici est reprise automatiquement sur la commande.", "building-factory-2");

    // Ajout d'un site — même geste que le carnet de fournisseurs
    // (retour utilisateur : "pour la liste des sites elle se fera comme pour
    // la liste des fournisseurs [...] je ne veux rien en dur") : plus de
    // liste figée dans le code, un site est une entrée qu'on ajoute ici.
    const saisieSite = U.el("input", {
      type: "text", placeholder: "Nom du site (ex. Saint-Vulbas)",
      dataset: { focus: "nouveau-site" },
    });
    const ajouterSite = async () => {
      const v = saisieSite.value.trim();
      if (!v) return;
      if (!Config.ajouterSite(v)) { App.toast("info", "Ce site existe déjà."); return; }
      saisieSite.value = "";
      await sauver();
      App.rafraichirFenetre();
    };
    saisieSite.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ajouterSite(); } });
    c.appendChild(U.el("div", { style: "display:flex;gap:8px;margin-bottom:14px;max-width:460px" }, [
      saisieSite,
      U.el("button", { class: "copper", type: "button", onclick: ajouterSite },
        [U.icone("plus"), "Ajouter"]),
    ]));

    if (!cfg.sites.length) {
      c.appendChild(U.el("div", { class: "indice", text: "Aucun site enregistré." }));
      return c;
    }

    if (!cfg.repartitionValidee) {
      c.appendChild(U.el("p", {
        class: "indice indice-alerte",
        text: "La répartition SPI / SPIL n'a pas encore été validée : aucun site n'est encore " +
              "rattaché à une entité. Cochez SPI et/ou SPIL pour chaque site ci-dessous, " +
              "renseignez son adresse de livraison, puis cochez la case en bas.",
      }));
    }
    const orphelins = Config.sitesSansEntite().length;
    if (orphelins) {
      c.appendChild(U.el("p", {
        class: "indice indice-alerte",
        text: orphelins + " site" + (orphelins > 1 ? "s ne sont" : " n'est") +
              " rattaché" + (orphelins > 1 ? "s" : "") + " à aucune entité : " +
              (orphelins > 1 ? "ils n'apparaîtront" : "il n'apparaîtra") +
              " dans aucune liste de sites.",
      }));
    }
    if (incomplets) {
      c.appendChild(U.el("p", {
        class: "indice indice-alerte",
        text: `${incomplets} site${incomplets > 1 ? "s n'ont" : " n'a"} pas d'adresse de livraison : ` +
              "aucune commande ne pourra être créée pour ces sites.",
      }));
    }

    const entete = U.el("div", { class: "ligne-site entete" }, [
      U.el("div", { text: "SITE" }), U.el("div", { text: "ENTITÉS" }),
      U.el("div", { text: "RAISON SOCIALE LIVRAISON" }), U.el("div", { text: "ADRESSE (UNE LIGNE PAR LIGNE)" }),
    ]);
    c.appendChild(entete);

    for (const site of cfg.sites) {
      const complet = Config.siteComplet(site);
      // Un site peut relever des deux entités : une case par entité.
      const cases = U.el("div", { style: "display:flex;flex-direction:column;gap:4px;padding-top:6px" });
      for (const e of Object.values(cfg.entites)) {
        const coche = U.el("input", {
          type: "checkbox",
          onchange: async (ev) => {
            const liste = site.entites;
            const i = liste.indexOf(e.code);
            if (ev.target.checked && i < 0) liste.push(e.code);
            else if (!ev.target.checked && i >= 0) liste.splice(i, 1);
            await sauver();
            App.rafraichirFenetre();
          },
        });
        coche.checked = site.entites.includes(e.code);
        cases.appendChild(U.el("label", {
          style: "display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer",
        }, [coche, U.el("span", { text: e.code })]));
      }

      const inNom = U.el("input", {
        type: "text", value: site.livNom || "", placeholder: "ex. SPI " + site.code,
        onchange: async (e) => { site.livNom = e.target.value.trim(); await sauver(); App.rafraichirFenetre(); },
      });
      const taLignes = U.el("textarea", {
        rows: 3, placeholder: "Numéro et rue\nComplément éventuel\nCode postal et ville",
        onchange: async (e) => {
          site.livLignes = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
          await sauver();
          App.rafraichirFenetre();
        },
      });
      taLignes.value = (site.livLignes || []).join("\n");

      const sansEntite = !site.entites.length;
      const utilise = Config.commandes().some((cm) => cm.siteCode === site.code || cm.livraisonSiteCode === site.code);
      c.appendChild(U.el("div", { class: "ligne-site" }, [
        U.el("div", { class: "nom-site" }, [
          U.el("div", { style: "display:flex;align-items:center;gap:6px" }, [
            U.el("span", { style: "flex:1", text: site.nom }),
            U.el("button", {
              class: "danger small icon-only", type: "button",
              title: "Retirer ce site", "aria-label": "Retirer ce site",
              onclick: () => App.confirmer(
                "Retirer « " + site.nom + " » ?",
                (utilise ? "Ce site est utilisé par au moins une commande déjà enregistrée — elle le restera, mais son adresse ne sera plus modifiable. " : "") +
                "Cette opération est irréversible.",
                async () => { Config.supprimerSite(site.code); await sauver(); App.rafraichirFenetre(); },
                true
              ),
            }, [U.icone("trash")]),
          ]),
          U.el("div", { class: "indice" + (complet && !sansEntite ? "" : " incomplet"),
            text: site.code + (sansEntite ? " — aucune entité"
                  : (complet ? "" : " — à compléter")) }),
        ]),
        cases, inNom, taLignes,
      ]));
    }

    const coche = U.el("input", {
      type: "checkbox",
      onchange: async (e) => { cfg.repartitionValidee = e.target.checked; await sauver(); App.rafraichirFenetre(); },
    });
    coche.checked = !!cfg.repartitionValidee;
    c.appendChild(U.el("label", {
      style: "display:flex;gap:8px;align-items:center;margin-top:14px;font-size:13px",
    }, [coche, U.el("span", { text: "J'ai vérifié la répartition des sites entre SPI et SPIL." })]));
    return c;
  }

  /* --------------------------------------------------------- Entités */

  function sectionEntites(cfg) {
    const c = carte("Entités juridiques",
      "Adresse de facturation et conditions de règlement proposées par défaut. " +
      "Le logo et le pied de page légal proviennent du modèle Word de chaque entité.", "file-invoice");
    for (const e of Object.values(cfg.entites)) {
      const g = U.el("div", { class: "grille", style: "margin-bottom:18px" });
      g.appendChild(U.el("div", { class: "c12" }, [
        U.el("strong", { text: e.libelle }),
      ]));
      g.appendChild(champ("c3", "Raison sociale (facturation)", texte(e, "factNom")));
      const ta = U.el("textarea", {
        rows: 3,
        onchange: async (ev) => {
          e.factLignes = ev.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
          await sauver();
        },
      });
      ta.value = (e.factLignes || []).join("\n");
      g.appendChild(champ("c4", "Adresse de facturation", ta));
      const tr = U.el("textarea", {
        rows: 3,
        onchange: async (ev) => { e.reglementDefaut = ev.target.value; await sauver(); },
      });
      tr.value = e.reglementDefaut || "";
      g.appendChild(champ("c4", "Règlement proposé par défaut", tr));
      c.appendChild(g);
    }
    return c;
  }

  /* ------------------------------------------------------- Fabriques */

  function texte(objet, cle, transformer) {
    return U.el("input", {
      type: "text", value: objet[cle] || "",
      onchange: async (e) => {
        const v = transformer ? transformer(e.target.value) : e.target.value;
        e.target.value = v;
        objet[cle] = v.trim();
        await sauver();
      },
    });
  }

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

  /** Remet le menu principal au premier plan — appelé à la fermeture de la
   *  fenêtre (voir js/app.js) pour qu'une réouverture reparte toujours du
   *  menu, jamais de l'écran où l'utilisateur se trouvait la dernière fois. */
  function reinitialiser() { page = "menu"; }

  window.VueConfig = { rendre, reinitialiser };
})();
