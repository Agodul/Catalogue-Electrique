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
    var vmModalEl = document.getElementById('viewModal');
    if(isExpanded){
      var truncated = toggle.dataset.short;
      vmDesc.innerHTML = escapeHtml(truncated)
        + '<span class="vm-desc-toggle" role="button" tabindex="0"> Voir plus</span>';
      vmDesc.querySelector('.vm-desc-toggle').dataset.full    = toggle.dataset.full;
      vmDesc.querySelector('.vm-desc-toggle').dataset.short   = truncated;
      vmDesc.querySelector('.vm-desc-toggle').dataset.expanded = 'false';
      // "Voir moins" : redonne la main à la hauteur naturelle du contenu
      // (retire le verrou posé ci-dessous à l'ouverture de "Voir plus").
      if(vmModalEl) vmModalEl.style.height = '';
    } else {
      // "Voir plus" : verrouille la hauteur ACTUELLE de la fenêtre avant
      // d'agrandir le texte, pour que le texte en plus se défile dans
      // .vm-scroll au lieu de faire grandir toute la fiche produit (retour
      // utilisateur : "lorsqu'on fait voir plus la fiche produit
      // s'allonge"). Sans ce verrou, #viewModal (hauteur auto plafonnée à
      // min(80vh,620px)) grandissait pour accueillir le texte complet tant
      // que ce plafond n'était pas encore atteint.
      if(vmModalEl) vmModalEl.style.height = vmModalEl.getBoundingClientRect().height + 'px';
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

