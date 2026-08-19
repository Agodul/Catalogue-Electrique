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

  // Positionne le conteneur de toasts juste sous le header (dont la hauteur
  // varie selon les breakpoints) plutôt que de la dupliquer en dur en CSS.
  function _positionToastStack(stack){
    var header = document.querySelector('header');
    var top = header ? header.getBoundingClientRect().bottom + 12 : 16;
    stack.style.top = top + 'px';
  }
  window.addEventListener('resize', function(){
    var stack = document.getElementById('toastStack');
    if(stack) _positionToastStack(stack);
  });

  function showToast(message, type, duration){
    if(typeof duration !== 'number'){
      // Durée adaptée à la longueur du message : une confirmation courte
      // reste ~2,5-3s, un message d'erreur long (ex. validation du
      // configurateur) reste affiché plus longtemps pour être lisible,
      // jusqu'à un plafond raisonnable.
      var base = (type === 'err' || type === 'warn') ? 3000 : 2200;
      duration = Math.min(base + (message ? message.length * 45 : 0), 9000);
    }
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    var iconClass = {ok:'ti-circle-check', err:'ti-alert-circle', warn:'ti-alert-triangle', info:'ti-info-circle'}[type] || 'ti-info-circle';
    var icon = document.createElement('i');
    icon.className = 'ti ' + iconClass + ' toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    var text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    toast.appendChild(icon);
    toast.appendChild(text);
    var stack = document.getElementById('toastStack');
    if(!stack){
      stack = document.createElement('div');
      stack.id = 'toastStack';
      document.body.appendChild(stack);
    }
    _positionToastStack(stack);
    stack.appendChild(toast);
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
      var choice = await customConfirm('Connecter un fichier', 'Choisissez un fichier .json existant à utiliser, ou créez un nouveau fichier de sauvegarde.', { okLabel: 'Choisir un fichier existant', cancelLabel: 'Créer un nouveau fichier' });
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
              var useImported = await customConfirm('Fichier existant', 'Le fichier choisi contient ' + parsed.length + ' produit(s).', { okLabel: 'Charger ce contenu (remplace le catalogue actuel)', cancelLabel: 'Garder le catalogue actuel' });
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
  // `changedProducts` (optionnel) : liste des produits réellement touchés par
  // cet appel — quand elle est fournie, seuls ceux-ci sont envoyés au serveur
  // au lieu de la totalité du catalogue. Sans ça, ajouter/modifier UN produit
  // renvoyait les centaines de produits existants à chaque sauvegarde (gros
  // payload, plus lent, et identifié avec le serveur comme cause du blocage
  // 403 sur les comptes non-admin — retour utilisateur + dev). Omise (bulk
  // import, nettoyage descriptions...) → comportement inchangé, catalogue
  // complet envoyé, ces flux touchant légitimement beaucoup de produits.
  function save(skipFileWrite, changedProducts){
    _lastRenderKey = '';
    _filterCache.version = -1;
    // Nettoyage : _score était un champ de score de recherche d'une version
    // précédente, jamais recalculé aujourd'hui — on le retire au passage pour
    // qu'il disparaisse progressivement des fiches plutôt que de rester figé.
    products.forEach(function(p){ if('_score' in p) delete p._score; });
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    }catch(e){
      showToast("Impossible d'enregistrer dans le navigateur (stockage plein). Le fichier connecté sur votre PC, si actif, reste à jour.", 'err', 6000);
    }
    if(!skipFileWrite && fileHandle){
      writeProductsToFile();
    }
    // Sync serveur si activée
    // Push vers le serveur si configuré — on avertit si l'envoi échoue
    // (sinon un changement, ex. icône de famille, peut rester local sans
    // que personne ne s'en aperçoive avant la prochaine synchro).
    if(typeof pushToServer === 'function' && localStorage.getItem('cat_server_url')){
      pushToServer(changedProducts).then(function(ok){
        if(!ok && typeof showToast === 'function'){
          showToast('Échec de synchronisation avec le serveur — modification enregistrée localement uniquement', 'warn', 5000);
        }
      });
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
  // Calcule les listes marque/famille/série disponibles, chacune filtrée par
  // les deux autres sélections actives. Algorithme unique partagé par la
  // toolbar desktop (render) et le bottom-sheet mobile (buildCascadeOptions)
  // — avant, les deux avaient chacun leur propre version, avec un léger
  // écart de comportement (les familles n'étaient pas filtrées par série
  // côté desktop).
  function computeCascadeOptions(currentBrand, currentFamily, currentSeries){
    var brandsInScope = {};
    products.forEach(function(p){
      var mf = !currentFamily || (p.family||'') === currentFamily;
      var ms = !currentSeries || (p.series||'') === currentSeries;
      if(mf && ms && p.brand) brandsInScope[p.brand] = true;
    });
    var brands = Object.keys(brandsInScope).sort();
    var effectiveBrand = brands.indexOf(currentBrand) !== -1 ? currentBrand : '';

    var familiesInScope = {};
    products.forEach(function(p){
      var mb = !effectiveBrand || (p.brand||'') === effectiveBrand;
      var ms = !currentSeries  || (p.series||'') === currentSeries;
      if(mb && ms && p.family) familiesInScope[p.family] = true;
    });
    var families = Object.keys(familiesInScope).sort();
    var effectiveFamily = families.indexOf(currentFamily) !== -1 ? currentFamily : '';

    var seriesInScope = {};
    products.forEach(function(p){
      var mb = !effectiveBrand  || (p.brand||'') === effectiveBrand;
      var mf = !effectiveFamily || (p.family||'') === effectiveFamily;
      if(mb && mf && p.series) seriesInScope[p.series] = true;
    });
    var series = Object.keys(seriesInScope).sort();

    return {
      brands: brands, effectiveBrand: effectiveBrand,
      families: families, effectiveFamily: effectiveFamily,
      series: series
    };
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


  // ─────────────────────────────────────────────────────────────
  //  RECHERCHE PAR PERTINENCE
  //  Un produit correspond si TOUS les mots tapés se retrouvent quelque part
  //  (référence, nom, tags, marque, famille ou description). Le classement
  //  privilégie ensuite les correspondances les plus fortes :
  //    100 — référence exacte              80 — référence commence par le terme
  //     70 — nom exact complet              60 — nom commence par le terme
  //     50 — marque ou famille exacte
  //  + un petit bonus par terme selon le champ où il a été trouvé (réf > nom
  //  > tags > marque/famille > description), pour départager le reste.
  //  Le score est calculé à la volée pour la recherche en cours — il n'est
  //  jamais écrit sur les produits eux-mêmes (voir l'ancien champ _score,
  //  supprimé, qui restait figé une fois enregistré par erreur).
  // ─────────────────────────────────────────────────────────────
  function scoreProductMatch(p, raw, terms){
    var ref    = normalizeSearch(p.ref || '');
    var name   = normalizeSearch(p.name || '');
    var tags   = normalizeSearch((p.tags||[]).join(' '));
    var brand  = normalizeSearch(p.brand || '');
    var family = normalizeSearch(p.family || '');
    var desc   = normalizeSearch(p.desc || '');

    var score = 0;
    if(ref === raw) score = 100;
    else if(ref.indexOf(raw) === 0) score = 80;
    else if(name === raw) score = 70;
    else if(name.indexOf(raw) === 0) score = 60;
    else if(brand === raw || family === raw) score = 50;

    terms.forEach(function(t){
      if(ref.indexOf(t) !== -1) score += 8;
      else if(name.indexOf(t) !== -1) score += 6;
      else if(tags.indexOf(t) !== -1) score += 5;
      else if(brand.indexOf(t) !== -1 || family.indexOf(t) !== -1) score += 3;
      else if(desc.indexOf(t) !== -1) score += 1;
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

    // Filtrer : le produit doit contenir chaque terme dans au moins un des
    // champs recherchés (référence, nom, tags, marque, famille, description)
    var matched = filtered.filter(function(p){
      var ref    = normalizeSearch(p.ref || '');
      var name   = normalizeSearch(p.name || '');
      var tags   = normalizeSearch((p.tags||[]).join(' '));
      var brandN = normalizeSearch(p.brand || '');
      var familyN= normalizeSearch(p.family || '');
      var desc   = normalizeSearch(p.desc || '');
      return terms.every(function(t){
        return ref.indexOf(t) !== -1 || name.indexOf(t) !== -1 || tags.indexOf(t) !== -1
          || brandN.indexOf(t) !== -1 || familyN.indexOf(t) !== -1 || desc.indexOf(t) !== -1;
      });
    });

    // Trier par pertinence (score calculé pour cette recherche uniquement)
    matched.sort(function(a, b){ return scoreProductMatch(b, raw, terms) - scoreProductMatch(a, raw, terms); });

    // Tri prix si actif (prioritaire sur la pertinence si demandé explicitement)
    if(window._priceSort === 'asc'){
      matched.sort(function(a,b){ return (parsePriceNumber(a.price)||0) - (parsePriceNumber(b.price)||0); });
    } else if(window._priceSort === 'desc'){
      matched.sort(function(a,b){ return (parsePriceNumber(b.price)||0) - (parsePriceNumber(a.price)||0); });
    }
    return matched;
  }

  // Regroupe une liste de produits par champ (marque/famille/série), groupes
  // triés alphabétiquement. Utilisé uniquement en mode navigation normale —
  // en mode recherche, les résultats restent en liste plate triée par
  // pertinence (voir getFilteredProducts), donc pas de tri par groupe ici.
  function groupByField(list, field, fallbackLabel){
    var groups = {};
    var order = [];
    list.forEach(function(p){
      var key = p[field] || fallbackLabel;
      if(!groups[key]){ groups[key] = []; order.push(key); }
      groups[key].push(p);
    });
    order.sort(function(a,b){ return a.localeCompare(b, 'fr'); });
    return {groups:groups, order:order};
  }

  var _lastRenderKey = '';
  var _vmMenuTimer = null;
  var _lazyScrollHandler = null;

  // fastPath=true : appelé depuis la recherche texte, qui ne change jamais
  // le périmètre des marques/familles/séries → on saute leur reconstruction.
  function render(fastPath){
    _cardIdx = 0;
    refreshFilterCache();

    if(!fastPath){
      var origBrand  = brandFilterEl.value;
      var origFamily = familyFilterEl.value;
      var origSeries = seriesFilterEl.value;
      var opts = computeCascadeOptions(origBrand, origFamily, origSeries);

      brandFilterEl.innerHTML = '<option value="">Toutes les marques</option>' + opts.brands.map(function(b){
        return '<option value="'+escapeHtml(b)+'">'+escapeHtml(b)+'</option>';
      }).join('');
      brandFilterEl.value = opts.effectiveBrand;

      familyFilterEl.innerHTML = '<option value="">Toutes les familles</option>' + opts.families.map(function(f){
        return '<option value="'+escapeHtml(f)+'">'+escapeHtml(f)+'</option>';
      }).join('');
      familyFilterEl.value = opts.effectiveFamily;

      seriesFilterEl.innerHTML = '<option value="">Toutes les séries</option>' + opts.series.map(function(s){
        return '<option value="'+escapeHtml(s)+'">'+escapeHtml(s)+'</option>';
      }).join('');
      seriesFilterEl.value = opts.series.indexOf(origSeries) !== -1 ? origSeries : '';
    }

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

    // ── Bandeau de catégorie active (ex: clic sur une carte famille depuis
    // l'accueil) — remplace le menu déroulant (peu visible) par un gros
    // titre en haut des résultats, avec une croix pour revenir à l'accueil.
    var activeFamily = familyFilterEl.value;
    var activeBrand  = brandFilterEl.value;
    if(!hasSearch && !viewAll && (activeFamily || activeBrand)){
      html += '<div class="active-filter-banner">'
        + '<span class="active-filter-title">'+escapeHtml(activeFamily || activeBrand)+'</span>'
        + '</div>';
    }

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
      var g = groupByField(filtered, fieldMap[groupBy], fallbackMap[groupBy]);
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
      // Rebinder les clics sur les nouvelles cartes — un lot peut atterrir dans
      // PLUSIEURS groupes différents (mode groupement), donc on reparcourt tout
      // le conteneur plutôt que le seul dernier groupe, sinon les cartes ajoutées
      // aux autres groupes restent sans clic (_viewBound évite les doublons).
      contentEl.querySelectorAll('[data-view]').forEach(function(card){
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
      var _lazyScrollTicking = false;
      _lazyScrollHandler = function(){
        if(_lazyScrollTicking) return;
        _lazyScrollTicking = true;
        requestAnimationFrame(function(){
          _lazyScrollTicking = false;
          var el = document.getElementById('lazyMore');
          if(!el) return;
          var rect = el.getBoundingClientRect();
          if(rect.top < window.innerHeight + 200){ window._loadMoreCards(); }
        });
      };
      window.addEventListener('scroll', _lazyScrollHandler, {capture:true, passive:true});
    }

    // Clic sur la carte → ouvre la vue de consultation
    contentEl.querySelectorAll('[data-view]').forEach(function(card){
      card.addEventListener('click', function(e){
        openView(card.getAttribute('data-view'));
      });
    });

  }