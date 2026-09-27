/* =========================================================================
   app.js — démarrage, navigation, production des fichiers
   ========================================================================= */
(function () {
  "use strict";

  const App = {
    vue: "liste",
    params: null,
  };

  /* ------------------------------------------------------- Navigation */

  /** Navigation : c'est le seul cas où l'on remonte en haut de la page.
   *  Seule "liste" reste une vue de page à part entière — Nouvelle commande
   *  et Configuration s'ouvrent désormais en fenêtre (voir App.ouvrirFenetre
   *  plus bas), même principe que le Catalogue Électrique. */
  App.aller = function (vue, params) {
    App.vue = vue;
    App.params = params || null;
    App.rendre();
    window.scrollTo(0, 0);
  };

  /** Redessine la vue courante. Beaucoup d'actions (cocher une entité,
   *  ajouter un commercial, filtrer la liste…) passent par ici sans qu'il
   *  s'agisse d'une navigation : la position de défilement et le champ actif
   *  sont donc restitués, sinon la page remonterait en haut et la saisie en
   *  cours perdrait le focus à chaque frappe. */
  App.rendre = function () {
    const defilement = window.scrollY;
    const actif = document.activeElement;
    const cleFocus = actif && actif.dataset ? actif.dataset.focus : null;
    let debut = null, fin = null;
    if (cleFocus && typeof actif.selectionStart === "number") {
      debut = actif.selectionStart;
      fin = actif.selectionEnd;
    }

    const racine = U.vider(U.$("#vue"));
    try {
      if (App.vue === "liste") VueListe.rendre(racine);
    } catch (e) {
      console.error(e);
      racine.appendChild(U.el("div", { class: "panneau" }, [
        U.el("h2", { text: "Erreur d'affichage" }),
        U.el("p", { class: "indice", text: String(e && e.message ? e.message : e) }),
      ]));
    }

    if (cleFocus) {
      const n = U.$$("[data-focus]").find((x) => x.dataset.focus === cleFocus);
      if (n) {
        n.focus({ preventScroll: true });
        if (debut !== null && typeof n.setSelectionRange === "function") {
          try { n.setSelectionRange(debut, fin); } catch (e) { /* type non concerné */ }
        }
      }
    }
    window.scrollTo(0, defilement);
  };

  /* ----------------------------------------------------------- Toasts */
  /* Même composant que le Catalogue Électrique (showToast, js/storage.js) :
     une notification flottante, empilée sous l'en-tête, qui glisse depuis
     la droite puis disparaît d'elle-même. Le CSS (#toastStack/.toast/
     .toast.ok/.err/.warn/.info) vient de ../../css/styles.css, réellement
     partagé — App.toast() ci-dessous ne fait que reconstruire le même
     balisage avec les mêmes clés de type ("ok"/"err"/"warn"/"info") plutôt
     que d'importer js/storage.js tel quel : ce fichier est le bootstrap
     entier du Catalogue (rendu des cartes produit, défilement infini…),
     bien au-delà du seul toast, et n'est pas conçu pour être chargé sur une
     autre page. Sert au retour d'action ponctuel (commande enregistrée,
     fichier généré, erreur de saisie…). */

  const ICONE_TOAST = { ok: "circle-check", err: "alert-circle", warn: "alert-triangle", info: "info-circle" };

  function positionnerPileToasts(pile) {
    const entete = document.querySelector("header");
    const bas = entete ? entete.getBoundingClientRect().bottom : 0;
    pile.style.top = Math.max(bas + 12, 12) + "px";
  }

  function pileToasts() {
    let pile = U.$("#toastStack");
    if (!pile) {
      pile = U.el("div", { id: "toastStack" });
      document.body.appendChild(pile);
    }
    positionnerPileToasts(pile);
    return pile;
  }

  window.addEventListener("resize", () => {
    const pile = U.$("#toastStack");
    if (pile) positionnerPileToasts(pile);
  });

  App.toast = function (type, texte, duree) {
    const pile = pileToasts();
    const t = U.el("div", { class: "toast " + type }, [
      U.icone(ICONE_TOAST[type] || "info-circle", "toast-icon"),
      U.el("div", { class: "toast-text", text: texte }),
    ]);
    pile.appendChild(t);
    requestAnimationFrame(() => t.classList.add("visible"));
    const base = (type === "err" || type === "warn") ? 3000 : 2200;
    const attente = duree || Math.min(base + texte.length * 45, 9000);
    setTimeout(() => {
      t.classList.remove("visible");
      setTimeout(() => t.remove(), 250);
    }, attente);
  };

  /* ---------------------------------------------------------- Modales */

  /** Ouverture / fermeture animées, même principe et même signature que
   *  _closeOverlayAnimated(overlayEl, hideNowFn) au Catalogue Électrique :
   *  le fond s'éclaircit et la fenêtre glisse depuis le bas ; à la
   *  fermeture, l'animation inverse (.closing) rejoue avant le vrai
   *  masquage, au lieu d'un [hidden] instantané. `hideNowFn`, si fourni,
   *  s'exécute au moment du VRAI masquage (fin d'animation ou filet de
   *  sécurité) — pas avant : un changement pendant que l'animation joue
   *  encore se verrait comme un saut brutal au milieu du fondu. Ne touche
   *  pas au verrou de défilement du body : gardé par chaque appelant, qui
   *  seul sait s'il ferme le dernier niveau ouvert ou non (voir
   *  ouvrirModale/fermerModale juste en dessous).
   *
   *  `jetonFond`/`ouvrirDialogue` (juste en dessous) : un fond peut enchaîner
   *  plusieurs dialogues (confirmation de signature → choix du format →
   *  aperçu) sans jamais se cacher entre deux, chacun s'ouvrant dès que le
   *  précédent se ferme. Le filet de sécurité à 260ms de CE fermerFenetreAnimee
   *  peut alors se déclencher APRÈS que le dialogue suivant a déjà été
   *  ouvert — en pratique observé quand du travail non-instantané s'intercale
   *  (générer le PDF de l'aperçu bloque un instant la boucle d'événements,
   *  retardant d'autant le setTimeout) : sans garde, ce filet fermerait le
   *  nouveau dialogue à la place de l'ancien, silencieusement (son contenu
   *  reste construit dans le DOM mais invisible, .open ayant été retiré).
   *  Le jeton capturé à l'appel identifie CE dialogue précis ; s'il ne
   *  correspond plus au jeton courant du fond au moment de fermer pour de
   *  bon, c'est qu'un dialogue plus récent a pris sa place entre-temps — on
   *  ne touche alors plus à rien (ni aux classes, ni à hideNowFn, qui
   *  pourrait sinon annuler un état posé par CE dialogue plus récent, ex.
   *  modale-fond--large). */
  const jetonFond = new WeakMap();
  function fermerFenetreAnimee(fond, hideNowFn) {
    if (fond.classList.contains("closing")) {
      if (hideNowFn) hideNowFn();
      return;
    }
    const jeton = jetonFond.get(fond) || 0;
    fond.classList.add("closing");
    let fait = false;
    const terminer = () => {
      if (fait) return;
      fait = true;
      if (jetonFond.get(fond) !== jeton) return; // dialogue plus récent entre-temps
      fond.classList.remove("open", "closing");
      if (hideNowFn) hideNowFn();
    };
    fond.addEventListener("animationend", terminer, { once: true });
    setTimeout(terminer, 260); // filet de sécurité si l'événement ne se déclenche pas
  }

  /** Fenêtre au gabarit de la charte : en-tête avec icône en couleur
   *  d'accent et croix de fermeture, corps, puis barre d'actions.
   *
   *  Peut s'ouvrir PAR-DESSUS une grande fenêtre déjà affichée (ex.
   *  « Ajouter un fournisseur » depuis Nouvelle commande, « Retirer ce
   *  fournisseur » depuis Configuration) : dans ce cas elle passe par un
   *  SECOND fond (#modale-fond-2), empilé au-dessus du premier — la fenêtre
   *  reste donc affichée, assombrie, derrière le dialogue, au lieu de
   *  disparaître pendant qu'il est ouvert. Les deux fonds sont
   *  indépendants : fermer le dialogue imbriqué ne touche ni au contenu ni
   *  à l'état de la fenêtre en dessous — c'est justement tout l'intérêt. */
  function fondDialogue() { return fenetre ? U.$("#modale-fond-2") : U.$("#modale-fond"); }
  function contenuDialogue() { return fenetre ? U.$("#modale-contenu-2") : U.$("#modale-contenu"); }

  /** `opts.large` : même variante que les fenêtres (voir App.ouvrirFenetre)
   *  pour un dialogue qui a besoin de plus de place que les 520px habituels
   *  (l'aperçu PDF avant génération, voir plus bas). Fonctionne aussi bien
   *  sur le fond imbriqué (#modale-fond-2) que sur le fond normal : la
   *  classe est générique, pas liée à un id précis (voir app.css §11). */
  function ouvrirModale(icone, titre, corps, actions, opts) {
    const contenu = U.vider(contenuDialogue());
    contenu.appendChild(U.el("div", { class: "win-entete" }, [
      U.icone(icone, "ti-titre"),
      U.el("h3", { text: titre }),
      U.el("button", {
        class: "win-fermer", type: "button", text: "✕",
        title: "Fermer", "aria-label": "Fermer", onclick: fermerModale,
      }),
    ]));
    contenu.appendChild(U.el("div", { class: "win-corps" }, [corps]));
    contenu.appendChild(U.el("div", { class: "modale-actions" }, actions));
    const fond = fondDialogue();
    jetonFond.set(fond, (jetonFond.get(fond) || 0) + 1); // voir fermerFenetreAnimee
    fond.classList.remove("closing");
    fond.classList.toggle("modale-fond--large", !!(opts && opts.large));
    fond.classList.add("open");
    // Déjà posée si une fenêtre est ouverte dessous (cas du fond imbriqué) —
    // idempotent, sans effet dans ce cas.
    document.body.classList.add("modale-ouverte");
  }
  function fermerModale() {
    const fond2 = U.$("#modale-fond-2");
    if (fond2.classList.contains("open")) {
      // Dialogue imbriqué : la fenêtre (fond normal) reste ouverte derrière,
      // le défilement de la page doit donc rester bloqué. .modale-fond--large
      // ne se retire qu'au vrai masquage (hideNowFn), même principe et même
      // raison que App.fermerFenetre plus bas : sinon le dialogue sauterait à
      // sa largeur normale d'un coup, avant même que le fondu ait commencé.
      fermerFenetreAnimee(fond2, () => fond2.classList.remove("modale-fond--large"));
      return;
    }
    document.body.classList.remove("modale-ouverte");
    // Ce fond (#modale-fond) n'est utilisé comme fond de DIALOGUE (plutôt que
    // de fenêtre) que lorsqu'aucune fenêtre n'est ouverte (voir fondDialogue
    // ci-dessus) : retirer modale-fond--large ici ne peut donc jamais entrer
    // en conflit avec l'état que gère App.ouvrirFenetre/App.fermerFenetre.
    const fond1 = U.$("#modale-fond");
    fermerFenetreAnimee(fond1, () => fond1.classList.remove("modale-fond--large"));
  }

  /** `destructif` bascule le bouton de validation sur le rouge de la charte,
   *  pour toute opération irréversible. */
  App.confirmer = function (titre, texte, surOui, destructif) {
    ouvrirModale(
      destructif ? "alert-triangle" : "info-circle",
      titre,
      U.el("p", { class: "indice", text: texte }),
      [
        U.el("button", { class: "secondary", type: "button", text: "Annuler", onclick: fermerModale }),
        U.el("button", {
          class: destructif ? "danger" : "copper", type: "button",
          onclick: async () => { fermerModale(); await surOui(); },
        }, [U.icone(destructif ? "trash" : "circle-check"), "Confirmer"]),
      ]
    );
  };

  /** Même gabarit que App.confirmer, mais avec plusieurs boutons de choix
   *  au lieu du seul Annuler/Confirmer — pour « lequel de ces formats
   *  voulez-vous ? » plutôt qu'un simple oui/non. `options` : tableau de
   *  { texte, icone, classe, valeur }, un bouton par entrée ; `surChoix`
   *  reçoit la `valeur` du bouton cliqué. */
  App.choisir = function (titre, texte, options, surChoix) {
    ouvrirModale(
      "info-circle",
      titre,
      U.el("p", { class: "indice", text: texte }),
      [
        U.el("button", { class: "secondary", type: "button", text: "Annuler", onclick: fermerModale }),
        ...options.map((o) => U.el("button", {
          class: o.classe || "copper", type: "button",
          onclick: async () => { fermerModale(); await surChoix(o.valeur); },
        }, [U.icone(o.icone || "circle-check"), o.texte])),
      ]
    );
  };

  App.saisir = function (titre, libelle, valeur, surValider) {
    const input = U.el("input", { type: "text", value: valeur || "" });
    const valider = async () => {
      const v = input.value.trim();
      if (!v) return;
      fermerModale();
      await surValider(v);
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); valider(); } });
    ouvrirModale(
      "plus",
      titre,
      U.el("label", { class: "champ" }, [U.el("span", { text: libelle }), input]),
      [
        U.el("button", { class: "secondary", type: "button", text: "Annuler", onclick: fermerModale }),
        U.el("button", { class: "copper", type: "button", onclick: valider },
          [U.icone("plus"), "Ajouter"]),
      ]
    );
    setTimeout(() => input.focus(), 30);
  };

  /** "rgb(r, g, b)" (ce que renvoie n.style.color une fois posé, même si on
   *  l'a écrit en hexadécimal — le navigateur le renormalise) ou déjà un
   *  hexadécimal → "#rrggbb". Partagé entre htmlVersParagraphes (lecture au
   *  moment d'enregistrer) et le suivi en direct de la barre d'outils
   *  (lecture au fil du curseur, voir majEtatBoutons) : même conversion aux
   *  deux endroits. */
  function couleurHexDe(css) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || "");
    if (m) return "#" + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, "0")).join("");
    return /^#[0-9a-f]{6}$/i.test(css || "") ? css : null;
  }
  function ptDe(css) {
    const m = /([\d.]+)pt/.exec(css || "");
    return m ? Math.round(parseFloat(m[1])) : null;
  }

  /** Gabarit commun à tous les boutons des barres d'outils d'édition
   *  (App.saisirTexteRiche, App.saisirTableau) — même largeur, même hauteur,
   *  posées en style inline (l'emporte toujours sur une classe, aucun piège
   *  d'ordre dans la feuille à surveiller) : retour utilisateur, ces
   *  boutons n'avaient pas tous la même taille (25px/23px/39px selon qu'ils
   *  venaient de .small.icon-only, d'un style inline ou de la hauteur par
   *  défaut d'un <select>). `justify-content:center` : la règle `button`
   *  de base (app.css) centre seulement VERTICALEMENT son contenu
   *  (`align-items:center`), sans le centrer horizontalement
   *  (`justify-content` non posé, par défaut `flex-start`) — sans effet
   *  visible sur un bouton texte+icône qui s'ajuste à son contenu, mais un
   *  bouton de TAILLE FIXE (30×30, ici) contenant une seule lettre (G/I/S)
   *  la collait contre le bord gauche au lieu de la centrer dans le carré
   *  (retour utilisateur du 10 septembre 2026, capture à l'appui). */
  const TAILLE_BOUTON_EDITEUR = "width:30px;height:30px;padding:0;flex-shrink:0;justify-content:center;";

  /** Alignement vertical d'une cellule de tableau (App.saisirTableau) →
   *  valeur `justify-content` de la zone éditable en flexbox colonne (voir
   *  construireCellule/appliquerAlignementVerticalCellule plus bas, et
   *  app.css .cellule-texte). */
  const JUSTIFY_VERTICAL = { top: "flex-start", middle: "center", bottom: "flex-end" };

  /** Palette de couleurs limitée (pas de sélecteur libre — retour
   *  utilisateur : « ce serait cool de limiter les couleurs ») partagée par
   *  App.saisirTexteRiche ET App.saisirTableau (mise en forme par cellule,
   *  ajoutée le 10 septembre 2026) — couleurs reprises de la charte SPI
   *  (voir css/app.css : --ink, --warn, --copper, --moss) plus un
   *  orange neutre, cohérentes avec le reste de l'outil. */
  const PALETTE_COULEURS = [
    { nom: "Noir", hex: "#111827" },
    { nom: "Rouge", hex: "#DC2626" },
    { nom: "Bleu", hex: "#194093" },
    { nom: "Vert", hex: "#4A6E30" },
    { nom: "Orange", hex: "#C2410C" },
    { nom: "Gris", hex: "#6B7280" },
  ];

  /** Convertit des paragraphes { t, b, i, u, couleur, taille } (voir
   *  U.paragraphesDeBloc, utils.js) + un alignement par paragraphe
   *  ("left"/"center"/"right"/"justify", voir U.alignementsDeBloc) en HTML
   *  pour peupler l'éditeur riche ci-dessous — un <div> par paragraphe
   *  (c'est ce que Chrome crée lui-même à chaque Entrée dans un
   *  contenteditable), un <div><br></div> pour un paragraphe vide (sinon la
   *  ligne vide n'aurait aucune hauteur et serait impossible à cliquer). */
  function paragraphesVersHtml(paragraphes, alignements) {
    return paragraphes.map((runs, p) => {
      const align = alignements && alignements[p] && alignements[p] !== "left"
        ? ' style="text-align:' + alignements[p] + '"' : "";
      if (!runs.length) return "<div" + align + "><br></div>";
      const contenu = runs.map((r) => {
        let html = U.echapper(r.t);
        const styles = [];
        if (r.couleur) styles.push("color:" + r.couleur);
        if (r.taille) styles.push("font-size:" + r.taille + "pt");
        if (styles.length) html = '<span style="' + styles.join(";") + '">' + html + "</span>";
        if (r.u) html = "<u>" + html + "</u>";
        if (r.i) html = "<i>" + html + "</i>";
        if (r.b) html = "<b>" + html + "</b>";
        return html;
      }).join("");
      return "<div" + align + ">" + contenu + "</div>";
    }).join("");
  }

  /** Chemin inverse : relit le HTML que Chrome a construit dans l'éditeur
   *  (après du gras/italique/souligné/couleur/taille/alignement au fil de
   *  la frappe) et le ramène à la même forme normalisée — { paragraphes:
   *  [[{t,b,i,u,couleur,taille}, ...], ...], alignements: ["left"/"center"/
   *  "right"/"justify", ...] } — c'est cette forme, pas le HTML, qui est
   *  stockée et lue par les deux générateurs (Word, PDF). Un <div>/<p> ou
   *  un <br> commence un nouveau paragraphe, comme le fait Chrome lui-même
   *  dans un contenteditable ; l'alignement (execCommand justifyXxx pose un
   *  text-align sur le <div>/<p> englobant) est repris pour ce paragraphe. */
  function htmlVersParagraphes(racine) {
    const paragraphes = [];
    const alignements = [];
    let courant = [];
    let alignCourant = "left";
    function finParagraphe() {
      paragraphes.push(courant);
      alignements.push(alignCourant);
      courant = [];
      alignCourant = "left";
    }
    function parcourir(noeud, style) {
      if (noeud.nodeType === Node.TEXT_NODE) {
        // U+200B : marqueur de largeur nulle posé par appliquerTaille pour
        // porter une taille choisie avant de taper quoi que ce soit — sans
        // valeur ici s'il n'a pas été suivi de texte, sinon invisible mais
        // à ne pas garder (deviendrait un "?" dans le PDF, voir U.pourPDF).
        const texte = noeud.nodeValue.replace(/​/g, "");
        if (texte) courant.push(Object.assign({ t: texte }, style));
        return;
      }
      if (noeud.nodeType !== Node.ELEMENT_NODE) return;
      if (noeud.tagName === "BR") { finParagraphe(); return; }
      const s = Object.assign({}, style);
      if (noeud.tagName === "B" || noeud.tagName === "STRONG") s.b = true;
      if (noeud.tagName === "I" || noeud.tagName === "EM") s.i = true;
      if (noeud.tagName === "U") s.u = true;
      if (noeud.tagName === "FONT" && noeud.color) s.couleur = couleurHexDe(noeud.color) || noeud.color;
      if (noeud.style) {
        const c = couleurHexDe(noeud.style.color);
        if (c) s.couleur = c;
        if (/^(bold|[6-9]00)$/.test(noeud.style.fontWeight || "")) s.b = true;
        if (noeud.style.fontStyle === "italic") s.i = true;
        if (/underline/.test(noeud.style.textDecorationLine || noeud.style.textDecoration || "")) s.u = true;
        const taille = ptDe(noeud.style.fontSize);
        if (taille) s.taille = taille;
      }
      const bloc = noeud.tagName === "DIV" || noeud.tagName === "P";
      if (bloc && noeud.style && noeud.style.textAlign) {
        const a = noeud.style.textAlign;
        alignCourant = (a === "center" || a === "right" || a === "justify") ? a : "left";
      }
      for (const enfant of Array.from(noeud.childNodes)) parcourir(enfant, s);
      if (bloc) finParagraphe();
    }
    for (const enfant of Array.from(racine.childNodes)) parcourir(enfant, {});
    finParagraphe();
    const nettoyes = paragraphes.map((p) => p.filter((s) => s.t !== ""));
    // Chrome peut ajouter une ligne vide de plus en appliquant une mise en
    // forme sur une sélection qui va jusqu'à la fin (ex. tout sélectionner
    // puis Gras) : sans ce nettoyage, rouvrir/réenregistrer le même bloc
    // plusieurs fois accumule des lignes vides en fin de texte à chaque
    // aller-retour. On n'en garde qu'une seule au maximum — une ligne vide
    // voulue reste possible, l'accumulation non.
    while (nettoyes.length > 1 &&
           !nettoyes[nettoyes.length - 1].length &&
           !nettoyes[nettoyes.length - 2].length) {
      nettoyes.pop();
      alignements.pop();
    }
    return {
      paragraphes: nettoyes.length ? nettoyes : [[]],
      alignements: alignements.length ? alignements : ["left"],
    };
  }

  /** Taille de police précise (points), sur du texte sélectionné OU au
   *  prochain caractère tapé si le curseur est juste posé quelque part sans
   *  rien sélectionner (cas le plus courant : on choisit la taille avant de
   *  taper, pas après). Ces deux cas ont besoin d'un traitement différent :
   *
   *  - Sélection non vide : hack classique via execCommand — la commande
   *    native "fontSize" ne connaît que l'échelle HTML historique 1-7, pas
   *    des points, donc on l'utilise avec une valeur sentinelle (7) puis on
   *    retrouve ce que ça vient de créer pour y poser la vraie taille en
   *    points. Sous "styleWithCSS" (activé plus bas, pour que couleur/
   *    taille utilisent des <span style> plutôt que les balises <font>
   *    historiques) Chrome ne crée PAS de <font size="7"> comme on pourrait
   *    s'y attendre, mais un <span style="font-size:xxx-large"> — le
   *    mot-clé CSS auquel il fait correspondre l'ancien cran 7 (bug trouvé
   *    le 8 septembre 2026 : choisir une taille sur du texte sélectionné
   *    donnait un texte anormalement énorme au lieu de la taille demandée,
   *    parce que ce marqueur n'était pas reconnu et restait tel quel). On
   *    repère donc ce marqueur sous ses deux formes possibles (le mot-clé
   *    CSS, et l'ancienne balise par sécurité si un autre navigateur s'en
   *    sert encore) et on y POSE la taille sans reconstruire l'élément —
   *    pour ne pas perdre une autre mise en forme qu'il porterait déjà (ex.
   *    une couleur posée juste avant sur la même sélection).
   *
   *  - Curseur seul (sélection vide) : sur ce cas-là, "fontSize" ne crée
   *    l'élément qu'au moment où l'utilisateur tape un premier caractère —
   *    trop tard pour le repérer ci-dessus, qui tombait dans le vide (même
   *    date : choisir une taille puis taper ne changeait rien). On insère
   *    donc nous-mêmes un span vide, avec un espace de largeur nulle
   *    (U+200B, retiré à la lecture — voir htmlVersParagraphes) pour qu'il
   *    existe réellement dans le DOM, et on y place le curseur : la frappe
   *    suivante hérite de son style, comme dans un traitement de texte
   *    classique. */
  function appliquerTaille(zone, points) {
    const sel = window.getSelection();
    const rangeCourant = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!rangeCourant || rangeCourant.collapsed) {
      const span = document.createElement("span");
      span.style.fontSize = points + "pt";
      span.appendChild(document.createTextNode("​")); // espace de largeur nulle, retiré à la lecture
      if (rangeCourant) rangeCourant.insertNode(span); else zone.appendChild(span);
      const apres = document.createRange();
      apres.setStart(span.firstChild, 1);
      apres.collapse(true);
      sel.removeAllRanges();
      sel.addRange(apres);
      return;
    }
    document.execCommand("fontSize", false, "7");
    zone.querySelectorAll('font[size="7"], [style*="xxx-large"]').forEach((el) => {
      if (el.tagName === "FONT") {
        const span = document.createElement("span");
        span.style.fontSize = points + "pt";
        while (el.firstChild) span.appendChild(el.firstChild);
        el.parentNode.replaceChild(span, el);
      } else {
        el.style.fontSize = points + "pt";
      }
    });
  }

  /** Éditeur de texte enrichi (gras, italique, souligné, couleur, taille,
   *  alignement) pour les paragraphes de texte libre insérés dans une
   *  commande, mélangés aux captures d'écran (voir vue-commande.js). Le
   *  contenu est stocké normalisé en tableau de paragraphes { t, b, i, u,
   *  couleur, taille } + un alignement par paragraphe (voir
   *  U.paragraphesDeBloc/U.alignementsDeBloc, utils.js) plutôt qu'en
   *  HTML brut : c'est cette forme que lisent aussi bien le générateur Word
   *  (XML brut, voir docx.js) que le générateur PDF (pdf.js).
   *  `paragraphesInitiaux`/`alignementsInitiaux` : null pour un nouveau
   *  bloc, ou le contenu existant pour le modifier. `libelleBouton`/
   *  `iconeBouton` : "Ajouter"/"plus" par défaut, à passer en
   *  "Enregistrer"/"device-floppy" pour modifier un bloc existant. Boutons
   *  Gras/Italique/Souligné en lettre stylée (G/I/S) plutôt qu'en icône :
   *  aucune icône "bold/italic/underline" n'est embarquée dans
   *  css/polices.css (jeu fixe, encodé à la main), inutile d'en ajouter
   *  une pour ça — même chose pour les 4 boutons d'alignement, en texte
   *  court plutôt qu'en icône. */
  App.saisirTexteRiche = function (titre, paragraphesInitiaux, alignementsInitiaux, surValider, libelleBouton, iconeBouton) {
    const zone = U.el("div", {
      class: "editeur-riche", contenteditable: "true",
      html: paragraphesVersHtml(
        paragraphesInitiaux && paragraphesInitiaux.length ? paragraphesInitiaux : [[]],
        alignementsInitiaux
      ),
    });

    // Un clic sur un bouton de la barre d'outils (couleur, taille) déplace
    // le focus hors de l'éditeur, ce qui perd la sélection de texte en
    // cours — on la mémorise en continu pour la remettre en place juste
    // avant d'appliquer la commande.
    let derniereSelection = null;
    function surSelection() {
      const sel = window.getSelection();
      if (sel.rangeCount && zone.contains(sel.anchorNode)) derniereSelection = sel.getRangeAt(0).cloneRange();
    }
    document.addEventListener("selectionchange", surSelection);
    function restaurerSelection() {
      if (!derniereSelection) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(derniereSelection);
    }

    /** Reflète dans la barre d'outils ce qui est sous le curseur (ou couvert
     *  par la sélection) — même principe qu'un vrai traitement de texte,
     *  dont le ruban affiche "12 pt" ou surligne "G" en fonction d'où on
     *  clique, pas seulement du dernier bouton pressé (demande explicite de
     *  Ludo : « il faut que le comportement de la zone de texte soit un
     *  mini Word »). Gras/Italique/Souligné ont un état natif fiable
     *  (queryCommandState) ; couleur/taille non — surtout la taille, qui
     *  n'a pas d'équivalent "queryCommandValue" fiable sous styleWithCSS
     *  (voir appliquerTaille) — donc on relit directement le style hérité
     *  en remontant depuis le point du curseur jusqu'à l'éditeur. */
    function majEtatBoutons() {
      btnGras.className = "small icon-only " + (document.queryCommandState("bold") ? "copper" : "secondary");
      btnItalique.className = "small icon-only " + (document.queryCommandState("italic") ? "copper" : "secondary");
      btnSouligne.className = "small icon-only " + (document.queryCommandState("underline") ? "copper" : "secondary");
      // Contrairement à la taille (voir appliquerTaille), l'alignement a un
      // état natif fiable via queryCommandState, comme gras/italique/souligné.
      btnAlignGauche.className = document.queryCommandState("justifyLeft") ? "copper" : "secondary";
      btnAlignCentre.className = document.queryCommandState("justifyCenter") ? "copper" : "secondary";
      btnAlignDroite.className = document.queryCommandState("justifyRight") ? "copper" : "secondary";
      btnAlignJustifie.className = document.queryCommandState("justifyFull") ? "copper" : "secondary";

      let taille = 12, couleurActive = null;
      let tailleTrouvee = false;
      const sel = window.getSelection();
      let n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
      if (n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
      while (n && n !== zone && n.nodeType === Node.ELEMENT_NODE) {
        if (n.style) {
          if (!couleurActive) {
            const c = couleurHexDe(n.style.color);
            if (c) couleurActive = c;
          }
          if (!tailleTrouvee) {
            const t = ptDe(n.style.fontSize);
            if (t) { taille = t; tailleTrouvee = true; }
          }
        }
        n = n.parentElement;
      }
      selTaille.value = [].some.call(selTaille.options, (o) => Number(o.value) === taille) ? taille : 12;
      boutonsCouleur.forEach((btn, i) => {
        const actif = !!couleurActive && couleurActive.toLowerCase() === PALETTE_COULEURS[i].hex.toLowerCase();
        btn.style.boxShadow = actif ? "0 0 0 2px var(--paper-card), 0 0 0 4px var(--ink)" : "none";
      });
    }

    const btnGras = U.el("button", {
      type: "button", style: TAILLE_BOUTON_EDITEUR + "font-weight:800;",
      title: "Gras", "aria-label": "Gras",
      onmousedown: (e) => e.preventDefault(), // garde le focus/la sélection dans l'éditeur
      onclick: () => { zone.focus(); document.execCommand("bold"); majEtatBoutons(); },
    }, ["G"]);
    const btnItalique = U.el("button", {
      // font-weight:700 en plus de l'italique — un « I » italique en graisse
      // normale n'a ni serif ni empattement, juste un trait fin penché : à
      // la taille de ces boutons (~13px), il se lit comme un slash « / »,
      // pas comme un I (bug visuel remonté le 10 septembre 2026, capture à
      // l'appui). Alourdir le trait le rend identifiable sans en changer le
      // sens ni la taille du bouton.
      type: "button", style: TAILLE_BOUTON_EDITEUR + "font-style:italic;font-weight:700;",
      title: "Italique", "aria-label": "Italique",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { zone.focus(); document.execCommand("italic"); majEtatBoutons(); },
    }, ["I"]);
    const btnSouligne = U.el("button", {
      type: "button", style: TAILLE_BOUTON_EDITEUR + "text-decoration:underline;",
      title: "Souligné", "aria-label": "Souligné",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { zone.focus(); document.execCommand("underline"); majEtatBoutons(); },
    }, ["S"]);

    // Alignement du paragraphe (pas du texte sélectionné — comme dans un
    // vrai traitement de texte, ça s'applique à tout le paragraphe où se
    // trouve le curseur). En texte court plutôt qu'en icône, même raison
    // que Gras/Italique/Souligné : aucune icône align-center/right/justify
    // n'est embarquée (seule align-left l'est, insuffisant pour les 4).
    const btnAlignGauche = U.el("button", {
      type: "button", class: "secondary", title: "Aligner à gauche", "aria-label": "Aligner à gauche",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { zone.focus(); document.execCommand("justifyLeft"); majEtatBoutons(); },
    }, ["Gauche"]);
    const btnAlignCentre = U.el("button", {
      type: "button", class: "secondary", title: "Centrer", "aria-label": "Centrer",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { zone.focus(); document.execCommand("justifyCenter"); majEtatBoutons(); },
    }, ["Centre"]);
    const btnAlignDroite = U.el("button", {
      type: "button", class: "secondary", title: "Aligner à droite", "aria-label": "Aligner à droite",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { zone.focus(); document.execCommand("justifyRight"); majEtatBoutons(); },
    }, ["Droite"]);
    const btnAlignJustifie = U.el("button", {
      type: "button", class: "secondary", title: "Justifier", "aria-label": "Justifier",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { zone.focus(); document.execCommand("justifyFull"); majEtatBoutons(); },
    }, ["Justifié"]);

    const selTaille = U.el("select", {
      title: "Taille du texte", style: "width:72px;height:30px;padding:0 4px;flex-shrink:0;",
    }, [10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((n) => U.el("option", {
        value: n, text: n + " pt", selected: n === 12 ? "" : null,
      })));
    selTaille.addEventListener("mousedown", (e) => e.stopPropagation());
    selTaille.addEventListener("change", () => {
      restaurerSelection(); zone.focus();
      appliquerTaille(zone, Number(selTaille.value));
      majEtatBoutons();
    });

    // Palette limitée plutôt qu'un sélecteur de couleur libre (retour
    // utilisateur : « ce serait cool de limiter les couleurs ») — voir
    // PALETTE_COULEURS (module-level, partagée avec App.saisirTableau).
    // Comme Gras/Italique/Souligné, ce sont de simples boutons (onmousedown
    // preventDefault garde le focus/la sélection dans l'éditeur) — pas
    // besoin de la restauration de sélection qu'exige un <input type=color>
    // natif (il vole le focus en ouvrant son propre sélecteur de couleurs).
    const boutonsCouleur = PALETTE_COULEURS.map((c) => U.el("button", {
      type: "button", title: c.nom, "aria-label": "Couleur " + c.nom,
      style: TAILLE_BOUTON_EDITEUR + "border-radius:6px;border:1px solid var(--line);background:" + c.hex,
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { zone.focus(); document.execCommand("foreColor", false, c.hex); majEtatBoutons(); },
    }));
    const zoneCouleurs = U.el("div", { style: "display:flex;gap:4px;align-items:center" }, boutonsCouleur);

    /** « Effacer la mise en forme » — bouton du groupe Police du ruban
     *  Accueil de Word (icône « abc » + flèche courbe dans Word ; en texte
     *  ici, même raison que Gauche/Centre/Droite : aucune icône de ce genre
     *  n'est embarquée, voir [[contrainte-html-js-css-pur]]), repéré sur le
     *  site officiel Microsoft à la demande de Ludo le 10 septembre 2026
     *  (support.microsoft.com/.../clear-all-text-formatting : « clear all
     *  formatting (such as bold, underline, italics, color, superscript,
     *  subscript, and more) » — uniquement des exemples de mise en forme de
     *  CARACTÈRE, aucune mention de l'alignement). Dans Word, ce bouton du
     *  groupe Police ne touche donc PAS à l'alignement (groupe Paragraphe,
     *  séparé) — alors que `execCommand("removeFormat")`, lui, efface aussi
     *  le `text-align` du <div> de paragraphe s'il est entièrement dans la
     *  sélection (constaté en testant : sélectionner tout un paragraphe
     *  centré puis Effacer le repassait à gauche). On mémorise donc
     *  l'alignement de chaque paragraphe avant, pour le reposer juste après
     *  — sans sélection (curseur seul), `removeFormat` n'a rien à effacer,
     *  comme dans Word. */
    const btnEffacer = U.el("button", {
      type: "button", class: "secondary", title: "Effacer la mise en forme",
      "aria-label": "Effacer la mise en forme",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        zone.focus();
        const alignementsAvant = Array.from(zone.children).map((p) => p.style.textAlign);
        document.execCommand("removeFormat");
        Array.from(zone.children).forEach((p, i) => { p.style.textAlign = alignementsAvant[i] || ""; });
        majEtatBoutons();
      },
    }, ["Effacer"]);

    majEtatBoutons(); // premier état : rien de spécial (curseur pas encore posé), mais initialise la barre

    // styleWithCSS pousse "couleur"/"taille" en <span style="..."> plutôt
    // qu'en balises <font> historiques — plus simple à relire ensuite dans
    // htmlVersParagraphes (un seul format à reconnaître, même si les deux
    // restent tolérés en lecture).
    document.execCommand("styleWithCSS", false, true);
    zone.addEventListener("keyup", majEtatBoutons);
    zone.addEventListener("mouseup", majEtatBoutons);

    const nettoyer = () => document.removeEventListener("selectionchange", surSelection);
    const valider = async () => {
      const { paragraphes, alignements } = htmlVersParagraphes(zone);
      if (!paragraphes.some((p) => p.some((s) => s.t.trim() !== ""))) return;
      nettoyer();
      fermerModale();
      await surValider(paragraphes, alignements);
    };
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); valider(); }
    });

    ouvrirModale(
      "align-left",
      titre,
      U.el("div", {}, [
        U.el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px" }, [
          btnGras, btnItalique, btnSouligne, selTaille, zoneCouleurs, btnEffacer,
        ]),
        U.el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px" }, [
          btnAlignGauche, btnAlignCentre, btnAlignDroite, btnAlignJustifie,
        ]),
        zone,
        U.el("div", { class: "indice", text: "Ctrl+Entrée pour valider directement." }),
      ]),
      [
        U.el("button", { class: "secondary", type: "button", text: "Annuler", onclick: () => { nettoyer(); fermerModale(); } }),
        U.el("button", { class: "copper", type: "button", onclick: valider },
          [U.icone(iconeBouton || "plus"), libelleBouton || "Ajouter"]),
      ],
      { large: true } // la barre d'outils a besoin d'un peu plus de place que les 520px habituels
    );
    // Bug visuel trouvé le 10 septembre 2026 (capture à l'appui : Italique
    // affiché actif — copper — sur un éditeur tout juste ouvert, sans aucun
    // texte ni sélection) : `document.queryCommandState(...)`, lu par
    // majEtatBoutons() ci-dessus, n'est fiable QUE quand la sélection du
    // document se trouve réellement dans `zone` — au moment du premier
    // appel juste avant (utile pour ne pas laisser les boutons sans classe
    // du tout le temps que ce setTimeout s'exécute), le focus n'y est pas
    // encore : Chrome peut alors renvoyer un état hérité de N'IMPORTE QUOI
    // (la dernière sélection ailleurs sur la page, ou un état par défaut
    // incohérent) plutôt que « rien n'est actif ». On revérifie donc une
    // seconde fois une fois le focus réellement posé, seul moment où l'état
    // lu reflète vraiment CET éditeur.
    setTimeout(() => { zone.focus(); majEtatBoutons(); }, 30);
  };

  /** Éditeur de tableau simple pour les blocs de texte libre d'une commande
   *  (mélangé aux captures d'écran et aux paragraphes de texte, voir
   *  vue-commande.js). Cellules en texte brut (pas de gras/italique/
   *  couleur par cellule, contrairement au texte libre — gardé simple pour
   *  ce premier jet), mais avec un alignement horizontal (gauche/centre/
   *  droite) ET vertical (haut/milieu/bas) par cellule — les deux groupes du
   *  ruban « Alignement » d'Excel (retour utilisateur du 10 septembre 2026 :
   *  « dans Excel il y a plus de possibilités pour le positionnement du
   *  texte », après vérification du ruban officiel Accueil > Alignement,
   *  qui a bien ces deux groupes de 3 boutons — le reste du groupe Excel,
   *  fusion de cellules/renvoi à la ligne/orientation du texte, ne
   *  correspond à aucun besoin exprimé ici, donc pas ajouté). Stocké en
   *  `lignes` (tableau de lignes, chacune un tableau de chaînes — copie
   *  APLATIE, sans mise en forme, de `paragraphesCellules` ci-dessous ;
   *  gardée pour la rétrocompatibilité et la vérification « au moins une
   *  cellule non vide »), `largeursCol` (poids relatifs par colonne — pas
   *  des pourcentages, ils n'ont pas besoin de sommer à 100 : ils sont
   *  normalisés au moment de générer), `hauteursLigne` (points, hauteur
   *  MINIMALE d'une ligne, `null` = automatique), `alignementsCellules`
   *  (même forme que `lignes`, "left"/"center"/"right" par cellule),
   *  `alignementsVerticauxCellules` (même forme, "top"/"middle"/"bottom" par
   *  cellule) et `paragraphesCellules` (même forme, un tableau de
   *  paragraphes `{t,b,i,u,couleur,taille}` par cellule — EXACTEMENT la
   *  forme d'un bloc de texte libre, voir App.saisirTexteRiche ci-dessus —
   *  gras/italique/souligné/couleur/taille par cellule, ajouté le
   *  10 septembre 2026 à la demande de Ludo, « même feature » que le texte
   *  libre) — tous lus aussi bien par le générateur Word (raw XML, voir
   *  tableauRicheXML dans docx.js) que par le générateur PDF
   *  (Composeur.tableau, pdf.js). `lignesInitiales` : null pour un
   *  nouveau tableau (2×2 vide), ou le contenu existant pour le modifier.
   *  `libelleBouton`/`iconeBouton` : "Ajouter"/"plus" par défaut, à passer
   *  en "Enregistrer"/"device-floppy" pour modifier un tableau existant. */
  App.saisirTableau = function (
    titre, lignesInitiales, largeursColInitiales, hauteursLigneInitiales,
    alignementsCellulesInitiales, alignementsVerticauxCellulesInitiales, paragraphesCellulesInitiales,
    surValider, libelleBouton, iconeBouton
  ) {
    let lignes = (lignesInitiales && lignesInitiales.length ? lignesInitiales : [["", ""], ["", ""]])
      .map((ligne) => ligne.slice());
    const nbColonnes = () => (lignes[0] ? lignes[0].length : 0);
    let largeursCol = (largeursColInitiales && largeursColInitiales.length === nbColonnes()
      ? largeursColInitiales : Array(nbColonnes()).fill(1)).slice();
    let hauteursLigne = (hauteursLigneInitiales && hauteursLigneInitiales.length === lignes.length
      ? hauteursLigneInitiales : Array(lignes.length).fill(null)).slice();
    let alignementsCellules = (alignementsCellulesInitiales && alignementsCellulesInitiales.length === lignes.length
      ? alignementsCellulesInitiales : lignes.map((l) => l.map(() => "left"))).map((l) => l.slice());
    let alignementsVerticauxCellules = (alignementsVerticauxCellulesInitiales
      && alignementsVerticauxCellulesInitiales.length === lignes.length
      ? alignementsVerticauxCellulesInitiales : lignes.map((l) => l.map(() => "top"))).map((l) => l.slice());
    // Une cellule sans paragraphesCellules initiaux (nouveau tableau, ou
    // tableau enregistré avant cet ajout) part de son texte brut existant
    // (lignes[r][c]) transformé en un unique paragraphe sans mise en forme —
    // même principe que U.paragraphesDeBloc pour un bloc de texte libre
    // ancien format.
    let paragraphesCellules = (paragraphesCellulesInitiales && paragraphesCellulesInitiales.length === lignes.length
      ? paragraphesCellulesInitiales
      : lignes.map((l) => l.map((texte) => (texte ? [[{ t: texte }]] : [[]]))))
      .map((l) => l.map((paragraphes) => paragraphes.map((runs) => runs.map((seg) => Object.assign({}, seg)))));
    let celluleActive = null; // { r, c } de la dernière cellule éditée/focus — cible des boutons d'alignement/mise en forme

    /** Zone contenteditable de la cellule active AU MOMENT de l'appel — les
     *  boutons Gras/Italique/… ci-dessous ciblent toujours CELLE-CI plutôt
     *  qu'une zone fixe unique (contrairement à App.saisirTexteRiche, qui
     *  n'a qu'une seule zone) : un tableau a une zone par cellule. */
    function zoneCelluleActive() {
      if (!celluleActive) return null;
      const tr = lignesDonnees[celluleActive.r];
      const td = tr && tr.children[celluleActive.c];
      return td ? td.querySelector(".cellule-texte") : null;
    }

    const table = U.el("table", { class: "editeur-tableau" });
    const colgroup = U.el("colgroup");

    // Tab/Maj+Tab déplacent le curseur d'une cellule à l'autre, comme dans
    // un vrai tableau de traitement de texte — un simple contenteditable ne
    // le fait pas nativement.
    function allerCellule(zoneTexte, decalage) {
      const cellules = Array.from(table.querySelectorAll(".cellule-texte"));
      const suivante = cellules[cellules.indexOf(zoneTexte) + decalage];
      if (!suivante) return;
      suivante.focus();
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(suivante);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }

    let lignesDonnees = [];

    function majBoutonsAlignement() {
      const a = celluleActive ? (alignementsCellules[celluleActive.r][celluleActive.c] || "left") : "left";
      btnCelluleGauche.className = a === "left" ? "copper" : "secondary";
      btnCelluleCentre.className = a === "center" ? "copper" : "secondary";
      btnCelluleDroite.className = a === "right" ? "copper" : "secondary";
      const v = celluleActive ? (alignementsVerticauxCellules[celluleActive.r][celluleActive.c] || "top") : "top";
      btnCelluleHaut.className = v === "top" ? "copper" : "secondary";
      btnCelluleMilieu.className = v === "middle" ? "copper" : "secondary";
      btnCelluleBas.className = v === "bottom" ? "copper" : "secondary";
    }

    // Mise en forme de CARACTÈRE (gras/italique/souligné/couleur/taille) par
    // cellule, ajoutée le 10 septembre 2026 — même barre, mêmes boutons et
    // mêmes mécanismes que App.saisirTexteRiche (voir plus haut), mais
    // ciblant `zoneCelluleActive()` (qui change de cellule en cellule)
    // plutôt qu'une unique zone fixe. Un clic sur un bouton de la barre
    // (couleur, taille) déplace le focus hors de la cellule et perd sa
    // sélection de texte en cours — mémorisée en continu, restaurée juste
    // avant d'appliquer la commande, même principe que le texte libre.
    let derniereSelectionCar = null;
    function surSelectionCar() {
      const zone = zoneCelluleActive();
      const sel = window.getSelection();
      if (zone && sel.rangeCount && zone.contains(sel.anchorNode)) derniereSelectionCar = sel.getRangeAt(0).cloneRange();
    }
    document.addEventListener("selectionchange", surSelectionCar);
    function restaurerSelectionCar() {
      if (!derniereSelectionCar) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(derniereSelectionCar);
    }

    /** Même principe que majEtatBoutons dans App.saisirTexteRiche : reflète
     *  dans la barre ce qui est sous le curseur DANS LA CELLULE ACTIVE. */
    function majEtatBoutonsCaracteres() {
      btnGrasCellule.className = "small icon-only " + (document.queryCommandState("bold") ? "copper" : "secondary");
      btnItaliqueCellule.className = "small icon-only " + (document.queryCommandState("italic") ? "copper" : "secondary");
      btnSouligneCellule.className = "small icon-only " + (document.queryCommandState("underline") ? "copper" : "secondary");

      const zone = zoneCelluleActive();
      let taille = 12, couleurActive = null, tailleTrouvee = false;
      const sel = window.getSelection();
      let n = zone && sel.rangeCount ? sel.getRangeAt(0).startContainer : null;
      if (n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
      while (n && zone && n !== zone && n.nodeType === Node.ELEMENT_NODE) {
        if (n.style) {
          if (!couleurActive) { const c = couleurHexDe(n.style.color); if (c) couleurActive = c; }
          if (!tailleTrouvee) { const t = ptDe(n.style.fontSize); if (t) { taille = t; tailleTrouvee = true; } }
        }
        n = n.parentElement;
      }
      selTailleCellule.value = [].some.call(selTailleCellule.options, (o) => Number(o.value) === taille) ? taille : 12;
      boutonsCouleurCellule.forEach((btn, i) => {
        const actif = !!couleurActive && couleurActive.toLowerCase() === PALETTE_COULEURS[i].hex.toLowerCase();
        btn.style.boxShadow = actif ? "0 0 0 2px var(--paper-card), 0 0 0 4px var(--ink)" : "none";
      });
    }

    // class: "small icon-only secondary" posée ICI, à la création — pas
    // seulement via majEtatBoutonsCaracteres() — pour ces 3 boutons : tant
    // qu'aucune cellule n'a le focus (à l'ouverture du dialogue, avant tout
    // clic), rien n'appelle encore majEtatBoutonsCaracteres() (contrairement
    // au texte libre, qui le fait une fois au démarrage — voir
    // App.saisirTexteRiche), et un bouton SANS classe du tout retombe sur le
    // style par défaut du navigateur (bug visuel remonté le 10 septembre
    // 2026 : G/I/S dessinés en gris foncé plein, différents du reste de la
    // barre). Ce défaut est volontairement un simple pense-bête statique
    // ("secondary", jamais actif) plutôt qu'un appel anticipé à
    // majEtatBoutonsCaracteres() : interroger queryCommandState() avant
    // qu'une cellule ait réellement le focus est justement ce qui cause
    // l'AUTRE bug corrigé le même jour dans App.saisirTexteRiche (état
    // hérité incohérent) — inutile d'reproduire ce risque ici alors qu'on
    // SAIT déjà que rien ne doit être actif tant qu'aucune cellule n'est
    // sélectionnée.
    const btnGrasCellule = U.el("button", {
      type: "button", class: "small icon-only secondary",
      style: TAILLE_BOUTON_EDITEUR + "font-weight:800;",
      title: "Gras", "aria-label": "Gras",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { document.execCommand("bold"); majEtatBoutonsCaracteres(); },
    }, ["G"]);
    const btnItaliqueCellule = U.el("button", {
      // font-weight:700 en plus de l'italique — un « I » italique en graisse
      // normale n'a ni serif ni empattement, juste un trait fin penché : à
      // la taille de ces boutons (~13px), il se lit comme un slash « / »,
      // pas comme un I (bug visuel remonté le 10 septembre 2026, capture à
      // l'appui). Alourdir le trait le rend identifiable sans en changer le
      // sens ni la taille du bouton.
      type: "button", class: "small icon-only secondary",
      style: TAILLE_BOUTON_EDITEUR + "font-style:italic;font-weight:700;",
      title: "Italique", "aria-label": "Italique",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { document.execCommand("italic"); majEtatBoutonsCaracteres(); },
    }, ["I"]);
    const btnSouligneCellule = U.el("button", {
      type: "button", class: "small icon-only secondary",
      style: TAILLE_BOUTON_EDITEUR + "text-decoration:underline;",
      title: "Souligné", "aria-label": "Souligné",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { document.execCommand("underline"); majEtatBoutonsCaracteres(); },
    }, ["S"]);
    const selTailleCellule = U.el("select", {
      title: "Taille du texte", style: "width:72px;height:30px;padding:0 4px;flex-shrink:0;",
    }, [10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((n) => U.el("option", {
        value: n, text: n + " pt", selected: n === 12 ? "" : null,
      })));
    selTailleCellule.addEventListener("mousedown", (e) => e.stopPropagation());
    selTailleCellule.addEventListener("change", () => {
      restaurerSelectionCar();
      const zone = zoneCelluleActive();
      if (zone) { zone.focus(); appliquerTaille(zone, Number(selTailleCellule.value)); }
      majEtatBoutonsCaracteres();
    });
    const boutonsCouleurCellule = PALETTE_COULEURS.map((c) => U.el("button", {
      type: "button", title: c.nom, "aria-label": "Couleur " + c.nom,
      style: TAILLE_BOUTON_EDITEUR + "border-radius:6px;border:1px solid var(--line);background:" + c.hex,
      onmousedown: (e) => e.preventDefault(),
      onclick: () => { document.execCommand("foreColor", false, c.hex); majEtatBoutonsCaracteres(); },
    }));
    const zoneCouleursCellule = U.el("div", { style: "display:flex;gap:4px;align-items:center" }, boutonsCouleurCellule);
    // « Effacer la mise en forme » — même bouton, même nom et même correctif
    // que App.saisirTexteRiche (voir btnEffacer là-bas pour le détail du
    // piège removeFormat/alignement) : efface gras/italique/souligné/
    // couleur/taille de la sélection dans la cellule active, sans toucher à
    // son alignement (déjà couvert par btnCelluleReinitialiser, distinct).
    const btnEffacerCaracteresCellule = U.el("button", {
      type: "button", class: "secondary", title: "Effacer la mise en forme",
      "aria-label": "Effacer la mise en forme",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        const zone = zoneCelluleActive();
        const alignementsAvant = zone ? Array.from(zone.children).map((p) => p.style.textAlign) : [];
        document.execCommand("removeFormat");
        if (zone) Array.from(zone.children).forEach((p, i) => { p.style.textAlign = alignementsAvant[i] || ""; });
        majEtatBoutonsCaracteres();
      },
    }, ["Effacer"]);

    /** Répercute largeursCol/hauteursLigne sur l'affichage (colgroup en %,
     *  hauteur des cellules en pt) — appelé en continu pendant un glissé,
     *  donc sans reconstruire le tableau (voir rendreTable) : juste ajuster
     *  des styles existants. */
    function appliquerDimensions() {
      const sommePoids = largeursCol.reduce((s, p) => s + p, 0) || 1;
      Array.from(colgroup.children).forEach((col, i) => {
        col.style.width = ((largeursCol[i] || 1) / sommePoids * 100) + "%";
      });
      lignesDonnees.forEach((tr, r) => {
        const h = hauteursLigne[r];
        Array.from(tr.children).forEach((td) => { td.style.height = h ? h + "pt" : ""; });
      });
    }

    /** Glisser la frontière entre les colonnes i et i+1 : transfère du
     *  poids de l'une à l'autre, total inchangé (comme Word : le tableau
     *  garde la largeur de la page, contrairement à Excel où la feuille
     *  s'élargit — glisser une colonne y rétrécit forcément sa voisine). */
    function demarrerRedimColonne(e, i) {
      e.preventDefault();
      const departX = e.clientX;
      const largeurTablePx = table.getBoundingClientRect().width;
      const poidsDepart = largeursCol.slice();
      const sommePoids = poidsDepart.reduce((s, p) => s + p, 0) || 1;
      const poidsMin = sommePoids * 0.06;
      function onMove(ev) {
        const deltaPoids = ((ev.clientX - departX) / largeurTablePx) * sommePoids;
        largeursCol[i] = Math.max(poidsMin, poidsDepart[i] + deltaPoids);
        largeursCol[i + 1] = Math.max(poidsMin, poidsDepart[i + 1] - deltaPoids);
        appliquerDimensions();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    /** Glisser le bas de la ligne r pour en fixer la hauteur minimale (px
     *  affichés → points stockés, 1px = 0.75pt à 96ppp — unité lue par
     *  Word/PDF, voir tableauRicheXML dans docx.js et Composeur.tableau
     *  dans pdf.js). */
    function demarrerRedimLigne(e, r) {
      e.preventDefault();
      const departY = e.clientY;
      const hauteurDepartPx = lignesDonnees[r].getBoundingClientRect().height;
      function onMove(ev) {
        const hauteurPx = Math.max(20, hauteurDepartPx + (ev.clientY - departY));
        hauteursLigne[r] = Math.round(hauteurPx * 0.75);
        appliquerDimensions();
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    /** Construit une cellule : un <td> (position:relative, juste pour les
     *  poignées) contenant la vraie zone éditable (.cellule-texte) et,
     *  posées par-dessus en CSS pur, les poignées de redimensionnement.
     *  Point important par rapport à la version précédente : les poignées
     *  sont désormais des ENFANTS DE LA CELLULE ELLE-MÊME (right:0/bottom:0
     *  en CSS), jamais positionnées en pixels calculés en JS — un bug
     *  remonté deux fois par Ludo (« la détection … est décalée ») venait
     *  justement de là : la mesure au moment du calcul (getBoundingClientRect)
     *  ne correspondait plus à la vraie position au moment du clic, parce
     *  que la fenêtre a sa propre animation d'ouverture encore en cours
     *  (même un ResizeObserver, essayé ensuite, restait un correctif
     *  indirect). Épinglées en CSS sur leur propre cellule, elles ne
     *  peuvent structurellement plus se désynchroniser de ce qu'elles
     *  redimensionnent. `contenteditable="false"` sur les poignées : ce
     *  sont des enfants d'une zone éditable, sans quoi le navigateur les
     *  traiterait comme du texte (risque de les voir coupées/déplacées en
     *  tapant, sélectionnant, etc.). */
    function construireCellule(r, c) {
      const zoneTexte = U.el("div", {
        class: "cellule-texte", contenteditable: "true",
        html: paragraphesVersHtml(paragraphesCellules[r][c].length ? paragraphesCellules[r][c] : [[]], null),
      });
      const a = alignementsCellules[r][c] || "left";
      if (a !== "left") zoneTexte.style.textAlign = a;
      // Synchronise le texte BRUT en continu (lignes[r][c], voir plus haut —
      // sert juste à la vérification « au moins une cellule non vide » et à
      // la rétrocompatibilité) ; la mise en forme riche, elle, n'est relue
      // qu'à la validation (voir valider() plus bas), pas à chaque frappe.
      zoneTexte.addEventListener("input", () => { lignes[r][c] = zoneTexte.textContent; });
      zoneTexte.addEventListener("focus", () => {
        celluleActive = { r, c }; majBoutonsAlignement(); majEtatBoutonsCaracteres();
      });
      zoneTexte.addEventListener("keyup", majEtatBoutonsCaracteres);
      zoneTexte.addEventListener("mouseup", majEtatBoutonsCaracteres);
      zoneTexte.addEventListener("keydown", (e) => {
        if (e.key === "Tab") { e.preventDefault(); allerCellule(zoneTexte, e.shiftKey ? -1 : 1); }
      });

      const td = U.el("td", { class: "cellule" }, [zoneTexte]);
      const v = alignementsVerticauxCellules[r][c] || "top";
      if (v !== "top") zoneTexte.style.justifyContent = JUSTIFY_VERTICAL[v];
      if (c < nbColonnes() - 1) {
        const pCol = U.el("div", {
          class: "poignee-colonne", contenteditable: "false", title: "Glisser pour redimensionner",
        });
        pCol.addEventListener("mousedown", (e) => demarrerRedimColonne(e, c));
        td.appendChild(pCol);
      }
      const pLigne = U.el("div", {
        class: "poignee-ligne", contenteditable: "false",
        title: "Glisser pour redimensionner, double-clic pour ajuster au contenu",
      });
      pLigne.addEventListener("mousedown", (e) => demarrerRedimLigne(e, r));
      // Double-clic sur la frontière d'une ligne = revenir à une hauteur
      // automatique (ajustée au contenu), comme dans Excel.
      pLigne.addEventListener("dblclick", () => { hauteursLigne[r] = null; appliquerDimensions(); });
      td.appendChild(pLigne);
      return td;
    }

    function rendreTable() {
      U.vider(table);
      U.vider(colgroup);
      lignesDonnees = [];

      for (let c = 0; c < nbColonnes(); c++) colgroup.appendChild(U.el("col"));
      table.appendChild(colgroup);

      lignes.forEach((ligne, r) => {
        const tr = U.el("tr");
        ligne.forEach((_texte, c) => tr.appendChild(construireCellule(r, c)));
        table.appendChild(tr);
        lignesDonnees.push(tr);
      });
      btnMoinsLigne.disabled = lignes.length <= 1;
      btnMoinsColonne.disabled = nbColonnes() <= 1;
      appliquerDimensions();
      majBoutonsAlignement();
    }

    // Icônes "plus"/"trash" réutilisées telles quelles (déjà embarquées dans
    // css/polices.css, mêmes icônes que partout ailleurs dans l'outil
    // pour ajouter/retirer — carnet fournisseurs, captures…) plutôt qu'une
    // icône "ligne"/"colonne" dédiée : aucune n'est embarquée, et en
    // ajouter une à la main comporte trop de risque de se tromper sans
    // pouvoir la prévisualiser avant coup (voir la mésaventure de l'icône
    // "file-search" de l'aperçu). Le texte "Ligne"/"Colonne" fait le reste
    // de la distinction — même chose pour les boutons d'alignement de
    // cellule ci-dessous (Gauche/Centre/Droite en texte, pas en icône).
    /** rendreTable() reconstruit chaque cellule depuis `paragraphesCellules`
     *  (voir construireCellule) — sans ce rappel juste avant, une mise en
     *  forme tout juste appliquée (gras, couleur…) sur la cellule en cours
     *  d'édition, mais pas encore relue (relecture seulement à la
     *  validation, voir plus bas), serait perdue au moindre ajout/retrait
     *  de ligne ou colonne. Appelée en tout premier dans les 4 handlers
     *  ci-dessous, avant toute mutation des tableaux parallèles. */
    function synchroniserParagraphesDepuisDOM() {
      lignesDonnees.forEach((tr, r) => {
        Array.from(tr.children).forEach((td, c) => {
          const zoneTexte = td.querySelector(".cellule-texte");
          if (zoneTexte && paragraphesCellules[r] && paragraphesCellules[r][c] !== undefined) {
            paragraphesCellules[r][c] = htmlVersParagraphes(zoneTexte).paragraphes;
          }
        });
      });
    }

    const btnPlusLigne = U.el("button", {
      class: "secondary", type: "button", title: "Ajouter une ligne", "aria-label": "Ajouter une ligne",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        synchroniserParagraphesDepuisDOM();
        lignes.push(Array(nbColonnes()).fill(""));
        hauteursLigne.push(null);
        alignementsCellules.push(Array(nbColonnes()).fill("left"));
        alignementsVerticauxCellules.push(Array(nbColonnes()).fill("top"));
        paragraphesCellules.push(Array(nbColonnes()).fill(0).map(() => [[]]));
        rendreTable();
      },
    }, [U.icone("plus"), "Ligne"]);
    const btnMoinsLigne = U.el("button", {
      class: "secondary", type: "button", title: "Retirer la dernière ligne", "aria-label": "Retirer la dernière ligne",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        synchroniserParagraphesDepuisDOM();
        if (lignes.length > 1) {
          lignes.pop(); hauteursLigne.pop(); alignementsCellules.pop(); alignementsVerticauxCellules.pop();
          paragraphesCellules.pop();
        }
        rendreTable();
      },
    }, [U.icone("trash"), "Ligne"]);
    const btnPlusColonne = U.el("button", {
      class: "secondary", type: "button", title: "Ajouter une colonne", "aria-label": "Ajouter une colonne",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        synchroniserParagraphesDepuisDOM();
        lignes.forEach((l) => l.push(""));
        largeursCol.push(1);
        alignementsCellules.forEach((l) => l.push("left"));
        alignementsVerticauxCellules.forEach((l) => l.push("top"));
        paragraphesCellules.forEach((l) => l.push([[]]));
        rendreTable();
      },
    }, [U.icone("plus"), "Colonne"]);
    const btnMoinsColonne = U.el("button", {
      class: "secondary", type: "button", title: "Retirer la dernière colonne", "aria-label": "Retirer la dernière colonne",
      onmousedown: (e) => e.preventDefault(),
      onclick: () => {
        synchroniserParagraphesDepuisDOM();
        if (nbColonnes() > 1) {
          lignes.forEach((l) => l.pop());
          largeursCol.pop();
          alignementsCellules.forEach((l) => l.pop());
          alignementsVerticauxCellules.forEach((l) => l.pop());
          paragraphesCellules.forEach((l) => l.pop());
        }
        rendreTable();
      },
    }, [U.icone("trash"), "Colonne"]);

    // Alignement horizontal de la cellule active (celle éditée ou cliquée
    // en dernier) — comme les boutons Gauche/Centre/Droite du ruban Excel.
    // S'applique à toute la cellule (pas à une sélection de texte dedans),
    // d'où onmousedown sans préventDefault : peu importe que la cellule
    // perde le focus, celluleActive a déjà été capturée par son propre
    // événement focus juste avant.
    function appliquerAlignementCellule(a) {
      if (!celluleActive) return;
      const { r, c } = celluleActive;
      alignementsCellules[r][c] = a;
      lignesDonnees[r].children[c].querySelector(".cellule-texte").style.textAlign = a === "left" ? "" : a;
      majBoutonsAlignement();
    }
    const btnCelluleGauche = U.el("button", {
      type: "button", title: "Aligner la cellule à gauche", "aria-label": "Aligner la cellule à gauche",
      onclick: () => appliquerAlignementCellule("left"),
    }, ["Gauche"]);
    const btnCelluleCentre = U.el("button", {
      type: "button", title: "Centrer la cellule", "aria-label": "Centrer la cellule",
      onclick: () => appliquerAlignementCellule("center"),
    }, ["Centre"]);
    const btnCelluleDroite = U.el("button", {
      type: "button", title: "Aligner la cellule à droite", "aria-label": "Aligner la cellule à droite",
      onclick: () => appliquerAlignementCellule("right"),
    }, ["Droite"]);

    // Alignement vertical de la cellule active — second groupe du ruban
    // Alignement d'Excel (Haut/Milieu/Bas), à côté de Gauche/Centre/Droite
    // ci-dessus. Posé en flexbox sur .cellule-texte (justify-content), PAS en
    // vertical-align sur le <td> : cette zone remplit toute la hauteur du
    // <td> (voir app.css), donc vertical-align n'y aurait plus aucun effet —
    // et surtout, la retirer était le prix à payer pour corriger un bug plus
    // grave signalé le 10 septembre 2026 (« je ne peux pas taper dans une
    // grosse cellule ») : avec vertical-align, la zone éditable ne
    // remplissait que la hauteur du texte, cliquer dans l'espace vide
    // au-dessus/en dessous d'une ligne agrandie ne posait le curseur nulle
    // part.
    function appliquerAlignementVerticalCellule(v) {
      if (!celluleActive) return;
      const { r, c } = celluleActive;
      alignementsVerticauxCellules[r][c] = v;
      lignesDonnees[r].children[c].querySelector(".cellule-texte").style.justifyContent = JUSTIFY_VERTICAL[v];
      majBoutonsAlignement();
    }
    const btnCelluleHaut = U.el("button", {
      type: "button", title: "Aligner la cellule en haut", "aria-label": "Aligner la cellule en haut",
      onclick: () => appliquerAlignementVerticalCellule("top"),
    }, ["Haut"]);
    const btnCelluleMilieu = U.el("button", {
      type: "button", title: "Centrer la cellule verticalement", "aria-label": "Centrer la cellule verticalement",
      onclick: () => appliquerAlignementVerticalCellule("middle"),
    }, ["Milieu"]);
    const btnCelluleBas = U.el("button", {
      type: "button", title: "Aligner la cellule en bas", "aria-label": "Aligner la cellule en bas",
      onclick: () => appliquerAlignementVerticalCellule("bottom"),
    }, ["Bas"]);

    // Réinitialiser l'ALIGNEMENT de la cellule active à ses valeurs par
    // défaut (Gauche/Haut) — distinct du bouton « Effacer » ci-dessous
    // (mise en forme de CARACTÈRE), pour ne pas avoir deux boutons "Effacer"
    // dans la même barre : depuis l'ajout de la mise en forme riche par
    // cellule (10 septembre 2026), une cellule porte maintenant DEUX choses
    // séparées à réinitialiser (l'alignement de la cellule elle-même, et la
    // mise en forme de son texte), comme dans un vrai traitement de texte
    // (groupes Paragraphe vs Police du ruban, jamais mélangés).
    function reinitialiserAlignementCellule() {
      if (!celluleActive) return;
      const { r, c } = celluleActive;
      alignementsCellules[r][c] = "left";
      alignementsVerticauxCellules[r][c] = "top";
      const zoneTexte = lignesDonnees[r].children[c].querySelector(".cellule-texte");
      zoneTexte.style.textAlign = "";
      zoneTexte.style.justifyContent = "";
      majBoutonsAlignement();
    }
    const btnCelluleReinitialiser = U.el("button", {
      type: "button", class: "secondary", title: "Réinitialiser l'alignement de la cellule",
      "aria-label": "Réinitialiser l'alignement de la cellule",
      onclick: reinitialiserAlignementCellule,
    }, ["Réinitialiser"]);

    rendreTable();

    // styleWithCSS pousse "couleur"/"taille" en <span style="..."> plutôt
    // qu'en balises <font> historiques — même raison et même mécanisme que
    // App.saisirTexteRiche (idempotent si déjà activé par ailleurs sur ce
    // document, sans effet de bord à le répéter ici).
    document.execCommand("styleWithCSS", false, true);

    const nettoyer = () => document.removeEventListener("selectionchange", surSelectionCar);
    const valider = async () => {
      synchroniserParagraphesDepuisDOM();
      const nonVide = lignes.some((l) => l.some((v) => (v || "").trim() !== ""));
      if (!nonVide) return;
      nettoyer();
      fermerModale();
      await surValider(
        lignes.map((l) => l.map((v) => (v || "").trim())),
        largeursCol.slice(),
        hauteursLigne.slice(),
        alignementsCellules.map((l) => l.slice()),
        alignementsVerticauxCellules.map((l) => l.slice()),
        paragraphesCellules.map((l) => l.map((p) => p.map((runs) => runs.map((seg) => Object.assign({}, seg)))))
      );
    };

    ouvrirModale(
      "files",
      titre,
      U.el("div", {}, [
        U.el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px" }, [
          btnPlusLigne, btnMoinsLigne, btnPlusColonne, btnMoinsColonne,
        ]),
        U.el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px" }, [
          btnGrasCellule, btnItaliqueCellule, btnSouligneCellule, selTailleCellule, zoneCouleursCellule,
          U.el("span", { style: "width:1px;align-self:stretch;background:var(--line);margin:0 2px" }),
          btnEffacerCaracteresCellule,
        ]),
        U.el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px" }, [
          btnCelluleGauche, btnCelluleCentre, btnCelluleDroite,
          U.el("span", { style: "width:1px;align-self:stretch;background:var(--line);margin:0 2px" }),
          btnCelluleHaut, btnCelluleMilieu, btnCelluleBas,
          U.el("span", { style: "width:1px;align-self:stretch;background:var(--line);margin:0 2px" }),
          btnCelluleReinitialiser,
        ]),
        table,
        U.el("div", {
          class: "indice",
          text: "Glissez une frontière de colonne ou de ligne pour la redimensionner, comme dans Excel " +
                "(double-cliquez la frontière basse d'une ligne pour l'ajuster automatiquement à son contenu). " +
                "Gras/Italique/Souligné/taille/couleur mettent en forme le texte sélectionné dans la cellule, " +
                "Effacer retire cette mise en forme. Gauche/Centre/Droite et Haut/Milieu/Bas alignent le contenu " +
                "de la cellule où vous avez cliqué en dernier, Réinitialiser remet son alignement par défaut.",
        }),
      ]),
      [
        U.el("button", { class: "secondary", type: "button", text: "Annuler", onclick: () => { nettoyer(); fermerModale(); } }),
        U.el("button", { class: "copper", type: "button", onclick: valider },
          [U.icone(iconeBouton || "plus"), libelleBouton || "Ajouter"]),
      ],
      { large: true }
    );
  };

  /* ---------------------------------------------------- Fenêtres de vue */

  /** Nouvelle commande et Configuration s'ouvrent dans la fenêtre modale au
   *  lieu de naviguer vers une page à part — même principe que le Catalogue
   *  Électrique (fiche produit, Paramètres). C'est la même fenêtre que
   *  ouvrirModale, même gabarit (icône + titre + croix dans un bandeau,
   *  identique au Catalogue : pas de croix flottante au-dessus du contenu),
   *  juste en variante large. VueCommande/VueConfig.rendre() renvoient
   *  { icone, titre } pour ce bandeau plutôt que de dessiner le leur. */
  let fenetre = null; // { nom: "commande" | "config", params } ou null

  App.ouvrirFenetre = function (nom, params) {
    fenetre = { nom, params: params || null };
    const fond = U.$("#modale-fond");
    jetonFond.set(fond, (jetonFond.get(fond) || 0) + 1); // voir fermerFenetreAnimee
    fond.classList.add("modale-fond--large");
    App.rafraichirFenetre();
    fond.classList.remove("closing");
    fond.classList.add("open");
    document.body.classList.add("modale-ouverte");
  };

  /** Redessine la fenêtre ouverte — à appeler après une action qui change
   *  ce qu'elle doit montrer (ex. cocher une entité, ajouter un
   *  fournisseur, signer une commande), à la place de App.rendre() qui ne
   *  concerne que la page de fond. `params` remplace ceux d'origine s'il
   *  est fourni.
   *  Le contenu est entièrement reconstruit à chaque appel (.win-corps--vue
   *  est un nouvel élément), donc son défilement repart de zéro par défaut
   *  — perceptible dans Configuration, où beaucoup de champs redessinent la
   *  fenêtre au moindre changement : la page remontait en haut à chaque
   *  case cochée, modèle chargé ou adresse modifiée. On relève donc la
   *  position de défilement de l'ancienne zone avant de la remplacer, et on
   *  la réapplique à la nouvelle — même principe que App.rendre() pour la
   *  liste, appliqué ici au conteneur défilant de la fenêtre plutôt qu'à la
   *  page entière. */
  App.rafraichirFenetre = function (params) {
    if (!fenetre) return;
    if (params !== undefined) fenetre.params = params;
    const ancienneZone = U.$(".win-corps--vue");
    const defilement = ancienneZone ? ancienneZone.scrollTop : 0;
    const contenu = U.vider(U.$("#modale-contenu"));
    const zone = U.el("div", { class: "win-corps win-corps--vue" });
    let info;
    if (fenetre.nom === "commande") info = VueCommande.rendre(zone, fenetre.params);
    else if (fenetre.nom === "config") info = VueConfig.rendre(zone);
    else if (fenetre.nom === "fournisseurs") info = VueFournisseurs.rendre(zone);
    else if (fenetre.nom === "signature") info = VueSignature.rendre(zone);
    info = info || {};
    contenu.appendChild(U.el("div", { class: "win-entete" }, [
      U.icone(info.icone || "file-invoice", "ti-titre"),
      U.el("h3", { text: info.titre || "" }),
      U.el("button", {
        class: "win-fermer", type: "button", text: "✕",
        title: "Fermer", "aria-label": "Fermer", onclick: App.fermerFenetre,
      }),
    ]));
    contenu.appendChild(zone);
    zone.scrollTop = defilement;
  };

  /** Ferme réellement la fenêtre — factorisé hors de App.fermerFenetre pour
   *  pouvoir être différé derrière une confirmation (voir juste en dessous)
   *  sans dupliquer cette logique. */
  function fermerFenetreReelle() {
    if (fenetre.nom === "commande") VueCommande.detacher(true);
    else if (fenetre.nom === "config") VueConfig.reinitialiser();
    fenetre = null;
    document.body.classList.remove("modale-ouverte");
    // .modale-fond--large ne se retire qu'au vrai masquage (hideNowFn),
    // jamais avant : sinon la fenêtre saute à sa largeur normale d'un coup,
    // AVANT même que l'animation de fermeture ait commencé à jouer.
    fermerFenetreAnimee(U.$("#modale-fond"), () => {
      U.$("#modale-fond").classList.remove("modale-fond--large");
    });
    App.rendre(); // la liste peut avoir changé pendant que la fenêtre était ouverte
  }

  /** Ajouter/modifier un bloc (texte, image…) dans Nouvelle commande ne fait
   *  qu'écrire dans l'état en mémoire de la fenêtre (voir marquer/modifiee,
   *  vue-commande.js) — il faut encore « Enregistrer le brouillon » (ou
   *  signer) pour que ce soit vraiment conservé, exactement comme les autres
   *  champs du formulaire. Fermer la fenêtre sans cette étape perdait donc
   *  silencieusement les modifications (retour utilisateur : « lorsque je
   *  fais enregistrer ça n'est pas gardé ») ; VueCommande.aDesModifications
   *  existait déjà pour détecter ce cas mais n'était jamais interrogée. */
  App.fermerFenetre = function () {
    if (!fenetre) return;
    if (fenetre.nom === "commande" && VueCommande.aDesModifications()) {
      App.confirmer(
        "Fermer sans enregistrer ?",
        "Cette commande a des modifications qui n'ont pas été enregistrées " +
        "(texte, image, champ…) — elles seront perdues. Fermer quand même ?",
        fermerFenetreReelle,
        true
      );
      return;
    }
    fermerFenetreReelle();
  };

  /* -------------------------------------------------------- Sauvegarde */
  /* Exporter/Importer une base sont des actions globales, dans le menu ⋮ —
     elles doivent rester utilisables sans que Configuration soit ouverte. */

  App.exporterBase = function () {
    const blob = new Blob([JSON.stringify(Config.base, null, 2)], { type: "application/json" });
    const d = U.aujourdhuiISO();
    U.telecharger(blob, `commandes-immo-sauvegarde-${d}.json`);
    App.toast("ok", "Sauvegarde exportée.");
  };

  App.importerBase = function () {
    const entree = U.el("input", {
      type: "file", accept: "application/json,.json", style: "display:none",
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        let lu;
        try {
          lu = JSON.parse(await f.text());
        } catch (err) {
          App.toast("err", "Fichier illisible : ce n'est pas une sauvegarde JSON valide.");
          return;
        }
        if (!lu || !lu.config || !Array.isArray(lu.commandes)) {
          App.toast("err", "Ce fichier ne ressemble pas à une sauvegarde de l'outil.");
          return;
        }
        App.confirmer(
          "Remplacer la base actuelle ?",
          `La sauvegarde contient ${lu.commandes.length} commande(s). ` +
          `La base actuelle (${Config.commandes().length} commande(s)) sera écrasée. ` +
          "Cette opération est irréversible.",
          async () => {
            try {
              await Config.remplacerTout(lu);
            } catch (e) {
              App.toast("err", "Restauration incomplète : " + e.message);
            }
            App.toast("ok", "Sauvegarde restaurée.");
            // Rafraîchit ce qui est réellement affiché : la fenêtre si l'une
            // des deux est ouverte, sinon la liste en dessous.
            if (fenetre) App.rafraichirFenetre(); else App.rendre();
          },
          true
        );
      },
    });
    document.body.appendChild(entree);
    entree.click();
    setTimeout(() => entree.remove(), 60000);
  };

  /* ------------------------------------------- Production des fichiers */

  let dernierUrlApercu = null;
  function libererApercu() {
    if (dernierUrlApercu) { URL.revokeObjectURL(dernierUrlApercu); dernierUrlApercu = null; }
  }

  /** Écrit/télécharge réellement les fichiers, une fois l'aperçu validé (voir
   *  ouvrirApercu juste en dessous). `pdfDejaGenere` : le PDF déjà produit
   *  pour l'aperçu, réutilisé tel quel — inutile de le regénérer une seconde
   *  fois, et ça garantit que le fichier livré est exactement celui montré. */
  async function ecrireFichiers(commande, formats, pdfDejaGenere) {
    const produits = [];

    if (formats.includes("docx")) {
      try {
        const blob = GenerateurDocx.generer(commande);
        U.telecharger(blob, GenerateurDocx.nomFichier(commande, "docx"));
        produits.push(".docx");
      } catch (e) {
        console.error(e);
        App.toast("err", "Document Word : " + (e.message || e));
      }
    }

    if (formats.includes("pdf")) {
      try {
        const blob = pdfDejaGenere || await GenerateurPdf.generer(commande);
        U.telecharger(blob, GenerateurDocx.nomFichier(commande, "pdf"));
        produits.push(".pdf");
      } catch (e) {
        console.error(e);
        App.toast("err", "PDF : " + (e.message || e));
      }
    }

    if (produits.length) {
      const quoi = produits.join(" et ");
      App.toast("ok", `${quoi} ${produits.length > 1 ? "générés" : "généré"} — voir vos téléchargements.`);
    }
  }

  const LIBELLES_PRODUCTION = {
    "docx,pdf": { texte: "Télécharger les deux", classe: "copper", icone: "files" },
    docx:       { texte: "Télécharger le Word",  classe: "word",   icone: "file-text" },
    pdf:        { texte: "Télécharger le PDF",   classe: "pdf",    icone: "file-type-pdf" },
  };

  /** Aperçu de contrôle affiché avant d'écrire/télécharger les fichiers —
   *  demande explicite de Ludo (« un viewer de pdf qui permet de contrôler
   *  avant de générer le pdf ou le word »). Le PDF sert d'aperçu même quand
   *  seul le Word est demandé : les deux viennent des mêmes données (voir
   *  README §9) — seule la mise en page peut différer légèrement, ce que le
   *  titre du dialogue précise. Même dialogue que App.confirmer/App.choisir,
   *  juste en grand format (voir opts.large de ouvrirModale) pour laisser de
   *  la place au PDF, et sur le fond qui convient (fondDialogue) : imbriqué
   *  par-dessus la fenêtre Nouvelle commande si elle est ouverte, ou fond
   *  normal sinon (boutons de la liste). */
  function ouvrirApercu(commande, blobPdf, formats) {
    libererApercu();
    const url = URL.createObjectURL(blobPdf);
    dernierUrlApercu = url;
    const cadre = U.el("iframe", { src: url, class: "apercu-pdf", title: "Aperçu du document" });
    const bouton = LIBELLES_PRODUCTION[formats.slice().sort().join(",")] || LIBELLES_PRODUCTION["docx,pdf"];

    ouvrirModale(
      // "file-search" n'existe pas dans css/polices.css (jeu d'icônes
      // fixe, encodées à la main — voir son en-tête — depuis la suppression
      // de tools/) : "eye" est déjà utilisée pour l'état figé/consultation,
      // cohérente avec la notion d'aperçu, et surtout déjà embarquée.
      "eye",
      "Aperçu avant génération",
      U.el("div", {}, [
        cadre,
        formats.includes("docx") ? U.el("p", {
          class: "indice", style: "margin-bottom:0",
          text: "Cet aperçu est le rendu PDF : la mise en page du .docx généré peut différer légèrement.",
        }) : null,
      ]),
      [
        U.el("button", {
          class: "secondary", type: "button", text: "Annuler",
          onclick: () => { fermerModale(); libererApercu(); },
        }),
        U.el("button", {
          class: bouton.classe, type: "button",
          onclick: async () => {
            fermerModale();
            await ecrireFichiers(commande, formats, formats.includes("pdf") ? blobPdf : null);
            libererApercu();
          },
        }, [U.icone(bouton.icone), bouton.texte]),
      ],
      { large: true }
    );
  }

  /** Point d'entrée : prépare l'aperçu pour les fichiers demandés.
   *  `formats` : ["docx"], ["pdf"] ou les deux. La signature les demande tous
   *  les deux ; les boutons de l'interface en demandent un seul à la fois.
   *  L'écriture réelle n'a lieu qu'une fois l'aperçu validé, voir plus haut. */
  App.produireFichiers = async function (commande, formats) {
    if (!commande) return;
    const voulus = formats && formats.length ? formats : ["docx", "pdf"];

    // Le modèle est relu à chaque fois : si un autre poste l'a remplacé sur
    // le serveur entre-temps, la modification est prise en compte aussitôt,
    // y compris dans l'aperçu.
    try {
      await Modeles.charger();
      ModeleInfos.viderCache();
    } catch (e) { console.warn("rechargement des modèles impossible", e); }
    if (!Modeles.disponible(commande.entite)) {
      App.toast("err",
        "Aucun modèle Word pour l'entité " + commande.entite + ". " +
        "Chargez-le dans Configuration › Modèles Word.");
      return;
    }

    let pdfApercu;
    try {
      pdfApercu = await GenerateurPdf.generer(commande);
    } catch (e) {
      console.error(e);
      App.toast("err", "Aperçu impossible : " + (e.message || e));
      return;
    }
    ouvrirApercu(commande, pdfApercu, voulus);
  };

  /** Écran bloquant affiché à la place de la liste des commandes quand
   *  aucun compte du Catalogue Électrique n'est connecté (voir demarrer()
   *  plus bas) — pas de formulaire de connexion propre à cet outil : la
   *  session vit dans le même localStorage que le Catalogue (même origine),
   *  se connecter là-bas suffit à revenir ici ensuite (recharger la page).
   *  Désactive aussi les entrées du header qui supposent une base chargée
   *  (Nouvelle commande, menu ⋮) plutôt que de les laisser planter au clic. */
  function afficherEcranNonConnecte(detail) {
    const btnNouvelle = U.$("#bouton-nouvelle-commande");
    if (btnNouvelle) btnNouvelle.disabled = true;
    const btnMenu = U.$("#hdrMenuBtn");
    if (btnMenu) btnMenu.disabled = true;

    const zone = U.vider(U.$("#vue"));
    zone.appendChild(U.el("div", { class: "panneau", style: "max-width:480px;margin:60px auto;text-align:center;" }, [
      U.icone("lock", null),
      U.el("h2", { style: "text-transform:none;letter-spacing:0;font-size:17px;justify-content:center;",
        text: "Connexion au Catalogue requise" }),
      U.el("p", { class: "aide", style: "margin:0 0 18px",
        text: detail || "Commandes IMMO partage ses données (commandes, configuration, modèles) " +
          "avec le Catalogue Électrique : connectez-vous d'abord là-bas, puis rouvrez Commandes IMMO " +
          "depuis son menu ⋮." }),
      U.el("button", {
        class: "copper", type: "button", style: "margin:0 auto",
        onclick: () => { window.location.href = "index.html"; },
      }, [U.icone("external-link"), "Ouvrir le Catalogue Électrique"]),
    ]));
  }

  /* -------------------------------------------------------- Démarrage */

  async function demarrer() {
    // Écran de démarrage — même mécanique que le Catalogue Électrique
    // (js/init.js) : affiché une seule fois par session de navigation
    // (sessionStorage partagé, voir le script en tête de commande.html),
    // fermé par la fin de la vidéo (écouteur déjà posé dans ce script), avec
    // ici un filet de sécurité si la vidéo ne démarre/finit jamais.
    const splash = U.$("#app-splash");
    if (splash) {
      if (!sessionStorage.getItem("app_started")) {
        sessionStorage.setItem("app_started", "1");
        setTimeout(() => {
          const s = U.$("#app-splash");
          if (s) {
            s.classList.add("hide");
            document.body.classList.remove("splash-active");
            setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 400);
          }
        }, 5000);
      } else {
        splash.remove();
      }
    }

    // Bloc de marque cliquable — même principe que le Catalogue Électrique
    // (logo "Retour à l'accueil") : ramène à la liste des commandes.
    U.$("#marque").addEventListener("click", () => App.aller("liste", null));
    // Menu « ⋮ » — mêmes id (#hdrMenuBtn/#hdrMenu) et même mécanique que le
    // Catalogue Électrique : clic sur le bouton bascule le tiroir, clic
    // n'importe où ailleurs le referme, clic sur un item le referme et
    // déclenche l'action.
    U.$("#hdrMenuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      U.$("#hdrMenu").classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!U.$("#hdrMenu").contains(e.target) && e.target !== U.$("#hdrMenuBtn")) {
        U.$("#hdrMenu").classList.remove("open");
      }
    });
    // Configuration (sites, entités, modèles Word...) n'est ouverte qu'aux
    // administrateurs — l'entrée de menu est retirée du DOM pour les autres
    // comptes un peu plus bas (voir la fin de demarrer()), mais le clic
    // reste gardé ici aussi, par sécurité.
    U.$("#item-config").addEventListener("click", () => {
      U.$("#hdrMenu").classList.remove("open");
      if (!Serveur.estAdmin()) return;
      App.ouvrirFenetre("config");
    });
    // Signature (nom + tampon) : ouverte à tous, propre à cet appareil (voir
    // signature.js) — pas dans Configuration, qui est réservée aux admins.
    U.$("#item-signature").addEventListener("click", () => {
      U.$("#hdrMenu").classList.remove("open");
      App.ouvrirFenetre("signature");
    });
    U.$("#item-exporter").addEventListener("click", () => {
      U.$("#hdrMenu").classList.remove("open");
      App.exporterBase();
    });
    U.$("#item-importer").addEventListener("click", () => {
      U.$("#hdrMenu").classList.remove("open");
      App.importerBase();
    });
    // Bouton « Nouvelle commande » — ouvre la fenêtre plutôt que de naviguer.
    U.$("#bouton-nouvelle-commande").addEventListener("click", () => App.ouvrirFenetre("commande"));
    // Même principe que le Catalogue Électrique : un clic sur un fond ne
    // ferme rien (seuls la croix, Échap ou un bouton du pied le font) — on
    // bloque juste sa propagation. Les deux fonds (fenêtre + dialogue
    // imbriqué, voir ouvrirModale) s'ouvrent chacun sur leur propre id.
    U.$("#modale-fond").addEventListener("click", (e) => {
      if (e.target.id === "modale-fond") e.stopPropagation();
    });
    U.$("#modale-fond-2").addEventListener("click", (e) => {
      if (e.target.id === "modale-fond-2") e.stopPropagation();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Ferme le niveau le plus haut d'abord : le dialogue imbriqué s'il y
      // en a un, sinon la fenêtre, sinon un dialogue de premier niveau.
      if (U.$("#modale-fond-2").classList.contains("open")) fermerModale();
      else if (U.$("#modale-fond").classList.contains("open")) {
        if (fenetre) App.fermerFenetre(); else fermerModale();
      }
    });

    // Commandes et configuration vivent sur le serveur du Catalogue
    // Électrique (voir serveur.js/config.js) : sans compte connecté
    // (même origine, même localStorage que le Catalogue), rien ne peut être
    // ni lu ni enregistré — on arrête ici plutôt que de laisser Config.charger()
    // échouer au milieu du démarrage.
    if (!Serveur.connecte()) {
      afficherEcranNonConnecte();
      return;
    }

    try {
      await Config.charger();
    } catch (e) {
      afficherEcranNonConnecte(e.message);
      return;
    }
    await Modeles.charger();

    // Configuration réservée aux administrateurs (retour utilisateur) —
    // l'entrée de menu disparaît entièrement pour les autres comptes plutôt
    // que d'être visible mais inopérante.
    if (!Serveur.estAdmin()) {
      const itemConfig = U.$("#item-config");
      if (itemConfig) itemConfig.remove();
    }

    // La liste est la seule page ; plus d'ouverture automatique de
    // Configuration au démarrage, ni de bandeau d'avertissement permanent
    // (retour utilisateur) — un modèle manquant ou une répartition non
    // vérifiée reste simplement visible dans Configuration elle-même.
    App.aller("liste");
  }

  window.App = App;
  document.addEventListener("DOMContentLoaded", demarrer);
})();
