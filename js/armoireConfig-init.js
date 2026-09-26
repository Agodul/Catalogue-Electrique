(function _initArmoireConfig(){
  var btnOpen = document.getElementById('btnOpenArmoireConfig');
  if(btnOpen) btnOpen.addEventListener('click', _armoireOpen);

  // Second point d'entrée, accessible depuis n'importe quelle page — voir
  // index.html, #btnFabArmoireConfig (bulle flottante juste au-dessus de
  // "Ajouter un produit") : contrairement à #btnOpenArmoireConfig (page
  // d'accueil uniquement, invisible dès qu'on parcourt le catalogue), ce
  // bouton reste joignable en permanence. Essayé d'abord comme entrée de
  // menu (⋮ desktop + tiroir mobile), puis retour utilisateur : "je ne veux
  // pas le bouton configurateur dans le menu mais juste au dessus du petit
  // plus".
  var btnFabArmoireConfig = document.getElementById('btnFabArmoireConfig');
  if(btnFabArmoireConfig) btnFabArmoireConfig.addEventListener('click', _armoireOpen);

  var btnClose = document.getElementById('armoireConfigCloseBtn');
  if(btnClose) btnClose.addEventListener('click', _armoireClose);

  var btnDrawerTrigger = document.getElementById('armoireBlocksDrawerTrigger');
  if(btnDrawerTrigger) btnDrawerTrigger.addEventListener('click', _armoireOpenBlocksDrawer);

  var btnDrawerClose = document.getElementById('armoireBlocksDrawerClose');
  if(btnDrawerClose) btnDrawerClose.addEventListener('click', _armoireCloseBlocksDrawer);

  var searchInput = document.getElementById('armoireConfigSearch');
  if(searchInput) searchInput.addEventListener('input', function(){ _armoireRenderSearchResults(searchInput.value); });

  var searchScopeBtn = document.getElementById('armoireSearchScopeBtn');
  if(searchScopeBtn) searchScopeBtn.addEventListener('click', _armoireToggleSearchScope);

  var searchResultsEl = document.getElementById('armoireConfigSearchResults');
  if(searchResultsEl) searchResultsEl.addEventListener('click', function(e){
    var infoBtn = e.target.closest ? e.target.closest('.armoire-search-info') : null;
    if(infoBtn){
      var infoRow = infoBtn.closest('.armoire-search-row');
      if(infoRow) _armoireOpenProductView(infoRow.getAttribute('data-ref'));
      return;
    }
    var addBtn = e.target.closest ? e.target.closest('.armoire-search-add') : null;
    if(addBtn){
      var row = addBtn.closest('.armoire-search-row');
      if(row) _armoireAddToDraft(row.getAttribute('data-ref'), 1);
    }
    // L'ouverture/fermeture des dossiers famille (.sug-picker-group-title)
    // est câblée directement dans _armoireRenderFamilyFolders() ci-dessus —
    // même mécanique que "Parcourir le catalogue" (un addEventListener par
    // titre à chaque rendu, pas de délégation ici).
  });

  var draftEl = document.getElementById('armoireConfigDraftList');
  if(draftEl) draftEl.addEventListener('click', function(e){
    var row = e.target.closest ? e.target.closest('.armoire-draft-row') : null;
    if(!row) return;
    var ref = row.getAttribute('data-ref');
    var item = _armoireDraft.find(function(it){ return it.ref === ref; });
    if(!item) return;
    if(e.target.closest('.armoire-search-info')) _armoireOpenProductView(ref);
    else if(e.target.closest('.armoire-qty-plus')) _armoireSetQty(ref, item.qty + 1);
    else if(e.target.closest('.armoire-qty-minus')) _armoireSetQty(ref, item.qty - 1);
    else if(e.target.closest('.armoire-item-remove')) _armoireRemoveFromDraft(ref);
  });
  // Saisie directe de la quantité : sur "change" (perte de focus / Entrée)
  // uniquement, jamais sur "input" (à chaque frappe) — _armoireSetQty
  // déclenche _armoireRenderDraft() qui reconstruit tout le innerHTML de la
  // liste, ce qui détruirait le champ en cours de frappe et ferait perdre
  // le focus/curseur après chaque caractère tapé.
  if(draftEl) draftEl.addEventListener('change', function(e){
    var input = e.target.closest ? e.target.closest('.armoire-qty-input') : null;
    if(!input) return;
    var row = input.closest('.armoire-draft-row');
    if(!row) return;
    var n = parseInt(input.value, 10);
    if(!n || n < 1) n = 1;
    _armoireSetQty(row.getAttribute('data-ref'), n);
  });
  // Entrée valide immédiatement sans attendre un blur manuel (déclenche le
  // "change" ci-dessus via blur()).
  if(draftEl) draftEl.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && e.target.classList && e.target.classList.contains('armoire-qty-input')){
      e.preventDefault();
      e.target.blur();
    }
  });

  // Bouton compact "N configurations actives" — délégation sur le
  // conteneur stable plutôt que sur le bouton lui-même, régénéré à chaque
  // _armoireRenderDraftSwitcher() (un listener posé directement dessus
  // serait perdu au premier re-rendu). Ouvre la fenêtre de gestion, voir
  // _armoireOpenDraftListModal.
  var switcherEl = document.getElementById('armoireDraftSwitcher');
  if(switcherEl) switcherEl.addEventListener('click', function(e){
    if(e.target.closest && e.target.closest('#armoireDraftListOpenBtn')) _armoireOpenDraftListModal();
  });

  // Délégation sur le conteneur des stats plutôt que sur la case elle-même :
  // son innerHTML est régénéré à chaque _armoireRenderStats(), un listener
  // posé directement sur la case serait perdu au premier re-rendu.
  var statsEl = document.getElementById('armoireConfigStats');
  if(statsEl) statsEl.addEventListener('click', function(e){
    if(e.target.closest('.armoire-stat-delai-max')) _armoireShowLeadTimesDetails();
  });

  var clearBtn = document.getElementById('armoireConfigClearBtn');
  if(clearBtn) clearBtn.addEventListener('click', async function(){
    if(!_armoireDraft.length) return;
    if(!(await customConfirm('Vider la configuration en cours ?', 'Toutes les références ajoutées seront retirées. Cette opération est irréversible.', { okLabel: 'Vider', danger: true }))) return;
    if(_armoireEditingEntry){
      // Vider pendant une édition = l'abandonner — restaure la
      // configuration en cours mise de côté (voir _armoireCancelEditEntry)
      // plutôt que de la remplacer par du vide : jamais perdre la vraie
      // configuration de l'utilisateur (retour utilisateur).
      _armoireCancelEditEntry();
      return;
    }
    _armoireDraft = [];
    _armoireRenderDraft();
  });

  var exportBtn = document.getElementById('armoireConfigExportBtn');
  if(exportBtn) exportBtn.addEventListener('click', _armoireExportExcel);

  var quoteBtn = document.getElementById('armoireConfigQuoteBtn');
  if(quoteBtn) quoteBtn.addEventListener('click', _armoireQuoteRequest);

  var saveBtn = document.getElementById('armoireConfigSaveBtn');
  if(saveBtn) saveBtn.addEventListener('click', _armoireSaveChoice);

  document.querySelectorAll('.armoire-tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ _armoireSwitchTab(btn.getAttribute('data-tab')); });
  });

  document.querySelectorAll('.armoire-mobile-tab').forEach(function(btn){
    btn.addEventListener('click', function(){ _armoireSetMobileView(btn.getAttribute('data-view')); });
  });

  var blocksListEl = document.getElementById('armoireConfigBlocksList');
  if(blocksListEl) blocksListEl.addEventListener('click', async function(e){
    var folderHeader = e.target.closest ? e.target.closest('.armoire-folder-header') : null;
    if(folderHeader){
      var fKey = folderHeader.getAttribute('data-folder');
      _armoireCollapsedFolders.block[fKey] = !_armoireCollapsedFolders.block[fKey];
      _armoireRenderBlocksList();
      return;
    }
    var row = e.target.closest ? e.target.closest('.armoire-list-row') : null;
    if(!row) return;
    var id = row.getAttribute('data-id');
    var block = _armoireBlocks.find(function(b){ return b.id === id; });
    if(!block) return;
    if(e.target.closest('.armoire-block-insert')){
      // Retour utilisateur : "Insérer" un bloc fusionne exactement comme
      // "Ajouter" une configuration (même confirmation ci-dessous) — testé
      // exprès, même souci de fusion silencieuse. Un bloc étant pensé comme
      // un kit réutilisable, on demande EN PLUS combien d'exemplaires
      // ajouter (multiplie chaque quantité du bloc) plutôt que de forcer à
      // cliquer "Insérer" N fois de suite pour N kits identiques.
      var qtyStr = await customPrompt('Ajouter « ' + block.name + ' »', 'Combien d\'exemplaires de ce bloc voulez-vous ajouter ?', '1');
      if(qtyStr === null) return; // annulé
      var qtyTrimmed = qtyStr.trim();
      if(!/^\d+$/.test(qtyTrimmed) || parseInt(qtyTrimmed, 10) < 1){
        if(typeof showToast === 'function') showToast('Quantité invalide — entrez un nombre entier positif', 'err', 3500);
        return;
      }
      var multiplier = parseInt(qtyTrimmed, 10);
      var scaledItems = block.items.map(function(it){ return { ref: it.ref, qty: (it.qty || 1) * multiplier }; });
      if(_armoireDraft.length && !(await customConfirm(
        'Ajouter « ' + escapeHtml(block.name) + ' » ?',
        'Les ' + scaledItems.length + ' référence' + (scaledItems.length > 1 ? 's' : '') + ' de « ' + escapeHtml(block.name) + ' »' + (multiplier > 1 ? ' (×' + multiplier + ')' : '') + ' seront ajoutées à votre configuration en cours (' + _armoireDraft.length + ' référence' + (_armoireDraft.length > 1 ? 's' : '') + ' actuellement). Les quantités des références déjà présentes seront cumulées.',
        { okLabel: 'Ajouter' }
      ))) return;
      _armoireMergeItems(scaledItems);
      if(typeof showToast === 'function') showToast('« ' + block.name + ' » ajouté' + (multiplier > 1 ? ' (×' + multiplier + ')' : '') + ' à la configuration en cours ✓', 'ok', 2000);
    }
    else if(e.target.closest('.armoire-block-del')) _armoireDeleteBlock(id);
    else if(e.target.closest('.armoire-block-info')) _armoireShowEntryDetails(block);
    else if(e.target.closest('.armoire-block-edit')) _armoireStartEditEntry(block, 'block');
  });

  var savedListEl = document.getElementById('armoireConfigSavedList');
  if(savedListEl) savedListEl.addEventListener('click', async function(e){
    var folderHeaderCfg = e.target.closest ? e.target.closest('.armoire-folder-header') : null;
    if(folderHeaderCfg){
      var fKeyCfg = folderHeaderCfg.getAttribute('data-folder');
      _armoireCollapsedFolders.config[fKeyCfg] = !_armoireCollapsedFolders.config[fKeyCfg];
      _armoireRenderSavedList();
      return;
    }
    var row = e.target.closest ? e.target.closest('.armoire-list-row') : null;
    if(!row) return;
    var id = row.getAttribute('data-id');
    var config = _armoireSavedConfigs.find(function(c){ return c.id === id; });
    if(!config) return;
    if(e.target.closest('.armoire-config-insert')){
      // Retour utilisateur : "ajouter une fenêtre de confirmation lorsqu'on
      // souhaite ajouter une configuration à notre configuration en cours"
      // — contrairement à "Charger" (_armoireLoadSavedConfig), qui REMPLACE
      // et demandait déjà confirmation, "Ajouter" fusionne silencieusement
      // (les quantités des références déjà présentes sont cumulées, voir
      // _armoireAddToDraft) sans qu'on l'ait forcément voulu. Même
      // convention que "Remplacer" : pas de confirmation si la config en
      // cours est encore vide (rien à perturber).
      if(_armoireDraft.length && !(await customConfirm(
        'Ajouter « ' + escapeHtml(config.name) + ' » ?',
        'Les ' + config.items.length + ' référence' + (config.items.length > 1 ? 's' : '') + ' de « ' + escapeHtml(config.name) + ' » seront ajoutées à votre configuration en cours (' + _armoireDraft.length + ' référence' + (_armoireDraft.length > 1 ? 's' : '') + ' actuellement). Les quantités des références déjà présentes seront cumulées.',
        { okLabel: 'Ajouter' }
      ))) return;
      _armoireMergeItems(config.items);
      if(typeof showToast === 'function') showToast('« ' + config.name + ' » ajoutée à la configuration en cours ✓', 'ok', 2000);
    }
    else if(e.target.closest('.armoire-config-load')) _armoireLoadSavedConfig(config);
    else if(e.target.closest('.armoire-config-del')) _armoireDeleteSavedConfig(id);
    else if(e.target.closest('.armoire-config-info')) _armoireShowEntryDetails(config);
    else if(e.target.closest('.armoire-config-edit')) _armoireStartEditEntry(config, 'config');
    else if(e.target.closest('.armoire-config-neworder')) _armoireCreateOrderFromConfig(config);
  });

  // ── Onglet "Commandes" — mêmes actions repliage/suppression que Blocs/
  // Configurations ci-dessus, mais "Ouvrir" (au lieu d'Insérer/Ajouter)
  // lance directement le suivi (voir js/armoireConfig-tracking.js) : une
  // commande n'est jamais fusionnée dans le brouillon en cours, ce n'est
  // pas un gabarit réutilisable.
  var ordersListEl = document.getElementById('armoireConfigOrdersList');
  if(ordersListEl) ordersListEl.addEventListener('click', function(e){
    var folderHeaderOrder = e.target.closest ? e.target.closest('.armoire-folder-header') : null;
    if(folderHeaderOrder){
      var fKeyOrder = folderHeaderOrder.getAttribute('data-folder');
      _armoireCollapsedFolders.order[fKeyOrder] = !_armoireCollapsedFolders.order[fKeyOrder];
      _armoireRenderOrdersList();
      return;
    }
    var row = e.target.closest ? e.target.closest('.armoire-list-row') : null;
    if(!row) return;
    var id = row.getAttribute('data-id');
    var order = _armoireSavedConfigs.find(function(c){ return c.id === id && _armoireIsOrderEntry(c); });
    if(!order) return;
    if(e.target.closest('.armoire-order-open')) _armoireOpenOrderTracking(order);
    else if(e.target.closest('.armoire-order-info')) _armoireShowEntryDetails(order);
    else if(e.target.closest('.armoire-order-del')) _armoireDeleteSavedConfig(id);
  });

  var editingCancelBtn = document.getElementById('armoireEditingCancelBtn');
  if(editingCancelBtn) editingCancelBtn.addEventListener('click', _armoireCancelEditEntry);
})();
