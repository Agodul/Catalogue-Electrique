"use strict";
// ── Répartition des remises par fournisseur ─────────────────────────────
// Retour utilisateur : "lorsqu'on clique sur remise moyen [...] une fenêtre
// qui s'ouvre avec la répartition des différentes remises fournisseur" —
// ouvre #supplierDiscountOverlay depuis la tuile "Remise moy." de l'accueil
// (voir js/actions-home.js, homeStats). Même méthode de calcul que cette
// tuile (renderHome()), juste groupée par fournisseur au lieu d'un chiffre
// global unique.
//
// Retour utilisateur (suite) : "lorsqu'on clique sur un des fournisseur on
// puisse voir les remis min et max ou autre si tu vois d'autre truc a
// afficher" — chaque ligne se déplie au clic (accordéon) sur remise
// min/médiane/max (le produit min/max est cliquable, pour ouvrir sa fiche)
// et la part du catalogue de ce fournisseur actuellement remisée.
(function(){
  var overlay  = document.getElementById('supplierDiscountOverlay');
  var closeBtn = document.getElementById('supplierDiscountClose');
  var body     = document.getElementById('supplierDiscountBody');
  if(!overlay || !body) return;

  var _rows = []; // dernier calcul, réutilisé par les gestionnaires de clic (accordéon, ouverture fiche)
  // Retour utilisateur : "faut revenir la ou etait le user lorsqu'il a
  // cliquer sur la reférence" — render() reconstruit tout le HTML à chaque
  // ouverture (classe .open perdue sinon) : on mémorise ici quelles lignes
  // étaient dépliées (clé = nom du fournisseur) et le défilement en cours,
  // pour les restaurer après un closeModal()/_openSupplierDiscountModal()
  // (voir le lien remise min/max plus bas, et closeView() dans
  // js/render-view-modal-close.js qui rouvre cette fenêtre).
  var _openKeys = {};
  var _lastScrollTop = 0;

  function parseAmount(raw){
    return parseFloat((raw||'').toString().replace(/[^0-9.,]/g,'').replace(',','.'));
  }

  function computeBySupplier(){
    var products = typeof window._getActiveDomainProducts === 'function' ? window._getActiveDomainProducts() : [];
    // clé normalisée (minuscules) -> { discounts:[{pct,ref,name,id}], labels:{casse exacte->nb} }
    var groups = {};
    products.forEach(function(p){
      // Même repli que _armoireGroupDraftBySupplier (js/armoireConfig-draft.js) :
      // fournisseur non renseigné → marque, puis libellé générique.
      var supplier = (p.supplier && p.supplier.trim()) ? p.supplier.trim() : (p.brand || 'Fournisseur non renseigné');
      // Retour utilisateur (constaté en testant) : même fournisseur saisi
      // avec des casses différentes ("Sonepar"/"SONEPAR") selon le produit —
      // regroupé ici sur une clé normalisée pour ne pas scinder un même
      // fournisseur en plusieurs lignes. Libellé affiché = la casse la plus
      // fréquente dans le groupe, pas forcément la première rencontrée.
      var key = supplier.toLowerCase();
      if(!groups[key]) groups[key] = { discounts: [], labels: {} };
      groups[key].labels[supplier] = (groups[key].labels[supplier] || 0) + 1;

      // Même calcul que la tuile "Remise moy." (js/actions-home.js,
      // renderHome()) : prix catalogue = premier élément de priceHistory.
      var origRaw = (Array.isArray(p.priceHistory) && p.priceHistory.length > 0) ? p.priceHistory[0].price : '';
      var orig = parseAmount(origRaw);
      var disc = parseAmount(p.price);
      if(!(orig > 0 && disc > 0 && orig > disc)) return;
      groups[key].discounts.push({ pct: (1 - disc/orig) * 100, ref: p.ref || '', name: p.name || '', id: p.id });
    });
    return Object.keys(groups).map(function(key){
      var g = groups[key];
      if(g.discounts.length === 0) return null; // ce fournisseur n'a aucun produit remisé actuellement
      var bestLabel = key, bestCount = -1;
      Object.keys(g.labels).forEach(function(label){
        if(g.labels[label] > bestCount){ bestCount = g.labels[label]; bestLabel = label; }
      });
      var sorted = g.discounts.slice().sort(function(a, b){ return a.pct - b.pct; });
      var sum = sorted.reduce(function(s, d){ return s + d.pct; }, 0);
      var mid = Math.floor(sorted.length / 2);
      var median = sorted.length % 2 ? sorted[mid].pct : (sorted[mid - 1].pct + sorted[mid].pct) / 2;
      return {
        name: bestLabel,
        avg: sum / sorted.length,
        count: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: median
      };
    }).filter(Boolean).sort(function(a, b){ return b.avg - a.avg; });
  }

  // Ligne détail accordéon (remise min/médiane/max). Les lignes min/max sont
  // cliquables — ouvrent la fiche du produit concerné (ferme cette fenêtre
  // d'abord, même principe que n'importe quel lien "voir le produit"
  // ailleurs dans l'appli).
  function detailRowHtml(label, pct, product){
    var pctHtml = '<span class="supplier-discount-detail-pct">-'+Math.round(pct)+'%</span>';
    if(!product || !product.ref){
      return '<div class="supplier-discount-detail-item"><span>'+label+'</span>'+pctHtml+'</div>';
    }
    return '<div class="supplier-discount-detail-item supplier-discount-detail-item-link" data-product-id="'+escapeHtml(product.id || '')+'">' +
        '<span>'+label+' <span class="supplier-discount-detail-ref">— '+escapeHtml(product.ref)+(product.name ? ' · '+escapeHtml(product.name) : '')+'</span></span>' +
        pctHtml +
      '</div>';
  }

  function render(){
    _rows = computeBySupplier();
    if(_rows.length === 0){
      body.innerHTML = '<div style="padding:24px 4px;text-align:center;color:var(--ink-soft);font-size:13px;font-style:italic;">Aucun produit avec remise actuellement.</div>';
      return;
    }
    body.innerHTML = _rows.map(function(r, idx){
      var pct = Math.round(r.avg);
      // Largeur de barre = pourcentage réel (pas relatif au max affiché) :
      // deux fournisseurs à -50%/-52% doivent avoir des barres quasi
      // identiques, pas l'une pleine et l'autre presque pleine.
      var barWidth = Math.min(100, Math.max(2, pct));
      return '<div class="supplier-discount-row" data-idx="'+idx+'">' +
          '<div class="supplier-discount-row-top">' +
            '<span class="supplier-discount-name"><i class="ti ti-chevron-right supplier-discount-chevron" aria-hidden="true"></i>'+escapeHtml(r.name)+'</span>' +
            '<span class="supplier-discount-pct">-'+pct+'%</span>' +
          '</div>' +
          '<div class="supplier-discount-bar-track"><div class="supplier-discount-bar-fill" style="width:'+barWidth+'%"></div></div>' +
          '<div class="supplier-discount-count">'+r.count+(r.count>1?' produits remisés':' produit remisé')+'</div>' +
          '<div class="supplier-discount-detail"><div class="supplier-discount-detail-inner">' +
            detailRowHtml('Remise minimale', r.min.pct, r.min) +
            detailRowHtml('Remise médiane', r.median, null) +
            detailRowHtml('Remise maximale', r.max.pct, r.max) +
          '</div></div>' +
        '</div>';
    }).join('');

    body.querySelectorAll('.supplier-discount-row').forEach(function(rowEl, idx){
      var r = _rows[idx];
      if(_openKeys[r.name]) rowEl.classList.add('open'); // restaure l'état déplié d'avant fermeture
      rowEl.querySelector('.supplier-discount-row-top').addEventListener('click', function(){
        rowEl.classList.toggle('open');
        _openKeys[r.name] = rowEl.classList.contains('open');
      });
      rowEl.querySelectorAll('.supplier-discount-detail-item-link').forEach(function(linkEl){
        linkEl.addEventListener('click', function(e){
          e.stopPropagation(); // ne pas re-basculer l'accordéon en plus d'ouvrir la fiche
          var id = linkEl.getAttribute('data-product-id');
          if(!id || typeof openView !== 'function') return;
          // Retour utilisateur : "lorsqu'on clique sur la ref qui est lister
          // et qu'on ferme la fiche produit faudrait revenir sur la fenetre
          // précédent [...] faut revenir la ou etait le user lorsqu'il a
          // cliquer sur la reférence" — consommé dans closeView() (js/render-
          // view-modal-close.js), remis à false par vmEditBtn/vmDeleteBtn
          // (même fichier) pour ne PAS rouvrir cette fenêtre quand la fiche se
          // ferme pour ouvrir le formulaire d'édition ou supprimer le produit
          // (fermeture de transition, pas une vraie fermeture par
          // l'utilisateur). _openKeys/_lastScrollTop ci-dessus restaurent
          // l'accordéon déplié + le défilement exacts d'avant ce clic.
          _lastScrollTop = body.scrollTop;
          window._viewReturnToSupplierDiscount = true;
          closeModal(true); // immédiat — voir le commentaire sur closeModal() plus bas
          openView(id);
        });
      });
    });
  }

  window._openSupplierDiscountModal = function(){
    render();
    body.scrollTop = _lastScrollTop; // restaure la position de défilement d'avant fermeture (voir render() plus haut)
    overlay.style.display = 'flex';
    overlay.offsetHeight; // reflow forcé avant .show, même technique que les autres overlays (voir _compareOpen)
    overlay.classList.add('show');
    document.body.classList.add('modal-open');
  };

  // immediate (optionnel) : masque sans l'animation de fermeture habituelle.
  // Retour utilisateur : "lorsque je clique sur la reference l'ouverture [de
  // la fiche produit] se fait derriere la fenetre Remises par fournisseur" —
  // la fermeture animée (~260ms, voir _closeOverlayAnimated) laisse cette
  // fenêtre bel et bien affichée (display:flex) pendant que la fiche produit
  // s'ouvre PAR-DESSUS elle dans le même instant (lien remise min/max
  // ci-dessus) ; avec son z-index --z-panel (voir css/styles.css), elle
  // passait devant la fiche tant que cette animation jouait. Masquer
  // immédiatement (pas de fondu) avant d'ouvrir la fiche élimine complètement
  // ce chevauchement plutôt que de juste le rendre moins visible.
  function closeModal(immediate){
    overlay.classList.remove('show');
    // Pas de cas d'empilement connu pour cette fenêtre (ouverte uniquement
    // depuis l'accueil, jamais par-dessus une autre), mais même garde-fou
    // que les autres fenêtres de l'appli par cohérence/sécurité future —
    // voir window._isOtherOverlayOpen, js/init.js.
    if(typeof window._isOtherOverlayOpen !== 'function' || !window._isOtherOverlayOpen('supplierDiscountOverlay')){
      document.body.classList.remove('modal-open');
    }
    if(immediate || typeof window._closeOverlayAnimated !== 'function'){
      overlay.style.display = 'none';
    } else {
      window._closeOverlayAnimated(overlay, function(){ overlay.style.display = 'none'; });
    }
  }
  if(closeBtn) closeBtn.addEventListener('click', function(){
    // Retour utilisateur : "lorsque je clique sur la croix [...] faut la
    // remettre a zero" — contrairement à la fermeture de transition vers une
    // fiche produit (lien remise min/max, qui doit au contraire restaurer cet
    // état au retour — voir _openKeys/_lastScrollTop plus haut), une vraie
    // fermeture par la croix repart d'un accordéon entièrement replié et
    // d'un défilement remis en haut à la prochaine ouverture.
    _openKeys = {};
    _lastScrollTop = 0;
    closeModal();
  });
})();
