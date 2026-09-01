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
      fi.addEventListener('change', async function(){
        var idx = parseInt(fi.getAttribute('data-idx'));
        var file = fi.files[0];
        if(!file) return;
        try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }
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
          // [products[idx]] : seul CE produit a été touché — voir les autres
          // correctifs de ce type dans ce fichier (syncFromServer,
          // pushToServer) et dans js/modal.js/js/render.js.
          save(false, [products[idx]]);
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
  document.getElementById('btnExportCompare').addEventListener('click', async function(){
    try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }
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
    document.body.classList.add('modal-open');
  });
  document.getElementById('btnResetCompare').addEventListener('click', function(){
    supplierSlots = [];
    addSupplierSlot();
    addSupplierSlot();
    compareResult.style.display = 'none';
  });
  compareClose.addEventListener('click', function(){
    document.body.classList.remove('modal-open');
    // Sur mobile, si le comparateur a été ouvert DEPUIS le tiroir menu (voir
    // msWithBack('msCompare', ...) plus haut), la croix doit "revenir" au
    // menu plutôt que de retomber sur la page du dessous — même principe
    // que Paramètres/Demandes/Connexion/Signaler un bug. Rouvrir le menu
    // seulement une fois le comparateur réellement masqué (après l'anim de
    // fermeture), sinon les deux fonds grisés se superposent un instant.
    var reopenMenu = !!window._compareOpenedFromMobileMenu;
    if(reopenMenu) window._compareOpenedFromMobileMenu = false;
    _setHeaderBackMode('compareClose', 'compareBackBtn', false);
    function afterClose(){
      if(reopenMenu && typeof window._openMenuSheet === 'function') window._openMenuSheet();
    }
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(compareOverlay, function(){ compareOverlay.classList.remove('show'); afterClose(); });
    } else {
      compareOverlay.classList.remove('show');
      afterClose();
    }
  });

  document.getElementById('btnResetFilters').addEventListener('click', function(){
    brandFilterEl.value  = '';
    familyFilterEl.value = '';
    seriesFilterEl.value = '';
    // Réinitialiser aussi le tri prix
    window._setPriceSort(null);
    // .value= ne déclenche pas "change" → resynchroniser le badge de la
    // bottom nav à la main (bouton ⊘ visible aussi sur tablette, en même
    // temps que la bottom nav — voir window._syncBnFilterBadge, _initBottomNav).
    if(typeof window._syncBnFilterBadge === 'function') window._syncBnFilterBadge();
    _lastRenderKey = '';
    render();
  });

  loadServerConfig();

  // display posé puis reflow forcé avant .show : sans ça le navigateur
  // fusionne "display:none→flex" et le déclenchement du transform dans la
  // même passe et saute la transition de glissement (même technique que
  // #menuSheet — retour utilisateur : Paramètres apparaissait sans
  // l'animation des autres tiroirs mobiles). Symétriquement à la fermeture,
  // on laisse le temps à l'animation de glissement de se terminer avant de
  // repasser en display:none (sinon ça coupe l'animation inverse).
  function openSettingsOverlay(){
    settingsOverlay.style.display = 'flex';
    settingsOverlay.offsetHeight;
    settingsOverlay.classList.add('show');
    if(typeof window._refreshAppVersionInfo === 'function') window._refreshAppVersionInfo();
  }
  function closeSettingsOverlay(){
    settingsOverlay.classList.remove('show');
    // Sur mobile, si Paramètres a été ouvert DEPUIS le tiroir menu (voir
    // msSettings plus haut), la croix doit "revenir" au menu plutôt que de
    // retomber sur la page du dessous — même principe déjà en place pour
    // "Demandes en attente" (reqClosePanel, js/requests.js). Ne se
    // déclenche que pour cette entrée précise, jamais mis à true pour un
    // accès depuis le menu ⋮ desktop.
    var reopenMenu = !!window._settingsOpenedFromMobileMenu;
    if(reopenMenu) window._settingsOpenedFromMobileMenu = false;
    _setHeaderBackMode('settingsClose', 'settingsBackBtn', false);
    setTimeout(function(){
      if(!settingsOverlay.classList.contains('show')) settingsOverlay.style.display = 'none';
      // Rouvrir le menu seulement une fois Paramètres réellement masqué —
      // #settingsOverlay n'a pas de fondu (contrairement à #requestsOverlay/
      // fadeBgOut) : son fond grisé reste plein pot pendant les 300ms où le
      // panneau coulisse. Le rouvrir avant ce délai empilait un instant le
      // fond grisé de Paramètres par-dessus le menu tout juste réouvert
      // (retour utilisateur : "souci d'overlay").
      if(reopenMenu && typeof window._openMenuSheet === 'function') window._openMenuSheet();
    }, 300);
  }
  window._closeSettingsOverlay = closeSettingsOverlay;

  btnSettings.addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    showSettingsMain();
    openSettingsOverlay();
  });
  settingsClose.addEventListener('click', closeSettingsOverlay);
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

