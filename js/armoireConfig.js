// ── Configurateur d'armoire (admin) ──────────────────────────────────────
// Aucune IA, aucun calcul automatique : l'admin choisit lui-même les
// produits en parcourant le catalogue et compose une configuration à la
// main — exactement comme il le ferait sur papier, en plus rapide.
// Deux niveaux de réutilisation, pensés pour des armoires qui ne se
// répètent jamais à l'identique :
//   - un BLOC = un sous-ensemble réutilisable (ex. "Bloc PLC standard"),
//     inséré en un clic dans une configuration en cours ;
//   - une CONFIGURATION = une armoire complète déjà assemblée, rechargeable
//     telle quelle pour repartir d'une base proche.
"use strict";

var _armoireDraft = []; // [{ref, qty}]
var _armoireBlocks = [];
var _armoireSavedConfigs = [];
var _armoireActiveTab = 'blocks';
// Dossiers repliés (retour utilisateur : ranger blocs/configs par dossier) —
// clé = nom du dossier ('' = "Sans dossier"), true = replié. En mémoire
// seulement (pas persisté), séparé par kind pour ne pas lier l'état des
// blocs à celui des configurations.
var _armoireCollapsedFolders = { block: {}, config: {} };
// Bloc/config en cours de modification (retour utilisateur : pouvoir
// éditer un bloc/une config existant, pas juste renommer) — { id, kind
// ('block'|'config'), name, folder } le temps de l'édition, sinon null.
// "Enregistrer" écrase alors l'entrée d'origine (POST le nouveau contenu
// PUIS DELETE l'ancien) plutôt que d'en créer une nouvelle en double.
var _armoireEditingEntry = null;
// Sauvegarde de _armoireDraft pendant l'édition d'un bloc/config (voir
// _armoireStartEditEntry) — retour utilisateur : éditer un bloc ne doit
// JAMAIS obliger à vider/perdre la configuration en cours de composition.
// _armoireDraft est temporairement remplacé par le contenu de l'entrée
// éditée (pour réutiliser tel quel tout le reste de l'UI de composition —
// recherche, +/-, retrait), puis restauré ici à l'annulation ou à la fin de
// l'édition.
var _armoireDraftBackup = null;

function _armoireProductByRef(ref){
  return (window.products || []).find(function(p){ return p.ref === ref; });
}

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

function _armoireRenderStats(){
  var el = document.getElementById('armoireConfigStats');
  if(!el) return;
  if(!_armoireDraft.length){ el.style.display = 'none'; el.innerHTML = ''; return; }
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

function _armoireRenderDraft(){
  var el = document.getElementById('armoireConfigDraftList');
  if(!el) return;
  _armoireRenderStats();
  _armoireUpdateMobileDraftBadge();
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
      + '<button type="button" class="armoire-qty-minus" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border-radius:6px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;font-size:13px;line-height:1;flex-shrink:0;">−</button>'
      // Quantité modifiable directement (retour utilisateur : cliquer 49
      // fois sur "+" pour atteindre 50 pièces n'est pas praticable). Les
      // boutons +/- restent pour les petits ajustements ponctuels.
      + '<input type="number" class="armoire-qty-input" inputmode="numeric" min="1" step="1" value="' + it.qty + '" style="width:38px;text-align:center;font-size:12.5px;font-weight:600;color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:2px 2px;flex-shrink:0;background:var(--paper);">'
      + '<button type="button" class="armoire-qty-plus" style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border-radius:6px;border:1px solid var(--line);background:var(--paper);color:var(--ink);cursor:pointer;font-size:13px;line-height:1;flex-shrink:0;">+</button>'
      + '<button type="button" class="armoire-item-remove" title="Retirer" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;background:none;border:none;color:var(--ink-soft);font-size:15px;cursor:pointer;flex-shrink:0;">✕</button>'
      + '</div>';
  }).join('');
}

// ── Recherche produits, rangée en dossiers famille ───────────────────────
// Sans recherche active : dossiers par famille (comme la page d'accueil),
// on clique pour voir les produits de cette famille. Dès qu'on tape dans la
// recherche, elle porte sur tout le catalogue, toutes familles confondues.

var _armoireBrowseFamily = null; // famille actuellement ouverte (null = liste des dossiers)

// Même vignette que "Produits suggérés" (.sug-list-photo) — miniature fixe
// 44×44 avec repli sur une icône si pas de photo ou en erreur de chargement.
function _armoirePhotoHtml(p){
  return p.photo
    ? '<img src="' + escapeHtml(p.photo) + '" alt="' + escapeHtml(p.name || p.ref) + '" loading="lazy" data-fallback="photo-icon">'
    : '<i class="ti ti-photo-off"></i>';
}

function _armoireProductRowHtml(p){
  return '<div class="armoire-search-row sug-list-item" data-ref="' + escapeHtml(p.ref) + '" style="cursor:default;margin-bottom:6px;">'
    + '<div class="sug-list-photo">' + _armoirePhotoHtml(p) + '</div>'
    + '<div class="sug-list-body">'
    + '<div class="sug-list-ref">' + escapeHtml(p.ref || '') + _productBadgesCompactHtml(p) + '</div>'
    + '<div class="sug-list-name">' + escapeHtml(p.name || '') + (p.family ? ' · ' + escapeHtml(p.family) : '') + '</div>'
    + '</div>'
    + '<button type="button" class="armoire-search-add" style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border-radius:7px;border:none;background:var(--copper);color:#fff;cursor:pointer;font-size:15px;line-height:1;flex-shrink:0;">+</button>'
    + '</div>';
}

function _armoireRenderFamilyFolders(){
  var el = document.getElementById('armoireConfigSearchResults');
  if(!el) return;
  var all = window.products || [];
  var counts = {};
  var order = [];
  all.forEach(function(p){
    var f = p.family || '(Sans famille)';
    if(!counts[f]){ counts[f] = 0; order.push(f); }
    counts[f]++;
  });
  order.sort(function(a, b){ return a.localeCompare(b, 'fr'); });
  if(!order.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:16px 8px;">Aucun produit dans le catalogue.</div>';
    return;
  }
  el.innerHTML = order.map(function(f){
    return '<div class="armoire-family-row" data-family="' + escapeHtml(f) + '" style="display:flex;align-items:center;gap:8px;padding:9px 6px;border-bottom:1px solid var(--line);cursor:pointer;">'
      + '<i class="ti ti-folder" style="font-size:16px;color:var(--copper);flex-shrink:0;"></i>'
      + '<div style="flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(f) + '</div>'
      + '<span style="font-size:11px;color:var(--ink-soft);flex-shrink:0;">' + counts[f] + '</span>'
      + '<i class="ti ti-chevron-right" style="font-size:14px;color:var(--ink-soft);flex-shrink:0;"></i>'
      + '</div>';
  }).join('');
}

function _armoireRenderFamilyProducts(family){
  var el = document.getElementById('armoireConfigSearchResults');
  if(!el) return;
  var all = window.products || [];
  var results = all.filter(function(p){ return (p.family || '(Sans famille)') === family; });
  var backRow = '<div class="armoire-family-back" style="display:flex;align-items:center;gap:6px;padding:8px 6px;margin-bottom:6px;border-bottom:1px solid var(--line);cursor:pointer;color:var(--copper-deep);font-size:12.5px;font-weight:600;">'
    + '<i class="ti ti-chevron-left" style="font-size:14px;"></i> Toutes les familles</div>';
  if(!results.length){
    el.innerHTML = backRow + '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:16px 8px;">Aucun produit dans cette famille.</div>';
    return;
  }
  el.innerHTML = backRow + results.map(_armoireProductRowHtml).join('');
}

function _armoireRenderSearchResults(query){
  var el = document.getElementById('armoireConfigSearchResults');
  if(!el) return;
  var norm = normalizeSearch(query || '');

  if(!norm){
    if(_armoireBrowseFamily) _armoireRenderFamilyProducts(_armoireBrowseFamily);
    else _armoireRenderFamilyFolders();
    return;
  }

  var all = window.products || [];
  var results = all.filter(function(p){
    return normalizeSearch(p.ref || '').indexOf(norm) !== -1 || normalizeSearch(p.name || '').indexOf(norm) !== -1;
  }).slice(0, 60);
  if(!results.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:16px 8px;">Aucun résultat.</div>';
    return;
  }
  el.innerHTML = results.map(_armoireProductRowHtml).join('');
}

// ── Serveur : blocs et configurations sauvegardées ───────────────────────

function _armoireApi(path, opts){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl) return Promise.reject(new Error('Aucun serveur configuré'));
  return fetch(sUrl + path, Object.assign({ headers: authHeaders() }, opts || {})).then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function _armoireFetchBlocks(){
  return _armoireApi('/configBlocks').then(function(list){
    _armoireBlocks = Array.isArray(list) ? list : [];
    _armoireRenderBlocksList();
  }).catch(function(e){
    // Échec silencieux auparavant — impossible de savoir si la liste
    // affichée est juste vide ou périmée suite à une requête ratée (retour
    // utilisateur : oblige à F5 pour voir un bloc qu'on vient de créer,
    // signe d'un échec de ce fetch avalé sans message).
    console.warn('_armoireFetchBlocks:', e && e.message);
    if(typeof showToast === 'function') showToast('Liste des blocs non actualisée — réessayez', 'warn', 3000);
  });
}

function _armoireFetchSavedConfigs(){
  return _armoireApi('/configSavedConfigs').then(function(list){
    _armoireSavedConfigs = Array.isArray(list) ? list : [];
    _armoireRenderSavedList();
  }).catch(function(e){
    console.warn('_armoireFetchSavedConfigs:', e && e.message);
    if(typeof showToast === 'function') showToast('Liste des configurations non actualisée — réessayez', 'warn', 3000);
  });
}

function _armoireListItemHtml(entry, kind){
  var actionLabel = kind === 'block' ? '<i class="ti ti-plus"></i> Insérer' : '<i class="ti ti-eye"></i> Charger';
  var actionClass = kind === 'block' ? 'armoire-block-insert' : 'armoire-config-load';
  var delClass = kind === 'block' ? 'armoire-block-del' : 'armoire-config-del';
  var infoClass = kind === 'block' ? 'armoire-block-info' : 'armoire-config-info';
  var editClass = kind === 'block' ? 'armoire-block-edit' : 'armoire-config-edit';
  // Suppression réservée aux comptes ayant le droit d'édition ou de
  // suppression — le configurateur est ouvert à tout utilisateur connecté,
  // mais pas la suppression des blocs/configs de tout le monde. canDelete
  // spécifiquement (pas canEdit) : retour utilisateur — un compte avec
  // juste le droit d'édition ne doit même pas voir la croix.
  var perms = window._userPerms || {};
  var canDeleteEntry = !!(perms.canDelete || perms.isAdmin);
  // Modifier : porté par canEdit (pas canDelete) — c'est une action
  // d'édition, distincte de la suppression, avec sa propre permission.
  var canEditEntry = !!(perms.canEdit || perms.isAdmin);
  return '<div class="armoire-list-row" data-id="' + escapeHtml(entry.id) + '" style="display:flex;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid var(--line);">'
    + '<div style="flex:1;min-width:0;">'
    + '<div style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(entry.name) + '</div>'
    + '<div style="font-size:11px;color:var(--ink-soft);">' + entry.items.length + ' référence' + (entry.items.length > 1 ? 's' : '') + '</div>'
    + '</div>'
    + '<button type="button" class="' + infoClass + '" title="Voir le contenu" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border-radius:50%;border:1px solid var(--line);background:var(--paper);color:var(--ink-soft);font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0;font-style:italic;font-family:Georgia,serif;">i</button>'
    + '<button type="button" class="' + actionClass + '" style="padding:5px 9px;border-radius:7px;border:1px solid var(--copper);background:var(--paper);color:var(--copper-deep);cursor:pointer;font-size:11.5px;font-weight:600;white-space:nowrap;">' + actionLabel + '</button>'
    + (canEditEntry ? '<button type="button" class="' + editClass + '" title="Modifier" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;background:none;border:none;color:var(--ink-soft);font-size:13px;cursor:pointer;flex-shrink:0;"><i class="ti ti-pencil"></i></button>' : '')
    + (canDeleteEntry ? '<button type="button" class="' + delClass + '" title="Supprimer" style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;background:none;border:none;color:var(--ink-soft);font-size:14px;cursor:pointer;flex-shrink:0;">✕</button>' : '')
    + '</div>';
}

// Détail du contenu d'un bloc / d'une configuration (popup au clic sur "i")
function _armoireShowEntryDetails(entry){
  var rows = entry.items.map(function(it){
    var p = _armoireProductByRef(it.ref);
    var name = p ? (p.name || p.ref) : it.ref;
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;">'
      + '<div class="sug-list-photo" style="width:32px;height:32px;flex-shrink:0;">' + (p ? _armoirePhotoHtml(p) : '<i class="ti ti-photo-off"></i>') + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:12.5px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(name) + '</div>'
      + '<div style="font-size:11px;color:#94a3b8;">' + escapeHtml(it.ref) + '</div>'
      + '</div>'
      + '<div style="font-size:12px;font-weight:600;color:#64748b;flex-shrink:0;">×' + (it.qty || 1) + '</div>'
      + '</div>';
  }).join('');
  customAlert(escapeHtml(entry.name), '<div style="max-height:min(50vh,340px);overflow-y:auto;overflow-x:hidden;box-sizing:border-box;margin:-4px 0 -4px;padding-right:12px;text-align:left;white-space:normal;">' + rows + '</div>');
}

// Détail des délais par référence (popup au clic sur la case "Délai max") —
// triés du plus long au plus court, pour repérer d'un coup d'œil quelles
// références tirent le délai global vers le haut.
function _armoireShowLeadTimesDetails(){
  var rows = _armoireDraft.map(function(it){
    var p = _armoireProductByRef(it.ref);
    var name = p ? (p.name || it.ref) : it.ref;
    var days = p ? _armoireParseLeadTimeDays(p.leadTime) : null;
    return { ref: it.ref, name: name, days: days, leadTime: p ? (p.leadTime || '') : '' };
  }).sort(function(a, b){
    if(a.days == null && b.days == null) return 0;
    if(a.days == null) return 1;
    if(b.days == null) return -1;
    return b.days - a.days;
  });
  var knownDays = rows.filter(function(r){ return r.days != null; }).map(function(r){ return r.days; });
  var maxDays = knownDays.length ? Math.max.apply(null, knownDays) : null;
  var html = rows.map(function(r){
    var isMax = r.days != null && maxDays != null && r.days === maxDays;
    var delayLabel = r.days != null ? _armoireFormatLeadDays(r.days) : (r.leadTime || 'Non renseigné');
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:12.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(r.name) + '</div>'
      + '<div style="font-size:11px;color:var(--ink-soft);">' + escapeHtml(r.ref) + '</div>'
      + '</div>'
      + '<div style="font-size:12px;font-weight:700;color:' + (isMax ? 'var(--copper-deep)' : 'var(--ink-soft)') + ';flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:4px;">'
        + (isMax ? '<i class="ti ti-alert-triangle" style="font-size:13px;" aria-hidden="true"></i>' : '')
        + escapeHtml(delayLabel)
      + '</div>'
      + '</div>';
  }).join('');
  customAlert('Délais par référence', '<div style="max-height:min(50vh,340px);overflow-y:auto;overflow-x:hidden;box-sizing:border-box;margin:-4px 0 -4px;padding-right:12px;text-align:left;white-space:normal;">' + html + '</div>');
}

// Regroupe une liste de blocs/configs par leur champ "folder" (texte libre,
// saisi à l'enregistrement — voir _armoirePromptNameAndFolder). '' (vide)
// = "Sans dossier", toujours affiché en dernier ; les autres dossiers sont
// triés alphabétiquement.
function _armoireGroupByFolder(list){
  var groups = {};
  var order = [];
  list.forEach(function(entry){
    var f = (entry.folder || '').trim();
    if(!groups[f]){ groups[f] = []; order.push(f); }
    groups[f].push(entry);
  });
  order.sort(function(a, b){
    if(a === '') return 1;
    if(b === '') return -1;
    return a.localeCompare(b, 'fr');
  });
  return { groups: groups, order: order };
}

// Rendu partagé blocs/configs — sections par dossier, repliables (retour
// utilisateur). kind : 'block' ou 'config', utilisé pour le libellé vide,
// le texte des lignes (_armoireListItemHtml) et pour isoler l'état replié
// de chaque liste (_armoireCollapsedFolders).
function _armoireRenderGroupedList(list, kind, emptyMessage){
  var el = document.getElementById(kind === 'block' ? 'armoireConfigBlocksList' : 'armoireConfigSavedList');
  if(!el) return;
  if(!list.length){
    el.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12px;padding:14px 8px;">' + emptyMessage + '</div>';
    return;
  }
  var g = _armoireGroupByFolder(list);
  var collapsedMap = _armoireCollapsedFolders[kind];
  // Replié par défaut (retour utilisateur) : un dossier jamais encore
  // touché cette session démarre fermé plutôt qu'ouvert. Ne seed que les
  // clés absentes — un dossier déjà déplié/replié manuellement par
  // l'utilisateur garde son état d'un rendu à l'autre (ex. après l'ajout
  // d'un nouveau bloc, la liste se re-rend sans tout refermer).
  g.order.forEach(function(folderKey){
    if(!(folderKey in collapsedMap)) collapsedMap[folderKey] = true;
  });
  el.innerHTML = g.order.map(function(folderKey){
    var entries = g.groups[folderKey];
    var label = folderKey || 'Sans dossier';
    var isCollapsed = !!collapsedMap[folderKey];
    var header = '<div class="armoire-folder-header" data-folder="' + escapeHtml(folderKey) + '" style="display:flex;align-items:center;gap:6px;padding:8px 4px 4px;cursor:pointer;user-select:none;">'
      + '<i class="ti ti-chevron-' + (isCollapsed ? 'right' : 'down') + '" style="font-size:13px;color:var(--ink-soft);flex-shrink:0;"></i>'
      + '<i class="ti ti-folder" style="font-size:13px;color:var(--ink-soft);flex-shrink:0;"></i>'
      + '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);">' + escapeHtml(label) + '</span>'
      + '<span style="font-size:11px;color:var(--ink-soft);">— ' + entries.length + '</span>'
      + '</div>';
    var rows = isCollapsed ? '' : entries.map(function(entry){ return _armoireListItemHtml(entry, kind); }).join('');
    return header + rows;
  }).join('');
}

function _armoireRenderBlocksList(){
  _armoireRenderGroupedList(_armoireBlocks, 'block', 'Aucun bloc enregistré pour l\'instant.');
}

function _armoireRenderSavedList(){
  _armoireRenderGroupedList(_armoireSavedConfigs, 'config', 'Aucune configuration enregistrée pour l\'instant.');
}

// ── Export Excel (une feuille par fournisseur) ───────────────────────────
// But : envoyer directement le fichier au fournisseur pour passer commande.
// Regroupe par fournisseur (p.supplier), avec repli sur la marque (p.brand)
// quand le fournisseur n'est pas renseigné.
// Évite les artefacts de virgule flottante (ex. 42.660000000000004) dans
// les cellules Excel — arrondi bancaire simple au centime.
function _armoireRound2(n){
  return n == null ? n : Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── Chargement paresseux d'ExcelJS (export Excel du configurateur) ─────────
// Remplace l'ancien duo SheetJS + JSZip (qui rouvrait le fichier généré pour
// y injecter à la main du XML de mise en forme conditionnelle / validation
// de données, ces deux fonctionnalités étant absentes de la version
// gratuite de SheetJS) : ExcelJS les écrit nativement via son API, donc plus
// aucune manipulation manuelle de fichier — moins de risque de corruption
// qu'avec le bricolage précédent. Auto-hébergé (js/exceljs.min.js), même
// principe que ensureXLSX (js/actions.js) pour le reste de l'app (import/
// comparaison/tarifs), qui continue d'utiliser SheetJS et n'est pas
// concerné par ce changement.
var _exceljsLoadPromise = null;
function ensureExcelJS(){
  if(window.ExcelJS) return Promise.resolve();
  if(_exceljsLoadPromise) return _exceljsLoadPromise;
  _exceljsLoadPromise = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = 'js/exceljs.min.js';
    s.onload = function(){ resolve(); };
    s.onerror = function(){ _exceljsLoadPromise = null; reject(new Error('Échec du chargement de la librairie Excel')); };
    document.head.appendChild(s);
  });
  return _exceljsLoadPromise;
}

// Même protection anti-injection de formule que _patchXlsxFormulaInjection
// (js/actions.js) pour le reste de l'app : neutralise toute cellule texte
// commençant par =, +, -, @ (ou tabulation/retour chariot) en la préfixant
// d'une apostrophe, pour qu'Excel l'affiche comme du texte brut au lieu de
// l'interpréter comme une formule (référence, produit ou fournisseur dont
// le nom commencerait ainsi — accidentellement ou non).
function _armoireSanitizeExcelRow(row){
  return row.map(function(v){
    if(typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
    return v;
  });
}

async function _armoireExportExcel(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'exporter.', 'warn');
    return;
  }
  var name = await customPrompt('Exporter en Excel', 'Nom de la configuration (utilisé pour le fichier) :', 'Configuration armoire');
  if(name === null) return; // annulé
  name = (name || '').trim() || 'Configuration armoire';

  try{ await ensureExcelJS(); }catch(err){ if(typeof showToast === 'function') showToast(err.message, 'err'); return; }

  var groups = {};
  var allItems = [];
  var grandTotal = 0, grandHasPrice = false, grandQty = 0;
  var allLeadDays = [];
  // Référence qui bloque la livraison complète (délai le plus long) — voir
  // même raisonnement que _armoireComputeStats : la moyenne seule masque ce
  // goulot d'étranglement.
  var grandMaxLead = null, grandMaxLeadItem = null;
  _armoireDraft.forEach(function(it){
    var p = _armoireProductByRef(it.ref);
    var supplier = (p && p.supplier && p.supplier.trim()) ? p.supplier.trim() : ((p && p.brand) ? p.brand : 'Fournisseur non renseigné');
    var unitPrice = p ? _armoireRound2(parsePriceNumber(p.price)) : null;
    var total = unitPrice != null ? _armoireRound2(unitPrice * it.qty) : null;
    var leadDays = p ? _armoireParseLeadTimeDays(p.leadTime) : null;
    var item = {
      supplier: supplier,
      ref: it.ref,
      name: p ? (p.name || '') : '',
      brand: p ? (p.brand || '') : '',
      qty: it.qty,
      unitPrice: unitPrice,
      total: total,
      leadTime: p ? (p.leadTime || '') : ''
    };
    if(!groups[supplier]) groups[supplier] = [];
    groups[supplier].push(item);
    allItems.push(item);
    grandQty += it.qty;
    if(total != null){ grandTotal += total; grandHasPrice = true; }
    if(leadDays != null){
      allLeadDays.push(leadDays);
      if(grandMaxLead === null || leadDays > grandMaxLead){ grandMaxLead = leadDays; grandMaxLeadItem = item; }
    }
  });
  var supplierNames = Object.keys(groups).sort();
  var grandAvgLead = allLeadDays.length ? (allLeadDays.reduce(function(a, b){ return a + b; }, 0) / allLeadDays.length) : null;
  var stamp = new Date().toISOString().slice(0, 10);

  var wb = new ExcelJS.Workbook();

  // ── Feuille 1 : Récapitulatif — vue d'ensemble + suivi de commande ──────
  // Colonnes de suivi (Statut, dates) laissées à compléter à la main : la
  // feuille sert de tableau de gestion de commande une fois les commandes
  // passées auprès de chaque fournisseur.
  var summaryWs = wb.addWorksheet('Récapitulatif');
  summaryWs.addRow(_armoireSanitizeExcelRow(['Configuration', name]));
  summaryWs.addRow(['Date d\'export', stamp]);
  summaryWs.addRow(['Nombre de fournisseurs', supplierNames.length]);
  summaryWs.addRow(['Nombre de références', allItems.length]);
  summaryWs.addRow(['Quantité totale', grandQty]);
  summaryWs.addRow(['Prix total estimé (€)', grandHasPrice ? _armoireRound2(grandTotal) : 'N/C']);
  summaryWs.addRow(['Délai moyen estimé', grandAvgLead != null ? _armoireFormatLeadDays(grandAvgLead) : 'N/C']);
  summaryWs.addRow(['Délai le plus long estimé', grandMaxLead != null ? _armoireFormatLeadDays(grandMaxLead) + ' (' + grandMaxLeadItem.ref + (grandMaxLeadItem.name ? ' — ' + grandMaxLeadItem.name : '') + ')' : 'N/C']);
  summaryWs.addRow([]);
  summaryWs.addRow(['RÉPARTITION PAR FOURNISSEUR']);
  summaryWs.addRow(['Fournisseur', 'Références', 'Quantité', 'Montant (€)', 'Délai estimé']);
  supplierNames.forEach(function(supplier){
    var rows = groups[supplier];
    var supTotal = 0, supHasPrice = false, supQty = 0, supLead = [];
    rows.forEach(function(r){
      supQty += r.qty;
      if(r.total != null){ supTotal += r.total; supHasPrice = true; }
      var d = _armoireParseLeadTimeDays(r.leadTime);
      if(d != null) supLead.push(d);
    });
    var supAvg = supLead.length ? (supLead.reduce(function(a, b){ return a + b; }, 0) / supLead.length) : null;
    summaryWs.addRow(_armoireSanitizeExcelRow([supplier, rows.length, supQty, supHasPrice ? _armoireRound2(supTotal) : 'N/C', supAvg != null ? _armoireFormatLeadDays(supAvg) : 'N/C']));
  });
  summaryWs.addRow([]);
  summaryWs.addRow(['DÉTAIL DES ARTICLES — SUIVI DE COMMANDE']);
  // "N° commande" réintégré (retour utilisateur) entre Commandé et Livré —
  // texte libre (numéro/référence fournisseur, format variable d'un
  // fournisseur à l'autre, pas de validation dessus).
  summaryWs.addRow(['Fournisseur', 'Référence', 'Désignation', 'Marque', 'Quantité', 'Prix unitaire (€)', 'Prix total (€)', 'Délai', 'Commandé', 'N° commande', 'Livré', 'Date de réception prévue', 'Statut']);
  // Ligne du premier article du tableau — sert à adresser les cellules I/K/L
  // (Commandé/Livré/Date prévue — J = N° commande, non utilisé dans les
  // formules) de chaque ligne pour la formule Statut et pour la mise en
  // forme conditionnelle ci-dessous. rowCount compte déjà la ligne d'en-tête
  // qu'on vient de pousser, donc +1 = 1ère ligne d'article (numérotation
  // Excel 1-indexée, une ligne = un article).
  var detailFirstRow = summaryWs.rowCount + 1;
  allItems.forEach(function(r){
    // Commandé/Livré : texte "✓"/vide (vide par défaut = pas encore), avec
    // une liste déroulante à un seul choix ("✓") posée dessus plus bas — ce
    // qui revient à une case à cocher (clic sur la flèche → coché ; Suppr →
    // décoché), plus pratique sur mobile qu'un VRAI/FAUX tapé à la main, et
    // compatible avec toutes les versions d'Excel (retour utilisateur : parc
    // majoritairement en Office 2016) contrairement aux cases à cocher
    // natives (365 récent uniquement). N° commande (entre les deux) reste du
    // texte libre, sans liste déroulante.
    summaryWs.addRow(_armoireSanitizeExcelRow([r.supplier, r.ref, r.name, r.brand, r.qty, r.unitPrice, r.total, r.leadTime, '', '', '', '']));
  });
  var lastRow = detailFirstRow + allItems.length - 1;
  // Colonne "Statut" (M) : un indicateur texte/symbole recalculé par Excel à
  // chaque ouverture du fichier (TODAY()), donc qui reste à jour tout seul
  // dans le temps sans qu'on ait besoin de ré-exporter (retour utilisateur).
  allItems.forEach(function(r, idx){
    var rowNum = detailFirstRow + idx;
    var formula = 'IF(K' + rowNum + '="✓","✅ Reçu",IF(AND(I' + rowNum + '="✓",L' + rowNum + '<>"",TODAY()>L' + rowNum + '),"⚠️ En retard",IF(I' + rowNum + '="✓","🕒 En cours","")))';
    summaryWs.getCell('M' + rowNum).value = { formula: formula };
  });
  [22, 16, 38, 18, 10, 14, 14, 14, 11, 16, 9, 18, 14].forEach(function(w, i){
    summaryWs.getColumn(i + 1).width = w;
  });
  if(allItems.length){
    // Couleur de fond de la colonne Statut, écrite nativement par ExcelJS
    // (pas de couleur "en dur" sur chaque cellule : une vraie règle Excel,
    // recalculée à chaque ouverture comme la formule elle-même). Rouge =
    // commandé mais pas livré et date prévue dépassée ; vert = livré.
    // fgColor ET bgColor sont fixés à la même couleur : Excel lui-même
    // écrit toujours les deux pour un remplissage uni (vérifié sur un
    // fichier de référence) — ExcelJS n'écrit que fgColor par défaut, ce qui
    // s'est révélé insuffisant dans certaines versions d'Excel (le texte de
    // la formule se met à jour normalement, mais la couleur ne s'affiche
    // pas — retour utilisateur sur Excel 365 Mac).
    summaryWs.addConditionalFormatting({
      ref: 'M' + detailFirstRow + ':M' + lastRow,
      rules: [
        {
          type: 'expression',
          formulae: ['AND($I' + detailFirstRow + '="✓",$K' + detailFirstRow + '<>"✓",$L' + detailFirstRow + '<>"",TODAY()>$L' + detailFirstRow + ')'],
          style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' }, bgColor: { argb: 'FFFFC7CE' } } }
        },
        {
          type: 'expression',
          formulae: ['$K' + detailFirstRow + '="✓"'],
          style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' }, bgColor: { argb: 'FFC6EFCE' } } }
        }
      ]
    });
    // Liste déroulante à une seule valeur ("✓") sur Commandé/Livré — voir
    // commentaire plus haut. allowBlank permet de laisser la cellule vide
    // (pas encore fait) sans qu'Excel ne considère ça comme une erreur.
    // N° commande (J) n'a volontairement aucune validation — texte libre.
    for(var rn = detailFirstRow; rn <= lastRow; rn++){
      var dv = { type: 'list', allowBlank: true, formulae: ['"✓"'] };
      summaryWs.getCell('I' + rn).dataValidation = dv;
      summaryWs.getCell('K' + rn).dataValidation = dv;
    }
  }

  // ── Une feuille par fournisseur — prête à envoyer telle quelle ──────────
  var usedNames = { 'récapitulatif': true };
  supplierNames.forEach(function(supplier){
    var rows = groups[supplier];
    var base = supplier.replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || 'Fournisseur';
    var finalName = base, i = 2;
    while(usedNames[finalName.toLowerCase()]){ finalName = base.slice(0, 28) + ' (' + i + ')'; i++; }
    usedNames[finalName.toLowerCase()] = true;
    var ws = wb.addWorksheet(finalName);
    ws.addRow(['Référence', 'Désignation', 'Marque', 'Quantité', 'Prix unitaire (€)', 'Prix total (€)', 'Délai']);
    var groupTotal = 0, groupHasPrice = false;
    rows.forEach(function(r){
      if(r.total != null){ groupTotal += r.total; groupHasPrice = true; }
      ws.addRow(_armoireSanitizeExcelRow([r.ref, r.name, r.brand, r.qty, r.unitPrice, r.total, r.leadTime]));
    });
    ws.addRow([]);
    ws.addRow(['', '', '', '', 'Total', groupHasPrice ? _armoireRound2(groupTotal) : '']);
    [16, 40, 16, 9, 14, 14, 16].forEach(function(w, i){
      ws.getColumn(i + 1).width = w;
    });
  });

  var fileSlug = name.replace(/[^a-z0-9 _-]/gi, '').trim().replace(/\s+/g, '_') || 'Configuration';
  var xlsxFilename = 'SPI_' + fileSlug + '_' + stamp + '.xlsx';

  var buf = await wb.xlsx.writeBuffer();
  var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  var dlA = document.createElement('a');
  dlA.href = URL.createObjectURL(blob);
  dlA.download = xlsxFilename;
  document.body.appendChild(dlA);
  dlA.click();
  document.body.removeChild(dlA);
  setTimeout(function(){ URL.revokeObjectURL(dlA.href); }, 10000);

  if(typeof showToast === 'function') showToast('Export Excel généré ✓ (' + supplierNames.length + ' fournisseur' + (supplierNames.length > 1 ? 's' : '') + ')', 'ok');
}

// Noms de dossiers déjà utilisés dans une liste (pour l'autocomplete du
// champ Dossier à l'enregistrement) — dédupliqués, triés, jamais la clé
// vide ("Sans dossier" n'est pas un dossier à proposer en autocomplete).
// Un POST qui répond 200 ne garantit pas que le serveur a réellement
// conservé le champ "folder" — certaines API minimalistes se contentent de
// renvoyer tel quel le corps envoyé sans vraiment le stocker (même
// constat déjà fait pour "familyIcon", voir verifyFamilyIconOnServer dans
// js/actions.js). Vérifié ici en relisant la liste fraîchement récupérée
// (pas la réponse du POST, qui pourrait être un simple écho) : si le
// dossier saisi n'a pas été conservé, on le dit clairement plutôt que de
// laisser l'entrée retomber silencieusement dans "Sans dossier".
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
  // sur l'UI (même garde que deleteProduct dans js/render.js).
  var _perms = window._userPerms || {};
  if(!(_perms.canDelete || _perms.isAdmin)){
    if(typeof showToast === 'function') showToast('Droit de suppression requis', 'err', 3000);
    return;
  }
  if(!(await customConfirm('Supprimer ce bloc ?', '', { okLabel: 'Supprimer', danger: true }))) return;
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
  if(!(await customConfirm('Supprimer cette configuration ?', '', { okLabel: 'Supprimer', danger: true }))) return;
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
    banner.style.display = 'flex';
    if(textEl) textEl.innerHTML = '<i class="ti ti-pencil"></i> Modification de « ' + escapeHtml(_armoireEditingEntry.name) + ' »';
  } else {
    banner.style.display = 'none';
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

// ── Onglets Blocs / Configurations ───────────────────────────────────────

function _armoireSwitchTab(tab){
  _armoireActiveTab = tab;
  document.querySelectorAll('.armoire-tab-btn').forEach(function(btn){
    var active = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('active', active);
  });
  var blocksEl = document.getElementById('armoireConfigBlocksList');
  var savedEl = document.getElementById('armoireConfigSavedList');
  if(blocksEl) blocksEl.style.display = tab === 'blocks' ? '' : 'none';
  if(savedEl) savedEl.style.display = tab === 'configs' ? '' : 'none';
}

// ── Tiroir "Blocs enregistrés / Configurations enregistrées" — partagés
// entre tous les utilisateurs connectés, pas propres à chacun (d'où le
// libellé neutre plutôt que "Mes...", retour utilisateur). ─────────────
// Ouvert à la demande par-dessus la liste de familles (voir CSS
// .armoire-blocks-drawer) au lieu d'être empilé en permanence dessous.

function _armoireOpenBlocksDrawer(){
  var drawer = document.getElementById('armoireBlocksDrawer');
  if(drawer) drawer.style.display = 'flex';
  if(!_armoireDrawerOutsideHandler){
    _armoireDrawerOutsideHandler = function(e){
      var d = document.getElementById('armoireBlocksDrawer');
      var trigger = document.getElementById('armoireBlocksDrawerTrigger');
      if(!d || d.style.display === 'none') return;
      if(d.contains(e.target) || (trigger && trigger.contains(e.target))) return;
      _armoireCloseBlocksDrawer();
    };
    document.addEventListener('mousedown', _armoireDrawerOutsideHandler);
  }
}

function _armoireCloseBlocksDrawer(){
  var drawer = document.getElementById('armoireBlocksDrawer');
  if(drawer) drawer.style.display = 'none';
}

var _armoireDrawerOutsideHandler = null;

// ── Bascule mobile "Parcourir" / "Ma configuration" ──────────────────────
// Sous 768px, empiler les deux colonnes moitié-moitié les rendait
// inutilisables (listes minuscules, double scroll) — une seule colonne
// plein écran à la fois, sélectionnée via cette bascule. Sans effet sur
// desktop où les deux colonnes restent affichées côte à côte (CSS).
var _armoireMobileView = 'browse';

function _armoireSetMobileView(view){
  _armoireMobileView = view;
  document.querySelectorAll('.armoire-mobile-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.getAttribute('data-view') === view);
  });
  var browseEl = document.querySelector('.armoire-cfg-browse');
  var draftEl = document.querySelector('.armoire-cfg-draft');
  if(browseEl) browseEl.classList.toggle('armoire-mobile-hidden', view !== 'browse');
  if(draftEl) draftEl.classList.toggle('armoire-mobile-hidden', view !== 'draft');
}

function _armoireUpdateMobileDraftBadge(){
  var badge = document.getElementById('armoireMobileDraftBadge');
  if(!badge) return;
  if(_armoireDraft.length){
    badge.textContent = _armoireDraft.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ── Ouverture / fermeture ────────────────────────────────────────────────

// Safari iOS positionne les éléments position:fixed par rapport au
// viewport de mise en page (qui inclut la zone sous la barre d'outils
// dynamique), pas par rapport à ce qui est réellement visible à l'écran —
// un bug ancien et bien documenté. Le CSS seul (même position:fixed avec
// top/bottom explicites) reste donc piégé par ce décalage. On calcule
// et applique la hauteur en JS via window.visualViewport, qui lui reflète
// la zone réellement visible, et on la resynchronise à chaque changement
// (rotation, apparition/disparition de la barre d'outils, clavier...).
// Hauteur d'origine (desktop) du modal, capturée depuis le HTML avant toute
// modification JS — sert à la restaurer telle quelle en repassant en
// desktop, plutôt que de la vider (style.height='' efface l'inline existant
// sans rien remettre à la place, laissant le modal sans contrainte de
// hauteur : il grossit alors à la taille de tout son contenu, ~2000px+,
// et déborde largement de l'écran — bug réel observé en le vérifiant).
var _armoireOriginalHeight = null;

// Mesure la vraie valeur en pixels de env(safe-area-inset-top) via un
// élément sonde, plutôt que d'injecter la chaîne "env(...)" directement
// dans un style inline posé en JS après le chargement de la page — ce
// deuxième chemin a des soucis de support connus sur certaines versions de
// WebKit/iOS (la valeur ne se recalcule pas toujours correctement une fois
// affectée dynamiquement), ce qui laissait la fenêtre remonter derrière la
// barre de statut malgré la règle. Une sonde mesurée donne un nombre en
// pixels déjà résolu par le moteur de rendu — fiable dans tous les cas.
function _armoireSafeAreaTop(){
  var probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none;';
  document.body.appendChild(probe);
  var px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  document.body.removeChild(probe);
  return px;
}

function _armoireSyncMobileHeight(){
  var modal = document.getElementById('armoireConfigModal');
  if(!modal) return;
  if(_armoireOriginalHeight === null) _armoireOriginalHeight = modal.style.height || 'min(820px,90vh)';
  if(window.innerWidth > 768){
    // Desktop / tablette large : laisser le CSS gérer, ne pas polluer avec du inline.
    modal.style.position = '';
    modal.style.top = '';
    modal.style.left = '';
    modal.style.right = '';
    modal.style.bottom = '';
    modal.style.height = _armoireOriginalHeight;
    return;
  }
  var nav = document.querySelector('.bottom-nav');
  var navRect = (nav && getComputedStyle(nav).display !== 'none') ? nav.getBoundingClientRect() : null;
  var vv = window.visualViewport;
  var viewportH = vv ? vv.height : window.innerHeight;
  // Hauteur de nav visible dans le viewport actuel (0 si masquée/hors écran).
  var navH = navRect ? Math.max(0, viewportH - navRect.top) : 0;
  var bottomPx = Math.max(240, viewportH - navH);
  var safeTop = _armoireSafeAreaTop();
  modal.style.position = 'fixed';
  // top laisse la place à l'encoche/barre de statut — sans ça la fenêtre
  // remonte derrière l'heure/le réseau/la batterie en haut de l'écran. La
  // hauteur est réduite d'autant pour garder le bas au même endroit (juste
  // au-dessus de la nav, calculé ci-dessus). safeTop est un nombre de
  // pixels déjà mesuré (voir _armoireSafeAreaTop), pas une chaîne "env(...)".
  modal.style.top = safeTop + 'px';
  modal.style.left = '0px';
  modal.style.right = '0px';
  modal.style.bottom = 'auto';
  modal.style.height = Math.max(200, bottomPx - safeTop) + 'px';
}

var _armoireViewportHandler = null;

function _armoireOpen(){
  var overlay = document.getElementById('armoireConfigOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');
  _armoireBrowseFamily = null;
  var searchInput = document.getElementById('armoireConfigSearch');
  if(searchInput) searchInput.value = '';
  _armoireCloseBlocksDrawer();
  _armoireSetMobileView('browse');
  _armoireRenderDraft();
  _armoireRenderSearchResults('');
  _armoireSwitchTab(_armoireActiveTab);
  _armoireFetchBlocks();
  _armoireFetchSavedConfigs();

  _armoireSyncMobileHeight();
  if(window.visualViewport && !_armoireViewportHandler){
    _armoireViewportHandler = function(){ _armoireSyncMobileHeight(); };
    window.visualViewport.addEventListener('resize', _armoireViewportHandler);
    window.visualViewport.addEventListener('scroll', _armoireViewportHandler);
  }
  window.addEventListener('orientationchange', _armoireSyncMobileHeight);
}

function _armoireClose(){
  // Filet de sécurité : fermer le configurateur en pleine édition d'un
  // bloc/config ne doit jamais laisser la vraie configuration en cours
  // remplacée par le contenu édité — restaure silencieusement (voir
  // _armoireCancelEditEntry, jamais perdre la configuration de l'utilisateur).
  if(_armoireEditingEntry) _armoireCancelEditEntry();
  var overlay = document.getElementById('armoireConfigOverlay');
  document.body.classList.remove('modal-open');
  _armoireCloseBlocksDrawer();
  function teardown(){
    if(overlay) overlay.style.display = 'none';
    if(_armoireViewportHandler && window.visualViewport){
      window.visualViewport.removeEventListener('resize', _armoireViewportHandler);
      window.visualViewport.removeEventListener('scroll', _armoireViewportHandler);
      _armoireViewportHandler = null;
    }
    window.removeEventListener('orientationchange', _armoireSyncMobileHeight);
    var modal = document.getElementById('armoireConfigModal');
    if(modal){
      modal.style.position = '';
      modal.style.top = '';
      modal.style.left = '';
      modal.style.right = '';
      modal.style.bottom = '';
      modal.style.height = '';
    }
  }
  if(overlay && typeof window._closeOverlayAnimated === 'function'){
    window._closeOverlayAnimated(overlay, teardown);
  } else {
    teardown();
  }
}

(function _initArmoireConfig(){
  var btnOpen = document.getElementById('btnOpenArmoireConfig');
  if(btnOpen) btnOpen.addEventListener('click', _armoireOpen);

  var btnClose = document.getElementById('armoireConfigCloseBtn');
  if(btnClose) btnClose.addEventListener('click', _armoireClose);

  var btnDrawerTrigger = document.getElementById('armoireBlocksDrawerTrigger');
  if(btnDrawerTrigger) btnDrawerTrigger.addEventListener('click', _armoireOpenBlocksDrawer);

  var btnDrawerClose = document.getElementById('armoireBlocksDrawerClose');
  if(btnDrawerClose) btnDrawerClose.addEventListener('click', _armoireCloseBlocksDrawer);

  var searchInput = document.getElementById('armoireConfigSearch');
  if(searchInput) searchInput.addEventListener('input', function(){ _armoireRenderSearchResults(searchInput.value); });

  var searchResultsEl = document.getElementById('armoireConfigSearchResults');
  if(searchResultsEl) searchResultsEl.addEventListener('click', function(e){
    var addBtn = e.target.closest ? e.target.closest('.armoire-search-add') : null;
    if(addBtn){
      var row = addBtn.closest('.armoire-search-row');
      if(row) _armoireAddToDraft(row.getAttribute('data-ref'), 1);
      return;
    }
    var folderRow = e.target.closest ? e.target.closest('.armoire-family-row') : null;
    if(folderRow){
      _armoireBrowseFamily = folderRow.getAttribute('data-family');
      _armoireRenderSearchResults(document.getElementById('armoireConfigSearch').value);
      return;
    }
    var backRow = e.target.closest ? e.target.closest('.armoire-family-back') : null;
    if(backRow){
      _armoireBrowseFamily = null;
      _armoireRenderSearchResults(document.getElementById('armoireConfigSearch').value);
    }
  });

  var draftEl = document.getElementById('armoireConfigDraftList');
  if(draftEl) draftEl.addEventListener('click', function(e){
    var row = e.target.closest ? e.target.closest('.armoire-draft-row') : null;
    if(!row) return;
    var ref = row.getAttribute('data-ref');
    var item = _armoireDraft.find(function(it){ return it.ref === ref; });
    if(!item) return;
    if(e.target.closest('.armoire-qty-plus')) _armoireSetQty(ref, item.qty + 1);
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
    if(!(await customConfirm('Vider la configuration en cours ?', '', { okLabel: 'Vider', danger: true }))) return;
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
  if(blocksListEl) blocksListEl.addEventListener('click', function(e){
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
    if(e.target.closest('.armoire-block-insert')) _armoireMergeItems(block.items);
    else if(e.target.closest('.armoire-block-del')) _armoireDeleteBlock(id);
    else if(e.target.closest('.armoire-block-info')) _armoireShowEntryDetails(block);
    else if(e.target.closest('.armoire-block-edit')) _armoireStartEditEntry(block, 'block');
  });

  var savedListEl = document.getElementById('armoireConfigSavedList');
  if(savedListEl) savedListEl.addEventListener('click', function(e){
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
    if(e.target.closest('.armoire-config-load')) _armoireLoadSavedConfig(config);
    else if(e.target.closest('.armoire-config-del')) _armoireDeleteSavedConfig(id);
    else if(e.target.closest('.armoire-config-info')) _armoireShowEntryDetails(config);
    else if(e.target.closest('.armoire-config-edit')) _armoireStartEditEntry(config, 'config');
  });

  var editingCancelBtn = document.getElementById('armoireEditingCancelBtn');
  if(editingCancelBtn) editingCancelBtn.addEventListener('click', _armoireCancelEditEntry);
})();
