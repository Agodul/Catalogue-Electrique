  // ── Parcourir le catalogue par catégorie (sélection multiple → Enregistrer) ──
  // Alternative au champ de recherche ci-dessus : navigation par famille au
  // lieu de taper une réf/nom (retour utilisateur). Sélection en 2 temps —
  // les clics dans la fenêtre construisent une liste TEMPORAIRE
  // (_sugPickerSelected), qui n'est ajoutée à la liste réelle qu'au clic sur
  // "Enregistrer" (comme demandé : "une fois la liste finie on clique sur
  // enregistrer et ça ajoute au produit suggéré"). Fenêtre PARTAGÉE entre
  // "Produits suggérés" et "Pièces de rechange" (retour utilisateur : "une
  // rubrique pièces de rechange comme pour les suggestions") — _sugPickerTarget
  // détermine sur quelle liste elle agit à un instant donné.
  var btnSugBrowse        = document.getElementById('btnSugBrowse');
  var btnSparePartsBrowse = document.getElementById('btnSparePartsBrowse');
  var sugPickerOverlay   = document.getElementById('sugPickerOverlay');
  var sugPickerTitleEl   = document.getElementById('sugPickerTitle');
  var sugPickerList      = document.getElementById('sugPickerList');
  var sugPickerSearch    = document.getElementById('sugPickerSearch');
  var sugPickerCount     = document.getElementById('sugPickerCount');
  var sugPickerCloseBtn  = document.getElementById('sugPickerCloseBtn');
  var sugPickerCancelBtn = document.getElementById('sugPickerCancelBtn');
  var sugPickerSaveBtn   = document.getElementById('sugPickerSaveBtn');
  var _sugPickerSelected = []; // refs cochés dans CETTE session de la fenêtre, pas encore appliqués
  var _sugPickerTarget = 'suggestions'; // 'suggestions' | 'spareParts'
  var _sugPickerDefs = {
    suggestions: {
      title: '<i class="ti ti-folder-open"></i> Parcourir le catalogue — Produits suggérés',
      noun: 'suggestions',
      getRefs: function(){ return _sugRefs; },
      addRefs: function(refs){ refs.forEach(function(r){ if(_sugRefs.indexOf(r)===-1) _sugRefs.push(r); }); },
      renderChips: function(){ _sugRenderChips(); }
    },
    spareParts: {
      title: '<i class="ti ti-folder-open"></i> Parcourir le catalogue — Pièces de rechange',
      noun: 'pièces de rechange',
      getRefs: function(){ return _sparePartsRefs; },
      addRefs: function(refs){ refs.forEach(function(r){ if(_sparePartsRefs.indexOf(r)===-1) _sparePartsRefs.push(r); }); },
      renderChips: function(){ _sparePartsRenderChips(); }
    }
  };

  function _sugPickerUpdateCount(){
    if(!sugPickerCount) return;
    var n = _sugPickerSelected.length;
    sugPickerCount.textContent = n + ' sélectionné' + (n>1?'s':'');
  }

  function _sugPickerToggle(ref, itemEl){
    var idx = _sugPickerSelected.indexOf(ref);
    if(idx !== -1){
      _sugPickerSelected.splice(idx, 1);
      itemEl.classList.remove('selected');
      var chk = itemEl.querySelector('.sug-picker-item-check');
      if(chk) chk.parentNode.removeChild(chk);
    } else {
      _sugPickerSelected.push(ref);
      itemEl.classList.add('selected');
      itemEl.insertAdjacentHTML('beforeend', '<i class="ti ti-check sug-picker-item-check"></i>');
    }
    _sugPickerUpdateCount();
  }

  // Catégories repliées par défaut (retour utilisateur) — état conservé
  // pendant que la fenêtre reste ouverte, réinitialisé (tout replié) à
  // chaque ouverture. Pendant une recherche, les catégories avec résultat
  // sont dépliées automatiquement pour rester utilisables, sans modifier
  // cet état mémorisé (qui reprend dès que le filtre est vidé).
  var _sugPickerOpenGroups = {};
  function _sugPickerRender(q){
    if(!sugPickerList) return;
    var def = _sugPickerDefs[_sugPickerTarget];
    var currentRefs = def.getRefs();
    // Exclut aussi ce qui est déjà lié dans l'AUTRE liste — une même réf
    // n'a pas de sens à la fois en suggestion et en pièce de rechange
    // (même règle que le glisser-déposer et la recherche directe).
    var otherKey = _sugPickerTarget === 'suggestions' ? 'spareParts' : 'suggestions';
    var otherRefs = _sugPickerDefs[otherKey].getRefs();
    var prods = window.products || [];
    var editingRef = fRef ? fRef.value.trim() : '';
    q = (q||'').trim().toLowerCase();
    var visible = prods.filter(function(p){
      if(p.ref === editingRef) return false; // pas soi-même
      if(currentRefs.indexOf(p.ref) !== -1) return false; // déjà lié ici
      if(otherRefs.indexOf(p.ref) !== -1) return false; // déjà lié dans l'autre liste
      if(!q) return true;
      return (p.ref||'').toLowerCase().indexOf(q) !== -1
          || (p.name||'').toLowerCase().indexOf(q) !== -1
          || (p.brand||'').toLowerCase().indexOf(q) !== -1
          || (p.family||'').toLowerCase().indexOf(q) !== -1;
    });
    if(!visible.length){
      sugPickerList.innerHTML = '<div class="empty-state" style="padding:30px 10px;"><strong>Aucun résultat</strong></div>';
      return;
    }
    var grouped = groupByField(visible, 'family', 'Sans famille');
    sugPickerList.innerHTML = grouped.order.map(function(fam){
      var items = grouped.groups[fam];
      var open = !!q || !!_sugPickerOpenGroups[fam];
      return '<div class="sug-picker-group'+(open?' open':'')+'" data-fam="'+escapeHtml(fam)+'">'
        + '<div class="sug-picker-group-title">'
        +   '<i class="ti ti-chevron-right sug-picker-group-chevron"></i>'
        +   escapeHtml(fam)+' <span class="sug-picker-group-count">('+items.length+')</span>'
        + '</div>'
        + '<div class="sug-picker-grid">'
        + items.map(function(p){
            var selected = _sugPickerSelected.indexOf(p.ref) !== -1;
            var thumb = p.photo
              ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" data-fallback="hide-self">'
              : '<span class="sug-drop-nophoto"><i class="ti ti-photo-off"></i></span>';
            return '<div class="sug-picker-item'+(selected?' selected':'')+'" data-ref="'+escapeHtml(p.ref)+'">'
              + '<div class="sug-drop-thumb">'+thumb+'</div>'
              + '<div class="sug-drop-text">'
              +   '<div class="sug-drop-ref">'+escapeHtml(p.ref)+'</div>'
              +   (p.name ? '<div class="sug-drop-name">'+escapeHtml(p.name.substring(0,40))+'</div>' : '')
              + '</div>'
              + (selected ? '<i class="ti ti-check sug-picker-item-check"></i>' : '')
              + '</div>';
          }).join('')
        + '</div></div>';
    }).join('');
    sugPickerList.querySelectorAll('.sug-picker-item').forEach(function(el){
      el.addEventListener('click', function(){
        _sugPickerToggle(el.getAttribute('data-ref'), el);
      });
    });
    sugPickerList.querySelectorAll('.sug-picker-group-title').forEach(function(el){
      el.addEventListener('click', function(){
        var groupEl = el.parentNode;
        var fam = groupEl.getAttribute('data-fam');
        var nowOpen = !groupEl.classList.contains('open');
        groupEl.classList.toggle('open', nowOpen);
        _sugPickerOpenGroups[fam] = nowOpen;
      });
    });
  }

  function _sugPickerOpen(target){
    if(!sugPickerOverlay) return;
    _sugPickerTarget = (target === 'spareParts') ? 'spareParts' : 'suggestions';
    if(sugPickerTitleEl) sugPickerTitleEl.innerHTML = _sugPickerDefs[_sugPickerTarget].title;
    _sugPickerSelected = [];
    _sugPickerOpenGroups = {};
    if(sugPickerSearch) sugPickerSearch.value = '';
    _sugPickerRender('');
    _sugPickerUpdateCount();
    sugPickerOverlay.style.display = 'flex';
    document.body.classList.add('modal-open');
  }
  function _sugPickerClose(){
    if(!sugPickerOverlay) return;
    document.body.classList.remove('modal-open');
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(sugPickerOverlay, function(){ sugPickerOverlay.style.display = 'none'; });
    } else {
      sugPickerOverlay.style.display = 'none';
    }
  }
  // Exposée en global : appelée par _authCloseSensitiveUI (js/auth.js) pour
  // fermer aussi cette fenêtre lors d'une déconnexion (forcée ou manuelle).
  window._sugPickerClose = _sugPickerClose;

  if(btnSugBrowse)        btnSugBrowse.addEventListener('click', function(){ _sugPickerOpen('suggestions'); });
  if(btnSparePartsBrowse) btnSparePartsBrowse.addEventListener('click', function(){ _sugPickerOpen('spareParts'); });
  if(sugPickerCloseBtn)  sugPickerCloseBtn.addEventListener('click', _sugPickerClose);
  if(sugPickerCancelBtn) sugPickerCancelBtn.addEventListener('click', _sugPickerClose);
  if(sugPickerSearch)    sugPickerSearch.addEventListener('input', function(){ _sugPickerRender(this.value); });
  if(sugPickerSaveBtn)   sugPickerSaveBtn.addEventListener('click', function(){
    var def = _sugPickerDefs[_sugPickerTarget];
    def.addRefs(_sugPickerSelected);
    _sugPickerSelected = [];
    def.renderChips();
    _sugPickerClose();
  });

