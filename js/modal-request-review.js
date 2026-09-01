  // ── Documents joints à une demande (mode révision, visionnage seul) ────
  // Réutilise window._openPdfViewerWithBuffer (js/render.js) pour
  // l'affichage — il gère déjà PDF et image selon l'extension — mais la
  // récupération du buffer est propre à ce fichier : /pullDocsReq
  // (stockage des documents de DEMANDE) est distinct de /pullDocs
  // (documents d'un produit déjà au catalogue), avec sa propre logique.
  // Même limite connue que _reqMigrateDocsToProduct dans js/requests.js :
  // /pullDocsReq sans nofile renvoie un ZIP dès qu'il y a 2+ fichiers
  // joints, sans moyen d'en cibler un seul par nom — on télécharge donc le
  // ZIP une seule fois (mis en cache) et on en extrait le fichier demandé
  // au clic sur "Voir".
  var _reqDocsBufferCache = {}; // clé = ref::user → ArrayBuffer (brut, PDF/image ou ZIP)
  function _reqLoadJSZipLib(cb){
    if(window.JSZip){ cb(); return; }
    var s = document.createElement('script');
    s.src = 'js/jszip.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }
  function _fetchReqDocBuffer(sUrl, ref, user, filename, h, cb){
    var cacheKey = ref + '::' + user;
    var rawPromise = _reqDocsBufferCache[cacheKey]
      ? Promise.resolve(_reqDocsBufferCache[cacheKey])
      : fetch(sUrl + '/pullDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { headers: h })
          .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
          .then(function(ab){ _reqDocsBufferCache[cacheKey] = ab; return ab; });
    rawPromise.then(function(ab){
      var view = new Uint8Array(ab, 0, 4);
      var isZip = view[0] === 0x50 && view[1] === 0x4B;
      if(!isZip){ cb(null, ab); return; }
      _reqLoadJSZipLib(function(){
        JSZip.loadAsync(ab).then(function(zip){
          var target = null;
          zip.forEach(function(path, f){
            if(path === filename || path.split('/').pop() === filename) target = f;
          });
          if(!target) zip.forEach(function(path, f){ if(!target) target = f; });
          if(target) target.async('arraybuffer').then(function(buf){ cb(null, buf); });
          else cb(new Error('Fichier non trouvé dans l\'archive'));
        }).catch(function(e){ cb(e); });
      });
    }).catch(function(e){ cb(e); });
  }
  function _reqDocRenderItem(docList, file, sUrl, reqRef, reqUser){
    var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
    delete h['Content-Type'];
    var docName = file.filename || 'Document';
    var isImg = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(docName);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);';
    row.innerHTML = '<div style="width:30px;height:30px;background:'+(isImg?'#FFF7ED':'#FEF2F2')+';border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + (isImg ? '<i class="ti ti-photo" style="font-size:16px;color:var(--copper);"></i>' : '<i class="ti ti-file-type-pdf" style="font-size:16px;color:#E53E3E;"></i>')
      + '</div>'
      + '<div style="flex:1;min-width:0;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(docName)+'</div>';
    var btnVoir = document.createElement('button');
    btnVoir.type = 'button';
    btnVoir.style.cssText = 'padding:6px 12px;border-radius:7px;border:1px solid var(--line);background:var(--paper-card);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;font-family:inherit;display:flex;align-items:center;gap:5px;';
    btnVoir.innerHTML = '<i class="ti ti-eye" style="font-size:14px;"></i> Voir';
    btnVoir.onclick = function(){
      window._openPdfViewerWithBuffer(docName, function(onBuffer, onError){
        _fetchReqDocBuffer(sUrl, reqRef, reqUser, docName, h, function(err, ab){
          if(err) onError(err); else onBuffer(ab);
        });
      });
    };
    row.appendChild(btnVoir);
    docList.appendChild(row);
  }
  function _reqLoadDocsSection(reqRef, reqUser){
    var section = document.getElementById('modalReqDocsSection');
    var list    = document.getElementById('modalReqDocsList');
    if(!section || !list) return;
    section.style.display = 'none';
    list.innerHTML = '';
    _reqDocsBufferCache = {};
    var sUrl = localStorage.getItem('cat_server_url');
    if(!sUrl || !reqRef) return;
    var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
    delete h['Content-Type'];
    fetch(sUrl + '/pullDocsReq?nofile=true&ref=' + encodeURIComponent(reqRef) + '&user=' + encodeURIComponent(reqUser), { headers: h, cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        var files = d && d.items ? d.items : [];
        if(!files.length) return;
        section.style.display = '';
        files.forEach(function(f){ _reqDocRenderItem(list, f, sUrl, reqRef, reqUser); });
      })
      .catch(function(){});
  }

  // locked (défaut true) : ouvre en consultation verrouillée avec
  // Refuser/Modifier/Accepter — "Modifier" appelle _reviewSetLocked(false)
  // pour déverrouiller SUR CETTE MÊME fenêtre plutôt que d'en ouvrir une
  // autre.
  window._openReviewModal = function(item, user, locked){
    var data     = item.data || {};
    var original = data._reqOriginal;
    var isNew    = !original;
    var p = isNew ? Object.assign({}, data) : Object.assign({}, original, data);

    window._proposeMode = false;
    window._reviewMode  = true;
    window._reviewItem  = item;
    window._reviewUser  = user;
    window._reviewBase  = {
      id: p.id || null,
      createdAt: p.createdAt || null,
      priceHistory: Array.isArray(p.priceHistory) ? p.priceHistory.slice() : [],
      price: p.price || '',
      priceCatalogue: p.priceCatalogue || ''
    };

    editingId = null;
    resetForm();
    fillFormFromProduct(p);
    _formOriginalSnapshot = _formSnapshotNow();
    modalTitle.textContent = (isNew ? 'Nouveau produit : ' : 'Modification proposée : ') + (p.ref || '');
    modalLeftFoot.textContent = 'Soumis par ' + user + (data._reqAt ? ' · ' + new Date(data._reqAt).toLocaleString('fr-FR') : '');
    var btnSave = document.getElementById('btnSave');
    if(btnSave) btnSave.textContent = 'Valider et accepter';
    // Documents joints à CETTE demande (ref+user de la demande, pas du
    // produit une fois accepté) — retour utilisateur : pouvoir les
    // visionner avant de valider.
    _reqLoadDocsSection(item.ref, user);
    overlay.classList.add('open');
    document.body.classList.add('modal-open');
    _reviewSetLocked(locked !== false);
  };

  function resetReviewModeUI(){
    // Toujours remettre l'état verrouillé (Refuser/Modifier/Accepter, champs
    // désactivés) à zéro, MÊME si _reviewMode était déjà à false — sinon cet
    // état pouvait fuiter vers un usage tout à fait normal du formulaire
    // (ex. "Ajouter un produit" affichait Refuser/Modifier/Accepter à la
    // place d'Annuler/Enregistrer). openModal() n'appelait jamais cette
    // fonction, donc le seul filet de sécurité est ici, avant le early
    // return ci-dessous (retour utilisateur, capture à l'appui).
    _reviewSetLocked(false);
    if(!window._reviewMode) return;
    window._reviewMode = false;
    window._reviewItem = null;
    window._reviewUser = null;
    window._reviewBase = null;
    var title = document.getElementById('modalTitle');
    var btnSave = document.getElementById('btnSave');
    if(title) title.textContent = editingId ? 'Modifier le produit' : 'Ajouter un produit';
    if(btnSave) btnSave.textContent = 'Enregistrer';
    var reqDocsSection = document.getElementById('modalReqDocsSection');
    if(reqDocsSection) reqDocsSection.style.display = 'none';
  }
  window._resetReviewModeUI = resetReviewModeUI;

  document.getElementById('btnAdd').addEventListener('click', function(){ openModal(null); });
  document.getElementById('btnFabAdd').addEventListener('click', function(){ openModal(null); });

  document.getElementById('modalClose').addEventListener('click', requestCloseModal);
  document.getElementById('btnCancel').addEventListener('click', requestCloseModal);

  // ── Boutons de la vue "demande produit" verrouillée ──────────────────
  var btnReviewRefuseEl = document.getElementById('btnReviewRefuse');
  var btnReviewUnlockEl = document.getElementById('btnReviewUnlock');
  var btnReviewAcceptEl = document.getElementById('btnReviewAccept');
  if(btnReviewUnlockEl) btnReviewUnlockEl.addEventListener('click', function(){ _reviewSetLocked(false); });
  if(btnReviewRefuseEl) btnReviewRefuseEl.addEventListener('click', async function(){
    if(!window._reviewItem) return;
    btnReviewRefuseEl.disabled = true;
    var ok = await window.reqRefuse(window._reviewItem.ref, window._reviewUser, window._reviewItem.id);
    btnReviewRefuseEl.disabled = false;
    if(ok){
      showToast('Demande refusée', 'ok', 2500);
      if(typeof window._resetReviewModeUI === 'function') window._resetReviewModeUI();
      closeModal();
      if(typeof reqOpenPanel === 'function') reqOpenPanel();
      if(typeof reqUpdateBadge === 'function') reqUpdateBadge();
    } else {
      showToast('Erreur lors du refus', 'err', 3000);
    }
  });
  if(btnReviewAcceptEl) btnReviewAcceptEl.addEventListener('click', async function(){
    if(!window._reviewItem) return;
    btnReviewAcceptEl.disabled = true;
    var ok = await window.reqAccept(window._reviewItem.ref, window._reviewUser);
    btnReviewAcceptEl.disabled = false;
    if(ok){
      showToast('Demande acceptée ✓', 'ok', 2500);
      if(typeof window._resetReviewModeUI === 'function') window._resetReviewModeUI();
      closeModal();
      if(typeof reqOpenPanel === 'function') reqOpenPanel();
      if(typeof reqUpdateBadge === 'function') reqUpdateBadge();
    } else {
      showToast('Erreur lors de l\'acceptation', 'err', 3000);
    }
  });
  // Un clic sur le fond gris ne ferme plus la fenêtre : seul un clic explicite
  // sur « Annuler » ou la croix peut fermer la fiche, pour éviter de perdre
  // une saisie en cours par erreur.
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Escape' || !overlay.classList.contains('open')) return;
    // Des fenêtres s'ouvrent PAR-DESSUS la fiche produit (caractéristiques
    // techniques, historique des prix, aperçu photo) sans se fermer elles-
    // mêmes avant que ce listener ne s'exécute — sans ce garde-fou, Échap
    // fermait/demandait confirmation sur la fenêtre imbriquée ET sur la
    // fiche produit en dessous en même temps (retour utilisateur).
    var nestedOpen = (specsOverlay && specsOverlay.style.display !== 'none')
      || (priceModalOverlay && priceModalOverlay.style.display !== 'none')
      || (imgPreviewOverlay && imgPreviewOverlay.classList.contains('show'));
    if(nestedOpen) return;
    requestCloseModal();
  });

