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

  // Pré-remplit le formulaire depuis un objet produit — utilisé pour l'édition
  // d'un produit existant, et pour la révision d'une demande soumise (qui
  // n'existe pas encore dans `products`).
  function fillFormFromProduct(p){
    fBrand.value = p.brand||''; fRef.value = p.ref||''; fUrl.value = p.url||'';
    fFamily.value = p.family||''; fSeries.value = p.series||''; fSupplier.value = p.supplier||'';
    if(fLeadTime) fLeadTime.value = p.leadTime||'';
    fName.value = p.name||''; fDesc.value = p.desc||''; fTags.value = (Array.isArray(p.tags) ? p.tags.join(', ') : '');
    renderTagSuggestions();
    f3dAvailable.checked = !!p.available3DX;
    f3dLink.value = p.available3DXLink || '';
    update3dLinkVisibility();
    if(fEssential) fEssential.checked = !!p.essential;
    _sugRefs = Array.isArray(p.suggestions) ? p.suggestions.slice() : [];
    _sugHidden = Array.isArray(p.suggestionsHidden) ? p.suggestionsHidden.slice() : [];
    _sugRenderChips();
    _sparePartsRefs = Array.isArray(p.spareParts) ? p.spareParts.slice() : [];
    _sparePartsHidden = Array.isArray(p.sparePartsHidden) ? p.sparePartsHidden.slice() : [];
    _sparePartsRenderChips();
    _specsRows = (p.specs && typeof p.specs === 'object')
      ? Object.keys(p.specs).map(function(k){ return { key: k, value: p.specs[k] }; })
      : [];
    _specsRenderRows();
    fPrice.value = p.price||''; fPhoto.value = p.photo||'';
    updatePhotoPreview();
    renderPriceHistory(p);
    switchTab('manual');
    if(btnOpenPriceModal) btnOpenPriceModal.style.display = 'flex';
    if(priceDisplayRow) priceDisplayRow.style.display = 'flex';
    if(priceCreateRow)  priceCreateRow.style.display  = 'none';
    updatePriceDisplay();
  }

  function openModal(id){
    // Garde-fou supplémentaire (en plus de resetReviewModeUI) : openModal()
    // sert à "Ajouter un produit"/"Modifier le produit", jamais à la revue
    // d'une demande — l'état verrouillé ne doit donc jamais y être visible.
    if(typeof _reviewSetLocked === 'function') _reviewSetLocked(false);
    editingId = id || null;
    resetForm();
    if(editingId){
      var p = products.find(function(x){return x.id===editingId;});
      if(p){
        modalTitle.textContent = 'Modifier le produit';
        modalLeftFoot.textContent = 'Ajouté le ' + (p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '—');
        fillFormFromProduct(p);
        _formOriginalSnapshot = _formSnapshotNow();
      }
    }else{
      modalTitle.textContent = 'Ajouter un produit';
      modalLeftFoot.textContent = '';
      _formOriginalSnapshot = null;

      // Seuil aligné sur la règle CSS qui masque tout l'onglet "Extraction
      // automatique" sur mobile/tablette (voir #productExtractTabs dans
      // css/styles.css) — 1024px ET pointer:coarse, pas juste 768px comme
      // avant : sans le pointer:coarse, une fenêtre desktop simplement
      // redimensionnée en dessous de 1024px (souris, pas tactile) aurait
      // aussi basculé sur "Saisie manuelle" alors que l'extraction
      // automatique y fonctionne parfaitement.
      var _isMobileOrTablet = window.innerWidth <= 1024
        && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      switchTab(_isMobileOrTablet ? 'manual' : 'auto');

      // Affiche la zone prix de vente uniquement en mode création
      sellingPriceZoneEl.style.display = 'block';
      if(btnOpenPriceModal) btnOpenPriceModal.style.display = 'none';
      if(priceDisplayRow) priceDisplayRow.style.display = 'none';
      if(priceCreateRow)  priceCreateRow.style.display  = 'block';
    }

    // ── Avertir AVANT la saisie si l'enregistrement ne pourrait pas être
    // synchronisé (plutôt qu'après coup) ────────────────────────────────
    // Basé sur canEdit (pas canSyncServer, voir retour utilisateur) :
    // "Data serveur" ne contrôle QUE les deux boutons manuels "Charger
    // depuis le serveur"/"Envoyer le catalogue local" (Réglages → Serveur,
    // voir serverButtonsSection dans js/auth.js) — un compte avec juste le
    // droit d'édition doit pouvoir enregistrer/synchroniser normalement,
    // ça n'a jamais été le rôle de cette permission séparée. Ne s'applique
    // pas en mode "Proposer" (_proposeMode) : c'est justement le circuit
    // prévu pour les comptes sans droit d'édition, qui passe par une
    // demande, pas un push direct.
    var noSyncBanner     = document.getElementById('modalNoSyncBanner');
    var noSyncBannerText = document.getElementById('modalNoSyncBannerText');
    var serverUrlCheck   = localStorage.getItem('cat_server_url');
    var _perms2  = window._userPerms || {};
    var canSync  = !!(_perms2.canEdit || _perms2.isAdmin);
    var blockSave = !!serverUrlCheck && !canSync && !window._proposeMode;
    if(noSyncBanner){
      noSyncBanner.style.display = blockSave ? 'flex' : 'none';
      if(blockSave && noSyncBannerText){
        noSyncBannerText.textContent = 'Vous n\'avez pas les droits de synchronisation avec le serveur : cet enregistrement resterait local uniquement sur cet appareil, invisible pour les autres utilisateurs. Contactez un administrateur.';
      }
    }
    var btnSaveForSyncCheck = document.getElementById('btnSave');
    if(btnSaveForSyncCheck){
      btnSaveForSyncCheck.disabled = blockSave;
      btnSaveForSyncCheck.style.opacity = blockSave ? '0.5' : '';
      btnSaveForSyncCheck.style.cursor = blockSave ? 'not-allowed' : '';
    }

    // ── Section PDF multi-doc ────────────────────────────────────
    var sUrl = localStorage.getItem('cat_server_url');
    var canUploadPdf = window._userPerms ? (window._userPerms.canUploadDocs || window._userPerms.isAdmin) : (typeof authGetCurrentUser === 'function' && authGetCurrentUser() && authGetCurrentUser().isAdmin);
    var modalPdfSection = document.getElementById('modalPdfSection');
    var modalPdfList    = document.getElementById('modalPdfList');
    var modalPdfUpload  = document.getElementById('modalPdfUpload');
    var modalPdfInput   = document.getElementById('modalPdfInput');

    if(modalPdfSection) modalPdfSection.style.display = 'none';

    if(canUploadPdf && editingId){
      var pForPdf = products.find(function(x){ return x.id === editingId; });
      if(pForPdf){
        if(modalPdfSection) modalPdfSection.style.display = '';

        // Source de vérité pour la liste de fichiers PENDANT que cette
        // modale est ouverte — volontairement PAS pForPdf._docFiles : save()
        // efface _docFiles de tous les produits à chaque appel (champ local
        // uniquement, voir js/storage.js), y compris pForPdf puisque c'est
        // le même objet que products[idx2]. Un 2e supprimer/ajouter dans la
        // même session lisait alors "pForPdf._docFiles || []" → toujours [],
        // donc filtrait/concaténait sur une liste vide → tout semblait
        // supprimé d'un coup (bug rapporté : "je supprime un document, ça
        // supprime tous"). _pdfDocFiles n'est jamais touché par save().
        var _pdfDocFiles = [];

        function _pdfRenderList(files){
          var L = document.getElementById('modalPdfList');
          var U = document.getElementById('modalPdfUpload');
          if(!L) return;
          L.innerHTML = '';
          if(U) U.style.display = 'flex';
          if(!files || files.length === 0) return;
          L.innerHTML = files.map(function(f){
            var isImg = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(f.filename||'');
            var icon = isImg
              ? '<i class="ti ti-photo" style="font-size:18px;color:var(--copper);flex-shrink:0;"></i>'
              : '<i class="ti ti-file-type-pdf" style="font-size:18px;color:#E53E3E;flex-shrink:0;"></i>';
            return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);margin-bottom:4px;">'
              + icon
              + '<span style="font-size:13px;color:var(--ink);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(f.filename) + '</span>'
              + (f.uuid ? '<button data-uuid="' + escapeHtml(f.uuid) + '" class="pdf-del-btn" style="padding:3px 9px;border-radius:6px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0;">✕</button>' : '')
              + '</div>';
          }).join('');
          L.querySelectorAll('.pdf-del-btn').forEach(function(btn){
            btn.onclick = function(){ _pdfDeleteOne(btn.getAttribute('data-uuid')); };
          });
        }

        function _pdfDeleteOne(uuid){
          if(!uuid || !sUrl) return;
          var hDel = typeof window.authHeaders==='function' ? Object.assign({}, window.authHeaders()) : {};
          delete hDel['Content-Type'];
          fetch(sUrl + '/deleteDoc?uuid=' + encodeURIComponent(uuid), { method:'DELETE', headers: hDel })
            .then(function(r){ if(!r.ok) return Promise.reject('HTTP '+r.status); })
            .then(function(){
              _pdfDocFiles = _pdfDocFiles.filter(function(f){ return f.uuid !== uuid; });
              var hasAny = _pdfDocFiles.length > 0;
              pForPdf._docFiles  = _pdfDocFiles;
              pForPdf.hasDoc      = hasAny;
              pForPdf.docFilename = hasAny ? _pdfDocFiles.map(function(f){ return f.filename; }).join(', ') : '';
              _pdfRenderList(_pdfDocFiles);
              var idx2 = products.findIndex(function(x){ return x.id === editingId; });
              if(idx2 !== -1){ products[idx2].hasDoc = pForPdf.hasDoc; products[idx2].docFilename = pForPdf.docFilename; save(true, [products[idx2]]); }
              showToast('Fichier supprimé ✓', 'ok', 2000);
            })
            .catch(function(e){ showToast('Erreur suppression : '+e, 'err', 4000); });
        }

        function _pdfUploadFiles(fileList){
          if(!fileList || !fileList.length || !pForPdf || !pForPdf.ref) return;
          if(!sUrl){ showToast('Serveur non configuré', 'err', 4000); return; }
          var h = typeof window.authHeaders==='function' ? Object.assign({}, window.authHeaders()) : {};
          delete h['Content-Type'];
          var arr = Array.from(fileList);
          showToast('Envoi de '+arr.length+' fichier'+(arr.length>1?'s':'')+' en cours…', 'ok', 3000);
          Promise.all(arr.map(function(file){
            var fd = new FormData();
            fd.append('ref', pForPdf.ref);
            fd.append('document', file, file.name);
            return fetch(sUrl + '/pushDocs', { method:'POST', headers: h, body: fd })
              .then(function(r){ return r.ok ? r.json() : Promise.reject('HTTP '+r.status); })
              .then(function(data){ return { uuid: data.uuid, filename: data.filename || file.name, ref: pForPdf.ref }; });
          }))
          .then(function(newFiles){
            _pdfDocFiles = _pdfDocFiles.concat(newFiles);
            pForPdf._docFiles  = _pdfDocFiles;
            pForPdf.hasDoc = true;
            pForPdf.docFilename = _pdfDocFiles.map(function(f){ return f.filename; }).join(', ');
            _pdfRenderList(_pdfDocFiles);
            var idx2 = products.findIndex(function(x){ return x.id === editingId; });
            if(idx2 !== -1){ products[idx2].hasDoc = true; products[idx2].docFilename = pForPdf.docFilename; save(true, [products[idx2]]); }
            showToast(arr.length+' PDF envoyé'+(arr.length>1?'s':'')+' ✓', 'ok', 2500);
            if(modalPdfInput) modalPdfInput.value = '';
          })
          .catch(function(e){ showToast('Erreur envoi PDF : '+e, 'err', 4000); });
        }

        if(modalPdfInput) modalPdfInput.onchange = function(){ _pdfUploadFiles(this.files); };

        // Charger la liste depuis le serveur
        if(sUrl && pForPdf.ref){
          var hList = typeof window.authHeaders==='function' ? Object.assign({}, window.authHeaders()) : {};
          delete hList['Content-Type'];
          var _pdfListEl = document.getElementById('modalPdfList');
          if(_pdfListEl) _pdfListEl.innerHTML = '<div style="font-size:12px;color:var(--ink-soft);padding:4px 0;">Chargement…</div>';
          fetch(sUrl + '/pullDocs?nofile=true&ref=' + encodeURIComponent(pForPdf.ref), { headers: hList })
            .then(function(r){
              if(!r.ok){ console.warn('[PDF] pullDocs status:', r.status); return null; }
              return r.json().catch(function(e){ console.warn('[PDF] json parse error:', e); return null; });
            })
            .then(function(d){
              var files = d && d.items ? d.items : [];
              _pdfDocFiles = files;
              pForPdf._docFiles = files;
              var realHasDoc = files.length > 0;
              var realDocFilename = files.map(function(f){ return f.filename; }).join(', ');
              // Auto-réparation : si un ancien bug de session (liste locale
              // effacée par erreur — voir commentaire sur _pdfDocFiles
              // ci-dessus) a persisté un hasDoc/docFilename incorrect sur ce
              // produit (ex. bouton "Documents" resté caché côté fiche alors
              // que des fichiers existent bien sur le serveur), on corrige et
              // on ré-enregistre dès l'ouverture de cette modale.
              var idx0 = products.findIndex(function(x){ return x.id === editingId; });
              var needsFix = idx0 !== -1 && (!!products[idx0].hasDoc !== realHasDoc || (products[idx0].docFilename || '') !== realDocFilename);
              pForPdf.hasDoc = realHasDoc;
              pForPdf.docFilename = realDocFilename;
              _pdfRenderList(files);
              if(needsFix){
                products[idx0].hasDoc = realHasDoc;
                products[idx0].docFilename = realDocFilename;
                save(true, [products[idx0]]);
              }
            })
            .catch(function(e){
              console.warn('[PDF] fetch error:', e);
              var files = _pdfDocFiles.length ? _pdfDocFiles : (pForPdf.hasDoc ? [{ uuid:'', filename: pForPdf.docFilename||'Document PDF' }] : []);
              _pdfRenderList(files);
            });
        } else {
          console.warn('[PDF] pas de sUrl ou ref — sUrl:', sUrl, 'ref:', pForPdf.ref);
          _pdfRenderList(_pdfDocFiles);
        }
      }
    } else if(window._proposeMode){
      // Mode "Proposer" : la ref n'existe pas encore côté serveur (nouveau
      // produit) ou le compte n'a pas canUploadDocs — upload DIFFÉRÉ, comme
      // pour un rapport de bug (voir reqSubmitBug dans requests.js) : les
      // fichiers restent en mémoire, envoyés à /pushDocsReq juste après que
      // btnSave ait confirmé l'enregistrement de la demande (voir actions.js),
      // avec la ref du formulaire — connue dès maintenant même en création,
      // c'est un champ obligatoire.
      if(modalPdfSection) modalPdfSection.style.display = '';
      var titleEl = document.getElementById('modalPdfSectionTitle');
      if(titleEl) titleEl.textContent = 'Documents (joints à la demande)';
      window._proposeAttachedFiles = [];

      function _proposeRenderFiles(){
        var L = document.getElementById('modalPdfList');
        var U = document.getElementById('modalPdfUpload');
        if(!L) return;
        if(U) U.style.display = 'flex';
        L.innerHTML = window._proposeAttachedFiles.map(function(f, i){
          var isImg = /^image\//.test(f.type);
          var icon = isImg
            ? '<i class="ti ti-photo" style="font-size:18px;color:var(--copper);flex-shrink:0;"></i>'
            : '<i class="ti ti-file-type-pdf" style="font-size:18px;color:#E53E3E;flex-shrink:0;"></i>';
          return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;border:1px solid var(--line);background:var(--paper);margin-bottom:4px;">'
            + icon
            + '<span style="font-size:13px;color:var(--ink);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(f.name) + '</span>'
            + '<button data-idx="' + i + '" class="propose-file-del-btn" style="padding:3px 9px;border-radius:6px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;font-size:12px;cursor:pointer;font-family:inherit;flex-shrink:0;">✕</button>'
            + '</div>';
        }).join('');
        L.querySelectorAll('.propose-file-del-btn').forEach(function(btn){
          btn.onclick = function(){
            window._proposeAttachedFiles.splice(parseInt(btn.getAttribute('data-idx'), 10), 1);
            _proposeRenderFiles();
          };
        });
      }
      _proposeRenderFiles();
      if(modalPdfInput) modalPdfInput.onchange = function(){
        Array.from(this.files || []).forEach(function(f){ window._proposeAttachedFiles.push(f); });
        this.value = '';
        _proposeRenderFiles();
      };
    }
    // ── Fin section PDF ──

    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    // Remise à zéro du défilement : gérée génériquement pour toutes les
    // fenêtres par _initScrollReset() dans js/init.js.
    // Empêcher iOS de focus automatiquement le premier input (évite zoom + clavier)
    var inputs = overlay.querySelectorAll('input, textarea, select');
    inputs.forEach(function(el){ el.setAttribute('readonly', 'readonly'); });
    setTimeout(function(){
      inputs.forEach(function(el){ el.removeAttribute('readonly'); });
    }, 300);
  }
  // En mode édition, le formulaire est pré-rempli avec le produit existant —
  // hasUnsavedInput() ne doit alerter que si quelque chose a réellement
  // changé par rapport à ces valeurs de départ, pas juste si les champs sont
  // non-vides (sinon la confirmation "Annuler la saisie" apparaît à chaque
  // fermeture, même sans la moindre modification — bug remonté par
  // l'utilisateur). Capturé dans openModal() juste après le pré-remplissage.
  //
  // Liste des champs couverts : doit rester alignée avec fillFormFromProduct()
  // ci-dessus. Un champ éditable oublié ici = une modification silencieusement
  // perdue en fermant par ✕/Échap, sans confirmation (bug remonté par
  // l'utilisateur — seuls 10 champs "auto-extraction" étaient suivis au
  // départ, oubliant fournisseur/délai/tags/3D/essentiel/specs/icône).
  var _formOriginalSnapshot = null;
  function _formSnapshotNow(){
    return {
      brand: fBrand.value.trim(), ref: fRef.value.trim(), family: fFamily.value.trim(),
      series: fSeries.value.trim(), url: fUrl.value.trim(), html: fHtml.value.trim(),
      name: fName.value.trim(), desc: fDesc.value.trim(), price: fPrice.value.trim(),
      photo: fPhoto.value.trim(),
      supplier: fSupplier.value.trim(),
      leadTime: fLeadTime ? fLeadTime.value.trim() : '',
      tags: fTags.value.trim(),
      available3DX: f3dAvailable.checked,
      available3DXLink: f3dLink.value.trim(),
      essential: fEssential ? fEssential.checked : false,
      suggestions: _sugRefs.slice().sort().join('|'),
      suggestionsHidden: _sugHidden.slice().sort().join('|'),
      spareParts: _sparePartsRefs.slice().sort().join('|'),
      sparePartsHidden: _sparePartsHidden.slice().sort().join('|'),
      specs: JSON.stringify(_specsRows),
      familyIcon: selectedFamilyIcon
    };
  }
  function hasUnsavedInput(){
    var current = _formSnapshotNow();
    if(!_formOriginalSnapshot){
      // Mode création : le formulaire démarre vide, tout champ rempli est une saisie à protéger.
      return !!(current.brand || current.ref || current.family || current.series ||
                current.url || current.html || current.name || current.desc ||
                current.price || current.photo || current.supplier || current.leadTime ||
                current.tags || current.available3DX || current.available3DXLink ||
                current.essential || current.suggestions || current.spareParts || (current.specs && current.specs !== '[]'));
    }
    return Object.keys(current).some(function(k){ return current[k] !== _formOriginalSnapshot[k]; });
  }
  function resetProposeModeUI(){
    if(!window._proposeMode) return;
    window._proposeMode = false;
    window._proposeOriginal = null;
    var title = document.getElementById('modalTitle');
    var btnSave = document.getElementById('btnSave');
    if(title) title.textContent = editingId ? 'Modifier le produit' : 'Ajouter un produit';
    if(btnSave) btnSave.textContent = 'Enregistrer';
  }
  window._resetProposeModeUI = resetProposeModeUI;

  function requestCloseModal(){
    // Garde-fou : X, "Annuler" et Escape appellent tous requestCloseModal(),
    // sans qu'aucun ne désactive le formulaire pendant que la confirmation
    // est affichée — un appel répété (Escape maintenu, double-clic...)
    // créait une nouvelle popup "Annuler la saisie" à chaque fois, empilées
    // les unes sur les autres (retour utilisateur : superposition de
    // fenêtres). Si une confirmation est déjà affichée, ne pas en recréer
    // une deuxième.
    if(document.getElementById('_discardConfirmPopup')) return;

    // Affiche la confirmation "Annuler la saisie" et n'exécute onDiscard
    // que si l'utilisateur confirme vouloir tout perdre — factorisé pour
    // être réutilisé par les deux cas ci-dessous (fermeture complète de la
    // fenêtre, et retour à la vue verrouillée d'une demande en cours de
    // révision), qui ne font pas la même chose une fois confirmé.
    function showDiscardConfirmPopup(onDiscard){
      var popup = document.createElement('div');
      popup.id = '_discardConfirmPopup';
      popup.style.cssText =
        'position:fixed;inset:0;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10000;';

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
        onDiscard();
      });
    }

    // Annuler depuis l'édition déverrouillée d'une demande : revenir à la
    // vue verrouillée de CETTE MÊME demande (annule les modifs, sans les
    // sauvegarder) plutôt que fermer toute la fenêtre — "Annuler" doit
    // annuler l'édition, pas quitter la consultation (retour utilisateur).
    // Avant resetProposeModeUI()/resetReviewModeUI() : on reste en mode
    // revue, ces fonctions ne doivent donc pas s'exécuter ici.
    // hasUnsavedInput() gardait ce cas de côté auparavant : "Annuler"
    // effaçait la saisie SANS confirmation dès qu'on éditait une demande
    // reçue (retour utilisateur : "quand j'édite une demande, Annuler
    // supprime tout") — désormais alignée sur le même filet de sécurité que
    // la création/modification normale d'un produit juste en dessous.
    if(window._reviewMode && window._reviewLocked === false && window._reviewItem){
      if(!hasUnsavedInput()){
        window._openReviewModal(window._reviewItem, window._reviewUser, true);
        return;
      }
      showDiscardConfirmPopup(function(){
        window._openReviewModal(window._reviewItem, window._reviewUser, true);
      });
      return;
    }

    // Retenu AVANT resetReviewModeUI() (qui remet _reviewMode à false) —
    // sert à réafficher "Demandes en attente" juste en dessous une fois
    // cette fenêtre fermée (retour utilisateur : "ça doit faire comme si
    // elle était restée cachée derrière la fenêtre nouveau produit").
    // _reqRevealPanel (pas reqOpenPanel) : révélation instantanée d'un
    // panneau seulement masqué (voir _reqHidePanel dans requests.js), sans
    // le rouvrir/ré-animer/recharger sa liste depuis zéro — elle n'a pas
    // changé puisqu'on n'a fait que consulter, pas accepter/refuser.
    var wasReviewingFromRequestsList = !!window._reviewMode;

    // Réinitialiser le mode proposition / révision
    resetProposeModeUI();
    resetReviewModeUI();
    if(!hasUnsavedInput()){
     closeModal();
     if(wasReviewingFromRequestsList && typeof _reqRevealPanel === 'function') _reqRevealPanel();
    return;
    }

    showDiscardConfirmPopup(function(){
      closeModal();
      if(wasReviewingFromRequestsList && typeof _reqRevealPanel === 'function') _reqRevealPanel();
    });
  }
