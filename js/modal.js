// ---------- Modal ----------
  var overlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var fBrand = document.getElementById('fBrand');
  var fRef = document.getElementById('fRef');
  var fFamily = document.getElementById('fFamily');
  var fSeries = document.getElementById('fSeries');
  var fSupplier  = document.getElementById('fSupplier');
  var fLeadTime  = document.getElementById('fLeadTime');
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
  var f3dAvailable      = document.getElementById('f3dAvailable');
  var f3dLink           = document.getElementById('f3dLink');
  var f3dLinkRow        = document.getElementById('f3dLinkRow');
  var fEssential        = document.getElementById('fEssential');
  var fSuggestionsSearch = document.getElementById('fSuggestionsSearch');
  var fSuggestionsChips  = document.getElementById('fSuggestionsChips');
  var fSuggestionsDrop   = document.getElementById('fSuggestionsDrop');
  var _sugRefs = []; // tableau des refs sélectionnées (liaison bidirectionnelle avec ces produits)
  // Sous-ensemble de _sugRefs masqué sur CETTE fiche uniquement (la liaison
  // reste connue des deux côtés — voir la case à cocher par puce plus bas et
  // le lien automatique réciproque dans js/actions.js — mais l'affichage sur
  // la fiche produit reste indépendant par fiche : pour masquer une réf. sur
  // l'autre fiche, il faut aller la décocher là-bas, à la main — retour
  // utilisateur).
  var _sugHidden = [];
  // ── Pièces de rechange — même mécanique que Produits suggérés ci-dessus
  // (champ + suggestions, liaison réciproque, case à cocher par puce). ──
  var fSparePartsSearch = document.getElementById('fSparePartsSearch');
  var fSparePartsChips  = document.getElementById('fSparePartsChips');
  var fSparePartsDrop   = document.getElementById('fSparePartsDrop');
  var _sparePartsRefs = [];
  var _sparePartsHidden = [];
  var _specsRows = []; // [{key, value}] — caractéristiques techniques libres
  var fTags             = document.getElementById('fTags');
  var tagSuggestionsEl  = document.getElementById('tagSuggestions');
  var familyIconRow     = document.getElementById('familyIconRow');
  var familyIconPreviewI= document.getElementById('familyIconPreviewI');
  var selectedFamilyIcon= 'ti-package';

  // ── Suggestions de tags depuis la description ───────────────────────
  var TAG_STOPWORDS = ['pour','avec','sans','dans','entre','vers','sous','chez',
    'les','des','une','un','le','la','de','du','et','ou','ce','cet','cette','ces',
    'est','sont','sur','par','au','aux','en','plus','tres','tout','tous','toute',
    'toutes','qui','que','quoi','son','sa','ses','leur','leurs','ne','pas','aussi',
    'comme','etre','avoir','ainsi','ils','elle','elles','il','on','notre','votre',
    'nos','vos','permet','permettant','ideal','idéal','produit','produits'];

  function extractTagSuggestions(desc, existingTags){
    // Retirer les balises HTML avant d'extraire des mots — sans ça, une
    // description contenant du HTML collé par erreur (ex. copié depuis une
    // page web) polluait les suggestions avec des mots comme "html" ou
    // "script" au lieu de vrais mots-clés produit (retour utilisateur).
    var cleanDesc = (desc || '').replace(/<[^>]*>/g, ' ');
    var norm = typeof normalizeSearch === 'function' ? normalizeSearch(cleanDesc) : cleanDesc.toLowerCase();
    var words = norm.split(/[\s-]+/).filter(Boolean);
    var existing = {};
    (existingTags||[]).forEach(function(t){
      var nt = typeof normalizeSearch === 'function' ? normalizeSearch(t) : t.toLowerCase();
      existing[nt] = true;
    });
    var seen = {};
    var out = [];
    words.forEach(function(w){
      if(w.length < 4 || w.length > 20) return;
      if(TAG_STOPWORDS.indexOf(w) !== -1) return;
      if(/^\d+$/.test(w)) return;
      if(seen[w] || existing[w]) return;
      seen[w] = true;
      out.push(w);
    });
    return out.slice(0, 8);
  }

  function renderTagSuggestions(){
    if(!tagSuggestionsEl || !fDesc || !fTags) return;
    var currentTags = fTags.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean);
    var suggestions = extractTagSuggestions(fDesc.value, currentTags);
    if(!suggestions.length){
      tagSuggestionsEl.style.display = 'none';
      tagSuggestionsEl.innerHTML = '';
      return;
    }
    tagSuggestionsEl.style.display = 'flex';
    tagSuggestionsEl.innerHTML = suggestions.map(function(w){
      return '<button type="button" class="tag-suggestion-chip" data-word="'+escapeHtml(w)+'">+ '+escapeHtml(w)+'</button>';
    }).join('');
  }

  if(fDesc){
    var _tagSuggestTimer = null;
    fDesc.addEventListener('input', function(){
      clearTimeout(_tagSuggestTimer);
      _tagSuggestTimer = setTimeout(renderTagSuggestions, 300);
    });
  }
  if(fTags) fTags.addEventListener('input', renderTagSuggestions);
  if(tagSuggestionsEl){
    tagSuggestionsEl.addEventListener('click', function(e){
      var btn = e.target.closest('.tag-suggestion-chip');
      if(!btn) return;
      var word = btn.getAttribute('data-word');
      var current = fTags.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean);
      if(current.indexOf(word) === -1) current.push(word);
      fTags.value = current.join(', ');
      renderTagSuggestions();
    });
  }

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

  var PRICE_ALERT_THRESHOLD = 3; // % d'augmentation à partir duquel on signale une grosse hausse
  var btnOpenPriceModal   = document.getElementById('btnOpenPriceModal');
  var priceModalOverlay   = document.getElementById('priceModalOverlay');

  // Une remise est active quand le prix catalogue et le prix affiché sont
  // tous les deux connus et différents.
  function hasActiveRemise(p){
    return !!(p.priceCatalogue && p.price && p.priceCatalogue !== p.price);
  }

  // ── Modale gestion des prix ───────────────────────────────────────
  function openPriceModal(){
    var p = products.find(function(x){ return x.id === editingId; });
    if(!p) return;

    // Ref produit en sous-titre
    document.getElementById('priceModalRef').textContent = (p.brand ? p.brand + ' — ' : '') + (p.ref || p.name || '');

    // Prix catalogue / prix remisé actuels
    var remiseActive = hasActiveRemise(p);
    document.getElementById('priceModalCurrentCatalogue').textContent = (p.priceCatalogue || p.price || '—');
    document.getElementById('priceModalCurrentRemiseWrap').style.display = remiseActive ? '' : 'none';
    document.getElementById('priceModalCurrent').textContent = p.price || '—';

    // Delta global
    var deltaEl = document.getElementById('priceModalDelta');
    if(Array.isArray(p.priceHistory) && p.priceHistory.length > 0 && p.price){
      var first = parsePriceNumber(p.priceHistory[0].price);
      var cur   = parsePriceNumber(p.price);
      if(first && cur && first !== 0){
        var pct = ((cur - first) / first) * 100;
        var sign = pct >= 0 ? '+' : '';
        deltaEl.textContent = sign + pct.toFixed(1) + ' %';
        deltaEl.style.color = pct > 0 ? 'var(--warn)' : (pct < 0 ? 'var(--moss,#4a7c59)' : 'var(--ink-soft)');
      } else { deltaEl.textContent = '—'; deltaEl.style.color = ''; }
    } else { deltaEl.textContent = '—'; deltaEl.style.color = ''; }

    renderPriceModalTable(p);

    // Pré-remplir date du jour
    var today = new Date();
    var dd = String(today.getDate()).padStart(2,'0');
    var mm = String(today.getMonth()+1).padStart(2,'0');
    document.getElementById('priceModalNewDate').value = today.getFullYear()+'-'+mm+'-'+dd;
    // Pré-remplir avec les valeurs actuelles : modifier juste l'un des deux
    // champs et cliquer sur Ajouter ne touche alors que ce prix-là.
    document.getElementById('priceModalNewCatalogue').value = p.priceCatalogue || p.price || '';
    document.getElementById('priceModalNewRemise').value = remiseActive ? p.price : '';
    document.getElementById('priceModalError').style.display = 'none';

    priceModalOverlay.style.display = 'flex';
  }

  function closePriceModal(){ priceModalOverlay.style.display = 'none'; }

  function renderPriceModalTable(p){
    var tbody = document.getElementById('priceModalBody');
    var emptyEl = document.getElementById('priceModalEmpty');
    tbody.innerHTML = '';

    var history = Array.isArray(p.priceHistory) ? p.priceHistory : [];
    var all = history.map(function(h){ return {price: h.price, date: h.date, label: h.label||'', current: false}; });
    if(p.price) all.push({price: p.price, date: null, label: hasActiveRemise(p) ? 'Votre prix' : '', current: true});

    if(all.length === 0){ emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';

    all.forEach(function(entry, i){
      var tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--line)';
      if(entry.current){ tr.style.background = 'var(--paper)'; tr.style.fontStyle = 'italic'; }

      // Date
      var tdDate = document.createElement('td');
      tdDate.style.cssText = 'padding:8px 10px;color:var(--ink-soft);white-space:nowrap;font-size:13px;';
      tdDate.textContent = entry.current ? 'Prix actuel' : (entry.date ? new Date(entry.date).toLocaleDateString('fr-FR') : '—');
      tr.appendChild(tdDate);

      // Prix
      var tdPrice = document.createElement('td');
      tdPrice.style.cssText = 'padding:8px 10px;text-align:right;font-weight:600;white-space:nowrap;font-size:13px;';
      tdPrice.textContent = entry.price || '—';
      if(entry.label){
        var lblSpan = document.createElement('span');
        lblSpan.style.cssText = 'display:block;font-weight:400;font-size:10.5px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;';
        lblSpan.textContent = entry.label;
        tdPrice.appendChild(lblSpan);
      }
      tr.appendChild(tdPrice);

      // Delta
      var tdDelta = document.createElement('td');
      tdDelta.style.cssText = 'padding:8px 10px;text-align:right;font-size:13px;';
      if(i > 0){
        var prev = parsePriceNumber(all[i-1].price);
        var cur  = parsePriceNumber(entry.price);
        if(prev && cur && prev !== 0){
          var pct = ((cur - prev) / prev) * 100;
          var sign = pct >= 0 ? '▲ +' : '▼ ';
          var span = document.createElement('span');
          span.style.cssText = 'font-weight:600;font-size:12px;padding:2px 6px;border-radius:10px;';
          span.textContent = sign + pct.toFixed(1) + ' %';
          if(pct > 0){ span.style.background='#FEE2E2'; span.style.color='var(--warn)'; }
          else if(pct < 0){ span.style.background='#EAF3DE'; span.style.color='#3B6D11'; }
          tdDelta.appendChild(span);
        }
      }
      tr.appendChild(tdDelta);

      // Supprimer (pas sur le prix actuel)
      var tdDel = document.createElement('td');
      tdDel.style.cssText = 'padding:8px 6px;width:32px;';
      if(!entry.current){
        var btn = document.createElement('button');
        btn.style.cssText = 'background:none;border:none;color:var(--ink-soft);font-size:16px;cursor:pointer;padding:0 4px;border-radius:3px;';
        btn.textContent = '×';
        btn.title = 'Supprimer';
        btn.addEventListener('mouseover', function(){ this.style.color='var(--warn)'; this.style.background='#FEE2E2'; });
        btn.addEventListener('mouseout',  function(){ this.style.color='var(--ink-soft)'; this.style.background='none'; });
        btn.addEventListener('click', function(){
          var prod = products.find(function(x){ return x.id === editingId; });
          if(!prod) return;
          prod.priceHistory.splice(i, 1);
          save();
          renderPriceModalTable(prod);
          renderPriceHistory(prod);
          document.getElementById('priceModalCurrent').textContent = prod.price || '—';
        });
        tdDel.appendChild(btn);
      }
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    });
  }

  // Bouton ouvrir modale prix (visible uniquement en mode édition)
  if(btnOpenPriceModal){
    btnOpenPriceModal.addEventListener('click', openPriceModal);
    btnOpenPriceModal.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; this.style.color='var(--copper)'; });
    btnOpenPriceModal.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; this.style.color='var(--ink)'; });
  }

  document.getElementById('priceModalClose').addEventListener('click', closePriceModal);
  document.getElementById('priceModalCancel').addEventListener('click', closePriceModal);
  // clic extérieur bloqué — géré par _initModalEscape()

  // Ajouter un nouveau prix — le prix catalogue et le prix remisé sont
  // modifiés indépendamment : ne renseigner que l'un des deux ne touche que
  // ce prix-là (les champs sont pré-remplis avec les valeurs actuelles par
  // openPriceModal, donc laisser un champ inchangé revient à ne rien lui
  // faire). Même logique que l'import Excel en masse (catChanged/sellingChanged).
  document.getElementById('priceModalAddBtn').addEventListener('click', function(){
    var rawCat = document.getElementById('priceModalNewCatalogue').value.trim();
    var rawRem = document.getElementById('priceModalNewRemise').value.trim();
    var rawDate = document.getElementById('priceModalNewDate').value;
    var errEl = document.getElementById('priceModalError');
    errEl.style.display = 'none';

    if(!rawCat && !rawRem){
      errEl.textContent = 'Renseignez le prix catalogue, le prix remisé, ou les deux.';
      errEl.style.display = 'block';
      return;
    }

    var p = products.find(function(x){ return x.id === editingId; });
    if(!p) return;

    // À vérifier AVANT toute modification : s'il n'y avait pas de remise en
    // cours, une mise à jour du seul prix catalogue doit suivre sur le prix
    // affiché plutôt que fabriquer une remise qui n'existait pas.
    var hadDiscount = hasActiveRemise(p);

    var dateMs = rawDate ? new Date(rawDate).getTime() : Date.now();
    var history = Array.isArray(p.priceHistory) ? p.priceHistory.slice() : [];
    var changed = false;

    if(rawCat){
      var newCat = formatPrice(rawCat);
      if(newCat !== (p.priceCatalogue || '')){
        if(p.priceCatalogue) history.push({price: p.priceCatalogue, date: dateMs, label: 'Prix catalogue'});
        p.priceCatalogue = newCat;
        changed = true;
      }
    }

    if(rawRem){
      var newRem = formatPrice(rawRem);
      if(newRem !== (p.price || '')){
        if(p.price) history.push({price: p.price, date: dateMs, label: 'Votre prix'});
        p.price = newRem;
        changed = true;
      }
    } else if(rawCat && !hadDiscount && formatPrice(rawCat) !== (p.price || '')){
      // Pas de remise active : le prix affiché suit le prix catalogue
      if(p.price) history.push({price: p.price, date: dateMs, label: 'Votre prix'});
      p.price = formatPrice(rawCat);
      changed = true;
    }

    if(!changed){
      errEl.textContent = 'Les valeurs saisies sont identiques aux prix actuels.';
      errEl.style.display = 'block';
      return;
    }

    p.priceHistory = history;
    fPrice.value = p.price || '';
    updatePriceDisplay();

    save(); render();
    renderPriceHistory(p);
    renderPriceModalTable(p);

    var remiseActive = hasActiveRemise(p);
    document.getElementById('priceModalCurrentCatalogue').textContent = p.priceCatalogue || p.price || '—';
    document.getElementById('priceModalCurrentRemiseWrap').style.display = remiseActive ? '' : 'none';
    document.getElementById('priceModalCurrent').textContent = p.price || '—';
    document.getElementById('priceModalNewCatalogue').value = p.priceCatalogue || p.price || '';
    document.getElementById('priceModalNewRemise').value = remiseActive ? p.price : '';
  });

  // Appliquer et fermer
  document.getElementById('priceModalSave').addEventListener('click', function(){
    var p = products.find(function(x){ return x.id === editingId; });
    if(p) renderPriceHistory(p);
    closePriceModal();
  });

  function renderPriceHistory(product){ /* géré par la modale prix */ }
  function resetForm(){
    fBrand.value=''; fRef.value=''; fFamily.value=''; fSeries.value=''; fSupplier.value=''; if(fLeadTime) fLeadTime.value=''; fUrl.value=''; fHtml.value=''; if(chkShowHtml){ chkShowHtml.checked=false; } if(htmlSourceContent){ htmlSourceContent.style.display='none'; }
    familyIconRow.classList.remove('show');
    selectedFamilyIcon = 'svg-generique';
    _setFamilyIconPreview('svg-generique');
    fName.value=''; fDesc.value=''; fTags.value=''; fPrice.value=''; fPhoto.value='';
    renderTagSuggestions();
    if(priceDisplayRow) priceDisplayRow.style.display = 'none';
    if(priceCreateRow)  priceCreateRow.style.display  = 'block';
    f3dAvailable.checked = false;
    f3dLink.value = '';
    f3dLinkRow.style.display = 'none';
    if(fEssential) fEssential.checked = false;
    _sugRefs = [];
    _sugHidden = [];
    _sugRenderChips();
    _sparePartsRefs = [];
    _sparePartsHidden = [];
    _sparePartsRenderChips();
    _specsRows = [];
    _specsRenderRows();
    photoPreview.innerHTML = '<span class="hint sans" style="padding:6px;text-align:center;">aperçu</span>';
    clearPhotoGallery();
    extractStatus.className = 'extract-status'; extractStatus.textContent='';
    refCheckMsgEl.className = 'ref-check-msg'; refCheckMsgEl.textContent = '';
    refDupIconEl.classList.remove('show'); refDupTooltipEl.textContent = '';
    refDupBannerEl.textContent = ''; refDupBannerEl.classList.remove('open');
    var btnSaveReset = document.getElementById('btnSave');
    btnSaveReset.disabled = false; btnSaveReset.style.opacity = ''; btnSaveReset.style.cursor = '';
    // Reset zone prix de vente
    sellingPriceZoneEl.style.display = 'none';
    fSellingPrice.value = '';
    sellingPriceHint.textContent = '';
    switchTab('auto');
  }
  function closeModal(){
    overlay.classList.remove('open');
    document.body.classList.remove('modal-open');
    editingId = null;
  }

  // ---------- Vérification de référence en doublon ----------
  var refCheckMsgEl  = document.getElementById('refCheckMsg');
  var refDupIconEl    = document.getElementById('refDupIcon');
  var refDupTooltipEl = document.getElementById('refDupTooltip');
  var refDupBannerEl  = document.getElementById('refDupBanner');
  function normalizeRef(s){ return (s||'').trim().toLowerCase(); }

  function checkDuplicateRef(){
    var brand = fBrand.value.trim();
    var ref = fRef.value.trim();
    if(!ref){
      refCheckMsgEl.className = 'ref-check-msg'; refCheckMsgEl.textContent = '';
    refDupIconEl.classList.remove('show'); refDupTooltipEl.textContent = '';
    refDupBannerEl.textContent = ''; refDupBannerEl.classList.remove('open');
    var btnSaveReset = document.getElementById('btnSave');
    btnSaveReset.disabled = false; btnSaveReset.style.opacity = ''; btnSaveReset.style.cursor = '';
      return;
    }
    var match = products.find(function(p){
      if(p.id === editingId) return false; // ignore le produit en cours d'édition lui-même
      var sameRef = normalizeRef(p.ref) === normalizeRef(ref);
      var sameBrand = brand ? normalizeRef(p.brand) === normalizeRef(brand) : true;
      return sameRef && sameBrand;
    });
    var btnSave = document.getElementById('btnSave');
    if(match){
      refCheckMsgEl.className = 'ref-check-msg warn show';
      refCheckMsgEl.textContent = '';
      refDupIconEl.classList.add('show');
      var dupMsg = 'Référence déjà présente pour ' + (match.brand || 'cette marque')
        + (match.name ? ' — « ' + match.name + ' »' : '') + '.';
      refDupTooltipEl.textContent = dupMsg;
      refDupBannerEl.textContent  = dupMsg;
      // Le bandeau s'affiche uniquement au tap sur l'icône (mobile)
      btnSave.disabled = true;
      btnSave.style.opacity = '0.4';
      btnSave.style.cursor  = 'not-allowed';
    }else{
      refCheckMsgEl.className = 'ref-check-msg';
      refCheckMsgEl.textContent = '';
      refDupIconEl.classList.remove('show');
      refDupTooltipEl.textContent = '';
      refDupBannerEl.textContent  = '';
      refDupBannerEl.classList.remove('open');
      btnSave.disabled = false;
      btnSave.style.opacity = '';
      btnSave.style.cursor  = '';
    }
  }
  fRef.addEventListener('input', checkDuplicateRef);
  fBrand.addEventListener('input', checkDuplicateRef);
  // ── Autocomplete custom — remplace datalist (fix iOS) ─────────────
  function makeAutocomplete(inputEl, suggestionsEl, getItems){
    if(!inputEl || !suggestionsEl) return;
    function show(){
      var val = (inputEl.value || '').trim().toLowerCase();
      var items = getItems();
      var filtered = val
        ? items.filter(function(i){ return i.toLowerCase().indexOf(val) === 0 && i.toLowerCase() !== val; })
        : items.slice();
      if(!filtered.length){ suggestionsEl.classList.remove('show'); return; }
      suggestionsEl.innerHTML = filtered.map(function(i){
        return '<div class="autocomplete-item">'+escapeHtml(i)+'</div>';
      }).join('');
      suggestionsEl.classList.add('show');
      suggestionsEl.querySelectorAll('.autocomplete-item').forEach(function(el){
        el.addEventListener('mousedown', function(e){
          e.preventDefault();
          inputEl.value = el.textContent;
          inputEl.dispatchEvent(new Event('input', {bubbles:true}));
          suggestionsEl.classList.remove('show');
        });
        (function(el){
          var touchStartY = 0, touchStartX = 0, scrolled = false;
          el.addEventListener('touchstart', function(e){
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            scrolled = false;
          }, {passive:true});
          // Détecter le scroll en cours
          suggestionsEl.addEventListener('touchmove', function(){
            scrolled = true;
          }, {passive:true});
          el.addEventListener('touchend', function(e){
            var dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
            var dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
            if(scrolled || dy > 5 || dx > 5) return; // scroll → ignorer
            e.preventDefault();
            inputEl.value = el.textContent;
            inputEl.dispatchEvent(new Event('input', {bubbles:true}));
            suggestionsEl.classList.remove('show');
          });
        })(el);
      });
    }
    inputEl.addEventListener('input', show);
    inputEl.addEventListener('focus', show);
    inputEl.addEventListener('blur', function(){
      setTimeout(function(){ suggestionsEl.classList.remove('show'); }, 200);
    });
  }

  makeAutocomplete(fBrand, document.getElementById('brandSuggestions'), function(){
    refreshFilterCache();
    return _filterCache.brands || [];
  });
  makeAutocomplete(fFamily, document.getElementById('familySuggestions'), function(){
    refreshFilterCache();
    return _filterCache.families || [];
  });
  makeAutocomplete(fSeries, document.getElementById('seriesSuggestions'), function(){
    refreshFilterCache();
    var brand = (fBrand.value || '').trim();
    if(brand){
      var s = {};
      products.forEach(function(p){
        if((p.brand||'').toLowerCase()===brand.toLowerCase() && p.series) s[p.series]=true;
      });
      var filtered = Object.keys(s).sort();
      if(filtered.length) return filtered;
    }
    return _filterCache.series || [];
  });
  makeAutocomplete(fSupplier, document.getElementById('supplierSuggestions'), function(){
    refreshFilterCache();
    return _filterCache.suppliers || [];
  });

  // Filtrage séries par marque géré par makeAutocomplete fSeries
  // Tap sur l'icône → toggle du bandeau mobile
  refDupIconEl.addEventListener('click', function(e){
    e.stopPropagation();
    refDupBannerEl.classList.toggle('open');
  });
  // Tap ailleurs → ferme le bandeau
  document.addEventListener('click', function(){
    refDupBannerEl.classList.remove('open');
  });

  // Pré-remplit le formulaire depuis un objet produit — utilisé pour l'édition
  // d'un produit existant, et pour la révision d'une demande soumise (qui
  // n'existe pas encore dans `products`).
  function fillFormFromProduct(p){
    fBrand.value = p.brand||''; fRef.value = p.ref||''; fUrl.value = p.url||'';
    fFamily.value = p.family||''; fSeries.value = p.series||''; fSupplier.value = p.supplier||'';
    if(fLeadTime) fLeadTime.value = p.leadTime||'';
    fName.value = p.name||''; fDesc.value = p.desc||''; fTags.value = (Array.isArray(p.tags) ? p.tags.join(', ') : '');
    renderTagSuggestions();
    f3dAvailable.checked = !!p.available3DX;
    f3dLink.value = p.available3DXLink || '';
    update3dLinkVisibility();
    if(fEssential) fEssential.checked = !!p.essential;
    _sugRefs = Array.isArray(p.suggestions) ? p.suggestions.slice() : [];
    _sugHidden = Array.isArray(p.suggestionsHidden) ? p.suggestionsHidden.slice() : [];
    _sugRenderChips();
    _sparePartsRefs = Array.isArray(p.spareParts) ? p.spareParts.slice() : [];
    _sparePartsHidden = Array.isArray(p.sparePartsHidden) ? p.sparePartsHidden.slice() : [];
    _sparePartsRenderChips();
    _specsRows = (p.specs && typeof p.specs === 'object')
      ? Object.keys(p.specs).map(function(k){ return { key: k, value: p.specs[k] }; })
      : [];
    _specsRenderRows();
    fPrice.value = p.price||''; fPhoto.value = p.photo||'';
    updatePhotoPreview();
    renderPriceHistory(p);
    switchTab('manual');
    if(btnOpenPriceModal) btnOpenPriceModal.style.display = 'flex';
    if(priceDisplayRow) priceDisplayRow.style.display = 'flex';
    if(priceCreateRow)  priceCreateRow.style.display  = 'none';
    updatePriceDisplay();
  }

  function openModal(id){
    // Garde-fou supplémentaire (en plus de resetReviewModeUI) : openModal()
    // sert à "Ajouter un produit"/"Modifier le produit", jamais à la revue
    // d'une demande — l'état verrouillé ne doit donc jamais y être visible.
    if(typeof _reviewSetLocked === 'function') _reviewSetLocked(false);
    editingId = id || null;
    resetForm();
    if(editingId){
      var p = products.find(function(x){return x.id===editingId;});
      if(p){
        modalTitle.textContent = 'Modifier le produit';
        modalLeftFoot.textContent = 'Ajouté le ' + (p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '—');
        fillFormFromProduct(p);
        _formOriginalSnapshot = _formSnapshotNow();
      }
    }else{
      modalTitle.textContent = 'Ajouter un produit';
      modalLeftFoot.textContent = '';
      _formOriginalSnapshot = null;

      if(window.innerWidth <= 768){
        switchTab('manual');
      }else{
        switchTab('auto');
      }

      // Affiche la zone prix de vente uniquement en mode création
      sellingPriceZoneEl.style.display = 'block';
      if(btnOpenPriceModal) btnOpenPriceModal.style.display = 'none';
      if(priceDisplayRow) priceDisplayRow.style.display = 'none';
      if(priceCreateRow)  priceCreateRow.style.display  = 'block';
    }

    // ── Avertir AVANT la saisie si l'enregistrement ne pourrait pas être
    // synchronisé (plutôt qu'après coup) ────────────────────────────────
    // Un compte avec droit d'édition mais sans droit de synchro serveur
    // (canSyncServer) voit son ajout/modif se sauvegarder en local avec
    // succès apparent, alors que ça reste invisible pour tout le monde —
    // retour utilisateur : mieux vaut bloquer et expliquer avant la saisie
    // que de laisser croire que ça a marché. Ne s'applique pas en mode
    // "Proposer" (_proposeMode) : c'est justement le circuit prévu pour ces
    // comptes-là, qui passe par une demande, pas un push direct.
    var noSyncBanner     = document.getElementById('modalNoSyncBanner');
    var noSyncBannerText = document.getElementById('modalNoSyncBannerText');
    var serverUrlCheck   = localStorage.getItem('cat_server_url');
    var _perms2  = window._userPerms || {};
    var canSync  = !!(_perms2.canSyncServer || _perms2.isAdmin);
    var blockSave = !!serverUrlCheck && !canSync && !window._proposeMode;
    if(noSyncBanner){
      noSyncBanner.style.display = blockSave ? 'flex' : 'none';
      if(blockSave && noSyncBannerText){
        noSyncBannerText.textContent = 'Vous n\'avez pas les droits de synchronisation avec le serveur : cet enregistrement resterait local uniquement sur cet appareil, invisible pour les autres utilisateurs. Contactez un administrateur.';
      }
    }
    var btnSaveForSyncCheck = document.getElementById('btnSave');
    if(btnSaveForSyncCheck){
      btnSaveForSyncCheck.disabled = blockSave;
      btnSaveForSyncCheck.style.opacity = blockSave ? '0.5' : '';
      btnSaveForSyncCheck.style.cursor = blockSave ? 'not-allowed' : '';
    }

    // ── Section PDF multi-doc ────────────────────────────────────
    var sUrl = localStorage.getItem('cat_server_url');
    var canUploadPdf = window._userPerms ? (window._userPerms.canUploadDocs || window._userPerms.isAdmin) : (typeof authGetCurrentUser === 'function' && authGetCurrentUser() && authGetCurrentUser().isAdmin);
    var modalPdfSection = document.getElementById('modalPdfSection');
    var modalPdfList    = document.getElementById('modalPdfList');
    var modalPdfUpload  = document.getElementById('modalPdfUpload');
    var modalPdfInput   = document.getElementById('modalPdfInput');

    if(modalPdfSection) modalPdfSection.style.display = 'none';

    if(canUploadPdf && editingId){
      var pForPdf = products.find(function(x){ return x.id === editingId; });
      if(pForPdf){
        if(modalPdfSection) modalPdfSection.style.display = '';

        function _pdfRenderList(files){
          var L = document.getElementById('modalPdfList');
          var U = document.getElementById('modalPdfUpload');
          if(!L) return;
          L.innerHTML = '';
          if(U) U.style.display = 'flex';
          if(!files || files.length === 0) return;
          L.innerHTML = files.map(function(f){
            var isImg = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.filename||'');
            var icon = isImg
              ? '<i class="ti ti-photo" style="font-size:18px;color:var(--copper);flex-shrink:0;"></i>'
              : '<i class="ti ti-file-type-pdf" style="font-size:18px;color:#E53E3E;flex-shrink:0;"></i>';
            return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);margin-bottom:4px;">'
              + icon
              + '<span style="font-size:13px;color:var(--ink);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(f.filename) + '</span>'
              + (f.uuid ? '<button data-uuid="' + escapeHtml(f.uuid) + '" class="pdf-del-btn" style="padding:3px 9px;border-radius:6px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0;">✕</button>' : '')
              + '</div>';
          }).join('');
          L.querySelectorAll('.pdf-del-btn').forEach(function(btn){
            btn.onclick = function(){ _pdfDeleteOne(btn.getAttribute('data-uuid')); };
          });
        }

        function _pdfDeleteOne(uuid){
          if(!uuid || !sUrl) return;
          var hDel = typeof window.authHeaders==='function' ? Object.assign({}, window.authHeaders()) : {};
          delete hDel['Content-Type'];
          fetch(sUrl + '/deleteDoc?uuid=' + encodeURIComponent(uuid), { method:'DELETE', headers: hDel })
            .then(function(r){ if(!r.ok) return Promise.reject('HTTP '+r.status); })
            .then(function(){
              pForPdf._docFiles = (pForPdf._docFiles || []).filter(function(f){ return f.uuid !== uuid; });
              var hasAny = pForPdf._docFiles.length > 0;
              pForPdf.hasDoc      = hasAny;
              pForPdf.docFilename = hasAny ? pForPdf._docFiles.map(function(f){ return f.filename; }).join(', ') : '';
              // Rendre AVANT save() : save() retire _docFiles de tous les
              // produits (champ local uniquement, jamais persisté — voir
              // js/storage.js) et pForPdf pointe vers le même objet que
              // products[idx2], donc _docFiles serait déjà effacé si on
              // l'utilisait après l'appel à save().
              var _filesSnapshot = pForPdf._docFiles;
              _pdfRenderList(_filesSnapshot);
              var idx2 = products.findIndex(function(x){ return x.id === editingId; });
              if(idx2 !== -1){ products[idx2].hasDoc = pForPdf.hasDoc; products[idx2].docFilename = pForPdf.docFilename; save(true, [products[idx2]]); }
              showToast('Fichier supprimé ✓', 'ok', 2000);
            })
            .catch(function(e){ showToast('Erreur suppression : '+e, 'err', 4000); });
        }

        function _pdfUploadFiles(fileList){
          if(!fileList || !fileList.length || !pForPdf || !pForPdf.ref) return;
          if(!sUrl){ showToast('Serveur non configuré', 'err', 4000); return; }
          var h = typeof window.authHeaders==='function' ? Object.assign({}, window.authHeaders()) : {};
          delete h['Content-Type'];
          var arr = Array.from(fileList);
          showToast('Envoi de '+arr.length+' fichier'+(arr.length>1?'s':'')+' en cours…', 'ok', 3000);
          Promise.all(arr.map(function(file){
            var fd = new FormData();
            fd.append('ref', pForPdf.ref);
            fd.append('document', file, file.name);
            return fetch(sUrl + '/pushDocs', { method:'POST', headers: h, body: fd })
              .then(function(r){ return r.ok ? r.json() : Promise.reject('HTTP '+r.status); })
              .then(function(data){ return { uuid: data.uuid, filename: data.filename || file.name, ref: pForPdf.ref }; });
          }))
          .then(function(newFiles){
            pForPdf._docFiles = (pForPdf._docFiles || []).concat(newFiles);
            pForPdf.hasDoc = true;
            pForPdf.docFilename = pForPdf._docFiles.map(function(f){ return f.filename; }).join(', ');
            // Rendre AVANT save() — voir commentaire équivalent dans _pdfDeleteOne.
            var _filesSnapshot = pForPdf._docFiles;
            _pdfRenderList(_filesSnapshot);
            var idx2 = products.findIndex(function(x){ return x.id === editingId; });
            if(idx2 !== -1){ products[idx2].hasDoc = true; products[idx2].docFilename = pForPdf.docFilename; save(true, [products[idx2]]); }
            showToast(arr.length+' PDF envoyé'+(arr.length>1?'s':'')+' ✓', 'ok', 2500);
            if(modalPdfInput) modalPdfInput.value = '';
          })
          .catch(function(e){ showToast('Erreur envoi PDF : '+e, 'err', 4000); });
        }

        if(modalPdfInput) modalPdfInput.onchange = function(){ _pdfUploadFiles(this.files); };

        // Charger la liste depuis le serveur
        if(sUrl && pForPdf.ref){
          var hList = typeof window.authHeaders==='function' ? Object.assign({}, window.authHeaders()) : {};
          delete hList['Content-Type'];
          var _pdfListEl = document.getElementById('modalPdfList');
          if(_pdfListEl) _pdfListEl.innerHTML = '<div style="font-size:12px;color:var(--ink-soft);padding:4px 0;">Chargement…</div>';
          fetch(sUrl + '/pullDocs?nofile=true&ref=' + encodeURIComponent(pForPdf.ref), { headers: hList })
            .then(function(r){
              if(!r.ok){ console.warn('[PDF] pullDocs status:', r.status); return null; }
              return r.json().catch(function(e){ console.warn('[PDF] json parse error:', e); return null; });
            })
            .then(function(d){
              var files = d && d.items ? d.items : [];
              pForPdf._docFiles = files;
              pForPdf.hasDoc = files.length > 0;
              pForPdf.docFilename = files.map(function(f){ return f.filename; }).join(', ');
              _pdfRenderList(files);
            })
            .catch(function(e){
              console.warn('[PDF] fetch error:', e);
              var files = pForPdf._docFiles || (pForPdf.hasDoc ? [{ uuid:'', filename: pForPdf.docFilename||'Document PDF' }] : []);
              _pdfRenderList(files);
            });
        } else {
          console.log('[PDF] pas de sUrl ou ref — sUrl:', sUrl, 'ref:', pForPdf.ref);
          _pdfRenderList(pForPdf._docFiles || []);
        }
      }
    } else if(window._proposeMode){
      // Mode "Proposer" : la ref n'existe pas encore côté serveur (nouveau
      // produit) ou le compte n'a pas canUploadDocs — upload DIFFÉRÉ, comme
      // pour un rapport de bug (voir reqSubmitBug dans requests.js) : les
      // fichiers restent en mémoire, envoyés à /pushDocsReq juste après que
      // btnSave ait confirmé l'enregistrement de la demande (voir actions.js),
      // avec la ref du formulaire — connue dès maintenant même en création,
      // c'est un champ obligatoire.
      if(modalPdfSection) modalPdfSection.style.display = '';
      var titleEl = document.getElementById('modalPdfSectionTitle');
      if(titleEl) titleEl.textContent = 'Documents (joints à la demande)';
      window._proposeAttachedFiles = [];

      function _proposeRenderFiles(){
        var L = document.getElementById('modalPdfList');
        var U = document.getElementById('modalPdfUpload');
        if(!L) return;
        if(U) U.style.display = 'flex';
        L.innerHTML = window._proposeAttachedFiles.map(function(f, i){
          var isImg = /^image\//.test(f.type);
          var icon = isImg
            ? '<i class="ti ti-photo" style="font-size:18px;color:var(--copper);flex-shrink:0;"></i>'
            : '<i class="ti ti-file-type-pdf" style="font-size:18px;color:#E53E3E;flex-shrink:0;"></i>';
          return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);margin-bottom:4px;">'
            + icon
            + '<span style="font-size:13px;color:var(--ink);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(f.name) + '</span>'
            + '<button data-idx="' + i + '" class="propose-file-del-btn" style="padding:3px 9px;border-radius:6px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0;">✕</button>'
            + '</div>';
        }).join('');
        L.querySelectorAll('.propose-file-del-btn').forEach(function(btn){
          btn.onclick = function(){
            window._proposeAttachedFiles.splice(parseInt(btn.getAttribute('data-idx'), 10), 1);
            _proposeRenderFiles();
          };
        });
      }
      _proposeRenderFiles();
      if(modalPdfInput) modalPdfInput.onchange = function(){
        Array.from(this.files || []).forEach(function(f){ window._proposeAttachedFiles.push(f); });
        this.value = '';
        _proposeRenderFiles();
      };
    }
    // ── Fin section PDF ──

    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    // Remise à zéro du défilement : gérée génériquement pour toutes les
    // fenêtres par _initScrollReset() dans js/init.js.
    // Empêcher iOS de focus automatiquement le premier input (évite zoom + clavier)
    var inputs = overlay.querySelectorAll('input, textarea, select');
    inputs.forEach(function(el){ el.setAttribute('readonly', 'readonly'); });
    setTimeout(function(){
      inputs.forEach(function(el){ el.removeAttribute('readonly'); });
    }, 300);
  }
  // En mode édition, le formulaire est pré-rempli avec le produit existant —
  // hasUnsavedInput() ne doit alerter que si quelque chose a réellement
  // changé par rapport à ces valeurs de départ, pas juste si les champs sont
  // non-vides (sinon la confirmation "Annuler la saisie" apparaît à chaque
  // fermeture, même sans la moindre modification — bug remonté par
  // l'utilisateur). Capturé dans openModal() juste après le pré-remplissage.
  //
  // Liste des champs couverts : doit rester alignée avec fillFormFromProduct()
  // ci-dessus. Un champ éditable oublié ici = une modification silencieusement
  // perdue en fermant par ✕/Échap, sans confirmation (bug remonté par
  // l'utilisateur — seuls 10 champs "auto-extraction" étaient suivis au
  // départ, oubliant fournisseur/délai/tags/3D/essentiel/specs/icône).
  var _formOriginalSnapshot = null;
  function _formSnapshotNow(){
    return {
      brand: fBrand.value.trim(), ref: fRef.value.trim(), family: fFamily.value.trim(),
      series: fSeries.value.trim(), url: fUrl.value.trim(), html: fHtml.value.trim(),
      name: fName.value.trim(), desc: fDesc.value.trim(), price: fPrice.value.trim(),
      photo: fPhoto.value.trim(),
      supplier: fSupplier.value.trim(),
      leadTime: fLeadTime ? fLeadTime.value.trim() : '',
      tags: fTags.value.trim(),
      available3DX: f3dAvailable.checked,
      available3DXLink: f3dLink.value.trim(),
      essential: fEssential ? fEssential.checked : false,
      suggestions: _sugRefs.slice().sort().join('|'),
      suggestionsHidden: _sugHidden.slice().sort().join('|'),
      spareParts: _sparePartsRefs.slice().sort().join('|'),
      sparePartsHidden: _sparePartsHidden.slice().sort().join('|'),
      specs: JSON.stringify(_specsRows),
      familyIcon: selectedFamilyIcon
    };
  }
  function hasUnsavedInput(){
    var current = _formSnapshotNow();
    if(!_formOriginalSnapshot){
      // Mode création : le formulaire démarre vide, tout champ rempli est une saisie à protéger.
      return !!(current.brand || current.ref || current.family || current.series ||
                current.url || current.html || current.name || current.desc ||
                current.price || current.photo || current.supplier || current.leadTime ||
                current.tags || current.available3DX || current.available3DXLink ||
                current.essential || current.suggestions || current.spareParts || (current.specs && current.specs !== '[]'));
    }
    return Object.keys(current).some(function(k){ return current[k] !== _formOriginalSnapshot[k]; });
  }
  function resetProposeModeUI(){
    if(!window._proposeMode) return;
    window._proposeMode = false;
    window._proposeOriginal = null;
    var title = document.getElementById('modalTitle');
    var btnSave = document.getElementById('btnSave');
    if(title) title.textContent = editingId ? 'Modifier le produit' : 'Ajouter un produit';
    if(btnSave) btnSave.textContent = 'Enregistrer';
  }
  window._resetProposeModeUI = resetProposeModeUI;

  function requestCloseModal(){
    // Garde-fou : X, "Annuler" et Escape appellent tous requestCloseModal(),
    // sans qu'aucun ne désactive le formulaire pendant que la confirmation
    // est affichée — un appel répété (Escape maintenu, double-clic...)
    // créait une nouvelle popup "Annuler la saisie" à chaque fois, empilées
    // les unes sur les autres (retour utilisateur : superposition de
    // fenêtres). Si une confirmation est déjà affichée, ne pas en recréer
    // une deuxième.
    if(document.getElementById('_discardConfirmPopup')) return;

    // Annuler depuis l'édition déverrouillée d'une demande : revenir à la
    // vue verrouillée de CETTE MÊME demande (annule les modifs, sans les
    // sauvegarder) plutôt que fermer toute la fenêtre — "Annuler" doit
    // annuler l'édition, pas quitter la consultation (retour utilisateur).
    // Avant resetProposeModeUI()/resetReviewModeUI() : on reste en mode
    // revue, ces fonctions ne doivent donc pas s'exécuter ici.
    if(window._reviewMode && window._reviewLocked === false && window._reviewItem){
      window._openReviewModal(window._reviewItem, window._reviewUser, true);
      return;
    }

    // Retenu AVANT resetReviewModeUI() (qui remet _reviewMode à false) —
    // sert à réafficher "Demandes en attente" juste en dessous une fois
    // cette fenêtre fermée (retour utilisateur : "ça doit faire comme si
    // elle était restée cachée derrière la fenêtre nouveau produit").
    // _reqRevealPanel (pas reqOpenPanel) : révélation instantanée d'un
    // panneau seulement masqué (voir _reqHidePanel dans requests.js), sans
    // le rouvrir/ré-animer/recharger sa liste depuis zéro — elle n'a pas
    // changé puisqu'on n'a fait que consulter, pas accepter/refuser.
    var wasReviewingFromRequestsList = !!window._reviewMode;

    // Réinitialiser le mode proposition / révision
    resetProposeModeUI();
    resetReviewModeUI();
    if(!hasUnsavedInput()){
     closeModal();
     if(wasReviewingFromRequestsList && typeof _reqRevealPanel === 'function') _reqRevealPanel();
    return;
    }

    var popup = document.createElement('div');
    popup.id = '_discardConfirmPopup';
    popup.style.cssText =
      'position:fixed;inset:0;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10000;';

    popup.innerHTML =
     '<div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +

        '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Annuler la saisie</div>' +

        '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Les informations saisies seront perdues.</div>' +

        '<div style="display:flex;flex-direction:column;gap:8px;">' +

         '<button id="_keepEditing" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Continuer la saisie</strong> — revenir au formulaire</button>' +

          '<button id="_discardChanges" style="padding:10px 14px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Annuler la saisie</strong> — fermer sans enregistrer</button>' +

        '</div>' +
      '</div>';

    document.body.appendChild(popup);

    popup.querySelector('#_keepEditing').addEventListener('click', function(){
      document.body.removeChild(popup);
    });

    popup.querySelector('#_discardChanges').addEventListener('click', function(){
      document.body.removeChild(popup);
      closeModal();
    });
  }
  // ── Logique suggestions autocomplete ────────────────────────────
  function _sugRenderChips(){
    if(!fSuggestionsChips) return;
    var prods = window.products || [];
    var canEdit = !!(window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin));
    fSuggestionsChips.innerHTML = _sugRefs.map(function(ref){
      var p = prods.find(function(x){ return x.ref === ref; });
      var visible = _sugHidden.indexOf(ref) === -1;
      var thumb = p && p.photo
        ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<i class=&quot;ti ti-photo-off&quot;></i>\'">'
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
        ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
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

  // ── Pièces de rechange — même mécanique que Produits suggérés ci-dessus
  // (champ + suggestions, puces, case à cocher, liaison réciproque côté
  // js/actions.js) — retour utilisateur : "ajouter une rubrique pièce de
  // rechange comme pour les suggestions". ──
  function _sparePartsRenderChips(){
    if(!fSparePartsChips) return;
    var prods = window.products || [];
    var canEdit = !!(window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin));
    fSparePartsChips.innerHTML = _sparePartsRefs.map(function(ref){
      var p = prods.find(function(x){ return x.ref === ref; });
      var visible = _sparePartsHidden.indexOf(ref) === -1;
      var thumb = p && p.photo
        ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<i class=&quot;ti ti-photo-off&quot;></i>\'">'
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
        ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
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
      title: '📂 Parcourir le catalogue — Produits suggérés',
      noun: 'suggestions',
      getRefs: function(){ return _sugRefs; },
      addRefs: function(refs){ refs.forEach(function(r){ if(_sugRefs.indexOf(r)===-1) _sugRefs.push(r); }); },
      renderChips: function(){ _sugRenderChips(); }
    },
    spareParts: {
      title: '📂 Parcourir le catalogue — Pièces de rechange',
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
              ? '<img src="'+escapeHtml(p.photo)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
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
    if(sugPickerTitleEl) sugPickerTitleEl.textContent = _sugPickerDefs[_sugPickerTarget].title;
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
    sugPickerOverlay.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

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

  // ── Logique caractéristiques techniques (clé/valeur libres) ─────
  var specsOverlay   = document.getElementById('specsOverlay');
  var specsRowsEl    = document.getElementById('specsRows');
  var btnOpenSpecs   = document.getElementById('btnOpenSpecs');
  var btnOpenSpecsLabel = document.getElementById('btnOpenSpecsLabel');
  var specsCloseBtn  = document.getElementById('specsCloseBtn');
  var btnAddSpecRow  = document.getElementById('btnAddSpecRow');

  function _specsRenderRows(){
    if(btnOpenSpecsLabel){
      var count = _specsRows.filter(function(r){ return (r.key||'').trim(); }).length;
      btnOpenSpecsLabel.textContent = count ? ('Caractéristiques (' + count + ')') : 'Ajouter des caractéristiques';
    }
    if(!specsRowsEl) return;
    // Grille (minmax(0,1fr) sur les 2 colonnes texte + 32px fixe pour le
    // bouton supprimer) au lieu de flex:1 sur des <input> — sans le
    // minmax(0,...), un <input> refuse de rétrécir sous sa largeur de
    // contenu par défaut, ce qui poussait le bouton supprimer hors de
    // l'écran sur mobile (retour utilisateur, bug confirmé à 375px).
    var colHeaders = document.getElementById('specsColHeaders');
    if(colHeaders) colHeaders.style.display = _specsRows.length ? 'grid' : 'none';
    specsRowsEl.innerHTML = _specsRows.map(function(row, ri){
      return '<div class="spec-row" data-ri="'+ri+'" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 32px;gap:8px;align-items:start;">'
        + '  <input type="text" class="spec-key" data-ri="'+ri+'" placeholder="Nom (ex: Entrées)" autocomplete="off" value="'+escapeHtml(row.key||'')+'" style="min-width:0;padding:7px 9px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font-size:12.5px;">'
        // textarea (pas input) : permet le retour à la ligne (Entrée) dans la
        // valeur — utile pour une caractéristique qui regroupe plusieurs
        // sous-valeurs (ex. une puissance différente par tension) qui
        // formaient sinon un seul long paragraphe illisible d'un bloc
        // (retour utilisateur, capture à l'appui). rows="1" + resize
        // vertical : reste compact par défaut, s'agrandit à la demande.
        + '  <textarea class="spec-value" data-ri="'+ri+'" placeholder="Valeur (ex: 8) — Entrée pour un retour à la ligne" rows="1" style="min-width:0;padding:7px 9px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font-size:12.5px;font-family:inherit;resize:vertical;min-height:34px;">'+escapeHtml(row.value||'')+'</textarea>'
        + '  <button type="button" class="spec-row-del" data-ri="'+ri+'" aria-label="Supprimer" style="width:32px;height:32px;flex-shrink:0;background:none;border:1.5px solid var(--line);border-radius:7px;color:var(--ink-soft);cursor:pointer;font-size:13px;padding:0;display:flex;align-items:center;justify-content:center;">✕</button>'
        + '</div>';
    }).join('');
    specsRowsEl.querySelectorAll('.spec-key').forEach(function(input){
      input.addEventListener('input', function(){
        _specsRows[parseInt(input.getAttribute('data-ri'), 10)].key = input.value;
      });
      // Entrée dans "Nom" → passe directement au champ "Valeur" de la même
      // ligne, sans toucher souris/Tab (retour utilisateur : accélérer la
      // saisie répétitive de caractéristiques techniques).
      input.addEventListener('keydown', function(e){
        if(e.key !== 'Enter') return;
        e.preventDefault();
        var ri = input.getAttribute('data-ri');
        var valueEl = specsRowsEl.querySelector('.spec-value[data-ri="'+ri+'"]');
        if(valueEl) valueEl.focus();
      });
    });
    specsRowsEl.querySelectorAll('.spec-value').forEach(function(input){
      input.addEventListener('input', function(){
        _specsRows[parseInt(input.getAttribute('data-ri'), 10)].value = input.value;
      });
      // Tab depuis "Valeur" de la DERNIÈRE ligne → ajoute une nouvelle
      // ligne et y place le focus, au lieu de devoir cliquer "+ Ajouter une
      // caractéristique" à chaque ligne (retour utilisateur : améliorer la
      // saisie des caractéristiques techniques). Entrée reste réservée au
      // retour à la ligne DANS la valeur (déjà en place), donc seul Tab
      // (sans Shift, qui irait en arrière) déclenche l'ajout ici.
      input.addEventListener('keydown', function(e){
        if(e.key !== 'Tab' || e.shiftKey) return;
        var ri = parseInt(input.getAttribute('data-ri'), 10);
        if(ri !== _specsRows.length - 1) return; // pas la dernière ligne : Tab normal vers ✕
        e.preventDefault();
        _specsAddRowAndFocus();
      });
    });
    specsRowsEl.querySelectorAll('.spec-row-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        _specsRows.splice(parseInt(btn.getAttribute('data-ri'), 10), 1);
        _specsRenderRows();
      });
    });
  }

  function _specsAddRowAndFocus(){
    _specsRows.push({ key: '', value: '' });
    _specsRenderRows();
    var newKeyEl = specsRowsEl.querySelector('.spec-key[data-ri="'+(_specsRows.length-1)+'"]');
    if(newKeyEl) newKeyEl.focus();
  }

  if(btnAddSpecRow){
    btnAddSpecRow.addEventListener('click', function(){
      _specsAddRowAndFocus();
    });
  }
  // Snapshot pris à l'ouverture — sert à savoir si la croix doit demander
  // confirmation avant de fermer (même logique que "Annuler la saisie" sur
  // le formulaire produit — retour utilisateur).
  var _specsSnapshotOnOpen = null;
  if(btnOpenSpecs){
    btnOpenSpecs.addEventListener('click', function(){
      _specsSnapshotOnOpen = JSON.stringify(_specsRows);
      if(specsOverlay){
        specsOverlay.style.display = 'flex';
        document.body.classList.add('modal-open');
      }
    });
  }
  function _specsCloseModal(){
    _specsRenderRows(); // met à jour le compteur sur le bouton avant de fermer
    if(specsOverlay){
      specsOverlay.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  }
  function _specsHasChanges(){
    return _specsSnapshotOnOpen !== null && JSON.stringify(_specsRows) !== _specsSnapshotOnOpen;
  }
  function _specsRequestClose(){
    // Même garde-fou anti-empilement que requestCloseModal() : ne pas
    // recréer une confirmation si une est déjà affichée.
    if(document.getElementById('_specsDiscardPopup')) return;
    if(!_specsHasChanges()){ _specsCloseModal(); return; }

    var popup = document.createElement('div');
    popup.id = '_specsDiscardPopup';
    popup.style.cssText =
      'position:fixed;inset:0;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10650;';
    popup.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +
        '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Annuler la saisie</div>' +
        '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Les caractéristiques modifiées seront perdues.</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button id="_specsKeepEditing" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Continuer la saisie</strong> — revenir aux caractéristiques</button>' +
          '<button id="_specsDiscardChanges" style="padding:10px 14px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Annuler la saisie</strong> — fermer sans enregistrer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(popup);

    popup.querySelector('#_specsKeepEditing').addEventListener('click', function(){
      document.body.removeChild(popup);
    });
    popup.querySelector('#_specsDiscardChanges').addEventListener('click', function(){
      document.body.removeChild(popup);
      _specsRows = JSON.parse(_specsSnapshotOnOpen);
      _specsCloseModal();
    });
  }
  if(specsCloseBtn) specsCloseBtn.addEventListener('click', _specsRequestClose);
  // Bouton "Enregistrer" : ferme directement, sans demander — c'est
  // l'action explicite de garder les changements (contrairement à la
  // croix, qui demande confirmation s'il y a des modifications non
  // enregistrées).
  var specsSaveBtn = document.getElementById('specsSaveBtn');
  if(specsSaveBtn) specsSaveBtn.addEventListener('click', _specsCloseModal);

  // Exposer _specsRows (converties en objet {clé: valeur}) pour actions.js
  window._getSpecsObj = function(){
    var obj = {};
    _specsRows.forEach(function(row){
      var k = (row.key || '').trim();
      if(k) obj[k] = row.value || '';
    });
    return obj;
  };

  // Exposer openModal globalement pour requests.js
  window._openModal = openModal;

  // Mode proposition : ouvrir la modale avec un flag pour que btnSave envoie une requête
  window._openProposeModal = function(id){
    window._proposeMode = true;
    window._proposeOriginal = id ? (products.find(function(p){ return p.id===id; }) || null) : null;
    openModal(id || null);
    // Changer le titre et le bouton
    var title = document.getElementById('modalTitle');
    var btnSave = document.getElementById('btnSave');
    if(title) title.textContent = id ? 'Proposer une modification' : 'Proposer un produit';
    if(btnSave) btnSave.textContent = 'Envoyer la demande';
  };

  // Mode révision de demande (admin) : ouvre la modale standard "Modifier le
  // produit", pré-remplie avec les données soumises, pour permettre de tout
  // modifier avant de valider. `item` est l'entrée de la file de demandes.
  // Verrouille/déverrouille le formulaire de revue d'une demande — fusionne
  // ce qui était deux fenêtres séparées (résumé en lecture seule, puis un
  // "Modifier" ouvrant le formulaire complet ailleurs) en une seule : on
  // reste sur la même fenêtre, seul l'état verrouillé change (retour
  // utilisateur). Cible tout ce qui est interactif dans le corps du
  // formulaire et la section documents — pas l'entête/pied de page, gérés
  // séparément par _reviewSetLocked ci-dessous.
  function _reviewFormFields(){
    // Scopé à #modalOverlay précisément (pas juste ".modal-body", classe
    // générique réutilisée par d'autres fenêtres — ex. "Signaler un bug" —
    // qui se retrouveraient sinon avec des champs restés désactivés après
    // la fermeture de CETTE fenêtre-ci).
    return document.querySelectorAll('#modalOverlay .modal-body input, #modalOverlay .modal-body textarea, #modalOverlay .modal-body select, #modalOverlay .modal-body button, #modalPdfSection input, #modalPdfSection button, #modalPdfSection label');
  }
  function _reviewSetLocked(locked){
    window._reviewLocked = !!locked;
    _reviewFormFields().forEach(function(el){
      if(locked) el.setAttribute('disabled', 'disabled');
      else el.removeAttribute('disabled');
    });
    var btnCancelEl        = document.getElementById('btnCancel');
    var btnSaveEl          = document.getElementById('btnSave');
    var btnReviewRefuseEl  = document.getElementById('btnReviewRefuse');
    var btnReviewUnlockEl  = document.getElementById('btnReviewUnlock');
    var btnReviewAcceptEl  = document.getElementById('btnReviewAccept');
    if(btnCancelEl)       btnCancelEl.style.display       = locked ? 'none' : '';
    if(btnSaveEl)          btnSaveEl.style.display        = locked ? 'none' : '';
    if(btnReviewRefuseEl)  btnReviewRefuseEl.style.display = locked ? '' : 'none';
    if(btnReviewUnlockEl)  btnReviewUnlockEl.style.display = locked ? '' : 'none';
    if(btnReviewAcceptEl)  btnReviewAcceptEl.style.display = locked ? '' : 'none';
  }

  // locked (défaut true) : ouvre en consultation verrouillée avec
  // Refuser/Modifier/Accepter — "Modifier" appelle _reviewSetLocked(false)
  // pour déverrouiller SUR CETTE MÊME fenêtre plutôt que d'en ouvrir une
  // autre.
  window._openReviewModal = function(item, user, locked){
    var data     = item.data || {};
    var original = data._reqOriginal;
    var isNew    = !original;
    var p = isNew ? Object.assign({}, data) : Object.assign({}, original, data);

    window._proposeMode = false;
    window._reviewMode  = true;
    window._reviewItem  = item;
    window._reviewUser  = user;
    window._reviewBase  = {
      id: p.id || null,
      createdAt: p.createdAt || null,
      priceHistory: Array.isArray(p.priceHistory) ? p.priceHistory.slice() : [],
      price: p.price || '',
      priceCatalogue: p.priceCatalogue || ''
    };

    editingId = null;
    resetForm();
    fillFormFromProduct(p);
    _formOriginalSnapshot = _formSnapshotNow();
    modalTitle.textContent = (isNew ? 'Nouveau produit : ' : 'Modification proposée : ') + (p.ref || '');
    modalLeftFoot.textContent = 'Soumis par ' + user + (data._reqAt ? ' · ' + new Date(data._reqAt).toLocaleString('fr-FR') : '');
    var btnSave = document.getElementById('btnSave');
    if(btnSave) btnSave.textContent = 'Valider et accepter';
    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    _reviewSetLocked(locked !== false);
  };

  function resetReviewModeUI(){
    // Toujours remettre l'état verrouillé (Refuser/Modifier/Accepter, champs
    // désactivés) à zéro, MÊME si _reviewMode était déjà à false — sinon cet
    // état pouvait fuiter vers un usage tout à fait normal du formulaire
    // (ex. "Ajouter un produit" affichait Refuser/Modifier/Accepter à la
    // place d'Annuler/Enregistrer). openModal() n'appelait jamais cette
    // fonction, donc le seul filet de sécurité est ici, avant le early
    // return ci-dessous (retour utilisateur, capture à l'appui).
    _reviewSetLocked(false);
    if(!window._reviewMode) return;
    window._reviewMode = false;
    window._reviewItem = null;
    window._reviewUser = null;
    window._reviewBase = null;
    var title = document.getElementById('modalTitle');
    var btnSave = document.getElementById('btnSave');
    if(title) title.textContent = editingId ? 'Modifier le produit' : 'Ajouter un produit';
    if(btnSave) btnSave.textContent = 'Enregistrer';
  }
  window._resetReviewModeUI = resetReviewModeUI;

  document.getElementById('btnAdd').addEventListener('click', function(){ openModal(null); });
  document.getElementById('btnFabAdd').addEventListener('click', function(){ openModal(null); });

  // Loupe FAB — ouvre une zone de recherche flottante sur place
  var fabSearchBox   = document.getElementById('fabSearchBox');
  var fabSearchInput = document.getElementById('fabSearchInput');
  var fabSearchClose = document.getElementById('fabSearchClose');
  if(!fabSearchBox){ fabSearchBox = { classList:{ add:function(){}, remove:function(){}, contains:function(){ return false; } } }; }
  if(!fabSearchInput){ fabSearchInput = { value:'', addEventListener:function(){}, focus:function(){} }; }
  if(!fabSearchClose){ fabSearchClose = { addEventListener:function(){} }; }


  function switchToCatalogueIfHome(){
    var homePage = document.getElementById('homePage');
    var catalogueWrap = document.getElementById('catalogueWrap');
    var hdrCountChip = document.getElementById('hdrCountChip');
    if(homePage && !homePage.classList.contains('hidden')){
      homePage.classList.add('hidden');
      if(catalogueWrap) catalogueWrap.style.display = '';
      if(hdrCountChip) hdrCountChip.style.display = '';
    }
  }
  var btnFabSearchEl = document.getElementById('btnFabSearch') || { classList:{ add:function(){}, remove:function(){}, contains:function(){ return false; } }, addEventListener:function(){} };
  if(btnFabSearchEl) btnFabSearchEl.addEventListener('click', function(){
    if(fabSearchBox.classList.contains('open') && !fabSearchInput.value.trim()){
      fabSearchBox.classList.remove('open');
      btnFabSearchEl.classList.remove('search-open');
    } else {
      fabSearchBox.classList.add('open');
      btnFabSearchEl.classList.add('search-open');
      fabSearchInput.focus();
      // Basculer vers le catalogue si on est sur la home
      switchToCatalogueIfHome();
    }
  });
  fabSearchClose.addEventListener('click', function(){
    fabSearchBox.classList.remove('open');
    btnFabSearchEl.classList.remove('search-open');
    fabSearchInput.value = '';
    searchInputEl.value = '';
    render();
  });
  fabSearchInput.addEventListener('input', function(){
    searchInputEl.value = fabSearchInput.value;
    switchToCatalogueIfHome();
    render();
  });
  fabSearchInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      if(getFilteredProducts().length > 0){
        fabSearchBox.classList.remove('open');
        btnFabSearchEl.classList.remove('search-open');
      }
    }
  });
  document.getElementById('modalClose').addEventListener('click', requestCloseModal);
  document.getElementById('btnCancel').addEventListener('click', requestCloseModal);

  // ── Boutons de la vue "demande produit" verrouillée ──────────────────
  var btnReviewRefuseEl = document.getElementById('btnReviewRefuse');
  var btnReviewUnlockEl = document.getElementById('btnReviewUnlock');
  var btnReviewAcceptEl = document.getElementById('btnReviewAccept');
  if(btnReviewUnlockEl) btnReviewUnlockEl.addEventListener('click', function(){ _reviewSetLocked(false); });
  if(btnReviewRefuseEl) btnReviewRefuseEl.addEventListener('click', async function(){
    if(!window._reviewItem) return;
    btnReviewRefuseEl.disabled = true;
    var ok = await window.reqRefuse(window._reviewItem.ref, window._reviewUser);
    btnReviewRefuseEl.disabled = false;
    if(ok){
      showToast('Demande refusée', 'ok', 2500);
      if(typeof window._resetReviewModeUI === 'function') window._resetReviewModeUI();
      closeModal();
      if(typeof reqOpenPanel === 'function') reqOpenPanel();
      if(typeof reqUpdateBadge === 'function') reqUpdateBadge();
    } else {
      showToast('Erreur lors du refus', 'err', 3000);
    }
  });
  if(btnReviewAcceptEl) btnReviewAcceptEl.addEventListener('click', async function(){
    if(!window._reviewItem) return;
    btnReviewAcceptEl.disabled = true;
    var ok = await window.reqAccept(window._reviewItem.ref, window._reviewUser);
    btnReviewAcceptEl.disabled = false;
    if(ok){
      showToast('Demande acceptée ✓', 'ok', 2500);
      if(typeof window._resetReviewModeUI === 'function') window._resetReviewModeUI();
      closeModal();
      if(typeof reqOpenPanel === 'function') reqOpenPanel();
      if(typeof reqUpdateBadge === 'function') reqUpdateBadge();
    } else {
      showToast('Erreur lors de l\'acceptation', 'err', 3000);
    }
  });
  // Un clic sur le fond gris ne ferme plus la fenêtre : seul un clic explicite
  // sur « Annuler » ou la croix peut fermer la fiche, pour éviter de perdre
  // une saisie en cours par erreur.
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape' || !overlay.classList.contains('open')) return;
    // Des fenêtres s'ouvrent PAR-DESSUS la fiche produit (caractéristiques
    // techniques, historique des prix, aperçu photo) sans se fermer elles-
    // mêmes avant que ce listener ne s'exécute — sans ce garde-fou, Échap
    // fermait/demandait confirmation sur la fenêtre imbriquée ET sur la
    // fiche produit en dessous en même temps (retour utilisateur).
    var nestedOpen = (specsOverlay && specsOverlay.style.display !== 'none')
      || (priceModalOverlay && priceModalOverlay.style.display !== 'none')
      || (imgPreviewOverlay && imgPreviewOverlay.classList.contains('show'));
    if(nestedOpen) return;
    requestCloseModal();
  });

  // ---------- Tabs ----------
  function switchTab(name){
    document.querySelectorAll('.tab-btn').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-tab')===name);
    });
    document.getElementById('tab-auto').classList.toggle('active', name==='auto');
    document.getElementById('tab-manual').classList.toggle('active', name==='manual');
  }
  document.querySelectorAll('.tab-btn').forEach(function(b){
    b.addEventListener('click', function(){ switchTab(b.getAttribute('data-tab')); });
  });

  fPhoto.addEventListener('input', updatePhotoPreview);
  var pricePreviewEl = document.getElementById('pricePreview');
  // fPrice input géré par la modale prix

  // ---------- Zone prix de vente ----------
  var sellingPriceZoneEl = document.getElementById('sellingPriceZone');
  var fSellingPrice      = document.getElementById('fSellingPrice');
  var sellingPriceHint   = document.getElementById('sellingPriceHint');
  // fTags déclaré en haut du fichier
  // f3dAvailable, f3dLink, f3dLinkRow déclarés en haut du fichier

  function updateSellingPriceHint(){
    if(!sellingPriceZoneEl || sellingPriceZoneEl.style.display === 'none') return;
    var catalogue = parsePriceNumber(fPrice.value);
    var selling   = parsePriceNumber(fSellingPrice.value);
    if(catalogue && selling){
      var diff = ((selling - catalogue) / catalogue) * 100;
      var sign = diff >= 0 ? '+' : '';
      sellingPriceHint.textContent = 'Prix catalogue fabricant : ' + formatPrice(fPrice.value) +
        ' → Votre prix : ' + formatPrice(fSellingPrice.value) +
        ' (' + sign + diff.toFixed(1) + ' %)';
    } else {
      sellingPriceHint.textContent = '';
    }
  }
  fSellingPrice.addEventListener('input', updateSellingPriceHint);

  function update3dLinkVisibility(){
    f3dLinkRow.style.display = f3dAvailable.checked ? 'block' : 'none';
  }
  f3dAvailable.addEventListener('change', update3dLinkVisibility);

  function updatePhotoPreview(){
    if(fPhoto.value.trim()){
      photoPreview.innerHTML = '<img src="'+escapeHtml(fPhoto.value.trim())+'" onerror="this.parentElement.innerHTML=\'<span class=&quot;hint sans&quot; style=&quot;padding:6px;text-align:center;&quot;>image introuvable</span>\'">';
    }else{
      photoPreview.innerHTML = '<span class="hint sans" style="padding:6px;text-align:center;">aperçu</span>';
    clearPhotoGallery();
    }
  }

  // ---------- Extraction from pasted HTML ----------
  function decodeEntities(str){
    var ta = document.createElement('textarea');
    ta.innerHTML = str;
    return ta.value;
  }

  // Retire les balises HTML et nettoie les espaces/sauts de ligne
  function stripHtml(str){
    if(!str) return str;
    // Remplace les balises de bloc par des espaces pour éviter les mots collés
    var s = str
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|strong|b|em|i)[^>]*>/gi, ' ');
    // Retire toutes les balises restantes
    s = s.replace(/<[^>]+>/g, '');
    // Décode les entités HTML
    s = decodeEntities(s);
    // Nettoie les espaces multiples et sauts de ligne
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  // Bribes d'interface parasites parfois capturées avec le texte extrait
  // (ex: widget de prix Sonepar replié) — retirées automatiquement de tout
  // champ extrait, que ce soit via copier-coller ou l'extension Chrome
  // (même pipeline d'extraction, voir extractFromHtml).
  var EXTRACT_JUNK_PHRASES = [
    /sans\s+offre/gi,
    /d[ée]tails?\s*[:\-]?\s*du\s*[:\-]?\s*prix\s*[:\-]?\s*ferm[ée]s?/gi
  ];
  function stripJunkPhrases(str){
    if(!str) return str;
    var s = str;
    EXTRACT_JUNK_PHRASES.forEach(function(re){ s = s.replace(re, ' '); });
    // Recolle les séparateurs (tirets, barres, puces) laissés orphelins par la suppression.
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/([-–—|•])(\s*\1)+/g, '$1').replace(/^[\s\-–—|•]+|[\s\-–—|•]+$/g, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  function extractFromHtml(htmlStr, pageUrl){
    var result = {photo:null, photos:[], name:null, desc:null, price:null, brand:null, ref:null, supplier:null};
    var doc;
    try{
      var parser = new DOMParser();
      doc = parser.parseFromString(htmlStr, 'text/html');
    }catch(e){
      return result;
    }

    function meta(selectors){
      for(var i=0;i<selectors.length;i++){
        var el = doc.querySelector(selectors[i]);
        if(el){
          var v = el.getAttribute('content') || el.textContent;
          if(v && v.trim()) return v.trim();
        }
      }
      return null;
    }

    function txt(selectors){
      for(var i=0;i<selectors.length;i++){
        var el = doc.querySelector(selectors[i]);
        if(el){
          var v = el.textContent || el.getAttribute('data-value') || el.getAttribute('value') || '';
          if(v.trim()) return v.trim();
        }
      }
      return null;
    }

    // ── Détection du fournisseur depuis l'URL ──────────────────────────
    var hostname = '';
    try{ hostname = new URL(pageUrl).hostname.replace('www.',''); }catch(e){}

    var supplierMap = {
      'balluff.com'           : 'Balluff',
      'balluff.fr'            : 'Balluff',
      'phoenixcontact.com'    : 'Phoenix Contact',
      'phoenixcontact.fr'     : 'Phoenix Contact',
      'sick.com'              : 'SICK',
      'sick.fr'               : 'SICK',
      'se.com'                : 'Schneider Electric',
      'schneider-electric.com': 'Schneider Electric',
      'schneider-electric.fr' : 'Schneider Electric',
      'ifm.com'               : 'IFM',
      'pepperl-fuchs.com'     : 'Pepperl+Fuchs',
      'pepperl-fuchs.fr'      : 'Pepperl+Fuchs',
      'turck.com'             : 'Turck',
      'turck.fr'              : 'Turck',
      'omron.com'             : 'Omron',
      'omron.fr'              : 'Omron',
      'festo.com'             : 'Festo',
      'festo.fr'              : 'Festo',
      'smc.eu'                : 'SMC',
      'smc.fr'                : 'SMC',
      'rs-online.com'         : 'RS Components',
      'rs-components.fr'      : 'RS Components',
      'distrelec.fr'          : 'Distrelec',
      'conrad.fr'             : 'Conrad',
      'mouser.fr'             : 'Mouser',
      'digikey.fr'            : 'DigiKey',
      'farnell.com'           : 'Farnell',
      'element14.com'         : 'Farnell',
      'automation24.fr'       : 'Automation24',
      'weidmuller.com'        : 'Weidmüller',
      'weidmuller.fr'         : 'Weidmüller',
      'wago.com'              : 'WAGO',
      'wago.fr'               : 'WAGO',
      'legrand.fr'            : 'Legrand',
      'legrand.com'           : 'Legrand',
      'hager.fr'              : 'Hager',
      'hager.com'             : 'Hager',
      'siemens.com'           : 'Siemens',
      'siemens.fr'            : 'Siemens',
      'abb.com'               : 'ABB',
      'abb.fr'                : 'ABB',
      'rockwellautomation.com': 'Rockwell Automation',
      'keyence.fr'            : 'Keyence',
      'keyence.com'           : 'Keyence',
      'banner-france.fr'      : 'Banner',
      'bannerengineering.com' : 'Banner',
      'contrinex.com'         : 'Contrinex',
      'baumer.com'            : 'Baumer',
      'leuze.com'             : 'Leuze',
      'leuze.fr'              : 'Leuze',
      'carlo-gavazzi.com'     : 'Carlo Gavazzi',
      'Cembre.com'            : 'Cembre',
    };
    for(var domain in supplierMap){
      if(hostname === domain || hostname.endsWith('.' + domain)){
        result.supplier = supplierMap[domain];
        break;
      }
    }

    // ── JSON-LD (source la plus fiable) ───────────────────────────────
    var ldNodes = doc.querySelectorAll('script[type="application/ld+json"]');
    for(var i=0;i<ldNodes.length;i++){
      try{
        var data = JSON.parse(ldNodes[i].textContent);
        var candidates = Array.isArray(data) ? data : [data];
        if(data['@graph']) candidates = candidates.concat(data['@graph']);
        for(var c=0;c<candidates.length;c++){
          var node = candidates[c];
          if(!node) continue;
          var type = node['@type'];
          var typeStr = Array.isArray(type) ? type.join(',') : (type||'');
          if(typeStr.toLowerCase().indexOf('product') !== -1){
            if(!result.name  && node.name)        result.name  = node.name;
            if(!result.desc  && node.description) result.desc  = node.description;
            if(!result.ref   && node.sku)         result.ref   = node.sku;
            if(!result.ref   && node.mpn)         result.ref   = node.mpn;
            if(!result.ref   && node.productID)   result.ref   = node.productID;
            if(!result.brand && node.brand){
              var b = node.brand;
              result.brand = (typeof b === 'object') ? (b.name || '') : String(b);
            }
            if(!result.photo){
              var img = node.image;
              if(Array.isArray(img)) img = img[0];
              if(img && typeof img === 'object') img = img.url;
              if(img) result.photo = img;
            }
            if(!result.price){
              var offers = node.offers;
              if(Array.isArray(offers)) offers = offers[0];
              if(offers){
                var price = offers.price || offers.lowPrice;
                var currency = offers.priceCurrency || '';
                if(price) result.price = (price + ' ' + currency).trim();
              }
            }
          }
        }
      }catch(e){ /* ignore malformed JSON-LD */ }
    }

    // ── Open Graph / meta fallbacks ────────────────────────────────────
    if(!result.name) result.name = meta(['meta[property="og:title"]','meta[name="og:title"]','title']);
    if(!result.desc) result.desc = meta(['meta[property="og:description"]','meta[name="description"]']);
    if(!result.photo) result.photo = meta(['meta[property="og:image"]','meta[name="twitter:image"]']);
    if(!result.price) result.price = meta(['meta[property="product:price:amount"]','meta[property="og:price:amount"]']);
    if(!result.brand) result.brand = meta(['meta[property="product:brand"]','meta[name="brand"]','meta[itemprop="brand"]']);
    if(!result.ref)   result.ref   = meta(['meta[property="product:sku"]','meta[name="sku"]','meta[itemprop="sku"]',
                                           'meta[property="product:mpn"]','meta[name="mpn"]']);

    // ── Sélecteurs DOM génériques (itemprop, data-attributes) ─────────
    if(!result.ref){
      result.ref = txt([
        '[itemprop="sku"]','[itemprop="mpn"]','[itemprop="productID"]',
        '[data-sku]','[data-ref]','[data-product-ref]','[data-product-id]',
        '[class*="product-ref"]','[class*="product-sku"]','[class*="sku"]',
        '[class*="ref-produit"]','[class*="reference"]'
      ]);
    }
    if(!result.brand){
      result.brand = txt([
        '[itemprop="brand"]','[data-brand]','[class*="brand-name"]',
        '[class*="product-brand"]','[class*="manufacturer"]',
        '[itemprop="manufacturer"]'
      ]);
    }

    // ── Règles spécifiques par site fournisseur ────────────────────────
    if(hostname.includes('balluff')){
      if(!result.ref)   result.ref   = txt(['.product-ordernumber','.order-number','[class*="ordernumber"]','[class*="article-number"]']);
      if(!result.brand) result.brand = 'Balluff';
    }
    if(hostname.includes('phoenixcontact')){
      if(!result.ref)   result.ref   = txt(['.product-order-number','.order-nr','[class*="article"]','[data-article-number]']);
      if(!result.brand) result.brand = 'Phoenix Contact';
    }
    if(hostname.includes('sick')){
      if(!result.ref)   result.ref   = txt(['.part-number','.product-id','[class*="partNumber"]','[data-part-number]']);
      if(!result.brand) result.brand = 'SICK';
    }
    if(hostname.includes('ifm')){
      if(!result.ref)   result.ref   = txt(['[class*="article-number"]','.article-no','[data-article]']);
      if(!result.brand) result.brand = 'IFM';
    }
    if(hostname.includes('schneider') || hostname.includes('se.com')){
      if(!result.ref)   result.ref   = txt(['.product-reference','.ref','[class*="reference"]','[data-reference]']);
      if(!result.brand) result.brand = 'Schneider Electric';
    }
    if(hostname.includes('wago')){
      if(!result.ref)   result.ref   = txt(['.article-number','[class*="article"]','[data-article-number]']);
      if(!result.brand) result.brand = 'WAGO';
    }
    if(hostname.includes('siemens')){
      if(!result.ref)   result.ref   = txt(['.mlfb','[class*="mlfb"]','[class*="article-number"]','[data-mlfb]']);
      if(!result.brand) result.brand = 'Siemens';
    }
    if(hostname.includes('rs-online') || hostname.includes('rs-components')){
      if(!result.ref)   result.ref   = txt(['.keyAttribute','[class*="stock-no"]','[class*="part-number"]']);
      if(!result.supplier && !result.brand) result.supplier = 'RS Components';
    }
    if(hostname.includes('sonepar')){
      // Référence fournisseur
      if(!result.ref){
        // Chercher "Réf. Fournisseur" puis valeur suivante
        var refLabel = doc.querySelector('[class*="supplier-ref"],[class*="product-ref"],[data-ref]');
        if(refLabel) result.ref = refLabel.textContent.trim();
        // Fallback : meta-keywords contient la ref (ex: "GV2L14,SCH,SCHGV2L14")
        if(!result.ref){
          var kw = doc.querySelector('meta[name="meta-keywords"]') || doc.querySelector('meta[name="keywords"]');
          if(kw){
            var kwVal = kw.getAttribute('content') || '';
            // Prendre le premier token qui ressemble à une ref produit
            var kwParts = kwVal.split(',');
            for(var ki=0; ki<kwParts.length; ki++){
              var kp = kwParts[ki].trim();
              if(kp.length >= 4 && kp.length <= 20 && /[A-Z][A-Z0-9]/.test(kp) && !/^\d+$/.test(kp)){
                result.ref = kp; break;
              }
            }
          }
        }
      }
      // Nom : meta-title est plus propre que og:title sur Sonepar
      if(!result.name){
        var mt = doc.querySelector('meta[name="meta-title"]');
        if(mt) result.name = mt.getAttribute('content') || '';
      }
      // Description Sonepar — chercher dans les metas ET via regex sur HTML brut
      if(!result.desc){
        // 1. Via DOMParser (fonctionne si le <head> est présent)
        var md = doc.querySelector('meta[name="meta-description"]')
               || doc.querySelector('meta[name="description"]');
        if(md){
          var mdVal = md.getAttribute('content') || '';
          mdVal = mdVal.replace(/&lt;[^&]+&gt;/g,'').replace(/&amp;/g,'&');
          mdVal = mdVal.replace(/<[^>]+>/g,'');
          mdVal = mdVal.replace(/\s+/g,' ').trim();
          if(mdVal.length > 10) result.desc = mdVal;
        }
        // 2. Regex sur HTML brut (si le proxy ne retourne pas le <head>)
        if(!result.desc){
          var descRegex = /meta[^>]+(?:name=["'](?:meta-)?description["'][^>]+content|content=["']([^"']+)["'][^>]+name=["'](?:meta-)?description)["']\s*([^"']*)/i;
          var mContent = htmlStr.match(/name=["']meta-description["'][^>]*content=["']([^"']+)["']/i)
                      || htmlStr.match(/content=["']([^"']+)["'][^>]*name=["']meta-description["']/i)
                      || htmlStr.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)
                      || htmlStr.match(/content=["']([^"']+)["'][^>]*name=["']description["']/i);
          if(mContent && mContent[1]){
            var raw = mContent[1];
            raw = raw.replace(/&lt;[^&]+&gt;/g,'').replace(/&amp;/g,'&').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
            if(raw.length > 10) result.desc = raw;
          }
        }
        // 3. Fallback DOM
        if(!result.desc){
          var descEl = doc.querySelector('[class*="description-detaillee"],[class*="product-description"],[class*="long-desc"],[itemprop="description"]');
          if(descEl) result.desc = descEl.textContent.replace(/\s+/g,' ').trim().slice(0, 500);
        }
      }
      // Marque
      if(!result.brand) result.brand = 'Schneider Electric'; // défaut Sonepar FR majoritairement SE
      // Photo : prendre la première image cloudinary PRODUCT/IMAGE
      if(!result.photo){
        var imgs = doc.querySelectorAll('img[src*="PRODUCT/IMAGE"]');
        if(imgs.length > 0) result.photo = imgs[0].getAttribute('src') || '';
      }
      if(!result.supplier) result.supplier = 'Sonepar';
    }

    // ── Nettoyage de la référence ──────────────────────────────────────
    if(result.ref){
      // Garder seulement la partie alphanumérique principale (supprimer labels "Réf :", "SKU :" etc.)
      result.ref = result.ref
        .replace(/^(ref\.?|réf\.?|sku|mpn|art\.?|n°|no\.?|référence|reference|article)\s*[:=\-]?\s*/i, '')
        .replace(/\s+/g,' ')
        .trim()
        .slice(0, 60);
    }

    // ── Nettoyage marque ───────────────────────────────────────────────
    if(result.brand){
      result.brand = stripHtml(result.brand).replace(/\s+/g,' ').trim().slice(0, 50);
    }

    // ── Prix fallback DOM ──────────────────────────────────────────────
    if(!result.price){
      var priceEl = doc.querySelector('[class*="price"], [itemprop="price"], [data-price]');
      if(priceEl){
        var ptxt = priceEl.getAttribute('content') || priceEl.textContent;
        if(ptxt) result.price = ptxt.trim().replace(/\s+/g,' ').slice(0,40);
      }
    }
    if(!result.price){
      var bodyText = doc.body ? doc.body.textContent : '';
      var m = bodyText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(€|\$|£|EUR|USD|GBP)/);
      if(m) result.price = m[0].trim();
    }

    // ── Résolution URL photo relative ──────────────────────────────────
    if(result.photo && pageUrl){
      try{ result.photo = new URL(result.photo, pageUrl).href; }catch(e){}
    }

    // ── Collecte de toutes les images de la page ──────────────────────
    var seenUrls = {};

    // Normalise une URL pour le dédoublonnage :
    // supprime les paramètres de taille courants (w=, h=, width=, size=, format=, quality=...)
    function normalizeForDedup(url){
      try{
        var u = new URL(url);
        var remove = ['w','h','width','height','size','format','quality','dpr','fit','auto','crop','scale','resize','tr','imwidth','imheight','wid','hei'];
        remove.forEach(function(k){ u.searchParams.delete(k); });
        // Aussi ignorer les suffixes de taille dans le path ex: image_300x300.jpg → image.jpg
        var path = u.pathname.replace(/_\d+x\d+(\.\w+)$/, '$1').replace(/-\d+x\d+(\.\w+)$/, '$1');
        return u.origin + path + u.search;
      }catch(e){ return url; }
    }

    function addPhoto(url){
      if(!url) return;
      try{
        var abs = pageUrl ? new URL(url, pageUrl).href : url;
        // Exclure data URI trop courts (pixels tracking, placeholders base64)
        if(abs.startsWith('data:') && abs.length < 500) return;
        // Filtrer les URLs qui ressemblent à des icônes/logos de nav
        var lower = abs.toLowerCase();
        if(/(\/(icon|logo|favicon|sprite|pixel|tracking|banner|badge|flag|avatar|placeholder)|picto)/.test(lower)) return;
        if(/\.(svg)(\?|$)/.test(lower)) return;
        // Dédoublonner sur l'URL normalisée (sans params de taille)
        var key = normalizeForDedup(abs);
        if(seenUrls[key]) return;
        seenUrls[key] = true;
        // Stocker la plus grande version disponible : préférer l'URL originale sans resize
        result.photos.push(abs);
      }catch(e){}
    }

    // Photo principale en premier
    if(result.photo) addPhoto(result.photo);

    // Toutes les images JSON-LD déjà parsées
    var ldNodes2 = doc.querySelectorAll('script[type="application/ld+json"]');
    for(var li=0; li<ldNodes2.length; li++){
      try{
        var ld2 = JSON.parse(ldNodes2[li].textContent);
        var cands2 = Array.isArray(ld2) ? ld2 : [ld2];
        if(ld2['@graph']) cands2 = cands2.concat(ld2['@graph']);
        cands2.forEach(function(n){
          if(!n) return;
          var imgs = n.image;
          if(!imgs) return;
          if(!Array.isArray(imgs)) imgs = [imgs];
          imgs.forEach(function(im){
            if(typeof im === 'object') im = im.url;
            addPhoto(im);
          });
        });
      }catch(e){}
    }

    // Toutes les balises <img> avec src
    // Filtres : exclure images trop petites (icônes) et éléments hors zone produit
    var imgEls = doc.querySelectorAll('img[src], img[data-src]');
    for(var ii=0; ii<imgEls.length; ii++){
      var el = imgEls[ii];

      // Exclure si dimensions déclarées trop petites (icônes, pictos)
      var w = parseInt(el.getAttribute('width')  || el.getAttribute('data-width')  || 0);
      var h = parseInt(el.getAttribute('height') || el.getAttribute('data-height') || 0);
      if((w > 0 && w < 80) || (h > 0 && h < 80)) continue;

      // Exclure si l'image est dans un élément de navigation/footer/header
      var parent = el.parentElement;
      var inNav = false;
      while(parent && parent !== doc.body){
        var tag = parent.tagName ? parent.tagName.toLowerCase() : '';
        var cls = (parent.className || '').toLowerCase();
        var pid = (parent.id || '').toLowerCase();
        if(tag === 'nav' || tag === 'header' || tag === 'footer'
          || /nav|header|footer|menu|breadcrumb|sidebar|aside|widget|social|share|cookie|banner|overlay/.test(cls)
          || /nav|header|footer|menu|sidebar/.test(pid)){
          inNav = true; break;
        }
        parent = parent.parentElement;
      }
      if(inNav) continue;

      var dataSrc = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
      var src = el.getAttribute('src');

      // Srcset : prendre la plus grande résolution
      var srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
      if(srcset){
        var parts = srcset.split(',').map(function(s){ return s.trim().split(/\s+/); });
        parts.sort(function(a,b){ return (parseInt(b[1])||0) - (parseInt(a[1])||0); });
        if(parts[0] && parts[0][0]){ addPhoto(parts[0][0]); continue; }
      }

      addPhoto(dataSrc || src);
    }

    // ── Nettoyage final ────────────────────────────────────────────────
    if(result.name)  result.name  = stripJunkPhrases(stripHtml(result.name).replace(/\s+/g,' ').trim());
    if(result.desc)  result.desc  = stripJunkPhrases(stripHtml(result.desc).replace(/\s+/g,' ').trim());
    if(result.price) result.price = stripJunkPhrases(decodeEntities(result.price).replace(/\s+/g,' ').trim());

    return result;
  }

  // ── Détection iOS → classe sur body ─────────────────────────────
  if(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream){
    document.body.classList.add('ios');
  }

  // ── Bouton mobile Android : Coller & Extraire ────────────────────
  // ── État de chargement partagé entre les deux boutons d'extraction ──
  // (le clic sur "Coller le lien et extraire" déclenche "Extraire depuis
  // l'URL" en interne — les deux doivent refléter le même état pendant
  // l'appel réseau, pour que l'utilisateur voie que quelque chose se passe
  // et ne puisse pas déclencher plusieurs extractions en même temps).
  var btnPasteExtract    = document.getElementById('btnPasteExtract');
  var btnExtractFromUrl  = document.getElementById('btnExtractFromUrl');
  var _pasteExtractLabel = btnPasteExtract ? btnPasteExtract.innerHTML : '';
  var _extractUrlLabel   = btnExtractFromUrl ? btnExtractFromUrl.innerHTML : '';
  function setExtractLoading(isLoading){
    if(btnPasteExtract){
      btnPasteExtract.disabled = isLoading;
      btnPasteExtract.innerHTML = isLoading
        ? '<span class="btn-spinner" aria-hidden="true"></span> Extraction en cours…'
        : _pasteExtractLabel;
    }
    if(btnExtractFromUrl){
      btnExtractFromUrl.disabled = isLoading;
      btnExtractFromUrl.innerHTML = isLoading
        ? '<span class="btn-spinner" aria-hidden="true"></span> Extraction…'
        : _extractUrlLabel;
    }
  }

  if(btnPasteExtract){
    btnPasteExtract.addEventListener('click', function(){
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText()
          .then(function(text){
            text = (text || '').trim();
            if(text && /^https?:\/\//.test(text)){
              fUrl.value = text;
              btnExtractFromUrl.click();
            } else {
              showToast('Aucun lien trouvé dans le presse-papier', 'warn', 2500);
            }
          })
          .catch(function(){
            showToast('Accès au presse-papier refusé', 'warn', 2500);
          });
      } else {
        showToast('Presse-papier non disponible', 'warn', 2500);
      }
    });
  }

  btnExtractFromUrl.addEventListener('click', function(){
    var url = fUrl.value.trim();
    var hintEl = document.getElementById('extractUrlHint');
    if(!url){
      showToast('Collez d\'abord une URL dans le champ', 'warn', 2500);
      return;
    }
    setExtractLoading(true);
    hintEl.style.display = 'block';
    hintEl.style.color   = 'var(--ink-soft)';
    hintEl.textContent   = '⏳ Récupération de la page en cours…';

    // Essayer plusieurs proxies CORS en cascade
    var proxies = [
      function(u){ return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
      function(u){ return 'https://corsproxy.io/?' + encodeURIComponent(u); },
      function(u){ return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); }
    ];

    function tryProxy(idx){
      if(idx >= proxies.length){
        setExtractLoading(false);
        hintEl.style.color  = '#DC2626';
        hintEl.textContent  = '✗ Impossible de récupérer la page — collez le code source manuellement.';
        return;
      }
      hintEl.textContent = '⏳ Tentative '+(idx+1)+'/'+proxies.length+'…';
      var proxyUrl = proxies[idx](url);
      var controller = new AbortController();
      var timer = setTimeout(function(){ controller.abort(); }, 5000);
      fetch(proxyUrl, {signal: controller.signal})
        .then(function(r){
          clearTimeout(timer);
          if(!r.ok) throw new Error('HTTP '+r.status);
          return r.text();
        })
        .then(function(text){
          var html = text;
          try{ var json=JSON.parse(text); if(json.contents) html=json.contents; }catch(e){}
          if(!html || html.length < 100) throw new Error('Contenu vide');
          // Décoder les entités HTML si le proxy les a encodées
          if(html.indexOf('&lt;') !== -1){
            // Double décodage si nécessaire
            var ta = document.createElement('textarea');
            ta.innerHTML = html;
            html = ta.value;
            // Si encore encodé
            if(html.indexOf('&lt;') !== -1){
              ta.innerHTML = html;
              html = ta.value;
            }
          }
          fHtml.value = html;
          document.getElementById('btnExtract').click();
          setExtractLoading(false);
          hintEl.style.color  = '#059669';
          hintEl.textContent  = '✓ Extraction réussie !';
          setTimeout(function(){ hintEl.style.display = 'none'; }, 8000);
        })
        .catch(function(err){
          clearTimeout(timer);
          tryProxy(idx + 1);
        });
    }

    tryProxy(0);
  });

  document.getElementById('btnExtract').addEventListener('click', function(){
    var html = fHtml.value;
    if(!html.trim()){
      extractStatus.className = 'extract-status warn show';
      extractStatus.textContent = 'Collez d\'abord le code source de la page produit dans le champ ci-dessus.';
      return;
    }
    var data = extractFromHtml(html, fUrl.value.trim());
    var found = [];
    if(data.name)     { fName.value     = data.name;              found.push('nom'); }
    if(data.desc)     { fDesc.value     = stripHtml(data.desc);   found.push('description'); renderTagSuggestions(); }
    if(data.price)    { fPrice.value    = data.price;             found.push('prix'); }
    if(data.photo)    { fPhoto.value    = data.photo; updatePhotoPreview(); found.push('photo'); }
    // Afficher la galerie si plusieurs photos trouvées (ou même une seule via proxy)
    if(data.photos && data.photos.length > 0){ showPhotoGallery(data.photos); }
    else { clearPhotoGallery(); }
    if(data.brand)    { fBrand.value    = data.brand;             found.push('marque'); }
    if(data.ref)      { fRef.value      = data.ref;               found.push('référence'); }
    if(data.supplier) { fSupplier.value = data.supplier;          found.push('fournisseur'); }
    // Déclencher le contrôle doublon dès que ref/brand sont remplis (même via extension)
    checkDuplicateRef();

    if(found.length){
      extractStatus.className = 'extract-status ok show';
      extractStatus.textContent = 'Informations trouvées : ' + found.join(', ') + '. Vérifiez puis complétez à la main si besoin (onglet « Saisie manuelle »).';
      switchTab('manual');
    }else{
      extractStatus.className = 'extract-status warn show';
      extractStatus.textContent = 'Aucune information standard détectée sur cette page. Passez à l\'onglet « Saisie manuelle » pour remplir les champs vous-même.';
      switchTab('manual');
    }
  });