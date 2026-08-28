// Badges compacts (Essentiel / 3DEXPERIENCE) pour les listes à vignette
// réduite (recherche du configurateur d'armoire, Suggestions, Pièces de
// rechange) — les badges pleine taille (.essential-badge/.three-d-overlay,
// voir plus bas) sont conçus pour les grandes photos de la grille catalogue
// et de la fiche produit, disproportionnés sur une vignette de 32-44px
// (retour utilisateur : les rendre visibles aussi dans ces listes plus
// compactes). Insérés en ligne à côté de la référence plutôt qu'en overlay
// sur la vignette. Global (pas d'IIFE dans ce fichier) : appelé aussi
// depuis js/armoireConfig.js.
function _productBadgesCompactHtml(p){
  var html = '';
  if(p.essential) html += '<i class="ti ti-star-filled" title="Produit essentiel" style="color:var(--copper);font-size:11px;margin-left:5px;vertical-align:middle;"></i>';
  if(p.available3DX) html += '<img src="assets/three-d-badge.png" alt="3DEX" title="Disponible dans la 3DEXPERIENCE" style="width:13px;height:13px;margin-left:4px;vertical-align:middle;">';
  return html;
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
  var _viewHistory = []; // pile pour retour suggestion → parent
  var _sugOpen     = false; // mémorise si le carrousel suggestions est ouvert
  var _viewHistory = []; // pile pour retour suggestion → parent

  // ── Copier la référence (délégué une seule fois, le contenu de vmMeta est régénéré à chaque ouverture) ──
  function copyToClipboard(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text);
    }
    // Repli pour contextes non sécurisés / anciens navigateurs
    return new Promise(function(resolve, reject){
      try{
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand a échoué'));
      }catch(e){ reject(e); }
    });
  }
  if(vmMeta){
    vmMeta.addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('.vm-copy-btn') : null;
      if(!btn) return;
      var ref = btn.getAttribute('data-copy') || '';
      copyToClipboard(ref).then(function(){
        showToast('Référence copiée ✓', 'ok', 1800);
        btn.classList.add('copied');
        setTimeout(function(){ btn.classList.remove('copied'); }, 1200);
      }).catch(function(){
        showToast('Impossible de copier la référence', 'err', 2500);
      });
    });
  }

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
    window._viewingId = id; // exposé pour requests.js
    vmInfoMenu.classList.remove('open');

    // Photo — badges Essentiel/3DEXPERIENCE (retour utilisateur : aussi
    // visibles sur la fiche produit, pas seulement sur la carte catalogue).
    // Construits à part et ajoutés APRÈS coup (pas dans le même innerHTML
    // que la photo lorsqu'elle réussit) : l'ancien onerror remplaçait tout
    // le innerHTML du conteneur en cas d'échec de chargement, ce qui aurait
    // aussi effacé les badges — onerror cible maintenant l'<img> lui-même
    // (outerHTML), pas son parent.
    var vmBadgesHtml = (p.available3DX ? '<div class="three-d-overlay" title="Disponible dans la 3DEXPERIENCE"><img src="assets/three-d-badge.png" alt="3DEX"></div>' : '')
      + (p.essential ? '<div class="essential-badge" title="Produit essentiel"><i class="ti ti-star-filled"></i> Standard</div>' : '');
    if(p.photo){
      vmPhoto.innerHTML = '<img src="'+escapeHtml(p.photo)+'" alt="'+escapeHtml(p.name||p.ref)+'" loading="lazy" style="width:100%;height:100%;object-fit:contain;transform:scale(1.12);display:block;" onerror="this.outerHTML=\'<span class=&quot;ph-placeholder&quot;>Image indisponible</span>\'">' + vmBadgesHtml;
    }else{
      vmPhoto.innerHTML = '<span class="ph-placeholder">Pas de photo</span>' + vmBadgesHtml;
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
    if(p.leadTime) metaItems.push(['Délai',p.leadTime]);
    if(p.available3DX) metaItems.push(['3DEXPERIENCE', '<span class="three-d-badge" title="Disponible dans la 3DEXPERIENCE"><img src="assets/three-d-badge.png" alt="3DEX" /></span>']);
    if(p.url)      metaItems.push(['URL',        p.url]);
    vmMeta.innerHTML = metaItems.map(function(m){
      var val;
      if(m[0] === 'URL'){
        val = (typeof window._isSafeHttpUrl === 'function' && !window._isSafeHttpUrl(m[1]))
          ? escapeHtml(m[1])
          : '<a href="'+escapeHtml(m[1])+'" target="_blank" rel="noopener noreferrer" style="color:var(--copper-deep)">Ouvrir la page</a>';
      } else if(m[0] === '3DEXPERIENCE'){
        var _link3dSafe = p.available3DXLink && (typeof window._isSafeHttpUrl !== 'function' || window._isSafeHttpUrl(p.available3DXLink));
        val = _link3dSafe
          ? '<a href="'+escapeHtml(p.available3DXLink)+'" target="_blank" rel="noopener noreferrer" class="three-d-badge" title="Disponible dans la 3DEXPERIENCE">'+m[1]+'</a>'
          : m[1];
      } else if(m[0] === 'Référence'){
        val = '<span class="vm-ref-copy">'
          + '<span>'+escapeHtml(m[1])+'</span>'
          + '<button type="button" class="vm-copy-btn" data-copy="'+escapeHtml(m[1])+'" title="Copier la référence" aria-label="Copier la référence"><i class="ti ti-copy" aria-hidden="true"></i><i class="ti ti-check" aria-hidden="true"></i></button>'
          + '</span>';
      } else {
        val = '<span>'+escapeHtml(m[1])+'</span>';
      }
      return '<div class="vm-meta-item"><label>'+escapeHtml(m[0])+'</label>'+val+'</div>';
    }).join('');
    vmMeta.style.display = metaItems.length ? '' : 'none';

    // Description avec troncature + "Voir plus" / "Voir moins" (mobile et desktop)
    // Tags HTML retirés comme sur la carte catalogue (renderCard) — sans ça,
    // une description contenant du HTML collé par erreur affichait les
    // balises en clair ici alors que la carte les nettoyait déjà (retour
    // utilisateur : incohérence entre les deux vues).
    var fullDesc = (p.desc || '').replace(/<[^>]*>/g, '').trim();
    var isMobile = window.innerWidth <= 640;
    var CHAR_LIMIT = isMobile ? 160 : 300;
    vmDesc.style.display = fullDesc ? '' : 'none';

    if(fullDesc.length > CHAR_LIMIT){
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
      ? ' <span class="price-jump-badge price-jump-badge-lg"><i class="ti ti-alert-triangle"></i> +'+jumpPct.toFixed(0)+'%</span>' : '';
    var orig = getOriginalPrice(p);
    var discPct = getDiscountPct(p);
    var discBadgeVm = discPct !== null && discPct < 0
      ? ' <span class="discount-badge discount-badge-lg">-'+Math.abs(discPct).toFixed(0)+' %</span>'
      : '';
    vmPrice.innerHTML = (orig ? '<span class="vm-price-original" title="Prix catalogue fabricant">'+escapeHtml(_displayPrice(orig))+'</span>' : '')+
                        escapeHtml(_displayPrice(p.price)||'—')+discBadgeVm+badge;
    // Ligne explicite catalogue vs votre prix
    var vmPriceLabelEl = document.getElementById('vmPriceLabel');
    if(vmPriceLabelEl) vmPriceLabelEl.innerHTML = '';

    vmPriceHistory.innerHTML = buildPriceHistoryReadonly(p);

    // ── Bouton Document (visible pour tous) ────────────────────────
    var vmDocBtn     = document.getElementById('vmDocBtn');
    var vmDocBtnWrap = document.getElementById('vmDocBtnWrap');
    var sUrlDoc      = localStorage.getItem('cat_server_url');
    if(vmDocBtnWrap) vmDocBtnWrap.style.display = (p.hasDoc && sUrlDoc) ? '' : 'none';
    if(vmDocBtn) vmDocBtn.onclick = function(){ window._openDocModal(p, sUrlDoc); };
    // ── Fin bouton Document ─────────────────────────────────────────

    // Appliquer permissions sur les boutons de la fiche
    // Par défaut : interdit si non connecté ou permissions non chargées
    var _perms   = window._userPerms || {};
    var _canEdit   = !!_perms.canEdit;
    var _canDelete = !!_perms.canDelete;
    var _vmEdit = document.getElementById('vmEditBtn');
    var _vmDel  = document.getElementById('vmDeleteBtn');
    if(_vmEdit)   _vmEdit.style.display   = _canEdit   ? '' : 'none';
    if(_vmDel)    _vmDel.style.display    = _canDelete ? '' : 'none';

    if(typeof authApplyOnProductModal === 'function') authApplyOnProductModal();

    // ── Section Suggestions (ouvre une modale, comme le bouton Documents) ──
    var sugSection = document.getElementById('vmSuggestionsSection');
    var sugToggle  = document.getElementById('vmSuggestionsToggle');
    var sugLabel   = document.getElementById('vmSuggestionsToggleLabel');
    var sugOverlay = document.getElementById('sugOverlay');
    var sugList    = document.getElementById('sugList');
    // Filtrer les refs vides, masquées SUR CETTE FICHE (p.suggestionsHidden —
    // voir la case à cocher par puce dans le formulaire, js/modal.js) ET
    // vérifier que les produits existent réellement
    var _allProds = window.products || [];
    var _hiddenSugs = Array.isArray(p.suggestionsHidden) ? p.suggestionsHidden : [];
    var sugRefs = Array.isArray(p.suggestions)
      ? p.suggestions.filter(function(r){
          return r && r.trim() && _hiddenSugs.indexOf(r) === -1 && _allProds.some(function(x){ return x.ref === r; });
        })
      : [];

    if(sugSection){
      if(sugRefs.length){
        sugSection.style.display = '';
        if(sugLabel) sugLabel.textContent = 'Afficher les suggestions (' + sugRefs.length + ')';

        if(sugToggle) sugToggle.onclick = function(){
          var sugModalTitle = document.getElementById('sugModalTitle');
          if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-bulb"></i> Produits suggérés';
          if(sugList){
            // Liste compacte (comme la modale Documents) plutôt qu'une grille
            // de grandes vignettes : miniature fixe + texte sur une ligne.
            var prods = window.products || [];
            sugList.innerHTML = sugRefs.map(function(ref){
              var sp = prods.find(function(x){ return x.ref === ref; });
              if(!sp) return ''; // produit supprimé
              var photoHtml = sp.photo
                ? '<img src="'+escapeHtml(sp.photo)+'" alt="'+escapeHtml(sp.name||sp.ref)+'" loading="lazy" onerror="this.parentElement.innerHTML=\'<i class=&quot;ti ti-photo-off&quot;></i>\'">'
                : '<i class="ti ti-photo-off"></i>';
              return '<div class="sug-list-item" data-id="'+escapeHtml(sp.id)+'">'+
                '<div class="sug-list-photo">'+photoHtml+'</div>'+
                '<div class="sug-list-body">'+
                  '<div class="sug-list-ref">'+escapeHtml(sp.ref||'')+_productBadgesCompactHtml(sp)+'</div>'+
                  '<div class="sug-list-name">'+escapeHtml((sp.name||'').substring(0,60))+'</div>'+
                '</div>'+
                '<i class="ti ti-chevron-right sug-list-chevron"></i>'+
              '</div>';
            }).join('');

            // Clic sur une suggestion → empile la fiche courante, ferme la
            // modale et ouvre la suggestion
            sugList.querySelectorAll('.sug-list-item[data-id]').forEach(function(row){
              row.addEventListener('click', function(){
                var pid = row.getAttribute('data-id');
                if(pid){
                  _viewHistory.push(id);
                  if(sugOverlay) sugOverlay.style.display = 'none';
                  openView(pid);
                }
              });
            });
          }
          if(sugOverlay){
            sugOverlay.style.display = 'flex';
            document.body.classList.add('modal-open');
          }
        };
      } else {
        sugSection.style.display = 'none';
      }
    }
    var sugCloseBtn = document.getElementById('sugCloseBtn');
    if(sugCloseBtn) sugCloseBtn.onclick = function(){
      document.body.classList.remove('modal-open');
      if(sugOverlay){
        if(typeof window._closeOverlayAnimated === 'function'){
          window._closeOverlayAnimated(sugOverlay, function(){ sugOverlay.style.display = 'none'; });
        } else {
          sugOverlay.style.display = 'none';
        }
      }
    };

    // ── Section Pièces de rechange — même mécanique que Suggestions
    // ci-dessus, réutilise la même modale (sugOverlay/sugList), juste avec
    // un titre et une source de données différents (retour utilisateur :
    // "une rubrique pièces de rechange comme pour les suggestions"). ──
    var sparePartsSection = document.getElementById('vmSparePartsSection');
    var sparePartsToggle  = document.getElementById('vmSparePartsToggle');
    var sparePartsLabel   = document.getElementById('vmSparePartsToggleLabel');
    var _hiddenSpareParts = Array.isArray(p.sparePartsHidden) ? p.sparePartsHidden : [];
    var sparePartsRefs = Array.isArray(p.spareParts)
      ? p.spareParts.filter(function(r){
          return r && r.trim() && _hiddenSpareParts.indexOf(r) === -1 && _allProds.some(function(x){ return x.ref === r; });
        })
      : [];

    if(sparePartsSection){
      if(sparePartsRefs.length){
        sparePartsSection.style.display = '';
        if(sparePartsLabel) sparePartsLabel.textContent = 'Voir les pièces de rechange (' + sparePartsRefs.length + ')';

        if(sparePartsToggle) sparePartsToggle.onclick = function(){
          var sugModalTitle = document.getElementById('sugModalTitle');
          if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-tool"></i> Pièces de rechange';
          if(sugList){
            var prods = window.products || [];
            sugList.innerHTML = sparePartsRefs.map(function(ref){
              var sp = prods.find(function(x){ return x.ref === ref; });
              if(!sp) return ''; // produit supprimé
              var photoHtml = sp.photo
                ? '<img src="'+escapeHtml(sp.photo)+'" alt="'+escapeHtml(sp.name||sp.ref)+'" loading="lazy" onerror="this.parentElement.innerHTML=\'<i class=&quot;ti ti-photo-off&quot;></i>\'">'
                : '<i class="ti ti-photo-off"></i>';
              return '<div class="sug-list-item" data-id="'+escapeHtml(sp.id)+'">'+
                '<div class="sug-list-photo">'+photoHtml+'</div>'+
                '<div class="sug-list-body">'+
                  '<div class="sug-list-ref">'+escapeHtml(sp.ref||'')+_productBadgesCompactHtml(sp)+'</div>'+
                  '<div class="sug-list-name">'+escapeHtml((sp.name||'').substring(0,60))+'</div>'+
                '</div>'+
                '<i class="ti ti-chevron-right sug-list-chevron"></i>'+
              '</div>';
            }).join('');

            sugList.querySelectorAll('.sug-list-item[data-id]').forEach(function(row){
              row.addEventListener('click', function(){
                var pid = row.getAttribute('data-id');
                if(pid){
                  _viewHistory.push(id);
                  if(sugOverlay) sugOverlay.style.display = 'none';
                  openView(pid);
                }
              });
            });
          }
          if(sugOverlay){
            sugOverlay.style.display = 'flex';
            document.body.classList.add('modal-open');
          }
        };
      } else {
        sparePartsSection.style.display = 'none';
      }
    }

    // ── Section Caractéristiques (réutilise le même overlay/liste que Suggestions) ──
    var specsSection = document.getElementById('vmSpecsSection');
    var specsToggle  = document.getElementById('vmSpecsToggle');
    var specsToggleLabel = document.getElementById('vmSpecsToggleLabel');
    var specEntries = (p.specs && typeof p.specs === 'object')
      ? Object.keys(p.specs).filter(function(k){ return p.specs[k]; }).map(function(k){ return [k, p.specs[k]]; })
      : [];

    if(specsSection){
      if(specEntries.length){
        specsSection.style.display = '';
        if(specsToggleLabel) specsToggleLabel.textContent = 'Voir les caractéristiques (' + specEntries.length + ')';

        if(specsToggle) specsToggle.onclick = function(){
          var sugModalTitle = document.getElementById('sugModalTitle');
          if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-tool"></i> Caractéristiques techniques';
          if(sugList){
            // Classe dédiée (pas .vm-meta-item directement, réutilisée ailleurs
            // dans une grille 2 colonnes différente) : séparateur entre chaque
            // ligne + white-space:pre-wrap pour respecter les retours à la
            // ligne saisis dans la valeur (voir textarea .spec-value dans
            // js/modal.js) — avant, une caractéristique regroupant plusieurs
            // sous-valeurs (ex. puissance par tension) formait un seul long
            // paragraphe illisible, sans distinction visuelle claire entre
            // chaque ligne (retour utilisateur, capture à l'appui).
            sugList.innerHTML = specEntries.map(function(entry){
              return '<div class="spec-list-item"><label>'+escapeHtml(entry[0])+'</label><span>'+escapeHtml(entry[1])+'</span></div>';
            }).join('');
          }
          if(sugOverlay){
            sugOverlay.style.display = 'flex';
            document.body.classList.add('modal-open');
          }
        };
      } else {
        specsSection.style.display = 'none';
      }
    }


    viewOverlay.classList.add('open');
    document.body.classList.add('modal-open');
  }

  // ── Modale Documents ────────────────────────────────────────────
  // Charge JSZip si besoin
  function _loadJSZip(cb){
    if(window.JSZip){ cb(); return; }
    var s = document.createElement('script');
    // Auto-hébergé (js/jszip.min.js) plutôt que depuis cdnjs.cloudflare.com.
    s.src = 'js/jszip.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  // Fetch un fichier PDF par ref, extrait du ZIP si nécessaire par nom de fichier
  // Détecte si un ArrayBuffer est un ZIP via magic bytes (PK = 0x50 0x4B)
  function _isZipBuffer(ab){
    var view = new Uint8Array(ab, 0, 4);
    return view[0] === 0x50 && view[1] === 0x4B;
  }

  // Cache des buffers PDF déjà téléchargés (clé = ref + filename)
  var _pdfBufferCache = {};

  function _fetchPdfByName(sUrl, ref, filename, h, cb){
    var cacheKey = ref + '::' + filename;
    if(_pdfBufferCache[cacheKey]){
      cb(null, _pdfBufferCache[cacheKey], filename);
      return;
    }
    var url = sUrl + '/pullDocs?ref=' + encodeURIComponent(ref);
    fetch(url, { headers: h })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
      .then(function(ab){
        // Plafond généreux (100 Mo) pour ne bloquer aucun cas d'usage réel.
        var PDF_MAX_BYTES = 100 * 1024 * 1024;
        if(ab.byteLength > PDF_MAX_BYTES){
          cb(new Error('Document trop volumineux (' + Math.round(ab.byteLength/1024/1024) + ' Mo)'));
          return;
        }
        if(_isZipBuffer(ab)){
          _loadJSZip(function(){
            JSZip.loadAsync(ab).then(function(zip){
              var target = null;
              zip.forEach(function(path, f){
                if(path === filename || path.split('/').pop() === filename) target = f;
              });
              if(!target) zip.forEach(function(path, f){ if(!target) target = f; });
              if(target){
                target.async('arraybuffer').then(function(buf){
                  _pdfBufferCache[cacheKey] = buf;
                  cb(null, buf, filename);
                });
              } else cb(new Error('Fichier non trouvé dans le ZIP'));
            }).catch(function(e){ cb(e); });
          });
        } else {
          _pdfBufferCache[cacheKey] = ab;
          cb(null, ab, filename);
        }
      })
      .catch(function(e){ cb(e); });
  }

  // Types image acceptés à l'upload (voir accept="image/*" sur #modalPdfInput,
  // js/modal.js) — même liste que _isImg là-bas, pour rester cohérent entre
  // la modale d'édition et la visionneuse.
  var IMG_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

  function _docRenderItem(docList, file, sUrl){
    var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
    delete h['Content-Type'];
    var docName = file.filename || 'Document.pdf';
    var isImg = IMG_EXT_RE.test(docName);

    var item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;';
    item.innerHTML = '<div style="width:40px;height:40px;background:'+(isImg?'#FFF7ED':'#FEF2F2')+';border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + (isImg
        ? '<i class="ti ti-photo" style="font-size:22px;color:var(--copper);"></i>'
        : '<i class="ti ti-file-type-pdf" style="font-size:22px;color:#E53E3E;"></i>')
      + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(docName)+'</div>'
      + '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">'+(isImg?'Image':'PDF')+'</div>'
      + '</div>';

    var btnVoir = document.createElement('button');
    btnVoir.style.cssText = 'padding:7px 14px;border-radius:8px;border:1px solid var(--line);background:var(--paper-card);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;flex-shrink:0;font-family:inherit;';
    btnVoir.innerHTML = '<i class="ti ti-eye" style="font-size:14px;"></i> Voir';
    // Précharger le buffer au survol (avant le clic)
    btnVoir.addEventListener('mouseenter', function(){
      _fetchPdfByName(sUrl, file.ref, docName, h, function(){}); // warm cache
    }, { once: true });
    btnVoir.onclick = function(){
      window._openPdfViewerWithBuffer(docName, function(onBuffer, onError){
        _fetchPdfByName(sUrl, file.ref, docName, h, function(err, ab){
          if(err) onError(err); else onBuffer(ab);
        });
      });
    };

    item.appendChild(btnVoir);
    docList.appendChild(item);
  }

  window._openDocModal = function openDocModal(p, sUrl){
    var overlay = document.getElementById('docOverlay');
    var docList = document.getElementById('docList');
    if(!overlay || !docList) return;

    // Loader immédiat
    docList.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:32px;font-size:13px;">'
      + '<i class="ti ti-loader-2" style="font-size:24px;display:block;margin:0 auto 10px;animation:spin 1s linear infinite;"></i>'
      + 'Chargement…</div>';
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');

    if(p.ref && sUrl){
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      fetch(sUrl + '/pullDocs?nofile=true&ref=' + encodeURIComponent(p.ref), { headers: h })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){
          var files = d && d.items ? d.items : [];
          docList.innerHTML = '';
          if(files.length === 0){
            docList.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:40px;font-size:14px;">Aucun document disponible</div>';
          } else {
            files.forEach(function(f){ _docRenderItem(docList, f, sUrl); });
          }
        })
        .catch(function(){
          docList.innerHTML = '';
          if(p.hasDoc){
            _docRenderItem(docList, { filename: p.docFilename || 'Document.pdf', ref: p.ref }, sUrl);
          } else {
            docList.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:40px;font-size:14px;">Aucun document disponible</div>';
          }
        });
    } else {
      docList.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:40px;font-size:14px;">Aucun document disponible</div>';
    }

    document.getElementById('docCloseBtn').onclick = function(){
      document.body.classList.remove('modal-open');
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(overlay, function(){ overlay.style.display = 'none'; });
      } else {
        overlay.style.display = 'none';
      }
    };
    // clic extérieur bloqué — géré par _initModalEscape()
  }
  // ── Fin modale Documents ─────────────────────────────────────────

  // ── Viewer PDF rendu sur canvas via PDF.js — permet le pincement pour
  // zoomer sur mobile (impossible à intercepter avec l'ancien lecteur natif
  // en iframe : les gestes tactiles sur une iframe restent dans son propre
  // contexte et ne remontent jamais à la page parente). ──────────────────
  var _pdfjsLoadPromise = null;
  function ensurePdfJs(){
    if(window.pdfjsLib) return Promise.resolve();
    if(_pdfjsLoadPromise) return _pdfjsLoadPromise;
    _pdfjsLoadPromise = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = 'js/pdf.min.js';
      s.onload = function(){
        try{
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';
          resolve();
        }catch(e){ reject(e); }
      };
      s.onerror = function(){ _pdfjsLoadPromise = null; reject(new Error('Échec du chargement du lecteur PDF')); };
      document.head.appendChild(s);
    });
    return _pdfjsLoadPromise;
  }

  var _pdfCurrentDoc = null;
  var _pdfPageInfos = []; // { page, canvas, cssWidth0, cssHeight0, baseScale, renderTask, isImage }
  var _pdfImageObjectUrl = null; // à révoquer à la fermeture (voir _pdfClose)
  var _pdfZoom = 1;
  var MIN_PDF_ZOOM = 1, MAX_PDF_ZOOM = 4;
  var MAX_PDF_CANVAS_DIM = 4096; // limite raisonnable de résolution (mémoire/support navigateur)
  var _pdfSharpenTimer = null;

  // Le zoom redimensionne réellement les canvas (et non un transform CSS) :
  // sur iOS Safari, un transform:scale() sur un enfant n'agrandit pas de façon
  // fiable la zone de défilement d'un ancêtre overflow:auto, ce qui empêchait
  // tout déplacement une fois zoomé. Un vrai redimensionnement de boîte fait
  // grandir naturellement le scrollWidth/scrollHeight du conteneur.
  function _pdfApplyZoomSize(){
    _pdfPageInfos.forEach(function(info){
      info.canvas.style.width  = (info.cssWidth0 * _pdfZoom) + 'px';
      info.canvas.style.height = (info.cssHeight0 * _pdfZoom) + 'px';
    });
  }

  function _pdfSetZoom(z){
    _pdfZoom = Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, z));
    _pdfApplyZoomSize();
  }

  // Après le pincement, on re-rend chaque page à la résolution correspondant
  // au zoom final pour rester net (le redimensionnement CSS pendant le geste
  // ne fait qu'étirer le bitmap existant, ce qui devient flou en zoomant fort).
  function _pdfSharpenPages(){
    _pdfPageInfos.forEach(function(info){
      // Une image bitmap n'a pas de "re-rendu" PDF.js à refaire à plus haute
      // résolution : le navigateur redimensionne déjà le bitmap existant
      // correctement (contrairement au canvas PDF, dont le rendu initial est
      // volontairement basse résolution pour rester rapide à l'ouverture).
      if(info.isImage) return;
      var targetScale = info.baseScale * _pdfZoom * Math.min(window.devicePixelRatio || 1, 2);
      var viewport = info.page.getViewport({ scale: targetScale });
      if(Math.max(viewport.width, viewport.height) > MAX_PDF_CANVAS_DIM){
        var capFactor = MAX_PDF_CANVAS_DIM / Math.max(viewport.width, viewport.height);
        viewport = info.page.getViewport({ scale: targetScale * capFactor });
      }
      if(info.renderTask) info.renderTask.cancel();
      info.canvas.width  = viewport.width;
      info.canvas.height = viewport.height;
      var task = info.page.render({ canvasContext: info.canvas.getContext('2d'), viewport: viewport });
      info.renderTask = task;
      task.promise.catch(function(e){ if(e && e.name !== 'RenderingCancelledException') console.warn('[PDF] re-rendu échoué:', e); });
    });
  }

  // Pincement à deux doigts : capté sur le conteneur qui défile, sans
  // bloquer le défilement/le geste à un doigt (uniquement en pincement actif).
  (function _initPdfPinchZoom(){
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(!scrollEl) return;
    var startDist = 0, startZoom = 1;
    function dist(touches){
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx*dx + dy*dy);
    }
    scrollEl.addEventListener('touchstart', function(e){
      if(e.touches.length === 2){
        startDist = dist(e.touches);
        startZoom = _pdfZoom;
      }
    }, {passive:true});
    scrollEl.addEventListener('touchmove', function(e){
      if(e.touches.length === 2 && startDist > 0){
        e.preventDefault();
        var scale = dist(e.touches) / startDist;
        // Ancre le zoom sur le point du pincement : on retrouve le point du
        // contenu situé sous le milieu des deux doigts avant le changement de
        // zoom, puis on ajuste le défilement pour qu'il reste sous les doigts
        // après redimensionnement (sinon le zoom part toujours du coin
        // haut-gauche du canvas, indépendamment de l'endroit pincé).
        var rect = scrollEl.getBoundingClientRect();
        var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        var oldZoom = _pdfZoom;
        var contentX = (scrollEl.scrollLeft + midX) / oldZoom;
        var contentY = (scrollEl.scrollTop + midY) / oldZoom;
        _pdfSetZoom(startZoom * scale);
        scrollEl.scrollLeft = contentX * _pdfZoom - midX;
        scrollEl.scrollTop  = contentY * _pdfZoom - midY;
      }
    }, {passive:false});
    scrollEl.addEventListener('touchend', function(e){
      if(e.touches.length < 2 && startDist > 0){
        startDist = 0;
        clearTimeout(_pdfSharpenTimer);
        _pdfSharpenTimer = setTimeout(_pdfSharpenPages, 120);
      }
    }, {passive:true});
  })();

  // Affiche une image (jpg/png/gif/webp/heic/bmp) dans la même boîte que le
  // lecteur PDF, sans passer par PDF.js : une seule "page" (l'<img> elle-même)
  // ajoutée à _pdfPageInfos, ce qui lui fait profiter gratuitement du même
  // pincement de zoom que les pages PDF (_pdfApplyZoomSize ne fait que poser
  // style.width/height, valable aussi bien sur un <img> que sur un <canvas>).
  function _openImageViewer(ab, docName){
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    var pagesEl  = document.getElementById('pdfViewerPages');
    if(pagesEl) pagesEl.innerHTML = '';
    _pdfPageInfos = [];
    _pdfZoom = 1;
    if(_pdfImageObjectUrl){ URL.revokeObjectURL(_pdfImageObjectUrl); _pdfImageObjectUrl = null; }

    var url = URL.createObjectURL(new Blob([ab]));
    _pdfImageObjectUrl = url;
    var img = document.createElement('img');
    img.style.display = 'block';
    img.style.margin  = '0 auto 8px';
    img.style.background = '#fff';
    img.onload = function(){
      var containerWidth = ((scrollEl && scrollEl.parentElement) ? scrollEl.parentElement.clientWidth : 800) - 24;
      var cssWidth0  = Math.min(containerWidth, img.naturalWidth || containerWidth);
      var ratio = img.naturalWidth ? (cssWidth0 / img.naturalWidth) : 1;
      var cssHeight0 = (img.naturalHeight || 0) * ratio;
      img.style.width  = cssWidth0 + 'px';
      img.style.height = cssHeight0 ? (cssHeight0 + 'px') : 'auto';
      _pdfPageInfos = [{ canvas: img, cssWidth0: cssWidth0, cssHeight0: cssHeight0, isImage: true }];
      if(loader) loader.style.display = 'none';
      if(scrollEl) scrollEl.style.display = 'block';
    };
    img.onerror = function(){
      _pdfClose();
      showToast('Erreur d\'affichage de l\'image', 'err', 4000);
    };
    img.src = url;
    if(pagesEl) pagesEl.appendChild(img);
  }

  async function _openPdfCanvas(ab, docName){
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    var pagesEl  = document.getElementById('pdfViewerPages');
    if(pagesEl) pagesEl.innerHTML = '';
    _pdfPageInfos = [];
    _pdfZoom = 1;
    try{
      await ensurePdfJs();
      // PDF.js transfère (détache) l'ArrayBuffer passé à getDocument — on lui
      // donne une copie pour que le buffer mis en cache (préchargement au
      // survol du bouton "Voir") reste réutilisable aux ouvertures suivantes.
      var pdf = await window.pdfjsLib.getDocument({ data: ab.slice(0) }).promise;
      _pdfCurrentDoc = pdf;
      var containerWidth = ((scrollEl && scrollEl.parentElement) ? scrollEl.parentElement.clientWidth : 800) - 24;
      var dpr = window.devicePixelRatio || 1;
      for(var pageNum = 1; pageNum <= pdf.numPages; pageNum++){
        var page = await pdf.getPage(pageNum);
        var baseViewport = page.getViewport({ scale: 1 });
        var scale = containerWidth / baseViewport.width;
        var viewport = page.getViewport({ scale: scale * dpr });
        var canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width  = (viewport.width / dpr) + 'px';
        canvas.style.height = (viewport.height / dpr) + 'px';
        canvas.style.display = 'block';
        canvas.style.margin  = '0 auto 8px';
        canvas.style.background = '#fff';
        if(pagesEl) pagesEl.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        _pdfPageInfos.push({
          page: page,
          canvas: canvas,
          cssWidth0: viewport.width / dpr,
          cssHeight0: viewport.height / dpr,
          baseScale: scale,
          renderTask: null
        });
      }
      if(loader) loader.style.display = 'none';
      if(scrollEl) scrollEl.style.display = 'block';
    }catch(e){
      console.warn('[PDF] rendu échoué:', e);
      _pdfClose();
      showToast('Erreur d\'affichage du PDF : '+(e && e.message || e), 'err', 4000);
    }
  }

  function _pdfClose(){
    var overlay  = document.getElementById('pdfViewerOverlay');
    document.body.classList.remove('modal-open');
    // Le contenu (pages rendues, document PDF.js) n'est détruit qu'APRÈS
    // l'animation de fermeture — sinon la page se vide d'un coup pendant
    // que la fenêtre est encore visible en train de s'estomper.
    function teardown(){
      var scrollEl = document.getElementById('pdfViewerScroll');
      var pagesEl  = document.getElementById('pdfViewerPages');
      var loader   = document.getElementById('pdfViewerLoader');
      clearTimeout(_pdfSharpenTimer);
      _pdfPageInfos.forEach(function(info){ if(info.renderTask) info.renderTask.cancel(); });
      _pdfPageInfos = [];
      if(scrollEl) scrollEl.style.display = 'none';
      if(pagesEl) pagesEl.innerHTML = '';
      if(loader) loader.style.display = 'flex';
      if(overlay) overlay.style.display = 'none';
      _pdfZoom = 1;
      if(_pdfCurrentDoc){ _pdfCurrentDoc.destroy(); _pdfCurrentDoc = null; }
      if(_pdfImageObjectUrl){ URL.revokeObjectURL(_pdfImageObjectUrl); _pdfImageObjectUrl = null; }
    }
    if(overlay && typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(overlay, teardown);
    } else {
      teardown();
    }
  }

  // Initialiser les listeners fermeture une seule fois
  (function(){
    var btnCl = document.getElementById('pdfViewerClose');
    if(btnCl) btnCl.addEventListener('click', _pdfClose);
  })();

  window._openPdfViewerWithBuffer = function(docName, fetchFn){
    var overlay  = document.getElementById('pdfViewerOverlay');
    var title    = document.getElementById('pdfViewerTitle');
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(title) title.textContent = docName || 'Document PDF';
    if(scrollEl) scrollEl.style.display = 'none';
    if(loader) loader.style.display = 'flex';
    if(overlay) overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    fetchFn(
      function onBuffer(ab){
        if(IMG_EXT_RE.test(docName||'')) _openImageViewer(ab, docName);
        else _openPdfCanvas(ab, docName);
      },
      function onError(e){ _pdfClose(); showToast('Erreur PDF : '+(e&&e.message||e), 'err', 4000); }
    );
  };

  window._openPdfViewer = function(pdfUrl, docName){
    var overlay  = document.getElementById('pdfViewerOverlay');
    var title    = document.getElementById('pdfViewerTitle');
    var loader   = document.getElementById('pdfViewerLoader');
    var scrollEl = document.getElementById('pdfViewerScroll');
    if(title) title.textContent = docName || 'Document PDF';
    if(scrollEl) scrollEl.style.display = 'none';
    if(loader) loader.style.display = 'flex';
    if(overlay) overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    var h = typeof window.authHeaders === 'function' ? window.authHeaders() : {};
    delete h['Content-Type'];
    fetch(pdfUrl, { headers: h })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
      .then(function(ab){
        if(IMG_EXT_RE.test(docName||'')) _openImageViewer(ab, docName);
        else _openPdfCanvas(ab, docName);
      })
      .catch(function(e){ _pdfClose(); showToast('Erreur PDF : '+e.message, 'err', 4000); });
  };
  // ── Fin PDF Viewer ───────────────────────────────────────────────



  function closeView(){
    // Si on vient d'une suggestion, retourner sur la fiche parente
    if(_viewHistory.length > 0){
      var parentId = _viewHistory.pop();
      openView(parentId);
      return;
    }
    vmInfoMenu.classList.remove('open');
    document.body.classList.remove('modal-open');
    viewingId = null;
    window._viewingId = null;
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(viewOverlay, function(){ viewOverlay.classList.remove('open'); });
    } else {
      viewOverlay.classList.remove('open');
    }
  }

  // Clic extérieur : fermer uniquement sur desktop (pas mobile/tablette)
  viewOverlay.addEventListener('click', function(e){
    if(e.target === viewOverlay && window.innerWidth > 1024) closeView();
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
  // Sur viewOverlay (pas document) : viewOverlay a son propre clic qui
  // appelle stopPropagation() sur TOUT clic (voir _initModalEscape dans
  // js/init.js, pour qu'un clic dans le vide ne ferme jamais la fiche par
  // erreur) — un listener sur document ne recevait donc JAMAIS aucun clic
  // tant que la fiche produit était ouverte, et le menu du ⓘ ne se
  // fermait jamais en cliquant ailleurs sur la fiche (retour utilisateur).
  // Un 2e listener sur le même élément (viewOverlay) continue de
  // s'exécuter normalement, stopPropagation() ne bloquant que la
  // remontée vers les ANCÊTRES, pas les autres écouteurs du même élément.
  viewOverlay.addEventListener('click', function(e){
    if(!vmInfoMenu.contains(e.target) && e.target!==vmInfoBtn){
      vmInfoMenu.classList.remove('open');
    }
  });

  document.getElementById('vmEditBtn').addEventListener('click', async function(){
    var id = viewingId;
    var p = products.find(function(x){ return x.id === id; });
    // Empêche deux utilisateurs de modifier le même produit en même temps
    // (retour utilisateur) — voir _tryLockProductForEdit dans js/actions.js.
    if(p && typeof window._tryLockProductForEdit === 'function'){
      var vmEditBtnEl = document.getElementById('vmEditBtn');
      if(vmEditBtnEl) vmEditBtnEl.disabled = true;
      var lock = await window._tryLockProductForEdit(p);
      if(vmEditBtnEl) vmEditBtnEl.disabled = false;
      if(!lock.ok){
        // Popup bloquante (pas un simple toast) : un blocage d'édition doit
        // être vu, pas juste apparaître 4s en bas de l'écran (retour
        // utilisateur). lock.message reste utilisable tel quel (texte
        // brut, déjà composé) ; lock.lockedBy est le nom d'utilisateur brut
        // — toujours échappé avant insertion HTML ici.
        var popupMsg = lock.lockedBy
          ? '<strong>' + escapeHtml(lock.lockedBy) + '</strong> est en cours de modification de ce produit — réessayez dans quelques instants.'
          : escapeHtml(lock.message);
        customAlert('Produit en cours de modification', popupMsg);
        return; // ne ferme pas la vue, n'ouvre pas le formulaire
      }
    }
    closeView();
    openModal(id);
    // Démarre le heartbeat du verrou (voir js/modal.js) — seulement ici,
    // juste après un verrou effectivement posé par _tryLockProductForEdit
    // ci-dessus, pas dans openModal() lui-même (aussi utilisé pour "Ajouter
    // un produit" et "Proposer une modification", qui ne posent jamais ce
    // verrou).
    if(typeof window._startEditLockHeartbeat === 'function') window._startEditLockHeartbeat(id);
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

  // Reformate un prix en français à l'AFFICHAGE, quelle que soit la façon
  // dont il est stocké : toujours 2 décimales + séparateur de milliers
  // (ex. "2€" -> "2,00 €", "1000" -> "1 000,00 €", peu importe si la source
  // était en point, sans décimales, ou déjà groupée). Un prix arrivé hors du
  // formulaire (import Excel, historique, synchro serveur...) n'est pas
  // garanti d'avoir ce format au départ (retour utilisateur, capture à
  // l'appui) — reformater à l'affichage règle ça pour toutes les sources
  // d'un coup, sans avoir à corriger chaque chemin d'écriture séparément.
  // Devises non-EUR laissées telles quelles (convention différente).
  function _parsePriceNum(str){
    var cleaned = String(str).replace(/[^\d.,]/g, '').trim();
    if(!cleaned) return null;
    // Gère "1234.56", "1234,56" et "1.234,56"
    if(cleaned.indexOf(',') !== -1 && cleaned.indexOf('.') !== -1){
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if(cleaned.indexOf(',') !== -1){
      cleaned = cleaned.replace(',', '.');
    }
    var n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  function _displayPrice(v){
    if(!v) return v;
    if(/[$£¥]|USD|GBP|CHF|CAD/i.test(v)) return v;
    var n = _parsePriceNum(v);
    if(n === null) return v; // valeur non reconnue comme un nombre : laissée telle quelle
    return n.toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
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
    // La bulle de hausse reste avec le reste des infos prix (retour
    // utilisateur : ne pas l'isoler sur la photo). Pour garder l'alignement
    // entre cartes même quand elle retombe sur une 2e ligne (prix + remise +
    // hausse ne tiennent pas toujours sur une seule ligne selon la longueur
    // des nombres) — plutôt que d'espérer que tout tienne sur une ligne et
    // gérer le débordement en secours (ancien comportement : le prix barré,
    // le prix et les badges se disputaient la même ligne et cassaient au
    // milieu d'un nombre selon la largeur dispo, retour utilisateur), la
    // structure est maintenant TOUJOURS empilée : prix catalogue barré, puis
    // prix remisé juste en dessous, puis les badges (remise/hausse) côte à
    // côte sur leur propre ligne. Prévisible dans tous les cas plutôt que
    // dépendant de la largeur de carte et du nombre de chiffres.
    var jumpPct = getLastPriceJumpPct(p);
    var priceJumpBadge = jumpPct !== null && jumpPct >= PRICE_ALERT_THRESHOLD
      ? '<span class="price-jump-badge" title="Hausse de '+jumpPct.toFixed(1)+' % depuis le dernier prix"><i class="ti ti-alert-triangle" aria-hidden="true"></i> +'+jumpPct.toFixed(0)+'%</span>'
      : '';
    var origPrice = getOriginalPrice(p);
    var discPct = getDiscountPct(p);
    var discBadge = discPct !== null && discPct < 0
      ? '<span class="discount-badge badge-anim">-'+Math.abs(discPct).toFixed(0)+' %</span>'
      : '';
    var priceHtml = (origPrice ? '<span class="price-original" title="Prix catalogue fabricant">'+escapeHtml(_displayPrice(origPrice))+'</span>' : '')+
                    '<span class="price-main">'+escapeHtml(_displayPrice(p.price)||'—')+'</span>'+
                    ((discBadge || priceJumpBadge) ? '<span class="price-badges">'+discBadge+priceJumpBadge+'</span>' : '');
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
        (p.available3DX ? '<div class="three-d-overlay" title="Disponible dans la 3DEXPERIENCE"><img src="assets/three-d-badge.png" alt="3DEX"></div>' : '')+
        (p.essential ? '<div class="essential-badge" title="Produit essentiel"><i class="ti ti-star-filled"></i> Standard</div>' : '')+
      '</div>'+
      '<div class="body">'+
        '<div class="body-top">'+
          '<div class="ref">'+escapeHtml(p.ref||'—')+'</div>'+
          // title="" : nom tronqué visuellement à 2 lignes (-webkit-line-clamp,
          // voir css/styles.css) — le survol affiche le nom complet via
          // l'infobulle native du navigateur plutôt que de devoir ouvrir la
          // fiche pour le lire en entier (retour utilisateur — uniquement le
          // nom, pas la description).
          '<div class="name"'+(displayName ? ' title="'+escapeHtml(p.name||'')+'"' : '')+'>'+(displayName ? escapeHtml(p.name||'') : '')+'</div>'+
          '<div class="desc">'+(shortDesc ? escapeHtml(shortDesc) : '')+'</div>'+
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

  async function deleteProduct(id){
    var p = products.find(function(x){return x.id===id;});
    if(!p) return;

    // Le bouton "Supprimer" est déjà masqué sans ce droit (voir render.js
    // plus haut), mais cette fonction est aussi accessible directement
    // (console, autre appel) — vérifier ici aussi plutôt que de se reposer
    // uniquement sur l'UI (retour utilisateur : vérifier que les
    // permissions sont réellement appliquées, pas juste visuellement).
    var _perms = window._userPerms || {};
    if(!(_perms.canDelete || _perms.isAdmin)){
      showToast('Droit de suppression requis', 'err', 3000);
      return;
    }

    // Empêche de supprimer un produit que quelqu'un d'autre est en train de
    // modifier (retour utilisateur) — même vérification que "Modifier" (voir
    // _checkProductEditLockBlocks dans js/actions.js), avant même la
    // confirmation pour ne pas faire croire que la suppression va aboutir.
    if(typeof window._checkProductEditLockBlocks === 'function'){
      var lockCheck = await window._checkProductEditLockBlocks(p, 'supprimer');
      if(lockCheck.blocked){
        var delPopupMsg = lockCheck.lockedBy
          ? '<strong>' + escapeHtml(lockCheck.lockedBy) + '</strong> est en cours de modification de ce produit — impossible de le supprimer pour le moment.'
          : escapeHtml(lockCheck.message);
        customAlert('Produit en cours de modification', delPopupMsg);
        return;
      }
    }

    var confirmed = await customConfirm('Supprimer ce produit ?', '« '+escapeHtml(p.name||p.ref)+' » sera supprimé définitivement du catalogue.', { okLabel: 'Supprimer', danger: true });
    if(confirmed){
      var ref = p.ref;
      var sUrl = localStorage.getItem('cat_server_url');

      // Si serveur configuré → supprimer d'abord sur le serveur
      if(sUrl && ref){
        try{
          var r = await fetch(sUrl+'/deleteDatas?ref='+encodeURIComponent(ref), { method:'DELETE', headers: (function(){ var h = typeof window.authHeaders==='function'?Object.assign({},window.authHeaders()):{}; delete h['Content-Type']; return h; })() });
          if(!r.ok){
            showToast('Impossible de supprimer sur le serveur (HTTP '+r.status+') — suppression annulée', 'err', 4000);
            return;
          }
          // Forcer un re-sync complet sur tous les appareils au prochain check
          localStorage.setItem('cat_server_last_sync', '0');
        }catch(e){
          showToast('Serveur inaccessible — suppression annulée', 'err', 4000);
          return;
        }
      }

      // Supprimer en local
      products = products.filter(function(x){return x.id!==id;});
      // [] : la suppression côté serveur est déjà faite explicitement
      // au-dessus (/deleteDatas) — rien d'autre à repousser ici. save() sans
      // filtre repoussait TOUT le catalogue local restant à chaque
      // suppression de produit, avec createdAt forcé à maintenant sur
      // chacun (même risque que le bug corrigé dans syncFromServer/
      // pushToServer : un catalogue local resté en retard écraserait les
      // modifs récentes d'autrui, sur CHAQUE produit du catalogue, à chaque
      // suppression).
      save(true, []); // skipFileWrite pour ne pas bloquer

      // Actualisation en arrière-plan sans interrompre l'utilisateur
      var homePage = document.getElementById('homePage');
      var isOnHome = homePage && !homePage.classList.contains('hidden');
      if(isOnHome){
        renderHome();
      } else {
        // Fermer la fiche si elle affiche le produit supprimé
        var viewOverlay = document.getElementById('viewOverlay');
        if(viewOverlay && viewOverlay.classList.contains('open')){
          document.body.classList.remove('modal-open');
          if(typeof window._closeOverlayAnimated === 'function'){
            window._closeOverlayAnimated(viewOverlay, function(){ viewOverlay.classList.remove('open'); });
          } else {
            viewOverlay.classList.remove('open');
          }
        }
        render();
      }
      showToast(sUrl ? 'Produit supprimé du catalogue et du serveur ✓' : 'Produit supprimé ✓', 'ok', 2500);
    }
  }