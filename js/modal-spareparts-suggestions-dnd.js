  // ── Pièces de rechange — même mécanique que Produits suggérés ci-dessus
  // (champ + suggestions, puces, case à cocher, liaison réciproque côté
  // js/actions-save.js) — retour utilisateur : "ajouter une rubrique pièce de
  // rechange comme pour les suggestions". ──
  function _sparePartsRenderChips(){
    if(!fSparePartsChips) return;
    var prods = window.products || [];
    var canEdit = !!(window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin));
    fSparePartsChips.innerHTML = _sparePartsRefs.map(function(ref){
      var p = prods.find(function(x){ return x.ref === ref; });
      var visible = _sparePartsHidden.indexOf(ref) === -1;
      var thumb = p && p.photo
        ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" data-fallback="photo-icon">'
        : '<span class="sug-drop-nophoto"><i class="ti ti-photo-off"></i></span>';
      return '<div class="sug-linked-item'+(visible?'':' sug-linked-item-hidden')+'" data-ref="'+escapeHtml(ref)+'"'+(canEdit?' draggable="true" title="Glisser vers l\'autre liste pour déplacer"':'')+'>'
        + '<div class="sug-drop-thumb">'+thumb+'</div>'
        + '<div class="sug-drop-text">'
        +   '<div class="sug-drop-ref">'+escapeHtml(ref)+'</div>'
        +   (p && p.name ? '<div class="sug-drop-name">'+escapeHtml(p.name.substring(0,45))+'</div>' : '')
        + '</div>'
        + (canEdit ? '<input type="checkbox" class="sug-chip-visible" data-ref="'+escapeHtml(ref)+'" title="Afficher sur cette fiche"'+(visible?' checked':'')+'>' : '')
        + (canEdit ? '<button class="sug-chip-del" data-ref="'+escapeHtml(ref)+'" title="Retirer le lien">✕</button>' : '')
        + '</div>';
    }).join('');
    fSparePartsChips.querySelectorAll('.sug-chip-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref = btn.getAttribute('data-ref');
        _sparePartsRefs = _sparePartsRefs.filter(function(r){ return r !== ref; });
        _sparePartsHidden = _sparePartsHidden.filter(function(r){ return r !== ref; });
        _sparePartsRenderChips();
      });
    });
    fSparePartsChips.querySelectorAll('.sug-chip-visible').forEach(function(cb){
      cb.addEventListener('change', function(){
        var ref = cb.getAttribute('data-ref');
        if(cb.checked) _sparePartsHidden = _sparePartsHidden.filter(function(r){ return r !== ref; });
        else if(_sparePartsHidden.indexOf(ref) === -1) _sparePartsHidden.push(ref);
        _sparePartsRenderChips();
      });
    });
  }

  function _sparePartsSearch(q){
    if(!fSparePartsDrop) return;
    q = (q||'').trim().toLowerCase();
    if(!q){ fSparePartsDrop.style.display='none'; return; }
    var prods = window.products || [];
    var editingRef = document.getElementById('fRef') ? document.getElementById('fRef').value.trim() : '';
    var results = prods.filter(function(p){
      if(_sparePartsRefs.indexOf(p.ref) !== -1) return false; // déjà ajouté ici
      // Déjà lié comme suggestion : même règle que le glisser-déposer, voir
      // le commentaire équivalent dans _sugSearch.
      if(_sugRefs.indexOf(p.ref) !== -1) return false;
      if(p.ref === editingRef) return false; // pas soi-même
      return (p.ref||'').toLowerCase().indexOf(q) !== -1
          || (p.name||'').toLowerCase().indexOf(q) !== -1
          || (p.family||'').toLowerCase().indexOf(q) !== -1
          || (p.brand||'').toLowerCase().indexOf(q) !== -1
          || (p.series||'').toLowerCase().indexOf(q) !== -1;
    });
    if(!results.length){ fSparePartsDrop.style.display='none'; return; }
    fSparePartsDrop.innerHTML = results.map(function(p){
      var thumb = p.photo
        ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" data-fallback="hide-self">'
        : '<span class="sug-drop-nophoto"><i class="ti ti-photo-off"></i></span>';
      return '<div class="autocomplete-item sug-drop-item" data-ref="'+escapeHtml(p.ref)+'">'
        + '<div class="sug-drop-thumb">'+thumb+'</div>'
        + '<div class="sug-drop-text">'
        +   '<div class="sug-drop-ref">'+escapeHtml(p.ref)+'</div>'
        +   (p.name ? '<div class="sug-drop-name">'+escapeHtml(p.name.substring(0,45))+'</div>' : '')
        +   (p.brand ? '<div class="sug-drop-brand">'+escapeHtml(p.brand)+'</div>' : '')
        + '</div>'
        + '</div>';
    }).join('');
    fSparePartsDrop.style.display = 'block';
    fSparePartsDrop.querySelectorAll('.autocomplete-item').forEach(function(item){
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        var ref = item.getAttribute('data-ref');
        if(_sparePartsRefs.indexOf(ref) === -1) _sparePartsRefs.push(ref);
        _sparePartsRenderChips();
        fSparePartsSearch.value = '';
        fSparePartsDrop.style.display = 'none';
        fSparePartsSearch.blur(); // voir commentaire équivalent dans _sugSearch
      });
    });
  }

  if(fSparePartsSearch){
    fSparePartsSearch.addEventListener('input', function(){ _sparePartsSearch(this.value); });
    fSparePartsSearch.addEventListener('blur', function(){
      setTimeout(function(){ if(fSparePartsDrop) fSparePartsDrop.style.display='none'; }, 150);
    });
    _wireSearchEnterKey(fSparePartsSearch, fSparePartsDrop);
  }

  window._getSparePartsRefs = function(){ return _sparePartsRefs.slice(); };
  window._getSparePartsHidden = function(){ return _sparePartsHidden.slice(); };

  // ── Glisser-déposer une puce entre Suggestions et Pièces de rechange ──
  // (retour utilisateur : "pouvoir drag and drop les références de
  // suggestion vers pièce de rechange et vice versa") — déplace le lien
  // d'une liste à l'autre (retiré de la source, ajouté à la destination),
  // sans toucher à la liaison réciproque côté produit lié (elle sera mise à
  // jour normalement au prochain Enregistrer, comme n'importe quel ajout).
  var _linkFieldDefs = {
    suggestions: {
      getRefs: function(){ return _sugRefs; }, setRefs: function(v){ _sugRefs = v; },
      getHidden: function(){ return _sugHidden; }, setHidden: function(v){ _sugHidden = v; },
      renderChips: function(){ _sugRenderChips(); },
      chipsEl: function(){ return fSuggestionsChips; },
      noun: 'suggestions'
    },
    spareParts: {
      getRefs: function(){ return _sparePartsRefs; }, setRefs: function(v){ _sparePartsRefs = v; },
      getHidden: function(){ return _sparePartsHidden; }, setHidden: function(v){ _sparePartsHidden = v; },
      renderChips: function(){ _sparePartsRenderChips(); },
      chipsEl: function(){ return fSparePartsChips; },
      noun: 'pièces de rechange'
    }
  };
  function _moveChipBetweenFields(ref, fromKey, toKey){
    var fromDef = _linkFieldDefs[fromKey], toDef = _linkFieldDefs[toKey];
    if(!fromDef || !toDef) return;
    if(toDef.getRefs().indexOf(ref) !== -1){
      showToast('Déjà présent dans ' + toDef.noun + '.', 'warn', 2200);
      return;
    }
    fromDef.setRefs(fromDef.getRefs().filter(function(r){ return r !== ref; }));
    fromDef.setHidden(fromDef.getHidden().filter(function(r){ return r !== ref; }));
    toDef.setRefs(toDef.getRefs().concat([ref]));
    fromDef.renderChips();
    toDef.renderChips();
  }
  // Nettoyage des classes visuelles de glisser-déposer sur LES DEUX listes —
  // fonction partagée appelée à la fois par 'drop' (immédiatement, cas
  // normal) et 'dragend' (filet de sécurité pour un glisser annulé). Un
  // dépôt réussi déclenche _moveChipBetweenFields → renderChips() →
  // remplacement de l'innerHTML du conteneur SOURCE, qui détache la puce
  // glissée du DOM ; l'événement 'dragend' natif se déclenche ensuite sur
  // cette puce désormais orpheline et ne remonte donc plus (bubbling
  // impossible sans ancêtre) jusqu'au conteneur — sans ce nettoyage
  // immédiat dans 'drop', le contour/l'espace réservé restaient affichés en
  // continu après un dépôt réussi (retour utilisateur : "il reste l'écart
  // alors que ça devrait revenir à la normale").
  function _clearDragVisualState(){
    Object.keys(_linkFieldDefs).forEach(function(k){
      var el = _linkFieldDefs[k].chipsEl();
      if(el){ el.classList.remove('sug-chips-dragover'); el.classList.remove('drag-active'); }
    });
  }
  (function _wireChipDragDrop(){
    Object.keys(_linkFieldDefs).forEach(function(key){
      var container = _linkFieldDefs[key].chipsEl();
      if(!container) return;
      // Écouteurs délégués sur le CONTENEUR (stable) plutôt que sur chaque
      // puce (recréées à chaque rendu) — pas besoin de re-brancher après
      // chaque _sugRenderChips()/_sparePartsRenderChips().
      container.addEventListener('dragstart', function(e){
        var chip = e.target.closest && e.target.closest('.sug-linked-item');
        if(!chip){ e.preventDefault(); return; }
        var ref = chip.getAttribute('data-ref');
        if(!ref){ e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', JSON.stringify({ref:ref, from:key}));
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
        // Donne une hauteur mini aux DEUX listes (même vides) le temps du
        // glisser, pour qu'une liste vide reste une cible de dépôt valide —
        // seulement pendant le glisser, pour ne pas laisser ce vide en
        // permanence à l'écran (repéré en revoyant l'agencement de la
        // fenêtre : "produits suggérés"/"pièces de rechange" trop serrés).
        Object.keys(_linkFieldDefs).forEach(function(k){
          var el = _linkFieldDefs[k].chipsEl();
          if(el) el.classList.add('drag-active');
        });
      });
      container.addEventListener('dragend', function(e){
        var chip = e.target.closest && e.target.closest('.sug-linked-item');
        if(chip) chip.classList.remove('dragging');
        // Filet de sécurité pour un glisser ANNULÉ (déposé hors zone valide,
        // Échap, relâché hors fenêtre…) — le cas "dépôt réussi" est déjà
        // nettoyé immédiatement dans 'drop' ci-dessous.
        _clearDragVisualState();
      });
      container.addEventListener('dragover', function(e){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('sug-chips-dragover');
      });
      container.addEventListener('dragleave', function(e){
        // Ne pas restreindre à e.target===container : avec des puces
        // enfants, 'dragleave' se déclenche aussi en survolant une puce à
        // l'intérieur du conteneur, et la vérification stricte empêchait le
        // contour de disparaître dans ce cas (retour utilisateur : contour
        // qui reste affiché). Un léger scintillement en survolant les puces
        // est un compromis acceptable face à un contour bloqué en continu.
        container.classList.remove('sug-chips-dragover');
      });
      container.addEventListener('drop', function(e){
        e.preventDefault();
        var raw;
        try{ raw = JSON.parse(e.dataTransfer.getData('text/plain')); }catch(err){ _clearDragVisualState(); return; }
        if(!raw || !raw.ref || !raw.from || raw.from === key){ _clearDragVisualState(); return; } // déposé sur sa liste d'origine
        _moveChipBetweenFields(raw.ref, raw.from, key);
        // Nettoyer APRÈS le déplacement (pas avant) : _moveChipBetweenFields
        // peut re-render les conteneurs, mais ce sont toujours les mêmes
        // éléments DOM (chipsEl() renvoie une référence stable) — le retrait
        // de classe fonctionne quel que soit l'ordre, on le fait ici pour
        // rester au même endroit logique que le filet de sécurité 'dragend'.
        _clearDragVisualState();
      });
    });
  })();

