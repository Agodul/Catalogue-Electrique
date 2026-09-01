  // ── Heartbeat du verrou "en cours d'édition" ────────────────────────
  // Tant que le formulaire reste réellement utilisé (activité dans les 8
  // dernières minutes), rafraîchit périodiquement _editingAt côté serveur
  // (voir _refreshProductEditLock dans js/actions.js) pour qu'une édition
  // légitime de plus de 10 min ne se fasse jamais "voler" par quelqu'un
  // d'autre (voir EDIT_LOCK_TTL_MS). Basé sur l'activité RÉELLE (frappe/clic
  // dans le formulaire), pas sur la simple présence de la fenêtre ouverte —
  // un onglet oublié ouvert sans personne devant doit continuer à laisser
  // le verrou expirer normalement (retour utilisateur). Démarré/arrêté
  // explicitement par l'appelant (voir vmEditBtn dans js/render.js et
  // closeModal ci-dessous) plutôt que déduit d'un état ambiant — seul le
  // vrai flux d'édition (verrou effectivement posé) doit le déclencher.
  var EDIT_LOCK_HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
  var EDIT_LOCK_IDLE_THRESHOLD_MS     = 8 * 60 * 1000;
  var _editLockLastActivityAt = 0;
  var _editLockHeartbeatTimer = null;
  var _editLockHeartbeatId    = null;

  function _editLockMarkActivity(){ _editLockLastActivityAt = Date.now(); }
  overlay.addEventListener('input', _editLockMarkActivity);
  overlay.addEventListener('click', _editLockMarkActivity);

  function _stopEditLockHeartbeat(){
    if(_editLockHeartbeatTimer){ clearInterval(_editLockHeartbeatTimer); _editLockHeartbeatTimer = null; }
    _editLockHeartbeatId = null;
  }
  window._stopEditLockHeartbeat = _stopEditLockHeartbeat;

  window._startEditLockHeartbeat = function(id){
    _stopEditLockHeartbeat();
    if(!id) return;
    _editLockHeartbeatId = id;
    _editLockMarkActivity(); // ouvrir le formulaire compte comme une activité initiale
    _editLockHeartbeatTimer = setInterval(function(){
      if(!_editLockHeartbeatId || editingId !== _editLockHeartbeatId) return; // fermé/changé entre-temps
      var idleMs = Date.now() - _editLockLastActivityAt;
      // Inactif depuis au moins le TTL du verrou (10 min, EDIT_LOCK_TTL_MS
      // dans js/actions.js — repli local si jamais indisponible, modal.js
      // étant chargé AVANT actions.js dans index.html) : au-delà, le verrou
      // n'est de toute façon plus protégé — n'importe qui d'autre peut déjà
      // éditer la même fiche sans être bloqué (voir
      // _checkProductEditLockBlocks). Laisser cette fenêtre ouverte
      // exposerait à un "Enregistrer" tardif qui écraserait silencieusement
      // ce qu'une autre personne aurait entre-temps sauvegardé (retour
      // utilisateur) — fermer proactivement SANS enregistrer plutôt que
      // risquer ça, et le dire clairement (popup bloquante plutôt qu'un
      // toast : l'utilisateur est absent au moment où ça se produit, un
      // toast aurait disparu avant son retour).
      var lockTtlMs = (typeof window.EDIT_LOCK_TTL_MS === 'number') ? window.EDIT_LOCK_TTL_MS : (10 * 60 * 1000);
      if(idleMs >= lockTtlMs){
        _stopEditLockHeartbeat();
        if(typeof closeModal === 'function') closeModal();
        if(typeof customAlert === 'function'){
          customAlert('Fermeture automatique', 'Cette fiche a été fermée pour cause d\'inactivité — vos modifications n\'ont pas été enregistrées.');
        } else if(typeof showToast === 'function'){
          showToast('Fiche fermée pour cause d\'inactivité — non enregistrée', 'warn', 6000);
        }
        return;
      }
      if(idleMs > EDIT_LOCK_IDLE_THRESHOLD_MS) return; // inactif : ne plus rafraîchir, laisser expirer normalement (mais fenêtre encore ouverte quelques minutes, voir ci-dessus)
      if(typeof window._refreshProductEditLock === 'function') window._refreshProductEditLock(_editLockHeartbeatId);
    }, EDIT_LOCK_HEARTBEAT_INTERVAL_MS);
  };

  function closeModal(){
    var wasEditingId = editingId;
    _stopEditLockHeartbeat();
    document.body.classList.remove('modal-open');
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(overlay, function(){ overlay.classList.remove('open'); });
    } else {
      overlay.classList.remove('open');
    }
    editingId = null;
    // Libère un éventuel verrou "en cours d'édition" (voir
    // _tryLockProductForEdit/_releaseProductEditLock dans js/actions.js).
    // Couvre Enregistrer (déjà nettoyé explicitement côté payload, donc sans
    // effet ici) ET Annuler/fermeture directe (seul cas réellement utile,
    // sinon le verrou resterait posé jusqu'à expiration de son TTL). Sans
    // danger si aucun verrou n'a été posé ici (mode proposition/révision,
    // "Ajouter un produit"…) : _releaseProductEditLock ne touche jamais un
    // verrou qui n'est pas le nôtre.
    if(wasEditingId && typeof window._releaseProductEditLock === 'function'){
      window._releaseProductEditLock(wasEditingId);
    }

    // Vider le formulaire ET oublier son "instantané d'origine" dès la
    // fermeture — sans ça, hasUnsavedInput() continuait de comparer les
    // valeurs (encore présentes dans le DOM, juste masquées) à l'ancien
    // instantané un peu plus bas, voyant à tort "encore des modifications
    // non enregistrées" au prochain contrôle (voir triggerExtensionExtraction
    // ci-dessous) alors que cette fenêtre est bel et bien fermée.
    resetForm();
    _formOriginalSnapshot = null;

    // Un import venant de l'extension Chrome ("Ajouter au Catalogue SPI")
    // peut être resté EN ATTENTE si cette fenêtre était encore ouverte avec
    // une saisie non enregistrée au moment où il est arrivé —
    // _extensionGuardBlocked() (js/init.js) le bloque alors sans le perdre
    // (les données restent dans localStorage, voir triggerExtensionExtraction),
    // mais jusqu'ici rien ne relançait automatiquement cet import une fois
    // la voie libre : il fallait fermer ET recliquer "Ajouter au Catalogue
    // SPI" une seconde fois, ou faire F5 (retour utilisateur : "j'importe un
    // produit puis un autre, ça me réimporte le premier, obligé de faire F5
    // pour importer le nouveau" — le F5 ne faisait en réalité que débloquer
    // cette fenêtre restée ouverte, sans jamais consommer l'import déjà en
    // attente tout seul). Délai après l'animation de fermeture (~260ms, voir
    // _closeOverlayAnimated) pour que _extensionGuardBlocked() évalue une
    // fenêtre réellement fermée. Vérifie qu'il y a VRAIMENT quelque chose en
    // attente AVANT d'appeler triggerExtensionExtraction — cette dernière
    // exécute _extensionGuardBlocked() dans tous les cas, qui ferme
    // silencieusement (_closeAllOverlays()) toute AUTRE fenêtre déjà rouverte
    // entre-temps (ex. "Modifier" sur un second produit, cliqué juste après
    // avoir fermé le premier) dès qu'elle n'a pas encore de saisie détectée
    // comme "non enregistrée" — un appel inconditionnel ici pouvait donc
    // fermer une fenêtre d'édition flambant neuve sans aucun rapport avec
    // l'extension, remettant editingId à null en plein milieu d'une saisie.
    try{
      if(localStorage.getItem('cat_pending_html') && typeof window.triggerExtensionExtraction === 'function'){
        setTimeout(window.triggerExtensionExtraction, 300);
      }
    }catch(e){}
  }

