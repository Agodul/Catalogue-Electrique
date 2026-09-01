  // ── Logique suggestions autocomplete ────────────────────────────
  function _sugRenderChips(){
    if(!fSuggestionsChips) return;
    var prods = window.products || [];
    var canEdit = !!(window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin));
    fSuggestionsChips.innerHTML = _sugRefs.map(function(ref){
      var p = prods.find(function(x){ return x.ref === ref; });
      var visible = _sugHidden.indexOf(ref) === -1;
      var thumb = p && p.photo
        ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" data-fallback="photo-icon">'
        : '<span class="sug-drop-nophoto"><i class="ti ti-photo-off"></i></span>';
      // Case à cocher : affiche/masque cette suggestion SUR CETTE FICHE
      // uniquement, sans casser la liaison (réversible en un clic, contraire
      // au ✕ qui retire complètement le lien — voir commentaire sur
      // _sugHidden plus haut). Pour masquer côté produit lié, il faut la
      // décocher directement sur SA fiche (retour utilisateur).
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
    // Listeners suppression (retire complètement le lien de CETTE fiche)
    fSuggestionsChips.querySelectorAll('.sug-chip-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref = btn.getAttribute('data-ref');
        _sugRefs = _sugRefs.filter(function(r){ return r !== ref; });
        _sugHidden = _sugHidden.filter(function(r){ return r !== ref; });
        _sugRenderChips();
      });
    });
    // Listeners case à cocher (affiche/masque sans retirer le lien)
    fSuggestionsChips.querySelectorAll('.sug-chip-visible').forEach(function(cb){
      cb.addEventListener('change', function(){
        var ref = cb.getAttribute('data-ref');
        if(cb.checked) _sugHidden = _sugHidden.filter(function(r){ return r !== ref; });
        else if(_sugHidden.indexOf(ref) === -1) _sugHidden.push(ref);
        _sugRenderChips();
      });
    });
  }

  function _sugSearch(q){
    if(!fSuggestionsDrop) return;
    q = (q||'').trim().toLowerCase();
    if(!q){ fSuggestionsDrop.style.display='none'; return; }
    var prods = window.products || [];
    var editingRef = document.getElementById('fRef') ? document.getElementById('fRef').value.trim() : '';
    var results = prods.filter(function(p){
      if(_sugRefs.indexOf(p.ref) !== -1) return false; // déjà ajouté ici
      // Déjà lié comme pièce de rechange : une même réf n'a pas de sens
      // dans les deux listes à la fois (même règle que le glisser-déposer,
      // qui bloque déjà ce cas — étendue ici à l'ajout par recherche).
      if(_sparePartsRefs.indexOf(p.ref) !== -1) return false;
      if(p.ref === editingRef) return false; // pas soi-même
      return (p.ref||'').toLowerCase().indexOf(q) !== -1
          || (p.name||'').toLowerCase().indexOf(q) !== -1
          || (p.family||'').toLowerCase().indexOf(q) !== -1
          || (p.brand||'').toLowerCase().indexOf(q) !== -1
          || (p.series||'').toLowerCase().indexOf(q) !== -1;
    });
    if(!results.length){ fSuggestionsDrop.style.display='none'; return; }
    fSuggestionsDrop.innerHTML = results.map(function(p){
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
    fSuggestionsDrop.style.display = 'block';
    fSuggestionsDrop.querySelectorAll('.autocomplete-item').forEach(function(item){
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        var ref = item.getAttribute('data-ref');
        if(_sugRefs.indexOf(ref) === -1) _sugRefs.push(ref);
        _sugRenderChips();
        fSuggestionsSearch.value = '';
        fSuggestionsDrop.style.display = 'none';
        // e.preventDefault() ci-dessus (nécessaire pour que le clic sur la
        // suggestion s'exécute avant le blur natif du champ) a pour effet de
        // bord de laisser le champ focus après la sélection — visible par
        // son contour bleu qui restait affiché même une fois le champ vide
        // et l'action terminée (retour utilisateur, capture à l'appui).
        fSuggestionsSearch.blur();
      });
    });
  }

  // Touche Entrée : ajoute le résultat correspondant sans devoir cliquer
  // dessus à la souris/au tactile — sans ça, taper une réf exacte puis
  // Entrée (ou passer au champ suivant) ne l'ajoutait jamais silencieusement
  // (retour utilisateur : "je rentre une réf... j'enregistre... je réouvre...
  // le réf n'y est plus" — en fait jamais ajoutée du tout, la réf tapée
  // restait juste dans le champ de recherche). Résout la référence tapée
  // vers l'un des résultats actuellement affichés dans le menu déroulant :
  // correspondance exacte en priorité, sinon le seul résultat s'il n'y en a
  // qu'un (pas d'ambiguïté possible).
  function _wireSearchEnterKey(inputEl, dropEl){
    if(!inputEl || !dropEl) return;
    inputEl.addEventListener('keydown', function(e){
      if(e.key !== 'Enter') return;
      var q = (inputEl.value||'').trim();
      if(!q) return;
      var items = dropEl.querySelectorAll('.autocomplete-item[data-ref]');
      if(!items.length){
        // Rien à ajouter : soit le menu n'est pas ouvert (champ pas encore
        // tapé), soit aucun produit du catalogue ne correspond au texte —
        // avertir plutôt que laisser Entrée ne rien faire silencieusement
        // (retour utilisateur : une réf tapée disparaissait sans explication).
        showToast('Aucun produit du catalogue ne correspond — seules des références déjà présentes dans le catalogue peuvent être liées.', 'warn', 3500);
        return;
      }
      e.preventDefault();
      var qLower = q.toLowerCase();
      var target = null;
      items.forEach(function(item){
        if(item.getAttribute('data-ref').toLowerCase() === qLower) target = item;
      });
      if(!target && items.length === 1) target = items[0];
      if(target){
        target.dispatchEvent(new Event('mousedown', {bubbles:true}));
      } else {
        showToast('Plusieurs résultats correspondent — cliquez sur celui voulu dans la liste.', 'warn', 3000);
      }
    });
  }

  if(fSuggestionsSearch){
    fSuggestionsSearch.addEventListener('input', function(){ _sugSearch(this.value); });
    fSuggestionsSearch.addEventListener('blur', function(){
      setTimeout(function(){ if(fSuggestionsDrop) fSuggestionsDrop.style.display='none'; }, 150);
    });
    _wireSearchEnterKey(fSuggestionsSearch, fSuggestionsDrop);
  }

  // Exposer _sugRefs pour actions.js
  window._getSugRefs = function(){ return _sugRefs.slice(); };
  window._getSugHidden = function(){ return _sugHidden.slice(); };

