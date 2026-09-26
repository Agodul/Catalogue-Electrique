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
// principe que ensureXLSX (js/actions-core.js) pour le reste de l'app (import/
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
// (js/actions-core.js) pour le reste de l'app : neutralise toute cellule texte
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

// Calcule le modèle de données (regroupement par fournisseur, totaux,
// délais) partagé par l'aperçu web (_armoireOpenExcelPreview) ET la
// génération du classeur (_armoireBuildAndDownloadWorkbook) — évite de
// dupliquer cette logique entre les deux (retour utilisateur : "faire en
// sorte que le contenu du tableau excel se retrouve dans une fenêtre du
// site", en remplacement du téléchargement direct).
function _armoireComputeExportData(name){
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
  return {
    name: name, stamp: new Date().toISOString().slice(0, 10),
    groups: groups, supplierNames: supplierNames, allItems: allItems,
    grandTotal: grandTotal, grandHasPrice: grandHasPrice, grandQty: grandQty,
    grandAvgLead: grandAvgLead, grandMaxLead: grandMaxLead, grandMaxLeadItem: grandMaxLeadItem
  };
}

// Prix formaté cohérent avec _armoireRenderStats (js/armoireConfig-draft.js) —
// '—' plutôt qu'un "0,00 €" trompeur quand aucun produit du groupe n'a de
// prix connu.
function _armoireFmtPreviewPrice(n){
  return n != null ? n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—';
}

// Corps de l'aperçu : une section par fournisseur, même découpage que les
// feuilles Excel individuelles (ref/désignation/marque/qté/prix/délai) —
// sans les colonnes de suivi de commande (Commandé/Livré/Statut), qui
// n'ont de sens que dans le fichier téléchargé, jamais cochables ici
// (retour utilisateur : aperçu en LECTURE SEULE, pas un suivi interactif).
function _armoireExcelPreviewRowsHtml(data){
  return data.supplierNames.map(function(supplier){
    var rows = data.groups[supplier];
    var supTotal = 0, supHasPrice = false, supQty = 0;
    var rowsHtml = rows.map(function(r){
      if(r.total != null){ supTotal += r.total; supHasPrice = true; }
      supQty += r.qty;
      return '<tr style="border-bottom:1px solid var(--line);">'
        + '<td style="padding:5px 6px;white-space:nowrap;">' + escapeHtml(r.ref) + '</td>'
        + '<td style="padding:5px 6px;">' + escapeHtml(r.name) + '</td>'
        + '<td style="padding:5px 6px;white-space:nowrap;">' + escapeHtml(r.brand) + '</td>'
        + '<td style="padding:5px 6px;text-align:right;white-space:nowrap;">' + r.qty + '</td>'
        + '<td style="padding:5px 6px;text-align:right;white-space:nowrap;">' + _armoireFmtPreviewPrice(r.unitPrice) + '</td>'
        + '<td style="padding:5px 6px;text-align:right;white-space:nowrap;font-weight:600;">' + _armoireFmtPreviewPrice(r.total) + '</td>'
        + '<td style="padding:5px 6px;white-space:nowrap;">' + escapeHtml(r.leadTime) + '</td>'
        + '</tr>';
    }).join('');
    return '<div style="margin-bottom:20px;">'
      + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft);margin-bottom:6px;">'
        + escapeHtml(supplier) + ' — ' + rows.length + ' référence' + (rows.length > 1 ? 's' : '') + ' · ' + supQty + ' pièce' + (supQty > 1 ? 's' : '')
        + (supHasPrice ? ' · ' + _armoireFmtPreviewPrice(supTotal) : '')
      + '</div>'
      + '<div style="overflow-x:auto;">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12.5px;color:var(--ink);">'
        + '<thead><tr style="border-bottom:2px solid var(--line);">'
          + '<th style="padding:5px 6px;text-align:left;">Référence</th>'
          + '<th style="padding:5px 6px;text-align:left;">Désignation</th>'
          + '<th style="padding:5px 6px;text-align:left;">Marque</th>'
          + '<th style="padding:5px 6px;text-align:right;">Qté</th>'
          + '<th style="padding:5px 6px;text-align:right;">Prix unit.</th>'
          + '<th style="padding:5px 6px;text-align:right;">Total</th>'
          + '<th style="padding:5px 6px;text-align:left;">Délai</th>'
        + '</tr></thead>'
        + '<tbody>' + rowsHtml + '</tbody>'
      + '</table>'
      + '</div>'
    + '</div>';
  }).join('');
}

// Fenêtre d'aperçu — même famille de popup générée en JS que
// _armoirePromptSupplierChoice (js/armoireConfig-draft.js), mais en grand
// (max-width 900px, hauteur quasi pleine) pour accueillir un vrai tableau,
// plutôt qu'agrandir _popupOverlay (js/popup.js, plafonné à 380px pour les
// petites boîtes de dialogue confirm/alert/prompt). --z-popup (au-dessus de
// TOUTE autre fenêtre, voir css/styles.css) garantit qu'elle s'affiche
// par-dessus le configurateur lui-même.
function _armoireOpenExcelPreview(data){
  var overlay = document.createElement('div');
  overlay.className = 'spi-popup-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:var(--z-popup,11000);background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML =
    '<div style="background:var(--paper-card);border-radius:14px;width:100%;max-width:900px;height:min(760px,88vh);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35);font-family:var(--font-sans,inherit);">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);flex-shrink:0;">'
        + '<div style="min-width:0;">'
          + '<div style="font-size:15px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(data.name) + '</div>'
          + '<div style="font-size:11.5px;color:var(--ink-soft);">' + data.stamp + ' · ' + data.supplierNames.length + ' fournisseur' + (data.supplierNames.length > 1 ? 's' : '') + ' · ' + data.allItems.length + ' référence' + (data.allItems.length > 1 ? 's' : '') + '</div>'
        + '</div>'
        + '<button type="button" id="_armoireExcelPreviewClose" class="close sans" style="flex-shrink:0;">✕</button>'
      + '</div>'
      // Même gabarit compact (padding/font-size) que #armoireConfigStats
      // (_armoireRenderStats, js/armoireConfig-draft.js) — 15px/8px 12px
      // débordait sur mobile ("3 semaines" tronqué en "3 semai…", retour
      // utilisateur : "améliore le responsive"), alors que ce gabarit plus
      // compact, déjà utilisé pour les mêmes 3 statistiques ailleurs dans ce
      // même configurateur, tient sans troncature à 375px de large.
      + '<div style="display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--line);flex-shrink:0;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:88px;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;">'
          + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;">Prix total</div>'
          + '<div style="font-size:13.5px;font-weight:700;color:var(--copper-deep);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (data.grandHasPrice ? _armoireFmtPreviewPrice(data.grandTotal) : '—') + '</div>'
        + '</div>'
        + '<div style="flex:1;min-width:88px;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;">'
          + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;">Délai moyen</div>'
          + '<div style="font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (data.grandAvgLead != null ? '~' + _armoireFormatLeadDays(data.grandAvgLead) : '—') + '</div>'
        + '</div>'
        + '<div style="flex:1;min-width:88px;background:var(--paper);border:1px solid var(--line);border-radius:8px;padding:6px 10px;">'
          + '<div style="font-size:10px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.03em;">Délai max</div>'
          + '<div style="font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (data.grandMaxLead != null ? _armoireFormatLeadDays(data.grandMaxLead) : '—') + '</div>'
        + '</div>'
      + '</div>'
      + '<div style="flex:1;min-height:0;overflow-y:auto;padding:16px 20px;">' + (data.allItems.length ? _armoireExcelPreviewRowsHtml(data) : '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:24px 8px;">Rien à afficher.</div>') + '</div>'
      + '<div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid var(--line);flex-shrink:0;">'
        + '<button type="button" id="_armoireExcelPreviewCancel" class="secondary">Fermer</button>'
        + '<button type="button" id="_armoireExcelPreviewDownload" class="copper" style="display:inline-flex;align-items:center;gap:6px;"><i class="ti ti-download" aria-hidden="true"></i> Télécharger le fichier Excel</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(overlay);

  function close(){ if(overlay.parentNode) document.body.removeChild(overlay); }
  overlay.querySelector('#_armoireExcelPreviewClose').addEventListener('click', close);
  overlay.querySelector('#_armoireExcelPreviewCancel').addEventListener('click', close);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) close(); });
  document.addEventListener('keydown', function onKey(e){
    if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(); }
  });

  var downloadBtn = overlay.querySelector('#_armoireExcelPreviewDownload');
  downloadBtn.addEventListener('click', async function(){
    downloadBtn.disabled = true; downloadBtn.style.opacity = '.6';
    try { await _armoireBuildAndDownloadWorkbook(data); }
    finally { downloadBtn.disabled = false; downloadBtn.style.opacity = ''; }
  });
}

// Bouton "Excel" du configurateur — ouvre désormais un aperçu dans une
// fenêtre du site (_armoireOpenExcelPreview) plutôt que de télécharger
// directement le fichier ; le téléchargement reste disponible depuis un
// bouton DANS cette fenêtre (_armoireBuildAndDownloadWorkbook), qui ne
// charge ExcelJS qu'à ce moment-là (l'aperçu, purement HTML, s'affiche
// instantanément sans attendre le chargement de la librairie).
async function _armoireExportExcel(){
  if(!_armoireDraft.length){
    if(typeof showToast === 'function') showToast('Ajoute au moins un produit avant d\'exporter.', 'warn');
    return;
  }
  var name = await customPrompt('Aperçu de la configuration', 'Nom de la configuration (utilisé pour le fichier Excel) :', 'Configuration armoire');
  if(name === null) return; // annulé
  name = (name || '').trim() || 'Configuration armoire';
  _armoireOpenExcelPreview(_armoireComputeExportData(name));
}

// Construit le classeur Excel à partir du modèle déjà calculé par
// _armoireComputeExportData et déclenche son téléchargement — inchangé par
// rapport à l'ancien _armoireExportExcel, seulement déplacé ici et prenant
// son "data" en paramètre au lieu de le recalculer.
async function _armoireBuildAndDownloadWorkbook(data){
  var name = data.name, stamp = data.stamp, groups = data.groups, supplierNames = data.supplierNames,
      allItems = data.allItems, grandTotal = data.grandTotal, grandHasPrice = data.grandHasPrice,
      grandQty = data.grandQty, grandAvgLead = data.grandAvgLead, grandMaxLead = data.grandMaxLead,
      grandMaxLeadItem = data.grandMaxLeadItem;

  try{ await ensureExcelJS(); }catch(err){ if(typeof showToast === 'function') showToast(err.message, 'err'); return; }

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
// js/actions-editlock.js). Vérifié ici en relisant la liste fraîchement récupérée
// (pas la réponse du POST, qui pourrait être un simple écho) : si le
// dossier saisi n'a pas été conservé, on le dit clairement plutôt que de
// laisser l'entrée retomber silencieusement dans "Sans dossier".
