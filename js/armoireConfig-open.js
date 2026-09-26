function _armoireOpen(){
  var overlay = document.getElementById('armoireConfigOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');
  _armoireBindRowMenuOnce();
  _armoireOpenFamilies = {}; // dossiers repliés à chaque (ré)ouverture, comme "Parcourir le catalogue"
  var searchInput = document.getElementById('armoireConfigSearch');
  if(searchInput) searchInput.value = '';
  _armoireSyncSearchScopeBtn();
  _armoireCloseBlocksDrawer(true); // remise à zéro silencieuse, le tiroir n'a jamais été visible
  _armoireSetMobileView('browse');
  // Retour utilisateur : "cache le bouton Enregistrer du configurateur
  // lorsqu'on n'est pas loggé" — "Enregistrer" poste sur /configBlocks ou
  // /configSavedConfigs (voir _armoireSaveChoice), qui exigent un compte
  // côté serveur comme le reste des Blocs/Configurations partagés (voir
  // juste plus bas) : un clic sans être connecté n'aurait de toute façon
  // jamais pu aboutir. Recalculé à CHAQUE ouverture plutôt qu'une fois pour
  // toutes : une connexion/déconnexion referme déjà le panneau au passage
  // (voir _authCloseSensitiveUI dans js/auth.js), donc rouvrir est le seul
  // moment où l'état a besoin d'être réévalué.
  var saveBtnVisibility = document.getElementById('armoireConfigSaveBtn');
  if(saveBtnVisibility) saveBtnVisibility.style.display = (typeof authIsLoggedIn === 'function' && authIsLoggedIn()) ? '' : 'none';
  _armoireRenderDraft();
  _armoireRenderSearchResults('');
  _armoireSwitchTab(_armoireActiveTab);
  // Retour utilisateur : "pourquoi j'ai cette notif alors que je ne suis pas
  // connecté ?" (capture à l'appui : "Liste des blocs/configurations non
  // actualisée — réessayez" dès l'ouverture, en anonyme) — /configBlocks et
  // /configSavedConfigs exigent un compte côté serveur ; les appeler quand
  // même pour un visiteur anonyme échoue systématiquement (pas un aléa
  // réseau ponctuel que "réessayez" pourrait résoudre) et affichait ces deux
  // avertissements à chaque ouverture. La configuration en cours (locale,
  // propre à cet appareil, voir plus haut) reste pleinement utilisable sans
  // connexion ; seuls les Blocs/Configurations partagés de l'équipe
  // requièrent un compte, et restent donc simplement vides tant qu'on ne
  // s'est pas connecté, sans essai voué à l'échec ni faux avertissement.
  if(typeof authIsLoggedIn === 'function' && authIsLoggedIn()){
    // Retour utilisateur : "je veux que la demande de mise de côté ce fasse
    // lorsqu'on clique sur le configurateur" — _armoireReconcileOwnerOnLogin
    // (conflit entre le brouillon de cet appareil et celui déjà sur le
    // compte, voir plus haut) se résout D'ABORD, avant tout le reste :
    // _armoireFetchBlocks()/_armoireSyncDraftFromServer juste en dessous ne
    // doivent chercher/adopter le brouillon serveur qu'une fois cette
    // décision prise, jamais en même temps (la réconciliation pose déjà son
    // propre verrou _armoireReconcilingOwner pendant qu'elle attend une
    // réponse, mais les enchaîner reste plus simple à suivre que les laisser
    // courir en parallèle).
    (typeof _armoireReconcileOwnerOnLogin === 'function' ? _armoireReconcileOwnerOnLogin() : Promise.resolve(false)).then(function(handled){
      // handled === true : une décision "Garder"/"Mettre de côté" vient
      // d'être prise et déjà appliquée/synchronisée par
      // _armoireReconcileOwnerOnLogin elle-même. Ne PAS relancer
      // _armoireSyncDraftFromServer juste après : ce flux ne fait que
      // comparer des horodatages et pourrait retomber sur l'ANCIENNE entrée
      // serveur qu'on vient tout juste de remplacer si le serveur n'a pas
      // encore digéré le POST+DELETE (voir _armoireReplaceEntry) —
      // repéré en testant précisément ce cas : la décision de l'utilisateur
      // se faisait silencieusement défaire l'instant d'après. Seul
      // _armoireFetchBlocks() (pour peupler la liste "Blocs" à parcourir)
      // reste utile ici.
      if(handled){
        _armoireFetchBlocks();
        _armoireFetchSavedConfigs();
        return;
      }
      // Retour utilisateur : "reprendre sur notre tel ou un autre pc avec le
      // même identifiant" — _armoireBlocks doit être à jour (contient
      // éventuellement le brouillon serveur) avant de chercher dedans.
      _armoireFetchBlocks().then(_armoireSyncDraftFromServer);
      _armoireFetchSavedConfigs();
    });
  } else {
    _armoireRenderBlocksList();
    _armoireRenderSavedList();
    _armoireRenderOrdersList();
  }
}

function _armoireClose(){
  // Ne doit jamais rester ouverte par-dessus un configurateur fermé/masqué
  // (voir _armoireOpenDraftListModal).
  _armoireCloseDraftListModal();
  // Filet de sécurité : fermer le configurateur en pleine édition d'un
  // bloc/config ne doit jamais laisser la vraie configuration en cours
  // remplacée par le contenu édité — restaure silencieusement (voir
  // _armoireCancelEditEntry, jamais perdre la configuration de l'utilisateur).
  if(_armoireEditingEntry) _armoireCancelEditEntry();
  // Retour utilisateur : "reprendre sur notre tel ou un autre pc" — force la
  // synchronisation serveur immédiatement à la fermeture plutôt que
  // d'attendre le délai anti-rafale (ARMOIRE_DRAFT_SYNC_DELAY_MS) : sans ça,
  // fermer le configurateur puis changer d'appareil dans la seconde et demie
  // qui suit pouvait reprendre une version un cran en retard.
  if(_armoireDraftSyncTimer){
    clearTimeout(_armoireDraftSyncTimer);
    _armoireDraftSyncTimer = null;
    _armoireSyncDraftToServer();
  }
  var overlay = document.getElementById('armoireConfigOverlay');
  document.body.classList.remove('modal-open');
  _armoireCloseBlocksDrawer(true); // toute la fenêtre disparaît déjà — pas besoin d'une seconde anim en plus
  function teardown(){
    if(overlay) overlay.style.display = 'none';
  }
  if(overlay && typeof window._closeOverlayAnimated === 'function'){
    window._closeOverlayAnimated(overlay, teardown);
  } else {
    teardown();
  }
}

