// ── Comparaison de produits ────────────────────────────────────────────
// Retour utilisateur : "j'aimerai mettre en place un système de
// comparaison afin de faire de la comparaison entre plusieurs produits qui
// auront été sélectionnés par le user" — ajout uniquement depuis la fiche
// produit (#vmCompareBtn, voir js/render-view-modal.js), aucune limite de
// nombre, ouvert à tous (aucune permission requise : comparer ne modifie
// aucune donnée du catalogue, contrairement à "Ajouter à la
// configuration"). État en mémoire + localStorage (survit à un
// rechargement, comme le brouillon anonyme du configurateur d'armoire —
// mais jamais synchronisé au serveur ici : simple outil de consultation
// personnel, pas une configuration à retrouver sur un autre appareil).
"use strict";

var _productCompareRefs = [];
var PRODUCT_COMPARE_STORAGE_KEY = 'cat_product_compare';
// Retour utilisateur : "faut revoir la version mobile" — avec de vraies
// fiches (beaucoup de caractéristiques techniques, libellés parfois très
// longs comme "Résistance à l'environnement — Température ambiante"), le
// tableau en grille (pensé pour desktop) devenait illisible sur mobile :
// colonne d'étiquettes de 140px, texte qui retombe sur 4-5 lignes, lignes
// à hauteur très inégale. Sur mobile, on bascule sur un mode "un produit à
// la fois" (feuilleteur ◀ Produit 2/3 ▶) réutilisant .specs-table (déjà
// utilisé pour Caractéristiques ailleurs dans l'appli) — 2 colonnes
// Propriété/Valeur, aucun défilement horizontal ni sticky nécessaire.
var _productCompareMobileIndex = 0;

function _compareIsMobileLayout(){
  return window.matchMedia('(max-width:640px) and (pointer: coarse), (max-height:500px) and (orientation:landscape) and (pointer: coarse)').matches;
}

// Retour utilisateur : "bétonne tout ça, fonctionne responsive mobile" —
// mémorise le mode (mobile/desktop) affiché lors du DERNIER rendu, pour
// que l'écouteur 'resize' plus bas (rotation de téléphone pendant que le
// comparateur reste ouvert) sache s'il a réellement changé, sans avoir à
// deviner ni à re-rendre inutilement à chaque redimensionnement.
var _compareLastIsMobile = null;

(function _compareRestoreFromStorage(){
  try{
    var raw = localStorage.getItem(PRODUCT_COMPARE_STORAGE_KEY);
    if(!raw) return;
    var refs = JSON.parse(raw);
    if(Array.isArray(refs)){
      _productCompareRefs = refs.filter(function(r){ return typeof r === 'string' && r; });
    }
  }catch(e){
    // Contenu corrompu/illisible : repart simplement d'une comparaison
    // vide plutôt que de faire planter le chargement de la page.
  }
})();

function _compareSaveToStorage(){
  try{ localStorage.setItem(PRODUCT_COMPARE_STORAGE_KEY, JSON.stringify(_productCompareRefs)); }catch(e){}
}

function _compareProductByRef(ref){
  return (window.products || []).find(function(p){ return p.ref === ref; });
}

function _compareIsIn(ref){
  return _productCompareRefs.indexOf(ref) !== -1;
}

// Ajoute/retire ref, sauvegarde, met à jour la pastille + (si la fenêtre est
// déjà ouverte) le tableau. Renvoie true si désormais DANS la comparaison,
// false sinon — pratique pour le bouton appelant (toast + icône, voir
// js/render-view-modal.js).
function _compareToggle(ref){
  if(!ref) return false;
  var idx = _productCompareRefs.indexOf(ref);
  var nowIn;
  if(idx === -1){ _productCompareRefs.push(ref); nowIn = true; }
  else { _productCompareRefs.splice(idx, 1); nowIn = false; }
  _compareSaveToStorage();
  _compareRenderBadge();
  var overlay = document.getElementById('productCompareOverlay');
  if(overlay && getComputedStyle(overlay).display !== 'none') _compareRenderTable();
  return nowIn;
}

function _compareRemove(ref){
  var idx = _productCompareRefs.indexOf(ref);
  if(idx === -1) return;
  _productCompareRefs.splice(idx, 1);
  _compareSaveToStorage();
  _compareRenderBadge();
  _compareRenderTable();
}

function _compareClearAll(){
  _productCompareRefs = [];
  _compareSaveToStorage();
  _compareRenderBadge();
  _compareRenderTable();
}

function _compareRenderBadge(){
  var btn = document.getElementById('btnFabCompareProducts');
  var badge = document.getElementById('productCompareFabBadge');
  var count = _productCompareRefs.length;
  if(btn) btn.style.display = count ? 'flex' : 'none';
  if(badge){
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count ? 'flex' : 'none';
  }
}

function _comparePhotoCellHtml(p){
  return p.photo
    ? '<img class="compare-products-photo" src="' + escapeHtml(p.photo) + '" alt="' + escapeHtml(p.name || p.ref || '') + '" loading="lazy">'
    : '<div class="compare-products-photo-placeholder"><i class="ti ti-photo-off" aria-hidden="true"></i></div>';
}

// Partagé entre le mode grille (desktop) et le feuilleteur (mobile) — voir
// _compareRenderTable plus bas.
function _compareBuildRowDefs(products){
  // Union des caractéristiques techniques de tous les produits affichés,
  // dans l'ordre de première apparition — un produit qui n'a pas telle
  // propriété affiche simplement "—" sur sa colonne (retour utilisateur :
  // le tableau doit montrer infos de base ET caractéristiques techniques).
  var specKeys = [];
  products.forEach(function(p){
    if(p.specs && typeof p.specs === 'object'){
      Object.keys(p.specs).forEach(function(k){
        if(p.specs[k] && specKeys.indexOf(k) === -1) specKeys.push(k);
      });
    }
  });
  var rowDefs = [
    { label: 'Photo', cellFn: _comparePhotoCellHtml },
    { label: 'Référence', cellFn: function(p){ return escapeHtml(p.ref || '—'); } },
    { label: 'Marque', cellFn: function(p){ return escapeHtml(p.brand || '—'); } },
    { label: 'Famille', cellFn: function(p){ return escapeHtml(p.family || '—'); } },
    { label: 'Prix', cellFn: function(p){
        var display = typeof _displayPrice === 'function' ? _displayPrice(p.price) : p.price;
        return display ? escapeHtml(String(display)) : '—';
      } }
  ];
  specKeys.forEach(function(key){
    rowDefs.push({ label: key, cellFn: function(p){
      var v = p.specs && p.specs[key];
      return v ? escapeHtml(String(v)) : '<span style="color:var(--ink-soft);">—</span>';
    } });
  });
  return rowDefs;
}

function _compareRenderTable(){
  var body = document.getElementById('productCompareBody');
  if(!body) return;
  var products = _productCompareRefs.map(_compareProductByRef).filter(Boolean);
  // Une ref pouvait pointer vers un produit supprimé du catalogue entre-temps
  // — nettoie silencieusement la liste plutôt que d'afficher une colonne
  // vide ou de planter.
  if(products.length !== _productCompareRefs.length){
    _productCompareRefs = products.map(function(p){ return p.ref; });
    _compareSaveToStorage();
    _compareRenderBadge();
  }

  var mobilePagerBar = document.getElementById('productCompareMobilePager');
  var gridHeaderBar = document.getElementById('productCompareGridHeader');

  if(!products.length){
    if(mobilePagerBar) mobilePagerBar.style.display = 'none';
    if(gridHeaderBar) gridHeaderBar.style.display = 'none';
    body.innerHTML = '<div class="compare-products-empty">'
      + '<i class="ti ti-scale" aria-hidden="true"></i>'
      + '<div>Aucun produit en comparaison.</div>'
      + '<div>Ouvrez une fiche produit et cliquez sur « Comparer » pour l’ajouter ici.</div>'
      + '</div>';
    return;
  }

  if(_compareIsMobileLayout()){
    if(gridHeaderBar) gridHeaderBar.style.display = 'none';
    _compareRenderMobilePager(mobilePagerBar, body, products);
    return;
  }
  // Mode grille (desktop/tablette) : la barre de feuilleteur ne sert
  // qu'au mode mobile (voir _compareRenderMobilePager) — masquée ici.
  if(mobilePagerBar) mobilePagerBar.style.display = 'none';

  var rowDefs = _compareBuildRowDefs(products);

  function cellHtml(classes, innerHtml){
    return '<div class="compare-cell ' + classes.join(' ') + '">' + innerHtml + '</div>';
  }

  // Largeur des colonnes posée en ligne : le nombre de produits n'est connu
  // qu'ici, à l'affichage. Réutilisée pour la grille des données ET pour
  // #productCompareGridHeader ci-dessous (même valeur des deux côtés ⇒
  // mêmes largeurs de colonnes calculées, les deux conteneurs ayant la
  // même largeur disponible — voir plus bas pour la synchronisation du
  // défilement horizontal entre les deux).
  var gridTemplateColumns = '140px repeat(' + products.length + ', minmax(160px, 1fr))';

  // Retour utilisateur : "corrige aussi sur desktop" (avec de vraies
  // fiches longues, capture à l'appui) — l'en-tête (noms de produits)
  // faisait partie de la MÊME grille défilante que les données, avec
  // position:sticky;top:0. Mais position:sticky réserve l'espace d'un
  // élément à sa position NON collée dans le flux, pas à sa position
  // collée affichée : passé un certain défilement (dès que la hauteur
  // défilée dépasse la hauteur de l'en-tête lui-même), les lignes
  // suivantes — qui continuent, elles, de défiler normalement par rapport
  // à cette position non collée — pouvaient s'afficher PAR-DESSUS l'en-tête
  // au lieu de rester cachées derrière (repéré sur presque tout le
  // défilement avec de vraies fiches, pas seulement tout en bas). Un
  // sticky ne suffit donc pas dès qu'il précède beaucoup de contenu dans
  // le même flux défilant — même leçon que pour le feuilleteur mobile
  // (voir plus haut) : l'en-tête est maintenant un élément à part
  // (#productCompareGridHeader, voir js/templates.js), jamais concerné
  // par le défilement vertical de #productCompareBody. Comme il doit
  // rester aligné avec les colonnes en dessous au défilement HORIZONTAL,
  // son contenu est décalé par transform en même temps que
  // .compare-labels-col plus bas (même mécanisme, écouteur 'scroll'
  // partagé tout en bas de ce fichier).
  if(gridHeaderBar){
    gridHeaderBar.style.display = '';
    var headerHtml = cellHtml(['compare-row-label', 'compare-cell-header'], '');
    headerHtml += products.map(function(p, i){
      var classes = ['compare-cell-header'];
      if(i === products.length - 1) classes.push('compare-cell-last-col');
      return cellHtml(classes, '<div class="compare-col-header"><span class="compare-col-header-name">' + escapeHtml(p.name || p.ref || '') + '</span>'
        + '<button type="button" class="compare-col-remove" data-ref="' + escapeHtml(p.ref) + '" title="Retirer de la comparaison"><i class="ti ti-x" aria-hidden="true"></i></button></div>');
    }).join('');
    gridHeaderBar.innerHTML = '<div class="compare-grid-header-row" style="display:grid;grid-template-columns:' + gridTemplateColumns + ';">' + headerHtml + '</div>';
    var headerRow = gridHeaderBar.querySelector('.compare-grid-header-row');
    if(headerRow) headerRow.style.transform = 'translateX(' + (-body.scrollLeft) + 'px)';
  }

  // Colonne d'étiquettes : UN SEUL conteneur (.compare-labels-col,
  // grid-row:1/-1, voir css/styles.css) qui empile les libellés via
  // subgrid à l'intérieur, plutôt qu'une cellule par ligne — voir le
  // commentaire détaillé dans css/styles.css juste au-dessus de
  // .compare-labels-col sur le bug que ça évite. Ne contient plus la
  // cellule "coin" (déplacée dans #productCompareGridHeader ci-dessus).
  var labelsHtml = '';
  rowDefs.forEach(function(def, rowIndex){
    var isLastRow = rowIndex === rowDefs.length - 1;
    var labelClasses = ['compare-row-label'];
    if(isLastRow) labelClasses.push('compare-cell-last-row');
    labelsHtml += cellHtml(labelClasses, escapeHtml(def.label));
  });

  // grid-template-rows:subgrid (.compare-labels-col) a besoin d'une grille
  // parent EXPLICITE pour hériter ses pistes (voir css/styles.css) — d'où
  // grid-template-rows posé en ligne ci-dessous, avec le même nombre de
  // lignes que rowDefs (plus d'en-tête ici, il est sorti de cette grille).
  var totalRows = rowDefs.length;
  var html = '<div class="compare-labels-col" style="grid-row:1 / span ' + totalRows + ';">' + labelsHtml + '</div>';

  rowDefs.forEach(function(def, rowIndex){
    var isLastRow = rowIndex === rowDefs.length - 1;
    html += products.map(function(p, i){
      var classes = [];
      if(i === products.length - 1) classes.push('compare-cell-last-col');
      if(isLastRow) classes.push('compare-cell-last-row');
      return cellHtml(classes, def.cellFn(p));
    }).join('');
  });

  var gridTemplateRows = 'repeat(' + totalRows + ', auto)';
  body.innerHTML = '<div class="compare-products-grid" style="grid-template-columns:' + gridTemplateColumns + ';grid-template-rows:' + gridTemplateRows + ';">' + html + '</div>';
  // La grille (et .compare-labels-col dedans) vient d'être recréée — si on
  // retire une colonne pendant qu'on est scrollé horizontalement (bouton ✕
  // d'une colonne, voir plus bas), la nouvelle colonne d'étiquettes doit
  // repartir avec le MÊME décalage que le défilement actuel, pas attendre
  // le prochain scroll (voir aussi le listener 'scroll' plus bas).
  var newLabelsCol = body.querySelector('.compare-labels-col');
  if(newLabelsCol) newLabelsCol.style.transform = 'translateX(' + body.scrollLeft + 'px)';
}

// Retour utilisateur : "faut revoir la version mobile" — voir le
// commentaire sur _productCompareMobileIndex en tête de fichier. Un
// produit à la fois, feuilleté avec ◀/▶, réutilise .specs-table/-wrap
// (même rendu que Caractéristiques sur la fiche produit) : juste
// Propriété/Valeur, pas de colonne figée ni de défilement horizontal.
//
// Retour utilisateur suivant : "comment on fait pour comparer lorsqu'on a
// plus accès au flèche lorsqu'on scroll ?" — d'abord "corrigé" avec
// position:sticky sur .compare-pager À L'INTÉRIEUR de #productCompareBody,
// mais nouveau bug trouvé (capture à l'appui) : le feuilleteur étant le
// tout premier élément défilant, dès qu'on scrollait de plus que sa propre
// hauteur, la 1ère ligne du tableau (Photo) — qui ne fait QUE suivre le
// défilement normalement, elle — se retrouvait plus haut à l'écran que le
// feuilleteur resté collé, et s'affichait donc AU-DESSUS de lui au lieu de
// rester cachée derrière (position:sticky réserve l'espace de l'élément à
// sa position NON collée dans le flux, pas à sa position collée affichée —
// tout ce qui suit continue de défiler par rapport à cette position non
// collée). Un sticky posé sur le tout premier élément d'une zone de
// défilement n'est donc pas fiable ici. Solution définitive : le
// feuilleteur n'est plus DANS #productCompareBody du tout — c'est un
// élément à part (#productCompareMobilePager, voir js/templates.js),
// frère de #productCompareBody, entre lui et .modal-head — comme
// .modal-head lui-même, jamais concerné par le défilement, donc rien ne
// peut jamais s'afficher "par-dessus" lui.
function _compareRenderMobilePager(pagerBar, body, products){
  if(_productCompareMobileIndex >= products.length) _productCompareMobileIndex = products.length - 1;
  if(_productCompareMobileIndex < 0) _productCompareMobileIndex = 0;
  var p = products[_productCompareMobileIndex];
  var rowDefs = _compareBuildRowDefs(products);

  var rowsHtml = rowDefs.map(function(def){
    return '<tr><td>' + escapeHtml(def.label) + '</td><td>' + def.cellFn(p) + '</td></tr>';
  }).join('');

  var isFirst = _productCompareMobileIndex === 0;
  var isLast = _productCompareMobileIndex === products.length - 1;

  if(pagerBar){
    pagerBar.style.display = '';
    pagerBar.innerHTML = '<div class="compare-pager">'
      + '<button type="button" class="compare-pager-nav" data-dir="-1" aria-label="Produit précédent"' + (isFirst ? ' disabled' : '') + '><i class="ti ti-chevron-left" aria-hidden="true"></i></button>'
      + '<div class="compare-pager-info">'
        + '<div class="compare-pager-name">' + escapeHtml(p.name || p.ref || '') + '</div>'
        + '<div class="compare-pager-count">' + (_productCompareMobileIndex + 1) + ' / ' + products.length + '</div>'
      + '</div>'
      + '<button type="button" class="compare-pager-nav" data-dir="1" aria-label="Produit suivant"' + (isLast ? ' disabled' : '') + '><i class="ti ti-chevron-right" aria-hidden="true"></i></button>'
      + '<button type="button" class="compare-col-remove" data-ref="' + escapeHtml(p.ref) + '" title="Retirer de la comparaison"><i class="ti ti-x" aria-hidden="true"></i></button>'
      + '</div>';
  }

  // padding horizontal posé ici (pas sur #productCompareBody, qui reste à
  // 0 pour laisser la grille desktop/tablette défiler bord à bord — voir
  // _compareRenderTable) : le feuilleteur mobile, lui, a besoin de la
  // marge habituelle autour de .specs-table-wrap.
  // max-height:none — .specs-table-wrap plafonne normalement à 260px
  // (pensé pour un champ parmi d'autres dans le formulaire produit) ;
  // ici c'est le seul contenu de #productCompareBody, qui gère déjà
  // lui-même le défilement (retour utilisateur : éviter un double
  // défilement imbriqué).
  body.innerHTML = '<div style="padding:0 18px;">'
    + '<div class="specs-table-wrap" style="max-height:none;"><table class="specs-table"><tr><th>Propriété</th><th>Valeur</th></tr>' + rowsHtml + '</table></div>'
    + '</div>';
}

// Retour utilisateur : "bétonne tout ça, fonctionne responsive mobile" —
// repéré en testant des ouvertures/fermetures rapprochées : _compareClose()
// masque la fenêtre via _closeOverlayAnimated (js/init.js), qui attend la
// fin de l'animation (~260ms, filet de sécurité par setTimeout si
// l'événement animationend ne se déclenche pas) avant d'appliquer
// style.display='none'. Rouvrir AVANT ce délai (_compareOpen) réaffiche
// bien la fenêtre tout de suite, mais le style.display='none' RETARDÉ de
// la fermeture précédente finit par s'exécuter quand même juste après —
// refermant la fenêtre qu'on venait pourtant de rouvrir. Un simple jeton
// incrémenté à chaque appel permet à teardown() de vérifier qu'aucune
// réouverture n'a eu lieu entre-temps avant d'agir.
var _compareCloseToken = 0;

function _compareOpen(){
  var overlay = document.getElementById('productCompareOverlay');
  if(!overlay) return;
  _compareCloseToken++; // invalide toute fermeture différée encore en attente
  _productCompareMobileIndex = 0; // repart toujours sur le 1er produit (feuilleteur mobile)
  _compareLastIsMobile = _compareIsMobileLayout(); // resynchronise pour l'écouteur 'resize', voir plus bas
  _compareRenderTable();
  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function _compareClose(){
  var overlay = document.getElementById('productCompareOverlay');
  if(!overlay) return;
  var closeToken = ++_compareCloseToken;
  function teardown(){
    if(closeToken !== _compareCloseToken) return; // réouvert entre-temps, ne rien faire
    overlay.style.display = 'none';
    // Retour utilisateur (mécanisme partagé, voir js/render-documents.js/
    // js/render-comments.js) : ne retire 'modal-open' que si aucune autre
    // fenêtre connue n'est encore ouverte derrière (ex. depuis la fiche
    // produit, ou le configurateur d'armoire).
    if(typeof window._isOtherOverlayOpen !== 'function' || !window._isOtherOverlayOpen('productCompareOverlay')){
      document.body.classList.remove('modal-open');
    }
  }
  if(typeof window._closeOverlayAnimated === 'function') window._closeOverlayAnimated(overlay, teardown);
  else teardown();
}

(function _initProductCompare(){
  _compareRenderBadge();

  var btnFab = document.getElementById('btnFabCompareProducts');
  if(btnFab) btnFab.addEventListener('click', _compareOpen);

  var closeBtn = document.getElementById('productCompareCloseBtn');
  if(closeBtn) closeBtn.addEventListener('click', _compareClose);

  var clearBtn = document.getElementById('productCompareClearBtn');
  if(clearBtn) clearBtn.addEventListener('click', _compareClearAll);

  // Partagé entre #productCompareBody (bouton retirer d'une colonne en
  // mode grille desktop) et #productCompareMobilePager (précédent/suivant/
  // retirer du feuilleteur mobile, voir js/templates.js — ce dernier est
  // un élément à part, jamais dans la zone défilante, voir
  // _compareRenderMobilePager).
  function _compareBodyClickHandler(e){
    var navBtn = e.target.closest('.compare-pager-nav');
    if(navBtn){
      _productCompareMobileIndex += parseInt(navBtn.getAttribute('data-dir'), 10);
      _compareRenderTable();
      return;
    }
    var btn = e.target.closest('.compare-col-remove');
    if(!btn) return;
    _compareRemove(btn.getAttribute('data-ref'));
  }

  var mobilePagerBar = document.getElementById('productCompareMobilePager');
  if(mobilePagerBar) mobilePagerBar.addEventListener('click', _compareBodyClickHandler);

  // #productCompareGridHeader (en-tête desktop, voir js/templates.js et le
  // commentaire dans _compareRenderTable) reçoit aussi les clics "retirer"
  // — c'est lui qui porte maintenant les boutons ✕ par produit.
  var gridHeaderBar = document.getElementById('productCompareGridHeader');
  if(gridHeaderBar) gridHeaderBar.addEventListener('click', _compareBodyClickHandler);

  var body = document.getElementById('productCompareBody');
  if(body){
    body.addEventListener('click', _compareBodyClickHandler);
    // Retour utilisateur : "corrige les bugs de responsive mobile du
    // comparateur" — voir le commentaire détaillé dans css/styles.css
    // au-dessus de .compare-labels-col : position:sticky;left:0 décroche
    // à l'approche de la fin du défilement horizontal (limitation du
    // moteur de rendu, testée et confirmée, indépendante de la structure
    // de la grille). Remplacé par un transform posé ici à chaque scroll,
    // qui compense exactement le défilement horizontal — fiable sur toute
    // la plage, contrairement à sticky. Même mécanisme pour la ligne
    // d'en-tête, maintenant dans #productCompareGridHeader (retour
    // utilisateur : "corrige aussi sur desktop") — translaté dans le sens
    // opposé puisque ce n'est pas lui qui défile, contrairement à
    // .compare-labels-col (qui est un élément DE la grille défilante).
    body.addEventListener('scroll', function(){
      var labelsCol = body.querySelector('.compare-labels-col');
      if(labelsCol) labelsCol.style.transform = 'translateX(' + body.scrollLeft + 'px)';
      var headerRow = gridHeaderBar && gridHeaderBar.querySelector('.compare-grid-header-row');
      if(headerRow) headerRow.style.transform = 'translateX(' + (-body.scrollLeft) + 'px)';
    }, { passive: true });
  }

  var overlay = document.getElementById('productCompareOverlay');
  if(overlay){
    // Clic extérieur : fermer uniquement sur desktop (pas mobile/tablette)
    // — même règle que la fiche produit (js/render-view-modal-close.js).
    overlay.addEventListener('click', function(e){
      if(e.target === overlay && window.innerWidth > 1024) _compareClose();
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && overlay && getComputedStyle(overlay).display !== 'none') _compareClose();
  });

  // Retour utilisateur : "je veux que tu me bétonne tout ça, fonctionne
  // responsive mobile" — la bascule grille (desktop) / feuilleteur (mobile)
  // est décidée en JS à chaque rendu (_compareIsMobileLayout), pas en CSS
  // pur comme le configurateur d'armoire (qui, lui, garde le même HTML et
  // ne fait que le réafficher différemment) : tourner un téléphone
  // (portrait ↔ paysage) pendant que le comparateur reste ouvert ne
  // redéclenchait donc jamais ce choix, contrairement à tout le reste de
  // la page, qui suit la rotation nativement via les media queries CSS.
  // Réagit ici au redimensionnement (rotation comprise) UNIQUEMENT si le
  // mode effectif (mobile/desktop) a réellement changé et que la fenêtre
  // est ouverte — pas de re-rendu inutile à chaque pixel. _compareLastIsMobile
  // (portée globale, voir en tête de fichier) est resynchronisé à chaque
  // ouverture par _compareOpen ci-dessus.
  window.addEventListener('resize', function(){
    if(!overlay || getComputedStyle(overlay).display === 'none') return;
    var nowMobile = _compareIsMobileLayout();
    if(nowMobile !== _compareLastIsMobile){
      _compareLastIsMobile = nowMobile;
      _compareRenderTable();
    }
  });
})();
