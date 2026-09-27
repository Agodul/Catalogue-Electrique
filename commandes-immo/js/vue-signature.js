/* =========================================================================
   vue-signature.js — écran "Ma signature"

   Extrait de l'écran Configuration (retour utilisateur : "la signature est
   propre au user pas au serveur donc faut la déplacer dans le menu") :
   contrairement au reste de Configuration (réservé aux administrateurs, voir
   Serveur.estAdmin), n'importe quel compte doit pouvoir régler SA PROPRE
   signature — d'où sa place dans le menu ⋮ plutôt que dans Configuration.
   Enregistré localement (voir signature.js), jamais sur le serveur partagé.
   ========================================================================= */
(function () {
  "use strict";

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

  function texte(sig, cle, transformer) {
    return U.el("input", {
      type: "text", value: sig[cle] || "",
      onchange: (e) => {
        const v = transformer ? transformer(e.target.value) : e.target.value;
        e.target.value = v;
        try {
          Signature.definir({ [cle]: v.trim() });
        } catch (err) {
          App.toast("err", err.message);
        }
      },
    });
  }

  function sectionSignataire(sig) {
    const c = carte("Signataire",
      "Propre à cet appareil : chaque personne qui utilise Commandes IMMO règle ici son " +
      "propre nom. Les initiales entrent dans le numéro de commande.",
      "pencil");
    const g = U.el("div", { class: "grille" });
    g.appendChild(champ("c4", "Nom", texte(sig, "nom")));
    g.appendChild(champ("c3", "Initiales", texte(sig, "initiales", (v) => v.toUpperCase())));
    g.appendChild(champ("c3", "Fonction", texte(sig, "fonction")));
    g.appendChild(champ("c3", "Téléphone", texte(sig, "tel")));
    g.appendChild(champ("c3", "Fax", texte(sig, "fax")));
    c.appendChild(g);
    c.appendChild(U.el("p", {
      class: "indice",
      text: "Les commandes déjà enregistrées gardent le numéro attribué lors de leur création.",
    }));
    return c;
  }

  function sectionTampon(sig) {
    const c = carte("Tampon de signature",
      "Image insérée dans le document au moment de la signature. Fond transparent (PNG) recommandé.",
      "writing-sign");
    const zone = U.el("div", { style: "display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap" });

    const apercu = U.el("div", { class: "apercu-tampon" });
    const majApercu = () => {
      U.vider(apercu);
      if (sig.tampon && sig.tampon.data) {
        apercu.appendChild(U.el("img", { src: `data:${sig.tampon.mime};base64,${sig.tampon.data}` }));
      } else {
        apercu.appendChild(U.el("span", { class: "indice", text: "Aucun tampon configuré" }));
      }
    };
    majApercu();

    const entree = U.el("input", {
      type: "file", accept: "image/*", style: "display:none",
      onchange: async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (!f) return;
        try {
          const data = await U.fichierVersBase64(f);
          const mime = /png/i.test(f.type) ? "image/png" : f.type;
          const dim = await U.dimensionsImage(data, mime);
          sig.tampon = { data, mime, largeur: dim.largeur, hauteur: dim.hauteur, nom: f.name };
          Signature.definir({ tampon: sig.tampon });
          App.rafraichirFenetre();
        } catch (err) {
          App.toast("err", "Image illisible : " + err.message);
        }
      },
    });

    const actions = U.el("div", { style: "display:flex;flex-direction:column;gap:8px" }, [
      U.el("button", { class: "copper", type: "button", onclick: () => entree.click() },
        [U.icone("upload"), sig.tampon ? "Remplacer le tampon" : "Choisir une image"]),
      sig.tampon ? U.el("button", {
        class: "danger", type: "button",
        onclick: () => { Signature.definir({ tampon: null }); App.rafraichirFenetre(); },
      }, [U.icone("trash"), "Retirer le tampon"]) : null,
      entree,
    ]);

    zone.appendChild(apercu);
    zone.appendChild(actions);
    c.appendChild(zone);
    return c;
  }

  function rendre(racine) {
    const sig = Signature.obtenir();
    racine.appendChild(U.el("p", { class: "indice", style: "margin:0 0 14px",
      text: "Réglages propres à cet appareil, jamais partagés avec le reste de l'équipe : " +
            "à reconfigurer sur chaque poste utilisé pour signer une commande." }));
    racine.appendChild(sectionSignataire(sig));
    racine.appendChild(sectionTampon(sig));
    return { icone: "writing-sign", titre: "Ma signature" };
  }

  window.VueSignature = { rendre };
})();
