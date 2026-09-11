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
    // Retour utilisateur : une famille de même nom doit finalement partager
    // le même nom ET la même icône dans les deux catalogues (Électrique/
    // Pneumatique) — annule la séparation par domaine tentée juste avant
    // (clé composite "domaine::famille"). Ramène toute clé de ce type déjà
    // écrite entretemps vers son nom de famille simple, pour ne pas perdre
    // les choix faits pendant cette courte période.
    var _reverted = false;
    Object.keys(familyIcons).forEach(function(k){
      var sep = k.indexOf('::');
      if(sep !== -1){
        var plain = k.slice(sep + 2);
        if(!(plain in familyIcons)) familyIcons[plain] = familyIcons[k];
        delete familyIcons[k];
        _reverted = true;
      }
    });
    if(_reverted) saveFamilyIcons();
    // Enrichir depuis les produits (source de vérité) — uniquement les
    // icônes PNG modernes (FAMILY_ICON_CHOICES). Sans ce filtre, une
    // ancienne valeur "ti-xxx" (police Tabler, d'avant l'introduction des
    // icônes PNG) enregistrée sur un seul produit était recopiée telle
    // quelle dans ce cache de session, où elle gagnait alors TOUJOURS face
    // à la correspondance exacte moderne de getFamilyIcon() (priorité 1
    // prioritaire sur priorité 3) — la famille restait donc bloquée sur son
    // icône Tabler indéfiniment, même une fois getFamilyIcon() corrigé pour
    // préférer une icône moderne connue (retour utilisateur : "les icônes
    // sont encore les icônes ti-ti-, jamais rafraîchies après un
    // changement"). Affichage uniquement : aucune donnée produit modifiée.
    products.forEach(function(p){
      if(p.family && p.familyIcon && !familyIcons[p.family]
         && typeof FAMILY_ICON_CHOICES !== 'undefined' && FAMILY_ICON_CHOICES.indexOf(p.familyIcon) !== -1){
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
    // _docFiles (préfixe "_" = local uniquement, même convention) : liste des
    // fichiers joints mise en cache pendant que la sous-modale PDF d'un
    // produit est ouverte (voir js/modal-autocomplete.js) — jamais destinée à être
    // persistée. Une session gardait une valeur différente d'une autre selon
    // ce qu'elle avait ouvert/chargé, ce qui déclenchait un faux conflit à
    // chaque synchro (retour utilisateur, capture à l'appui : "hasDoc
    // _docFiles docFilename").
    products.forEach(function(p){
      if('_score' in p) delete p._score;
      if('_docFiles' in p) delete p._docFiles;
    });
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
        } else if(ok && typeof window._syncCheckAllBaseline === 'function'){
          // Voir commentaire complet dans _syncCheckAllBaseline
          // (js/actions-settings-sync.js) — évite qu'on se resynchronise
          // pour rien quelques secondes après avoir soi-même sauvegardé.
          window._syncCheckAllBaseline();
        }
      });
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
    // Clé incluant le domaine actif : products.length seul ne change pas
    // quand on bascule Électrique ↔ Pneumatique (même tableau global), mais
    // les listes marque/famille/série SCOPÉES au domaine, elles, doivent
    // être recalculées à ce moment-là.
    var v = products.length + ':' + activeDomain;
    if(v === _filterCache.version) return;
    _filterCache.version   = v;
    var scoped = window._getActiveDomainProducts();
    _filterCache.brands    = Array.from(new Set(scoped.map(function(p){return p.brand||'';}).filter(Boolean))).sort();
    _filterCache.families  = Array.from(new Set(scoped.map(function(p){return p.family||'';}).filter(Boolean))).sort();
    _filterCache.series    = Array.from(new Set(scoped.map(function(p){return p.series||'';}).filter(Boolean))).sort();
    _filterCache.suppliers = Array.from(new Set(scoped.map(function(p){return p.supplier||'';}).filter(Boolean))).sort();
  }
  // Calcule les listes marque/famille/série disponibles, chacune filtrée par
  // les deux autres sélections actives. Algorithme unique partagé par la
  // toolbar desktop (render) et le bottom-sheet mobile (buildCascadeOptions)
  // — avant, les deux avaient chacun leur propre version, avec un léger
  // écart de comportement (les familles n'étaient pas filtrées par série
  // côté desktop).
  function computeCascadeOptions(currentBrand, currentFamily, currentSeries){
    // Scopé au domaine actif : sans ça, une marque/famille/série qui n'existe
    // QUE côté pneumatique réapparaîtrait dans les listes déroulantes tant
    // qu'on regarde l'électrique (et inversement) — exactement le mélange
    // que ce champ doit éviter.
    var scoped = window._getActiveDomainProducts();
    var brandsInScope = {};
    scoped.forEach(function(p){
      var mf = !currentFamily || (p.family||'') === currentFamily;
      var ms = !currentSeries || (p.series||'') === currentSeries;
      if(mf && ms && p.brand) brandsInScope[p.brand] = true;
    });
    var brands = Object.keys(brandsInScope).sort();
    var effectiveBrand = brands.indexOf(currentBrand) !== -1 ? currentBrand : '';

    var familiesInScope = {};
    scoped.forEach(function(p){
      var mb = !effectiveBrand || (p.brand||'') === effectiveBrand;
      var ms = !currentSeries  || (p.series||'') === currentSeries;
      if(mb && ms && p.family) familiesInScope[p.family] = true;
    });
    var families = Object.keys(familiesInScope).sort();
    var effectiveFamily = families.indexOf(currentFamily) !== -1 ? currentFamily : '';

    var seriesInScope = {};
    scoped.forEach(function(p){
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

  // ---------- Domaine actif : Électrique / Pneumatique ----------
  // Retour utilisateur : ajouter le pneumatique au catalogue sans le
  // mélanger à l'électrique. marque/famille/série ne suffisent pas à les
  // séparer (les deux univers peuvent réutiliser le même nom de famille,
  // ex. "Raccords") — domaine est donc un axe à part, orthogonal aux trois
  // autres, qui filtre TOUT en amont (stats accueil, cartes familles,
  // listes marque/famille/série en cascade, recherche, grille) plutôt que
  // de s'ajouter comme un filtre de plus parmi d'autres. Persisté (comme le
  // tri prix ou "voir tout") pour retrouver le même catalogue à la
  // prochaine visite plutôt que de retomber sur l'électrique par défaut à
  // chaque rechargement. Bascule dans le header, voir js/actions-home.js.
  var DOMAIN_KEY = 'cat_domaine_actif';
  var activeDomain = localStorage.getItem(DOMAIN_KEY) === 'pneumatique' ? 'pneumatique' : 'electrique';
  // Un produit sans domaine enregistré (créé avant l'ajout de cette
  // fonctionnalité) est traité comme "Électrique" — c'était déjà, de fait,
  // le seul domaine existant : aucune migration de données nécessaire.
  function productDomain(p){ return (p && p.domaine === 'pneumatique') ? 'pneumatique' : 'electrique'; }
  window._getActiveDomain = function(){ return activeDomain; };
  window._setActiveDomain = function(d){
    activeDomain = (d === 'pneumatique') ? 'pneumatique' : 'electrique';
    try{ localStorage.setItem(DOMAIN_KEY, activeDomain); }catch(e){}
  };
  window._getActiveDomainProducts = function(){
    return products.filter(function(p){ return productDomain(p) === activeDomain; });
  };

  // Retour utilisateur : "je voudrai pas pouvoir changer de catalogue
  // lorsque j'ai un filtre actif ou même quand je suis dans une famille" —
  // vrai tant qu'on est DANS le catalogue (pas l'accueil) avec au moins un
  // critère qui restreint la liste (marque/famille/série/recherche). PAS de
  // cas particulier pour "Voir tout le catalogue" ici : viewAll ne change
  // QUE l'affichage groupé/plat (voir showCatalogueAll), jamais le filtrage
  // lui-même — une recherche reste tout à fait active EN MÊME TEMPS que
  // "Voir tout" (testé : sans ce retrait, une recherche tapée en mode "Voir
  // tout" ne verrouillait pas le sélecteur, alors que la liste affichée
  // était bien restreinte). Utilisé par js/actions-home.js
  // (window._syncDomainToggleEnabled) pour désactiver visuellement le
  // sélecteur de domaine, et en garde-fou dans le gestionnaire de clic
  // lui-même.
  //
  // 3D-EXPERIENCE/Standard volontairement PAS pris en compte ici (retour
  // utilisateur : "lorsqu'on a seulement 3DEXPERIENCE et standard actif on
  // peut changer de catalogue") — contrairement à marque/famille/série/
  // recherche, ces deux puces ont un sens identique dans les deux domaines
  // (un produit "Standard" ou disponible en 3DEXPERIENCE existe aussi bien
  // côté électrique que pneumatique), donc les garder actives en changeant
  // de catalogue n'a rien d'incohérent. switchDomain() (js/actions-home.js)
  // les réinitialise de toute façon au moment du changement, comme tous les
  // autres filtres (voir window._clearAllActiveFilters) — elles ne
  // "fuient" donc jamais d'un domaine à l'autre, seul le VERROUILLAGE du
  // sélecteur ignore désormais leur état.
  window._isCatalogueFiltered = function(){
    var home = document.getElementById('homePage');
    if(home && !home.classList.contains('hidden')) return false;
    return !!(brandFilterEl.value || familyFilterEl.value || seriesFilterEl.value || searchInputEl.value);
  };

  function escapeHtml(s){
    return (s||'').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // Retire les balises HTML d'une chaîne (description produit potentiellement
  // collée depuis une page web, avec du HTML dedans) pour n'en garder que le
  // texte brut. Remplace un ancien .replace(/<[^>]*>/g,'') utilisé à
  // plusieurs endroits du projet (issue CodeQL "Incomplete multi-character
  // sanitization" : une regex de ce genre peut être contournée par des
  // balises malformées/imbriquées, ex. un fragment "<<script>" dont une
  // seule passe de retrait ne laisse ressortir qu'un "<script>" bien formé).
  // Laisser le PARSEUR HTML du navigateur lui-même s'en charger est fiable
  // par construction — jamais d'exécution de script ni d'attribut (onerror,
  // onload…) sur un nœud qui n'est jamais inséré dans le document, vérifié
  // en le testant explicitement avant d'adopter ce correctif ici.
  function stripHtmlTags(html){
    var container = document.createElement('div');
    container.innerHTML = html || '';
    return container.textContent || container.innerText || '';
  }

  // Normalise une chaîne pour la recherche : minuscules + sans accents
  function normalizeSearch(s){
    return (s||'').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 -]/g, ' ')
      .trim();
  }

  // Repli "collé" (espaces/tirets retirés des deux côtés) utilisé quand la
  // recherche normale échoue à cause d'un séparateur en trop ou en moins
  // entre la saisie et la référence stockée — retour utilisateur : "GV2L08"
  // (sans tiret) ne retrouvait pas "GV2-L08", ni "BESM08EG" (sans espace)
  // "BES M08EG". Comparé uniquement EN REPLI (voir termMatchesField
  // ci-dessous), jamais à la place de la recherche exacte, qui reste
  // prioritaire : "coller" systématiquement risquerait, sur un terme très
  // court, de faire chevaucher deux mots qui n'ont rien à voir.
  function termMatchesField(term, field){
    if(field.indexOf(term) !== -1) return true;
    var termC = term.replace(/[\s-]/g, '');
    if(!termC) return false;
    return field.replace(/[\s-]/g, '').indexOf(termC) !== -1;
  }


  // ─────────────────────────────────────────────────────────────
  //  RECHERCHE PAR PERTINENCE
  //  Un produit correspond si TOUS les mots tapés se retrouvent quelque part
  //  (référence, nom, tags, marque ou famille). Le classement privilégie
  //  ensuite les correspondances les plus fortes :
  //    100 — référence exacte              80 — référence commence par le terme
  //     70 — nom exact complet              60 — nom commence par le terme
  //     50 — marque ou famille exacte
  //  + un petit bonus par terme selon le champ où il a été trouvé (réf > nom
  //  > tags > marque/famille), pour départager le reste.
  //  La description N'EST PAS cherchée (retour utilisateur : elle parle
  //  souvent d'un AUTRE produit en rapport — ex. une alimentation dont la
  //  description recommande "protégée par un disjoncteur" — et remontait
  //  alors dans une recherche "disjoncteur" alors que ce n'en est pas un).
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

    var score = 0;
    if(ref === raw) score = 100;
    else if(ref.indexOf(raw) === 0) score = 80;
    else if(name === raw) score = 70;
    else if(name.indexOf(raw) === 0) score = 60;
    else if(brand === raw || family === raw) score = 50;

    terms.forEach(function(t){
      if(termMatchesField(t, ref)) score += 8;
      else if(termMatchesField(t, name)) score += 6;
      else if(termMatchesField(t, tags)) score += 5;
      else if(termMatchesField(t, brand) || termMatchesField(t, family)) score += 3;
    });
    return score;
  }

  function getFilteredProducts(){
    var raw = normalizeSearch(searchInputEl.value);
    var brand  = brandFilterEl.value;
    var family = familyFilterEl.value;
    var series = seriesFilterEl.value;
    // Cases à cocher 3DEXPERIENCE/Standard (retour utilisateur) — éléments
    // relus à chaque appel plutôt que mis en cache dans une variable
    // partagée : filter3DEl/filterEssentialEl sont déclarés dans
    // js/actions-search.js, chargé après ce fichier.
    var only3D        = document.getElementById('filter3DAvailable');
    only3D = !!(only3D && only3D.checked);
    var onlyEssential = document.getElementById('filterEssential');
    onlyEssential = !!(onlyEssential && onlyEssential.checked);

    // Filtrage par sélecteurs — domaine (Électrique/Pneumatique) en premier,
    // en amont de tous les autres critères : jamais un résultat de l'autre
    // domaine, même si une marque/famille/série homonyme y existe.
    var domain = window._getActiveDomain();
    var filtered = products.filter(function(p){
      if(productDomain(p) !== domain) return false;
      if(brand  && p.brand  !== brand)  return false;
      if(family && p.family !== family) return false;
      if(series && p.series !== series) return false;
      if(only3D && !p.available3DX) return false;
      if(onlyEssential && !p.essential) return false;
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
    // champs recherchés (référence, nom, tags, marque, famille — PAS la
    // description, voir le commentaire au-dessus de scoreProductMatch)
    var matched = filtered.filter(function(p){
      var ref    = normalizeSearch(p.ref || '');
      var name   = normalizeSearch(p.name || '');
      var tags   = normalizeSearch((p.tags||[]).join(' '));
      var brandN = normalizeSearch(p.brand || '');
      var familyN= normalizeSearch(p.family || '');
      return terms.every(function(t){
        return termMatchesField(t, ref) || termMatchesField(t, name) || termMatchesField(t, tags)
          || termMatchesField(t, brandN) || termMatchesField(t, familyN);
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
  var _lazyClickBound = false; // délégation du bouton « Afficher plus », posée une fois
  var _cardAnimEndBound = false; // libération de will-change après l'entrée en cascade, posée une fois

  // fastPath=true : appelé depuis la recherche texte, qui ne change jamais
  // le périmètre des marques/familles/séries → on saute leur reconstruction.
  function render(fastPath){
    _cardIdx = 0;
    refreshFilterCache();
    // Réévalue à chaque rendu si le sélecteur de domaine doit être verrouillé
    // (voir window._isCatalogueFiltered ci-dessus) — couvre en un seul
    // endroit tous les déclencheurs (selects, cases 3D/Standard, recherche
    // avec ou sans fastPath, tiroir de filtres mobile Appliquer/Réinitialiser).
    if(typeof window._syncDomainToggleEnabled === 'function') window._syncDomainToggleEnabled();

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

    // Ignorer un rendu strictement identique au précédent (même filtre/
    // recherche/tri déjà affiché) — _lastRenderKey est explicitement remis
    // à '' par save() à CHAQUE modification du catalogue (voir plus haut),
    // ce raccourci ne peut donc jamais rater un vrai changement de contenu,
    // seulement les déclenchements redondants. Retour utilisateur : sur
    // mobile/tablette, rappliquer le même filtre (tiroir de filtres, ou
    // cliquer deux fois la même catégorie) recréait toute la grille — donc
    // rechargeait visuellement toutes les images — sans que rien n'ait
    // changé. La grille HTML seule est concernée (coûteuse, avec les
    // images) ; le rafraîchissement des <select> juste au-dessus reste
    // systématique, pour toujours refléter une marque/famille/série qui
    // vient d'apparaître ailleurs.
    var _f3dElForKey = document.getElementById('filter3DAvailable');
    var _fEssElForKey = document.getElementById('filterEssential');
    var renderKey = JSON.stringify([
      brandFilterEl.value, familyFilterEl.value, seriesFilterEl.value,
      searchInputEl.value, window._priceSort, viewAll,
      !!(_f3dElForKey && _f3dElForKey.checked), !!(_fEssElForKey && _fEssElForKey.checked),
      // Domaine actif : sans lui, basculer Électrique ↔ Pneumatique alors
      // qu'aucun autre filtre n'a changé (cas le plus courant, juste après
      // avoir cliqué le bouton) produirait la même clé que le rendu
      // précédent — et serait donc ignoré silencieusement ci-dessous.
      window._getActiveDomain()
    ]);
    if(renderKey === _lastRenderKey) return;
    _lastRenderKey = renderKey;

    var filtered = getFilteredProducts();
    var hdrChip = document.getElementById('hdrCountChip');
    if(hdrChip) hdrChip.textContent = filtered.length + (filtered.length > 1 ? ' produits' : ' produit');

    if(window._getActiveDomainProducts().length === 0){
      var _domainLabel = window._getActiveDomain() === 'pneumatique' ? 'pneumatique' : 'électrique';
      contentEl.innerHTML = '<div class="empty-state"><strong>Aucun produit '+_domainLabel+'</strong>Ajoutez votre premier produit avec le bouton « Ajouter un produit ».</div>';
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
      // La croix promise par le commentaire ci-dessus n'avait en fait
      // jamais été codée (retour utilisateur : bouton retour pour "quand
      // on s'est trompé de catégorie") — ajoutée ici, dans le bandeau
      // lui-même plutôt que la barre d'outils (restée display:none dans ce
      // mode, testé en vrai). Délégation d'événement dans js/actions-home.js
      // (le bandeau est régénéré à chaque rendu, un listener direct posé
      // ici serait perdu au rendu suivant).
      html += '<div class="active-filter-banner">'
        + '<button class="active-filter-close" title="Retour à l\'accueil" aria-label="Retour à l\'accueil"><i class="ti ti-arrow-left" aria-hidden="true"></i></button>'
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
        html += '<div id="lazyMore" style="text-align:center;padding:16px 0;"><button type="button" class="btn-load-more">Afficher plus ('+_lazyItems.length+' restants)</button></div>';
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
        html += '<div id="lazyMore" style="text-align:center;padding:16px 0;"><button type="button" class="btn-load-more">Afficher plus ('+_lazyItems.length+' restants)</button></div>';
      }
    }
    contentEl.innerHTML = html;

    // Bouton « Afficher plus » : branché ici plutôt que par un onclick="…"
    // dans la chaîne HTML ci-dessus (voir la CSP dans index.html). Délégué au
    // conteneur, parce que le bouton est recréé à chaque rendu — et posé UNE
    // SEULE FOIS, sinon render() empilerait un écouteur de plus à chaque
    // appel et un seul clic finirait par charger dix lots de cartes d'un coup.
    if(!_lazyClickBound){
      _lazyClickBound = true;
      contentEl.addEventListener('click', function(e){
        var moreBtn = e.target.closest && e.target.closest('.btn-load-more');
        if(moreBtn && typeof window._loadMoreCards === 'function') window._loadMoreCards();
      });
    }

    // Libère le calque GPU (will-change) de chaque carte une fois son
    // animation d'entrée (cardFadeIn, voir .card-fade dans css/styles.css)
    // terminée — retour utilisateur : "chute de FPS" après F5 + "Voir tout
    // le catalogue". will-change:opacity (css/styles.css, .card) force le
    // navigateur à promouvoir CHAQUE carte sur son propre calque de
    // composition dès son insertion dans le DOM ; rien ne le retirait
    // jamais une fois l'animation finie. Sur une liste qui charge des
    // centaines voire des milliers de cartes au fil du défilement
    // ("Afficher plus"), ça laissait s'accumuler indéfiniment des centaines
    // de calques GPU vivants — chacun consommant mémoire et temps de
    // composition à CHAQUE frame, bien après que l'animation qui le
    // justifiait soit terminée. Un style inline après coup passe devant la
    // règle CSS (will-change:auto) sans la modifier, donc les PROCHAINES
    // cartes insérées par un futur render() profitent quand même de l'effet
    // dès leur propre apparition.
    if(!_cardAnimEndBound){
      _cardAnimEndBound = true;
      contentEl.addEventListener('animationend', function(e){
        if(e.animationName === 'cardFadeIn' && e.target.classList.contains('card')){
          e.target.style.willChange = 'auto';
        }
      });
    }

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
      var tmp = document.createElement('div');
      var newCards = []; // uniquement les cartes de CE lot — voir rebind ci-dessous
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
        newCards.push(card);
      });
      // Rebinder les clics UNIQUEMENT sur les cartes de CE lot — un lot peut
      // atterrir dans PLUSIEURS groupes différents (mode groupement), d'où le
      // besoin de les collecter au fil de la boucle ci-dessus plutôt que de
      // ne regarder que le dernier groupe. Avant, ce rebind reparcourait
      // TOUT #content (querySelectorAll('[data-view]') sur l'ensemble des
      // cartes déjà chargées, pas seulement les nouvelles) à CHAQUE lot — le
      // filtre _viewBound évitait bien un double clic, mais la recherche
      // elle-même devenait de plus en plus coûteuse à mesure que "Voir tout
      // le catalogue" accumulait des lots au fil du défilement (coût
      // quadratique sur une session de navigation longue) — retour
      // utilisateur : "j'ai encore des problèmes de FPS lors de l'affichage
      // du catalogue complet", après un premier correctif qui n'avait
      // traité que l'accumulation de calques GPU (will-change), pas celui-ci.
      newCards.forEach(function(card){
        card._viewBound = true;
        card.addEventListener('click', function(){ openView(card.getAttribute('data-view')); });
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