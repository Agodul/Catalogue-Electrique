// ---------- Save product ----------
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
        payload.updatedAt = Date.now(); // marquer comme modifié pour la sync serveur
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
      payload.updatedAt = Date.now();
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
  searchInputEl.addEventListener('input', function(){
    // Si on est sur la home et qu'on tape, basculer vers le catalogue
    var homePage = document.getElementById('homePage');
    if(homePage && !homePage.classList.contains('hidden') && searchInputEl.value.trim().length > 0){
      showCatalogueAll();
    }
    render();
  });
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

  function renderSettingsFamilies(){
    refreshKnownFamilies();
    // Compter produits par famille
    var counts = {};
    products.forEach(function(p){ if(p.family) counts[p.family] = (counts[p.family]||0)+1; });

    if(knownFamilies.length === 0){
      settingsFamilyList.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:10px 0;">Aucune famille définie.</p>';
      return;
    }
    settingsFamilyList.innerHTML = knownFamilies.sort().map(function(f){
      var icon = getFamilyIcon(f);
      var count = counts[f] || 0;
      return '<div class="family-icon-row-settings" data-family="'+escapeHtml(f)+'">'
        + '<div class="family-icon-thumb"><i class="ti '+icon+'" id="settings-thumb-'+escapeHtml(f)+'"></i></div>'
        + '<div class="family-icon-name">'+escapeHtml(f)+'</div>'
        + '<div class="family-icon-count">'+count+(count>1?' réf':' réf')+'</div>'
        + '<button class="family-icon-change-btn" data-family="'+escapeHtml(f)+'"><i class="ti ti-pencil"></i></button>'
        + '</div>';
    }).join('');

    settingsFamilyList.querySelectorAll('.family-icon-change-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        settingsEditingFamily = btn.getAttribute('data-family');
        selectedFamilyIcon = getFamilyIcon(settingsEditingFamily);
        iconPickerSearch.value = '';
        renderIconGrid('');
        iconPickerModal.classList.add('show');
      });
    });
  }

  var SERVER_KEY           = 'cat_server_url';
  var SERVER_SYNC_KEY      = 'cat_server_sync';
  var SERVER_LAST_SYNC_KEY = 'cat_server_last_sync';
  var serverUrl  = '';
  var serverSync = false;

  function loadServerConfig(){
    serverUrl  = localStorage.getItem(SERVER_KEY) || '';
    serverSync = localStorage.getItem(SERVER_SYNC_KEY) === '1';
    updateServerSubtitle();
    if(serverSync && serverUrl) setTimeout(startSyncPolling, 1000);
  }

  function updateServerSubtitle(){
    var el = document.getElementById('serverSettingsSub');
    if(el) el.textContent = serverUrl ? (serverSync ? '🟢 '+serverUrl : '⚪ '+serverUrl) : 'Non configuré';
  }

  function saveServerConfig(){
    localStorage.setItem(SERVER_KEY, serverUrl);
    localStorage.setItem(SERVER_SYNC_KEY, serverSync ? '1' : '0');
    updateServerSubtitle();
  }

  // ── Polling /check toutes les 30s ─────────────────────────────────
  var _syncInterval = null;

  function getLastLocalTimestamp(){
    if(!products || products.length === 0) return 0;
    return products.reduce(function(max, p){
      var ts = p.updatedAt || p.createdAt || 0;
      return ts > max ? ts : max;
    }, 0);
  }

  async function doSyncCheck(){
    if(!serverUrl || !serverSync) return;
    try{
      var lastSync = localStorage.getItem(SERVER_LAST_SYNC_KEY) || '0';
      var checkUrl = serverUrl+'/check' + (lastSync !== '0' ? '?timestamp='+lastSync : '');
      var r = await fetch(checkUrl);
      if(!r.ok) return;
      var data = await r.json();
      if(data.count > 0){
        // Il y a des nouveautés → sync différentielle par ref
        await syncFromServer(false);
      }
    }catch(e){ /* silencieux */ }
  }

  function startSyncPolling(){
    stopSyncPolling();
    if(!serverUrl || !serverSync) return;
    doSyncCheck();
    _syncInterval = setInterval(doSyncCheck, 30000);
  }

  function stopSyncPolling(){
    if(_syncInterval){ clearInterval(_syncInterval); _syncInterval = null; }
  }

  // ── Sync vers serveur ─────────────────────────────────────────────
  async function pushToServer(){
    if(!serverUrl || !serverSync) return;
    try{
      // Push tous les produits locaux — le serveur ignore les plus anciens (via createdAt)
      await fetch(serverUrl+'/pushDatas', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(products)
      });
    }catch(e){ console.warn('pushToServer:', e.message); }
  }

  // ── Pull différentiel : récupère les nouveautés serveur et fusionne par ref ──
  async function syncFromServer(silent){
    if(!serverUrl) return;
    try{
      var lastSync = localStorage.getItem(SERVER_LAST_SYNC_KEY) || '0';
      var pullUrl  = serverUrl+'/pullDatas' + (lastSync !== '0' ? '?date='+lastSync : '');
      var r = await fetch(pullUrl);
      if(!r.ok) throw new Error('HTTP '+r.status);
      var data = await r.json();

      var serverItems = [];
      if(data && Array.isArray(data.items)){
        serverItems = data.items.map(function(item){ return item.data; });
      } else if(Array.isArray(data)){
        serverItems = data;
      }

      // Mettre à jour lastSync
      localStorage.setItem(SERVER_LAST_SYNC_KEY, Date.now().toString());
      if(serverItems.length === 0) return;

      // Index local par ref
      var localMap = {};
      products.forEach(function(p, i){ if(p.ref) localMap[p.ref] = i; });

      var added = 0, updated = 0;
      serverItems.forEach(function(sp){
        if(!sp || !sp.ref) return;
        var idx = localMap[sp.ref];
        if(idx === undefined){
          // Ref inconnue → nouveau produit serveur
          localMap[sp.ref] = products.length;
          products.push(sp);
          added++;
        } else {
          // Ref connue → comparer updatedAt
          var localTs  = products[idx].updatedAt || products[idx].createdAt || 0;
          var serverTs = sp.updatedAt || sp.createdAt || 0;
          if(serverTs > localTs){
            products[idx] = sp;
            updated++;
          }
          // Local plus récent → on garde le local
        }
      });

      if(added > 0 || updated > 0){
        save(true);
        render();
        renderHome();
        if(!silent) showToast(added+' ajouté(s), '+updated+' mis à jour ✓', 'ok', 3000);
      }
    }catch(e){ console.warn('syncFromServer:', e.message); }
  }

  // Patch de save() pour pousser vers le serveur après chaque modif

  // ── Navigation Paramètres ─────────────────────────────────────────
  var settingsFamilyPage  = document.getElementById('settingsFamilyPage');
  var settingsServerPage  = document.getElementById('settingsServerPage');
  var btnOpenFamilyIcons  = document.getElementById('btnOpenFamilyIcons');
  var btnFamilyPageBack   = document.getElementById('btnFamilyPageBack');
  var btnOpenServerSettings = document.getElementById('btnOpenServerSettings');
  var btnServerPageBack   = document.getElementById('btnServerPageBack');
  var serverUrlInput      = document.getElementById('serverUrlInput');
  var serverSyncToggle    = document.getElementById('serverSyncToggle');
  var serverTestResult    = document.getElementById('serverTestResult');

  function showSettingsMain(){
    document.querySelector('.settings-body').style.display = '';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'none';
  }
  function showSettingsFamilyPage(){
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'flex';
    settingsServerPage.style.display = 'none';
    renderSettingsFamilies();
  }
  function showSettingsServerPage(){
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'flex';
    serverUrlInput.value = serverUrl;
    serverSyncToggle.checked = serverSync;
    updateSyncSlider();
  }

  var btnOpenWhatsNew = document.getElementById('btnOpenWhatsNew');
  if(btnOpenWhatsNew){
    btnOpenWhatsNew.addEventListener('click', function(){
      settingsOverlay.classList.remove('show');
      if(whatsNewOverlay){
        buildWhatsNewContent();
        whatsNewOverlay.classList.add('open');
        document.body.classList.add('modal-open');
      }
    });
    btnOpenWhatsNew.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; });
    btnOpenWhatsNew.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; });
  }

  btnOpenFamilyIcons.addEventListener('click', function(){ showSettingsFamilyPage(); });
  btnOpenFamilyIcons.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; });
  btnOpenFamilyIcons.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; });
  btnFamilyPageBack.addEventListener('click', function(){ showSettingsMain(); });

  btnOpenServerSettings.addEventListener('click', function(){ showSettingsServerPage(); });
  btnOpenServerSettings.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; });
  btnOpenServerSettings.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; });
  btnServerPageBack.addEventListener('click', function(){ showSettingsMain(); });

  // Test connexion
  document.getElementById('btnTestServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'');
    serverTestResult.style.display = 'block';
    serverTestResult.style.background = '#F1F5F9';
    serverTestResult.style.color = 'var(--ink)';
    serverTestResult.textContent = 'Connexion en cours…';
    try{
      var r = await fetch(url+'/health');
      if(r.ok){
        serverTestResult.style.background = '#ECFDF5';
        serverTestResult.style.color = '#065F46';
        serverTestResult.textContent = '✓ Serveur disponible';
      } else {
        throw new Error('HTTP '+r.status);
      }
    }catch(e){
      serverTestResult.style.background = '#FEE2E2';
      serverTestResult.style.color = '#991B1B';
      serverTestResult.textContent = '✗ Impossible de joindre le serveur : '+e.message;
    }
  });

  // Enregistrer config
  function updateSyncSlider(){
    var slider = document.getElementById('serverSyncSlider');
    if(!slider) return;
    if(serverSync) slider.classList.add('active');
    else slider.classList.remove('active');
  }

  document.getElementById('btnSaveServer').addEventListener('click', function(){
    serverUrl  = serverUrlInput.value.trim().replace(/\/+$/,'');
    serverSync = document.getElementById('serverSyncSlider').classList.contains('active');
    saveServerConfig();
    if(serverSync) startSyncPolling(); else stopSyncPolling();
    showToast('Configuration serveur enregistrée ✓', 'ok', 2500);
    showSettingsMain();
  });

  // Charger depuis serveur
  document.getElementById('btnSyncFromServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    try{
      var r = await fetch(url+'/pullDatas');
      if(!r.ok) throw new Error('HTTP '+r.status);
      var data = await r.json();
      // Format serveur : { count: N, items: [ { ref, data: {...produit} } ] }
      if(data && Array.isArray(data.items)){
        products = data.items.map(function(item){ return item.data; });
      } else if(Array.isArray(data)){
        products = data;
      } else {
        throw new Error('Format invalide');
      }
      save(true);
      localStorage.setItem(SERVER_LAST_SYNC_KEY, Date.now().toString());
      // Fermer les paramètres
      var settingsOverlay = document.getElementById('settingsOverlay');
      if(settingsOverlay) settingsOverlay.classList.remove('open');
      document.body.classList.remove('modal-open');
      // Réinitialiser et afficher la home
      render();
      renderHome();
      // Forcer l'affichage de la home
      var homePage = document.getElementById('homePage');
      var catalogueWrap = document.getElementById('catalogueWrap');
      if(homePage) homePage.classList.remove('hidden');
      if(catalogueWrap) catalogueWrap.style.display = 'none';
      showToast(products.length+' produits chargés depuis le serveur ✓', 'ok', 2500);
    }catch(e){
      showToast('Erreur : '+e.message, 'warn', 3000);
    }
  });

  // Envoyer vers serveur
  document.getElementById('btnPushToServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    try{
      var r = await fetch(url+'/pushDatas', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(products)
      });
      if(!r.ok) throw new Error('HTTP '+r.status);
      var result = await r.json();
      // Pull différentiel pour récupérer ce qu'on n'avait pas
      serverUrl = url;
      await syncFromServer(true);
      showToast(result.upserted+' envoyé(s), catalogue synchronisé ✓', 'ok', 3000);
    }catch(e){
      showToast('Erreur : '+e.message, 'warn', 3000);
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  COMPARAISON OFFRES FOURNISSEURS
  // ══════════════════════════════════════════════════════════════
  var compareOverlay   = document.getElementById('compareOverlay');
  var compareClose     = document.getElementById('compareClose');
  var compareSuppliers = document.getElementById('compareSuppliers');
  var compareResult    = document.getElementById('compareResult');
  var compareTable     = document.getElementById('compareTable');

  // Structure : [{name:'RS', data:{ref: price, ...}}, ...]
  var supplierSlots = [];

  function addSupplierSlot(){
    var idx = supplierSlots.length;
    supplierSlots.push({name:'Fournisseur '+(idx+1), data:{}});
    renderSupplierSlots();
  }

  function renderSupplierSlots(){
    compareSuppliers.innerHTML = supplierSlots.map(function(s, i){
      var loaded = Object.keys(s.data).length > 0;
      return '<div class="compare-supplier-slot'+(loaded?' loaded':'')+'" data-idx="'+i+'">'
        + '<input class="compare-supplier-name" type="text" placeholder="Nom du fournisseur" value="'+escapeHtml(s.name)+'" data-idx="'+i+'">'
        + '<button class="compare-supplier-file-btn" data-idx="'+i+'"><i class="ti ti-upload"></i> Importer fichier</button>'
        + '<div class="compare-supplier-status">'+(loaded ? '✓ '+Object.keys(s.data).length+' référence(s)' : 'Aucun fichier')+'</div>'
        + '<input type="file" accept=".xlsx,.xls,.csv" style="display:none;" class="compare-file-input" data-idx="'+i+'">'
        + '</div>';
    }).join('');

    // Listeners noms
    compareSuppliers.querySelectorAll('.compare-supplier-name').forEach(function(inp){
      inp.addEventListener('input', function(){
        supplierSlots[parseInt(inp.getAttribute('data-idx'))].name = inp.value;
      });
    });

    // Listeners boutons import
    compareSuppliers.querySelectorAll('.compare-supplier-file-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var fi = compareSuppliers.querySelector('.compare-file-input[data-idx="'+btn.getAttribute('data-idx')+'"]');
        fi.click();
      });
    });

    // Listeners fichiers
    compareSuppliers.querySelectorAll('.compare-file-input').forEach(function(fi){
      fi.addEventListener('change', function(){
        var idx = parseInt(fi.getAttribute('data-idx'));
        var file = fi.files[0];
        if(!file) return;
        // Mettre à jour le nom si encore générique
        if(supplierSlots[idx].name === 'Fournisseur '+(idx+1)){
          supplierSlots[idx].name = file.name.replace(/\.[^.]+$/,'');
        }
        var reader = new FileReader();
        reader.onload = function(e){
          var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
          var data = {};
          // Chercher colonnes Référence et Prix
          var headerRow = -1;
          var colRef = -1, colPrice = -1;
          for(var r=0;r<Math.min(rows.length,5);r++){
            for(var c=0;c<rows[r].length;c++){
              var h = String(rows[r][c]).toLowerCase().trim();
              if(/r[ée]f/.test(h)) { colRef = c; headerRow = r; }
              if(/prix|price/.test(h)) { colPrice = c; headerRow = r; }
            }
            if(colRef !== -1 && colPrice !== -1) break;
          }
          // Si pas d'entêtes trouvés, supposer col0=ref, col1=prix
          if(colRef === -1) colRef = 0;
          if(colPrice === -1) colPrice = 1;
          var start = headerRow >= 0 ? headerRow+1 : 0;
          for(var i=start;i<rows.length;i++){
            var ref = String(rows[i][colRef]||'').trim();
            var price = String(rows[i][colPrice]||'').trim().replace(/[€$£\s]/g,'').replace(',','.');
            var pNum = parseFloat(price);
            if(ref && !isNaN(pNum) && pNum > 0) data[ref] = pNum;
          }
          supplierSlots[idx].data = data;
          renderSupplierSlots();
          showToast(Object.keys(data).length+' références importées pour '+supplierSlots[idx].name, 'ok', 2500);
        };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function runComparison(){
    var loaded = supplierSlots.filter(function(s){ return Object.keys(s.data).length > 0; });
    if(loaded.length < 2){ showToast('Importez au moins 2 fichiers fournisseurs', 'err', 2500); return; }

    // Collecter toutes les références présentes dans au moins un fichier
    var allRefs = {};
    loaded.forEach(function(s){ Object.keys(s.data).forEach(function(r){ allRefs[r]=true; }); });

    // Construire le tableau
    var headers = ['<th>Référence</th><th>Nom produit</th>']
      .concat(loaded.map(function(s){ return '<th>'+escapeHtml(s.name)+'</th>'; }))
      .concat(['<th>Meilleur prix</th><th>Économie</th><th>Action</th>']);

    var rows = Object.keys(allRefs).sort().map(function(ref){
      var prod = products.find(function(p){ return p.ref===ref; });
      var prices = loaded.map(function(s){ return s.data[ref] !== undefined ? s.data[ref] : null; });
      var validPrices = prices.filter(function(p){ return p !== null; });
      var bestPrice = validPrices.length ? Math.min.apply(null,validPrices) : null;
      var worstPrice = validPrices.length > 1 ? Math.max.apply(null,validPrices) : null;

      var priceCells = prices.map(function(p){
        if(p === null) return '<td><span class="compare-price-missing">—</span></td>';
        var cls = p===bestPrice ? 'compare-price-best' : (p===worstPrice && validPrices.length>1 ? 'compare-price-worst' : 'compare-price-mid');
        return '<td><span class="'+cls+'">'+p.toFixed(2)+' €</span></td>';
      }).join('');

      var economy = (bestPrice !== null && worstPrice !== null && worstPrice > bestPrice)
        ? '<span style="color:#059669;font-size:12px;">-'+((1-bestPrice/worstPrice)*100).toFixed(0)+'%</span>' : '—';

      var bestSupplier = bestPrice !== null ? loaded[prices.indexOf(bestPrice)] : null;
      var action = (bestPrice !== null && prod)
        ? '<button class="compare-save-btn" data-ref="'+escapeHtml(ref)+'" data-price="'+bestPrice+'" data-supplier="'+(bestSupplier?escapeHtml(bestSupplier.name):'')+'" title="Appliquer le meilleur prix">Appliquer</button>'
        : '—';

      return '<tr>'
        + '<td style="font-weight:700;color:var(--copper);white-space:nowrap;">'+escapeHtml(ref)+'</td>'
        + '<td style="color:var(--ink-soft);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(prod?escapeHtml(prod.name||''):'<em>Inconnu</em>')+'</td>'
        + priceCells
        + '<td>'+(bestPrice!==null?'<strong>'+bestPrice.toFixed(2)+' €</strong>':'—')+'</td>'
        + '<td>'+economy+'</td>'
        + '<td>'+action+'</td>'
        + '</tr>';
    });

    compareTable.innerHTML = '<thead><tr>'+headers.join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody>';
    compareResult.style.display = 'block';

    // Listeners boutons Appliquer
    compareTable.querySelectorAll('.compare-save-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref = btn.getAttribute('data-ref');
        var price = parseFloat(btn.getAttribute('data-price'));
        var supplier = btn.getAttribute('data-supplier');
        var idx = products.findIndex(function(p){ return p.ref===ref; });
        if(idx !== -1){
          var oldPrice = products[idx].price;
          if(oldPrice && oldPrice !== price.toFixed(2)+''){
            var hist = Array.isArray(products[idx].priceHistory) ? products[idx].priceHistory.slice() : [];
            hist.push({price:oldPrice, date:Date.now()});
            products[idx].priceHistory = hist;
          }
          products[idx].price = price.toFixed(2);
          if(supplier) products[idx].supplier = supplier;
          save(false);
          btn.textContent = '✓ Appliqué';
          btn.disabled = true;
          btn.style.color = '#059669';
          btn.style.borderColor = '#059669';
        }
      });
    });
  }

  // Appliquer TOUS les meilleurs prix
  document.getElementById('btnSaveBest').addEventListener('click', function(){
    compareTable.querySelectorAll('.compare-save-btn:not([disabled])').forEach(function(btn){ btn.click(); });
    showToast('Tous les meilleurs prix ont été appliqués ✓', 'ok', 3000);
  });

  // Exporter comparaison en Excel
  document.getElementById('btnExportCompare').addEventListener('click', function(){
    var loaded = supplierSlots.filter(function(s){ return Object.keys(s.data).length > 0; });
    var allRefs = {};
    loaded.forEach(function(s){ Object.keys(s.data).forEach(function(r){ allRefs[r]=true; }); });
    var headers = ['Référence','Nom produit'].concat(loaded.map(function(s){ return s.name+' (€)'; })).concat(['Meilleur prix (€)','Meilleur fournisseur','Économie (%)']);
    var aoa = [headers].concat(Object.keys(allRefs).sort().map(function(ref){
      var prod = products.find(function(p){ return p.ref===ref; });
      var prices = loaded.map(function(s){ return s.data[ref]!==undefined?s.data[ref]:''; });
      var validPrices = prices.filter(function(p){ return p!==''; });
      var best = validPrices.length ? Math.min.apply(null,validPrices) : '';
      var worst = validPrices.length>1 ? Math.max.apply(null,validPrices) : '';
      var bestIdx = best !== '' ? prices.indexOf(best) : -1;
      var bestSupplier = bestIdx !== -1 ? loaded[bestIdx].name : '';
      var eco = (best!==''&&worst!==''&&worst>best) ? Math.round((1-best/worst)*100) : '';
      return [ref, prod?prod.name:''].concat(prices).concat([best, bestSupplier, eco]);
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comparaison');
    XLSX.writeFile(wb, 'SPI_comparaison_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('Export comparaison téléchargé ✓', 'ok', 2000);
  });

  document.getElementById('btnAddSupplierSlot').addEventListener('click', addSupplierSlot);
  document.getElementById('btnRunCompare').addEventListener('click', runComparison);

  document.getElementById('btnCompare').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    // Init avec 2 slots par défaut
    if(supplierSlots.length === 0){ addSupplierSlot(); addSupplierSlot(); }
    else renderSupplierSlots();
    compareResult.style.display = 'none';
    compareOverlay.classList.add('show');
  });
  document.getElementById('btnResetCompare').addEventListener('click', function(){
    supplierSlots = [];
    addSupplierSlot();
    addSupplierSlot();
    compareResult.style.display = 'none';
  });
  compareClose.addEventListener('click', function(){ compareOverlay.classList.remove('show'); });

  document.getElementById('btnResetFilters').addEventListener('click', function(){
    brandFilterEl.value  = '';
    familyFilterEl.value = '';
    seriesFilterEl.value = '';
    // Réinitialiser aussi le tri prix
    window._priceSort = null;
    if(sortPriceBtn) sortPriceBtn.classList.remove('active-asc','active-desc');
    if(sortPriceIcon) sortPriceIcon.className = 'ti ti-arrows-sort sort-icon';
    _lastRenderKey = '';
    render();
  });

  loadServerConfig();

  btnSettings.addEventListener('click', function(){
    hdrMenu.classList.remove('show');
    showSettingsMain();
    settingsOverlay.classList.add('show');
  });
  settingsClose.addEventListener('click', function(){
    settingsOverlay.classList.remove('show');
  });
  // Clic en dehors ne ferme pas la modale Paramètres — croix obligatoire

  var hdrMenuBtn = document.getElementById('hdrMenuBtn');
  var hdrMenu    = document.getElementById('hdrMenu');
  hdrMenuBtn.addEventListener('click', function(e){
    e.stopPropagation();
    hdrMenu.classList.toggle('open');
  });
  document.addEventListener('click', function(e){
    if(!hdrMenu.contains(e.target) && e.target !== hdrMenuBtn){
      hdrMenu.classList.remove('open');
    }
  });

  document.getElementById('btnCleanDescs').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    var count = 0;
    products.forEach(function(p){
      var cleaned = stripHtml(p.desc || '');
      if(cleaned !== (p.desc || '')){ p.desc = cleaned; count++; }
      var cleanedName = stripHtml(p.name || '');
      if(cleanedName !== (p.name || '')){ p.name = cleanedName; }
    });
    save(); render();
    alert(count > 0
      ? count + ' description(s) nettoyée(s) avec succès.'
      : 'Aucune description HTML à nettoyer — tout est déjà propre !');
  });

  // ---------- Export / Import ----------
  document.getElementById('btnExport').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    var blob = new Blob([JSON.stringify(products, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    a.download = 'catalogue-'+stamp+'.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  document.getElementById('btnImport').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    document.getElementById('fileImport').click();
  });
  document.getElementById('fileImport').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file){ e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      var imported;
      try{
        imported = JSON.parse(ev.target.result);
        if(!Array.isArray(imported)) throw new Error('format invalide');
      }catch(err){
        showToast('Fichier non valide — ce n\'est pas un export catalogue JSON.', 'err', 3500);
        e.target.value = '';
        return;
      }
      // Demander via showToast + choix (pas de confirm natif)
      var count = imported.length;
      var _pendingImport = imported;
      // Utiliser une mini modale inline
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;';
      overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
        + '<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:8px;">Importer '+count+' produit(s)</div>'
        + '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Comment voulez-vous importer ce fichier ?</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;">'
        + '<button id="_importMerge" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Fusionner</strong> — ajouter aux produits existants</button>'
        + '<button id="_importReplace" style="padding:10px 14px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Remplacer</strong> — effacer et remplacer le catalogue</button>'
        + '<button id="_importCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>'
        + '</div></div>';
      document.body.appendChild(overlay);
      overlay.querySelector('#_importMerge').addEventListener('click', function(){
        var existingIds = new Set(products.map(function(p){return p.id;}));
        _pendingImport.forEach(function(p){
          if(!p.id || existingIds.has(p.id)) p.id = 'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
          products.push(p);
        });
        save(); render();
        showToast('Fusion réussie — '+count+' produit(s) ajouté(s).', 'ok', 3000);
        document.body.removeChild(overlay);
        e.target.value = '';
      });
      overlay.querySelector('#_importReplace').addEventListener('click', function(){
        products = _pendingImport;
        save(); render();
        showToast('Catalogue remplacé — '+count+' produit(s).', 'ok', 3000);
        document.body.removeChild(overlay);
        e.target.value = '';
      });
      overlay.querySelector('#_importCancel').addEventListener('click', function(){
        document.body.removeChild(overlay);
        e.target.value = '';
      });
    };
    reader.readAsText(file);
  });

  // ══════════════════════════════════════════════════════════════
  //  EXPORT EXCEL (fabricant) — produits filtrés actuellement
  // ══════════════════════════════════════════════════════════════
  document.getElementById('btnExportXlsx').addEventListener('click', function(){
    hdrMenu.classList.remove('open');

    // Récupère les produits filtrés (même logique que render)
    var search = (document.getElementById('searchInput') || document.getElementById('searchInputMobile') || {value:''}).value.toLowerCase().trim();
    var brand  = document.getElementById('brandFilter').value;
    var family = document.getElementById('familyFilter').value;
    var series = document.getElementById('seriesFilter').value;
    var filtered = products.filter(function(p){
      if(brand  && p.brand  !== brand)  return false;
      if(family && p.family !== family) return false;
      if(series && p.series !== series) return false;
      if(search){
        var hay = ((p.ref||'')+(p.name||'')+(p.desc||'')+(p.brand||'')).toLowerCase();
        if(!hay.includes(search)) return false;
      }
      return true;
    });

    if(filtered.length === 0){
      showToast('Aucun produit à exporter.', 'err'); return;
    }

    // Construction des lignes
    var rows = filtered.map(function(p){
      // Prix d'origine (1er historique) = prix catalogue fabricant
      var priceCatalogue = (Array.isArray(p.priceHistory) && p.priceHistory.length > 0)
        ? p.priceHistory[0].price : '';
      return {
        'Référence'        : p.ref      || '',
        'Nom'              : p.name     || '',
        'Marque'           : p.brand    || '',
        'Famille'          : p.family   || '',
        'Série'            : p.series   || '',
        'Prix catalogue (€)': p.priceCatalogue || priceCatalogue || '',
        'Prix de vente (€)' : p.price   || '',
        'Description'      : (p.desc    || '').replace(/<[^>]*>/g,''),
      };
    });

    // Construit le tableau avec ligne titre + en-têtes + données
    var d0 = new Date();
    var stamp0 = d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
    var headers = Object.keys(rows[0]);
    var aoa = [
      ['SPI Engineering — Liste tarif ' + d0.toLocaleDateString('fr-FR')],
      headers
    ].concat(rows.map(function(r){ return headers.map(function(h){ return r[h]; }); }));

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:18},{wch:35},{wch:14},{wch:16},{wch:14},
      {wch:20},{wch:18},{wch:50}
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tarifs');

    XLSX.writeFile(wb, 'SPI_tarifs_' + stamp0 + '.xlsx');
    showToast(filtered.length + ' référence(s) exportée(s).', 'ok');
  });

  // ══════════════════════════════════════════════════════════════
  //  IMPORT EXCEL (mise à jour prix + ajout nouvelles réfs)
  // ══════════════════════════════════════════════════════════════
  var xlsxPendingData = [];

  document.getElementById('btnImportXlsx').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    document.getElementById('fileImportXlsx').click();
  });

  document.getElementById('fileImportXlsx').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){
      try{
        var wb = XLSX.read(ev.target.result, {type:'array'});
        var ws = wb.Sheets[wb.SheetNames[0]];

        // Normalise les clés (insensible à la casse, espaces, accents, caractères spéciaux)
        function norm(s){ return (s||'').toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/\s+/g,'').replace(/[()€%]/g,''); }

        // Normalise un prix pour comparaison : retire €, espaces, remplace virgule par point
        function normPrice(s){
          var str = (s||'').toString().trim()
            .replace(/\s/g,'')         // espaces insécables et normaux
            .replace(/€/g,'')           // symbole euro
            .replace(',','.');          // virgule décimale → point
          var n = parseFloat(str);
          return isNaN(n) ? str : n.toFixed(2); // '32' = '32.00' = '32 €' = '32,00 €'
        }

        // Lire toutes les lignes en tableau brut pour détecter la ligne d'en-têtes
        var rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
        if(rawRows.length === 0) throw new Error('Fichier vide');

        // Chercher la ligne d'en-têtes : celle qui contient "Référence" ou "Reference"
        var headerRowIdx = 0;
        for(var hi = 0; hi < Math.min(5, rawRows.length); hi++){
          var rowNorm = rawRows[hi].map(function(c){ return norm(String(c)); });
          if(rowNorm.some(function(c){ return c.includes('ref') || c === 'reference'; })){
            headerRowIdx = hi;
            break;
          }
        }

        // Construire les données à partir de la ligne d'en-têtes
        var headers = rawRows[headerRowIdx];
        var rows = [];
        for(var ri = headerRowIdx + 1; ri < rawRows.length; ri++){
          var row = {};
          headers.forEach(function(h, ci){ row[h] = rawRows[ri][ci] !== undefined ? rawRows[ri][ci] : ''; });
          rows.push(row);
        }

        var COL_REF = null, COL_NEW_PRICE = null, COL_NEW_SELLING = null, COL_CATALOGUE = null;
        var COL_NAME = null, COL_BRAND = null, COL_FAMILY = null;
        var COL_SERIES = null, COL_SUPPLIER = null, COL_DESC = null;
        var COL_PHOTO = null, COL_TAGS = null;

        if(rows.length === 0) throw new Error('Aucune donnée trouvée après les en-têtes.');
        headers.forEach(function(k){
          var n = norm(k);
          if((n.includes('ref') || n === 'reference') && !n.includes('nouveau')) COL_REF = k;
          // "Prix catalogue (€)" → COL_NEW_PRICE (le fabricant modifie cette colonne directement)
          if(n.includes('prixcatalogue') || n.includes('newpricecatalogue') || n.includes('nouveauprixcatalogue')) COL_NEW_PRICE = k;
          // "Prix de vente (€)" → COL_NEW_SELLING (vous modifiez cette colonne)
          if(n.includes('prixdevente') || n.includes('prixvente') || n.includes('newsellingprice') || n.includes('nouveauprixdevente')) COL_NEW_SELLING = k;
          if(n === 'nom' || n === 'name') COL_NAME = k;
          if(n === 'marque' || n === 'brand') COL_BRAND = k;
          if(n === 'famille' || n === 'family') COL_FAMILY = k;
          if(n.includes('serie') || n === 'series') COL_SERIES = k;
          if(n === 'fournisseur' || n === 'supplier') COL_SUPPLIER = k;
          if(n.includes('description') || n === 'desc') COL_DESC = k;
          if(n.includes('photo') || n.includes('urlphoto') || n.includes('image')) COL_PHOTO = k;
          if(n.includes('tag')) COL_TAGS = k;
        });

        if(!COL_REF) throw new Error('Colonne "Référence" introuvable. En-têtes trouvés : ' + headers.join(', '));

        var existingMap = {};
        products.forEach(function(p){ existingMap[p.ref] = p; });

        xlsxPendingData = [];
        var countNew = 0, countUpdate = 0, countNoChange = 0;

        rows.forEach(function(row){
          var ref = (row[COL_REF]||'').toString().trim();
          if(!ref) return;

          var newCataloguePrice = COL_NEW_PRICE   ? (row[COL_NEW_PRICE]  ||'').toString().trim() : '';
          var newSellingPrice   = COL_NEW_SELLING ? (row[COL_NEW_SELLING]||'').toString().trim() : '';
          // Compatibilité avec anciens exports (colonne "Nouveau prix (€)" unique)
          var newPrice = newCataloguePrice || newSellingPrice;
          var newName     = COL_NAME      ? (row[COL_NAME]     ||'').toString().trim() : '';
          var newBrand    = COL_BRAND     ? (row[COL_BRAND]    ||'').toString().trim() : '';
          var newFamily   = COL_FAMILY    ? (row[COL_FAMILY]   ||'').toString().trim() : '';
          var newSeries   = COL_SERIES    ? (row[COL_SERIES]   ||'').toString().trim() : '';
          var newSupplier = COL_SUPPLIER  ? (row[COL_SUPPLIER] ||'').toString().trim() : '';
          var newDesc     = COL_DESC      ? (row[COL_DESC]     ||'').toString().trim() : '';
          var newPhoto    = COL_PHOTO     ? (row[COL_PHOTO]    ||'').toString().trim() : '';
          var newTags     = COL_TAGS      ? (row[COL_TAGS]     ||'').toString().split(',').map(function(t){return t.trim();}).filter(Boolean) : [];

          var existing = existingMap[ref];
          var status, oldPrice = '';

          if(!existing){
            // Nouvelle référence
            status = 'new';
            countNew++;
          } else {
            oldPrice = existing.price || '';
            var currentCatForCheck     = normPrice(existing.priceCatalogue || '');
            var currentSellingForCheck = normPrice(existing.price           || '');
            var hasChange = (newCataloguePrice && normPrice(newCataloguePrice) !== currentCatForCheck)
              || (newSellingPrice && normPrice(newSellingPrice) !== currentSellingForCheck)
              || (newName     && newName     !== (existing.name     ||''))
              || (newBrand    && newBrand    !== (existing.brand    ||''))
              || (newFamily   && newFamily   !== (existing.family   ||''))
              || (newSeries   && newSeries   !== (existing.series   ||''))
              || (newSupplier && newSupplier !== (existing.supplier ||''))
              || (newDesc     && newDesc     !== (existing.desc     ||''));
            status = hasChange ? 'update' : 'nochange';
            if(hasChange) countUpdate++; else countNoChange++;
          }

          xlsxPendingData.push({
            ref, status, oldPrice,
            newPrice, newCataloguePrice, newSellingPrice,
            newName, newBrand, newFamily,
            newSeries, newSupplier, newDesc, newPhoto, newTags,
            existing: existing || null
          });
        });

        // Affiche la modale de prévisualisation
        document.getElementById('xlsxImportSummary').textContent =
          countNew + ' nouvelle(s) · ' + countUpdate + ' mise(s) à jour · ' + countNoChange + ' inchangée(s)';
        document.getElementById('xlsxImportInfo').textContent =
          'Les lignes sans "Nouveau prix" conservent l\'ancien prix.';

        var thead = document.getElementById('xlsxPreviewHead');
        var tbody = document.getElementById('xlsxPreviewBody');
        thead.innerHTML = '<tr>' +
          '<th>Statut</th><th>Référence</th><th>Nom</th><th>Marque</th>' +
          '<th>Ancien prix</th><th>Nouveau prix</th>' +
          '</tr>';
        tbody.innerHTML = '';

        xlsxPendingData.forEach(function(item){
          var tr = document.createElement('tr');
          tr.className = 'row-' + item.status;

          var badge = item.status === 'new'
            ? '<span class="badge-new">Nouveau</span>'
            : item.status === 'update'
              ? '<span class="badge-update">Màj</span>'
              : '<span class="badge-nochange">Inchangé</span>';

          var priceCell = item.status === 'update' && item.newPrice
            ? '<span class="price-old">' + escapeHtml(item.oldPrice) + '</span><span class="price-new">' + escapeHtml(item.newPrice) + '</span>'
            : item.status === 'new'
              ? '<span class="price-new">' + escapeHtml(item.newPrice) + '</span>'
              : escapeHtml(item.oldPrice);

          tr.innerHTML =
            '<td>' + badge + '</td>' +
            '<td>' + escapeHtml(item.ref) + '</td>' +
            '<td>' + escapeHtml(item.newName || (item.existing && item.existing.name) || '') + '</td>' +
            '<td>' + escapeHtml(item.newBrand || (item.existing && item.existing.brand) || '') + '</td>' +
            '<td>' + escapeHtml(item.oldPrice) + '</td>' +
            '<td>' + priceCell + '</td>';
          tbody.appendChild(tr);
        });

        document.getElementById('xlsxImportOverlay').style.display = 'flex';
      } catch(err){
        showToast('Erreur : ' + err.message, 'err', 5000);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });

  // ── Confirmer l'import ────────────────────────────────────────
  document.getElementById('btnConfirmXlsxImport').addEventListener('click', function(){
    var now = new Date().toISOString();
    var added = 0, updated = 0;

    xlsxPendingData.forEach(function(item){
      if(item.status === 'nochange') return;

      if(item.status === 'new'){
        // Construire l'historique initial pour un nouveau produit
        var initHistory = [];
        var initPrice = '';
        if(item.newCataloguePrice && item.newSellingPrice){
          // Prix catalogue en historique, prix de vente = prix affiché
          initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
          initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
          initPrice = item.newSellingPrice;
        } else if(item.newCataloguePrice){
          initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
          initPrice = item.newCataloguePrice;
        } else if(item.newSellingPrice){
          initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
          initPrice = item.newSellingPrice;
        } else if(item.newPrice){
          initHistory.push({price: item.newPrice, date: now});
          initPrice = item.newPrice;
        }
        var p = {
          id       : 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
          ref      : item.ref,
          name     : item.newName,
          brand    : item.newBrand,
          family   : item.newFamily,
          series   : item.newSeries,
          supplier : item.newSupplier,
          desc     : item.newDesc,
          photo    : item.newPhoto,
          tags     : item.newTags,
          price    : initPrice,
          priceHistory: initHistory,
        };
        products.push(p);
        added++;
      } else {
        // Mise à jour
        var p = item.existing;
        if(item.newName)     p.name     = item.newName;
        if(item.newBrand)    p.brand    = item.newBrand;
        if(item.newFamily)   p.family   = item.newFamily;
        if(item.newSeries)   p.series   = item.newSeries;
        if(item.newSupplier) p.supplier = item.newSupplier;
        if(item.newDesc)     p.desc     = item.newDesc;
        if(item.newPhoto)    p.photo    = item.newPhoto;
        if(item.newTags && item.newTags.length) p.tags = item.newTags;

        // S'assurer que l'historique existe
        if(!Array.isArray(p.priceHistory)) p.priceHistory = [];

        // Normalise un prix pour comparaison fiable (gère '32 €' vs '32' vs '32,00 €')
        function normPriceConfirm(s){
          var str = (s||'').toString().trim().replace(/\s/g,'').replace(/€/g,'').replace(',','.');
          var n = parseFloat(str);
          return isNaN(n) ? str : n.toFixed(2);
        }

        // Prix catalogue a changé ?
        var catChanged     = item.newCataloguePrice &&
          normPriceConfirm(item.newCataloguePrice) !== normPriceConfirm(p.priceCatalogue || '');
        // Prix de vente a changé ?
        var sellingChanged = item.newSellingPrice &&
          normPriceConfirm(item.newSellingPrice) !== normPriceConfirm(p.price || '');

        if(catChanged){
          p.priceCatalogue = item.newCataloguePrice;
          p.priceHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue fabricant'});
        }
        if(sellingChanged){
          p.price = item.newSellingPrice;
          p.priceHistory.push({price: item.newSellingPrice, date: now, label: 'Votre prix'});
        }
        updated++;
      }
    });

    save(); render();
    document.getElementById('xlsxImportOverlay').style.display = 'none';
    showToast(added + ' ajouté(s), ' + updated + ' mis à jour.', 'ok', 4000);
    xlsxPendingData = [];
  });

  // ═══════════════════════════════════════════════════════════════
  //  MODALE "QUOI DE NEUF"
  // ═══════════════════════════════════════════════════════════════

  var WHATS_NEW_VERSIONS = [
    {
      version: "v1.0",
      sections: [
        {
          title: "Gestion des produits",
          items: [
            { icon: "ti-package", color: "blue", name: "Ajouter / modifier / supprimer", desc: "Gérez vos fiches produits directement depuis le catalogue." },
            { icon: "ti-link", color: "blue", name: "Extraction depuis une URL", desc: "Collez le lien d'une fiche fournisseur — nom, image, description et prix sont récupérés automatiquement." },
            { icon: "ti-photo", color: "blue", name: "Choix de l'image", desc: "Sélectionnez parmi toutes les images extraites celle qui convient le mieux." },
            { icon: "ti-tag", color: "blue", name: "Tags automatiques", desc: "Des suggestions de mots-clés sont proposées à l'ajout pour faciliter la recherche." },
            { icon: "ti-clock", color: "blue", name: "Historique des prix", desc: "Chaque modification de prix est tracée pour suivre l'évolution dans le temps." }
          ]
        },
        {
          title: "Recherche & Navigation",
          items: [
            { icon: "ti-search", color: "green", name: "Recherche intelligente", desc: "Les résultats sont triés par pertinence — les meilleures correspondances apparaissent en premier." },
            { icon: "ti-filter", color: "green", name: "Filtres en cascade", desc: "Filtrez par Marque, puis Famille, puis Série — les listes se mettent à jour automatiquement." },
            { icon: "ti-sort-ascending", color: "green", name: "Tri par prix", desc: "Affichez les produits du moins cher au plus cher, ou inversement." },
            { icon: "ti-layout-grid", color: "green", name: "Accueil par familles", desc: "Naviguez par catégorie de produits depuis la page d'accueil." }
          ]
        },
        {
          title: "Import & Export",
          items: [
            { icon: "ti-file-export", color: "orange", name: "Export Excel", desc: "Exportez tout le catalogue en fichier Excel d'un seul clic." },
            { icon: "ti-file-import", color: "orange", name: "Import Excel", desc: "Importez un catalogue existant depuis un fichier Excel." },
            { icon: "ti-chart-pie", color: "orange", name: "Comparaison fournisseurs", desc: "Importez plusieurs fichiers Excel fournisseurs et comparez les prix côte à côte — le meilleur prix est mis en évidence." }
          ]
        },
        {
          title: "Extraction fournisseurs",
          items: [
            { icon: "ti-world", color: "purple", name: "Extraction depuis URL", desc: "Fonctionne sur mobile et desktop — compatible avec les principaux fournisseurs (Balluff, Phoenix Contact, SICK, IFM, Schneider…)." },
            { icon: "ti-puzzle", color: "purple", name: "Extension Chrome", desc: "Clic droit sur n'importe quelle fiche produit fournisseur → Ajouter au Catalogue SPI. Les champs sont pré-remplis automatiquement." },
            { icon: "ti-share", color: "purple", name: "Partage Android", desc: "Depuis votre navigateur mobile, partagez une fiche produit directement vers l'application." }
          ]
        },
        {
          title: "Application mobile",
          items: [
            { icon: "ti-device-mobile", color: "red", name: "Installable sur l'écran d'accueil", desc: "Ajoutez l'application à votre écran d'accueil Android ou iOS pour un accès rapide sans navigateur." },
            { icon: "ti-wifi-off", color: "red", name: "Fonctionne hors ligne", desc: "Le catalogue reste accessible même sans connexion internet." },
            { icon: "ti-layout-sidebar", color: "red", name: "Interface adaptée", desc: "L'application s'adapte automatiquement à votre écran — mobile, tablette ou desktop." }
          ]
        },
        {
          title: "Comparaison fournisseurs",
          items: [
            { icon: "ti-chart-pie", color: "purple", name: "Comparaison fournisseurs", desc: "Importez plusieurs fichiers Excel et comparez les prix fournisseurs — le meilleur prix est mis en évidence automatiquement." },
          ]
        },
        {
          title: "Connexion serveur",
          items: [
            { icon: "ti-database", color: "purple", name: "Connexion serveur", desc: "Possibilité de connecter le catalogue à un serveur pour partager les données entre collègues." }
          ]
        }
      ]
    }
  ];

  // Dernière version = dernier élément du tableau
  var latestWN = WHATS_NEW_VERSIONS[WHATS_NEW_VERSIONS.length - 1];
  var WN_KEY   = 'cat_whats_new_' + latestWN.version;

  // Génère le contenu HTML depuis les données
  function buildWhatsNewContent(){
    var badge = document.getElementById('wnBadge');
    var body  = document.getElementById('whatsNewBody');
    if(!badge || !body) return;
    badge.textContent = latestWN.version;
    var html = '';
    latestWN.sections.forEach(function(section){
      html += '<div class="wn-section"><div class="wn-section-title">'+escapeHtml(section.title)+'</div>';
      section.items.forEach(function(item){
        html += '<div class="wn-item">'
          +'<span class="wn-icon '+item.color+'"><i class="ti '+item.icon+'" aria-hidden="true"></i></span>'
          +'<div class="wn-texts">'
          +'<span class="wn-name">'+escapeHtml(item.name)+'</span>'
          +'<span class="wn-desc">'+escapeHtml(item.desc)+'</span>'
          +'</div></div>';
      });
      html += '</div>';
    });
    body.innerHTML = html;
  }

  var whatsNewOverlay = document.getElementById('whatsNewOverlay');

  function closeWhatsNew(){
    if(whatsNewOverlay) whatsNewOverlay.classList.remove('open');
    document.body.classList.remove('modal-open');
    try{ localStorage.setItem(WN_KEY, '1'); }catch(e){}
  }

  // Afficher si cette version n'a pas encore été vue
  function tryShowWhatsNew(){
    try{
      if(!localStorage.getItem(WN_KEY) && whatsNewOverlay){
        buildWhatsNewContent();
        whatsNewOverlay.classList.add('open');
      }
    }catch(e){}
  }
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', tryShowWhatsNew);
  } else {
    tryShowWhatsNew();
  }

  var btnWNClose = document.getElementById('btnWhatsNewClose');
  if(btnWNClose) btnWNClose.addEventListener('click', closeWhatsNew);

  if(whatsNewOverlay){
    whatsNewOverlay.addEventListener('click', function(e){
      if(e.target === whatsNewOverlay) closeWhatsNew();
    });
  }

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && whatsNewOverlay && whatsNewOverlay.classList.contains('open')){
      closeWhatsNew();
    }
  });

  // ---------- Loupe mobile ----------
  var searchToggleBtn = document.getElementById('searchToggleBtn');
  var searchExpand    = document.getElementById('searchExpand');
  var searchInputMobile = document.getElementById('searchInputMobile');
  var searchCloseBtn  = document.getElementById('searchCloseBtn');
  if(searchToggleBtn){
    searchToggleBtn.addEventListener('click', function(){
      searchExpand.classList.add('open');
      searchInputMobile.focus();
    });
    searchCloseBtn.addEventListener('click', function(){
      searchExpand.classList.remove('open');
      searchInputMobile.value = '';
      searchInputEl.value = '';
      render();
    });
    searchInputMobile.addEventListener('input', function(){
      searchInputEl.value = searchInputMobile.value;
      // Si on est sur la home et qu'on tape, basculer vers le catalogue
      var homePage = document.getElementById('homePage');
      if(homePage && !homePage.classList.contains('hidden') && searchInputMobile.value.trim().length > 0){
        showCatalogueAll();
      }
      render();
    });
  }

  // ---------- Scroll to top ----------
  var btnScrollTop = document.getElementById('btnScrollTop');
  window.addEventListener('scroll', function(){
    btnScrollTop.classList.toggle('show', window.scrollY > 400);
  });
  btnScrollTop.addEventListener('click', function(){
    window.scrollTo({top:0, behavior:'smooth'});
  });

  // ---------- Page d'accueil ----------
  var homePage       = document.getElementById('homePage');
  var catalogueWrap  = document.getElementById('catalogueWrap');
  var homeStats      = document.getElementById('homeStats');
  var homeFamilies   = document.getElementById('homeFamilies');
  var homeAllBtn     = document.getElementById('homeAllBtn');

  // Icônes par famille (mots-clés → icône Tabler)
  var familyIconMap = [
    { keys:['câble','cable','cordon','liaison'],         icon:'ti-plug-connected' },
    { keys:['capteur','sensor','detect','proxim'],       icon:'ti-antenna' },
    { keys:['module','master','bus','réseau','network'], icon:'ti-circuit-switchclosed' },
    { keys:['aliment','power','psu','transfo'],          icon:'ti-bolt' },
    { keys:['actionn','valve','moteur','drive'],         icon:'ti-settings-2' },
    { keys:['connect','bornier','terminal','borne'],     icon:'ti-plug' },
    { keys:['commut','switch','bouton','button'],        icon:'ti-toggle-right' },
    { keys:['relay','relai','relais','contacteur'],      icon:'ti-circuit-resistor' },
    { keys:['affich','display','hmi','écran'],           icon:'ti-device-desktop' },
    { keys:['automate','plc','controleur'],              icon:'ti-cpu' },
  ];

  function getFamilyIcon(name){
    // Priorité 1 : icône stockée dans localStorage (choix session courante)
    if(familyIcons[name]) return familyIcons[name];
    // Priorité 2 : icône stockée dans un produit existant de cette famille
    for(var i=0;i<products.length;i++){
      if(products[i].family === name && products[i].familyIcon){
        return products[i].familyIcon;
      }
    }
    // Fallback : détection par mots-clés
    var lower = name.toLowerCase();
    for(var i=0;i<familyIconMap.length;i++){
      for(var j=0;j<familyIconMap[i].keys.length;j++){
        if(lower.indexOf(familyIconMap[i].keys[j]) !== -1) return familyIconMap[i].icon;
      }
    }
    return 'ti-package';
  }

  function showHome(){
    if(window._setViewAll) window._setViewAll(false);
    homePage.classList.remove('hidden');
    catalogueWrap.style.display = 'none';
    document.getElementById('hdrCountChip').style.display = 'none';
    renderHome();
  }

  function showCatalogue(brandFilter, familyFilter){
    // Désactiver le mode viewAll si on filtre par marque ou famille
    if(brandFilter || familyFilter){
      if(window._setViewAll) window._setViewAll(false);
    }
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
    if(window._setViewAll) window._setViewAll(true);
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
    // Fermer la fiche produit : retirer la classe 'open' sur l'overlay
    var viewOverlayEl = document.getElementById('viewOverlay');
    if(viewOverlayEl) viewOverlayEl.classList.remove('open');
    // Fermer la modale d'édition
    var overlayEl = document.getElementById('overlay');
    if(overlayEl) overlayEl.classList.remove('open');
    // Fermer le panneau paramètres
    var settingsBoxEl = document.querySelector('.settings-box');
    if(settingsBoxEl) settingsBoxEl.classList.remove('open');
    familyFilterEl.value = '';
    brandFilterEl.value  = '';
    seriesFilterEl.value = '';
    document.querySelector('.toolbar').classList.remove('filters-visible');
    document.body.classList.remove('modal-open');
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

  // ══════════════════════════════════════════════════════════════════
  //  GESTION DES CONFLITS DE SYNC
  // ══════════════════════════════════════════════════════════════════
  var CONFLICT_THRESHOLD = 3600000; // 1h en ms
  var _pendingConflicts  = [];
  var _conflictChoices   = {};
  var _selectedConflict  = null;

  var FIELD_LABELS = {
    ref:'Référence', name:'Nom', brand:'Marque', family:'Famille',
    series:'Série', supplier:'Fournisseur', price:'Prix', priceCatalogue:'Prix catalogue',
    desc:'Description', url:'URL', photo:'Photo', tags:'Tags',
    createdAt:'Créé le', updatedAt:'Modifié le', priceHistory:'Historique des prix'
  };

  function formatFieldValue(key, val){
    if(val === undefined || val === null || val === '') return '<em style="color:var(--ink-soft)">—</em>';
    if(key === 'createdAt' || key === 'updatedAt') return new Date(val).toLocaleString('fr-FR');
    if(key === 'priceHistory' && Array.isArray(val)){
      if(val.length === 0) return '<em style="color:var(--ink-soft)">Aucun</em>';
      return val.map(function(h){ return new Date(h.date).toLocaleDateString('fr-FR')+' → '+h.price; }).join('<br>');
    }
    if(Array.isArray(val)) return val.join(', ') || '<em style="color:var(--ink-soft)">—</em>';
    if(typeof val === 'boolean') return val ? 'Oui' : 'Non';
    return escapeHtml(String(val));
  }

  window.openConflictModal = function openConflictModal(conflicts){
    _pendingConflicts = conflicts;
    _conflictChoices  = {};
    _selectedConflict = null;
    conflicts.forEach(function(c){ _conflictChoices[c.ref] = 'local'; });
    var overlay = document.getElementById('conflictOverlay');
    if(!overlay){ console.warn('conflictOverlay introuvable'); return; }
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.getElementById('conflictSubtitle').textContent =
      conflicts.length + ' produit(s) en conflit (modifié des deux côtés dans la même heure)';
    renderConflictList();
    if(conflicts.length > 0) selectConflict(conflicts[0].ref);
  }

  function renderConflictList(){
    var list = document.getElementById('conflictList');
    if(!list) return;
    list.innerHTML = _pendingConflicts.map(function(c){
      var choice = _conflictChoices[c.ref] || 'local';
      var isSel  = _selectedConflict === c.ref;
      return '<div class="conflict-item'+(isSel?' selected':'')+'" data-ref="'+escapeHtml(c.ref)+'" style="cursor:pointer;">'
        +'<div style="font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escapeHtml(c.ref)+'</div>'
        +'<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">'+escapeHtml((c.local.name||c.local.ref||''))+'</div>'
        +'<div style="margin-top:5px;display:flex;gap:4px;">'
        +'<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:'+(choice==='local'?'#194093':'var(--surface-1)')+';color:'+(choice==='local'?'#fff':'var(--ink-soft)')+';">Local</span>'
        +'<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:'+(choice==='server'?'#194093':'var(--surface-1)')+';color:'+(choice==='server'?'#fff':'var(--ink-soft)')+';">Serveur</span>'
        +'</div></div>';
    }).join('');
    list.querySelectorAll('.conflict-item').forEach(function(el){
      el.addEventListener('click', function(){ selectConflict(el.getAttribute('data-ref')); });
    });
  }

  function selectConflict(ref){
    _selectedConflict = ref;
    renderConflictList();
    renderConflictDetail(ref);
  }

  function renderConflictDetail(ref){
    var c = _pendingConflicts.find(function(x){ return x.ref === ref; });
    if(!c) return;
    var choice  = _conflictChoices[ref] || 'local';
    var detail  = document.getElementById('conflictDetail');
    if(!detail) return;
    var allKeys = Object.keys(Object.assign({}, c.local, c.server))
      .filter(function(k){ return k !== 'id' && k !== 'familyIcon'; });
    var rowsHtml = allKeys.map(function(key){
      var lv     = c.local[key];
      var sv     = c.server[key];
      var differ = JSON.stringify(lv) !== JSON.stringify(sv);
      return '<tr style="background:'+(differ?'#FEF9EC':'transparent')+';">'
        +'<td style="padding:8px 12px;font-size:12px;font-weight:600;color:var(--ink-soft);white-space:nowrap;border-bottom:1px solid var(--line);vertical-align:top;">'+(FIELD_LABELS[key]||key)+'</td>'
        +'<td style="padding:8px 12px;font-size:13px;border-bottom:1px solid var(--line);vertical-align:top;'+(differ&&choice==='local'?'background:#EEF4FF;':'')+'">'+formatFieldValue(key,lv)+'</td>'
        +'<td style="padding:8px 12px;font-size:13px;border-bottom:1px solid var(--line);vertical-align:top;'+(differ&&choice==='server'?'background:#EEF4FF;':'')+'">'+formatFieldValue(key,sv)+'</td>'
        +'<td style="padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:14px;color:#B45309;">'+(differ?'≠':'')+'</td>'
        +'</tr>';
    }).join('');
    detail.innerHTML = '<div style="margin-bottom:14px;display:flex;gap:10px;">'
      +'<button id="chooseLocal" style="flex:1;padding:9px;border-radius:8px;border:2px solid '+(choice==='local'?'#194093':'var(--line)')+';background:'+(choice==='local'?'#EEF4FF':'var(--paper-card)')+';font-size:13px;font-weight:600;cursor:pointer;color:'+(choice==='local'?'#194093':'var(--ink)')+';font-family:inherit;">✓ Garder ma version (locale)</button>'
      +'<button id="chooseServer" style="flex:1;padding:9px;border-radius:8px;border:2px solid '+(choice==='server'?'#194093':'var(--line)')+';background:'+(choice==='server'?'#EEF4FF':'var(--paper-card)')+';font-size:13px;font-weight:600;cursor:pointer;color:'+(choice==='server'?'#194093':'var(--ink)')+';font-family:inherit;">↓ Prendre la version serveur</button>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr>'
      +'<th style="padding:8px 12px;font-size:12px;color:var(--ink-soft);text-align:left;border-bottom:2px solid var(--line);width:130px;">Champ</th>'
      +'<th style="padding:8px 12px;font-size:12px;text-align:left;border-bottom:2px solid var(--line);">📱 Version locale</th>'
      +'<th style="padding:8px 12px;font-size:12px;text-align:left;border-bottom:2px solid var(--line);">☁️ Version serveur</th>'
      +'<th style="width:24px;border-bottom:2px solid var(--line);"></th>'
      +'</tr></thead><tbody>'+rowsHtml+'</tbody></table>';
    detail.querySelector('#chooseLocal').addEventListener('click', function(){
      _conflictChoices[ref] = 'local'; renderConflictList(); renderConflictDetail(ref);
    });
    detail.querySelector('#chooseServer').addEventListener('click', function(){
      _conflictChoices[ref] = 'server'; renderConflictList(); renderConflictDetail(ref);
    });
  }

  function closeConflictModal(){
    var overlay = document.getElementById('conflictOverlay');
    if(overlay) overlay.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  function applyConflictChoices(){
    var localMap = {};
    products.forEach(function(p, i){ if(p.ref) localMap[p.ref] = i; });
    _pendingConflicts.forEach(function(c){
      if((_conflictChoices[c.ref] || 'local') === 'server'){
        var idx = localMap[c.ref];
        if(idx !== undefined) products[idx] = c.server;
      }
    });
    save(true); render(); renderHome();
    closeConflictModal();
    showToast('Conflits résolus ✓', 'ok', 2500);
  }

  // Listeners modale conflit
  (function initConflictModal(){
    var closeBtn   = document.getElementById('conflictCloseBtn');
    var applyBtn   = document.getElementById('conflictApplyBtn');
    var allLocal   = document.getElementById('conflictKeepAllLocal');
    var allServer  = document.getElementById('conflictKeepAllServer');
    var overlay    = document.getElementById('conflictOverlay');
    if(closeBtn)  closeBtn.addEventListener('click', closeConflictModal);
    if(applyBtn)  applyBtn.addEventListener('click', applyConflictChoices);
    if(allLocal)  allLocal.addEventListener('click', function(){
      _pendingConflicts.forEach(function(c){ _conflictChoices[c.ref] = 'local'; });
      renderConflictList(); if(_selectedConflict) renderConflictDetail(_selectedConflict);
    });
    if(allServer) allServer.addEventListener('click', function(){
      _pendingConflicts.forEach(function(c){ _conflictChoices[c.ref] = 'server'; });
      renderConflictList(); if(_selectedConflict) renderConflictDetail(_selectedConflict);
    });
    if(overlay)   overlay.addEventListener('click', function(e){ if(e.target===overlay) closeConflictModal(); });
  })();
  // ── Bouton test modale conflits ────────────────────────────────────
  var btnTestConflict = document.getElementById('btnTestConflictModal');
  if(btnTestConflict){
    btnTestConflict.addEventListener('click', function(){
      var settingsBox = document.querySelector('.settings-box');
      if(settingsBox) settingsBox.classList.remove('open');
      document.body.classList.remove('modal-open');

      var fakeConflicts = [
        {
          ref: 'BNI00L3',
          local: {
            ref:'BNI00L3', name:'Module IO-Link BALLUFF v2 (local)', brand:'BALLUFF',
            family:'Master', series:'BNI', supplier:'BALLUFF',
            price:'154.50 EUR', priceCatalogue:'415 EUR',
            desc:'Version modifiée localement hors ligne.',
            url:'https://www.balluff.com/bni00l3', photo:'',
            createdAt: Date.now()-7200000, updatedAt: Date.now()-1200000,
            priceHistory:[{date:Date.now()-7200000, price:'415 EUR'}]
          },
          server: {
            ref:'BNI00L3', name:'Module IO-Link BALLUFF (serveur)', brand:'BALLUFF',
            family:'Master', series:'BNI', supplier:'BALLUFF',
            price:'160.00 EUR', priceCatalogue:'415 EUR',
            desc:'BNI00L3 (BNI XG3-508-0B5-R067) - Modules réseau multiprotocoles.',
            url:'https://www.balluff.com/bni00l3', photo:'',
            createdAt: Date.now()-7200000, updatedAt: Date.now()-600000,
            priceHistory:[{date:Date.now()-7200000, price:'415 EUR'}]
          }
        },
        {
          ref: 'BMF00JC',
          local: {
            ref:'BMF00JC', name:'Capteur magnétique (local)', brand:'BALLUFF',
            family:'Capteur magnétique', series:'BMF', supplier:'BALLUFF',
            price:'20 EUR', priceCatalogue:'64.67 EUR',
            desc:'Version locale avec note ajoutée manuellement.',
            url:'https://www.balluff.com/bmf00jc', photo:'',
            createdAt: Date.now()-3600000, updatedAt: Date.now()-1800000,
            priceHistory:[]
          },
          server: {
            ref:'BMF00JC', name:'Capteur magnétique BMF (serveur)', brand:'BALLUFF',
            family:'Capteur magnétique', series:'BMF', supplier:'BALLUFF',
            price:'22 EUR', priceCatalogue:'64.67 EUR',
            desc:'BMF00JC (BMF 235K-PS-C-2A-SA5-S49-00,3) - Interrupteur cylindrique.',
            url:'https://www.balluff.com/bmf00jc', photo:'',
            createdAt: Date.now()-3600000, updatedAt: Date.now()-900000,
            priceHistory:[]
          }
        }
      ];

      if(typeof openConflictModal === 'function'){
        openConflictModal(fakeConflicts);
      } else {
        alert('La modale de conflits sera disponible après le prochain déploiement complet.');
      }
    });
  };