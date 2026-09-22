// ── Brouillon en cours ───────────────────────────────────────────────────

function _armoireAddToDraft(ref, qty){
  qty = qty || 1;
  var existing = _armoireDraft.find(function(it){ return it.ref === ref; });
  if(existing) existing.qty += qty;
  else _armoireDraft.push({ ref: ref, qty: qty });
  _armoireRenderDraft();
}

function _armoireSetQty(ref, qty){
  var item = _armoireDraft.find(function(it){ return it.ref === ref; });
  if(!item) return;
  if(qty <= 0){ _armoireDraft = _armoireDraft.filter(function(it){ return it.ref !== ref; }); }
  else item.qty = qty;
  _armoireRenderDraft();
}

function _armoireRemoveFromDraft(ref){
  _armoireDraft = _armoireDraft.filter(function(it){ return it.ref !== ref; });
  _armoireRenderDraft();
}

function _armoireMergeItems(items){
  items.forEach(function(it){ _armoireAddToDraft(it.ref, it.qty || 1); });
}

// ── Statistiques (prix total, délai moyen) ───────────────────────────────
// Le délai (p.leadTime) est un champ libre ("3-5 jours", "2 semaines",
// "sur commande"...) : on en extrait une estimation en jours quand c'est
// possible, sinon le produit est simplement exclu de la moyenne.
function _armoireParseLeadTimeDays(str){
  if(!str) return null;
  var s = String(str).toLowerCase();
  var m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:[-–à]\s*(\d+(?:[.,]\d+)?))?\s*(jour|jours|j\b|semaine|semaines|sem\b|mois|month)/);
  if(!m) return null;
  var n1 = parseFloat(m[1].replace(',', '.'));
  var n2 = m[2] ? parseFloat(m[2].replace(',', '.')) : null;
  var avg = n2 != null ? (n1 + n2) / 2 : n1;
  var mult = /^sem/.test(m[3]) ? 7 : (/^mois|month/.test(m[3]) ? 30 : 1);
  return avg * mult;
}

function _armoireFormatLeadDays(days){
  var rounded = Math.round(days);
  if(rounded < 1) return '< 1 jour';
  if(rounded < 14) return rounded + ' jour' + (rounded > 1 ? 's' : '');
  var weeks = Math.round(days / 7);
  return weeks + ' semaine' + (weeks > 1 ? 's' : '');
}

function _armoireComputeStats(){
  var totalPrice = 0, hasPrice = false, leadDays = [];
  // Le délai qui compte réellement pour pouvoir tout assembler est celui de
  // la référence la plus lente (on attend toutes les pièces avant de monter
  // l'armoire) — une moyenne seule masque ce goulot d'étranglement quand une
  // référence traîne loin derrière les autres (retour utilisateur). On garde
  // sa référence pour pouvoir l'afficher, pas juste le nombre de jours.
  var maxLeadDays = null, maxLeadRef = null;
  _armoireDraft.forEach(function(it){
    var p = _armoireProductByRef(it.ref);
    if(!p) return;
    var unit = parsePriceNumber(p.price);
    if(unit != null){ totalPrice += unit * it.qty; hasPrice = true; }
    var days = _armoireParseLeadTimeDays(p.leadTime);
    if(days != null){
      leadDays.push(days);
      if(maxLeadDays === null || days > maxLeadDays){ maxLeadDays = days; maxLeadRef = it.ref; }
    }
  });
  var avgLeadDays = leadDays.length ? (leadDays.reduce(function(a, b){ return a + b; }, 0) / leadDays.length) : null;
  return { totalPrice: hasPrice ? totalPrice : null, avgLeadDays: avgLeadDays, maxLeadDays: maxLeadDays, maxLeadRef: maxLeadRef, leadCount: leadDays.length };
}

// Affichées en permanence (retour utilisateur), même brouillon vide — avant,
// tout le bloc disparaissait tant qu'aucun produit n'était ajouté ;
// _armoireComputeStats() gère déjà nativement un brouillon vide (renvoie des
// stats à null), donc les 3 cases s'affichent alors avec "—" plutôt que de
// masquer le bloc entier.
function _armoireRenderStats(){
  var el = document.getElementById('armoireConfigStats');
  if(!el) return;
  var stats = _armoireComputeStats();
  var priceHtml = stats.totalPrice != null
    ? stats.totalPrice.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
    : '—';
  var countSuffix = stats.leadCount < _armoireDraft.length ? ' <span style="opacity:.6;font-weight:500;">(' + stats.leadCount + '/' + _armoireDraft.length + ')</span>' : '';
  var leadAvgHtml = stats.avgLeadDays != null ? '~' + _armoireFormatLeadDays(stats.avgLeadDays) + countSuffix : '—';
  // Délai le plus long = la vraie durée d'attente avant de pouvoir tout
  // assembler (bloqué par la référence la plus lente) — la moyenne seule
  // masque ce cas quand une référence traîne loin derrière les autres.
  var leadMaxHtml = stats.maxLeadDays != null ? _armoireFormatLeadDays(stats.maxLeadDays) + countSuffix : '—';
  el.style.display = 'flex';
  el.innerHTML =
    '<div style="flex:1;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:0;">'
      + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;">Prix total</div>'
      + '<div style="font-size:13.5px;font-weight:700;color:var(--copper-deep);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + priceHtml + '</div>'
    + '</div>'
    + '<div style="flex:1;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:0;">'
      + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;">Délai moyen</div>'
      + '<div style="font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + leadAvgHtml + '</div>'
    + '</div>'
    + '<div class="armoire-stat-delai-max" style="flex:1;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:0;' + (stats.leadCount ? 'cursor:pointer;' : '') + '"' + (stats.leadCount ? ' title="Voir le détail des délais par référence"' : '') + '>'
      + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;">Délai max' + (stats.leadCount ? ' <i class="ti ti-list-details" style="font-size:11px;vertical-align:-1px;" aria-hidden="true"></i>' : '') + '</div>'
      + '<div style="font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + leadMaxHtml + '</div>'
    + '</div>';
}

// Regroupe le brouillon par fournisseur — même règle que l'export Excel
// (product.supplier, repli sur product.brand si non renseigné) — pour que
// "Demander un prix" par bouton corresponde exactement au découpage déjà
// utilisé dans les feuilles Excel séparées.
function _armoireGroupDraftBySupplier(){
  var groups = {}, order = [];
  _armoireDraft.forEach(function(it){
    var p = _armoireProductByRef(it.ref);
    var supplier = (p && p.supplier && p.supplier.trim()) ? p.supplier.trim() : ((p && p.brand) ? p.brand : 'Fournisseur non renseigné');
    if(!groups[supplier]){ groups[supplier] = []; order.push(supplier); }
    groups[supplier].push({ ref: it.ref, qty: it.qty, p: p });
  });
  order.sort(function(a, b){ return a.localeCompare(b, 'fr'); });
  return { groups: groups, order: order };
}

// Ouvre le client mail par défaut avec une demande de prix pré-rédigée pour
// UN SEUL fournisseur (les autres produits du brouillon n'y figurent pas) —
// même formulation que la version Excel abandonnée (retour utilisateur :
// une demande de prix, pas une commande ferme), mais ici directement depuis
// l'app plutôt que dans le fichier exporté (pas de risque de corrompre le
// classeur, voir l'historique de cette fonctionnalité).
// Séparé de _armoireOpenSupplierMailto pour rester testable sans déclencher
// une vraie navigation (window.location.href) à chaque vérification.
function _armoireBuildSupplierMailto(supplier){
  var grouped = _armoireGroupDraftBySupplier();
  var items = grouped.groups[supplier];
  if(!items || !items.length) return null;
  var lines = ['Bonjour,', '', 'Pourriez-vous nous communiquer votre meilleur tarif ainsi que les délais de livraison pour les références suivantes :', ''];
  var qty = 0;
  items.forEach(function(it){
    var name = it.p ? (it.p.name || '') : '';
    lines.push('- ' + it.ref + (name ? ' — ' + name : '') + ' (x' + it.qty + ')');
    qty += it.qty;
  });
  lines.push('');
  lines.push('Quantité totale : ' + qty);
  lines.push('');
  lines.push('Merci d\'avance,');
  var subject = 'Demande de prix — ' + supplier;
  return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));
}

function _armoireOpenSupplierMailto(supplier){
  var mailto = _armoireBuildSupplierMailto(supplier);
  if(mailto) window.location.href = mailto;
}

// Popup de choix quand plusieurs fournisseurs sont présents dans le
// brouillon — un bouton par fournisseur (avec son nombre de références),
// même principe que _armoirePromptSaveKind. Retourne le nom choisi, ou null
// si annulé.
function _armoirePromptSupplierChoice(order, groups){
  return new Promise(function(resolve){
    var buttonsHtml = order.map(function(supplier, i){
      return '<button class="_armoireSupplierChoiceBtn" data-i="' + i + '" style="padding:10px 14px;border-radius:8px;border:1px solid var(--line,#C9D0D8);background:#fff;color:#1e293b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;">'
        + '<span>' + escapeHtml(supplier) + '</span>'
        + '<span style="font-weight:500;color:#64748b;font-size:12px;white-space:nowrap;">' + groups[supplier].length + ' réf.</span>'
        + '</button>';
    }).join('');
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:4px;">Demande de prix à quel fournisseur ?</div>' +
      '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Un email par fournisseur — choisis à qui l\'envoyer.</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        buttonsHtml +
        '<button id="_popupCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>' +
      '</div>'
    );
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    overlay.querySelectorAll('._armoireSupplierChoiceBtn').forEach(function(btn){
      btn.addEventListener('click', function(){ close(order[parseInt(btn.getAttribute('data-i'), 10)]); });
    });
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(null); });
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(null); });
    document.addEventListener('keydown', function onKey(e){
      if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(null); }
    });
  });
}

// Bouton "Demande de devis" de la rangée principale — raccourci vers les
// mêmes emails par fournisseur déjà disponibles un par un dans la section
// "Par fournisseur" du panneau (utile quand cette section est hors champ,
// notamment sur mobile). Un seul fournisseur → envoi direct, sans question
// inutile ; plusieurs → popup de choix ci-dessus.
async function _armoireQuoteRequest(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant de demander un prix.', 'warn');
    return;
  }
  // Toujours afficher la liste des fournisseurs, même s'il n'y en a qu'un
  // seul (retour utilisateur) — plus de raccourci direct, l'utilisateur voit
  // systématiquement à qui il envoie avant que le mail ne s'ouvre.
  var grouped = _armoireGroupDraftBySupplier();
  var chosen = await _armoirePromptSupplierChoice(grouped.order, grouped.groups);
  if(chosen) _armoireOpenSupplierMailto(chosen);
}

// Retour utilisateur : "je spam la suppression de produit qui est dans la
// configuration en cours j'ai un crash site sur mobile" — CE N'EST PAS un
// spam de requêtes réseau (retirer un article ne parle jamais au serveur
// dans l'instant : voir ARMOIRE_DRAFT_SYNC_DELAY_MS plus haut, la synchro
// est anti-rafale). C'est un spam de RENDUS : chaque tap reconstruisait
// intégralement et de façon SYNCHRONE tout le DOM du panneau (liste,
// stats, sélecteur, badge) sur le fil principal — sous rafale de taps
// rapprochés (plusieurs par frame, facile sur mobile où le tactile déclenche
// souvent plus d'évènements que prévu), ce genre de réécriture répétée du
// DOM est un déclencheur connu de plantage de Safari iOS. _armoireDraft
// (l'état) reste mis à jour immédiatement à chaque appel ; seul le rendu
// visuel est désormais regroupé en un seul par frame (requestAnimationFrame)
// au lieu d'un par tap.
var _armoireDraftRenderQueued = false;
function _armoireRenderDraft(){
  // Appelée à chaque modification réelle du brouillon (ajout/quantité/
  // retrait/vidage/chargement d'une config enregistrée) — le point d'entrée
  // unique le plus fiable pour garder la synchro serveur à jour. Fait
  // TOUJOURS son travail immédiatement (jamais différé), contrairement au
  // rendu visuel ci-dessous : c'est ce qui détecte un changement réel et
  // programme la synchro, doit donc refléter CHAQUE appel, même groupés.
  // _armoireScheduleDraftSync() UNIQUEMENT si _armoireMarkDraftChanged() a
  // détecté un changement réel — sinon un simple ré-affichage sans rapport
  // avec une modification (ex. _armoireOpen() qui rend le brouillon déjà en
  // mémoire) programmait quand même un aller-retour serveur inutile
  // (recréation de l'entrée avec un nouvel id/horodatage, voir
  // _armoireReplaceEntry — aucun PUT/PATCH disponible côté serveur) pour un
  // contenu pourtant identique.
  if(_armoireMarkDraftChanged()) _armoireScheduleDraftSync();
  if(_armoireDraftRenderQueued) return;
  _armoireDraftRenderQueued = true;
  var raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function(fn){ setTimeout(fn, 16); };
  raf(function(){
    _armoireDraftRenderQueued = false;
    _armoireRenderDraftNow();
  });
}

function _armoireRenderDraftNow(){
  var el = document.getElementById('armoireConfigDraftList');
  if(!el) return;
  _armoireRenderStats();
  _armoireUpdateMobileDraftBadge();
  // Repéré en testant la reprise après rechargement (compte déjà connecté,
  // deux emplacements déjà actifs côté serveur) : _armoireDetectOtherDraftSlots
  // (appelée par _armoireSyncDraftFromServer AVANT que _armoireDraft ne soit
  // remplacé par le brouillon serveur restauré) rendait déjà le sélecteur,
  // mais avec l'ancien compte "Active (0)" — jamais rafraîchi depuis. Ce
  // point d'entrée central (seul appelé après CHAQUE changement réel de
  // _armoireDraft) garde le nombre affiché à jour dans tous les cas.
  _armoireRenderDraftSwitcher();
  if(!_armoireDraft.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:24px 8px;">Aucun produit pour l\'instant — cherche à gauche et clique « + ».</div>';
    return;
  }
  el.innerHTML = _armoireDraft.map(function(it){
    var p = _armoireProductByRef(it.ref);
    return '<div class="armoire-draft-row" data-ref="' + escapeHtml(it.ref) + '" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);">'
      + '<div class="sug-list-photo" style="width:32px;height:32px;">' + (p ? _armoirePhotoHtml(p) : '<i class="ti ti-photo-off"></i>') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      // Ref dans un <span> tronqué séparé des badges (plutôt que sur la même
      // div) : sinon un badge juste après une référence longue se retrouvait
      // caché par l'ellipsis de troncature plutôt qu'affiché à côté.
      + '<div style="display:flex;align-items:center;min-width:0;">'
      + '<span style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(it.ref) + '</span>'
      + (p ? _productBadgesCompactHtml(p) : '')
      + '</div>'
      + '<div style="font-size:11px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p ? (p.name || '') : 'Référence introuvable dans le catalogue') + '</div>'
      + '</div>'
      // Retour utilisateur : "ajoute le [bouton i] aussi côté configuration
      // en cours" — même bouton/même classe CSS que la colonne de gauche
      // (.armoire-search-info, voir _armoireProductRowHtml et
      // _armoireOpenProductView plus bas), pour consulter la fiche d'un
      // article déjà ajouté sans devoir le rechercher à nouveau à gauche.
      + '<button type="button" class="armoire-search-info" title="Voir la fiche produit"><i class="ti ti-info-circle" aria-hidden="true"></i></button>'
      + '<button type="button" class="armoire-qty-minus" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;font-size:14px;line-height:1;flex-shrink:0;box-sizing:border-box;">−</button>'
      // Quantité modifiable directement (retour utilisateur : cliquer 49
      // fois sur "+" pour atteindre 50 pièces n'est pas praticable). Les
      // boutons +/- restent pour les petits ajustements ponctuels.
      // Retour utilisateur : "fait en sorte que les boutons soit a la même
      // taille que le bouton i" — même hauteur/rayon que .armoire-search-info
      // (26px, border-radius:7px) pour les 3 éléments du groupe -/qty/+.
      + '<input type="number" class="armoire-qty-input" inputmode="numeric" min="1" step="1" value="' + it.qty + '" style="width:38px;height:26px;text-align:center;font-size:12.5px;font-weight:600;color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:2px 2px;flex-shrink:0;background:var(--paper);box-sizing:border-box;">'
      + '<button type="button" class="armoire-qty-plus" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;font-size:14px;line-height:1;flex-shrink:0;box-sizing:border-box;">+</button>'
      + '<button type="button" class="armoire-item-remove" title="Retirer" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;background:none;border:none;color:var(--ink-soft);font-size:15px;cursor:pointer;flex-shrink:0;">✕</button>'
      + '</div>';
  }).join('');
}

