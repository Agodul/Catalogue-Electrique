// ============================================================
// price.js — Gestion des prix, modale, historique
// ============================================================

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
  priceModalOverlay.addEventListener('click', function(e){ if(e.target === priceModalOverlay) closePriceModal(); });

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
  function formatPrice(raw){
    var v = raw.trim();
    if(!v) return v;
    // Si une devise est déjà présente (symbole ou code), on ne touche à rien
    if(/[€$£¥]|EUR|USD|GBP|CHF|CAD/i.test(v)) return v;
    return v + ' €';
  }

  // Extrait la valeur numérique d'un prix affiché (ex. "1 234,56 €" -> 1234.56)
  function parsePriceNumber(str){
    if(!str) return null;
    var cleaned = str.replace(/[^\d.,]/g, '').trim();
    if(!cleaned) return null;
    // Gère à la fois "1234.56" et "1234,56" et "1.234,56"
    if(cleaned.indexOf(',') !== -1 && cleaned.indexOf('.') !== -1){
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }else if(cleaned.indexOf(',') !== -1){
      cleaned = cleaned.replace(',', '.');
    }
    var n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  document.getElementById('btnSave').addEventListener('click', function(){
    var brand = fBrand.value.trim();
    var ref = fRef.value.trim();
    if(!brand || !ref){
      alert('La marque et la référence sont obligatoires.');
      return;
    }
    var cataloguePrice = formatPrice(fPrice.value);
    var sellingPriceRaw = fSellingPrice ? fSellingPrice.value.trim() : '';
    var newPrice = cataloguePrice;

    // En mode création : si un prix de vente est saisi, le prix catalogue va en historique
    // et le prix de vente devient le prix actuel
    var initialHistory = [];
    if(!editingId && sellingPriceRaw && sellingPriceZoneEl.style.display !== 'none'){
      var sellingPrice = formatPrice(sellingPriceRaw);
      if(cataloguePrice) initialHistory.push({price: cataloguePrice, date: Date.now()});
      newPrice = sellingPrice;
    } else if(!editingId && cataloguePrice){
      // Pas de prix de vente saisi : prix catalogue = prix actuel, historique vide
      newPrice = cataloguePrice;
    }

    // Sauvegarder l'icône si c'est une nouvelle famille
    var familyVal = fFamily.value.trim();
    if(familyVal && familyIconRow.classList.contains('show')){
      familyIcons[familyVal] = selectedFamilyIcon;
      saveFamilyIcons();
    }

    var payload = {
      brand: brand,
      ref: ref,
      family: familyVal,
      familyIcon: familyVal ? (familyIcons[familyVal] || selectedFamilyIcon || getFamilyIcon(familyVal)) : '',
      series: fSeries.value.trim(),
      supplier: fSupplier.value.trim(),
      url: fUrl.value.trim(),
      name: fName.value.trim(),
      desc: stripHtml(fDesc.value.trim()),
      tags: fTags.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean),
      available3DX: f3dAvailable.checked,
      available3DXLink: f3dLink.value.trim(),
      price: newPrice,
      priceCatalogue: cataloguePrice || '',
      photo: fPhoto.value.trim()
    };
    if(editingId){
      var idx = products.findIndex(function(x){return x.id===editingId;});
      if(idx !== -1){
        var existing = products[idx];
        var oldPrice = (existing.price||'').trim();
        if(oldPrice && oldPrice !== newPrice.trim()){
          var history = Array.isArray(existing.priceHistory) ? existing.priceHistory.slice() : [];
          history.push({price: oldPrice, date: Date.now()});
          payload.priceHistory = history;
        }
        products[idx] = Object.assign({}, existing, payload);
        // Propager l'icône à tous les produits de la même famille
        if(familyVal && payload.familyIcon){
          products.forEach(function(p){
            if(p.family === familyVal) p.familyIcon = payload.familyIcon;
          });
        }
      }
    }else{
      payload.id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
      // Propager l'icône aux produits existants de la même famille
      if(familyVal && payload.familyIcon){
        products.forEach(function(p){
          if(p.family === familyVal && !p.familyIcon) p.familyIcon = payload.familyIcon;
        });
      }
      payload.createdAt = Date.now();
      payload.priceHistory = initialHistory;
      products.push(payload);
    }
    // Animation 5 — flash vert sur le bouton enregistrer
    var btnSaveEl = document.getElementById('btnSave');
    btnSaveEl.classList.remove('save-anim');
    void btnSaveEl.offsetWidth;
    btnSaveEl.classList.add('save-anim');

    save();
    render();
    var savedId = editingId || products[products.length - 1].id;

    // Fermer après la fin du flash (1.2s)
    setTimeout(function(){
      btnSaveEl.classList.remove('save-anim');
      closeModal();
      openView(savedId);
    }, 900);
  });

  // ---------- Search / filter ----------
  searchInputEl.addEventListener('input', render);
  brandFilterEl.addEventListener('change', render);
  familyFilterEl.addEventListener('change', render);
  seriesFilterEl.addEventListener('change', render);

  // ── Tri par prix ──────────────────────────────────────────────
  window._priceSort = null; // null | 'asc' | 'desc'
  var sortPriceBtn  = document.getElementById('sortPriceBtn');
  var sortPriceIcon = document.getElementById('sortPriceIcon');
  if(sortPriceBtn){
    sortPriceBtn.addEventListener('click', function(){
      if(window._priceSort === null){
        window._priceSort = 'asc';
        sortPriceBtn.classList.add('active-asc');
        sortPriceBtn.classList.remove('active-desc');
        if(sortPriceIcon) sortPriceIcon.className = 'ti ti-sort-ascending sort-icon';
      } else if(window._priceSort === 'asc'){
        window._priceSort = 'desc';
        sortPriceBtn.classList.remove('active-asc');
        sortPriceBtn.classList.add('active-desc');
        if(sortPriceIcon) sortPriceIcon.className = 'ti ti-sort-descending sort-icon';
      } else {
        window._priceSort = null;
        sortPriceBtn.classList.remove('active-asc','active-desc');
        if(sortPriceIcon) sortPriceIcon.className = 'ti ti-arrows-sort sort-icon';
      }
      _lastRenderKey = ''; render();
    });
  }

  // Utilitaire debounce pour le filtre prix
  function debounce(fn, delay){
    var t;
    return function(){ clearTimeout(t); t = setTimeout(fn, delay); };
  }

  // ── Filtre par prix ──────────────────────────────────────────
  var priceMinInput = document.getElementById('priceMin');
  var priceMaxInput = document.getElementById('priceMax');
  var priceResetBtn = document.getElementById('priceFilterReset');
  if(priceMinInput) priceMinInput.addEventListener('input', debounce(function(){ _lastRenderKey=''; render(); }, 300));
  if(priceMaxInput) priceMaxInput.addEventListener('input', debounce(function(){ _lastRenderKey=''; render(); }, 300));
  if(priceResetBtn) priceResetBtn.addEventListener('click', function(){
    if(priceMinInput) priceMinInput.value = '';
    if(priceMaxInput) priceMaxInput.value = '';
    _lastRenderKey = ''; render();
  });

  document.querySelectorAll('.grp-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      groupBy = btn.getAttribute('data-group');
      document.querySelectorAll('.grp-btn').forEach(function(b){
        b.classList.toggle('active', b===btn);
      });
      render();
    });
  });

  // ---------- Menu ⋮ (Exporter / Importer / Nettoyer) ----------
  // ── Paramètres ──────────────────────────────────────────────────────
  var btnSettings      = document.getElementById('btnSettings');
  var settingsOverlay  = document.getElementById('settingsOverlay');
  var settingsClose    = document.getElementById('settingsClose');
  var settingsFamilyList = document.getElementById('settingsFamilyList');
  var settingsEditingFamily = null; // famille en cours de modif depuis Paramètres

  