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

