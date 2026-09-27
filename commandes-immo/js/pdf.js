/* =========================================================================
   pdf.js — génération du PDF

   Le PDF n'est pas une conversion du .docx (impossible dans un navigateur
   sans serveur) : c'est une reconstruction de la même mise en page avec
   pdf-lib. Tout ce qui peut être lu dans le modèle Word l'est à chaque
   génération (voir modele-infos.js) : format de page, marges, taquet de
   tabulation, logo, lignes de l'en-tête, filets, mentions légales du pied de
   page. Modifier le .docx modifie donc aussi le PDF, sans rien recompiler.

   Restent propres au PDF, faute d'équivalent : l'enchaînement du corps du
   document et l'interligne. Les polices Arial et Calibri sont rendues par
   Helvetica, métriquement proche d'Arial : les retours à la ligne peuvent
   donc différer légèrement du .docx sur les paragraphes longs.
   ========================================================================= */
(function () {
  "use strict";

  const EP_BORDURE = 1.5;   // <w:sz w:val="12"> sur une bordure = 12/8 pt
  const INTERLIGNE = 1.18;  // rapport hauteur de ligne / corps

  const P = {};

  /* ------------------------------------------------------- Petit moteur */

  class Composeur {
    constructor(pdfDoc, polices, infos) {
      this.pdf = pdfDoc;
      this.f = polices;
      this.infos = infos;
      this.page = null;
      this.pages = [];
      this.hauteurEntete = infos.page.hautEntete + this.parcourir(infos.entete, null);
      this.hauteurPied = this.parcourir(infos.pied, null);
      this.basLimite = infos.page.margeB + this.hauteurPied + 6;
      this.nouvellePage();
    }

    get G() { return this.infos.page.margeG; }
    get largeurUtile() { return this.infos.page.largeurUtile; }

    nouvellePage() {
      this.page = this.pdf.addPage([this.infos.page.largeur, this.infos.page.hauteur]);
      this.pages.push(this.page);
      this.y = this.infos.page.hauteur - this.hauteurEntete;
      return this.page;
    }

    place(hauteur) {
      if (this.y - hauteur < this.basLimite) this.nouvellePage();
    }

    reserver(hauteur) {
      if (this.y - hauteur < this.basLimite) this.nouvellePage();
      return this;
    }

    espace(pts) { this.y -= pts; return this; }

    /** Police à utiliser pour un segment — accepte aussi bien la forme des
     *  paragraphes de texte libre ({b, i}) que celle, plus ancienne, des
     *  éléments d'en-tête/pied de page extraits du modèle ({gras}, jamais en
     *  italique). */
    police(seg) {
      const gras = !!(seg && (seg.b || seg.gras));
      const italique = !!(seg && seg.i);
      if (gras && italique) return this.f.grasItalique;
      if (gras) return this.f.gras;
      if (italique) return this.f.italique;
      return this.f.normal;
    }

    largeurTexte(txt, seg, taille) {
      return this.police(seg).widthOfTextAtSize(U.pourPDF(txt), taille);
    }

    /* ------------------------------- En-tête et pied de page du modèle */

    /** Parcourt les éléments extraits du modèle. Sans `contexte`, ne fait que
     *  mesurer la hauteur occupée ; avec, dessine réellement. */
    parcourir(elements, contexte) {
      let consomme = 0;
      const dessine = !!contexte;
      const page = dessine ? contexte.page : null;
      const hautDepart = dessine ? contexte.y : 0;
      let y = hautDepart;

      for (const el of elements) {
        if (el.type === "image" && el.image) {
          if (dessine) {
            page.drawImage(el.image, {
              x: this.G + (el.decalage || 0),
              y: y - el.hauteur,
              width: el.largeur,
              height: el.hauteur,
            });
          }
          y -= el.hauteur + 2;
          consomme += el.hauteur + 2;
        } else if (el.type === "trait") {
          const dv = el.decalageV || 0;
          y -= dv;
          if (dessine) {
            page.drawLine({
              start: { x: this.G + (el.decalage || 0), y },
              end: { x: this.G + (el.decalage || 0) + el.largeur, y },
              thickness: Math.max(0.5, el.epaisseur),
              color: window.PDFLib.rgb(0, 0, 0),
            });
          }
          y -= Math.max(0.5, el.epaisseur);
          consomme += dv + Math.max(0.5, el.epaisseur);
        } else if (el.type === "texte") {
          const corps = el.interligne || 10;
          const base = y - corps * 0.85;
          let x = this.G;
          for (const seg of el.segments) {
            const taille = seg.taille || corps;
            if (seg.tab) {
              // Taquets par défaut du document, comme dans Word : on avance
              // au cran suivant, strictement. La tolérance évite de rester
              // bloqué sur place quand la position tombe pile sur un cran
              // (l'arrondi flottant renverrait alors le même cran).
              const pas = this.infos.page.tabDefaut || 35.4;
              const relatif = x - this.G;
              x = this.G + (Math.floor((relatif + 0.05) / pas) + 1) * pas;
              continue;
            }
            const texte = seg.champ
              ? String(seg.champ === "pages" ? (contexte ? contexte.total : 1) : (contexte ? contexte.numero : 1))
              : seg.t;
            if (dessine) {
              page.drawText(U.pourPDF(texte), {
                x, y: base, size: taille,
                font: this.police(seg),
              });
            }
            x += this.largeurTexte(texte, seg, taille);
          }
          y -= corps * INTERLIGNE;
          consomme += corps * INTERLIGNE;
        }
      }
      return consomme;
    }

    /** Dessine en-tête et pied de page sur toutes les pages, une fois le
     *  nombre total connu (les champs NUMPAGES en dépendent). */
    habiller() {
      const total = this.pages.length;
      this.pages.forEach((page, i) => {
        this.parcourir(this.infos.entete, {
          page, y: this.infos.page.hauteur - this.infos.page.hautEntete,
          numero: i + 1, total,
        });
        this.parcourir(this.infos.pied, {
          page, y: this.infos.page.margeB + this.hauteurPied,
          numero: i + 1, total,
        });
      });
    }

    /* ------------------------------------------------- Corps du document */

    /** Convertit une couleur hex ("#rrggbb") en couleur pdf-lib (0-1). */
    couleurPdf(hex) {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
      if (!m) return null;
      const n = m[1];
      return window.PDFLib.rgb(
        parseInt(n.slice(0, 2), 16) / 255,
        parseInt(n.slice(2, 4), 16) / 255,
        parseInt(n.slice(4, 6), 16) / 255
      );
    }

    /** Écrit une suite de segments [{t, b, i, u, couleur, taille}] avec
     *  retour à la ligne automatique — `couleur`/`taille` par segment
     *  écrasent `opts.taille` pour ce morceau de texte seulement (voir
     *  App.saisirTexteRiche, app.js, pour les paragraphes de texte libre
     *  d'une commande ; les appels internes au générateur, eux, ne fixent
     *  jamais ces deux champs et gardent donc leur taille/couleur uniques
     *  d'avant). `opts` : taille, interligne, x, largeur, align, souligne
     *  (ce dernier souligne toute la ligne, indépendamment de `u` par
     *  segment — utilisé pour des libellés fixes comme « Adresse de
     *  livraison : »). */
    paragraphe(segments, opts) {
      const o = Object.assign(
        { taille: 12, x: this.G, largeur: this.largeurUtile, align: "left" },
        opts || {}
      );
      const segs = [].concat(segments).filter((s) => s && s.t !== "");

      const mots = [];
      for (const s of segs) {
        const taille = s.taille || o.taille;
        for (const m of String(s.t).split(/(\s+)/))
          if (m !== "") mots.push({
            t: m, b: !!s.b, i: !!s.i, u: !!s.u, couleur: s.couleur || null,
            taille, esp: /^\s+$/.test(m),
          });
      }

      let ligne = [], largeur = 0;
      const lignes = [];
      for (const m of mots) {
        const w = this.largeurTexte(m.t, m, m.taille);
        if (largeur + w > o.largeur && ligne.length && !m.esp) {
          lignes.push(ligne); ligne = []; largeur = 0;
        }
        if (m.esp && !ligne.length) continue;
        ligne.push(m); largeur += w;
      }
      if (ligne.length) lignes.push(ligne);
      if (!lignes.length) lignes.push([]);

      lignes.forEach((l, idxLigne) => {
        // Une ligne peut mélanger plusieurs tailles (texte libre) : hauteur
        // de ligne et ligne de base calées sur la plus grande, comme le
        // ferait Word.
        const tailleLigne = l.length ? Math.max(...l.map((m) => m.taille)) : o.taille;
        const interligne = o.interligne || tailleLigne * INTERLIGNE;
        this.place(interligne);
        const total = l.reduce((s, m) => s + this.largeurTexte(m.t, m, m.taille), 0);
        let x = o.x;
        if (o.align === "right") x = o.x + o.largeur - total;
        else if (o.align === "center") x = o.x + (o.largeur - total) / 2;
        // Justifié : espacement supplémentaire réparti entre les mots, comme
        // dans Word — jamais sur la dernière ligne du paragraphe, qui reste
        // alignée à gauche (convention typographique standard).
        let espaceSupp = 0;
        if (o.align === "justify" && idxLigne !== lignes.length - 1) {
          const nbEspaces = l.filter((m) => m.esp).length;
          if (nbEspaces > 0) espaceSupp = (o.largeur - total) / nbEspaces;
        }
        const depart = x;
        const base = this.y - tailleLigne * 0.85;
        // Soulignement par segment (u) : tracé par plage de mots consécutifs
        // soulignés plutôt que mot par mot, sinon chaque espace laisserait un
        // petit trou dans le trait — pas ce qu'on voit sous du texte souligné
        // dans un traitement de texte classique.
        let soulDebut = null, soulCouleur = null;
        const clorePlage = (fin) => {
          if (soulDebut === null) return;
          this.page.drawLine({
            start: { x: soulDebut, y: base - tailleLigne * 0.14 },
            end: { x: fin, y: base - tailleLigne * 0.14 },
            thickness: Math.max(0.5, tailleLigne * 0.055),
            color: soulCouleur || window.PDFLib.rgb(0, 0, 0),
          });
          soulDebut = null;
        };
        for (const m of l) {
          const w = this.largeurTexte(m.t, m, m.taille);
          const drawOpts = { x, y: base, size: m.taille, font: this.police(m) };
          const coul = m.couleur ? this.couleurPdf(m.couleur) : null;
          if (coul) drawOpts.color = coul;
          this.page.drawText(U.pourPDF(m.t), drawOpts);
          if (m.u) {
            if (soulDebut === null) { soulDebut = x; soulCouleur = coul; }
          } else {
            clorePlage(x);
          }
          x += w + (m.esp ? espaceSupp : 0);
        }
        clorePlage(x);
        // <w:u w:val="single"/> du masque : pdf-lib ne souligne pas, on trace.
        if (o.souligne && x > depart) {
          this.page.drawLine({
            start: { x: depart, y: base - tailleLigne * 0.14 },
            end: { x, y: base - tailleLigne * 0.14 },
            thickness: Math.max(0.5, tailleLigne * 0.055),
            color: window.PDFLib.rgb(0, 0, 0),
          });
        }
        this.y -= interligne;
      });
      return this;
    }

    /** Découpe des segments [{t,b,i,u,couleur,taille}] (même forme que
     *  `paragraphe()` ci-dessus) en lignes repliées à la largeur donnée,
     *  SANS RIEN DESSINER — extrait de `paragraphe()` (dont le découpage en
     *  mots est identique) pour être réutilisé par `tableau()` : une
     *  cellule doit connaître la hauteur totale de son contenu AVANT de
     *  dessiner quoi que ce soit (bordures, alignement vertical, hauteur de
     *  ligne du tableau entier), contrairement à `paragraphe()` qui dessine
     *  au fil de l'eau dans le document. */
    emballerSegments(segments, largeurDispo, tailleDefaut) {
      const segs = [].concat(segments).filter((s) => s && s.t !== "");
      const mots = [];
      for (const s of segs) {
        const taille = s.taille || tailleDefaut;
        for (const m of String(s.t).split(/(\s+)/))
          if (m !== "") mots.push({
            t: m, b: !!s.b, i: !!s.i, u: !!s.u, couleur: s.couleur || null,
            taille, esp: /^\s+$/.test(m),
          });
      }
      let ligne = [], largeur = 0;
      const lignes = [];
      for (const m of mots) {
        const w = this.largeurTexte(m.t, m, m.taille);
        if (largeur + w > largeurDispo && ligne.length && !m.esp) {
          lignes.push(ligne); ligne = []; largeur = 0;
        }
        if (m.esp && !ligne.length) continue;
        ligne.push(m); largeur += w;
      }
      if (ligne.length) lignes.push(ligne);
      if (!lignes.length) lignes.push([]);
      return lignes;
    }

    /** Ligne composée de cellules calées sur des taquets de tabulation. */
    ligneTabulee(cellules, opts) {
      const o = Object.assign({ taille: 10 }, opts || {});
      const interligne = o.interligne || o.taille * INTERLIGNE;
      this.place(interligne);
      for (const cel of cellules) {
        let x = this.G + (cel.x || 0);
        for (const p of cel.parts) {
          this.page.drawText(U.pourPDF(p.t), {
            x, y: this.y - o.taille * 0.85, size: o.taille,
            font: this.police(p),
          });
          x += this.largeurTexte(p.t, p, o.taille);
        }
      }
      this.y -= interligne;
      return this;
    }

    filet(epaisseur) {
      this.place(epaisseur + 2);
      this.page.drawLine({
        start: { x: this.G, y: this.y },
        end: { x: this.G + this.largeurUtile, y: this.y },
        thickness: epaisseur,
        color: window.PDFLib.rgb(0, 0, 0),
      });
      this.y -= epaisseur;
      return this;
    }

    /** Tableau (voir App.saisirTableau, app.js), avec mise en forme de
     *  CARACTÈRE par cellule (gras/italique/souligné/couleur/taille — voir
     *  `opts.paragraphesCellules`, ajouté le 10 septembre 2026, « même
     *  feature » que le texte libre demandée par Ludo). Chaque ligne peut,
     *  si le texte le demande, se retrouver sur la page suivante (place()),
     *  comme le ferait Word — le tableau n'est donc jamais coupé au milieu
     *  d'une ligne, seulement entre deux lignes. `opts.largeursCol` : poids
     *  relatifs par colonne (normalisés ici, n'ont pas besoin de sommer à
     *  100), colonnes égales par défaut. `opts.hauteursLigne` : hauteur
     *  MINIMALE par ligne en points — le texte peut toujours l'agrandir si
     *  besoin, jamais la dépasser en étant coupé, comme côté .docx
     *  (w:hRule="atLeast"). `opts.alignementsCellules` : même forme que
     *  `lignes`, alignement horizontal ("left"/"center"/"right") par
     *  cellule, comme les boutons Gauche/Centre/Droite de l'éditeur.
     *  `opts.alignementsVerticauxCellules` : même forme, alignement
     *  vertical ("top"/"middle"/"bottom") par cellule, comme les boutons
     *  Haut/Milieu/Bas — décale le bloc de texte de la cellule dans la
     *  hauteur de ligne réellement dessinée (qui peut être plus grande que
     *  son propre contenu, si une autre cellule de la même ligne a plus de
     *  texte replié). `opts.paragraphesCellules` : même forme, un tableau
     *  de paragraphes `{t,b,i,u,couleur,taille}` par cellule — EXACTEMENT
     *  la forme lue par `paragraphe()` ci-dessus pour un bloc de texte
     *  libre. Une cellule sans entrée ici (tableau enregistré avant cet
     *  ajout) retombe sur son texte brut (`lignes[r][i]`), en un seul
     *  paragraphe sans mise en forme — même repli que côté .docx. Chaque
     *  cellule peut mélanger plusieurs tailles/paragraphes : la hauteur de
     *  la ligne du tableau se cale sur la cellule la plus chargée, comme le
     *  ferait Word (calcul en deux passes via `emballerSegments`, voir plus
     *  haut : d'abord replier tout le texte pour connaître les hauteurs,
     *  puis dessiner). */
    tableau(lignes, opts) {
      const o = Object.assign({ taille: 10, remplissage: 4 }, opts || {});
      const nbCol = Math.max(1, ...lignes.map((l) => l.length));
      const poids = (Array.isArray(o.largeursCol) && o.largeursCol.length === nbCol ? o.largeursCol : Array(nbCol).fill(1))
        .map((p) => (Number(p) > 0 ? Number(p) : 1));
      const sommePoids = poids.reduce((s, p) => s + p, 0);
      const largeursCol = poids.map((p) => (this.largeurUtile * p) / sommePoids);

      const paragraphesCellule = (r, i) => {
        const p = o.paragraphesCellules && o.paragraphesCellules[r] && o.paragraphesCellules[r][i];
        return (p && p.length) ? p : [[{ t: (lignes[r] && lignes[r][i]) || "" }]];
      };

      lignes.forEach((ligne, r) => {
        const cellules = [];
        let maxHauteur = 0;
        for (let i = 0; i < nbCol; i++) {
          const largeurDispo = largeursCol[i] - o.remplissage * 2;
          const lignesEmballees = [];
          for (const paragraphe of paragraphesCellule(r, i)) {
            lignesEmballees.push(...this.emballerSegments(paragraphe, largeurDispo, o.taille));
          }
          const hauteur = lignesEmballees.reduce((s, l) => {
            const tailleLigne = l.length ? Math.max(...l.map((m) => m.taille)) : o.taille;
            return s + tailleLigne * INTERLIGNE;
          }, 0);
          cellules.push({ lignes: lignesEmballees, hauteur });
          maxHauteur = Math.max(maxHauteur, hauteur);
        }
        const hauteurMin = Array.isArray(o.hauteursLigne) ? Number(o.hauteursLigne[r]) || 0 : 0;
        const hauteurLigne = Math.max(hauteurMin, maxHauteur + o.remplissage * 2);
        this.place(hauteurLigne);
        const yHaut = this.y;
        let x = this.G;
        for (let i = 0; i < nbCol; i++) {
          this.page.drawRectangle({
            x, y: yHaut - hauteurLigne, width: largeursCol[i], height: hauteurLigne,
            borderColor: window.PDFLib.rgb(0.6, 0.6, 0.6), borderWidth: 0.75,
          });
          const alignCellule = (o.alignementsCellules && o.alignementsCellules[r] && o.alignementsCellules[r][i]) || "left";
          const vAlignCellule = (o.alignementsVerticauxCellules && o.alignementsVerticauxCellules[r]
            && o.alignementsVerticauxCellules[r][i]) || "top";
          const { lignes: lignesCellule, hauteur: blocHauteur } = cellules[i];
          // yTexte pointe sur le HAUT de la ligne courante (pas encore sa
          // ligne de base — convertie ligne par ligne ci-dessous, chacune
          // pouvant avoir sa propre taille) — haut/milieu/bas le
          // positionnent dans l'espace réellement dessiné (hauteurLigne),
          // comme vertical-align côté éditeur/Word.
          let yTexte;
          if (vAlignCellule === "middle") yTexte = yHaut - (hauteurLigne - blocHauteur) / 2;
          else if (vAlignCellule === "bottom") yTexte = yHaut - hauteurLigne + o.remplissage + blocHauteur;
          else yTexte = yHaut - o.remplissage;

          lignesCellule.forEach((l) => {
            const tailleLigne = l.length ? Math.max(...l.map((m) => m.taille)) : o.taille;
            const interligneLigne = tailleLigne * INTERLIGNE;
            const base = yTexte - tailleLigne * 0.85;
            const totalLigne = l.reduce((s, m) => s + this.largeurTexte(m.t, m, m.taille), 0);
            let xLigne = x + o.remplissage;
            if (alignCellule === "center") xLigne = x + (largeursCol[i] - totalLigne) / 2;
            else if (alignCellule === "right") xLigne = x + largeursCol[i] - o.remplissage - totalLigne;
            // Soulignement par segment (u), par plage de mots consécutifs —
            // même technique que paragraphe() ci-dessus (voir son
            // commentaire pour la raison : un espace ne doit pas laisser de
            // trou dans le trait).
            let soulDebut = null, soulCouleur = null;
            const clorePlage = (fin) => {
              if (soulDebut === null) return;
              this.page.drawLine({
                start: { x: soulDebut, y: base - tailleLigne * 0.14 },
                end: { x: fin, y: base - tailleLigne * 0.14 },
                thickness: Math.max(0.5, tailleLigne * 0.055),
                color: soulCouleur || window.PDFLib.rgb(0, 0, 0),
              });
              soulDebut = null;
            };
            for (const m of l) {
              const w = this.largeurTexte(m.t, m, m.taille);
              const drawOpts = { x: xLigne, y: base, size: m.taille, font: this.police(m) };
              const coul = m.couleur ? this.couleurPdf(m.couleur) : null;
              if (coul) drawOpts.color = coul;
              this.page.drawText(U.pourPDF(m.t), drawOpts);
              if (m.u) {
                if (soulDebut === null) { soulDebut = xLigne; soulCouleur = coul; }
              } else {
                clorePlage(xLigne);
              }
              xLigne += w;
            }
            clorePlage(xLigne);
            yTexte -= interligneLigne;
          });
          x += largeursCol[i];
        }
        this.y = yHaut - hauteurLigne;
      });
      return this;
    }

    async image(base64, mime, largeurMax, align) {
      const octets = U.base64VersOctets(base64);
      const estJpeg = /jpe?g/i.test(mime || "");
      const img = estJpeg ? await this.pdf.embedJpg(octets) : await this.pdf.embedPng(octets);
      let w = img.width, h = img.height;
      const max = largeurMax || this.largeurUtile;
      if (w > max) { h = (h * max) / w; w = max; }
      const hMax = this.infos.page.hauteur - this.hauteurEntete - this.basLimite;
      if (h > hMax) { w = (w * hMax) / h; h = hMax; }
      this.place(h);
      let x = this.G;
      if (align === "center") x += (this.largeurUtile - w) / 2;
      this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
      this.y -= h;
      return this;
    }
  }

  /* -------------------------------------------------------- Génération */

  P.generer = async function (commande) {
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const cfg = Config.config();
    const site = Config.siteLivraison(commande);
    const ent = Config.entite(commande.entite);
    const sig = Signature.obtenir();
    const NB = " ";

    // L'apparence est relue dans le modèle Word de l'entité.
    const infos = await ModeleInfos.lire(commande.entite, Modeles.octets(commande.entite));

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Commande ${commande.numero || ""}`);
    pdf.setAuthor(sig.nom);
    pdf.setCreator("Outil de création de commandes IMMO");

    const polices = {
      normal: await pdf.embedFont(StandardFonts.Helvetica),
      gras: await pdf.embedFont(StandardFonts.HelveticaBold),
      // Italique des paragraphes de texte libre (voir App.saisirTexteRiche,
      // app.js) : polices standard de pdf-lib, aucun fichier à embarquer.
      italique: await pdf.embedFont(StandardFonts.HelveticaOblique),
      grasItalique: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    };

    // Une image pdf-lib appartient au document qui l'a embarquée : on
    // travaille sur une copie locale plutôt que d'écrire dans le cache.
    const embarquer = async (elements) => {
      const res = [];
      for (const el of elements) {
        res.push(el.type === "image" && el.jpeg
          ? Object.assign({}, el, { image: await pdf.embedJpg(el.jpeg) })
          : el);
      }
      return res;
    };
    const misEnPage = {
      page: infos.page,
      entete: await embarquer(infos.entete),
      pied: await embarquer(infos.pied),
    };

    const comp = new Composeur(pdf, polices, misEnPage);
    const TAQ = [0, 6096 / 20, 8222 / 20]; // taquets de la ligne « De/From »

    /* --- bloc d'en-tête du courrier (Arial 10) --- */
    comp.ligneTabulee([
      { x: TAQ[0], parts: [{ t: "De/From", b: true }, { t: NB + ": " + sig.nom }] },
      { x: TAQ[1], parts: [{ t: "Tél." + NB + ": " + sig.tel }] },
      { x: TAQ[2], parts: [{ t: "Fax" + NB + ": " + sig.fax }] },
    ], { taille: 10 });
    comp.paragraphe([{ t: "A/To", b: true }, { t: NB + ": " + Config.destinataire(commande) }], { taille: 10 });
    comp.paragraphe([{ t: "Copies/Cc", b: true }, { t: NB + ": " + (commande.copies || "") }], { taille: 10 });

    /* --- bloc encadré : Date / Référence(s) / COMMANDE N° (style Titre5) --- */
    comp.espace(4);
    comp.filet(EP_BORDURE);
    comp.espace(1);
    comp.paragraphe([{ t: "Date", b: true }, { t: NB + ": " + U.dateFR(commande.date) }], { taille: 10 });
    comp.paragraphe([{ t: "Référence(s)", b: true }, { t: NB + ": " + (commande.references || "") }], { taille: 10 });
    comp.paragraphe([{ t: "COMMANDE " }, { t: "N° " + (commande.numero || ""), b: true }], { taille: 10 });
    comp.espace(1);
    comp.filet(EP_BORDURE);

    /* --- corps (Calibri 12) --- */
    comp.espace(14);
    comp.paragraphe([{ t: "Monsieur," }], { taille: 12 });
    comp.espace(12);
    comp.paragraphe([{
      t: "Pour faire suite à votre offre de prix N° " + (commande.offreNumero || "") +
         " du " + U.dateFR(commande.offreDate) +
         ", veuillez trouver ci-dessous notre commande pour :",
    }], { taille: 12 });
    comp.espace(14);

    // Captures d'écran et paragraphes de texte libre, dans l'ordre choisi
    // par l'utilisateur (voir js/vue-commande.js) — même mélange que
    // {#blocs} côté .docx (voir js/docx.js).
    for (const c of commande.captures || []) {
      if (c.type === "texte") {
        // U.paragraphesDeBloc lit aussi bien les blocs enrichis (gras,
        // italique, souligné, couleur, taille — voir App.saisirTexteRiche
        // dans app.js) que les anciens, simple texte, enregistrés avant
        // cet ajout ; U.alignementsDeBloc pareil pour l'alignement ("left"
        // partout pour un bloc plus ancien, sans ça).
        const alignementsBloc = U.alignementsDeBloc(c);
        U.paragraphesDeBloc(c).forEach((paragraphe, p) => {
          comp.paragraphe(paragraphe, { taille: 12, align: alignementsBloc[p] });
        });
      } else if (c.type === "tableau") {
        comp.tableau(c.lignes || [[]], {
          taille: 10, largeursCol: c.largeursCol, hauteursLigne: c.hauteursLigne,
          alignementsCellules: c.alignementsCellules, alignementsVerticauxCellules: c.alignementsVerticauxCellules,
          paragraphesCellules: c.paragraphesCellules,
        });
      } else {
        await comp.image(c.data, c.mime, comp.largeurUtile, "center");
      }
      comp.espace(10);
    }

    // Saut de page : le récapitulatif occupe une page à part, comme le
    // <w:pageBreakBefore/> posé sur ce même paragraphe dans le .docx.
    comp.nouvellePage();
    comp.paragraphe(
      [{ t: "L’ensemble livré au prix HT de " + U.montantFR(commande.montant) + " €", b: true }],
      { taille: 12 }
    );
    comp.espace(14);
    comp.paragraphe([{ t: "Délai" + NB + ": ", b: true }, { t: commande.delai || "" }], { taille: 12 });

    comp.espace(14);
    const lignesReglement = String(commande.reglement || "").split("\n");
    comp.reserver((1 + lignesReglement.length) * 12 * INTERLIGNE);
    comp.paragraphe([{ t: "Règlement :", b: true }], { taille: 12 });
    for (const l of lignesReglement) comp.paragraphe([{ t: l }], { taille: 12 });

    comp.espace(20);
    comp.reserver((2 + (ent ? ent.factLignes.length : 0)) * 12 * INTERLIGNE);
    comp.paragraphe([{ t: "Adresse de facturation :", b: true }], { taille: 12, souligne: true });
    comp.paragraphe([{ t: ent ? ent.factNom : "", b: true }], { taille: 12 });
    for (const l of (ent ? ent.factLignes : [])) comp.paragraphe([{ t: l }], { taille: 12 });

    comp.espace(20);
    comp.reserver((2 + (site ? site.livLignes.length : 0)) * 12 * INTERLIGNE);
    comp.paragraphe([{ t: "Adresse de livraison :", b: true }], { taille: 12, souligne: true });
    comp.paragraphe([{ t: site ? site.livNom : "", b: true }], { taille: 12 });
    for (const l of (site ? site.livLignes : [])) comp.paragraphe([{ t: l }], { taille: 12 });

    // Formule de politesse, signataire et tampon ne doivent pas être séparés.
    comp.espace(26);
    const hauteurTampon = (commande.statut === "signee" && sig.tampon && sig.tampon.data)
      ? 190 * (sig.tampon.hauteur || 1) / (sig.tampon.largeur || 1) + 6
      : 0;
    comp.reserver(3 * 12 * INTERLIGNE + hauteurTampon);
    comp.paragraphe([{ t: "Cordialement," }], { taille: 12 });
    comp.paragraphe([{ t: sig.nom + "," }], { taille: 10 });
    comp.paragraphe([{ t: sig.fonction }], { taille: 12 });

    if (commande.statut === "signee" && sig.tampon && sig.tampon.data) {
      comp.espace(6);
      await comp.image(sig.tampon.data, sig.tampon.mime, 190, "left");
    }

    comp.habiller();

    const octets = await pdf.save();
    return new Blob([octets], { type: "application/pdf" });
  };

  window.GenerateurPdf = P;
})();
