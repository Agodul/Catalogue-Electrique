/* =========================================================================
   modele-infos.js — lecture de l'apparence dans le modèle Word

   Le PDF étant reconstruit et non converti, il doit malgré tout suivre le
   modèle : si on change le logo, l'adresse de l'en-tête ou la mention légale
   du pied de page dans le .docx, le PDF doit changer aussi. Ce module lit ces
   éléments directement dans le fichier, à chaque génération.

   Sont extraits : géométrie de la page (format, marges, taquet par défaut),
   contenu de l'en-tête et du pied de page (textes avec taille et graisse,
   filets horizontaux, images, champs PAGE / NUMPAGES).

   Ce qui reste une convention de rendu, faute d'équivalent exact en PDF :
   la mise en page du corps du document, et l'interligne.
   ========================================================================= */
(function () {
  "use strict";

  const TWIPS_PAR_POINT = 20;
  const EMU_PAR_POINT = 12700;

  const I = {};
  const cache = new Map(); // clé : taille du modèle + code entité

  /* --------------------------------------------------------- Utilitaires */

  const attr = (xml, balise, nom) => {
    const m = new RegExp("<" + balise + "[^>]*\\s" + nom + '="([^"]*)"').exec(xml);
    return m ? m[1] : null;
  };
  const nombre = (v, defaut) => (v === null || v === undefined || isNaN(+v) ? defaut : +v);

  function decoder(t) {
    return String(t)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
      .replace(/&amp;/g, "&");
  }

  /** Paragraphes de premier niveau d'une partie (en-tête, pied…). */
  function paragraphes(xml) {
    const res = [];
    const re = /<w:p(?:\s[^>]*?)?(\/?)>|<\/w:p>/g;
    let profondeur = 0, debut = -1, m;
    while ((m = re.exec(xml))) {
      const fermant = m[0].startsWith("</");
      const auto = m[1] === "/";
      if (!fermant) {
        if (profondeur === 0) debut = m.index;
        if (auto) { if (profondeur === 0) res.push(xml.slice(debut, re.lastIndex)); }
        else profondeur++;
      } else {
        profondeur--;
        if (profondeur === 0) res.push(xml.slice(debut, re.lastIndex));
      }
    }
    return res;
  }

  /* ------------------------------------------------------ Relations OOXML */

  function relations(zip, chemin) {
    const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
    const nom = chemin.slice(chemin.lastIndexOf("/") + 1);
    const f = zip.file(dossier + "/_rels/" + nom + ".rels");
    const table = {};
    if (!f) return table;
    for (const m of f.asText().matchAll(/<Relationship\s[^>]*\/>/g)) {
      const id = attr(m[0], "Relationship", "Id");
      const cible = attr(m[0], "Relationship", "Target");
      if (id && cible) table[id] = cible;
    }
    return table;
  }

  /* -------------------------------------------------- Analyse d'une partie */

  /** Transforme un en-tête ou un pied de page en liste d'éléments dessinables. */
  function analyserPartie(zip, chemin, tailleDefaut) {
    const f = zip.file(chemin);
    if (!f) return [];
    const xml = f.asText();
    const rels = relations(zip, chemin);
    const elements = [];

    for (const p of paragraphes(xml)) {
      const segments = [];
      let interligne = null;

      // Un <w:drawing> porte soit une image (présence d'un <a:blip>), soit
      // une forme : dans ce masque, les filets horizontaux de l'en-tête.
      for (const d of p.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>|<w:pict>[\s\S]*?<\/w:pict>/g)) {
        const bloc = d[0];
        const ext = /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(bloc);
        const largeur = ext ? +ext[1] / EMU_PAR_POINT : 0;
        const hauteur = ext ? +ext[2] / EMU_PAR_POINT : 0;
        const blip = /<a:blip[^>]*r:embed="([^"]+)"/.exec(bloc);
        const decalage = /<wp:positionH[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(bloc);
        const decalageV = /<wp:positionV[\s\S]*?<wp:posOffset>(-?\d+)<\/wp:posOffset>/.exec(bloc);
        if (blip && rels[blip[1]]) {
          elements.push({
            type: "image",
            chemin: normaliserChemin(chemin, rels[blip[1]]),
            largeur, hauteur,
            decalage: decalage ? +decalage[1] / EMU_PAR_POINT : 0,
          });
        } else if (hauteur === 0 && largeur > 0) {
          const ep = /<a:ln[^>]*\sw="(\d+)"/.exec(bloc);
          elements.push({
            type: "trait",
            largeur,
            epaisseur: ep ? +ep[1] / EMU_PAR_POINT : 0.75,
            decalage: decalage ? +decalage[1] / EMU_PAR_POINT : 0,
            decalageV: decalageV ? +decalageV[1] / EMU_PAR_POINT : 0,
          });
        }
      }

      // Runs : texte, tabulations et champs PAGE / NUMPAGES.
      let champEnCours = null;   // instruction lue entre begin et separate
      let ignorerResultat = false; // valeur en cache du champ, à ne pas garder
      for (const r of p.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
        const contenu = r[1];
        const rpr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(contenu);
        const props = rpr ? rpr[0] : "";
        const taille = nombre(attr(props, "w:sz", "w:val"), null);
        const gras = /<w:b\/>|<w:b\s[^>]*\/>/.test(props);
        // Un run sans <w:sz> hérite de la valeur par défaut du document,
        // pas de la taille du paragraphe : « Page 1 / 2 » est en 10 pt même
        // sur la ligne « commande » qui, elle, est en 18 pt.
        const style = { taille: taille ? taille / 2 : tailleDefaut, gras };
        if (!interligne || style.taille > interligne) interligne = style.taille;

        const type = attr(contenu, "w:fldChar", "w:fldCharType");
        if (type === "begin") { champEnCours = ""; ignorerResultat = false; continue; }
        if (type === "separate") { ignorerResultat = true; continue; }
        if (type === "end") {
          if (champEnCours !== null) {
            const nom = /NUMPAGES/i.test(champEnCours) ? "pages"
                      : /PAGE/i.test(champEnCours) ? "page" : null;
            if (nom) segments.push(Object.assign({ champ: nom }, style));
          }
          champEnCours = null; ignorerResultat = false;
          continue;
        }

        const instr = /<w:instrText[^>]*>([\s\S]*?)<\/w:instrText>/.exec(contenu);
        if (instr && champEnCours !== null) { champEnCours += instr[1]; continue; }
        if (ignorerResultat) continue; // texte en cache du champ

        for (const t of contenu.matchAll(/<w:tab\/>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
          if (t[0] === "<w:tab/>") segments.push(Object.assign({ tab: true }, style));
          else if (t[1] !== "") segments.push(Object.assign({ t: decoder(t[1]) }, style));
        }
      }

      if (segments.length) elements.push({ type: "texte", segments, interligne });
    }
    return elements;
  }

  function normaliserChemin(base, cible) {
    const dossier = base.slice(0, base.lastIndexOf("/"));
    const segments = (dossier + "/" + cible).split("/");
    const pile = [];
    for (const s of segments) {
      if (s === "..") pile.pop();
      else if (s !== "." && s !== "") pile.push(s);
    }
    return pile.join("/");
  }

  /* ------------------------------------------------------------- Images */

  /** Ramène n'importe quelle image du .docx à un JPEG RVB que pdf-lib sait
   *  embarquer : le logo SPI est un JPEG CMJN, refusé tel quel, et un PNG
   *  transparent doit être aplati sur blanc pour un fond de page. */
  function normaliserImage(octets, largeurCiblePt) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([octets]);
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        // ~3 pixels par point : net à l'impression sans alourdir le PDF.
        const cible = Math.max(1, Math.round((largeurCiblePt || 150) * 3));
        const echelle = Math.min(1, cible / img.naturalWidth);
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.naturalWidth * echelle));
        cv.height = Math.max(1, Math.round(img.naturalHeight * echelle));
        const c = cv.getContext("2d");
        c.fillStyle = "#ffffff";
        c.fillRect(0, 0, cv.width, cv.height);
        c.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(
          (b) => (b ? b.arrayBuffer().then(resolve, reject) : reject(new Error("conversion impossible"))),
          "image/jpeg", 0.9
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image du modèle illisible")); };
      img.src = url;
    });
  }

  /* ------------------------------------------------------------- Public */

  /** Lit tout ce dont le générateur PDF a besoin dans un modèle .docx. */
  I.lire = async function (code, octets) {
    const cle = code + ":" + octets.byteLength;
    if (cache.has(cle)) return cache.get(cle);

    const zip = new PizZip(new Uint8Array(octets));
    const doc = zip.file("word/document.xml").asText();
    const rels = relations(zip, "word/document.xml");

    // Géométrie : dernier sectPr du corps.
    const sect = doc.slice(doc.lastIndexOf("<w:sectPr"));
    const pt = (v, d) => nombre(v, d * TWIPS_PAR_POINT) / TWIPS_PAR_POINT;
    const page = {
      largeur: pt(attr(sect, "w:pgSz", "w:w"), 595.35),
      hauteur: pt(attr(sect, "w:pgSz", "w:h"), 842),
      margeG: pt(attr(sect, "w:pgMar", "w:left"), 42.55),
      margeD: pt(attr(sect, "w:pgMar", "w:right"), 35.4),
      margeH: pt(attr(sect, "w:pgMar", "w:top"), 78),
      margeB: pt(attr(sect, "w:pgMar", "w:bottom"), 35.45),
      hautEntete: pt(attr(sect, "w:pgMar", "w:header"), 28.35),
    };
    page.largeurUtile = page.largeur - page.margeG - page.margeD;

    // Taquet de tabulation par défaut, utilisé par la ligne « commande ».
    const reglages = zip.file("word/settings.xml");
    page.tabDefaut = reglages
      ? nombre(attr(reglages.asText(), "w:defaultTabStop", "w:val"), 708) / TWIPS_PAR_POINT
      : 35.4;

    // Taille de police par défaut du document (docDefaults, puis style
    // Normal). Sans indication, OOXML retient 20 demi-points, soit 10 pt.
    let tailleDefaut = 10;
    const styles = zip.file("word/styles.xml");
    if (styles) {
      const xmlStyles = styles.asText();
      const parDefaut = /<w:docDefaults>[\s\S]*?<\/w:docDefaults>/.exec(xmlStyles);
      const sz = parDefaut ? /<w:sz w:val="(\d+)"/.exec(parDefaut[0]) : null;
      if (sz) tailleDefaut = +sz[1] / 2;
    }
    page.tailleDefaut = tailleDefaut;

    // En-tête et pied « par défaut » de la section.
    const refEntete = /<w:headerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"/.exec(sect);
    const refPied = /<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"/.exec(sect);
    const entete = refEntete && rels[refEntete[1]]
      ? analyserPartie(zip, "word/" + rels[refEntete[1]], tailleDefaut) : [];
    const pied = refPied && rels[refPied[1]]
      ? analyserPartie(zip, "word/" + rels[refPied[1]], tailleDefaut) : [];

    // Chargement des images référencées par l'en-tête et le pied.
    for (const el of entete.concat(pied)) {
      if (el.type !== "image") continue;
      const f = zip.file(el.chemin);
      if (!f) { el.type = "absent"; continue; }
      try {
        el.jpeg = await normaliserImage(f.asArrayBuffer(), el.largeur);
      } catch (e) {
        console.warn("logo du modèle illisible", e);
        el.type = "absent";
      }
    }

    const infos = { page, entete, pied };
    cache.set(cle, infos);
    return infos;
  };

  I.viderCache = () => cache.clear();

  window.ModeleInfos = I;
})();
