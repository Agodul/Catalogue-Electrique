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
      return val.map(function(h){ return new Date(h.date).toLocaleDateString('fr-FR')+' → '+(typeof _displayPrice==='function'?_displayPrice(h.price):h.price); }).join('<br>');
    }
    // Prix affichés au même format que partout ailleurs dans l'app (virgule
    // + €, via _displayPrice() dans render.js) plutôt que la valeur brute
    // stockée — qui peut être au format point + "EUR" selon la source
    // (retour utilisateur, capture à l'appui : "154.50 EUR" dans la fenêtre
    // de conflits alors que le reste de l'app affiche "154,50 €").
    if((key === 'price' || key === 'priceCatalogue') && typeof _displayPrice === 'function'){
      return escapeHtml(String(_displayPrice(val)));
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
    // Même liste d'exclusion que withoutServerFields() plus haut — sinon ces
    // champs (jamais responsables du conflit lui-même) apparaissaient quand
    // même dans le tableau avec un "≠", laissant croire à tort qu'ils en
    // étaient la cause (retour utilisateur : "la raison c'est hasDoc
    // _docFiles docFilename" — alors qu'un vrai conflit se déclenchait sur
    // un autre champ, ces trois-là étant juste incidemment différents aussi).
    var allKeys = Object.keys(Object.assign({}, c.local, c.server))
      .filter(function(k){
        return ['id','familyIcon','updatedAt','createdAt','suggestions','suggestionsHidden','spareParts','sparePartsHidden','hasDoc','docFilename','_docFiles'].indexOf(k) === -1;
      });
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
      +'<th style="padding:8px 12px;font-size:12px;text-align:left;border-bottom:2px solid var(--line);"><i class="ti ti-device-mobile"></i> Version locale</th>'
      +'<th style="padding:8px 12px;font-size:12px;text-align:left;border-bottom:2px solid var(--line);"><i class="ti ti-cloud"></i> Version serveur</th>'
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
    document.body.classList.remove('modal-open');
    if(overlay){
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(overlay, function(){ overlay.style.display = 'none'; });
      } else {
        overlay.style.display = 'none';
      }
    }
  }

  function applyConflictChoices(){
    // Map plutôt qu'objet nu — voir doCheckAllSync() plus haut.
    var localMap = new Map();
    products.forEach(function(p, i){ if(p.ref) localMap.set(p.ref, i); });
    var touchedByConflict = [];
    _pendingConflicts.forEach(function(c){
      if((_conflictChoices[c.ref] || 'local') === 'server'){
        var idx = localMap.get(c.ref);
        if(idx !== undefined){ products[idx] = c.server; touchedByConflict.push(products[idx]); }
      }
    });
    // touchedByConflict (jamais tout le catalogue) : seuls les produits où
    // le choix "remplacer par la version importée" a été fait ont
    // réellement changé — voir les autres correctifs de ce type dans ce
    // fichier (syncFromServer, pushToServer, compare-save-btn).
    save(true, touchedByConflict); render(); renderHome();
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
