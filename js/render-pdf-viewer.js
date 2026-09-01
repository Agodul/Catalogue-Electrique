  // ── Viewer PDF rendu sur canvas via PDF.js — permet le pincement pour
  // zoomer sur mobile (impossible à intercepter avec l'ancien lecteur natif
  // en iframe : les gestes tactiles sur une iframe restent dans son propre
  // contexte et ne remontent jamais à la page parente). ──────────────────
  var _pdfjsLoadPromise = null;
  function ensurePdfJs(){
    if(window.pdfjsLib) return Promise.resolve();
    if(_pdfjsLoadPromise) return _pdfjsLoadPromise;
    _pdfjsLoadPromise = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = 'js/pdf.min.js';
      s.onload = function(){
        try{
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';
          resolve();
        }catch(e){ reject(e); }
      };
      s.onerror = function(){ _pdfjsLoadPromise = null; reject(new Error('Échec du chargement du lecteur PDF')); };
      document.head.appendChild(s);
    });
    return _pdfjsLoadPromise;
  }

  var _pdfCurrentDoc = null;
  var _pdfPageInfos = []; // { page, canvas, cssWidth0, cssHeight0, baseScale, renderTask, isImage, annotationLayerEl }
  var _pdfImageObjectUrl = null; // à révoquer à la fermeture (voir _pdfClose)
  var _pdfZoom = 1;
  var MIN_PDF_ZOOM = 1, MAX_PDF_ZOOM = 4;
  var MAX_PDF_CANVAS_DIM = 4096; // limite raisonnable de résolution (mémoire/support navigateur)
  var _pdfSharpenTimer = null;
  var _pdfCurrentPage = 0; // index 0-based de la page actuellement affichée (voir navigation ci-dessous)

  // Le zoom redimensionne réellement les canvas (et non un transform CSS) :
  // sur iOS Safari, un transform:scale() sur un enfant n'agrandit pas de façon
  // fiable la zone de défilement d'un ancêtre overflow:auto, ce qui empêchait
  // tout déplacement une fois zoomé. Un vrai redimensionnement de boîte fait
  // grandir naturellement le scrollWidth/scrollHeight du conteneur.
  function _pdfApplyZoomSize(){
    _pdfPageInfos.forEach(function(info){
      info.canvas.style.width  = (info.cssWidth0 * _pdfZoom) + 'px';
      info.canvas.style.height = (info.cssHeight0 * _pdfZoom) + 'px';
      // La couche de liens (voir _openPdfCanvas) est dimensionnée par
      // PDF.js lui-même via calc(var(--scale-factor) * Npt) — mettre à jour
      // cette seule variable suffit à la redimensionner ; les liens qu'elle
      // contient sont eux-mêmes positionnés en POURCENTAGE de sa taille
      // (décidé par PDF.js, pas nous), donc suivent automatiquement, sans
      // reconstruire la couche à chaque cran de zoom.
      if(info.annotationLayerEl){
        info.annotationLayerEl.style.setProperty('--scale-factor', info.baseScale * _pdfZoom);
      }
      // Même mécanisme pour la couche de texte (recherche) — voir plus haut.
      if(info.textLayerEl){
        info.textLayerEl.style.setProperty('--scale-factor', info.baseScale * _pdfZoom);
      }
    });
  }

  // ── Service de liens minimal pour pdfjsLib.AnnotationLayer — retour
  // utilisateur : "quand le pdf a des options, par exemple des liens pour
  // envoyer sur une page ou un site, je voudrais que ça fonctionne". PDF.js
  // délègue la navigation à un objet "linkService" fourni par l'appelant —
  // on n'a pas son vrai visualiseur ici (juste notre propre pile de
  // canvas), donc on fournit le minimum qu'il attend : liens externes
  // ouverts dans un nouvel onglet, liens internes résolus puis envoyés à
  // notre propre _pdfGoToPage (voir navigation de page plus haut). ───────
  var _pdfLinkService = {
    externalLinkEnabled: true,
    isInPresentationMode: false,
    getAnchorUrl: function(){ return '#'; },
    getDestinationHash: function(){ return '#'; },
    addLinkAttributes: function(link, url){
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    },
    goToDestination: async function(dest){
      try{
        if(!_pdfCurrentDoc) return;
        var explicitDest = typeof dest === 'string' ? await _pdfCurrentDoc.getDestination(dest) : dest;
        if(!explicitDest || !explicitDest[0]) return;
        var pageIndex = await _pdfCurrentDoc.getPageIndex(explicitDest[0]);
        _pdfGoToPage(pageIndex);
      }catch(e){ console.warn('[PDF] lien interne échoué:', e); }
    },
    // Actions nommées ("page suivante/précédente"…), parfois utilisées par
    // des boutons de navigation intégrés au PDF plutôt qu'un lien direct.
    executeNamedAction: function(action){
      var total = _pdfPageInfos.length;
      if(action === 'NextPage')  _pdfGoToPage(_pdfCurrentPage + 1);
      else if(action === 'PrevPage')  _pdfGoToPage(_pdfCurrentPage - 1);
      else if(action === 'FirstPage') _pdfGoToPage(0);
      else if(action === 'LastPage')  _pdfGoToPage(total - 1);
    },
    eventBus: { dispatch: function(){}, on: function(){}, off: function(){} }
  };
  // Uniquement pour satisfaire l'API de render() — aucune de nos annotations
  // ne déclenche de téléchargement (fichier joint), mais un objet doit
  // exister pour éviter une erreur si PDF.js y accède.
  var _pdfDownloadManagerStub = { downloadUrl: function(){}, openOrDownloadData: function(){ return false; }, download: function(){} };

  // ── Recherche dans le document (retour utilisateur : "est-ce qu'on peut
  // faire des recherches sur un pdf ?") ──────────────────────────────────
  // S'appuie sur la couche de texte construite dans _openPdfCanvas (voir
  // pdfjsLib.renderTextLayer) : chaque <span> de cette couche correspond à
  // un fragment de texte réel du PDF, positionné exactement dessus mais
  // transparent. Pour chaque page, on concatène le texte normalisé de tous
  // ses spans en une seule chaîne avec, pour chaque span, la plage
  // [start,end] qu'il occupe dans cette chaîne (_pdfBuildPageSearchIndex) —
  // chercher devient un simple indexOf() répété sur cette chaîne, et une
  // correspondance qui chevauche la frontière entre deux spans (mot coupé
  // par PDF.js en plusieurs fragments) est quand même trouvée, contrairement
  // à une recherche span par span.
  var _pdfSearchMatches = []; // [{pageIdx, start, end}] dans l'ordre du document
  var _pdfSearchCurrentIndex = -1;
  var _pdfSearchQuery = '';

  function _pdfNormalizeSearchText(s){
    // Minuscules + retrait des accents — même principe que les autres
    // normalisations de recherche/comparaison de l'app (ex. norm() dans
    // l'import Excel, js/actions.js). Préserve la longueur caractère par
    // caractère pour les accents latins courants, ce qui permet de réutiliser
    // directement les mêmes décalages sur le texte NON normalisé du span
    // (voir _pdfHighlightAllMatches).
    return (s || '').toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
  }

  function _pdfBuildPageSearchIndex(info){
    if(!info.textLayerEl){ info.searchText = ''; info.searchOffsets = []; return; }
    var spans = info.textLayerEl.querySelectorAll('span');
    var offsets = [];
    var acc = '';
    spans.forEach(function(span){
      var orig = span.textContent;
      var norm = _pdfNormalizeSearchText(orig);
      offsets.push({ span: span, origText: orig, start: acc.length, end: acc.length + norm.length });
      acc += norm;
    });
    info.searchText = acc;
    info.searchOffsets = offsets;
  }

  // Remet chaque span touché à son texte d'origine (retire les <mark>) avant
  // de reconstruire pour une nouvelle recherche.
  function _pdfClearSearchHighlights(){
    _pdfPageInfos.forEach(function(info){
      (info.searchOffsets || []).forEach(function(o){
        // Toujours réinitialiser, sans essayer de "sauter" les spans déjà
        // propres via une comparaison de .textContent : cette lecture
        // aplatit le texte de tous les enfants (donc d'un éventuel <mark>
        // déjà présent) et redonne la même chaîne que le texte d'origine
        // même quand le <mark> est encore là structurellement — la
        // comparaison ne détectait donc jamais qu'il fallait nettoyer
        // (repéré en testant : une recherche sans résultat après une
        // recherche avec résultats laissait les anciens surlignages en
        // place).
        o.span.textContent = o.origText;
      });
    });
  }

  // Regroupe les correspondances par span concerné (un span peut en
  // contenir plusieurs, ou une correspondance peut chevaucher deux spans)
  // pour ne reconstruire chaque span qu'une seule fois.
  function _pdfHighlightAllMatches(){
    var bySpan = new Map();
    _pdfSearchMatches.forEach(function(m, matchIndex){
      var info = _pdfPageInfos[m.pageIdx];
      (info.searchOffsets || []).forEach(function(o){
        var overlapStart = Math.max(m.start, o.start);
        var overlapEnd   = Math.min(m.end, o.end);
        if(overlapStart < overlapEnd){
          if(!bySpan.has(o.span)) bySpan.set(o.span, []);
          bySpan.get(o.span).push({
            localStart: overlapStart - o.start,
            localEnd: overlapEnd - o.start,
            matchIndex: matchIndex,
            origText: o.origText
          });
        }
      });
    });
    bySpan.forEach(function(ranges, span){
      ranges.sort(function(a, b){ return a.localStart - b.localStart; });
      var orig = ranges[0].origText;
      var html = '';
      var cursor = 0;
      ranges.forEach(function(r){
        html += escapeHtml(orig.slice(cursor, r.localStart));
        html += '<mark class="pdf-search-hit" data-match-index="' + r.matchIndex + '">'
          + escapeHtml(orig.slice(r.localStart, r.localEnd)) + '</mark>';
        cursor = r.localEnd;
      });
      html += escapeHtml(orig.slice(cursor));
      span.innerHTML = html;
    });
  }

  function _pdfUpdateSearchCountUI(){
    var countEl = document.getElementById('pdfViewerSearchCount');
    if(!countEl) return;
    if(!_pdfSearchQuery) countEl.textContent = '';
    else if(_pdfSearchMatches.length === 0) countEl.textContent = 'Aucun résultat';
    else countEl.textContent = (_pdfSearchCurrentIndex + 1) + ' / ' + _pdfSearchMatches.length;
  }

  function _pdfUpdateSearchCurrent(scrollToIt){
    document.querySelectorAll('#pdfViewerPages mark.pdf-search-hit-current').forEach(function(m){
      m.classList.remove('pdf-search-hit-current');
    });
    if(_pdfSearchCurrentIndex < 0) return;
    var marks = document.querySelectorAll('#pdfViewerPages mark[data-match-index="' + _pdfSearchCurrentIndex + '"]');
    marks.forEach(function(m){ m.classList.add('pdf-search-hit-current'); });
    // Pas besoin de passer par _pdfGoToPage/sa suppression de détection :
    // scrollIntoView déclenche de vrais événements 'scroll' que
    // _pdfDetectCurrentPageFromScroll interprète très bien tout seul pour
    // garder "X / Y" (nav de page) juste, sans logique spéciale ici.
    if(scrollToIt && marks.length) marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function _pdfRunSearch(query){
    _pdfClearSearchHighlights();
    _pdfSearchQuery = (query || '').trim();
    _pdfSearchMatches = [];
    var normQuery = _pdfNormalizeSearchText(_pdfSearchQuery);
    if(normQuery){
      _pdfPageInfos.forEach(function(info, pageIdx){
        if(!info.searchText) return;
        var idx = 0;
        while(true){
          idx = info.searchText.indexOf(normQuery, idx);
          if(idx === -1) break;
          _pdfSearchMatches.push({ pageIdx: pageIdx, start: idx, end: idx + normQuery.length });
          idx += 1; // autorise les correspondances qui se chevauchent (ex. "aa" dans "aaa")
        }
      });
    }
    _pdfHighlightAllMatches();
    _pdfSearchCurrentIndex = _pdfSearchMatches.length ? 0 : -1;
    _pdfUpdateSearchCurrent(true);
    _pdfUpdateSearchCountUI();
  }

  function _pdfSearchGo(delta){
    if(_pdfSearchMatches.length === 0) return;
    _pdfSearchCurrentIndex = (_pdfSearchCurrentIndex + delta + _pdfSearchMatches.length) % _pdfSearchMatches.length;
    _pdfUpdateSearchCurrent(true);
    _pdfUpdateSearchCountUI();
  }

  function _pdfCloseSearchBar(){
    var bar = document.getElementById('pdfViewerSearchBar');
    var input = document.getElementById('pdfViewerSearchInput');
    if(bar) bar.style.display = 'none';
    if(input) input.value = '';
    _pdfClearSearchHighlights();
    _pdfSearchMatches = [];
    _pdfSearchCurrentIndex = -1;
    _pdfSearchQuery = '';
    _pdfUpdateSearchCountUI();
  }

  function _pdfOpenSearchBar(){
    var toggle = document.getElementById('pdfViewerSearchToggle');
    if(toggle && toggle.style.display === 'none') return; // image : pas de texte à chercher
    var bar = document.getElementById('pdfViewerSearchBar');
    var input = document.getElementById('pdfViewerSearchInput');
    if(bar) bar.style.display = 'flex';
    if(input){ input.focus(); input.select(); }
  }

  // Masquée pour une image (voir _openImageViewer) : rien à chercher dedans.
  function _pdfUpdateSearchToggleVisibility(){
    var toggle = document.getElementById('pdfViewerSearchToggle');
    if(!toggle) return;
    var isImg = _pdfPageInfos.length > 0 && _pdfPageInfos[0].isImage;
    toggle.style.display = isImg ? 'none' : 'flex';
  }

  (function _initPdfSearch(){
    var toggle  = document.getElementById('pdfViewerSearchToggle');
    var closeBtn = document.getElementById('pdfViewerSearchClose');
    var input   = document.getElementById('pdfViewerSearchInput');
    var prevBtn = document.getElementById('pdfViewerSearchPrev');
    var nextBtn = document.getElementById('pdfViewerSearchNext');
    if(toggle) toggle.addEventListener('click', function(){
      var bar = document.getElementById('pdfViewerSearchBar');
      if(bar && bar.style.display === 'flex') _pdfCloseSearchBar();
      else _pdfOpenSearchBar();
    });
    if(closeBtn) closeBtn.addEventListener('click', _pdfCloseSearchBar);
    if(input){
      var debounceTimer = null;
      // Recherche "au fil de la frappe" (débattue à 250ms pour ne pas
      // rechercher à chaque caractère) — Entrée relance immédiatement (ou
      // avance au résultat suivant si la requête n'a pas changé), Échap
      // ferme la barre.
      input.addEventListener('input', function(){
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function(){ _pdfRunSearch(input.value); }, 250);
      });
      input.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){
          e.preventDefault();
          clearTimeout(debounceTimer);
          if(_pdfSearchQuery !== input.value.trim()) _pdfRunSearch(input.value);
          else _pdfSearchGo(e.shiftKey ? -1 : 1);
        } else if(e.key === 'Escape'){
          e.preventDefault();
          _pdfCloseSearchBar();
        }
      });
    }
    if(prevBtn) prevBtn.addEventListener('click', function(){ _pdfSearchGo(-1); });
    if(nextBtn) nextBtn.addEventListener('click', function(){ _pdfSearchGo(1); });
  })();

  function _pdfSetZoom(z){
    _pdfZoom = Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, z));
    _pdfApplyZoomSize();
    _pdfUpdateZoomUI();
  }

  // ── Boutons zoom +/- (souris/trackpad) — jusqu'ici le zoom n'était
  // possible qu'au pincement tactile, inutilisable sur desktop (retour
  // utilisateur : "il y a que tout mobile"). Réutilise le même
  // _pdfSetZoom()/_pdfSharpenPages() que le pincement, ancré sur le CENTRE
  // de la zone visible (pas de point de doigt disponible au clic) selon le
  // même principe que l'ancrage du pincement : retrouver le point du
  // contenu sous ce centre avant le changement de zoom, puis réajuster le
  // défilement pour qu'il y reste après. ──────────────────────────────────
  var PDF_ZOOM_STEP = 0.25;
  function _pdfUpdateZoomUI(){
    var label = document.getElementById('pdfViewerZoomLabel');
    var zoomOutBtn   = document.getElementById('pdfViewerZoomOut');
    var zoomInBtn    = document.getElementById('pdfViewerZoomIn');
    var zoomResetBtn = document.getElementById('pdfViewerZoomReset');
    if(label) label.textContent = Math.round(_pdfZoom * 100) + '%';
    if(zoomOutBtn){
      zoomOutBtn.disabled = _pdfZoom <= MIN_PDF_ZOOM;
      zoomOutBtn.style.opacity = zoomOutBtn.disabled ? '.35' : '1';
    }
    if(zoomInBtn){
      zoomInBtn.disabled = _pdfZoom >= MAX_PDF_ZOOM;
      zoomInBtn.style.opacity = zoomInBtn.disabled ? '.35' : '1';
    }
    if(zoomResetBtn){
      // Rien à réinitialiser si déjà à 100% — retour utilisateur : "est-ce
      // qu'on peut ajouter un bouton pour reset le zoom ?".
      zoomResetBtn.disabled = _pdfZoom === MIN_PDF_ZOOM;
      zoomResetBtn.style.opacity = zoomResetBtn.disabled ? '.35' : '1';
    }
  }

  // Change le zoom vers newZoom en gardant le CENTRE de la zone visible
  // ancré sur le même point de contenu qu'avant (retrouve le point du
  // contenu sous ce centre, applique le nouveau zoom, puis réajuste le
  // défilement pour qu'il y reste) — utilisé aussi bien pour +/- (delta)
  // que pour la réinitialisation (cible fixe 1).
  function _pdfSetZoomAnchoredCenter(newZoom){
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(!scrollEl || _pdfPageInfos.length === 0) return;
    var midX = scrollEl.clientWidth / 2;
    var midY = scrollEl.clientHeight / 2;
    var oldZoom = _pdfZoom;
    var contentX = (scrollEl.scrollLeft + midX) / oldZoom;
    var contentY = (scrollEl.scrollTop + midY) / oldZoom;
    _pdfSetZoom(newZoom);
    scrollEl.scrollLeft = contentX * _pdfZoom - midX;
    scrollEl.scrollTop  = contentY * _pdfZoom - midY;
    clearTimeout(_pdfSharpenTimer);
    _pdfSharpenTimer = setTimeout(_pdfSharpenPages, 120);
  }

  function _pdfZoomBy(delta){ _pdfSetZoomAnchoredCenter(_pdfZoom + delta); }
  function _pdfZoomReset(){ _pdfSetZoomAnchoredCenter(1); }

  (function _initPdfZoomButtons(){
    var zoomOutBtn   = document.getElementById('pdfViewerZoomOut');
    var zoomInBtn    = document.getElementById('pdfViewerZoomIn');
    var zoomResetBtn = document.getElementById('pdfViewerZoomReset');
    if(zoomOutBtn)   zoomOutBtn.addEventListener('click', function(){ _pdfZoomBy(-PDF_ZOOM_STEP); });
    if(zoomInBtn)    zoomInBtn.addEventListener('click', function(){ _pdfZoomBy(PDF_ZOOM_STEP); });
    if(zoomResetBtn) zoomResetBtn.addEventListener('click', _pdfZoomReset);
  })();

  // ── Navigation page (PDF multi-pages) — retour utilisateur : "numéro de
  // page / navigation" sur les documents multi-pages. Les pages sont
  // empilées verticalement dans #pdfViewerScroll (pas de pagination "une
  // page à la fois" côté rendu) : la navigation se traduit donc par un
  // défilement jusqu'à la page visée, et l'affichage "X / Y" se met à jour
  // en suivant le scroll (quelle que soit la façon d'y arriver — boutons ou
  // scroll libre à la souris/au doigt). ─────────────────────────────────
  function _pdfUpdatePageNavUI(){
    var nav   = document.getElementById('pdfViewerPageNav');
    var input = document.getElementById('pdfViewerPageInput');
    var total_ = document.getElementById('pdfViewerPageTotal');
    var prev  = document.getElementById('pdfViewerPrevPage');
    var next  = document.getElementById('pdfViewerNextPage');
    if(!nav) return;
    var total = _pdfPageInfos.length;
    // Masqué pour une image (une seule "page" fictive) ou un PDF d'1 page —
    // rien à naviguer dans ce cas.
    if(total <= 1 || (_pdfPageInfos[0] && _pdfPageInfos[0].isImage)){
      nav.style.display = 'none';
      return;
    }
    nav.style.display = 'flex';
    // Ne pas écraser la saisie en cours si l'utilisateur est justement en
    // train de taper un numéro dans le champ (ex. un défilement déclenché
    // ailleurs pendant qu'il tape) — seul Entrée/perte de focus doit
    // remplacer sa saisie (voir _pdfJumpFromInput).
    if(input && document.activeElement !== input) input.value = _pdfCurrentPage + 1;
    if(total_) total_.textContent = '/ ' + total;
    if(prev) prev.disabled = _pdfCurrentPage <= 0;
    if(next) next.disabled = _pdfCurrentPage >= total - 1;
    if(prev) prev.style.opacity = prev.disabled ? '.35' : '1';
    if(next) next.style.opacity = next.disabled ? '.35' : '1';
  }

  // Valide la saisie du champ page et saute à la page tapée — retour
  // utilisateur : "est qu'on peut rentrer le numéro d'une page ?". Toute
  // entrée invalide ou hors bornes (texte, page 0, page > total…) est
  // silencieusement ramenée sur la page réelle plutôt que de planter ou de
  // laisser un champ dans un état incohérent — _pdfGoToPage clampe déjà les
  // bornes, et _pdfUpdatePageNavUI (appelée par _pdfGoToPage) réécrit
  // l'input avec la valeur finale retenue.
  function _pdfJumpFromInput(inputEl){
    var n = parseInt(inputEl.value, 10);
    if(!isNaN(n)) _pdfGoToPage(n - 1);
    else _pdfUpdatePageNavUI(); // saisie non numérique → revenir sur la page réelle
  }

  // Position du HAUT d'une page dans le repère de défilement de
  // #pdfViewerScroll — PAS via canvas.offsetTop : depuis l'ajout du
  // conteneur .pdf-page-wrap autour de chaque canvas (position:relative,
  // nécessaire pour superposer les couches de liens/texte), .pdf-page-wrap
  // est devenu l'offsetParent du canvas, donc canvas.offsetTop ne renvoyait
  // plus QUE sa position À L'INTÉRIEUR de son propre wrapper (toujours ~0)
  // au lieu de sa position dans la liste des pages — plus aucune page ne
  // savait où elle se trouvait réellement (retour utilisateur : "quand
  // j'utilise les flèches pour passer à une autre page, ou même d'aller
  // directement à une autre page, ça ne fonctionne pas"). getBoundingClientRect()
  // ne dépend d'aucune hiérarchie offsetParent — fiable quelle que soit la
  // structure DOM entre la page et le conteneur défilant.
  function _pdfPageTopInScroll(info, scrollEl){
    var el = info.wrap || info.canvas;
    return scrollEl.scrollTop + (el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top);
  }

  // Détecte quelle page occupe le haut de la zone visible pendant un
  // défilement libre (molette, glisser, barre de défilement) — pas
  // seulement après un clic sur les flèches — pour que "X / Y" reste
  // toujours juste.
  //
  // _pdfGoToPage() utilise un scroll animé ("smooth") : pendant son
  // parcours, les événements 'scroll' intermédiaires ont un scrollTop qui
  // n'a pas encore atteint la page visée — les détecter ici les aurait fait
  // revenir en arrière PENDANT l'animation, avant de re-sauter en avant une
  // fois arrivé (repéré en testant : le libellé affichait la page
  // précédente jusqu'à la fin de l'anim, un cran de retard visible à chaque
  // clic). _pdfSuppressScrollDetect coupe cette détection tant que des
  // 'scroll' events continuent d'arriver rapprochés (l'animation est en
  // cours) ; elle se réactive dès qu'ils s'arrêtent ~150ms — que ce soit la
  // fin de l'anim programmée ou un défilement libre qui s'immobilise.
  var _pdfScrollEndTimer = null;
  var _pdfSuppressScrollDetect = false;
  function _pdfDetectCurrentPageFromScroll(){
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(!scrollEl || _pdfPageInfos.length <= 1) return;
    clearTimeout(_pdfScrollEndTimer);
    _pdfScrollEndTimer = setTimeout(function(){ _pdfSuppressScrollDetect = false; }, 150);
    if(_pdfSuppressScrollDetect) return;
    var top = scrollEl.scrollTop + 1; // +1 : évite un flottement pile à la frontière entre deux pages
    var idx = 0;
    for(var i = 0; i < _pdfPageInfos.length; i++){
      if(_pdfPageTopInScroll(_pdfPageInfos[i], scrollEl) <= top) idx = i; else break;
    }
    if(idx !== _pdfCurrentPage){
      _pdfCurrentPage = idx;
      _pdfUpdatePageNavUI();
    }
  }

  function _pdfGoToPage(idx){
    var scrollEl = document.getElementById('pdfViewerScroll');
    var total = _pdfPageInfos.length;
    if(!scrollEl || total === 0) return;
    idx = Math.min(total - 1, Math.max(0, idx));
    // Déjà sur cette page (ou déjà en train d'y défiler) : ne pas relancer
    // un second scrollTo(). Sans ce filet, le "Entrée" du champ page
    // appelle input.blur() juste après avoir lancé le scroll — comme la
    // valeur du champ a changé, ça déclenche en plus un 'change' natif qui
    // rappelait _pdfGoToPage() une seconde fois vers la MÊME page pendant
    // que le premier scroll animait encore. Les deux animations se
    // marchaient dessus et pouvaient s'arrêter avant d'atteindre la page
    // visée (repéré en testant : l'affichage restait parfois bloqué une
    // page trop tôt après un saut par le champ de saisie).
    if(idx === _pdfCurrentPage){
      _pdfUpdatePageNavUI();
      return;
    }
    _pdfCurrentPage = idx;
    _pdfSuppressScrollDetect = true;
    clearTimeout(_pdfScrollEndTimer);
    // Filet de sécurité si l'anim ne déclenche aucun événement 'scroll'
    // (déjà sur la bonne page) : la détection libre se réactive quand même.
    _pdfScrollEndTimer = setTimeout(function(){ _pdfSuppressScrollDetect = false; }, 500);
    scrollEl.scrollTo({ top: _pdfPageTopInScroll(_pdfPageInfos[idx], scrollEl), behavior: 'smooth' });
    _pdfUpdatePageNavUI(); // mise à jour immédiate (pas d'attente de la fin du scroll animé)
  }

  (function _initPdfPageNav(){
    var scrollEl = document.getElementById('pdfViewerScroll');
    var prev  = document.getElementById('pdfViewerPrevPage');
    var next  = document.getElementById('pdfViewerNextPage');
    var input = document.getElementById('pdfViewerPageInput');
    if(scrollEl) scrollEl.addEventListener('scroll', _pdfDetectCurrentPageFromScroll, {passive:true});
    if(prev) prev.addEventListener('click', function(){ _pdfGoToPage(_pdfCurrentPage - 1); });
    if(next) next.addEventListener('click', function(){ _pdfGoToPage(_pdfCurrentPage + 1); });
    if(input){
      // Entrée : saute à la page tapée et referme le clavier virtuel mobile.
      input.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); _pdfJumpFromInput(input); input.blur(); }
      });
      // Perte de focus sans Entrée (clic ailleurs, tabulation) : même saut,
      // 'change' ne se déclenche que si la valeur a vraiment été modifiée.
      input.addEventListener('change', function(){ _pdfJumpFromInput(input); });
      // Tout sélectionner au focus — retaper un numéro complet en un clic
      // plutôt que devoir d'abord effacer l'ancien.
      input.addEventListener('focus', function(){ input.select(); });
    }
  })();

  // Après le pincement, on re-rend chaque page à la résolution correspondant
  // au zoom final pour rester net (le redimensionnement CSS pendant le geste
  // ne fait qu'étirer le bitmap existant, ce qui devient flou en zoomant fort).
  function _pdfSharpenPages(){
    _pdfPageInfos.forEach(function(info){
      // Une image bitmap n'a pas de "re-rendu" PDF.js à refaire à plus haute
      // résolution : le navigateur redimensionne déjà le bitmap existant
      // correctement (contrairement au canvas PDF, dont le rendu initial est
      // volontairement basse résolution pour rester rapide à l'ouverture).
      if(info.isImage) return;
      var targetScale = info.baseScale * _pdfZoom * Math.min(window.devicePixelRatio || 1, 2);
      var viewport = info.page.getViewport({ scale: targetScale });
      if(Math.max(viewport.width, viewport.height) > MAX_PDF_CANVAS_DIM){
        var capFactor = MAX_PDF_CANVAS_DIM / Math.max(viewport.width, viewport.height);
        viewport = info.page.getViewport({ scale: targetScale * capFactor });
      }
      if(info.renderTask) info.renderTask.cancel();
      info.canvas.width  = viewport.width;
      info.canvas.height = viewport.height;
      var task = info.page.render({ canvasContext: info.canvas.getContext('2d'), viewport: viewport });
      info.renderTask = task;
      task.promise.catch(function(e){ if(e && e.name !== 'RenderingCancelledException') console.warn('[PDF] re-rendu échoué:', e); });
    });
  }

  // Pincement à deux doigts : capté sur le conteneur qui défile, sans
  // bloquer le défilement/le geste à un doigt (uniquement en pincement actif).
  (function _initPdfPinchZoom(){
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(!scrollEl) return;
    var startDist = 0, startZoom = 1;
    function dist(touches){
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx*dx + dy*dy);
    }
    scrollEl.addEventListener('touchstart', function(e){
      if(e.touches.length === 2){
        startDist = dist(e.touches);
        startZoom = _pdfZoom;
      }
    }, {passive:true});
    scrollEl.addEventListener('touchmove', function(e){
      if(e.touches.length === 2 && startDist > 0){
        e.preventDefault();
        var scale = dist(e.touches) / startDist;
        // Ancre le zoom sur le point du pincement : on retrouve le point du
        // contenu situé sous le milieu des deux doigts avant le changement de
        // zoom, puis on ajuste le défilement pour qu'il reste sous les doigts
        // après redimensionnement (sinon le zoom part toujours du coin
        // haut-gauche du canvas, indépendamment de l'endroit pincé).
        var rect = scrollEl.getBoundingClientRect();
        var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        var oldZoom = _pdfZoom;
        var contentX = (scrollEl.scrollLeft + midX) / oldZoom;
        var contentY = (scrollEl.scrollTop + midY) / oldZoom;
        _pdfSetZoom(startZoom * scale);
        scrollEl.scrollLeft = contentX * _pdfZoom - midX;
        scrollEl.scrollTop  = contentY * _pdfZoom - midY;
      }
    }, {passive:false});
    scrollEl.addEventListener('touchend', function(e){
      if(e.touches.length < 2 && startDist > 0){
        startDist = 0;
        clearTimeout(_pdfSharpenTimer);
        _pdfSharpenTimer = setTimeout(_pdfSharpenPages, 120);
      }
    }, {passive:true});
  })();

  // Affiche une image (jpg/png/gif/webp/heic/bmp) dans la même boîte que le
  // lecteur PDF, sans passer par PDF.js : une seule "page" (l'<img> elle-même)
  // ajoutée à _pdfPageInfos, ce qui lui fait profiter gratuitement du même
  // pincement de zoom que les pages PDF (_pdfApplyZoomSize ne fait que poser
  // style.width/height, valable aussi bien sur un <img> que sur un <canvas>).
  function _openImageViewer(ab, docName){
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    var pagesEl  = document.getElementById('pdfViewerPages');
    if(pagesEl) pagesEl.innerHTML = '';
    // Centre l'image (horizontalement ET verticalement) dans toute la zone
    // visible plutôt que de la laisser collée en haut — retour utilisateur :
    // "faudrait afficher l'image au centre de la visionneuse". Jamais
    // activée pour un PDF (voir _openPdfCanvas, qui la retire) : empiler
    // plusieurs pages centrées verticalement n'aurait pas de sens.
    if(pagesEl) pagesEl.classList.add('pdf-pages-center-image');
    _pdfPageInfos = [];
    _pdfZoom = 1;
    _pdfUpdateZoomUI();
    _pdfCurrentPage = 0;
    _pdfUpdatePageNavUI(); // masque la nav (une image n'a qu'une seule "page")
    _pdfCloseSearchBar(); // rien à chercher dans une image — referme une éventuelle recherche du document précédent
    _pdfUpdateSearchToggleVisibility();
    if(_pdfImageObjectUrl){ URL.revokeObjectURL(_pdfImageObjectUrl); _pdfImageObjectUrl = null; }

    var url = URL.createObjectURL(new Blob([ab]));
    _pdfImageObjectUrl = url;
    var img = document.createElement('img');
    img.style.display = 'block';
    img.style.margin  = '0 auto 8px';
    img.style.background = '#fff';
    img.onload = function(){
      var containerWidth = ((scrollEl && scrollEl.parentElement) ? scrollEl.parentElement.clientWidth : 800) - 24;
      var cssWidth0  = Math.min(containerWidth, img.naturalWidth || containerWidth);
      var ratio = img.naturalWidth ? (cssWidth0 / img.naturalWidth) : 1;
      var cssHeight0 = (img.naturalHeight || 0) * ratio;
      img.style.width  = cssWidth0 + 'px';
      img.style.height = cssHeight0 ? (cssHeight0 + 'px') : 'auto';
      _pdfPageInfos = [{ canvas: img, cssWidth0: cssWidth0, cssHeight0: cssHeight0, isImage: true }];
      if(loader) loader.style.display = 'none';
      if(scrollEl) scrollEl.style.display = 'block';
    };
    img.onerror = function(){
      _pdfClose();
      showToast('Erreur d\'affichage de l\'image', 'err', 4000);
    };
    img.src = url;
    if(pagesEl) pagesEl.appendChild(img);
  }

  async function _openPdfCanvas(ab, docName){
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    var pagesEl  = document.getElementById('pdfViewerPages');
    if(pagesEl) pagesEl.innerHTML = '';
    if(pagesEl) pagesEl.classList.remove('pdf-pages-center-image'); // jamais pour un PDF — voir _openImageViewer
    _pdfPageInfos = [];
    _pdfZoom = 1;
    _pdfUpdateZoomUI();
    _pdfCurrentPage = 0;
    _pdfCloseSearchBar(); // referme/efface une éventuelle recherche du document précédent
    try{
      await ensurePdfJs();
      // PDF.js transfère (détache) l'ArrayBuffer passé à getDocument — on lui
      // donne une copie pour que le buffer mis en cache (préchargement au
      // survol du bouton "Voir") reste réutilisable aux ouvertures suivantes.
      var pdf = await window.pdfjsLib.getDocument({ data: ab.slice(0) }).promise;
      _pdfCurrentDoc = pdf;
      var containerWidth = ((scrollEl && scrollEl.parentElement) ? scrollEl.parentElement.clientWidth : 800) - 24;
      var dpr = window.devicePixelRatio || 1;
      for(var pageNum = 1; pageNum <= pdf.numPages; pageNum++){
        var page = await pdf.getPage(pageNum);
        var baseViewport = page.getViewport({ scale: 1 });
        var scale = containerWidth / baseViewport.width;
        var viewport = page.getViewport({ scale: scale * dpr });
        // Conteneur position:relative (voir css/styles.css .pdf-page-wrap) —
        // nécessaire pour superposer la couche de liens (ci-dessous) très
        // exactement sur le canvas ; le canvas seul (sans ce wrapper) ne
        // peut pas servir d'ancre à un enfant position:absolute.
        var wrap = document.createElement('div');
        wrap.className = 'pdf-page-wrap';
        var canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width  = (viewport.width / dpr) + 'px';
        canvas.style.height = (viewport.height / dpr) + 'px';
        canvas.style.background = '#fff';
        wrap.appendChild(canvas);
        if(pagesEl) pagesEl.appendChild(wrap);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;

        // Texte recherchable (retour utilisateur : "est-ce qu'on peut faire
        // des recherches sur un pdf ?") — le canvas est une image bitmap,
        // aucun texte dessous à chercher. On construit une couche de texte
        // invisible (comme le visualiseur PDF.js officiel) : mêmes
        // positions que le vrai texte, mais transparente — sert à la fois
        // de base de recherche ET de texte sélectionnable "gratuitement".
        // AVANT la couche de liens dans le DOM pour que ceux-ci restent
        // cliquables par-dessus (l'ordre DOM décide de l'empilement, tout
        // en position:absolute — voir css/styles.css).
        var textLayerEl = null;
        try{
          var textContent = await page.getTextContent();
          if(textContent.items.length > 0){
            textLayerEl = document.createElement('div');
            textLayerEl.className = 'textLayer';
            textLayerEl.style.setProperty('--scale-factor', scale); // même mécanisme que .annotationLayer ci-dessous
            wrap.appendChild(textLayerEl);
            var viewportCssText = page.getViewport({ scale: scale, dontFlip: true });
            await window.pdfjsLib.renderTextLayer({
              textContentSource: textContent,
              container: textLayerEl,
              viewport: viewportCssText
            }).promise;
          }
        }catch(txtErr){
          console.warn('[PDF] couche de texte échouée (page '+pageNum+'):', txtErr);
        }

        // Liens cliquables (retour utilisateur : "quand le pdf a des
        // options, par exemple des liens... je voudrais que ça
        // fonctionne") — le canvas n'est qu'une image bitmap, sans lien
        // dessus. On construit la couche séparément via getAnnotations(),
        // et on ne l'ajoute au DOM que s'il y a vraiment un lien exploitable
        // (URL externe, ou destination/action interne) — inutile d'ajouter
        // une couche vide sur un PDF sans aucun lien.
        var annotationLayerEl = null;
        try{
          var annots = await page.getAnnotations();
          var linkAnnots = annots.filter(function(a){
            return a.subtype === 'Link' && (a.url || a.dest || a.action);
          });
          if(linkAnnots.length > 0){
            annotationLayerEl = document.createElement('div');
            annotationLayerEl.className = 'annotationLayer';
            // PDF.js dimensionne lui-même cette couche via son propre
            // setLayerDimensions() interne (appelé depuis .render() plus
            // bas), avec une largeur/hauteur en calc(var(--scale-factor) *
            // Npt) — PAS des pixels qu'on lui fixerait de l'extérieur. Sans
            // cette variable définie, la couche s'écroule à 0×0 (repéré en
            // testant : les liens existaient bien dans le DOM mais avec un
            // rect de taille nulle, donc jamais cliquables). --scale-factor
            // = CSS px par point PDF = exactement notre "scale" (mis à jour
            // au zoom dans _pdfApplyZoomSize, voir plus haut) ; les liens
            // eux-mêmes sont positionnés par PDF.js en POURCENTAGE de cette
            // couche, donc suivent automatiquement.
            annotationLayerEl.style.setProperty('--scale-factor', scale);
            wrap.appendChild(annotationLayerEl);
            var viewportCss = page.getViewport({ scale: scale, dontFlip: true }); // sans le dpr : coordonnées CSS, pas pixels device
            new window.pdfjsLib.AnnotationLayer({
              div: annotationLayerEl,
              accessibilityManager: null,
              annotationCanvasMap: null,
              page: page,
              viewport: viewportCss
            }).render({
              annotations: linkAnnots,
              linkService: _pdfLinkService,
              downloadManager: _pdfDownloadManagerStub,
              renderForms: false,
              imageResourcesPath: ''
            });
          }
        }catch(annErr){
          console.warn('[PDF] couche de liens échouée (page '+pageNum+'):', annErr);
        }

        var pageInfo = {
          page: page,
          canvas: canvas,
          wrap: wrap,
          cssWidth0: viewport.width / dpr,
          cssHeight0: viewport.height / dpr,
          baseScale: scale,
          renderTask: null,
          annotationLayerEl: annotationLayerEl,
          textLayerEl: textLayerEl
        };
        _pdfBuildPageSearchIndex(pageInfo); // texte concaténé + décalages, voir recherche plus haut
        _pdfPageInfos.push(pageInfo);
      }
      if(loader) loader.style.display = 'none';
      if(scrollEl) scrollEl.style.display = 'block';
      _pdfUpdatePageNavUI(); // affiche "1 / N" si le PDF a plusieurs pages
      _pdfUpdateSearchToggleVisibility();
    }catch(e){
      console.warn('[PDF] rendu échoué:', e);
      _pdfClose();
      showToast('Erreur d\'affichage du PDF : '+(e && e.message || e), 'err', 4000);
    }
  }

  function _pdfClose(){
    var overlay  = document.getElementById('pdfViewerOverlay');
    document.body.classList.remove('modal-open');
    // Le contenu (pages rendues, document PDF.js) n'est détruit qu'APRÈS
    // l'animation de fermeture — sinon la page se vide d'un coup pendant
    // que la fenêtre est encore visible en train de s'estomper.
    function teardown(){
      var scrollEl = document.getElementById('pdfViewerScroll');
      var pagesEl  = document.getElementById('pdfViewerPages');
      var loader   = document.getElementById('pdfViewerLoader');
      clearTimeout(_pdfSharpenTimer);
      _pdfCloseSearchBar();
      _pdfPageInfos.forEach(function(info){ if(info.renderTask) info.renderTask.cancel(); });
      _pdfPageInfos = [];
      if(scrollEl) scrollEl.style.display = 'none';
      if(pagesEl) pagesEl.innerHTML = '';
      if(pagesEl) pagesEl.classList.remove('pdf-pages-center-image');
      if(loader) loader.style.display = 'flex';
      if(overlay) overlay.style.display = 'none';
      _pdfZoom = 1;
      _pdfUpdateZoomUI();
      _pdfCurrentPage = 0;
      _pdfUpdatePageNavUI();
      if(_pdfCurrentDoc){ _pdfCurrentDoc.destroy(); _pdfCurrentDoc = null; }
      if(_pdfImageObjectUrl){ URL.revokeObjectURL(_pdfImageObjectUrl); _pdfImageObjectUrl = null; }
    }
    if(overlay && typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(overlay, teardown);
    } else {
      teardown();
    }
  }

  // Initialiser les listeners fermeture une seule fois
  (function(){
    var btnCl = document.getElementById('pdfViewerClose');
    if(btnCl) btnCl.addEventListener('click', _pdfClose);
  })();

  window._openPdfViewerWithBuffer = function(docName, fetchFn){
    var overlay  = document.getElementById('pdfViewerOverlay');
    var title    = document.getElementById('pdfViewerTitle');
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(title) title.textContent = docName || 'Document PDF';
    _pdfUpdateTypeIcon(docName);
    if(scrollEl) scrollEl.style.display = 'none';
    if(loader) loader.style.display = 'flex';
    if(overlay) overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    fetchFn(
      function onBuffer(ab){
        if(IMG_EXT_RE.test(docName||'')) _openImageViewer(ab, docName);
        else _openPdfCanvas(ab, docName);
      },
      function onError(e){
        _pdfClose();
        // TypeError = fetch() a échoué avant même d'obtenir une réponse
        // (serveur injoignable/déconnecté) — à distinguer d'un vrai code
        // HTTP renvoyé par un serveur qui répond (ex. 404, document
        // manquant), qui lui n'a rien à voir avec la connexion (retour
        // utilisateur : "dire au user de se connecter au serveur pour
        // pouvoir visionner un document").
        if(e instanceof TypeError){
          showToast('Serveur injoignable — connectez-vous à un serveur pour visionner ce document.', 'err', 5000);
        } else {
          showToast('Erreur PDF : '+(e&&e.message||e), 'err', 4000);
        }
      }
    );
  };

  window._openPdfViewer = function(pdfUrl, docName){
    var overlay  = document.getElementById('pdfViewerOverlay');
    var title    = document.getElementById('pdfViewerTitle');
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(title) title.textContent = docName || 'Document PDF';
    _pdfUpdateTypeIcon(docName);
    if(scrollEl) scrollEl.style.display = 'none';
    if(loader) loader.style.display = 'flex';
    if(overlay) overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    var h = typeof window.authHeaders === 'function' ? window.authHeaders() : {};
    delete h['Content-Type'];
    fetch(pdfUrl, { headers: h })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
      .then(function(ab){
        if(IMG_EXT_RE.test(docName||'')) _openImageViewer(ab, docName);
        else _openPdfCanvas(ab, docName);
      })
      .catch(function(e){ _pdfClose(); showToast('Erreur PDF : '+e.message, 'err', 4000); });
  };
  // ── Fin PDF Viewer ───────────────────────────────────────────────



