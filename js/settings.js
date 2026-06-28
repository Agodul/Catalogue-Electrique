// ============================================================
// settings.js — Paramètres, serveur, comparaison, PWA
// ============================================================

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

  var SERVER_KEY = 'spi_server_url';
  var SERVER_SYNC_KEY = 'spi_server_sync';
  var serverUrl  = '';
  var serverSync = false;

  function loadServerConfig(){
    serverUrl  = localStorage.getItem(SERVER_KEY) || '';
    serverSync = localStorage.getItem(SERVER_SYNC_KEY) === '1';
    updateServerSubtitle();
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

  // ── Sync vers serveur ─────────────────────────────────────────────
  async function pushToServer(){
    if(!serverUrl || !serverSync) return;
    try{
      // Récupérer les IDs existants sur le serveur
      var resp = await fetch(serverUrl+'/products', {headers:{'Content-Type':'application/json'}});
      if(!resp.ok) return;
      var existing = await resp.json();
      var existingIds = existing.map(function(p){ return p.id; });

      // Supprimer les produits qui n'existent plus en local
      for(var i=0;i<existing.length;i++){
        if(!products.find(function(p){ return p.id===existing[i].id; })){
          await fetch(serverUrl+'/products/'+existing[i].id, {method:'DELETE'});
        }
      }
      // PUT ou POST pour chaque produit local
      for(var j=0;j<products.length;j++){
        var p = products[j];
        if(existingIds.indexOf(p.id) !== -1){
          await fetch(serverUrl+'/products/'+p.id, {
            method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p)
          });
        } else {
          await fetch(serverUrl+'/products', {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p)
          });
        }
      }
    }catch(e){ }
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
      // Fermer les paramètres, ouvrir le quoi de neuf
      settingsOverlay.classList.remove('show');
      if(whatsNewOverlay){ whatsNewOverlay.classList.add('open'); }
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
      var r = await fetch(url+'/products');
      if(r.ok){
        var data = await r.json();
        serverTestResult.style.background = '#ECFDF5';
        serverTestResult.style.color = '#065F46';
        serverTestResult.textContent = '✓ Connecté — '+data.length+' produit(s) sur le serveur';
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
    showToast('Configuration serveur enregistrée ✓', 'ok', 2500);
    showSettingsMain();
  });

  // Charger depuis serveur
  document.getElementById('btnSyncFromServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    try{
      var r = await fetch(url+'/products');
      if(!r.ok) throw new Error('HTTP '+r.status);
      products = await r.json();
      save(true);
      render();
      renderHome();
      showToast('Catalogue chargé depuis le serveur ✓', 'ok', 2500);
    }catch(e){
      showToast('Erreur : '+e.message, 'warn', 3000);
    }
  });

  // Envoyer vers serveur
  document.getElementById('btnPushToServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    var tmpSync = serverSync; var tmpUrl = serverUrl;
    serverSync = true; serverUrl = url;
    await pushToServer();
    serverSync = tmpSync; serverUrl = tmpUrl;
    showToast('Catalogue envoyé au serveur ✓', 'ok', 2500);
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
  var WN_KEY   = 'catalogue_whats_new_' + latestWN.version;

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
    try{ localStorage.setItem(WN_KEY, '1'); }catch(e){}
  }

  // Afficher si cette version n'a pas encore été vue
  try{
    if(!localStorage.getItem(WN_KEY) && whatsNewOverlay){
      buildWhatsNewContent();
      whatsNewOverlay.classList.add('open');
    }
  }catch(e){}

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

  // ── Share Target iOS/Android (PWA) ───────────────────────────────
  (function handleShareTarget(){
    var params     = new URLSearchParams(window.location.search);
    var shareUrl   = params.get('share_url');
    var shareTitle = params.get('share_title');
    if(!shareUrl) return;

    // Nettoyer l'URL du navigateur
    window.history.replaceState({}, document.title, window.location.pathname);

    setTimeout(function(){
      // Basculer vers le catalogue si on est sur l'accueil
      if(homePage && !homePage.classList.contains('hidden')){
        showCatalogueAll();
      }
      // Ouvrir la modale d'ajout
      openModal(null);

      setTimeout(function(){
        if(fUrl) fUrl.value = shareUrl;
        if(shareTitle && fName) fName.value = shareTitle;
        switchTab('auto');
        showToast('Récupération de la page en cours…', 'ok', 3000);

        // ── Extraction automatique via allorigins.win ──────────────
        // Essayer plusieurs proxies en cascade
        var shareProxies = [
          'https://api.allorigins.win/get?url=' + encodeURIComponent(shareUrl),
          'https://corsproxy.io/?' + encodeURIComponent(shareUrl),
          'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(shareUrl)
        ];

        function tryShareProxy(idx){
          if(idx >= shareProxies.length){
            showToast('Extraction impossible — collez le code source manuellement', 'warn', 5000);
            return;
          }
          fetch(shareProxies[idx])
            .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); })
            .then(function(text){
              var html = text;
              try{ var j=JSON.parse(text); if(j.contents) html=j.contents; }catch(e){}
              if(!html || html.length < 100) throw new Error('Contenu vide');
              if(html.indexOf('&lt;') !== -1 && html.indexOf('<html') === -1){
                var ta = document.createElement('textarea');
                ta.innerHTML = html;
                html = ta.value;
              }
              fHtml.value = html;
              fUrl.value  = shareUrl;
              document.getElementById('btnExtract').click();
              showToast('Extraction réussie via partage ✓', 'ok', 3500);
            })
            .catch(function(){ tryShareProxy(idx+1); });
        }

        tryShareProxy(0);

      }, 350);
    }, 600);
  })();
  // Démarrer sur la page d'accueil si des produits existent
  if(products.length > 0){
    showHome();
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXTENSION CHROME — Injection via localStorage
  //  Le content script de l'extension écrit le HTML complet de la
  //  page fournisseur dans localStorage, puis déclenche cet événement.
  //  L'app reprend exactement le même pipeline que "Coller le code source".
  // ═══════════════════════════════════════════════════════════════
  function triggerExtensionExtraction(){
    var html = '';
    var url  = '';
    try{
      html = localStorage.getItem('spi_pending_html') || '';
      url  = localStorage.getItem('spi_pending_url')  || '';
      var ts = parseInt(localStorage.getItem('spi_pending_ts') || '0', 10);
      // Ignorer si données trop vieilles (> 5 min)
      if(!html || (Date.now() - ts) > 5 * 60 * 1000) return;
      // Nettoyer immédiatement pour éviter un double-déclenchement
      localStorage.removeItem('spi_pending_html');
      localStorage.removeItem('spi_pending_url');
      localStorage.removeItem('spi_pending_ts');
    }catch(e){ return; }

    // Nettoyer le flag bridge dans l'URL
    if(window.location.search.includes('spi_bridge=1')){
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Ouvrir la modale, injecter le HTML dans le textarea, déclencher l'extraction
    setTimeout(function(){
      openModal(null);
      setTimeout(function(){
        fHtml.value = html;
        fUrl.value  = url;
        // Déclencher le même bouton que le copier-coller manuel
        document.getElementById('btnExtract').click();
        showToast('Extraction depuis l\'extension Chrome ✓', 'ok', 3500);
      }, 300);
    }, 700);
  }

  // Cas 1 : catalogue déjà ouvert → le content script envoie un CustomEvent
  window.addEventListener('spi_extension_ready', function(){
    triggerExtensionExtraction();
  });

  // Cas 2 : catalogue vient d'être ouvert avec ?spi_bridge=1
  // Le content script écrit dans localStorage puis dispatch spi_extension_ready
  // → déjà géré par l'écouteur ci-dessus, rien de plus nécessaire ici.

  
})();
</script>


  <!-- ── Popup installation PWA ────────────────────────────────────── -->
  <div id="pwaInstallBanner" style="
    display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    z-index:9999;background:var(--paper-card,#fff);color:var(--ink,#1a1a2e);
    border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);
    padding:clamp(10px,4vw,18px);max-width:340px;width:calc(100% - 24px);
    flex-direction:column;gap:12px;font-family:inherit;">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="./icon-512.png" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;" alt="App icon">
      <div style="flex:1;">
        <div style="font-weight:600;font-size:14px;margin-bottom:2px;">Installer l'application</div>
        <div style="font-size:12px;color:var(--ink-soft,#666);line-height:1.4;">
          Accès rapide depuis votre écran d'accueil, sans navigateur.
        </div>
      </div>
      <button id="pwaInstallClose" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--ink-soft,#999);padding:0 0 0 6px;line-height:1;align-self:flex-start;">✕</button>
    </div>

    <!-- Android : bouton natif -->
    <div id="pwaAndroidZone" style="display:none;">
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="pwaInstallLater" style="font-size:13px;padding:8px 14px;border-radius:8px;background:none;border:1px solid var(--line,#ddd);cursor:pointer;color:var(--ink);">
          Plus tard
        </button>
        <button id="pwaInstallBtn" class="copper" style="font-size:13px;padding:8px 16px;border-radius:8px;display:flex;align-items:center;gap:6px;">
          ⬇︎ Installer
        </button>
      </div>
    </div>

    <!-- iOS : instructions -->
    <div id="pwaIOSZone" style="display:none;">
      <div style="font-size:12px;color:var(--ink-soft,#555);line-height:1.6;background:var(--surface,#f5f5f5);border-radius:10px;padding:10px 12px;">
        <div style="margin-bottom:4px;font-weight:600;color:var(--ink);">Comment installer :</div>
        <div>1. Appuyez sur <strong>⬆︎ Partager</strong> en bas de Safari</div>
        <div>2. Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong></div>
        <div>3. Appuyez sur <strong>Ajouter</strong></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:8px;">
        <button id="pwaIOSClose" style="font-size:13px;padding:8px 14px;border-radius:8px;background:none;border:1px solid var(--line,#ddd);cursor:pointer;color:var(--ink);">
          Compris
        </button>
      </div>
    </div>
  </div>

  <script>
  // ── Popup installation PWA ────────────────────────────────────────
  (function(){
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;
    if(isStandalone) return;

    var banner       = document.getElementById('pwaInstallBanner');
    var androidZone  = document.getElementById('pwaAndroidZone');
    var iosZone      = document.getElementById('pwaIOSZone');
    var btnInstall   = document.getElementById('pwaInstallBtn');
    var btnLater     = document.getElementById('pwaInstallLater');
    var btnClose     = document.getElementById('pwaInstallClose');
    var btnIOSClose  = document.getElementById('pwaIOSClose');
    var deferredPrompt = null;

    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    function showBanner(){
      banner.style.display = 'flex';
      if(isIOS){
        iosZone.style.display = 'block';
      } else if(deferredPrompt){
        androidZone.style.display = 'block';
      } else {
        // Android sans prompt encore disponible : afficher quand même
        // androidZone s'affichera dès que beforeinstallprompt se déclenche
        androidZone.style.display = 'block';
      }
    }
    function hideBanner(){
      banner.style.display = 'none';
    }

    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault();
      deferredPrompt = e;
      if(banner.style.display === 'flex'){
        androidZone.style.display = 'block';
      }
    });

    setTimeout(showBanner, 3000);

    btnClose.addEventListener('click', hideBanner);
    if(btnLater)   btnLater.addEventListener('click', hideBanner);
    if(btnIOSClose) btnIOSClose.addEventListener('click', hideBanner);

    if(btnInstall){
      btnInstall.addEventListener('click', function(){
        hideBanner();
        if(deferredPrompt){
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function(){ deferredPrompt = null; });
        }
      });
    }

    window.addEventListener('appinstalled', hideBanner);
  