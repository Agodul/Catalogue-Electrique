  // ---------- Search / filter ----------
  var _searchRenderDebounced = debounce(function(){ render(true); }, 180);
  searchInputEl.addEventListener('input', function(){
    // Si on est sur la home et qu'on tape, basculer vers le catalogue
    var homePage = document.getElementById('homePage');
    if(homePage && !homePage.classList.contains('hidden') && searchInputEl.value.trim().length > 0){
      showCatalogueAll();
    }
    _searchRenderDebounced();
  });
  brandFilterEl.addEventListener('change', function(){ render(); });
  familyFilterEl.addEventListener('change', function(){ render(); });
  seriesFilterEl.addEventListener('change', function(){ render(); });

  // ── Filtres case à cocher : 3DEXPERIENCE / Standard (retour utilisateur)
  // .active pilote l'apparence (voir css/styles.css, .filter-toggle-chip),
  // posé sur le <label> plutôt que la case elle-même puisque c'est LUI qui
  // porte .sort-price-btn.
  var filter3DEl = document.getElementById('filter3DAvailable');
  var filterEssentialEl = document.getElementById('filterEssential');
  // Retour utilisateur : "ajouter un bouton pour les référence qui sont
  // dans la mallette de test comme pour standard" — même mécanique que
  // filter3DEl/filterEssentialEl juste au-dessus.
  var filterSpiLabsEl = document.getElementById('filterSpiLabs');
  if(filter3DEl) filter3DEl.addEventListener('change', function(){
    document.getElementById('filter3DWrap').classList.toggle('active', filter3DEl.checked);
    if(typeof window._syncBnFilterBadge === 'function') window._syncBnFilterBadge();
    render();
  });
  if(filterEssentialEl) filterEssentialEl.addEventListener('change', function(){
    document.getElementById('filterEssentialWrap').classList.toggle('active', filterEssentialEl.checked);
    if(typeof window._syncBnFilterBadge === 'function') window._syncBnFilterBadge();
    render();
  });
  if(filterSpiLabsEl) filterSpiLabsEl.addEventListener('change', function(){
    document.getElementById('filterSpiLabsWrap').classList.toggle('active', filterSpiLabsEl.checked);
    if(typeof window._syncBnFilterBadge === 'function') window._syncBnFilterBadge();
    render();
  });

  // ── Tri par prix ──────────────────────────────────────────────
  window._priceSort = null; // null | 'asc' | 'desc'
  var sortPriceBtn  = document.getElementById('sortPriceBtn');
  var sortPriceIcon = document.getElementById('sortPriceIcon');
  // Partagé avec le bottom-sheet filtres mobile (même état, même rendu)
  window._setPriceSort = function(mode){
    window._priceSort = mode || null;
    if(sortPriceBtn) sortPriceBtn.classList.remove('active-asc','active-desc');
    if(mode === 'asc'){
      if(sortPriceBtn) sortPriceBtn.classList.add('active-asc');
      if(sortPriceIcon) sortPriceIcon.className = 'ti ti-sort-ascending sort-icon';
    } else if(mode === 'desc'){
      if(sortPriceBtn) sortPriceBtn.classList.add('active-desc');
      if(sortPriceIcon) sortPriceIcon.className = 'ti ti-sort-descending sort-icon';
    } else {
      if(sortPriceIcon) sortPriceIcon.className = 'ti ti-arrows-sort sort-icon';
    }
  };
  if(sortPriceBtn){
    sortPriceBtn.addEventListener('click', function(){
      var next = window._priceSort === null ? 'asc' : window._priceSort === 'asc' ? 'desc' : null;
      window._setPriceSort(next);
      _lastRenderKey = ''; render();
    });
  }

  // Utilitaire debounce pour le filtre prix
  function debounce(fn, delay){
    var t;
    return function(){ clearTimeout(t); t = setTimeout(fn, delay); };
  }

  document.querySelectorAll('.grp-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      groupBy = btn.getAttribute('data-group');
      document.querySelectorAll('.grp-btn').forEach(function(b){
        b.classList.toggle('active', b===btn);
      });
      render();
    });
  });

