  // ── Documents joints à une demande (mode révision, visionnage seul) ────
  // /pullDocsReq a disparu (voir js/requests.js, section "Documents joints à
  // une demande") : un document joint à une demande est maintenant un
  // /pullDocs ordinaire (même ref que la demande), marqué
  // metadata.request:true. Plutôt que de dupliquer toute la logique de
  // récupération/mise en cache/dézippage (_fetchPdfRawByRef/_fetchPdfByName,
  // js/render-documents.js — qui gère déjà le cas ZIP multi-fichiers, sans
  // la limite "1 seul fichier" que ce fichier avait avant), on la réutilise
  // telle quelle, et _docRenderItem pour le rendu de chaque ligne — les deux
  // globales (scripts classiques, pas de modules isolés).
  function _reqLoadDocsSection(reqRef, reqUser){
    var section = document.getElementById('modalReqDocsSection');
    var list    = document.getElementById('modalReqDocsList');
    if(!section || !list) return;
    section.style.display = 'none';
    list.innerHTML = '';
    var sUrl = localStorage.getItem('cat_server_url');
    if(!sUrl || !reqRef) return;
    var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
    delete h['Content-Type'];
    fetch(sUrl + '/pullDocs?nofile=true&ref=' + encodeURIComponent(reqRef), { headers: h, cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        var allFiles = (d && d.items) || [];
        // Ne garder que les documents de CETTE demande — pas ceux déjà
        // réels sur le produit, si la ref est partagée (demande de
        // modification d'un produit existant).
        var files = allFiles.filter(function(f){
          var meta = {};
          try { meta = typeof f.metadata === 'string' ? (JSON.parse(f.metadata) || {}) : (f.metadata || {}); } catch(e){}
          return meta.request === true;
        });
        if(!files.length) return;
        section.style.display = '';
        files.forEach(function(f){ _docRenderItem(list, f, sUrl); });
      })
      .catch(function(){});
  }

  // locked (défaut true) : ouvre en consultation verrouillée avec
  // Refuser/Modifier/Accepter — "Modifier" appelle _reviewSetLocked(false)
  // pour déverrouiller SUR CETTE MÊME fenêtre plutôt que d'en ouvrir une
  // autre.
  window._openReviewModal = function(item, user, locked){
    var data          = item.data || {};
    // data reste toujours les valeurs réelles actuelles (voir js/requests.js,
    // commentaire au-dessus de reqSubmit) ; data.requestFields (présent même
    // vide) porte uniquement ce qui a été proposé en plus — absent pour une
    // nouvelle proposition (rien de réel à fusionner par-dessus).
    var changedFields = data.requestFields || null;
    var isNew         = !changedFields;
    var p = isNew ? Object.assign({}, data) : Object.assign({}, data, changedFields);

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
    // Référence grisée pour la revue d'une MODIFICATION (le produit existe
    // déjà, la changer casserait les liens vers l'ancienne réf) — pas pour
    // la revue d'une proposition de NOUVEAU produit, où rien n'existe encore
    // (retour utilisateur : "est-ce qu'elle est aussi grisée pour les
    // propositions de modif etc." — étend le verrouillage de openModal(),
    // js/modal-autocomplete.js, à ce flux de revue qui ne passe pas par
    // cette fonction). Mémorisé sur window pour que _reviewSetLocked
    // (js/modal-specs-editor.js) puisse le réappliquer après un
    // déverrouillage "Modifier", qui sinon réactive TOUS les champs sans
    // distinction.
    window._reviewIsExistingProduct = !isNew;
    if(typeof window._setFRefLocked === 'function') window._setFRefLocked(!isNew);
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

