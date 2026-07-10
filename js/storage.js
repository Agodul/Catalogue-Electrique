"use strict";

  var STORAGE_KEY = "cat_produits_v1";
  var products = [];
  var editingId = null;

  // ---------- File System Access (sauvegarde auto sur le PC) ----------
  var fileHandle = null;
  var fsSupported = ('showSaveFilePicker' in window) || ('showOpenFilePicker' in window);
  var IDB_NAME = 'catalogue_fs_handles';
  var IDB_STORE = 'handles';
  var IDB_KEY = 'catalogueFile';

  function idbOpen(){
    return new Promise(function(resolve, reject){
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function(){ req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }
  function idbSet(key, val){
    return idbOpen().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, key);
        tx.oncomplete = function(){ resolve(); };
        tx.onerror = function(){ reject(tx.error); };
      });
    });
  }
  function idbGet(key){
    return idbOpen().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = function(){ resolve(req.result || null); };
        req.onerror = function(){ reject(req.error); };
      });
    });
  }
  function idbDel(key){
    return idbOpen().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = function(){ resolve(); };
        tx.onerror = function(){ reject(tx.error); };
      });
    });
  }

  var filebarEl = null;
  var filebarStatusEl = null;
  var btnConnectFile = null;
  var btnDisconnectFile = null;

  function setFilebar(state, msg){ /* filebar supprimée */ }
  function updateFilebarUI(connected){ /* filebar supprimée */ }

  function showToast(message, type, duration){
    duration = typeof duration === 'number' ? duration : 3000;
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function(){ toast.classList.add('visible'); });
    setTimeout(function(){
      toast.classList.remove('visible');
      setTimeout(function(){ if(toast.parentNode) toast.parentNode.removeChild(toast); }, 250);
    }, duration);
  }

  /* tooltip filebar supprimé */

  // Déclenchement au clic (hover + tap mobile)
  if(false && tooltipWrap) tooltipWrap.addEventListener('click', function(e){
    e.stopPropagation();
    if(typeof tooltipBox !== 'undefined' && tooltipBox) tooltipBox.classList.toggle('show');
  });
  document.addEventListener('click', function(){
    if(typeof tooltipBox !== 'undefined' && tooltipBox) tooltipBox.classList.remove('show');
  });

  async function verifyPermission(handle, forWrite){
    var opts = forWrite ? {mode:'readwrite'} : {};
    if((await handle.queryPermission(opts)) === 'granted') return true;
    if((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  async function writeProductsToFile(){
    if(!fileHandle) return;
    try{
      var ok = await verifyPermission(fileHandle, true);
      if(!ok){
        setFilebar('error', 'Permission refusée pour écrire sur le fichier. Reconnectez-le.');
        return;
      }
      var writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(products, null, 2));
      await writable.close();
      var now = new Date();
      setFilebar('connected', 'Connecté à « ' + fileHandle.name + ' » — dernière écriture à ' + now.toLocaleTimeString('fr-FR'));
    }catch(err){
      setFilebar('error', 'Erreur d\'écriture sur le fichier : ' + (err && err.message ? err.message : err));
    }
  }

  async function connectFile(){
    try{
      var handle;
      // Try to open an existing file, fall back to creating a new one
      var choice = confirm('Cliquez sur OK pour choisir un fichier .json existant à utiliser,\nou sur Annuler pour créer un nouveau fichier de sauvegarde.');
      if(choice){
        var handles = await window.showOpenFilePicker({
          types: [{description:'Catalogue JSON', accept:{'application/json':['.json']}}],
          excludeAcceptAllOption:false,
          multiple:false
        });
        handle = handles[0];
      }else{
        handle = await window.showSaveFilePicker({
          suggestedName:'catalogue.json',
          types:[{description:'Catalogue JSON', accept:{'application/json':['.json']}}]
        });
      }
      var ok = await verifyPermission(handle, true);
      if(!ok){
        setFilebar('error', 'Permission refusée. Réessayez et autorisez l\'accès.');
        return;
      }
      fileHandle = handle;
      await idbSet(IDB_KEY, handle);

      // If opening an existing file, try to load its content
      if(choice){
        try{
          var file = await handle.getFile();
          var text = await file.text();
          if(text.trim()){
            var parsed = JSON.parse(text);
            if(Array.isArray(parsed)){
              var useImported = confirm('Le fichier choisi contient ' + parsed.length + ' produit(s).\n\nOK = charger ce contenu (remplace le catalogue actuel affiché)\nAnnuler = garder le catalogue actuel et l\'écrire dans ce fichier');
              if(useImported){
                products = parsed;
                save(true);
              }
            }
          }
        }catch(e){ /* empty or invalid file, will be overwritten on next save */ }
      }

      updateFilebarUI(true);
      await writeProductsToFile();
    }catch(err){
      if(err && err.name === 'AbortError') return; // user cancelled picker
      setFilebar('error', 'Impossible de connecter le fichier : ' + (err && err.message ? err.message : err));
    }
  }

  async function disconnectFile(){
    fileHandle = null;
    await idbDel(IDB_KEY);
    updateFilebarUI(false);
    setFilebar('', 'Déconnecté — sauvegarde uniquement dans ce navigateur. Connectez un fichier pour reprendre la sauvegarde automatique.');
  }

  async function tryReconnectOnLoad(){
    if(!fsSupported) return;
    try{
      var handle = await idbGet(IDB_KEY);
      if(!handle) return;
      var perm = await handle.queryPermission({mode:'readwrite'});
      if(perm === 'granted'){
        fileHandle = handle;
        updateFilebarUI(true);
        setFilebar('connected', 'Connecté à « ' + handle.name + ' » (sauvegarde automatique active).');
      }else{
        setFilebar('', 'Fichier « ' + handle.name + ' » précédemment connecté — cliquez pour réautoriser l\'accès.');
        if(btnConnectFile) btnConnectFile.textContent = 'Réautoriser « ' + handle.name + ' »';
        if(btnConnectFile) btnConnectFile.onclick = async function(){
          var ok = await verifyPermission(handle, true);
          if(ok){
            fileHandle = handle;
            updateFilebarUI(true);
            if(btnConnectFile) btnConnectFile.onclick = connectFile;
            setFilebar('connected', 'Connecté à « ' + handle.name + ' » (sauvegarde automatique active).');
            await writeProductsToFile();
          }
        };
      }
    }catch(e){ /* no stored handle yet */ }
  }

  if(btnConnectFile) btnConnectFile.addEventListener('click', connectFile);
  if(btnDisconnectFile) btnDisconnectFile.addEventListener('click', disconnectFile);

  // ---------- Persistence ----------
  var FAMILY_ICONS_KEY = 'cat_family_icons';
  var familyIcons = {}; // { "Câbles": "ti-plug-connected", ... }

  function loadFamilyIcons(){
    try{
      var raw = localStorage.getItem(FAMILY_ICONS_KEY);
      familyIcons = raw ? JSON.parse(raw) : {};
    }catch(e){ familyIcons = {}; }
    // Enrichir depuis les produits (source de vérité)
    products.forEach(function(p){
      if(p.family && p.familyIcon && !familyIcons[p.family]){
        familyIcons[p.family] = p.familyIcon;
      }
    });
  }
  function saveFamilyIcons(){
    try{ localStorage.setItem(FAMILY_ICONS_KEY, JSON.stringify(familyIcons)); }catch(e){}
  }

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      products = raw ? JSON.parse(raw) : [];
    }catch(e){ products = []; }
    loadFamilyIcons();
  }
  function save(skipFileWrite){
    _lastRenderKey = '';
    _filterCache.version = -1;
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    }catch(e){
      alert("Impossible d'enregistrer dans le navigateur (stockage plein). Le fichier connecté sur votre PC, si actif, reste à jour.");
    }
    if(!skipFileWrite && fileHandle){
      writeProductsToFile();
    }
    // Sync serveur si activée
    // Push vers le serveur si configuré
    if(typeof pushToServer === 'function' && localStorage.getItem('cat_server_url')){
      pushToServer();
    }
    // Animation 7 — pulse du point de sauvegarde
    var dot = document.getElementById('filebarDot');
    if(dot){
      dot.classList.remove('pulsing');
      void dot.offsetWidth; // force reflow pour relancer l'animation
      dot.classList.add('pulsing');
      dot.addEventListener('animationend', function(){ dot.classList.remove('pulsing'); }, {once:true});
    }
  }

  // ---------- Rendering ----------
  var contentEl = document.getElementById('content');
  var brandFilterEl = document.getElementById('brandFilter');
  var familyFilterEl = document.getElementById('familyFilter');
  var seriesFilterEl = document.getElementById('seriesFilter');
  var searchInputEl = document.getElementById('searchInput');
  var brandListEl    = null; // remplacé par autocomplete custom
  var supplierListEl = null; // remplacé par autocomplete custom

  // Cache des listes de filtres — recalculé seulement quand products change
  var _filterCache = { brands:[], families:[], series:[], suppliers:[], version:-1 };
  function refreshFilterCache(){
    var v = products.length;
    if(v === _filterCache.version) return;
    _filterCache.version   = v;
    _filterCache.brands    = Array.from(new Set(products.map(function(p){return p.brand||'';}).filter(Boolean))).sort();
    _filterCache.families  = Array.from(new Set(products.map(function(p){return p.family||'';}).filter(Boolean))).sort();
    _filterCache.series    = Array.from(new Set(products.map(function(p){return p.series||'';}).filter(Boolean))).sort();
    _filterCache.suppliers = Array.from(new Set(products.map(function(p){return p.supplier||'';}).filter(Boolean))).sort();
  }
  var familyListEl = null; // remplacé par autocomplete custom
  var seriesListEl = null; // remplacé par autocomplete custom
  var groupBy = 'brand'; // 'brand' | 'family' | 'series'
  var _lazyItems = []; // persistant entre renders et _loadMoreCards
  var viewAll = sessionStorage.getItem('cat_view_all') === '1'; // persisté sur F5
  window._getProducts = function(){ return products; };
  window._setViewAll = function(v){
    viewAll = v;
    sessionStorage.setItem('cat_view_all', v ? '1' : '0');
  };

  function escapeHtml(s){
    return (s||'').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // Normalise une chaîne pour la recherche : minuscules + sans accents
  function normalizeSearch(s){
    return (s||'').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 -]/g, ' ')
      .trim();
  }

  // Surligne les termes de recherche dans un texte (retourne HTML)
  function highlight(text, terms){
    if(!terms || !terms.length || !text) return escapeHtml(text);
    // Travailler caractère par caractère sur le texte original
    // pour éviter les décalages d'index entre normalisé et original
    var norm = normalizeSearch(text);
    var lower = text.toLowerCase();
    // Construire un tableau de positions à surligner
    var marks = new Array(text.length).fill(false);
    terms.forEach(function(t){
      if(!t || t.length < 2) return;
      var start = 0;
      while(true){
        var idx = norm.indexOf(t, start);
        if(idx === -1) break;
        // Marquer les positions dans le texte original
        for(var k = idx; k < Math.min(idx + t.length, text.length); k++) marks[k] = true;
        start = idx + 1;
      }
    });
    // Construire le HTML avec les balises <mark>
    var result = '';
    var inMark = false;
    for(var i = 0; i < text.length; i++){
      var ch = escapeHtml(text[i]);
      if(marks[i] && !inMark){ result += '<mark class="hl">'; inMark = true; }
      if(!marks[i] && inMark){ result += '</mark>'; inMark = false; }
      result += ch;
    }
    if(inMark) result += '</mark>';
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  //  RECHERCHE PAR PERTINENCE
  //  Score attribué à chaque produit selon la qualité de correspondance :
  //    100 — référence exacte (ex: "BMF00JC" → BMF00JC)
  //     80 — référence commence par le terme
  //     70 — nom exact complet
  //     60 — nom commence par le terme
  //     50 — marque ou famille exacte
  // ─────────────────────────────────────────────────────────────
  //  Recherche par référence ET tags uniquement
  // ─────────────────────────────────────────────────────────────
  function getFilteredProducts(){
    var raw = normalizeSearch(searchInputEl.value);
    var brand  = brandFilterEl.value;
    var family = familyFilterEl.value;
    var series = seriesFilterEl.value;

    // Filtrage par sélecteurs
    var filtered = products.filter(function(p){
      if(brand  && p.brand  !== brand)  return false;
      if(family && p.family !== family) return false;
      if(series && p.series !== series) return false;
      return true;
    });

    if(!raw){
      if(window._priceSort === 'asc'){
        filtered.sort(function(a,b){ return (parsePriceNumber(a.price)||0) - (parsePriceNumber(b.price)||0); });
      } else if(window._priceSort === 'desc'){
        filtered.sort(function(a,b){ return (parsePriceNumber(b.price)||0) - (parsePriceNumber(a.price)||0); });
      }
      return filtered;
    }

    // Découpe en mots pour recherche multi-termes
    var terms = raw.split(/\s+/).filter(Boolean);

    // Filtrer : ref OU tags contiennent tous les termes
    var matched = filtered.filter(function(p){
      var ref  = normalizeSearch(p.ref || '');
      var tags = normalizeSearch((p.tags||[]).join(' '));
      return terms.every(function(t){
        return ref.indexOf(t) !== -1 || tags.indexOf(t) !== -1;
      });
    });

    // Trier : ref exacte en premier, puis ref partielle, puis tags
    matched.sort(function(a, b){
      var ra = normalizeSearch(a.ref||'');
      var rb = normalizeSearch(b.ref||'');
      var term0 = terms[0] || '';
      var aExact = ra === term0 ? 2 : ra.indexOf(term0) === 0 ? 1 : 0;
      var bExact = rb === term0 ? 2 : rb.indexOf(term0) === 0 ? 1 : 0;
      return bExact - aExact;
    });

    // Tri prix si actif
    if(window._priceSort === 'asc'){
      matched.sort(function(a,b){ return (parsePriceNumber(a.price)||0) - (parsePriceNumber(b.price)||0); });
    } else if(window._priceSort === 'desc'){
      matched.sort(function(a,b){ return (parsePriceNumber(b.price)||0) - (parsePriceNumber(a.price)||0); });
    }
    return matched;
  }

  function groupByField(list, field, fallbackLabel, hasSearch){
    var groups = {};
    var order = [];
    var groupScore = {}; // score max par groupe
    list.forEach(function(p){
      var key = p[field] || fallbackLabel;
      if(!groups[key]){ groups[key] = []; order.push(key); groupScore[key] = 0; }
      groups[key].push(p);
      // Garder le score max du groupe (stocké sur le produit via _score)
      if(p._score !== undefined && p._score > groupScore[key]) groupScore[key] = p._score;
    });
    if(hasSearch){
      // Trier les groupes par score max décroissant
      order.sort(function(a,b){ return groupScore[b] - groupScore[a]; });
    } else {
      order.sort(function(a,b){ return a.localeCompare(b, 'fr'); });
    }
    return {groups:groups, order:order};
  }

  var _lastRenderKey = '';
  var _vmMenuTimer = null;
  var _lazyScrollHandler = null;

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
    _lazyItems = []; // produits à afficher progressivement

    if(hasSearch || viewAll){
      // ── Mode recherche ou "Voir tout" : liste plate ──
      _lazyItems = filtered.slice(40);
      var label = hasSearch ? 'Résultats' : 'Tous les produits';
      html += '<div class="brand-group" id="lazySearchGroup">';
      html += '<div class="brand-heading"><h2>'+label+'</h2><span class="tally sans">'+filtered.length+(filtered.length>1?' références':' référence')+'</span></div>';
      html += '<div class="grid" id="lazyGrid">';
      filtered.slice(0, 40).forEach(function(p){ html += renderCard(p); });
      html += '</div></div>';
      if(filtered.length > 40){
        html += '<div id="lazyMore" style="text-align:center;padding:16px 0;"><button class="btn-load-more" onclick="window._loadMoreCards()">Afficher plus ('+_lazyItems.length+' restants)</button></div>';
      }
    } else {
      // ── Mode normal : groupement par marque/famille/série ──
      var fieldMap = {brand:'brand', family:'family', series:'series'};
      var fallbackMap = {brand:'(Sans marque)', family:'(Sans famille)', series:'(Sans série)'};
      var g = groupByField(filtered, fieldMap[groupBy], fallbackMap[groupBy], false);
      var totalRendered = 0;
      g.order.forEach(function(groupName){
        var items = g.groups[groupName];
        html += '<div class="brand-group" data-group="'+escapeHtml(groupName)+'">';
        html += '<div class="brand-heading"><h2>'+escapeHtml(groupName)+'</h2><span class="tally sans">'+items.length+(items.length>1?' références':' référence')+'</span></div>';
        html += '<div class="grid">';
        items.forEach(function(p){
          if(totalRendered < 40){
            html += renderCard(p);
            totalRendered++;
          } else {
            // Stocker pour lazy load avec le groupe d'appartenance
            _lazyItems.push({ p: p, group: groupName });
          }
        });
        html += '</div></div>';
      });
      if(_lazyItems.length > 0){
        html += '<div id="lazyMore" style="text-align:center;padding:16px 0;"><button class="btn-load-more" onclick="window._loadMoreCards()">Afficher plus ('+_lazyItems.length+' restants)</button></div>';
      }
    }
    contentEl.innerHTML = html;

    // ── Lazy load : charger plus de cartes au clic ou au scroll ──
    var _lazyOffset = 40;
    window._loadMoreCards = function(){
      // En mode recherche/viewAll : lazyGrid existe
      // En mode normal (groupement) : utiliser le conteneur principal
      var grid = document.getElementById('lazyGrid');
      if(!grid){
        // Mode groupement : utiliser #content et récupérer le dernier groupe
        var mainContent = document.getElementById('content');
        if(mainContent){
          var allGroups = mainContent.querySelectorAll('.brand-group .grid');
          if(allGroups.length > 0) grid = allGroups[allGroups.length - 1];
        }
      }
      if(!grid) return;
      var batch = _lazyItems.slice(0, 40);
      _lazyItems = _lazyItems.slice(40);
      var frag = document.createDocumentFragment();
      var tmp = document.createElement('div');
      // Les items peuvent être des produits directs ou des objets {p, group}
      batch.forEach(function(item){
        var p = item.p || item;
        var group = item.group;
        var targetGrid = grid;
        if(group){
          // Trouver le groupe correspondant
          var groupEl = contentEl.querySelector('.brand-group[data-group="'+group+'"] .grid');
          if(groupEl) targetGrid = groupEl;
        }
        tmp.innerHTML = renderCard(p);
        var card = tmp.firstChild;
        targetGrid.appendChild(card);
      });
      // Rebinder les clics sur les nouvelles cartes
      grid.querySelectorAll('[data-view]').forEach(function(card){
        if(!card._viewBound){ card._viewBound = true; card.addEventListener('click', function(){ openView(card.getAttribute('data-view')); }); }
      });
      var moreBtn = document.getElementById('lazyMore');
      if(_lazyItems.length === 0){
        if(moreBtn) moreBtn.remove();
      } else {
        if(moreBtn) moreBtn.querySelector('button').textContent = 'Afficher plus ('+_lazyItems.length+' restants)';
      }
    };

    // Auto-load au scroll
    if(_lazyScrollHandler) window.removeEventListener('scroll', _lazyScrollHandler, true);
    if(_lazyItems.length > 0){
      _lazyScrollHandler = function(){
        var el = document.getElementById('lazyMore');
        if(!el) return;
        var rect = el.getBoundingClientRect();
        if(rect.top < window.innerHeight + 200){ window._loadMoreCards(); }
      };
      window.addEventListener('scroll', _lazyScrollHandler, true);
    }

    // Clic sur la carte → ouvre la vue de consultation
    contentEl.querySelectorAll('[data-view]').forEach(function(card){
      card.addEventListener('click', function(e){
        openView(card.getAttribute('data-view'));
      });
    });

  }