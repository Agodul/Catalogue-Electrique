  function closeView(){
    // Si on vient d'une suggestion, retourner sur la fiche parente
    if(_viewHistory.length > 0){
      var parentId = _viewHistory.pop();
      openView(parentId);
      return;
    }
    vmInfoMenu.classList.remove('open');
    // Retour utilisateur : "lorsqu'on clique sur la ref qui est lister et
    // qu'on ferme la fiche produit faudrait revenir sur la fenetre précédent"
    // — posé par js/modal-supplier-discounts.js juste avant d'ouvrir cette
    // fiche depuis un lien remise min/max ; remis à false par vmEditBtn/
    // vmDeleteBtn plus bas (fermeture de transition — ouverture du
    // formulaire d'édition ou suppression — pas une vraie fermeture par
    // l'utilisateur, qui ne doit donc pas rouvrir cette fenêtre).
    var returnToSupplierDiscount = !!window._viewReturnToSupplierDiscount;
    window._viewReturnToSupplierDiscount = false;
    if(returnToSupplierDiscount && typeof window._openSupplierDiscountModal === 'function'){
      viewingId = null;
      window._viewingId = null;
      // Rouvre seulement une fois la fiche réellement masquée (même
      // principe que reopenMenu ailleurs dans l'appli — voir js/auth.js,
      // js/actions-compare.js, js/requests.js) — pas de
      // document.body.classList.remove('modal-open') ici : la fenêtre
      // "Remises par fournisseur" le repose de toute façon tout de suite
      // après, sans jamais le retirer entre-temps.
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(viewOverlay, function(){
          viewOverlay.classList.remove('open');
          window._openSupplierDiscountModal();
        });
      } else {
        viewOverlay.classList.remove('open');
        window._openSupplierDiscountModal();
      }
      return;
    }
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

  // Échap : géré centralement par _initModalEscape (js/init.js), qui
  // connaît déjà viewOverlay (voir MODALS, close: 'vmCloseBtn') et
  // déclenche closeView() via un clic sur ce même bouton — un second
  // listener ici fermait la fiche EN PLUS d'une autre fenêtre gérée
  // ailleurs sur le même appui (retour utilisateur : "Echap ferme toutes
  // les fenêtres ouvertes au lieu d'une seule").
  if(vmCloseBtn) vmCloseBtn.addEventListener('click', closeView);

  // Retour utilisateur : "fais en sorte que quand la description affiche le
  // bouton voir plus, ça ouvre une fenêtre avec la description complète" —
  // "Voir plus" dépliait jusqu'ici le texte SUR PLACE (avec un "Voir
  // moins" et un verrou de hauteur sur #viewModal pour empêcher la fiche
  // de s'agrandir, voir l'historique retiré ci-dessus). Réutilise
  // #sugOverlay/#sugModal/#sugList, la même fenêtre déjà réutilisée pour
  // Caractéristiques/Documents/Produits associés/Pièces de rechange (voir
  // js/render-view-modal.js) plutôt que d'en créer une nouvelle — la fiche
  // elle-même ne bouge donc plus jamais.
  vmDesc.addEventListener('click', function(e){
    var toggle = e.target.closest('.vm-desc-toggle');
    if(!toggle) return;
    var sugModalTitle = document.getElementById('sugModalTitle');
    var sugList = document.getElementById('sugList');
    var sugOverlay = document.getElementById('sugOverlay');
    if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-file-text"></i> Description';
    if(sugList) sugList.innerHTML = '<p style="margin:0;line-height:1.6;color:var(--ink);white-space:pre-wrap;">' + escapeHtml(toggle.dataset.full || '') + '</p>';
    if(sugOverlay){
      sugOverlay.style.display = 'flex';
      document.body.classList.add('modal-open');
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
  // tant que la fiche produit était ouverte, et le menu du ⋯ ne se
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
    var vmEditBtnEl = document.getElementById('vmEditBtn');
    // Retour utilisateur : "qu'est-ce qui se passe si une demande de modif
    // est en cours et qu'un user avec canEdit modifie la même ref ?" —
    // vérifié en conditions réelles : la modification directe (ci-dessous,
    // /pushDatas) REMPLACE toute la ligne, request/request_field compris —
    // la demande en attente disparaît silencieusement, sans jamais être
    // acceptée ni refusée (le cache local de l'admin ne voit jamais ces
    // champs, filtrés exprès de la synchro normale, voir
    // js/actions-sync-core.js). Bloqué ici en amont, même principe que le
    // verrou "en cours d'édition" juste en dessous — popup, pas de
    // formulaire ouvert tant que la demande n'a pas été traitée.
    if(p && typeof _reqIsAlreadyPending === 'function'){
      if(vmEditBtnEl) vmEditBtnEl.disabled = true;
      var pending = await _reqIsAlreadyPending(p.ref);
      if(vmEditBtnEl) vmEditBtnEl.disabled = false;
      if(pending){
        customAlert('Demande en attente sur ce produit', 'Traitez-la (Demandes en attente) avant de modifier ce produit, sinon elle sera perdue.');
        return; // ne ferme pas la vue, n'ouvre pas le formulaire
      }
    }
    // Empêche deux utilisateurs de modifier le même produit en même temps
    // (retour utilisateur) — voir _tryLockProductForEdit dans js/actions-editlock.js.
    if(p && typeof window._tryLockProductForEdit === 'function'){
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
    // Fermeture de transition vers le formulaire d'édition, pas une vraie
    // fermeture par l'utilisateur — ne doit pas rouvrir "Remises par
    // fournisseur" (voir le drapeau dans closeView() plus haut).
    window._viewReturnToSupplierDiscount = false;
    closeView();
    openModal(id);
    // Mémorise qu'on vient de la fiche produit : si l'édition est annulée
    // (croix, "Annuler", Échap — voir requestCloseModal dans
    // js/modal-autocomplete.js) plutôt qu'enregistrée, on doit revenir sur
    // cette même fiche au lieu de se retrouver sur la page derrière (liste/
    // accueil) — retour utilisateur : "la croix de la fenêtre de modifier
    // un produit renvoie pas sur la fiche produit". openModal() efface ce
    // flag à chaque ouverture (voir js/modal-autocomplete.js), donc il ne
    // doit être posé qu'APRÈS l'appel ci-dessus.
    window._modalReturnToViewId = id;
    // Démarre le heartbeat du verrou (voir js/modal-editlock-heartbeat.js) — seulement ici,
    // juste après un verrou effectivement posé par _tryLockProductForEdit
    // ci-dessus, pas dans openModal() lui-même (aussi utilisé pour "Ajouter
    // un produit" et "Proposer une modification", qui ne posent jamais ce
    // verrou).
    if(typeof window._startEditLockHeartbeat === 'function') window._startEditLockHeartbeat(id);
  });
  document.getElementById('vmDeleteBtn').addEventListener('click', function(){
    var id = viewingId;
    // Fermeture de transition (produit supprimé) — ne doit pas rouvrir
    // "Remises par fournisseur" (voir le drapeau dans closeView() plus haut).
    window._viewReturnToSupplierDiscount = false;
    closeView();
    deleteProduct(id);
  });

