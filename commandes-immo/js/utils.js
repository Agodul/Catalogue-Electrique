/* =========================================================================
   utils.js — fonctions utilitaires partagées
   ========================================================================= */
(function () {
  "use strict";

  const U = {};

  /* ---------------------------------------------------------------- DOM */

  U.$ = (sel, racine) => (racine || document).querySelector(sel);
  U.$$ = (sel, racine) => Array.from((racine || document).querySelectorAll(sel));

  /** Crée un élément. `attrs.class`, `attrs.text`, `attrs.html`, on* pour les
   *  écouteurs, tout le reste devient un attribut HTML. */
  U.el = function (tag, attrs, enfants) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k === "dataset") Object.assign(n.dataset, v);
      else if (k.startsWith("on") && typeof v === "function")
        n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(enfants || [])) {
      if (c === null || c === undefined || c === false) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  };

  U.vider = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

  /** Icône Tabler, conformément à la charte SPI :
   *  <i class="ti ti-nom" aria-hidden="true"></i>. Toujours décorative ici,
   *  le sens étant porté par le texte qui l'accompagne. */
  U.icone = function (nom, classeSup) {
    return U.el("i", {
      class: "ti ti-" + nom + (classeSup ? " " + classeSup : ""),
      "aria-hidden": "true",
    });
  };

  /* -------------------------------------------------------------- Dates */

  /** Date du jour au format ISO court (AAAA-MM-JJ), en heure locale. */
  U.aujourdhuiISO = function () {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  /** "2026-09-07" -> "07.09.2026" (format des documents). */
  U.dateFR = function (iso) {
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
  };

  /** "2026-09-07" -> "07092026" (préfixe du numéro de commande). */
  U.dateCompacte = function (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? `${m[3]}${m[2]}${m[1]}` : "";
  };

  U.horodatage = () => new Date().toISOString();

  /* ------------------------------------------------------------ Montants */

  /** 12480.5 -> "12 480,50" (espaces insécables, comme dans les documents). */
  U.montantFR = function (v) {
    const n = U.versNombre(v);
    if (n === null) return String(v || "");
    return n
      .toFixed(2)
      .replace(".", ",")
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  /** Accepte "12 480,50", "12480.50", "12.480,50" -> 12480.5 (ou null). */
  U.versNombre = function (v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (!v) return null;
    let s = String(v).replace(/[\s  ]/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  /* ------------------------------------------------------------- Binaire */

  U.base64VersOctets = function (b64) {
    const bin = atob(b64);
    const o = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
    return o;
  };

  U.octetsVersBase64 = function (octets) {
    const u = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    let s = "";
    const PAS = 0x8000; // découpage : String.fromCharCode sature sur un gros tableau
    for (let i = 0; i < u.length; i += PAS)
      s += String.fromCharCode.apply(null, u.subarray(i, i + PAS));
    return btoa(s);
  };

  U.fichierVersBase64 = function (fichier) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(",")[1]);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(fichier);
    });
  };

  /** Dimensions en pixels d'une image encodée en base64. */
  U.dimensionsImage = function (base64, mime) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res({ largeur: img.naturalWidth, hauteur: img.naturalHeight });
      img.onerror = () => rej(new Error("image illisible"));
      img.src = `data:${mime || "image/png"};base64,${base64}`;
    });
  };

  U.telecharger = function (blob, nomFichier) {
    const url = URL.createObjectURL(blob);
    const a = U.el("a", { href: url, download: nomFichier });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  /* --------------------------------------------------------------- Texte */

  /** Les polices PDF standard sont encodées en WinAnsi, qui couvre déjà toute
   *  la typographie française (apostrophe courbe, tirets demi/cadratin, €,
   *  espace insécable…). Seuls les caractères réellement hors jeu sont
   *  remplacés, pour que le PDF reste fidèle au .docx. */
  const REMPLACEMENTS = {
    "\u202F": "\u00A0", // espace fine insécable -> espace insécable
    "\u2009": " ",       // espace fine
    "\u2007": " ",       // espace cadratin numérique
    "\u2212": "-",       // signe moins mathématique
    "\u00AD": "",        // trait d'union conditionnel
    "\u2011": "-",       // trait d'union insécable
  };
  const WINANSI_OK = /[ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/;

  U.pourPDF = function (txt) {
    return String(txt === null || txt === undefined ? "" : txt)
      .split("")
      .map((c) => {
        if (Object.prototype.hasOwnProperty.call(REMPLACEMENTS, c)) return REMPLACEMENTS[c];
        return WINANSI_OK.test(c) ? c : "?";
      })
      .join("");
  };

  /** Nettoie une chaîne pour en faire un nom de fichier/dossier Windows. */
  U.nomSur = function (s) {
    return String(s || "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "sans-nom";
  };

  U.echapper = function (s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  U.identifiant = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  U.copieProfonde = (o) => JSON.parse(JSON.stringify(o));

  /* ------------------------------------- Blocs de texte libre (commande) */

  /** Normalise un bloc de texte libre (voir vue-commande.js, mélangé aux
   *  captures d'écran dans `commande.captures`) en tableau de paragraphes,
   *  chacun un tableau de segments `{t, b, i, u, couleur, taille}` — que le
   *  bloc vienne de l'éditeur riche (`c.paragraphes`, gras/italique/souligné/
   *  couleur/taille par portion de texte, voir App.saisirTexteRiche dans
   *  app.js) ou d'une commande enregistrée avant son ajout (`c.texte`,
   *  une simple chaîne avec des \n, sans mise en forme). Utilisée aussi bien
   *  par le générateur Word (docx.js) que PDF (pdf.js), pour que les
   *  deux lisent exactement la même donnée. */
  U.paragraphesDeBloc = function (c) {
    if (Array.isArray(c.paragraphes)) return c.paragraphes;
    return String(c.texte || "").split("\n").map((ligne) => (ligne ? [{ t: ligne }] : []));
  };

  /** Réduit un bloc de texte libre à sa chaîne brute, mise en forme perdue —
   *  pour les endroits qui n'affichent qu'un aperçu (vignette de la liste
   *  des captures) plutôt que le texte formaté lui-même. */
  U.textePlatDeBloc = function (c) {
    return U.paragraphesDeBloc(c).map((p) => p.map((s) => s.t).join("")).join("\n");
  };

  /** Alignement ("left"/"center"/"right"/"justify") de chaque paragraphe
   *  d'un bloc de texte libre — tableau parallèle à U.paragraphesDeBloc(c),
   *  même longueur. "left" partout pour un bloc enregistré avant l'ajout de
   *  l'alignement (pas de c.alignements), ou si sa longueur ne correspond
   *  plus au nombre de paragraphes actuel. */
  U.alignementsDeBloc = function (c) {
    const paragraphes = U.paragraphesDeBloc(c);
    if (Array.isArray(c.alignements) && c.alignements.length === paragraphes.length) return c.alignements;
    return paragraphes.map(() => "left");
  };

  window.U = U;
})();
