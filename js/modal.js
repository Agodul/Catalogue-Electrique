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
  var fTags             = document.getElementById('fTags');
  var familyIconRow     = document.getElementById('familyIconRow');
  var familyIconPreviewI= document.getElementById('familyIconPreviewI');
  var selectedFamilyIcon= 'ti-package';

  photoPreview.addEventListener('click', function(){
    var img = photoPreview.querySelector('img');
    if(!img) return;
    imgPreviewImg.src = img.src;
    imgPreviewOverlay.classList.add('show');
  });
 viewOverlay.addEventListener("click", function (e) {
    if (e.target === viewOverlay) {
        viewOverlay.style.display = "none";
    }
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
  function openPriceModal(){
    var p = products.find(function(x){ return x.id === editingId; });
    if(!p) return;

    // Ref produit en sous-titre
    document.getElementById('priceModalRef').textContent = (p.brand ? p.brand + ' — ' : '') + (p.ref || p.name || '');

    // Prix actuel
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
    document.getElementById('priceModalNewCatalogue').value = '';
    document.getElementById('priceModalNewRemise').value = '';
    document.getElementById('priceModalError').style.display = 'none';

    priceModalOverlay.style.display = 'flex';
  }

  function closePriceModal(){ priceModalOverlay.style.display = 'none'; }

  function renderPriceModalTable(p){
    var tbody = document.getElementById('priceModalBody');
    var emptyEl = document.getElementById('priceModalEmpty');
    tbody.innerHTML = '';

    var history = Array.isArray(p.priceHistory) ? p.priceHistory : [];
    var all = history.map(function(h){ return {price: h.price, date: h.date, current: false}; });
    if(p.price) all.push({price: p.price, date: null, current: true});

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

  // Ajouter un nouveau prix
  document.getElementById('priceModalAddBtn').addEventListener('click', function(){
    var rawCat = document.getElementById('priceModalNewCatalogue').value.trim();
    var rawRem = document.getElementById('priceModalNewRemise').value.trim();
    var rawDate = document.getElementById('priceModalNewDate').value;
    var errEl = document.getElementById('priceModalError');
    errEl.style.display = 'none';

    if(!rawCat){ errEl.textContent = 'Veuillez saisir un prix catalogue.'; errEl.style.display='block'; return; }

    var p = products.find(function(x){ return x.id === editingId; });
    if(!p) return;

    var history = Array.isArray(p.priceHistory) ? p.priceHistory.slice() : [];
    // Sauvegarder le prix actuel dans l'historique
    if(p.price) history.push({ price: p.price, date: rawDate ? new Date(rawDate).getTime() : Date.now() });

    var newPrice = formatPrice(rawRem || rawCat);
    p.priceHistory = history;
    p.price = newPrice;
    fPrice.value = newPrice;
    updatePriceDisplay();

    save(); render();
    renderPriceHistory(p);
    renderPriceModalTable(p);
    document.getElementById('priceModalCurrent').textContent = newPrice;
    document.getElementById('priceModalNewCatalogue').value = '';
    document.getElementById('priceModalNewRemise').value = '';
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
        if(fLeadTime) fLeadTime.value = p.leadTime||'';
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
            return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);margin-bottom:4px;">'
              + '<i class="ti ti-file-type-pdf" style="font-size:18px;color:#E53E3E;flex-shrink:0;"></i>'
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
              var idx2 = products.findIndex(function(x){ return x.id === editingId; });
              if(idx2 !== -1){ products[idx2].hasDoc = pForPdf.hasDoc; products[idx2].docFilename = pForPdf.docFilename; save(true); }
              showToast('Fichier supprimé ✓', 'ok', 2000);
              _pdfRenderList(pForPdf._docFiles);
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
            var idx2 = products.findIndex(function(x){ return x.id === editingId; });
            if(idx2 !== -1){ products[idx2].hasDoc = true; products[idx2].docFilename = pForPdf.docFilename; save(true); }
            showToast(arr.length+' PDF envoyé'+(arr.length>1?'s':'')+' ✓', 'ok', 2500);
            _pdfRenderList(pForPdf._docFiles);
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
              console.log('[PDF] pullDocs response:', d);
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
    }
    // ── Fin section PDF ──

    overlay.classList.add('open');
    document.body.classList.add('modal-open');
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
    if(result.name)  result.name  = stripHtml(result.name).replace(/\s+/g,' ').trim();
    if(result.desc)  result.desc  = stripHtml(result.desc).replace(/\s+/g,' ').trim();
    if(result.price) result.price = decodeEntities(result.price).replace(/\s+/g,' ').trim();

    return result;
  }

  // ── Détection iOS → classe sur body ─────────────────────────────
  if(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream){
    document.body.classList.add('ios');
  }

  // ── Bouton mobile Android : Coller & Extraire ────────────────────
  var btnPasteExtract = document.getElementById('btnPasteExtract');
  if(btnPasteExtract){
    btnPasteExtract.addEventListener('click', function(){
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText()
          .then(function(text){
            text = (text || '').trim();
            if(text && /^https?:\/\//.test(text)){
              fUrl.value = text;
              document.getElementById('btnExtractFromUrl').click();
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

  document.getElementById('btnExtractFromUrl').addEventListener('click', function(){
    var url = fUrl.value.trim();
    var hintEl = document.getElementById('extractUrlHint');
    if(!url){
      showToast('Collez d\'abord une URL dans le champ', 'warn', 2500);
      return;
    }
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
    if(data.desc)     { fDesc.value     = stripHtml(data.desc);   found.push('description'); }
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