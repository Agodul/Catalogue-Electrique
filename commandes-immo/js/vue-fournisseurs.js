/* =========================================================================
   vue-fournisseurs.js — carnet de fournisseurs

   Extrait de l'écran Configuration (retour utilisateur : "ça doit être sur
   un bouton dans la page d'accueil") : Configuration est réservée aux
   administrateurs (voir Serveur.estAdmin, app.js), mais le carnet de
   fournisseurs/commerciaux est une donnée d'usage courant — n'importe quel
   compte doit pouvoir y ajouter une raison sociale ou un commercial en
   créant une commande, pas seulement un admin. Ouvert comme une fenêtre à
   part (voir App.ouvrirFenetre) depuis un bouton de la page Commandes.
   ========================================================================= */
(function () {
  "use strict";

  async function sauver() {
    try {
      await Config.enregistrer();
    } catch (e) {
      App.toast("err", e.message);
    }
  }

  function carte(titre, aide, icone) {
    const c = U.el("div", { class: "panneau" });
    c.appendChild(U.el("h2", {}, [icone ? U.icone(icone) : null, titre]));
    if (aide) c.appendChild(U.el("p", { class: "aide", text: aide }));
    return c;
  }

  function rendre(racine) {
    const cfg = Config.config();
    const c = carte("Carnet de fournisseurs",
      "Chaque fournisseur porte la liste de ses commerciaux. C'est le nom du " +
      "commercial qui figure sur la commande, à la ligne « A/To ». " +
      "Fournisseurs et commerciaux peuvent aussi être ajoutés directement " +
      "depuis le formulaire de commande.", "file-invoice");

    const saisie = U.el("input", {
      type: "text", placeholder: "Raison sociale du fournisseur",
      dataset: { focus: "nouveau-fournisseur" },
    });
    const ajouter = async () => {
      const v = saisie.value.trim();
      if (!v) return;
      if (!Config.ajouterFournisseur(v)) { App.toast("info", "Ce fournisseur existe déjà."); return; }
      saisie.value = "";
      await sauver();
      App.rafraichirFenetre();
    };
    saisie.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } });

    c.appendChild(U.el("div", { style: "display:flex;gap:8px;margin-bottom:14px;max-width:460px" }, [
      saisie,
      U.el("button", { class: "copper", type: "button", onclick: ajouter },
        [U.icone("plus"), "Ajouter"]),
    ]));

    if (!cfg.fournisseurs.length) {
      c.appendChild(U.el("div", { class: "indice", text: "Aucun fournisseur enregistré." }));
    } else {
      for (const f of cfg.fournisseurs) {
        const utilise = Config.commandes().some((cm) => cm.fournisseur === f.nom);
        const bloc = U.el("div", {
          style: "padding:10px 0;border-bottom:1px solid #EEF1F5",
        });

        bloc.appendChild(U.el("div", { style: "display:flex;align-items:center;gap:10px" }, [
          U.el("span", { style: "font-weight:700;flex:1", text: f.nom }),
          f.commerciaux.length
            ? U.el("span", { class: "compteur",
                text: f.commerciaux.length + (f.commerciaux.length > 1 ? " commerciaux" : " commercial") })
            : U.el("span", { class: "indice indice-alerte", style: "margin:0",
                text: "aucun commercial — inutilisable en commande" }),
          utilise ? U.el("span", { class: "indice", style: "margin:0", text: "utilisé" }) : null,
          U.el("button", {
            class: "danger small icon-only", type: "button",
            title: "Retirer ce fournisseur", "aria-label": "Retirer ce fournisseur",
            onclick: () => App.confirmer(
              "Retirer « " + f.nom + " » du carnet ?",
              "Ses " + f.commerciaux.length +
              (f.commerciaux.length > 1 ? " commerciaux seront retirés" : " commercial sera retiré") +
              " également. " +
              "Les commandes déjà enregistrées ne sont pas modifiées. " +
              "Cette opération est irréversible.",
              async () => { Config.supprimerFournisseur(f.nom); await sauver(); App.rafraichirFenetre(); },
              true
            ),
          }, [U.icone("trash")]),
        ]));

        const liste = U.el("div", { style: "margin:6px 0 0 14px" });
        for (const com of f.commerciaux) {
          liste.appendChild(U.el("div", {
            style: "display:flex;align-items:center;gap:8px;padding:3px 0",
          }, [
            U.el("span", { style: "flex:1", text: com }),
            U.el("button", {
              class: "danger small icon-only", type: "button",
              title: "Retirer ce commercial", "aria-label": "Retirer ce commercial",
              onclick: async () => {
                Config.supprimerCommercial(f.nom, com);
                await sauver();
                App.rafraichirFenetre();
              },
            }, [U.icone("trash")]),
          ]));
        }
        const ajout = U.el("input", {
          type: "text", placeholder: "Nom du commercial", style: "max-width:280px",
          dataset: { focus: "commercial:" + f.nom },
        });
        const ajouterCom = async () => {
          const v = ajout.value.trim();
          if (!v) return;
          if (!Config.ajouterCommercial(f.nom, v)) {
            App.toast("info", "Ce commercial est déjà enregistré pour ce fournisseur.");
            return;
          }
          await sauver();
          App.rafraichirFenetre();
        };
        ajout.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ajouterCom(); } });
        liste.appendChild(U.el("div", { style: "display:flex;gap:8px;margin-top:6px" }, [
          ajout,
          U.el("button", { class: "secondary small", type: "button", onclick: ajouterCom },
            [U.icone("plus"), "Commercial"]),
        ]));
        bloc.appendChild(liste);
        c.appendChild(bloc);
      }
    }

    racine.appendChild(c);
    return { icone: "file-invoice", titre: "Carnet de fournisseurs" };
  }

  window.VueFournisseurs = { rendre };
})();
