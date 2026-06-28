(function(){
"use strict";


// ============================================================
// core.js
// ============================================================

var STORAGE_KEY = "catalogue_produits_v1";
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

  var filebarEl = document.getElementById('filebar');
  var filebarStatusEl = document.getElementById('filebarStatus');
  var btnConnectFile = document.getElementById('btnConnectFile');
  var btnDisconnectFile = document.getElementById('btnDisconnectFile');

  function setFilebar(state, msg){
    filebarEl.classList.remove('connected','error');
    if(state) filebarEl.classList.add(state);
    if(filebarStatusEl && msg) filebarStatusEl.textContent = msg;
  }

  function updateFilebarUI(connected){
    if(connected){
      btnConnectFile.textContent = 'Changer de fichier';
      btnDisconnectFile.style.display = 'inline-block';
    }else{
      btnConnectFile.textContent = 'Choisir un fichier sur mon PC';
      btnDisconnectFile.style.display = 'none';
    }
  }

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

  var tooltipBox = document.getElementById('filebarTooltipBox');
  var tooltipWrap = document.getElementById('filebarTooltipWrap');
  if(!fsSupported){
    tooltipBox.textContent = 'Sauvegarde automatique sur fichier non disponible dans ce navigateur. Utilisez Chrome, Edge ou Brave (avec les protections de confidentialité désactivées pour ce fichier). Pour l\'instant, les données restent enregistrées dans ce navigateur (pensez à exporter).';
    btnConnectFile.style.display = 'none';
  } else {
    tooltipBox.textContent = 'Cliquez « Choisir un fichier sur mon PC » pour activer la sauvegarde automatique. Sur Brave, si le bouton ne fonctionne pas, désactivez temporairement le Bouclier Brave (icône lion) pour ce fichier.';
  }
  // Le bouton ⓘ est toujours affiché dans le header
  tooltipWrap.style.display = 'inline-flex';

  // Déclenchement au clic (hover + tap mobile)
  tooltipWrap.addEventListener('click', function(e){
    e.stopPropagation();
    tooltipBox.classList.toggle('show');
  });
  document.addEventListener('click', function(){
    tooltipBox.classList.remove('show');
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
        btnConnectFile.textContent = 'Réautoriser « ' + handle.name + ' »';
        btnConnectFile.onclick = async function(){
          var ok = await verifyPermission(handle, true);
          if(ok){
            fileHandle = handle;
            updateFilebarUI(true);
            btnConnectFile.onclick = connectFile;
            setFilebar('connected', 'Connecté à « ' + handle.name + ' » (sauvegarde automatique active).');
            await writeProductsToFile();
          }
        };
      }
    }catch(e){ /* no stored handle yet */ }
  }

  btnConnectFile.addEventListener('click', connectFile);
  btnDisconnectFile.addEventListener('click', disconnectFile);

  // ---------- Persistence ----------
  var FAMILY_ICONS_KEY = 'spi_family_icons';
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
    if(typeof serverSync !== 'undefined' && serverSync && typeof pushToServer === 'function'){
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
  

// ============================================================
// search.js
// ============================================================

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
  //     40 — marque ou famille contient le terme
  //     30 — série contient le terme
  //     20 — nom contient le terme (milieu de mot)
  //     10 — description contient le terme
  //      0 — fournisseur ou tags contiennent le terme
  //  Si plusieurs mots : score = somme des scores individuels
  //  Les produits sont triés par score décroissant
  // ─────────────────────────────────────────────────────────────
  function scoreProduct(p, terms){
    var score = 0;
    var ref  = normalizeSearch(p.ref);
    var tags = normalizeSearch((p.tags||[]).join(' '));

    terms.forEach(function(t){
      if(!t) return;
      // Référence
      if(ref === t)                 score += 100;
      else if(ref.indexOf(t) === 0) score += 80;
      else if(ref.indexOf(t) !== -1) score += 60;
      // Tags
      if(tags === t)                score += 80;
      else if(tags.indexOf(t) !== -1) score += 40;
    });
    return score;
  }

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

    // Filtrer : garder seulement les produits qui contiennent TOUS les termes
    var matched = filtered.filter(function(p){
      var hay = normalizeSearch([p.ref, (p.tags||[]).join(' ')].join(' '));
      return terms.every(function(t){ return hay.indexOf(t) !== -1; });
    });

    // Calculer et stocker le score sur chaque produit
    matched.forEach(function(p){ p._score = scoreProduct(p, terms); });

    // Trier par score décroissant
    matched.sort(function(a, b){ return b._score - a._score; });

    // Appliquer ensuite le tri prix si actif (écrase le tri pertinence)
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
  

// ============================================================
// price.js
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

  

// ============================================================
// render.js
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
    if(p.available3DX) metaItems.push(['3DEXPERIENCE', '<span class="three-d-badge" title="Disponible dans la 3DEXPERIENCE"><img src="./img/img_3dx.png" alt="3DEX" /></span>']);
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
        (p.available3DX ? '<div class="three-d-overlay" title="Disponible dans la 3DEXPERIENCE"><img src="./img/img_3dx.png" alt="3DEX"></div>' : '')+
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

  

// ============================================================
// modal.js
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

  

// ============================================================
// extraction.js
// ============================================================

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

  // ---------- Save product ----------
  

// ============================================================
// settings.js
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
      <img src="../img/icon-512.png" style="width:44px;height:44px;border-radius:10px;flex-shrink:0;" alt="App icon">
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
  

})();
