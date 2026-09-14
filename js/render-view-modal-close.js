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
    // Empêche deux utilisateurs de modifier le même produit en même temps
    // (retour utilisateur) — voir _tryLockProductForEdit dans js/actions-editlock.js.
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
    closeView();
    deleteProduct(id);
  });

