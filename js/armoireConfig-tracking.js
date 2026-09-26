// ── Suivi de commande ("Commandes", indépendantes des configurations) ────
// Retour utilisateur : "comment faire pour que ça puisse servir de suivi de
// commande ?" — mêmes champs que le fichier Excel (Commandé/N° commande/
// Livré/Date de réception prévue/Statut, voir _armoireBuildAndDownloadWorkbook
// dans js/armoireConfig-excel.js), mais éditables ICI.
//
// Retour utilisateur (2e passe) : "une config peut être réutilisée pour
// d'autres projets" — le suivi ne peut donc PAS vivre directement sur les
// items d'une configuration réutilisable : recharger cette même
// configuration pour un AUTRE projet ramènerait le suivi (coché/n° commande)
// du projet précédent, et deux projets la réutilisant partageraient à tort
// le même suivi. Chaque "Nouvelle commande" (_armoireCreateOrderFromConfig,
// depuis le menu ⋯ d'une configuration) crée donc une COPIE indépendante des
// articles à cet instant, avec son propre suivi — stockée sur le même
// endpoint /configSavedConfigs que les configurations (order:true pour s'en
// distinguer, même principe que draft:true sur /configBlocks pour les
// brouillons personnels, jamais mélangés à la liste "Blocs" partagée), mais
// listée séparément dans l'onglet "Commandes" (_armoireRenderOrdersList,
// js/armoireConfig-server.js), jamais dans "Configurations".

// Retour utilisateur, capture à l'appui : une commande fraîchement créée
// n'apparaissait plus du tout dans l'onglet "Suivi" après avoir fermé sa
// fenêtre. Ce serveur est déjà connu pour ne pas persister fidèlement
// certains champs personnalisés (voir _armoireVerifyFolderPersisted pour
// "folder", même constat) — order:true envoyé à la création ne revient
// visiblement pas toujours sur le GET suivant, et order===true seul ne
// suffit alors plus à reconnaître une commande. Repli structurel (même
// principe que le repli par préfixe de nom pour les brouillons, voir
// ARMOIRE_DRAFT_NAME_PREFIX) : un item de commande porte TOUJOURS les
// champs de suivi (commande/livre/numeroCommande/dateReceptionPrevue),
// qu'une vraie configuration réutilisable ne porte jamais — suffisant pour
// reconnaître une commande même si le booléen order ne survit pas au
// aller-retour serveur.
function _armoireIsOrderEntry(c){
  if(!c) return false;
  if(c.order === true) return true;
  var first = c.items && c.items[0];
  return !!(first && (('commande' in first) || ('livre' in first) || ('numeroCommande' in first) || ('dateReceptionPrevue' in first)));
}

// Même logique que la formule Excel (IF imbriqués) — comparaison de dates au
// format ISO (YYYY-MM-DD) directement en chaînes : valide pour cet ordre de
// grandeur (comparaison lexicographique = comparaison chronologique).
function _armoireTrackingStatus(it){
  if(it.livre) return { label: 'Reçu', icon: 'ti-circle-check', bg: '#C6EFCE', fg: '#1B5E20' };
  if(it.commande && it.dateReceptionPrevue && new Date().toISOString().slice(0, 10) > it.dateReceptionPrevue){
    return { label: 'En retard', icon: 'ti-alert-triangle', bg: '#FFC7CE', fg: '#991B1B' };
  }
  if(it.commande) return { label: 'En cours', icon: 'ti-clock', bg: '#FEF3C7', fg: '#92400E' };
  return null;
}

function _armoireTrackingStatusHtml(it){
  var s = _armoireTrackingStatus(it);
  if(!s) return '<span style="color:var(--ink-soft);">—</span>';
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:' + s.bg + ';color:' + s.fg + ';white-space:nowrap;"><i class="ti ' + s.icon + '" style="font-size:12px;" aria-hidden="true"></i> ' + s.label + '</span>';
}

function _armoireTrackingRowHtml(it, idx){
  var p = _armoireProductByRef(it.ref);
  var name = p ? (p.name || '') : '';
  var brand = p ? (p.brand || '') : '';
  var supplier = (p && p.supplier && p.supplier.trim()) ? p.supplier.trim() : (brand || '—');
  return '<tr data-idx="' + idx + '" style="border-bottom:1px solid var(--line);">'
    + '<td style="padding:6px;white-space:nowrap;">' + escapeHtml(it.ref) + '</td>'
    + '<td style="padding:6px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name || (p ? '' : 'Référence introuvable')) + '</td>'
    + '<td style="padding:6px;white-space:nowrap;">' + escapeHtml(brand) + '</td>'
    + '<td style="padding:6px;white-space:nowrap;">' + escapeHtml(supplier) + '</td>'
    + '<td style="padding:6px;text-align:right;white-space:nowrap;">' + it.qty + '</td>'
    + '<td style="padding:6px;text-align:center;"><input type="checkbox" class="_armoireTrackCommande" ' + (it.commande ? 'checked' : '') + ' style="width:16px;height:16px;cursor:pointer;"></td>'
    + '<td style="padding:6px;"><input type="text" class="_armoireTrackNumero" value="' + escapeHtml(it.numeroCommande || '') + '" placeholder="N° commande" style="width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid var(--line);border-radius:6px;font-size:12px;font-family:inherit;background:var(--paper);color:var(--ink);"></td>'
    + '<td style="padding:6px;text-align:center;"><input type="checkbox" class="_armoireTrackLivre" ' + (it.livre ? 'checked' : '') + ' style="width:16px;height:16px;cursor:pointer;"></td>'
    + '<td style="padding:6px;"><input type="date" class="_armoireTrackDate" value="' + escapeHtml(it.dateReceptionPrevue || '') + '" style="box-sizing:border-box;padding:4px 6px;border:1px solid var(--line);border-radius:6px;font-size:12px;font-family:inherit;background:var(--paper);color:var(--ink);"></td>'
    + '<td class="_armoireTrackStatusCell" style="padding:6px;white-space:nowrap;">' + _armoireTrackingStatusHtml(it) + '</td>'
    + '</tr>';
}

// Version mobile (repliable) de la même ligne — retour utilisateur : "revoie
// pour les tableau car en superposition c'est pas tres jolie et pas tres
// pratique", option retenue : "2 — Ligne repliable" (une carte compacte par
// défaut, ne montre les champs éditables qu'une fois dépliée). Coexiste en
// permanence dans le DOM avec _armoireTrackingRowHtml ci-dessus — seule la
// visibilité change selon la largeur (.armoire-track-table / .armoire-track-
// cards, voir css/styles.css) — plutôt que de re-générer un DOM différent au
// redimensionnement. Mêmes classes d'input que la version tableau
// (_armoireTrackCommande, etc.) : la délégation d'évènements de
// _armoireOpenOrderTracking cible [data-idx] et fonctionne donc pour les
// deux structures sans distinction.
function _armoireTrackingCardHtml(it, idx, isExpanded){
  var p = _armoireProductByRef(it.ref);
  var name = p ? (p.name || '') : '';
  var title = escapeHtml(it.ref) + (name ? ' — ' + escapeHtml(name) : (p ? '' : ' — référence introuvable'));
  var body = !isExpanded ? '' : (
    '<div style="padding:2px 0 8px;display:flex;flex-direction:column;gap:10px;">'
      + '<div style="font-size:11.5px;color:var(--ink-soft);">' + escapeHtml(p ? (p.brand || '') : '') + (p && p.supplier ? ' · ' + escapeHtml(p.supplier) : '') + ' · Qté ' + it.qty + '</div>'
      + '<label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink);"><input type="checkbox" class="_armoireTrackCommande" ' + (it.commande ? 'checked' : '') + ' style="width:17px;height:17px;cursor:pointer;flex-shrink:0;"> Commandé</label>'
      + '<div>'
        + '<label style="display:block;font-size:11px;color:var(--ink-soft);margin-bottom:4px;">N° commande</label>'
        + '<input type="text" class="_armoireTrackNumero" value="' + escapeHtml(it.numeroCommande || '') + '" placeholder="N° commande" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:inherit;background:var(--paper);color:var(--ink);">'
      + '</div>'
      + '<label style="display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink);"><input type="checkbox" class="_armoireTrackLivre" ' + (it.livre ? 'checked' : '') + ' style="width:17px;height:17px;cursor:pointer;flex-shrink:0;"> Livré</label>'
      + '<div>'
        + '<label style="display:block;font-size:11px;color:var(--ink-soft);margin-bottom:4px;">Réception prévue</label>'
        + '<input type="date" class="_armoireTrackDate" value="' + escapeHtml(it.dateReceptionPrevue || '') + '" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:inherit;background:var(--paper);color:var(--ink);">'
      + '</div>'
    + '</div>'
  );
  return '<div class="armoire-track-card" data-idx="' + idx + '" style="border:1px solid var(--line);border-radius:10px;padding:0 12px;margin-bottom:8px;">'
    + '<div class="armoire-track-card-header" data-toggle-idx="' + idx + '" style="display:flex;align-items:center;gap:8px;padding:10px 0;cursor:pointer;">'
      + '<div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</div>'
      + '<span class="_armoireTrackStatusCell" style="flex-shrink:0;">' + _armoireTrackingStatusHtml(it) + '</span>'
      + '<i class="ti ti-chevron-' + (isExpanded ? 'down' : 'right') + '" style="font-size:16px;color:var(--ink-soft);flex-shrink:0;" aria-hidden="true"></i>'
    + '</div>'
    + body
  + '</div>';
}

// Avancement affiché sous le nom d'une commande dans l'onglet "Commandes"
// (voir _armoireOrderListItemHtml, js/armoireConfig-server.js).
function _armoireOrderSummary(entry){
  var total = entry.items.length, livre = 0, commande = 0;
  entry.items.forEach(function(it){
    if(it.livre) livre++;
    else if(it.commande) commande++;
  });
  if(total && livre === total) return { text: 'Tout reçu ✓', color: '#1B5E20' };
  if(livre || commande) return { text: livre + '/' + total + ' reçu' + (livre > 1 ? 's' : '') + (commande ? ' · ' + commande + ' en cours' : ''), color: 'var(--ink-soft)' };
  return { text: 'Pas encore commencé', color: 'var(--ink-soft)' };
}

// "Nouvelle commande" (menu ⋯ d'une configuration, voir
// js/armoireConfig-server.js) — copie indépendante des articles de CETTE
// configuration à cet instant précis, avec un suivi vierge, jamais un lien
// vers la configuration d'origine (celle-ci reste un gabarit inchangé,
// réutilisable pour d'autres commandes/projets ensuite). sourceConfigName
// n'est qu'une indication d'origine affichée dans la fenêtre de suivi —
// jamais utilisé pour retrouver/mettre à jour la configuration elle-même.
async function _armoireCreateOrderFromConfig(config){
  var todayLabel = new Date().toLocaleDateString('fr-FR');
  var defaultName = config.name + ' — Commande ' + todayLabel;
  var orderName = await customPrompt('Nouvelle commande', 'Nom de cette commande (pour la retrouver dans l\'onglet « Suivi ») :', defaultName);
  if(orderName === null) return; // annulé
  orderName = (orderName || '').trim() || defaultName;
  var items = config.items.map(function(it){
    return { ref: it.ref, qty: it.qty || 1, commande: false, numeroCommande: '', livre: false, dateReceptionPrevue: '' };
  });
  var body = { name: orderName, folder: '', order: true, sourceConfigName: config.name, items: items };
  _armoireApi('/configSavedConfigs', { method: 'POST', body: JSON.stringify(body) })
    .then(function(created){
      if(typeof showToast === 'function') showToast('Commande « ' + orderName + ' » créée ✓', 'ok');
      return _armoireFetchSavedConfigs().then(function(){
        var entry = _armoireSavedConfigs.find(function(c){ return c && c.name === orderName && _armoireIsOrderEntry(c); })
          || Object.assign({ id: created && created.id }, body);
        if(typeof _armoireSwitchTab === 'function') _armoireSwitchTab('orders');
        _armoireOpenOrderTracking(entry);
      });
    })
    .catch(function(e){ if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err'); });
}

// Fenêtre — même famille de popup générée en JS que _armoireOpenExcelPreview
// (js/armoireConfig-excel.js), avec un tableau ÉDITABLE plutôt qu'un aperçu
// figé. Sauvegarde auto-anti-rafale (même principe que
// _armoireScheduleDraftSync/_armoireDraftSyncTimer, js/armoireConfig-server.js) :
// chaque changement programme un enregistrement après une pause plutôt
// qu'un aller-retour serveur par case cochée/caractère tapé.
var ARMOIRE_TRACKING_SAVE_DELAY_MS = 1200;

function _armoireOpenOrderTracking(config){
  // Copie de travail locale (jamais _armoireSavedConfigs directement) —
  // mutée en mémoire au fil des cases cochées/frappes, puis persistée après
  // une pause. Champs de suivi absents sur les items existants (config créée
  // avant ce chantier) : valeurs par défaut vides plutôt qu'undefined, pour
  // ne jamais avoir à re-tester leur présence ailleurs.
  var items = config.items.map(function(it){
    return {
      ref: it.ref, qty: it.qty || 1,
      commande: !!it.commande, numeroCommande: it.numeroCommande || '',
      livre: !!it.livre, dateReceptionPrevue: it.dateReceptionPrevue || ''
    };
  });
  var currentId = config.id;
  var name = config.name, folder = config.folder || '', sourceConfigName = config.sourceConfigName || '';
  var saveTimer = null;

  var overlay = document.createElement('div');
  overlay.className = 'spi-popup-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:var(--z-popup,11000);background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML =
    '<div style="background:var(--paper-card);border-radius:14px;width:100%;max-width:1300px;height:min(760px,88vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);font-family:var(--font-sans,inherit);">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);flex-shrink:0;">'
        + '<div style="min-width:0;">'
          + '<div style="font-size:15px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="ti ti-truck-delivery" aria-hidden="true"></i> ' + escapeHtml(name) + '</div>'
          + '<div style="font-size:11.5px;color:var(--ink-soft);">' + items.length + ' référence' + (items.length > 1 ? 's' : '') + (sourceConfigName ? ' · depuis « ' + escapeHtml(sourceConfigName) + ' »' : '') + '</div>'
          + '<div id="_armoireTrackingSaveStatus" style="font-size:11px;color:var(--ink-soft);"></div>'
        + '</div>'
        + '<button type="button" id="_armoireTrackingClose" class="close sans" style="flex-shrink:0;">✕</button>'
      + '</div>'
      + '<div id="_armoireTrackingBody" style="flex:1;min-height:0;overflow:auto;padding:16px 20px;">'
        + (items.length
          ? ('<table class="armoire-track-table" style="width:100%;border-collapse:collapse;font-size:12.5px;color:var(--ink);">'
            + '<thead><tr style="border-bottom:2px solid var(--line);position:sticky;top:0;background:var(--paper-card);">'
              + '<th style="padding:6px;text-align:left;">Référence</th>'
              + '<th style="padding:6px;text-align:left;">Désignation</th>'
              + '<th style="padding:6px;text-align:left;">Marque</th>'
              + '<th style="padding:6px;text-align:left;">Fournisseur</th>'
              + '<th style="padding:6px;text-align:right;">Qté</th>'
              + '<th style="padding:6px;text-align:center;">Commandé</th>'
              + '<th style="padding:6px;text-align:left;">N° commande</th>'
              + '<th style="padding:6px;text-align:center;">Livré</th>'
              + '<th style="padding:6px;text-align:left;">Réception prévue</th>'
              + '<th style="padding:6px;text-align:left;">Statut</th>'
            + '</tr></thead>'
            + '<tbody id="_armoireTrackingTbody">' + items.map(_armoireTrackingRowHtml).join('') + '</tbody>'
          + '</table>'
          // Version mobile — coexiste avec le tableau ci-dessus, la
          // visibilité de chacune bascule en CSS (.armoire-track-table /
          // .armoire-track-cards, voir css/styles.css), jamais les deux à
          // la fois à l'écran.
          + '<div id="_armoireTrackingCards" class="armoire-track-cards">' + items.map(function(it, idx){ return _armoireTrackingCardHtml(it, idx, false); }).join('') + '</div>')
          : '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:24px 8px;">Aucune référence dans cette configuration.</div>')
      + '</div>'
      + '<div style="display:flex;justify-content:flex-end;padding:14px 20px;border-top:1px solid var(--line);flex-shrink:0;">'
        + '<button type="button" id="_armoireTrackingCloseFooter" class="copper">Fermer</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(overlay);

  var statusEl = overlay.querySelector('#_armoireTrackingSaveStatus');
  var bodyEl = overlay.querySelector('#_armoireTrackingBody');

  // Retour utilisateur : "fiabilise le suivi". Deux trous dans la version
  // précédente, corrigés ici :
  //  1) COURSE entre deux sauvegardes qui se chevauchent — un
  //     enregistrement (POST+DELETE, pas de PUT/PATCH dispo, voir
  //     _armoireReplaceEntry) lancé pendant qu'un précédent est encore en
  //     vol pouvait DELETE un id que l'autre venait de créer, ou écraser sa
  //     mise à jour de "currentId". "dirty"/"savePromise" ci-dessous
  //     garantissent qu'un seul envoi est en vol à la fois — une
  //     modification survenant PENDANT l'envoi est simplement reprise par
  //     un envoi suivant dès que le premier se termine, jamais en
  //     parallèle.
  //  2) Fermer juste après un ÉCHEC réseau perdait silencieusement la
  //     dernière modification (rien ne la retentait, l'ancien code ne
  //     retentait que si le minuteur anti-rafale était encore en attente,
  //     jamais après un échec déjà tenté). close() attend maintenant la fin
  //     d'un envoi en cours et, en cas d'échec, prévient explicitement
  //     avant de fermer quand même (même principe que les autres
  //     confirmations de perte de données de ce fichier), plutôt que de
  //     jeter le travail en cours sans un mot.
  var dirty = false;

  function scheduleSave(){
    dirty = true;
    if(statusEl) statusEl.textContent = 'Modifications non enregistrées…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){ saveTimer = null; doSave(); }, ARMOIRE_TRACKING_SAVE_DELAY_MS);
  }

  // Retourne toujours une promesse : celle de l'envoi qu'elle vient de
  // lancer, celle DÉJÀ en vol si un envoi tournait déjà (jamais un second
  // en parallèle), ou une promesse déjà résolue s'il n'y avait rien à
  // envoyer.
  var savePromise = null;
  function doSave(){
    if(savePromise) return savePromise;
    if(!dirty) return Promise.resolve();
    dirty = false; // optimiste : une modif qui arrive PENDANT l'envoi la repasse à true, reprise juste en dessous
    if(statusEl) statusEl.textContent = 'Enregistrement…';
    savePromise = _armoireReplaceEntry('/configSavedConfigs', currentId, { name: name, folder: folder, order: true, sourceConfigName: sourceConfigName, items: items })
      .then(function(created){
        // Le remplacement change l'id serveur de cette entrée (pas de PUT/
        // PATCH disponible, voir _armoireReplaceEntry) — retrouve le nouvel
        // id en relisant la liste fraîche PAR NOM (même méthode, plus fiable
        // que la réponse du POST, déjà utilisée pour les emplacements de
        // brouillon nommés — voir _armoireRenameDraftSlot), created.id en
        // repli si ce serveur ne renvoie pas la liste attendue.
        return _armoireApi('/configSavedConfigs').then(function(fresh){
          _armoireSetSavedConfigsFromServer(fresh);
          _armoireRenderSavedList();
          _armoireRenderOrdersList();
          var updated = _armoireSavedConfigs.find(function(c){ return c && c.name === name && _armoireIsOrderEntry(c); });
          currentId = (updated && updated.id) || (created && created.id) || currentId;
        });
      })
      .then(function(){
        if(statusEl) statusEl.textContent = dirty ? 'Modifications non enregistrées…' : 'Enregistré ✓';
        savePromise = null;
        // Une modif est survenue PENDANT cet envoi : la reprendre tout de
        // suite plutôt que d'attendre le prochain changement utilisateur —
        // sinon elle resterait "en attente" indéfiniment si personne ne
        // retouche plus le formulaire avant de fermer.
        if(dirty) return doSave();
      })
      .catch(function(e){
        console.warn('_armoireOpenOrderTracking (sauvegarde):', e && e.message);
        dirty = true; // à retenter — pas immédiatement en boucle (voir ci-dessous), pour ne pas marteler un serveur déjà en difficulté
        savePromise = null;
        if(statusEl) statusEl.textContent = 'Échec de l\'enregistrement — nouvelle tentative au prochain changement';
        if(typeof showToast === 'function') showToast('Suivi non enregistré : ' + (e && e.message || e), 'err', 4000);
      });
    return savePromise;
  }

  // Retour utilisateur : "revoie pour les tableau car en superposition c'est
  // pas tres jolie et pas tres pratique" — le tableau desktop (10 colonnes,
  // ci-dessus) et la version mobile en cartes repliables (voir
  // _armoireTrackingCardHtml) COEXISTENT en permanence dans le DOM, sous le
  // même conteneur #_armoireTrackingBody — seule la visibilité change en CSS
  // (.armoire-track-table / .armoire-track-cards, voir css/styles.css) selon
  // la largeur d'écran. La délégation ci-dessous cible donc [data-idx]
  // (matché par <tr data-idx> ET <div class="armoire-track-card" data-idx>)
  // plutôt que 'tr' spécifiquement, et met à jour TOUTES les représentations
  // partageant cet idx (les deux structures existent même quand une seule
  // est visible) pour rester cohérentes si jamais la fenêtre est
  // redimensionnée/tournée en cours d'édition.
  var expandedIdx = {}; // idx (mobile) -> true si dépliée — jamais persisté, remis à zéro à chaque ouverture
  var cardsEl = overlay.querySelector('#_armoireTrackingCards');
  function renderCards(){
    if(!cardsEl) return;
    cardsEl.innerHTML = items.map(function(it, idx){ return _armoireTrackingCardHtml(it, idx, !!expandedIdx[idx]); }).join('');
  }
  // Met à jour TOUTES les représentations de cet article (ligne du tableau +
  // carte mobile, même si une seule est visible à l'écran) — sans ça, un
  // changement fait sur l'une restait invisible sur l'autre si la fenêtre
  // est redimensionnée/tournée en cours d'édition (repéré en testant :
  // cocher "Commandé" sur la carte mobile, puis repasser en desktop,
  // laissait la case du tableau visuellement décochée malgré un statut
  // "En cours" déjà à jour — les deux doivent rester cohérents). Les champs
  // texte/date ne sont jamais réécrits sur l'élément actuellement au focus,
  // pour ne jamais couper une frappe en cours.
  function syncTwin(idx, it){
    if(!bodyEl) return;
    bodyEl.querySelectorAll('[data-idx="' + idx + '"]').forEach(function(node){
      var chkCommande = node.querySelector('._armoireTrackCommande');
      if(chkCommande) chkCommande.checked = it.commande;
      var chkLivre = node.querySelector('._armoireTrackLivre');
      if(chkLivre) chkLivre.checked = it.livre;
      var numero = node.querySelector('._armoireTrackNumero');
      if(numero && document.activeElement !== numero) numero.value = it.numeroCommande || '';
      var date = node.querySelector('._armoireTrackDate');
      if(date && document.activeElement !== date) date.value = it.dateReceptionPrevue || '';
      var statusCell = node.querySelector('._armoireTrackStatusCell');
      if(statusCell) statusCell.innerHTML = _armoireTrackingStatusHtml(it);
    });
  }
  if(bodyEl){
    bodyEl.addEventListener('click', function(e){
      var header = e.target.closest('.armoire-track-card-header');
      if(!header) return;
      var idx = parseInt(header.getAttribute('data-toggle-idx'), 10);
      expandedIdx[idx] = !expandedIdx[idx];
      renderCards();
    });
    // "input" (N° commande, texte tapé) ne touche QUE le modèle + programme
    // la sauvegarde, jamais de re-rendu (qui ferait perdre le focus/curseur
    // en cours de frappe — voir le même choix documenté sur
    // .armoire-qty-input) ; "change" (cases à cocher, date) met aussi à
    // jour le badge Statut.
    bodyEl.addEventListener('input', function(e){
      var row = e.target.closest('[data-idx]');
      if(!row || !e.target.classList.contains('_armoireTrackNumero')) return;
      var idx = parseInt(row.getAttribute('data-idx'), 10);
      if(!items[idx]) return;
      items[idx].numeroCommande = e.target.value;
      syncTwin(idx, items[idx]);
      scheduleSave();
    });
    bodyEl.addEventListener('change', function(e){
      var row = e.target.closest('[data-idx]');
      if(!row) return;
      var idx = parseInt(row.getAttribute('data-idx'), 10);
      var it = items[idx];
      if(!it) return;
      if(e.target.classList.contains('_armoireTrackCommande')) it.commande = e.target.checked;
      else if(e.target.classList.contains('_armoireTrackLivre')) it.livre = e.target.checked;
      else if(e.target.classList.contains('_armoireTrackDate')) it.dateReceptionPrevue = e.target.value;
      else return;
      syncTwin(idx, it);
      scheduleSave();
    });
  }

  // Fermer force l'envoi immédiat d'une sauvegarde encore en attente (anti-
  // rafale, voir scheduleSave) et ATTEND sa fin avant de vraiment fermer —
  // sinon les toutes dernières modifications, ou un échec réseau juste
  // avant la fermeture, disparaissaient sans un mot (voir le commentaire
  // au-dessus de "dirty"). En cas d'échec malgré cette tentative explicite,
  // prévenir avant de fermer quand même plutôt que jeter le travail en
  // cours en silence.
  function close(){
    clearTimeout(saveTimer);
    saveTimer = null;
    function reallyClose(){ if(overlay.parentNode) document.body.removeChild(overlay); }
    if(!dirty && !savePromise){ reallyClose(); return; }
    Promise.resolve(doSave()).then(function(){
      if(!dirty){ reallyClose(); return; }
      customConfirm(
        'Fermer sans enregistrer ?',
        'Les dernières modifications n\'ont pas pu être envoyées au serveur (connexion indisponible ?). Fermer quand même ? Elles seront perdues.',
        { okLabel: 'Fermer quand même', danger: true }
      ).then(function(ok){ if(ok) reallyClose(); });
    });
  }
  overlay.querySelector('#_armoireTrackingClose').addEventListener('click', close);
  overlay.querySelector('#_armoireTrackingCloseFooter').addEventListener('click', close);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e){
    if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(); }
  });
}
