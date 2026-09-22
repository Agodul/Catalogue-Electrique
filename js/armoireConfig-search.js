// ── Recherche produits, rangée en dossiers famille ───────────────────────
// Sans recherche active : dossiers par famille (comme la page d'accueil),
// repliés/dépliés SUR PLACE façon accordéon — retour utilisateur : "unifie
// le comportement [...] et configurateur d'armoire" — même mécanique que
// "Parcourir le catalogue" (_sugPickerOpenGroups, js/modal-browse-catalogue.js)
// plutôt que l'ancienne navigation "on entre dans le dossier, la liste des
// familles est remplacée, un lien retour revient en arrière". Dès qu'on tape
// dans la recherche, elle porte sur tout le catalogue, toutes familles
// confondues (liste plate, pas de dossiers).

var _armoireOpenFamilies = {}; // { famille: true } — dossiers actuellement dépliés, plusieurs à la fois

// Retour utilisateur : "ajoute un bouton pour afficher les deux catalogues
// ou non" — le configurateur d'armoire parcourait jusqu'ici TOUJOURS
// l'ensemble du catalogue (window.products, sans filtre), utile pour une
// armoire qui mélange réellement du matériel électrique et pneumatique. Le
// bouton #armoireSearchScopeBtn (voir _armoireToggleSearchScope/
// _armoireSyncSearchScopeBtn plus bas) permet de limiter la recherche/le
// parcours au seul catalogue actuellement affiché (window._getActiveDomain,
// js/storage.js) quand ce mélange n'est pas voulu. true par défaut : garde
// le comportement déjà connu tant qu'on ne l'a pas explicitement restreint.
var _armoireSearchAllDomains = true;

// Liste de produits à parcourir/rechercher dans CE panneau — remplace tous
// les "window.products || []" utilisés jusqu'ici par les fonctions
// d'affichage ci-dessous.
function _armoireScopedProducts(){
  var all = window.products || [];
  if(_armoireSearchAllDomains) return all;
  var domain = typeof window._getActiveDomain === 'function' ? window._getActiveDomain() : 'electrique';
  return all.filter(function(p){ return productDomain(p) === domain; });
}

function _armoireSyncSearchScopeBtn(){
  var btn   = document.getElementById('armoireSearchScopeBtn');
  var icon  = document.getElementById('armoireSearchScopeIcon');
  var label = document.getElementById('armoireSearchScopeLabel');
  if(!btn || !icon || !label) return;
  if(_armoireSearchAllDomains){
    btn.style.border = '1px solid var(--copper)';
    btn.style.background = 'var(--copper)';
    btn.style.color = '#fff';
    btn.title = 'Recherche dans les deux catalogues — cliquer pour limiter au catalogue actif';
    icon.className = 'ti ti-apps';
    label.textContent = 'Tous';
  } else {
    var domain = typeof window._getActiveDomain === 'function' ? window._getActiveDomain() : 'electrique';
    var isPneu = domain === 'pneumatique';
    btn.style.border = '1px solid var(--line)';
    btn.style.background = 'var(--paper)';
    btn.style.color = 'var(--ink)';
    btn.title = 'Recherche limitée au catalogue ' + (isPneu ? 'pneumatique' : 'électrique') + ' — cliquer pour chercher dans les deux';
    icon.className = isPneu ? 'ti ti-wind' : 'ti ti-bolt';
    label.textContent = isPneu ? 'Pneumatique' : 'Électrique';
  }
}

function _armoireToggleSearchScope(){
  _armoireSearchAllDomains = !_armoireSearchAllDomains;
  _armoireSyncSearchScopeBtn();
  var searchInput = document.getElementById('armoireConfigSearch');
  _armoireRenderSearchResults(searchInput ? searchInput.value : '');
}

// Même vignette que "Produits suggérés" (.sug-list-photo) — miniature fixe
// 44×44 avec repli sur une icône si pas de photo ou en erreur de chargement.
function _armoirePhotoHtml(p){
  return p.photo
    ? '<img src="' + escapeHtml(p.photo) + '" alt="' + escapeHtml(p.name || p.ref) + '" loading="lazy" data-fallback="photo-icon">'
    : '<i class="ti ti-photo-off"></i>';
}

function _armoireProductRowHtml(p){
  return '<div class="armoire-search-row sug-list-item" data-ref="' + escapeHtml(p.ref) + '" style="cursor:default;margin-bottom:6px;">'
    + '<div class="sug-list-photo">' + _armoirePhotoHtml(p) + '</div>'
    + '<div class="sug-list-body">'
    + '<div class="sug-list-ref">' + escapeHtml(p.ref || '') + _productBadgesCompactHtml(p) + '</div>'
    + '<div class="sug-list-name">' + escapeHtml(p.name || '') + (p.family ? ' · ' + escapeHtml(p.family) : '') + '</div>'
    + '</div>'
    // Retour utilisateur : "ajouter un bouton i [...] afin de pouvoir
    // regarder la fiche produit lors du choix de composant" — voir
    // _armoireOpenProductView plus bas, qui gère l'affichage par-dessus le
    // configurateur (jamais fait jusqu'ici pour la fiche produit).
    // Style en dur dans css/styles.css (.armoire-search-info, apparié à
    // .kebab-btn) — jamais la classe .kebab-btn elle-même, voir le
    // commentaire juste au-dessus de .armoire-search-info dans ce fichier.
    + '<button type="button" class="armoire-search-info" title="Voir la fiche produit"><i class="ti ti-info-circle" aria-hidden="true"></i></button>'
    // Icône ti-plus (pas un caractère "+" brut) : un glyphe de police de
    // caractères classique ne tombe pas forcément pile au centre optique
    // de sa boîte de ligne (retour utilisateur : "+" mal centré) — une
    // icône, elle, est dessinée pour ça, même principe que le "+" déjà
    // utilisé ailleurs dans ce fichier (armoire-draft-slot-new,
    // _armoireListItemHtml).
    + '<button type="button" class="armoire-search-add" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:7px;border:none;background:var(--copper);color:#fff;cursor:pointer;font-size:15px;line-height:1;flex-shrink:0;"><i class="ti ti-plus" aria-hidden="true"></i></button>'
    + '</div>';
}

// Ouvre la fiche produit complète (#viewOverlay/openView, voir
// js/render-view-modal.js) PAR-DESSUS le configurateur d'armoire — jamais
// nécessaire jusqu'ici : la fiche a le z-index le plus bas de toute
// l'échelle (--z-overlay, voir css/styles.css), le configurateur un des
// plus hauts (10600, en dur dans index.html). Sans ajustement, la fiche
// s'ouvrirait invisible, cachée derrière. Tout reste localisé ICI (jamais
// une ligne ajoutée dans render-view-modal(-close).js, qui n'ont pas à
// savoir que le configurateur existe) : un MutationObserver réagit à la
// fermeture de la fiche (retrait de sa classe "open") pour annuler le
// rehaussement de z-index, et pour remettre body.modal-open — que
// closeView() retire sans savoir que le configurateur, lui, reste ouvert
// derrière, ce qui déverrouillerait sinon le défilement de la page et
// referait passer l'en-tête au-dessus du panneau encore ouvert.
function _armoireOpenProductView(ref){
  var p = _armoireProductByRef(ref);
  if(!p || typeof openView !== 'function') return;
  var viewOverlay = document.getElementById('viewOverlay');
  if(viewOverlay){
    viewOverlay.style.zIndex = '10650';
    // Retour utilisateur : "quand je clique sur le i et que je veux voir
    // les caractéristiques ou autre ça s'ouvre pas" (puis, même symptôme :
    // "corrige la position de la fenêtre de commentaire qui s'affiche
    // derrière les autres") — Caractéristiques/Documents/Produits associés/
    // Pièces de rechange/Commentaires réutilisent tous une fenêtre commune
    // (#sugOverlay, #docOverlay, #specsOverlay, #sugPickerOverlay,
    // #commentsModalOverlay, #commentsNewOverlay pour "Nouveau"/"Modifier"),
    // qui restent à leur z-index habituel (10100 à 10650, voir index.html)
    // — plus bas ou à égalité avec le viewOverlay rehaussé ci-dessus, donc
    // ils s'ouvraient bien mais rendaient CACHÉS derrière la fiche produit.
    // On les rehausse aussi le temps que la fiche est ouverte dans ce
    // contexte, et on restaure leur z-index d'origine à la fermeture
    // (comme pour viewOverlay).
    var subOverlayIds = ['sugOverlay', 'docOverlay', 'specsOverlay', 'sugPickerOverlay', 'commentsModalOverlay', 'commentsNewOverlay'];
    var subOverlayPrevZ = {};
    subOverlayIds.forEach(function(id){
      var el = document.getElementById(id);
      if(!el) return;
      subOverlayPrevZ[id] = el.style.zIndex;
      el.style.zIndex = '10700';
    });
    var observer = new MutationObserver(function(){
      if(viewOverlay.classList.contains('open')) return;
      viewOverlay.style.zIndex = '';
      subOverlayIds.forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.style.zIndex = subOverlayPrevZ[id] || '';
      });
      var armoireOverlay = document.getElementById('armoireConfigOverlay');
      if(armoireOverlay && armoireOverlay.style.display !== 'none') document.body.classList.add('modal-open');
      observer.disconnect();
    });
    observer.observe(viewOverlay, { attributes: true, attributeFilter: ['class'] });
  }
  openView(p.id);
}

function _armoireRenderFamilyFolders(){
  var el = document.getElementById('armoireConfigSearchResults');
  if(!el) return;
  var all = _armoireScopedProducts();
  var grouped = {};
  var order = [];
  all.forEach(function(p){
    var f = p.family || '(Sans famille)';
    if(!grouped[f]){ grouped[f] = []; order.push(f); }
    grouped[f].push(p);
  });
  order.sort(function(a, b){ return a.localeCompare(b, 'fr'); });
  if(!order.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:16px 8px;">Aucun produit dans le catalogue.</div>';
    return;
  }
  // Groupe accordéon (.sug-picker-group/-title/-chevron/-count) — mêmes
  // classes que "Parcourir le catalogue" (js/modal-browse-catalogue.js),
  // seul le contenu diffère (liste compacte .armoire-family-list ici, une
  // grille de cartes à sélection multiple là-bas — l'ajout à la config
  // reste au clic sur "+", inchangé).
  el.innerHTML = order.map(function(f){
    var items = grouped[f];
    var open = !!_armoireOpenFamilies[f];
    return '<div class="sug-picker-group'+(open?' open':'')+'" data-family="' + escapeHtml(f) + '">'
      + '<div class="sug-picker-group-title">'
      +   '<i class="ti ti-chevron-right sug-picker-group-chevron"></i>'
      +   '<i class="ti ti-folder" style="color:var(--copper);flex-shrink:0;"></i>'
      +   escapeHtml(f) + ' <span class="sug-picker-group-count">(' + items.length + ')</span>'
      + '</div>'
      + '<div class="armoire-family-list">' + items.map(_armoireProductRowHtml).join('') + '</div>'
      + '</div>';
  }).join('');
  el.querySelectorAll('.sug-picker-group-title').forEach(function(titleEl){
    titleEl.addEventListener('click', function(){
      var groupEl = titleEl.parentNode;
      var fam = groupEl.getAttribute('data-family');
      var nowOpen = !groupEl.classList.contains('open');
      groupEl.classList.toggle('open', nowOpen);
      _armoireOpenFamilies[fam] = nowOpen;
    });
  });
}

function _armoireRenderSearchResults(query){
  var el = document.getElementById('armoireConfigSearchResults');
  if(!el) return;
  var norm = normalizeSearch(query || '');

  if(!norm){
    _armoireRenderFamilyFolders();
    return;
  }

  var all = _armoireScopedProducts();
  var results = all.filter(function(p){
    // Tags inclus dans la recherche, comme sur le catalogue principal
    // (voir getFilteredProducts/scoreProductMatch, js/storage.js) — retour
    // utilisateur : "ajouter la recherche par tags dans le configurateur
    // d'armoire".
    var tags = normalizeSearch((p.tags || []).join(' '));
    return normalizeSearch(p.ref || '').indexOf(norm) !== -1
        || normalizeSearch(p.name || '').indexOf(norm) !== -1
        || tags.indexOf(norm) !== -1;
  }).slice(0, 60);
  if(!results.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:16px 8px;">Aucun résultat.</div>';
    return;
  }
  el.innerHTML = results.map(_armoireProductRowHtml).join('');
}

