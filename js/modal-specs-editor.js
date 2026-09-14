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
    // Aperçu Propriété/Valeur affiché directement dans le formulaire (voir
    // #specsSummaryTable, js/templates.js) — retour utilisateur (maquette
    // "Atelier Fiche Produit") : remplace le simple bouton opaque par un
    // vrai aperçu du contenu. "⋯" par ligne ouvre la même fenêtre d'édition
    // que le bouton d'en-tête (#btnOpenSpecs) plutôt que de dupliquer la
    // logique d'édition ligne par ligne ici.
    // Retour utilisateur : "je ne veux pas toucher à la taille du texte mais
    // plus ajouter un scroll" — #specsSummaryWrap (css/styles.css,
    // .specs-table-wrap) plafonne la hauteur et défile au lieu de rapetisser
    // le texte quand il y a beaucoup de caractéristiques ; c'est donc lui
    // qu'on affiche/masque désormais, la table elle-même reste toujours
    // affichée (display par défaut) à l'intérieur.
    var summaryWrap = document.getElementById('specsSummaryWrap');
    var summaryTable = document.getElementById('specsSummaryTable');
    var emptyHint = document.getElementById('specsEmptyHint');
    if(summaryWrap && summaryTable && emptyHint){
      var filledRows = _specsRows.filter(function(r){ return (r.key||'').trim(); });
      if(filledRows.length){
        summaryWrap.style.display = '';
        emptyHint.style.display = 'none';
        // Retour utilisateur : "pour utiliser les 3 petits points de la
        // caractéristique faudrait pouvoir la modifier ou même la
        // supprimer sans avoir besoin d'ouvrir la fenêtre de
        // caractéristique technique" — "⋯" ouvrait jusqu'ici TOUJOURS la
        // grande fenêtre dédiée (#specsOverlay), quelle que soit la ligne
        // cliquée (aucun data-ri n'était même posé). Ouvre désormais un
        // petit menu "Modifier"/"Supprimer" juste sous "⋯", qui agit
        // directement sur CETTE ligne (_specsShowRowMenu ci-dessous) — la
        // grande fenêtre reste disponible via "Caractéristiques (N)" pour
        // une édition plus poussée (réordonner, tout supprimer…), mais
        // n'est plus un passage obligé pour une simple retouche.
        // indexOf (égalité par référence) plutôt qu'un compteur : filledRows
        // est un SOUS-ENSEMBLE de _specsRows (lignes vides exclues), son
        // propre index ne correspond donc pas à l'index réel dans
        // _specsRows dont dépendent _specsRows.splice()/l'édition.
        // Retour utilisateur : "fait en sorte que ça respecte le style déjà
        // en place" — le "⋯" est maintenant un vrai .kebab-btn (même bouton
        // rond que le configurateur d'armoire/liste utilisateurs, voir
        // css/styles.css) plutôt qu'un simple caractère "⋯" en texte brut.
        summaryTable.innerHTML = '<tr><th>Propriété</th><th>Valeur</th><th></th></tr>'
          + filledRows.map(function(row){
              var ri = _specsRows.indexOf(row);
              return '<tr data-ri="'+ri+'"><td>'+escapeHtml(row.key||'')+'</td><td>'+escapeHtml(row.value||'')+'</td>'
                + '<td class="more"><button type="button" class="kebab-btn" data-ri="'+ri+'" title="Plus d\'actions" aria-haspopup="true" aria-expanded="false"><i class="ti ti-dots" aria-hidden="true"></i></button></td></tr>';
            }).join('');
        summaryTable.querySelectorAll('td.more .kebab-btn').forEach(function(btn){
          btn.addEventListener('click', function(){
            _specsShowRowMenu(btn, parseInt(btn.getAttribute('data-ri'), 10));
          });
        });
      } else {
        summaryWrap.style.display = 'none';
        emptyHint.style.display = '';
      }
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

  // Menu "Modifier"/"Supprimer" ouvert par le "⋯" d'une ligne du tableau
  // récapitulatif (#specsSummaryTable) — voir le retour utilisateur au-dessus
  // de son appel dans _specsRenderRows.
  // Retour utilisateur : "fait en sorte que ça respecte le style déjà en
  // place" — repris en .kebab-menu (css/styles.css), le même menu ⋯ que le
  // configurateur d'armoire et la liste des utilisateurs (icônes, rouge
  // #991B1B pour "Supprimer"…), au lieu d'un style improvisé ici. Seul le
  // POSITIONNEMENT reste géré à la main (position:fixed, ancré sous le "⋯"
  // cliqué) plutôt que via _bindKebabMenuOn/.kebab-btn.open habituel
  // (js/popup.js) — même exception déjà faite pour #vmInfoMenu (voir le
  // commentaire sur .kebab-btn, css/styles.css) : ce menu doit rester dans
  // les limites de l'écran même pour une ligne tout en bas du tableau qui
  // défile (.specs-table-wrap), un simple .kebab-menu positionné en absolu
  // (le mécanisme par défaut) aurait été coupé par l'overflow de ce
  // conteneur qui défile.
  function _specsShowRowMenu(anchorEl, ri){
    var existing = document.getElementById('_specsRowMenu');
    if(existing) existing.remove();
    var menu = document.createElement('div');
    menu.id = '_specsRowMenu';
    menu.className = 'kebab-menu open';
    menu.setAttribute('role', 'menu');
    menu.style.position = 'fixed';
    // Retour utilisateur : "lorsque je clique sur les 3 petits points le
    // kebab ne s'affiche pas" — .kebab-menu (css/styles.css) ne fixe
    // volontairement aucun z-index : dans son usage habituel, le menu est
    // un simple sibling positionné en absolu DANS la fenêtre qui le
    // contient (armoire/utilisateurs), donc déjà au-dessus de tout par la
    // seule position dans le DOM, sans avoir besoin d'un z-index. Ici, le
    // menu est ajouté à document.body (voir commentaire au-dessus), donc
    // hors de la pile de #modalOverlay (z-index 500, voir css/styles.css) —
    // sans z-index explicite (donc 0/auto), il s'affichait bel et bien
    // (display:block confirmé) mais restait rendu DERRIÈRE la fenêtre de
    // modification, invisible. --z-modal-top (la plus haute valeur utilisée
    // dans l'appli, voir css/styles.css) + une marge, pour rester au-dessus
    // de n'importe quelle fenêtre d'où ce menu pourrait un jour être ouvert.
    menu.style.zIndex = 10700;
    menu.innerHTML =
      '<button type="button" data-action="edit"><i class="ti ti-pencil" aria-hidden="true"></i> Modifier</button>' +
      '<button type="button" data-action="delete" class="kebab-menu-danger"><i class="ti ti-trash" aria-hidden="true"></i> Supprimer</button>';
    document.body.appendChild(menu);

    anchorEl.classList.add('open');
    anchorEl.setAttribute('aria-expanded', 'true');

    var rect = anchorEl.getBoundingClientRect();
    var menuW = menu.offsetWidth, menuH = menu.offsetHeight;
    var left = Math.min(rect.right - menuW, window.innerWidth - menuW - 8);
    var top = rect.bottom + 4;
    if(top + menuH > window.innerHeight - 8) top = rect.top - menuH - 4; // pas assez de place en dessous : au-dessus
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';

    function closeMenu(){
      if(menu.parentNode) menu.parentNode.removeChild(menu);
      anchorEl.classList.remove('open');
      anchorEl.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onDocClick, true);
    }
    function onDocClick(e){ if(!menu.contains(e.target)) closeMenu(); }
    // capture + micro-délai : le click qui a ouvert ce menu (sur le "⋯")
    // ne doit pas être le MÊME click qui le referme aussitôt via ce
    // listener document-wide posé après coup.
    setTimeout(function(){ document.addEventListener('click', onDocClick, true); }, 0);

    menu.querySelector('[data-action="edit"]').addEventListener('click', function(){
      closeMenu();
      _specsStartInlineEdit(ri);
    });
    menu.querySelector('[data-action="delete"]').addEventListener('click', function(){
      closeMenu();
      _specsRows.splice(ri, 1);
      _specsRenderRows();
    });
  }

  // Transforme la ligne `ri` du tableau récapitulatif en formulaire
  // d'édition directe (Nom + Valeur), sans passer par la grande fenêtre
  // dédiée (#specsOverlay) — voir le retour utilisateur au-dessus de
  // _specsShowRowMenu. ✓ valide, ✕ ou Échap annule ; Entrée dans "Nom"
  // passe à "Valeur" (même confort que la grande fenêtre), Entrée dans
  // "Valeur" valide (Maj+Entrée pour une valeur multi-lignes).
  function _specsStartInlineEdit(ri){
    var summaryTable = document.getElementById('specsSummaryTable');
    var tr = summaryTable && summaryTable.querySelector('tr[data-ri="'+ri+'"]');
    var row = _specsRows[ri];
    if(!tr || !row) return;
    tr.innerHTML =
      '<td colspan="2" style="padding:6px 8px;">' +
        '<input type="text" class="specs-inline-key" value="'+escapeHtml(row.key||'')+'" placeholder="Nom" autocomplete="off" style="width:100%;box-sizing:border-box;margin-bottom:5px;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font-size:12.5px;font-family:inherit;">' +
        '<textarea class="specs-inline-value" rows="1" placeholder="Valeur" style="width:100%;box-sizing:border-box;padding:6px 8px;border:1.5px solid var(--line);border-radius:6px;background:var(--paper);color:var(--ink);font-size:12.5px;font-family:inherit;resize:vertical;min-height:32px;">'+escapeHtml(row.value||'')+'</textarea>' +
      '</td>' +
      '<td style="vertical-align:top;white-space:nowrap;padding:6px 4px;">' +
        '<button type="button" class="specs-inline-save" title="Enregistrer" aria-label="Enregistrer" style="width:26px;height:26px;border:none;background:none;color:#15803d;cursor:pointer;padding:0;"><i class="ti ti-check" aria-hidden="true"></i></button>' +
        '<button type="button" class="specs-inline-cancel" title="Annuler" aria-label="Annuler" style="width:26px;height:26px;border:none;background:none;color:var(--ink-soft);cursor:pointer;padding:0;"><i class="ti ti-x" aria-hidden="true"></i></button>' +
      '</td>';
    var keyEl = tr.querySelector('.specs-inline-key');
    var valEl = tr.querySelector('.specs-inline-value');
    function commit(){
      row.key = keyEl.value;
      row.value = valEl.value;
      _specsRenderRows();
    }
    function cancel(){ _specsRenderRows(); }
    tr.querySelector('.specs-inline-save').addEventListener('click', commit);
    tr.querySelector('.specs-inline-cancel').addEventListener('click', cancel);
    keyEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); valEl.focus(); }
      else if(e.key === 'Escape'){ cancel(); }
    });
    valEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); commit(); }
      else if(e.key === 'Escape'){ cancel(); }
    });
    keyEl.focus();
    keyEl.select();
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
    // Le déverrouillage ci-dessus réactive TOUS les champs sans distinction
    // — réapplique le verrouillage de la référence s'il s'agit de la revue
    // d'une modification sur un produit existant (voir _openReviewModal,
    // js/modal-request-review.js), qui doit rester grisée même en mode
    // "Modifier" de la revue.
    if(window._reviewMode && typeof window._setFRefLocked === 'function'){
      window._setFRefLocked(locked || !!window._reviewIsExistingProduct);
    }
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

