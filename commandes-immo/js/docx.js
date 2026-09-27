/* =========================================================================
   docx.js — assemblage du document Word

   Le modèle est un vrai fichier .docx, chargé à l'exécution par
   modeles.js — jamais embarqué dans le code, pour rester modifiable dans
   Word sans rien recompiler.
   ========================================================================= */
(function () {
  "use strict";

  const D = {};

  // Largeur utile de la page : 11907 - 851 - 708 = 10348 twips, soit 517,4 pt,
  // convertis en pixels à 96 ppp (unité attendue par le module image).
  D.LARGEUR_UTILE_PX = Math.round((10348 / 1440) * 96); // 690
  D.LARGEUR_TAMPON_PX = 190;

  /** Dimensions d'affichage d'une image, réduites pour tenir dans la largeur. */
  D.taille = function (largeur, hauteur, largeurMax) {
    const w = largeur || largeurMax;
    const h = hauteur || Math.round(largeurMax * 0.5);
    if (w <= largeurMax) return [Math.round(w), Math.round(h)];
    return [largeurMax, Math.round((h * largeurMax) / w)];
  };

  // "justify" (App.saisirTexteRiche) correspond à "both" côté OOXML — les
  // autres valeurs (left/center/right) portent le même nom des deux côtés.
  const ALIGNEMENT_OOXML = { left: "left", center: "center", right: "right", justify: "both" };

  /** Construit le XML brut (balises OOXML <w:p>/<w:r>) d'un paragraphe de
   *  texte libre mis en forme (gras, italique, souligné, couleur, taille,
   *  alignement — voir App.saisirTexteRiche, js/app.js), pour la
   *  balise raw `{@texteRiche}` du modèle (voir § 9 du README). Une balise
   *  raw remplace tout le <w:p> qui la contient : on peut donc renvoyer
   *  plusieurs <w:p> pour plusieurs paragraphes utilisateur à partir d'une
   *  seule balise. Un paragraphe vide (ligne blanche) devient un <w:p/> —
   *  sauf s'il porte un alignement autre que "left" (rare mais possible :
   *  une ligne vide centrée, par ex.), auquel cas son <w:pPr> doit être
   *  conservé. `{texte}`, la balise simple d'avant cet ajout, reste
   *  fournie en parallèle (voir D.donnees) pour les modèles pas encore mis
   *  à jour : elle perd juste la mise en forme, pas le contenu. */
  function texteRicheXML(paragraphes, alignements) {
    return paragraphes.map((runs, p) => {
      const align = alignements && ALIGNEMENT_OOXML[alignements[p]] && alignements[p] !== "left"
        ? `<w:pPr><w:jc w:val="${ALIGNEMENT_OOXML[alignements[p]]}"/></w:pPr>` : "";
      if (!runs || !runs.length) return align ? `<w:p>${align}</w:p>` : "<w:p/>";
      const xmlRuns = runs.filter((r) => r.t !== "").map((r) => {
        const proprietes = [];
        if (r.b) proprietes.push("<w:b/>");
        if (r.i) proprietes.push("<w:i/>");
        if (r.u) proprietes.push('<w:u w:val="single"/>');
        if (r.couleur) proprietes.push(`<w:color w:val="${r.couleur.replace("#", "").toUpperCase()}"/>`);
        if (r.taille) proprietes.push(`<w:sz w:val="${Math.round(r.taille * 2)}"/>`); // demi-points
        const rPr = proprietes.length ? `<w:rPr>${proprietes.join("")}</w:rPr>` : "";
        return `<w:r>${rPr}<w:t xml:space="preserve">${U.echapper(r.t)}</w:t></w:r>`;
      }).join("");
      return `<w:p>${align}${xmlRuns}</w:p>`;
    }).join("");
  }

  // Largeur utile de la page en twips (voir D.LARGEUR_UTILE_PX ci-dessus,
  // même valeur avant conversion en pixels) — sert à répartir la largeur
  // d'un tableau en colonnes égales.
  const LARGEUR_UTILE_TWIPS = 10348;

  /** Construit le XML brut (<w:tbl>) d'un tableau (voir App.saisirTableau,
   *  js/app.js), pour la balise raw `{@tableauRiche}` du modèle (voir
   *  § 9 du README). Une balise raw remplace tout le <w:p> qui la contient —
   *  ici par un <w:tbl>, valide au même niveau qu'un paragraphe dans le
   *  corps du document (Word mélange couramment les deux).
   *  `largeursCol` : poids relatifs par colonne (normalisés ici, n'ont pas
   *  besoin de sommer à 100), colonnes égales par défaut. `hauteursLigne` :
   *  hauteur MINIMALE par ligne en points (`w:hRule="atLeast"` — le contenu
   *  peut toujours l'agrandir, jamais la dépasser en le coupant), ligne
   *  automatique par défaut. `alignementsCellules` : même forme que
   *  `lignes`, alignement horizontal ("left"/"center"/"right") par cellule
   *  — porté par le <w:pPr> de CHAQUE paragraphe de la cellule, comme pour
   *  {@texteRiche} (voir ALIGNEMENT_OOXML plus haut). `alignementsVerticauxCellules` :
   *  même forme, alignement vertical ("top"/"middle"/"bottom") par cellule
   *  — porté par <w:vAlign> dans le <w:tcPr> de la cellule (Word ne connaît
   *  que ces trois valeurs, mêmes noms qu'en JS côté éditeur). `paragraphesCellules` :
   *  même forme que `lignes`, mise en forme de caractère par cellule (gras/
   *  italique/souligné/couleur/taille — un tableau de paragraphes `{t,b,i,u,
   *  couleur,taille}`, EXACTEMENT la forme d'un bloc de texte libre, voir
   *  texteRicheXML ci-dessus — réutilisée telle quelle pour construire le
   *  contenu de chaque cellule, ajouté le 10 septembre 2026). Une cellule
   *  sans entrée dans `paragraphesCellules` (tableau enregistré avant cet
   *  ajout) retombe sur son texte brut existant (`lignes[r][i]`), en un
   *  seul paragraphe sans mise en forme — même repli que pour un bloc de
   *  texte libre ancien format (voir U.paragraphesDeBloc). */
  function tableauRicheXML(lignes, largeursCol, hauteursLigne, alignementsCellules, alignementsVerticauxCellules, paragraphesCellules) {
    const nbColonnes = lignes.reduce((max, ligne) => Math.max(max, ligne.length), 1);
    const poids = (Array.isArray(largeursCol) && largeursCol.length === nbColonnes ? largeursCol : Array(nbColonnes).fill(1))
      .map((p) => (Number(p) > 0 ? Number(p) : 1));
    const sommePoids = poids.reduce((s, p) => s + p, 0);
    const largeursColTwips = poids.map((p) => Math.round((LARGEUR_UTILE_TWIPS * p) / sommePoids));
    const grille = `<w:tblGrid>${
      largeursColTwips.map((w) => `<w:gridCol w:w="${w}"/>`).join("")
    }</w:tblGrid>`;
    const bordure = (cote) => `<w:${cote} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`;
    const bordures = `<w:tblBorders>${
      ["top", "left", "bottom", "right", "insideH", "insideV"].map(bordure).join("")
    }</w:tblBorders>`;
    const lignesXML = lignes.map((ligne, r) => {
      const hauteurPt = Array.isArray(hauteursLigne) ? Number(hauteursLigne[r]) : 0;
      const trPr = hauteurPt > 0
        ? `<w:trPr><w:trHeight w:val="${Math.round(hauteurPt * 20)}" w:hRule="atLeast"/></w:trPr>` // pt -> twips
        : "";
      const cellules = [];
      for (let i = 0; i < nbColonnes; i++) {
        const alignCellule = (alignementsCellules && alignementsCellules[r] && alignementsCellules[r][i]) || "left";
        const vAlignCellule = alignementsVerticauxCellules && alignementsVerticauxCellules[r]
          && alignementsVerticauxCellules[r][i];
        const vAlign = vAlignCellule && vAlignCellule !== "top" ? `<w:vAlign w:val="${vAlignCellule}"/>` : "";
        const paragraphesCellule = (paragraphesCellules && paragraphesCellules[r] && paragraphesCellules[r][i]
          && paragraphesCellules[r][i].length)
          ? paragraphesCellules[r][i]
          : [[{ t: ligne[i] || "" }]]; // repli : texte brut (tableau enregistré avant l'ajout de la mise en forme riche)
        const alignementsPourCellule = paragraphesCellule.map(() => alignCellule);
        cellules.push(
          `<w:tc><w:tcPr><w:tcW w:w="${largeursColTwips[i]}" w:type="dxa"/>${vAlign}</w:tcPr>` +
          texteRicheXML(paragraphesCellule, alignementsPourCellule) +
          `</w:tc>`
        );
      }
      return `<w:tr>${trPr}${cellules.join("")}</w:tr>`;
    }).join("");
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${bordures}</w:tblPr>${grille}${lignesXML}</w:tbl>`;
  }

  /** Construit l'objet de données attendu par les balises du modèle. */
  D.donnees = function (commande) {
    const cfg = Config.config();
    const site = Config.siteLivraison(commande);
    const ent = Config.entite(commande.entite);
    const sig = Signature.obtenir();

    // Captures d'écran et paragraphes de texte libre, mélangés dans l'ordre
    // choisi par l'utilisateur (voir js/vue-commande.js) — le modèle
    // boucle sur {#blocs} et bascule entre {#estImage} et {#estTexte} pour
    // chaque élément (voir § 9 du README pour la structure exacte des
    // paragraphes dans le .docx). {#captures}{%data}{/captures} (images
    // seules) reste fournie en parallèle : un modèle retouché avant cet
    // ajout, avec l'ancienne balise, continue de fonctionner pour les
    // captures — simplement sans texte libre, tant qu'il n'a pas été
    // mis à jour à la main dans Word.
    const tailles = new Map();
    const blocs = (commande.captures || []).map((c) => {
      if (c.type === "texte") {
        const paragraphes = U.paragraphesDeBloc(c);
        return {
          estImage: false, estTexte: true, estTableau: false,
          // {texte} : ancienne balise simple, pour les modèles pas encore
          // mis à jour avec {@texteRiche} — mise en forme perdue, contenu
          // conservé (voir texteRicheXML ci-dessus et § 9 du README).
          texte: U.textePlatDeBloc(c),
          texteRiche: texteRicheXML(paragraphes, U.alignementsDeBloc(c)),
        };
      }
      if (c.type === "tableau") {
        return {
          estImage: false, estTexte: false, estTableau: true,
          tableauRiche: tableauRicheXML(
            c.lignes || [[]], c.largeursCol, c.hauteursLigne, c.alignementsCellules, c.alignementsVerticauxCellules,
            c.paragraphesCellules
          ),
        };
      }
      tailles.set(c.data, D.taille(c.largeur, c.hauteur, D.LARGEUR_UTILE_PX));
      return { estImage: true, estTexte: false, estTableau: false, data: c.data };
    });
    const captures = (commande.captures || [])
      .filter((c) => c.type !== "texte" && c.type !== "tableau")
      .map((c) => ({ data: c.data }));

    const signature = [];
    if (commande.statut === "signee" && sig.tampon && sig.tampon.data) {
      tailles.set(sig.tampon.data, D.taille(sig.tampon.largeur, sig.tampon.hauteur, D.LARGEUR_TAMPON_PX));
      signature.push({ data: sig.tampon.data });
    }

    return {
      tailles,
      valeurs: {
        signataireNom: sig.nom,
        signataireTel: sig.tel,
        signataireFax: sig.fax,
        signataireFonction: sig.fonction,
        // Le document porte le nom du commercial. {fournisseur} est
        // conservée comme alias pour les modèles antérieurs à ce champ.
        destinataire: Config.destinataire(commande),
        fournisseur: Config.destinataire(commande),
        fournisseurNom: commande.fournisseur || "",
        commercial: commande.commercial || "",
        copies: commande.copies || "",
        date: U.dateFR(commande.date),
        references: commande.references || "",
        numero: commande.numero || "",
        offreNumero: commande.offreNumero || "",
        offreDate: U.dateFR(commande.offreDate),
        montant: U.montantFR(commande.montant),
        delai: commande.delai || "",
        reglement: commande.reglement || "",
        factNom: ent ? ent.factNom : "",
        factLignes: (ent ? ent.factLignes : []).map((l) => ({ ligne: l })),
        livNom: site ? site.livNom : "",
        livLignes: (site ? site.livLignes : []).map((l) => ({ ligne: l })),
        blocs,
        captures, // alias pour les modèles avec l'ancienne balise {#captures} — voir plus haut
        signature,
      },
    };
  };

  /** Produit le .docx. Renvoie un Blob. */
  D.generer = function (commande) {
    // Modeles.octets lève une erreur explicite si aucun modèle n'est chargé.
    const modele = Modeles.octets(commande.entite);

    const { tailles, valeurs } = D.donnees(commande);
    const zip = new PizZip(new Uint8Array(modele));

    const moduleImage = new ImageModule({
      centered: false,
      getImage: (tag) => U.base64VersOctets(tag),
      getSize: (img, tag) => tailles.get(tag) || [D.LARGEUR_UTILE_PX, 300],
    });

    const doc = new window.docxtemplater(zip, {
      modules: [moduleImage],
      paragraphLoop: true,
      linebreaks: true,
    });

    try {
      doc.render(valeurs);
    } catch (e) {
      throw new Error("Assemblage du document impossible : " + decrire(e));
    }

    return doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      compression: "DEFLATE",
    });
  };

  /** docxtemplater empile ses erreurs de gabarit dans e.properties.errors. */
  function decrire(e) {
    const errs = e && e.properties && e.properties.errors;
    if (Array.isArray(errs) && errs.length)
      return errs.map((x) => (x.properties && x.properties.explanation) || x.message).join(" ; ");
    return (e && e.message) || String(e);
  }

  D.nomFichier = function (commande, extension) {
    const suffixe = commande.statut === "signee" ? "_signee" : "";
    return `Commande_${U.nomSur(commande.numero)}${suffixe}.${extension}`;
  };

  window.GenerateurDocx = D;
})();
