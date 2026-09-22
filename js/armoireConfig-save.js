function _armoireVerifyFolderPersisted(list, name, expectedFolder){
  if(!expectedFolder) return; // rien à vérifier si aucun dossier saisi
  var saved = list.find(function(e){ return e.name === name; });
  if(saved && (saved.folder || '').trim() !== expectedFolder){
    if(typeof showToast === 'function'){
      showToast('« ' + name + ' » enregistré, mais le serveur n\'a pas conservé le dossier « ' + expectedFolder + ' » — limitation côté serveur.', 'warn', 6000);
    }
    console.warn('_armoireVerifyFolderPersisted: dossier non conservé par le serveur pour', name, '— attendu:', expectedFolder, 'reçu:', saved && saved.folder);
  }
}

function _armoireExistingFolderNames(list){
  var seen = {};
  var out = [];
  list.forEach(function(entry){
    var f = (entry.folder || '').trim();
    if(f && !seen[f]){ seen[f] = true; out.push(f); }
  });
  return out.sort(function(a, b){ return a.localeCompare(b, 'fr'); });
}

// Popup à deux champs (Nom + Dossier facultatif) pour l'enregistrement d'un
// bloc/d'une configuration — retour utilisateur : ranger par dossier, en
// texte libre comme le champ Famille des produits (autocomplete sur les
// dossiers déjà utilisés, mais on peut aussi en taper un nouveau). Calqué
// sur customPrompt (js/popup.js) pour rester visuellement cohérent, mais
// à deux champs, donc pas réutilisable telle quelle.
function _armoirePromptNameAndFolder(title, nameMessage, existingFolders, defaults, okLabel){
  defaults = defaults || {};
  okLabel = okLabel || 'Enregistrer';
  return new Promise(function(resolve){
    var datalistId = '_armoireFolderDatalist';
    var datalistHtml = '<datalist id="' + datalistId + '">' + existingFolders.map(function(f){
      return '<option value="' + escapeHtml(f) + '"></option>';
    }).join('') + '</datalist>';
    var safeDefaultName = defaults.name ? String(defaults.name).replace(/"/g, '&quot;') : '';
    var safeDefaultFolder = defaults.folder ? String(defaults.folder).replace(/"/g, '&quot;') : '';
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">' + escapeHtml(title) + '</div>' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;">NOM</label>' +
      '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px;">' + escapeHtml(nameMessage) + '</div>' +
      '<input id="_armoireNameInput" type="text" value="' + safeDefaultName + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--line,#C9D0D8);font-size:14px;font-family:inherit;margin-bottom:14px;" />' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#64748b;margin-bottom:4px;">DOSSIER (facultatif)</label>' +
      '<input id="_armoireFolderInput" type="text" value="' + safeDefaultFolder + '" list="' + datalistId + '" placeholder="ex. Automates, Sécurité…" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--line,#C9D0D8);font-size:14px;font-family:inherit;margin-bottom:20px;" />' +
      datalistHtml +
      '<div style="display:flex;gap:8px;">' +
        '<button id="_popupCancel" style="flex:1;padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>' +
        '<button id="_popupOk" style="flex:1;padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:var(--copper,#194093);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">' + escapeHtml(okLabel) + '</button>' +
      '</div>'
    );
    var nameInput   = overlay.querySelector('#_armoireNameInput');
    var folderInput = overlay.querySelector('#_armoireFolderInput');
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    function submit(){ close({ name: nameInput.value, folder: folderInput.value }); }
    overlay.querySelector('#_popupOk').addEventListener('click', submit);
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(null); });
    // Pas de fermeture au clic en dehors de la fenêtre (retour utilisateur :
    // un clic à côté annulait silencieusement l'enregistrement, en faisant
    // perdre le nom déjà tapé) — seuls les boutons et Échap ferment cette
    // popup désormais.
    nameInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); folderInput.focus(); }
      if(e.key === 'Escape'){ e.preventDefault(); close(null); }
    });
    folderInput.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); submit(); }
      if(e.key === 'Escape'){ e.preventDefault(); close(null); }
    });
    setTimeout(function(){ nameInput.focus(); nameInput.select(); }, 30);
  });
}

// Écrase l'entrée d'origine par le nouveau contenu : POST le nouveau
// d'abord, DELETE l'ancien SEULEMENT si le POST a réussi (pour ne jamais
// perdre l'original si l'enregistrement du nouveau contenu échoue). L'API
// n'expose pas de PUT/PATCH — un DELETE+POST est le seul moyen de "mettre à
// jour" une entrée sans dupliquer.
function _armoireReplaceEntry(basePath, oldId, body){
  return _armoireApi(basePath, { method: 'POST', body: JSON.stringify(body) })
    .then(function(created){
      // Retirée dès MAINTENANT (pas seulement si le DELETE ci-dessous
      // réussit) — voir _armoireRetiredEntryIds plus haut : qu'il réussisse,
      // échoue, ou tarde à se répercuter côté serveur, cette ancienne entrée
      // ne doit plus jamais réapparaître pour le reste de cette session.
      _armoireMarkEntryRetired(basePath, oldId);
      return _armoireApi(basePath + '/' + encodeURIComponent(oldId), { method: 'DELETE' })
        .catch(function(e){ console.warn('_armoireReplaceEntry: ancienne entrée non supprimée:', e && e.message); })
        .then(function(){ return created; });
    });
}

// Popup à 2 boutons "Bloc" / "Configuration" — remplace les deux anciens
// boutons "Enregistrer comme bloc"/"Enregistrer la configuration" par un
// seul bouton "Enregistrer" (retour utilisateur : fusionner pour libérer
// une place dans la rangée de boutons, voir _armoireSaveChoice ci-dessous).
function _armoirePromptSaveKind(){
  return new Promise(function(resolve){
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Enregistrer comme…</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Un bloc est réutilisable dans d\'autres configurations ; une configuration est l\'armoire complète telle quelle.</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<button id="_armoireKindBlock" style="padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:#fff;color:var(--copper-deep,#194093);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;"><i class="ti ti-package" aria-hidden="true"></i> Bloc réutilisable</button>' +
        '<button id="_armoireKindConfig" style="padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:var(--copper,#194093);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;"><i class="ti ti-device-floppy" aria-hidden="true"></i> Configuration complète</button>' +
        '<button id="_popupCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>' +
      '</div>'
    );
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    overlay.querySelector('#_armoireKindBlock').addEventListener('click', function(){ close('block'); });
    overlay.querySelector('#_armoireKindConfig').addEventListener('click', function(){ close('config'); });
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(null); });
    // Pas de fermeture au clic en dehors de la fenêtre (retour utilisateur :
    // un clic à côté annulait silencieusement l'enregistrement) — seuls les
    // boutons ci-dessus et Échap permettent de fermer cette popup.
    document.addEventListener('keydown', function onKey(e){
      if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(null); }
    });
  });
}

// Bouton "Enregistrer" fusionné — demande le type SEULEMENT quand c'est
// ambigu (nouvel enregistrement) ; en édition, le type est déjà fixé par
// l'entrée en cours d'édition, donc pas de question inutile (voir
// _armoireUpdateEditingBanner, qui adapte déjà le libellé du bouton).
async function _armoireSaveChoice(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'enregistrer.', 'warn');
    return;
  }
  if(_armoireEditingEntry && _armoireEditingEntry.kind === 'block'){ _armoireSaveBlock(); return; }
  if(_armoireEditingEntry && _armoireEditingEntry.kind === 'config'){ _armoireSaveConfig(); return; }
  var kind = await _armoirePromptSaveKind();
  if(kind === 'block') _armoireSaveBlock();
  else if(kind === 'config') _armoireSaveConfig();
}

async function _armoireSaveBlock(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'enregistrer un bloc.', 'warn');
    return;
  }
  var editing = _armoireEditingEntry && _armoireEditingEntry.kind === 'block' ? _armoireEditingEntry : null;
  var result = await _armoirePromptNameAndFolder(
    editing ? 'Modifier le bloc' : 'Enregistrer comme bloc',
    'Nom du bloc (ex. « Bloc PLC standard ») :',
    _armoireExistingFolderNames(_armoireBlocks),
    editing ? { name: editing.name, folder: editing.folder } : null,
    editing ? 'Mettre à jour' : 'Enregistrer'
  );
  if(!result || !result.name || !result.name.trim()) return;
  var name = result.name.trim();
  var folder = (result.folder || '').trim();
  var body = { name: name, folder: folder, items: _armoireDraft };
  var apiCall = editing
    ? _armoireReplaceEntry('/configBlocks', editing.id, body)
    : _armoireApi('/configBlocks', { method: 'POST', body: JSON.stringify(body) });
  apiCall
    .then(function(){
      if(typeof showToast === 'function') showToast('Bloc « ' + name + ' » ' + (editing ? 'mis à jour' : 'enregistré') + ' ✓', 'ok');
      _armoireEditingEntry = null;
      // En édition, restaurer la configuration en cours mise de côté (voir
      // _armoireStartEditEntry) — jamais perdue. Hors édition, comportement
      // inchangé : le brouillon se vide après avoir enregistré un bloc.
      if(editing){ _armoireDraft = _armoireDraftBackup || []; _armoireDraftBackup = null; }
      else { _armoireDraft = []; }
      _armoireRenderDraft();
      _armoireUpdateEditingBanner();
      _armoireFetchBlocks().then(function(){
        _armoireVerifyFolderPersisted(_armoireBlocks, name, folder);
      });
    })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireSaveConfig(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'enregistrer la configuration.', 'warn');
    return;
  }
  var editing = _armoireEditingEntry && _armoireEditingEntry.kind === 'config' ? _armoireEditingEntry : null;
  var result = await _armoirePromptNameAndFolder(
    editing ? 'Modifier la configuration' : 'Enregistrer la configuration',
    'Nom de la configuration (ex. « Armoire PLC 20E/16S ») :',
    _armoireExistingFolderNames(_armoireSavedConfigs),
    editing ? { name: editing.name, folder: editing.folder } : null,
    editing ? 'Mettre à jour' : 'Enregistrer'
  );
  if(!result || !result.name || !result.name.trim()) return;
  var name = result.name.trim();
  var folder = (result.folder || '').trim();
  var body = { name: name, folder: folder, items: _armoireDraft };
  var apiCall = editing
    ? _armoireReplaceEntry('/configSavedConfigs', editing.id, body)
    : _armoireApi('/configSavedConfigs', { method: 'POST', body: JSON.stringify(body) });
  apiCall
    .then(function(){
      if(typeof showToast === 'function') showToast('Configuration « ' + name + ' » ' + (editing ? 'mise à jour' : 'enregistrée') + ' ✓', 'ok');
      _armoireEditingEntry = null;
      // En édition, restaurer la configuration en cours mise de côté (voir
      // _armoireStartEditEntry) — jamais perdue. Hors édition, vider le
      // brouillon (retour utilisateur : même comportement qu'un bloc, pas
      // besoin de "Vider" à la main après avoir enregistré).
      if(editing){ _armoireDraft = _armoireDraftBackup || []; _armoireDraftBackup = null; }
      else { _armoireDraft = []; }
      _armoireRenderDraft();
      _armoireUpdateEditingBanner();
      _armoireFetchSavedConfigs().then(function(){
        _armoireVerifyFolderPersisted(_armoireSavedConfigs, name, folder);
      });
    })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireDeleteBlock(id){
  // Le bouton ✕ est déjà masqué sans ce droit (voir _armoireListItemHtml),
  // mais cette fonction reste techniquement accessible directement (console,
  // autre appel) — vérifier ici aussi plutôt que de se reposer uniquement
  // sur l'UI (même garde que deleteProduct dans js/render-card-grid.js).
  var _perms = window._userPerms || {};
  if(!(_perms.canDelete || _perms.isAdmin)){
    if(typeof showToast === 'function') showToast('Droit de suppression requis', 'err', 3000);
    return;
  }
  // Retour utilisateur : "pour tout ce qui est suppression de produit etc.
  // faudrait préciser que c'est irréversible" — ce popup n'avait auparavant
  // aucun message du tout (chaîne vide), rien n'indiquait que c'était
  // définitif.
  if(!(await customConfirm('Supprimer ce bloc ?', 'Ce bloc sera supprimé définitivement. Cette opération est irréversible.', { okLabel: 'Supprimer', danger: true }))) return;
  _armoireMarkEntryRetired('/configBlocks', id);
  _armoireApi('/configBlocks/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(){ _armoireFetchBlocks(); })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireDeleteSavedConfig(id){
  var _perms = window._userPerms || {};
  if(!(_perms.canDelete || _perms.isAdmin)){
    if(typeof showToast === 'function') showToast('Droit de suppression requis', 'err', 3000);
    return;
  }
  if(!(await customConfirm('Supprimer cette configuration ?', 'Cette configuration sera supprimée définitivement. Cette opération est irréversible.', { okLabel: 'Supprimer', danger: true }))) return;
  _armoireMarkEntryRetired('/configSavedConfigs', id);
  _armoireApi('/configSavedConfigs/' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function(){ _armoireFetchSavedConfigs(); })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

async function _armoireLoadSavedConfig(config){
  if(_armoireDraft.length && !(await customConfirm('Remplacer la configuration en cours ?', 'Remplacer la configuration en cours par « ' + escapeHtml(config.name) + ' » ?', { okLabel: 'Remplacer' }))) return;
  _armoireDraft = config.items.map(function(it){ return { ref: it.ref, qty: it.qty || 1 }; });
  _armoireRenderDraft();
}

// ── Modifier un bloc/une configuration existant ──────────────────────────
// Met de côté _armoireDraft (jamais vidé/perdu, voir _armoireDraftBackup)
// et le remplace TEMPORAIREMENT par le contenu de l'entrée éditée, pour
// réutiliser telle quelle toute l'UI de composition (recherche, +/-,
// retrait) — restauré par _armoireCancelEditEntry ou à la fin de
// _armoireSaveBlock/_armoireSaveConfig. Retour utilisateur : éditer un
// bloc/une config ne doit jamais obliger à supprimer/vider une
// configuration en cours de création.
async function _armoireStartEditEntry(entry, kind){
  _armoireDraftBackup = _armoireDraft;
  _armoireDraft = entry.items.map(function(it){ return { ref: it.ref, qty: it.qty || 1 }; });
  _armoireEditingEntry = { id: entry.id, kind: kind, name: entry.name, folder: entry.folder || '' };
  _armoireRenderDraft();
  _armoireUpdateEditingBanner();
  // Fermer le tiroir Blocs/Configurations s'il est ouvert (mobile) pour
  // laisser place à la zone de composition, puis y basculer.
  var drawerClose = document.getElementById('armoireBlocksDrawerClose');
  if(drawerClose && drawerClose.offsetParent !== null) drawerClose.click();
  if(typeof _armoireSetMobileView === 'function') _armoireSetMobileView('draft');
}

// Restaure la configuration en cours telle qu'elle était avant l'édition —
// aucune donnée de l'utilisateur n'est jamais perdue, qu'il annule
// explicitement ou qu'il vide/ferme pendant l'édition.
function _armoireCancelEditEntry(){
  _armoireEditingEntry = null;
  _armoireDraft = _armoireDraftBackup || [];
  _armoireDraftBackup = null;
  _armoireRenderDraft();
  _armoireUpdateEditingBanner();
}

function _armoireUpdateEditingBanner(){
  var banner = document.getElementById('armoireEditingBanner');
  var textEl = document.getElementById('armoireEditingBannerText');
  if(!banner) return;
  if(_armoireEditingEntry){
    banner.classList.remove('closing');
    banner.style.display = 'flex';
    if(textEl) textEl.innerHTML = '<i class="ti ti-pencil"></i> Modification de « ' + escapeHtml(_armoireEditingEntry.name) + ' »';
  } else if(banner.style.display !== 'none'){
    // Animée (glissement+fondu vers le haut, voir css/styles.css) plutôt
    // qu'un disparition instantanée — retour utilisateur : animations sur
    // les différents éléments du configurateur. Le if ci-dessus évite de
    // relancer une fermeture déjà terminée (cette fonction est appelée à
    // chaque changement du brouillon, pas seulement en sortie d'édition).
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(banner, function(){ banner.style.display = 'none'; });
    } else {
      banner.style.display = 'none';
    }
  }
  // Bouton Enregistrer fusionné (bloc + configuration, voir
  // _armoireSaveChoice) : en édition, on sait déjà de quel type il s'agit
  // (impossible de "changer d'avis" en cours d'édition — voir
  // _armoireSaveChoice, qui saute directement le choix dans ce cas), le
  // libellé le reflète directement sans passer par le popup de choix.
  var saveBtn = document.getElementById('armoireConfigSaveBtn');
  if(saveBtn){
    if(_armoireEditingEntry && _armoireEditingEntry.kind === 'block'){
      saveBtn.innerHTML = '<i class="ti ti-pencil" style="font-size:15px;" aria-hidden="true"></i> Mettre à jour le bloc';
    } else if(_armoireEditingEntry && _armoireEditingEntry.kind === 'config'){
      saveBtn.innerHTML = '<i class="ti ti-pencil" style="font-size:15px;" aria-hidden="true"></i> Mettre à jour la configuration';
    } else {
      saveBtn.innerHTML = '<i class="ti ti-device-floppy" style="font-size:15px;" aria-hidden="true"></i> Enregistrer';
    }
  }
}

