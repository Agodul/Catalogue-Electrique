// ============================================================
// modal.js — Formulaire produit, modale, autocomplete
// ============================================================

function resetForm(){
    fBrand.value=''; fRef.value=''; fFamily.value=''; fSeries.value=''; fSupplier.value=''; fUrl.value=''; fHtml.value=''; if(chkShowHtml){ chkShowHtml.checked=false; } if(htmlSourceContent){ htmlSourceContent.style.display='none'; }
    familyIconRow.classList.remove('show');
    selectedFamilyIcon = 'ti-package';
    familyIconPreviewI.className = 'ti ti-package';
    fName.value=''; fDesc.value=''; fTags.value=''; fPrice.value=''; fPhoto.value='';
    if(priceDisplayRow) priceDisplayRow.style.display = 'none';
    if(priceCreateRow)  priceCreateRow.style.display  = 'block';
    f3dAvailable.checked = false;
    f3dLink.value = '';
    f3dLinkRow.style.display = 'none';
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

  function openModal(id){
    editingId = id || null;
    resetForm();
    if(editingId){
      var p = products.find(function(x){return x.id===editingId;});
      if(p){
        modalTitle.textContent = 'Modifier le produit';
        modalLeftFoot.textContent = 'Ajouté le ' + (p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '—');
        fBrand.value = p.brand||''; fRef.value = p.ref||''; fUrl.value = p.url||'';
        fFamily.value = p.family||''; fSeries.value = p.series||''; fSupplier.value = p.supplier||'';
        fName.value = p.name||''; fDesc.value = p.desc||''; fTags.value = (Array.isArray(p.tags) ? p.tags.join(', ') : '');
        f3dAvailable.checked = !!p.available3DX;
        f3dLink.value = p.available3DXLink || '';
        update3dLinkVisibility();
        fPrice.value = p.price||''; fPhoto.value = p.photo||'';
        updatePhotoPreview();
        renderPriceHistory(p);
        switchTab('manual');
        if(btnOpenPriceModal) btnOpenPriceModal.style.display = 'flex';
        if(priceDisplayRow) priceDisplayRow.style.display = 'flex';
        if(priceCreateRow)  priceCreateRow.style.display  = 'none';
        updatePriceDisplay();
      }
    }else{
      modalTitle.textContent = 'Ajouter un produit';
      modalLeftFoot.textContent = '';

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
    overlay.classList.add('open');
    // Empêcher iOS de focus automatiquement le premier input (évite zoom + clavier)
    var inputs = overlay.querySelectorAll('input, textarea, select');
    inputs.forEach(function(el){ el.setAttribute('readonly', 'readonly'); });
    setTimeout(function(){
      inputs.forEach(function(el){ el.removeAttribute('readonly'); });
    }, 300);
  }
  function hasUnsavedInput(){
    return !!(fBrand.value.trim() || fRef.value.trim() || fFamily.value.trim() || fSeries.value.trim() ||
              fUrl.value.trim() || fHtml.value.trim() || fName.value.trim() || fDesc.value.trim() ||
              fPrice.value.trim() || fPhoto.value.trim());
  }
  function requestCloseModal(){
    if(!hasUnsavedInput()){
     closeModal();
    return;
    }

    var popup = document.createElement('div');
    popup.style.cssText =
      'position:fixed;inset:0;background:rgba(28,26,23,.5);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10000;';

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
  document.getElementById('btnAdd').addEventListener('click', function(){ openModal(null); });
  document.getElementById('btnFabAdd').addEventListener('click', function(){ openModal(null); });

  // Loupe FAB — ouvre une zone de recherche flottante sur place
  var fabSearchBox   = document.getElementById('fabSearchBox');
  var fabSearchInput = document.getElementById('fabSearchInput');
  var fabSearchClose = document.getElementById('fabSearchClose');

  var btnFabSearchEl = document.getElementById('btnFabSearch');
  btnFabSearchEl.addEventListener('click', function(){
    if(fabSearchBox.classList.contains('open') && !fabSearchInput.value.trim()){
      fabSearchBox.classList.remove('open');
      btnFabSearchEl.classList.remove('search-open');
    } else {
      fabSearchBox.classList.add('open');
      btnFabSearchEl.classList.add('search-open');
      fabSearchInput.focus();
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
  // Un clic sur le fond gris ne ferme plus la fenêtre : seul un clic explicite
  // sur « Annuler » ou la croix peut fermer la fiche, pour éviter de perdre
  // une saisie en cours par erreur.
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && overlay.classList.contains('open')) requestCloseModal(); });

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
  var fTags              = document.getElementById('fTags');
  var f3dAvailable       = document.getElementById('f3dAvailable');
  var f3dLink            = document.getElementById('f3dLink');
  var f3dLinkRow         = document.getElementById('f3dLinkRow');

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

  