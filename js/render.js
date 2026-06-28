// ============================================================
// render.js — Rendu cartes, home, catalogue
// ============================================================

function render(){
    _cardIdx = 0;
    refreshFilterCache();
    var allBrands   = _filterCache.brands;
    var allFamilies = _filterCache.families;
    var allSeries   = _filterCache.series;
    var currentBrandFilter = brandFilterEl.value;
    // Si un filtre famille/série est actif, ne proposer que les marques présentes dans ces produits
    var activeFamilyFilter = familyFilterEl.value;
    var activeSeriesFilter = seriesFilterEl.value;
    var brandsForFilter = allBrands;
    if(activeFamilyFilter || activeSeriesFilter){
      var brandsInScope = {};
      products.forEach(function(p){
        var matchFamily = !activeFamilyFilter || (p.family||'') === activeFamilyFilter;
        var matchSeries = !activeSeriesFilter || (p.series||'') === activeSeriesFilter;
        if(matchFamily && matchSeries && p.brand) brandsInScope[p.brand] = true;
      });
      brandsForFilter = allBrands.filter(function(b){ return brandsInScope[b]; });
    }
    brandFilterEl.innerHTML = '<option value="">Toutes les marques</option>' + brandsForFilter.map(function(b){
      return '<option value="'+escapeHtml(b)+'">'+escapeHtml(b)+'</option>';
    }).join('');
    brandFilterEl.value = brandsForFilter.indexOf(currentBrandFilter) !== -1 ? currentBrandFilter : '';

    var currentFamilyFilter = familyFilterEl.value;
    // Filtrer les familles selon la marque active
    var activeBrandForFamily = brandFilterEl.value;
    var familiesForFilter = allFamilies;
    if(activeBrandForFamily){
      var familiesInScope = {};
      products.forEach(function(p){
        if((p.brand||'') === activeBrandForFamily && p.family) familiesInScope[p.family] = true;
      });
      familiesForFilter = allFamilies.filter(function(f){ return familiesInScope[f]; });
    }
    familyFilterEl.innerHTML = '<option value="">Toutes les familles</option>' + familiesForFilter.map(function(f){
      return '<option value="'+escapeHtml(f)+'">'+escapeHtml(f)+'</option>';
    }).join('');
    familyFilterEl.value = familiesForFilter.indexOf(currentFamilyFilter) !== -1 ? currentFamilyFilter : '';

    var currentSeriesFilter = seriesFilterEl.value;
    // Lire la marque APRÈS rebuild du select (peut avoir changé)
    var activeBrandFilter = brandFilterEl.value;
    // Ne proposer que les séries présentes dans le contexte famille/marque actif
    var seriesForFilter = allSeries;
    if(activeFamilyFilter || activeBrandFilter){
      var seriesInScope = {};
      products.forEach(function(p){
        var matchFamily = !activeFamilyFilter || (p.family||'') === activeFamilyFilter;
        var matchBrand  = !activeBrandFilter  || (p.brand||'')  === activeBrandFilter;
        if(matchFamily && matchBrand && p.series) seriesInScope[p.series] = true;
      });
      seriesForFilter = allSeries.filter(function(s){ return seriesInScope[s]; });
    }
    seriesFilterEl.innerHTML = '<option value="">Toutes les séries</option>' + seriesForFilter.map(function(s){
      return '<option value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>';
    }).join('');
    seriesFilterEl.value = seriesForFilter.indexOf(currentSeriesFilter) !== -1 ? currentSeriesFilter : '';

    // brandListEl supprimé }).join('');
    // Datalist fournisseurs
    // supplierListEl supprimé }).join('');
    // familyListEl supprimé }).join('');
    // seriesListEl supprimé }).join('');

    var filtered = getFilteredProducts();
    var hdrChip = document.getElementById('hdrCountChip');
    if(hdrChip) hdrChip.textContent = filtered.length + (filtered.length > 1 ? ' produits' : ' produit');

    if(products.length === 0){
      contentEl.innerHTML = '<div class="empty-state"><strong>Le catalogue est vide</strong>Ajoutez votre premier produit avec le bouton « Ajouter un produit ».</div>';
      return;
    }
    if(filtered.length === 0){
      contentEl.innerHTML = '<div class="empty-state"><strong>Aucun résultat</strong>Essayez une autre recherche ou un autre filtre.</div>';
      return;
    }

    var hasSearch = !!normalizeSearch(searchInputEl.value);
    var html = '';

    if(hasSearch){
      // ── Mode recherche : liste plate triée par score, sans groupement ──
      // Les produits sont déjà triés par pertinence dans getFilteredProducts()
      html += '<div class="brand-group">';
      html += '<div class="brand-heading"><h2>Résultats</h2><span class="tally sans">'+filtered.length+(filtered.length>1?' références':' référence')+'</span></div>';
      html += '<div class="grid">';
      filtered.forEach(function(p){ html += renderCard(p); });
      html += '</div></div>';
    } else {
      // ── Mode normal : groupement par marque/famille/série ──
      var fieldMap = {brand:'brand', family:'family', series:'series'};
      var fallbackMap = {brand:'(Sans marque)', family:'(Sans famille)', series:'(Sans série)'};
      var g = groupByField(filtered, fieldMap[groupBy], fallbackMap[groupBy], false);
      g.order.forEach(function(groupName){
        var items = g.groups[groupName];
        html += '<div class="brand-group">';
        html += '<div class="brand-heading"><h2>'+escapeHtml(groupName)+'</h2><span class="tally sans">'+items.length+(items.length>1?' références':' référence')+'</span></div>';
        html += '<div class="grid">';
        items.forEach(function(p){ html += renderCard(p); });
        html += '</div></div>';
      });
    }
    contentEl.innerHTML = html;

    // Appliquer la classe de vue sur chaque grille
    contentEl.querySelectorAll('.grid').forEach(function(g){
    });

    // Animation 1 & 6 — délai progressif via style inline déjà dans le HTML

    // Clic sur la carte → ouvre la vue de consultation
    contentEl.querySelectorAll('[data-view]').forEach(function(card){
      card.addEventListener('click', function(e){
        // Ne pas ouvrir si on a cliqué sur le bouton ⓘ lui-même
        openView(card.getAttribute('data-view'));
      });
    });

    // Clic sur le bouton ⓘ de la carte → ouvre directement la vue puis le menu

  }

  // ---------- Modale de consultation ----------
  var viewOverlay  = document.getElementById('viewOverlay');
  var vmPhoto      = document.getElementById('vmPhoto');
  var vmRef        = document.getElementById('vmRef');
  var vmName       = document.getElementById('vmName');
  var vmTags       = document.getElementById('vmTags');
  var vmMeta       = document.getElementById('vmMeta');
  var vmDesc       = document.getElementById('vmDesc');
  var vmPrice      = document.getElementById('vmPrice');
  var vmPriceHistory = document.getElementById('vmPriceHistory');
  var vmInfoBtn    = document.getElementById('vmInfoBtn');
  var vmCloseBtn   = document.getElementById('vmCloseBtn');
  var vmInfoMenu   = document.getElementById('vmInfoMenu');
  var viewingId    = null;

  function buildPriceHistoryReadonly(product){
    if(!product || !Array.isArray(product.priceHistory) || product.priceHistory.length === 0) return '';
    var entries = product.priceHistory.map(function(h){ return {price:h.price, date:h.date}; });
    entries.push({price:product.price||'', date:null, current:true});
    var rows = '';
    var firstDate = entries[0].date ? new Date(entries[0].date).toLocaleDateString('fr-FR') : 'Premier prix';
    rows += '<tr><td class="ph-date">'+escapeHtml(firstDate)+'</td><td class="ph-price">'+escapeHtml(entries[0].price||'—')+'</td><td class="ph-delta"></td></tr>';
    for(var i=1;i<entries.length;i++){
      var prev = parsePriceNumber(entries[i-1].price);
      var cur  = parsePriceNumber(entries[i].price);
      var deltaHtml = '';
      if(prev!==null && cur!==null && prev!==0){
        var pct = ((cur-prev)/prev)*100;
        var sign = pct>=0 ? '+' : '';
        var cls  = pct>0 ? 'up' : (pct<0 ? 'down' : '');
        deltaHtml = '<span class="ph-delta '+cls+'">'+sign+pct.toFixed(1)+' %</span>';
      }
      var dl = entries[i].current ? 'Prix actuel' : (entries[i].date ? new Date(entries[i].date).toLocaleDateString('fr-FR') : '—');
      rows += '<tr'+(entries[i].current?' class="ph-current"':'')+'>'+
        '<td class="ph-date">'+escapeHtml(dl)+'</td>'+
        '<td class="ph-price">'+escapeHtml(entries[i].price||'—')+'</td>'+
        '<td class="ph-delta">'+deltaHtml+'</td>'+
      '</tr>';
    }
    return '<div class="ph-title" style="margin-top:0">Historique des prix</div>'+
           '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'+rows+'</table>';
  }

  function openView(id){
    var p = products.find(function(x){return x.id===id;});
    if(!p) return;
    viewingId = id;
    vmInfoMenu.classList.remove('open');

    // Photo
    if(p.photo){
      vmPhoto.innerHTML = '<img src="'+escapeHtml(p.photo)+'" alt="'+escapeHtml(p.name||p.ref)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.innerHTML=\'<span class=&quot;ph-placeholder&quot;>Image indisponible</span>\'">';
    }else{
      vmPhoto.innerHTML = '<span class="ph-placeholder">Pas de photo</span>';
    }

    vmRef.textContent  = p.brand ? p.brand+' — '+( p.ref||'') : (p.ref||'');
    vmName.textContent = p.name || '(Sans nom)';

    // Tags
    // Tags stored for search only; not shown in the product detail modal.
    vmTags.innerHTML = '';
    vmTags.style.display = 'none';

    // Méta-infos
    var metaItems = [];
    if(p.brand)    metaItems.push(['Marque',     p.brand]);
    if(p.ref)      metaItems.push(['Référence',  p.ref]);
    if(p.family)   metaItems.push(['Famille',    p.family]);
    if(p.series)   metaItems.push(['Série',      p.series]);
    if(p.supplier) metaItems.push(['Fournisseur',p.supplier]);
    if(p.available3DX) metaItems.push(['3DEXPERIENCE', '<span class="three-d-badge" title="Disponible dans la 3DEXPERIENCE"><img src="./img_3dx.png" alt="3DEX" /></span>']);
    if(p.url)      metaItems.push(['URL',        p.url]);
    vmMeta.innerHTML = metaItems.map(function(m){
      var val;
      if(m[0] === 'URL'){
        val = '<a href="'+escapeHtml(m[1])+'" target="_blank" style="color:var(--copper-deep)">Ouvrir la page</a>';
      } else if(m[0] === '3DEXPERIENCE'){
        val = p.available3DXLink
          ? '<a href="'+escapeHtml(p.available3DXLink)+'" target="_blank" rel="noopener noreferrer" class="three-d-badge" title="Disponible dans la 3DEXPERIENCE">'+m[1]+'</a>'
          : m[1];
      } else {
        val = '<span>'+escapeHtml(m[1])+'</span>';
      }
      return '<div class="vm-meta-item"><label>'+escapeHtml(m[0])+'</label>'+val+'</div>';
    }).join('');
    vmMeta.style.display = metaItems.length ? '' : 'none';

    // Description avec troncature JS sur mobile
    var fullDesc = p.desc || '';
    var isMobile = window.innerWidth <= 640;
    var CHAR_LIMIT = 160;
    vmDesc.style.display = fullDesc ? '' : 'none';

    if(isMobile && fullDesc.length > CHAR_LIMIT){
      // Afficher tronqué avec "Voir plus" inline
      var truncated = fullDesc.slice(0, fullDesc.lastIndexOf(' ', CHAR_LIMIT) || CHAR_LIMIT);
      var _shortText = truncated;
      var _fullText  = fullDesc;
      vmDesc.innerHTML = escapeHtml(truncated)
        + '<span class="vm-desc-toggle" role="button" tabindex="0"> Voir plus</span>';
      var _span = vmDesc.querySelector('.vm-desc-toggle');
      if(_span){ _span.dataset.full = _fullText; _span.dataset.short = _shortText; _span.dataset.expanded = 'false'; }
    } else {
      vmDesc.textContent = fullDesc;
    }

    // Prix + badge hausse + prix d'origine barré + remise
    var jumpPct = getLastPriceJumpPct(p);
    var badge = jumpPct!==null && jumpPct>=PRICE_ALERT_THRESHOLD
      ? ' <span class="price-jump-badge"><i class="ti ti-alert-triangle"></i> +'+jumpPct.toFixed(0)+'%</span>' : '';
    var orig = getOriginalPrice(p);
    var discPct = getDiscountPct(p);
    var discBadgeVm = discPct !== null && discPct < 0
      ? ' <span class="discount-badge discount-badge-lg">-'+Math.abs(discPct).toFixed(0)+' %</span>'
      : '';
    vmPrice.innerHTML = (orig ? '<span class="vm-price-original" title="Prix catalogue fabricant">'+escapeHtml(orig)+'</span>' : '')+
                        escapeHtml(p.price||'—')+discBadgeVm+badge;
    // Ligne explicite catalogue vs votre prix
    var vmPriceLabelEl = document.getElementById('vmPriceLabel');
    if(vmPriceLabelEl) vmPriceLabelEl.innerHTML = orig
      ? 'Prix catalogue : <span style="text-decoration:line-through;margin:0 4px">'+escapeHtml(orig)+'</span>&nbsp;·&nbsp; Votre prix : <strong>'+escapeHtml(p.price||'—')+'</strong>'
      : '';

    vmPriceHistory.innerHTML = buildPriceHistoryReadonly(p);

    viewOverlay.classList.add('open');
  }

  function closeView(){
    viewOverlay.classList.remove('open');
    vmInfoMenu.classList.remove('open');
    viewingId = null;
  }

  viewOverlay.addEventListener('click', function(e){
    if(e.target===viewOverlay) closeView();
  });
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && viewOverlay.classList.contains('open')){ closeView(); }
  });
  if(vmCloseBtn) vmCloseBtn.addEventListener('click', closeView);

  // Délégation clic sur span "Voir plus / Voir moins" dans la description
  vmDesc.addEventListener('click', function(e){
    var toggle = e.target.closest('.vm-desc-toggle');
    if(!toggle) return;
    var isExpanded = toggle.dataset.expanded === 'true';
    if(isExpanded){
      var truncated = toggle.dataset.short;
      vmDesc.innerHTML = escapeHtml(truncated)
        + '<span class="vm-desc-toggle" role="button" tabindex="0"> Voir plus</span>';
      vmDesc.querySelector('.vm-desc-toggle').dataset.full    = toggle.dataset.full;
      vmDesc.querySelector('.vm-desc-toggle').dataset.short   = truncated;
      vmDesc.querySelector('.vm-desc-toggle').dataset.expanded = 'false';
    } else {
      var full = toggle.dataset.full;
      vmDesc.innerHTML = escapeHtml(full)
        + '<span class="vm-desc-toggle" role="button" tabindex="0"> Voir moins</span>';
      vmDesc.querySelector('.vm-desc-toggle').dataset.full    = full;
      vmDesc.querySelector('.vm-desc-toggle').dataset.short   = toggle.dataset.short;
      vmDesc.querySelector('.vm-desc-toggle').dataset.expanded = 'true';
    }
  });

  vmInfoBtn.addEventListener('click', function(e){
    e.stopPropagation();
    vmInfoMenu.classList.toggle('open');
  });
  document.addEventListener('click', function(e){
    if(!vmInfoMenu.contains(e.target) && e.target!==vmInfoBtn){
      vmInfoMenu.classList.remove('open');
    }
  });

  document.getElementById('vmEditBtn').addEventListener('click', function(){
    var id = viewingId;
    closeView();
    openModal(id);
  });
  document.getElementById('vmDeleteBtn').addEventListener('click', function(){
    var id = viewingId;
    closeView();
    deleteProduct(id);
  });

  function getLastPriceJumpPct(p){
    if(!Array.isArray(p.priceHistory) || p.priceHistory.length === 0) return null;
    var lastOld = p.priceHistory[p.priceHistory.length - 1].price;
    var prev = parsePriceNumber(lastOld);
    var cur = parsePriceNumber(p.price);
    if(prev === null || cur === null || prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  }

  // Retourne le prix catalogue fabricant si différent du prix de vente
  function getOriginalPrice(p){
    // Priorité : champ priceCatalogue dédié
    if(p.priceCatalogue && p.priceCatalogue !== p.price) return p.priceCatalogue;
    // Fallback : premier historique
    if(!Array.isArray(p.priceHistory) || p.priceHistory.length === 0) return null;
    var orig = p.priceHistory[0].price;
    if(!orig || orig === p.price) return null;
    return orig;
  }

  // Calcule la remise en % entre le prix d'origine et le prix actuel
  function getDiscountPct(p){
    var orig = getOriginalPrice(p);
    if(!orig) return null;
    var origNum = parsePriceNumber(orig);
    var curNum  = parsePriceNumber(p.price);
    if(!origNum || !curNum || origNum === 0) return null;
    var pct = ((curNum - origNum) / origNum) * 100;
    return pct; // négatif = remise, positif = hausse
  }

  var _cardIdx = 0; // compteur réinitialisé à chaque render pour l'animation cascade

  function renderCard(p){
    var idx = _cardIdx++;
    var photo = p.photo
      ? '<img src="'+escapeHtml(p.photo)+'" alt="'+escapeHtml(p.name||p.ref)+'" loading="lazy" onerror="this.style.display=\'none\'; var sp=document.createElement(\'span\'); sp.className=\'ph-placeholder\'; sp.textContent=\'Image indisponible\'; this.parentElement.appendChild(sp);">'
      : '<span class="ph-placeholder sans">Pas de photo</span>';
    var tags = '';
    var tagItems = [];
    if(p.family) tagItems.push('<span class="tag family">'+escapeHtml(p.family)+'</span>');
    if(p.series) tagItems.push('<span class="tag series">'+escapeHtml(p.series)+'</span>');
    if(tagItems.length){
      tags = '<div class="tags">' + tagItems.join('') + '</div>';
    }
    var jumpPct = getLastPriceJumpPct(p);
    var priceJumpBadge = jumpPct !== null && jumpPct >= PRICE_ALERT_THRESHOLD
      ? '<span class="price-jump-badge" title="Hausse de '+jumpPct.toFixed(1)+' % depuis le dernier prix"><i class="ti ti-alert-triangle"></i> +'+jumpPct.toFixed(0)+'%</span>'
      : '';
    var origPrice = getOriginalPrice(p);
    var discPct = getDiscountPct(p);
    var discBadge = discPct !== null && discPct < 0
      ? '<span class="discount-badge badge-anim">-'+Math.abs(discPct).toFixed(0)+' %</span>'
      : '';
    var priceHtml = (origPrice ? '<span class="price-original" title="Prix catalogue fabricant">'+escapeHtml(origPrice)+'</span>' : '')+
                    escapeHtml(p.price||'—')+discBadge+priceJumpBadge;
    var supplierHtml = p.supplier
      ? '<div class="card-supplier">'+escapeHtml(p.supplier)+'</div>'
      : '';
    var meta = '';
    if(p.brand) meta += escapeHtml(p.brand);
    if(p.supplier) meta += (meta ? ' · ' : '') + escapeHtml(p.supplier);

    // Description courte : 100 chars max, coupe au dernier espace
    var rawDesc = (p.desc || '').replace(/<[^>]*>/g, '').trim();
    var shortDesc = rawDesc.length > 120
      ? rawDesc.slice(0, rawDesc.lastIndexOf(' ', 120) || 120) + '…'
      : rawDesc;

    // Nom : masquer si identique à la ref
    var displayName = (p.name && p.name.trim() !== (p.ref||'').trim())
      ? escapeHtml(p.name)
      : '';

    return '<div class="card card-visible" data-view="'+p.id+'" style="animation-delay:'+Math.min(idx*55, 600)+'ms">'+
      '<div class="photo">'+
        photo+
        (p.available3DX ? '<div class="three-d-overlay" title="Disponible dans la 3DEXPERIENCE"><img src="./img_3dx.png" alt="3DEX"></div>' : '')+
      '</div>'+
      '<div class="body">'+
        '<div class="body-top">'+
          '<div class="ref">'+escapeHtml(p.ref||'—')+'</div>'+
          (displayName ? '<div class="name">'+escapeHtml(p.name||'')+'</div>' : '')+
          (shortDesc ? '<div class="desc">'+escapeHtml(shortDesc)+'</div>' : '')+
        '</div>'+
        '<div class="body-bottom">'+
          '<div class="price-row">'+
            '<div class="price">'+priceHtml+'</div>'+
          '</div>'+
          (tags || '')+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function deleteProduct(id){
    var p = products.find(function(x){return x.id===id;});
    if(!p) return;
    if(!confirm('Supprimer « '+(p.name||p.ref)+' » du catalogue ?')) return;
    products = products.filter(function(x){return x.id!==id;});
    save();
    render();
  }

  // ---------- Modal ----------
  var overlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var fBrand = document.getElementById('fBrand');
  var fRef = document.getElementById('fRef');
  var fFamily = document.getElementById('fFamily');
  var fSeries = document.getElementById('fSeries');
  var fSupplier = document.getElementById('fSupplier');
  var fUrl = document.getElementById('fUrl');
  var fHtml = document.getElementById('fHtml');
  var chkShowHtml = document.getElementById('chkShowHtml');
  var htmlSourceContent = document.getElementById('htmlSourceContent');
  if(chkShowHtml){
    chkShowHtml.addEventListener('change', function(){
      htmlSourceContent.style.display = chkShowHtml.checked ? 'block' : 'none';
      if(chkShowHtml.checked){ fHtml.focus(); }
    });
  }
  var fName = document.getElementById('fName');
  var fDesc = document.getElementById('fDesc');
  var fPrice = document.getElementById('fPrice');
  var priceDisplayRow = document.getElementById('priceDisplayRow');
  var priceDisplayVal = document.getElementById('priceDisplayVal');
  var priceCreateRow  = document.getElementById('priceCreateRow');

  function updatePriceDisplay(){
    var val = fPrice.value;
    if(priceDisplayVal) priceDisplayVal.textContent = val || '—';
  }
  var fPhoto = document.getElementById('fPhoto');
  var photoPreview     = document.getElementById('photoPreview');
  var imgPreviewOverlay = document.getElementById('imgPreviewOverlay');
  var imgPreviewImg     = document.getElementById('imgPreviewImg');

  photoPreview.addEventListener('click', function(){
    var img = photoPreview.querySelector('img');
    if(!img) return;
    imgPreviewImg.src = img.src;
    imgPreviewOverlay.classList.add('show');
  });
  imgPreviewOverlay.addEventListener('click', function(){
    imgPreviewOverlay.classList.remove('show');
    imgPreviewImg.src = '';
  });
  // Fermer avec Escape
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') imgPreviewOverlay.classList.remove('show');
  });
  var photoGallery     = document.getElementById('photoGallery');
  var photoGalleryGrid = document.getElementById('photoGalleryGrid');
  // Photos candidates en mémoire — jamais stockées, vidées à la fermeture de la modale
  var pendingPhotos = [];

  function showPhotoGallery(photos){
    pendingPhotos = photos || [];
    photoGalleryGrid.innerHTML = '';
    if(pendingPhotos.length <= 1){ photoGallery.classList.remove('show'); return; }
    pendingPhotos.forEach(function(url, idx){
      var thumb = document.createElement('div');
      thumb.className = 'photo-gallery-thumb' + (idx === 0 ? ' selected' : '');
      thumb.innerHTML = '<img src="'+escapeHtml(url)+'" loading="lazy" onerror="this.parentElement.style.display=\'none\'">'
                      + '<span class="thumb-check">✓</span>';
      thumb.addEventListener('click', function(){
        photoGalleryGrid.querySelectorAll('.photo-gallery-thumb').forEach(function(t){ t.classList.remove('selected'); });
        thumb.classList.add('selected');
        fPhoto.value = url;
        updatePhotoPreview();
      });
      photoGalleryGrid.appendChild(thumb);
    });
    photoGallery.classList.add('show');
  }

  function clearPhotoGallery(){
    pendingPhotos = [];
    photoGalleryGrid.innerHTML = '';
    photoGallery.classList.remove('show');
  }
  var extractStatus = document.getElementById('extractStatus');
  var modalLeftFoot = document.getElementById('modalLeftFoot');

  var PRICE_ALERT_THRESHOLD = 10; // % d'augmentation à partir duquel on signale une grosse hausse
  var btnOpenPriceModal   = document.getElementById('btnOpenPriceModal');
  var priceModalOverlay   = document.getElementById('priceModalOverlay');

  // ── Modale gestion des prix ───────────────────────────────────────
  function showHome(){
    homePage.classList.remove('hidden');
    catalogueWrap.style.display = 'none';
    document.getElementById('hdrCountChip').style.display = 'none';
    renderHome();
  }

  function showCatalogue(brandFilter, familyFilter){
    homePage.classList.add('hidden');
    catalogueWrap.style.display = '';
    document.getElementById('hdrCountChip').style.display = '';
    if(familyFilter){
      familyFilterEl.value = familyFilter;
    }
    if(brandFilter){
      brandFilterEl.value = brandFilter;
    }
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function showCatalogueAll(){
    document.querySelector('.toolbar').classList.add('filters-visible');
    showCatalogue('','');
  }

  function renderHome(){
    refreshFilterCache();
    var total  = products.length;
    var brands = _filterCache.brands.length;

    // Stats
    var avgDiscount = 0;
    var countWithDiscount = 0;
    products.forEach(function(p){
      // Prix catalogue = premier élément de priceHistory
      var origRaw = (Array.isArray(p.priceHistory) && p.priceHistory.length > 0)
        ? p.priceHistory[0].price : '';
      var orig = parseFloat((origRaw||'').toString().replace(/[^0-9.,]/g,'').replace(',','.'));
      var disc = parseFloat((p.price||'').toString().replace(/[^0-9.,]/g,'').replace(',','.'));
      if(orig > 0 && disc > 0 && orig > disc){
        avgDiscount += (1 - disc/orig)*100;
        countWithDiscount++;
      }
    });
    var avgDisp = countWithDiscount > 0 ? '-'+Math.round(avgDiscount/countWithDiscount)+'%' : '--';

    homeStats.innerHTML =
      '<div class="home-stat"><div class="home-stat-val">'+total+'</div><div class="home-stat-lbl">Produits</div></div>' +
      '<div class="home-stat"><div class="home-stat-val">'+brands+'</div><div class="home-stat-lbl">Marques</div></div>' +
      '<div class="home-stat"><div class="home-stat-val">'+avgDisp+'</div><div class="home-stat-lbl">Remise moy.</div></div>';

    // Familles avec compteur
    var familyCounts = {};
    products.forEach(function(p){
      var f = (p.family||'').trim();
      if(!f) return;
      familyCounts[f] = (familyCounts[f]||0) + 1;
    });
    var families = Object.keys(familyCounts).sort(function(a,b){
      return familyCounts[b] - familyCounts[a];
    });

    if(families.length === 0){
      homeFamilies.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--ink-soft);font-size:13px;padding:20px 0;">Aucune famille définie — ajoutez des familles à vos produits pour les voir ici.</div>';
    } else {
      homeFamilies.innerHTML = families.map(function(f){
        var icon = getFamilyIcon(f);
        var count = familyCounts[f];
        return '<div class="home-family-card" data-family="'+escapeHtml(f)+'">'
          + '<div class="home-family-icon"><i class="ti '+icon+'" aria-hidden="true"></i></div>'
          + '<div class="home-family-name">'+escapeHtml(f)+'</div>'
          + '<div class="home-family-count">'+count+(count>1?' références':' référence')+'</div>'
          + '</div>';
      }).join('');

      homeFamilies.querySelectorAll('.home-family-card').forEach(function(card){
        card.addEventListener('click', function(){
          showCatalogue('', card.getAttribute('data-family'));
        });
      });
    }
  }

  document.getElementById('brandmarkLogo').addEventListener('click', function(){
    familyFilterEl.value = '';
    brandFilterEl.value  = '';
    seriesFilterEl.value = '';
    document.querySelector('.toolbar').classList.remove('filters-visible');
    showHome();
  });

  homeAllBtn.addEventListener('click', function(){
    showCatalogueAll();
  });

  // ---------- Picker icônes famille ----------
  var ICON_LIST = [
    'ti-package','ti-plug-connected','ti-plug','ti-antenna','ti-bolt',
    'ti-circuit-switchclosed','ti-circuit-resistor','ti-cpu','ti-device-desktop',
    'ti-settings','ti-settings-2','ti-tool','ti-tools',
    'ti-wifi','ti-bluetooth','ti-usb','ti-network',
    'ti-toggle-right','ti-toggle-left','ti-switch',
    'ti-box','ti-boxes','ti-archive',
    'ti-temperature','ti-thermometer','ti-droplet','ti-wind',
    'ti-eye','ti-scan','ti-qrcode','ti-barcode',
    'ti-lock','ti-key','ti-shield',
    'ti-battery','ti-battery-charging',
    'ti-bulb','ti-sun','ti-moon',
    'ti-motor','ti-engine','ti-robot',
    'ti-chart-bar','ti-chart-line','ti-chart-pie',
    'ti-file','ti-files','ti-folder',
    'ti-truck','ti-car','ti-forklift',
    'ti-home','ti-building','ti-door',
    'ti-ruler','ti-ruler-2','ti-dimensions',
    'ti-camera','ti-video','ti-microphone',
    'ti-phone','ti-headphones','ti-radio',
    'ti-printer','ti-scan','ti-clipboard',
    'ti-hammer','ti-screwdriver','ti-drill',
    'ti-alarm','ti-bell','ti-urgent',
    'ti-heart','ti-star','ti-flag',
    'ti-clock','ti-calendar','ti-timer',
    'ti-map','ti-map-pin','ti-compass',
    'ti-cloud','ti-cloud-upload','ti-cloud-download',
    'ti-database','ti-server','ti-terminal',
    'ti-code','ti-brackets','ti-api',
    'ti-refresh','ti-reload','ti-rotate',
    'ti-filter','ti-search','ti-zoom-in',
    'ti-trash','ti-edit','ti-copy',
    'ti-check','ti-x','ti-alert-triangle',
    'ti-info-circle','ti-question-mark','ti-help'
  ];

  var selectedFamilyIcon = 'ti-package';
  var familyIconRow      = document.getElementById('familyIconRow');
  var familyIconPreviewI = document.getElementById('familyIconPreviewI');
  var familyIconPickerBtn = document.getElementById('familyIconPickerBtn');
  var iconPickerModal    = document.getElementById('iconPickerModal');
  var iconPickerClose    = document.getElementById('iconPickerClose');
  var iconPickerSearch   = document.getElementById('iconPickerSearch');
  var iconPickerGrid     = document.getElementById('iconPickerGrid');

  var knownFamilies = [];

  function refreshKnownFamilies(){
    var set = {};
    products.forEach(function(p){ if(p.family) set[p.family] = true; });
    knownFamilies = Object.keys(set);
  }

  function renderIconGrid(filter){
    var list = ICON_LIST.filter(function(ic){
      return !filter || ic.replace('ti-','').indexOf(filter.toLowerCase()) !== -1;
    });
    iconPickerGrid.innerHTML = list.map(function(ic){
      return '<div class="icon-picker-item'+(ic===selectedFamilyIcon?' selected':'')+'" data-icon="'+ic+'" title="'+ic.replace('ti-','')+'"><i class="ti '+ic+'"></i></div>';
    }).join('');
    iconPickerGrid.querySelectorAll('.icon-picker-item').forEach(function(el){
      el.addEventListener('click', function(){
        var icon = el.getAttribute('data-icon');
        selectedFamilyIcon = icon;
        iconPickerGrid.querySelectorAll('.icon-picker-item').forEach(function(x){ x.classList.remove('selected'); });
        el.classList.add('selected');
        // Mettre à jour l'aperçu dans le formulaire
        familyIconPreviewI.className = 'ti '+icon;
        iconPickerModal.classList.remove('show');
        // Contexte Paramètres : sauvegarder sur tous les produits de la famille
        if(settingsEditingFamily){
          familyIcons[settingsEditingFamily] = icon;
          saveFamilyIcons();
          products.forEach(function(p){
            if(p.family === settingsEditingFamily) p.familyIcon = icon;
          });
          save(true);
          var thumb = document.getElementById('settings-thumb-'+settingsEditingFamily);
          if(thumb) thumb.className = 'ti '+icon;
          settingsEditingFamily = null;
          renderHome();
        }
      });
    });
  }

  familyIconPickerBtn.addEventListener('click', function(){
    iconPickerSearch.value = '';
    renderIconGrid('');
    iconPickerModal.classList.add('show');
  });
  iconPickerClose.addEventListener('click', function(){
    iconPickerModal.classList.remove('show');
  });
  iconPickerModal.addEventListener('click', function(e){
    if(e.target === iconPickerModal) iconPickerModal.classList.remove('show');
  });
  iconPickerSearch.addEventListener('input', function(){
    renderIconGrid(iconPickerSearch.value);
  });

  // Afficher le picker uniquement pour les nouvelles familles
  fFamily.addEventListener('input', function(){
    refreshKnownFamilies();
    var val = fFamily.value.trim();
    if(val && knownFamilies.indexOf(val) === -1){
      // Nouvelle famille → montrer le picker
      selectedFamilyIcon = getFamilyIcon(val); // pré-sélectionner par mots-clés
      familyIconPreviewI.className = 'ti '+selectedFamilyIcon;
      familyIconRow.classList.add('show');
    } else {
      familyIconRow.classList.remove('show');
    }
  });

  // ---------- Init ----------
  load();
  render();
  tryReconnectOnLoad();

  