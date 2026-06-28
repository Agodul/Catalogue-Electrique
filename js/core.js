// ============================================================
// core.js — Stockage, état global, utilitaires
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
  