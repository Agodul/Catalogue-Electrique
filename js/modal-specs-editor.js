  // ── Logique caractéristiques techniques (clé/valeur libres) ─────
  var specsOverlay   = document.getElementById('specsOverlay');
  var specsRowsEl    = document.getElementById('specsRows');
  var btnOpenSpecs   = document.getElementById('btnOpenSpecs');
  var btnOpenSpecsLabel = document.getElementById('btnOpenSpecsLabel');
  var specsCloseBtn  = document.getElementById('specsCloseBtn');
  var btnAddSpecRow  = document.getElementById('btnAddSpecRow');
  var specsDeleteAllBtn = document.getElementById('specsDeleteAllBtn');

  function _specsRenderRows(){
    if(btnOpenSpecsLabel){
      var count = _specsRows.filter(function(r){ return (r.key||'').trim(); }).length;
      btnOpenSpecsLabel.textContent = count ? ('Caractéristiques (' + count + ')') : 'Ajouter des caractéristiques';
    }
    if(!specsRowsEl) return;
    // Grille (minmax(0,1fr) sur les 2 colonnes texte + 32px fixe pour le
    // bouton supprimer) au lieu de flex:1 sur des <input> — sans le
    // minmax(0,...), un <input> refuse de rétrécir sous sa largeur de
    // contenu par défaut, ce qui poussait le bouton supprimer hors de
    // l'écran sur mobile (retour utilisateur, bug confirmé à 375px).
    var colHeaders = document.getElementById('specsColHeaders');
    if(colHeaders) colHeaders.style.display = _specsRows.length ? 'grid' : 'none';
    specsRowsEl.innerHTML = _specsRows.map(function(row, ri){
      return '<div class="spec-row" data-ri="'+ri+'" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 32px;gap:8px;align-items:start;">'
        + '  <input type="text" class="spec-key" data-ri="'+ri+'" placeholder="Nom (ex: Entrées)" autocomplete="off" value="'+escapeHtml(row.key||'')+'" style="min-width:0;padding:7px 9px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font-size:12.5px;">'
        // textarea (pas input) : permet le retour à la ligne (Entrée) dans la
        // valeur — utile pour une caractéristique qui regroupe plusieurs
        // sous-valeurs (ex. une puissance différente par tension) qui
        // formaient sinon un seul long paragraphe illisible d'un bloc
        // (retour utilisateur, capture à l'appui). rows="1" + resize
        // vertical : reste compact par défaut, s'agrandit à la demande.
        + '  <textarea class="spec-value" data-ri="'+ri+'" placeholder="Valeur (ex: 8) — Entrée pour un retour à la ligne" rows="1" style="min-width:0;padding:7px 9px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font-size:12.5px;font-family:inherit;resize:vertical;min-height:34px;">'+escapeHtml(row.value||'')+'</textarea>'
        + '  <button type="button" class="spec-row-del" data-ri="'+ri+'" aria-label="Supprimer" style="width:32px;height:32px;flex-shrink:0;background:none;border:1.5px solid var(--line);border-radius:7px;color:var(--ink-soft);cursor:pointer;font-size:13px;padding:0;display:flex;align-items:center;justify-content:center;">✕</button>'
        + '</div>';
    }).join('');
    specsRowsEl.querySelectorAll('.spec-key').forEach(function(input){
      input.addEventListener('input', function(){
        _specsRows[parseInt(input.getAttribute('data-ri'), 10)].key = input.value;
      });
      // Entrée dans "Nom" → passe directement au champ "Valeur" de la même
      // ligne, sans toucher souris/Tab (retour utilisateur : accélérer la
      // saisie répétitive de caractéristiques techniques).
      input.addEventListener('keydown', function(e){
        if(e.key !== 'Enter') return;
        e.preventDefault();
        var ri = input.getAttribute('data-ri');
        var valueEl = specsRowsEl.querySelector('.spec-value[data-ri="'+ri+'"]');
        if(valueEl) valueEl.focus();
      });
    });
    specsRowsEl.querySelectorAll('.spec-value').forEach(function(input){
      input.addEventListener('input', function(){
        _specsRows[parseInt(input.getAttribute('data-ri'), 10)].value = input.value;
      });
      // Tab depuis "Valeur" de la DERNIÈRE ligne → ajoute une nouvelle
      // ligne et y place le focus, au lieu de devoir cliquer "+ Ajouter une
      // caractéristique" à chaque ligne (retour utilisateur : améliorer la
      // saisie des caractéristiques techniques). Entrée reste réservée au
      // retour à la ligne DANS la valeur (déjà en place), donc seul Tab
      // (sans Shift, qui irait en arrière) déclenche l'ajout ici.
      input.addEventListener('keydown', function(e){
        if(e.key !== 'Tab' || e.shiftKey) return;
        var ri = parseInt(input.getAttribute('data-ri'), 10);
        if(ri !== _specsRows.length - 1) return; // pas la dernière ligne : Tab normal vers ✕
        e.preventDefault();
        _specsAddRowAndFocus();
      });
    });
    specsRowsEl.querySelectorAll('.spec-row-del').forEach(function(btn){
      btn.addEventListener('click', function(){
        _specsRows.splice(parseInt(btn.getAttribute('data-ri'), 10), 1);
        _specsRenderRows();
      });
    });
  }

  function _specsAddRowAndFocus(){
    _specsRows.push({ key: '', value: '' });
    _specsRenderRows();
    var newKeyEl = specsRowsEl.querySelector('.spec-key[data-ri="'+(_specsRows.length-1)+'"]');
    if(newKeyEl) newKeyEl.focus();
  }

  if(btnAddSpecRow){
    btnAddSpecRow.addEventListener('click', function(){
      _specsAddRowAndFocus();
    });
  }
  // "Tout supprimer" (retour utilisateur) — vide _specsRows d'un coup au
  // lieu de devoir cliquer la croix ✕ ligne par ligne. Confirmation
  // obligatoire (action destructive, comme la suppression d'un produit) ;
  // seul le TABLEAU en mémoire est vidé ici — rien n'est enregistré tant que
  // "Enregistrer" (specsSaveBtn) n'est pas cliqué, donc "Annuler"/la croix ✕
  // de la fenêtre restent une porte de sortie normale en cas d'erreur.
  if(specsDeleteAllBtn){
    specsDeleteAllBtn.addEventListener('click', async function(){
      if(!_specsRows.length) return;
      var confirmed = typeof customConfirm === 'function'
        ? await customConfirm('Tout supprimer ?', 'Les ' + _specsRows.length + ' caractéristique(s) technique(s) de cette fiche seront retirées. Cliquez "Enregistrer" pour confirmer définitivement, ou "Annuler" pour revenir en arrière.', { okLabel: 'Tout supprimer', danger: true })
        : confirm('Supprimer toutes les caractéristiques ?');
      if(!confirmed) return;
      _specsRows = [];
      _specsRenderRows();
    });
  }
  // Snapshot pris à l'ouverture — sert à savoir si la croix doit demander
  // confirmation avant de fermer (même logique que "Annuler la saisie" sur
  // le formulaire produit — retour utilisateur).
  var _specsSnapshotOnOpen = null;
  if(btnOpenSpecs){
    btnOpenSpecs.addEventListener('click', function(){
      _specsSnapshotOnOpen = JSON.stringify(_specsRows);
      if(specsOverlay){
        specsOverlay.style.display = 'flex';
        document.body.classList.add('modal-open');
      }
    });
  }
  function _specsCloseModal(){
    _specsRenderRows(); // met à jour le compteur sur le bouton avant de fermer
    if(specsOverlay){
      document.body.classList.remove('modal-open');
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(specsOverlay, function(){ specsOverlay.style.display = 'none'; });
      } else {
        specsOverlay.style.display = 'none';
      }
    }
  }
  // Exposée en global : appelée par _authCloseSensitiveUI (js/auth.js) pour
  // fermer aussi cette fenêtre lors d'une déconnexion (forcée ou manuelle).
  window._specsCloseModal = _specsCloseModal;
  function _specsHasChanges(){
    return _specsSnapshotOnOpen !== null && JSON.stringify(_specsRows) !== _specsSnapshotOnOpen;
  }
  function _specsRequestClose(){
    // Même garde-fou anti-empilement que requestCloseModal() : ne pas
    // recréer une confirmation si une est déjà affichée.
    if(document.getElementById('_specsDiscardPopup')) return;
    if(!_specsHasChanges()){ _specsCloseModal(); return; }

    var popup = document.createElement('div');
    popup.id = '_specsDiscardPopup';
    popup.style.cssText =
      'position:fixed;inset:0;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10650;';
    popup.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">' +
        '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">Annuler la saisie</div>' +
        '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Les caractéristiques modifiées seront perdues.</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' +
          '<button id="_specsKeepEditing" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Continuer la saisie</strong> — revenir aux caractéristiques</button>' +
          '<button id="_specsDiscardChanges" style="padding:10px 14px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Annuler la saisie</strong> — fermer sans enregistrer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(popup);

    popup.querySelector('#_specsKeepEditing').addEventListener('click', function(){
      document.body.removeChild(popup);
    });
    popup.querySelector('#_specsDiscardChanges').addEventListener('click', function(){
      document.body.removeChild(popup);
      _specsRows = JSON.parse(_specsSnapshotOnOpen);
      _specsCloseModal();
    });
  }
  if(specsCloseBtn) specsCloseBtn.addEventListener('click', _specsRequestClose);
  // Bouton "Enregistrer" : ferme directement, sans demander — c'est
  // l'action explicite de garder les changements (contrairement à la
  // croix, qui demande confirmation s'il y a des modifications non
  // enregistrées).
  var specsSaveBtn = document.getElementById('specsSaveBtn');
  if(specsSaveBtn) specsSaveBtn.addEventListener('click', _specsCloseModal);

  // Exposer _specsRows (converties en objet {clé: valeur}) pour actions.js
  window._getSpecsObj = function(){
    var obj = {};
    _specsRows.forEach(function(row){
      var k = (row.key || '').trim();
      if(k) obj[k] = row.value || '';
    });
    return obj;
  };

  // Exposer openModal globalement pour requests.js
  window._openModal = openModal;

  // Mode proposition : ouvrir la modale avec un flag pour que btnSave envoie une requête
  window._openProposeModal = function(id){
    window._proposeMode = true;
    window._proposeOriginal = id ? (products.find(function(p){ return p.id===id; }) || null) : null;
    openModal(id || null);
    // Changer le titre et le bouton
    var title = document.getElementById('modalTitle');
    var btnSave = document.getElementById('btnSave');
    if(title) title.textContent = id ? 'Proposer une modification' : 'Proposer un produit';
    if(btnSave) btnSave.textContent = 'Envoyer la demande';
  };

  // Mode révision de demande (admin) : ouvre la modale standard "Modifier le
  // produit", pré-remplie avec les données soumises, pour permettre de tout
  // modifier avant de valider. `item` est l'entrée de la file de demandes.
  // Verrouille/déverrouille le formulaire de revue d'une demande — fusionne
  // ce qui était deux fenêtres séparées (résumé en lecture seule, puis un
  // "Modifier" ouvrant le formulaire complet ailleurs) en une seule : on
  // reste sur la même fenêtre, seul l'état verrouillé change (retour
  // utilisateur). Cible tout ce qui est interactif dans le corps du
  // formulaire et la section documents — pas l'entête/pied de page, gérés
  // séparément par _reviewSetLocked ci-dessous.
  function _reviewFormFields(){
    // Scopé à #modalOverlay précisément (pas juste ".modal-body", classe
    // générique réutilisée par d'autres fenêtres — ex. "Signaler un bug" —
    // qui se retrouveraient sinon avec des champs restés désactivés après
    // la fermeture de CETTE fenêtre-ci).
    return document.querySelectorAll('#modalOverlay .modal-body input, #modalOverlay .modal-body textarea, #modalOverlay .modal-body select, #modalOverlay .modal-body button, #modalPdfSection input, #modalPdfSection button, #modalPdfSection label');
  }
  function _reviewSetLocked(locked){
    window._reviewLocked = !!locked;
    _reviewFormFields().forEach(function(el){
      if(locked) el.setAttribute('disabled', 'disabled');
      else el.removeAttribute('disabled');
    });
    var btnCancelEl        = document.getElementById('btnCancel');
    var btnSaveEl          = document.getElementById('btnSave');
    var btnReviewRefuseEl  = document.getElementById('btnReviewRefuse');
    var btnReviewUnlockEl  = document.getElementById('btnReviewUnlock');
    var btnReviewAcceptEl  = document.getElementById('btnReviewAccept');
    if(btnCancelEl)       btnCancelEl.style.display       = locked ? 'none' : '';
    if(btnSaveEl)          btnSaveEl.style.display        = locked ? 'none' : '';
    if(btnReviewRefuseEl)  btnReviewRefuseEl.style.display = locked ? '' : 'none';
    if(btnReviewUnlockEl)  btnReviewUnlockEl.style.display = locked ? '' : 'none';
    if(btnReviewAcceptEl)  btnReviewAcceptEl.style.display = locked ? '' : 'none';
  }

