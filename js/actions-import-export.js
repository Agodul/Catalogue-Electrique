  document.getElementById('btnCleanDescs').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    var count = 0;
    var touchedByClean = [];
    products.forEach(function(p){
      var touched = false;
      var cleaned = stripHtml(p.desc || '');
      if(cleaned !== (p.desc || '')){ p.desc = cleaned; count++; touched = true; }
      var cleanedName = stripHtml(p.name || '');
      if(cleanedName !== (p.name || '')){ p.name = cleanedName; touched = true; }
      if(touched){ p.updatedAt = Date.now(); touchedByClean.push(p); }
    });
    // touchedByClean (jamais tout le catalogue) : seuls les produits dont la
    // description/le nom contenait vraiment du HTML à nettoyer ont changé —
    // voir les autres correctifs de ce type dans ce fichier.
    save(false, touchedByClean); render();

    customAlert('Nettoyer les descriptions', count > 0
      ? count + ' description(s) nettoyée(s) avec succès.'
      : 'Aucune description HTML à nettoyer — tout est déjà propre !');
  });

  // ---------- Export / Import ----------
  document.getElementById('btnExport').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    var blob = new Blob([JSON.stringify(products, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    a.download = 'catalogue-'+stamp+'.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  document.getElementById('btnImport').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    document.getElementById('fileImport').click();
  });
  document.getElementById('fileImport').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file){ e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      var imported;
      try{
        imported = JSON.parse(ev.target.result);
        if(!Array.isArray(imported)) throw new Error('format invalide');
      }catch(err){
        showToast('Fichier non valide — ce n\'est pas un export catalogue JSON.', 'err', 3500);
        e.target.value = '';
        return;
      }
      // Demander via showToast + choix (pas de confirm natif)
      var count = imported.length;
      var _pendingImport = imported;
      // Utiliser une mini modale inline
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
      overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
        + '<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:8px;">Importer '+count+' produit(s)</div>'
        + '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Comment voulez-vous importer ce fichier ?</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;">'
        + '<button id="_importMerge" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Fusionner</strong> — ajouter aux produits existants</button>'
        + '<button id="_importReplace" style="padding:10px 14px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Remplacer</strong> — effacer et remplacer le catalogue</button>'
        + '<button id="_importCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>'
        + '</div></div>';
      document.body.appendChild(overlay);
      overlay.querySelector('#_importMerge').addEventListener('click', async function(){
        // Même logique que syncFromServer : ref inconnue → ajout, ref connue → conflit
        // Map plutôt qu'objet nu — voir doCheckAllSync() plus haut.
        var localMap = new Map();
        products.forEach(function(p, i){ if(p.ref) localMap.set(p.ref, i); });
        var added = 0;
        var importConflicts = [];

        _pendingImport.forEach(function(p){
          if(!p.id) p.id = 'p_'+Date.now()+'_'+_secureRandomBase36(6);
          if(!p.ref){
            // Pas de ref → ajout direct
            products.push(p);
            added++;
            return;
          }
          var idx = localMap.get(p.ref);
          if(idx === undefined){
            // Ref inconnue → ajout
            localMap.set(p.ref, products.length);
            products.push(p);
            added++;
          } else {
            // Ref connue → conflit si contenu différent
            var lp = products[idx];
            function stripUpdated(o){ var c=Object.assign({},o); delete c.updatedAt; return JSON.stringify(c); }
            if(stripUpdated(lp) !== stripUpdated(p)){
              importConflicts.push({ ref: p.ref, local: lp, server: p });
            }
          }
        });

        // Rattrape les liens de suggestions à sens unique (voir commentaire
        // sur reconcileSuggestionsReciprocally) — retour utilisateur : un
        // import doit se comporter comme le formulaire, pas seulement les
        // ajouts un par un.
        reconcileSuggestionsReciprocally(products);
        reconcileSparePartsReciprocally(products);

        // [] : pas de push ici — save() sans filtre aurait repoussé tout le
        // catalogue local avec createdAt forcé à maintenant sur chaque
        // produit (même risque que le bug corrigé dans syncFromServer/
        // pushToServer), EN DOUBLE puisque pushCatalogToServer() juste en
        // dessous fait déjà l'envoi complet voulu pour cet import — lui,
        // sans forcer createdAt, laissant le serveur arbitrer normalement
        // par produit plutôt que gagner à coup sûr.
        save(false, []);
        // Forcer retour à la home
        var homePage = document.getElementById('homePage');
        var catalogueWrap = document.getElementById('catalogueWrap');
        var hdrCountChip = document.getElementById('hdrCountChip');
        if(homePage) homePage.classList.remove('hidden');
        if(catalogueWrap) catalogueWrap.style.display = 'none';
        if(hdrCountChip) hdrCountChip.style.display = 'none';
        render(); renderHome();
        document.body.removeChild(overlay);
        e.target.value = '';

        var pushRes = await pushCatalogToServer();
        var syncMsg = pushRes.ok ? ', envoyé au serveur ✓' : (pushRes.reason === 'no-server' ? '' : ' (échec envoi serveur : '+pushRes.message+')');
        if(importConflicts.length > 0){
          setTimeout(function(){
            if(typeof window.openConflictModal === 'function'){
              window.openConflictModal(importConflicts);
            }
          }, 300);
        } else {
          showToast(added+' produit(s) ajouté(s)'+syncMsg, 'ok', 3000);
        }
      });
      overlay.querySelector('#_importReplace').addEventListener('click', async function(){
        products = _pendingImport;
        // Voir commentaire équivalent dans #_importMerge ci-dessus : [] ici
        // aussi, pushCatalogToServer() juste en dessous fait déjà l'envoi
        // complet voulu pour ce remplacement.
        reconcileSuggestionsReciprocally(products);
        reconcileSparePartsReciprocally(products);
        save(false, []);
        var homePage = document.getElementById('homePage');
        var catalogueWrap = document.getElementById('catalogueWrap');
        var hdrCountChip = document.getElementById('hdrCountChip');
        if(homePage) homePage.classList.remove('hidden');
        if(catalogueWrap) catalogueWrap.style.display = 'none';
        if(hdrCountChip) hdrCountChip.style.display = 'none';
        render(); renderHome();
        document.body.removeChild(overlay);
        e.target.value = '';

        var pushRes = await pushCatalogToServer();
        var syncMsg = pushRes.ok ? ', envoyé au serveur ✓' : (pushRes.reason === 'no-server' ? '' : ' (échec envoi serveur : '+pushRes.message+')');
        showToast('Catalogue remplacé — '+count+' produit(s)'+syncMsg, 'ok', 3000);
      });
      overlay.querySelector('#_importCancel').addEventListener('click', function(){
        document.body.removeChild(overlay);
        e.target.value = '';
      });
    };
    reader.readAsText(file);
  });

  // ══════════════════════════════════════════════════════════════
  //  EXPORT EXCEL (fabricant) — produits filtrés actuellement
  // ══════════════════════════════════════════════════════════════
  document.getElementById('btnExportXlsx').addEventListener('click', async function(){
    hdrMenu.classList.remove('open');
    try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }

    // Récupère les produits filtrés (même logique que render)
    var search = (document.getElementById('searchInput') || {value:''}).value.toLowerCase().trim();
    var brand  = document.getElementById('brandFilter').value;
    var family = document.getElementById('familyFilter').value;
    var series = document.getElementById('seriesFilter').value;
    var filtered = products.filter(function(p){
      if(brand  && p.brand  !== brand)  return false;
      if(family && p.family !== family) return false;
      if(series && p.series !== series) return false;
      if(search){
        var hay = ((p.ref||'')+(p.name||'')+(p.desc||'')+(p.brand||'')).toLowerCase();
        if(!hay.includes(search)) return false;
      }
      return true;
    });

    if(filtered.length === 0){
      showToast('Aucun produit à exporter.', 'err'); return;
    }

    // Construction des lignes
    var rows = filtered.map(function(p){
      // Prix d'origine (1er historique) = prix catalogue fabricant
      var priceCatalogue = (Array.isArray(p.priceHistory) && p.priceHistory.length > 0)
        ? p.priceHistory[0].price : '';
      return {
        'Référence'        : p.ref      || '',
        'Nom'              : p.name     || '',
        'Marque'           : p.brand    || '',
        'Famille'          : p.family   || '',
        'Série'            : p.series   || '',
        'Prix catalogue (€)': p.priceCatalogue || priceCatalogue || '',
        'Prix de vente (€)' : p.price   || '',
        'Description'      : stripHtmlTags(p.desc || ''),
      };
    });

    // Construit le tableau avec ligne titre + en-têtes + données
    var d0 = new Date();
    var stamp0 = d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
    var headers = Object.keys(rows[0]);
    var aoa = [
      ['SPI Engineering — Liste tarif ' + d0.toLocaleDateString('fr-FR')],
      headers
    ].concat(rows.map(function(r){ return headers.map(function(h){ return r[h]; }); }));

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:18},{wch:35},{wch:14},{wch:16},{wch:14},
      {wch:20},{wch:18},{wch:50}
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tarifs');

    XLSX.writeFile(wb, 'SPI_tarifs_' + stamp0 + '.xlsx');
    showToast(filtered.length + ' référence(s) exportée(s).', 'ok');
  });

  // ══════════════════════════════════════════════════════════════
  //  IMPORT EXCEL (mise à jour prix + ajout nouvelles réfs)
  // ══════════════════════════════════════════════════════════════
  var xlsxPendingData = [];

  document.getElementById('btnImportXlsx').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    document.getElementById('fileImportXlsx').click();
  });

  document.getElementById('fileImportXlsx').addEventListener('change', async function(e){
    var file = e.target.files[0];
    if(!file) return;
    try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      try{
        var wb = XLSX.read(ev.target.result, {type:'array'});
        var ws = wb.Sheets[wb.SheetNames[0]];

        // Normalise les clés (insensible à la casse, espaces, accents, caractères spéciaux)
        function norm(s){ return (s||'').toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/\s+/g,'').replace(/[()€%]/g,''); }

        // Normalise un prix pour comparaison : retire €, espaces, remplace virgule par point
        function normPrice(s){
          var str = (s||'').toString().trim()
            .replace(/\s/g,'')         // espaces insécables et normaux
            .replace(/€/g,'')           // symbole euro
            .replace(',','.');          // virgule décimale → point
          var n = parseFloat(str);
          return isNaN(n) ? str : n.toFixed(2); // '32' = '32.00' = '32 €' = '32,00 €'
        }

        // Lire toutes les lignes en tableau brut pour détecter la ligne d'en-têtes
        var rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
        if(rawRows.length === 0) throw new Error('Fichier vide');

        // Chercher la ligne d'en-têtes : celle qui contient "Référence" ou "Reference"
        var headerRowIdx = 0;
        for(var hi = 0; hi < Math.min(5, rawRows.length); hi++){
          var rowNorm = rawRows[hi].map(function(c){ return norm(String(c)); });
          if(rowNorm.some(function(c){ return c.includes('ref') || c === 'reference'; })){
            headerRowIdx = hi;
            break;
          }
        }

        // Construire les données à partir de la ligne d'en-têtes
        var headers = rawRows[headerRowIdx];
        var rows = [];
        for(var ri = headerRowIdx + 1; ri < rawRows.length; ri++){
          var row = {};
          headers.forEach(function(h, ci){ row[h] = rawRows[ri][ci] !== undefined ? rawRows[ri][ci] : ''; });
          rows.push(row);
        }

        var COL_REF = null, COL_NEW_PRICE = null, COL_NEW_SELLING = null, COL_CATALOGUE = null;
        var COL_NAME = null, COL_BRAND = null, COL_FAMILY = null;
        var COL_SERIES = null, COL_SUPPLIER = null, COL_DESC = null;
        var COL_PHOTO = null, COL_TAGS = null;

        if(rows.length === 0) throw new Error('Aucune donnée trouvée après les en-têtes.');
        headers.forEach(function(k){
          var n = norm(k);
          if((n.includes('ref') || n === 'reference') && !n.includes('nouveau')) COL_REF = k;
          // "Prix catalogue (€)" → COL_NEW_PRICE (le fabricant modifie cette colonne directement)
          if(n.includes('prixcatalogue') || n.includes('newpricecatalogue') || n.includes('nouveauprixcatalogue')) COL_NEW_PRICE = k;
          // "Prix de vente (€)" → COL_NEW_SELLING (vous modifiez cette colonne)
          if(n.includes('prixdevente') || n.includes('prixvente') || n.includes('newsellingprice') || n.includes('nouveauprixdevente')) COL_NEW_SELLING = k;
          if(n === 'nom' || n === 'name') COL_NAME = k;
          if(n === 'marque' || n === 'brand') COL_BRAND = k;
          if(n === 'famille' || n === 'family') COL_FAMILY = k;
          if(n.includes('serie') || n === 'series') COL_SERIES = k;
          if(n === 'fournisseur' || n === 'supplier') COL_SUPPLIER = k;
          if(n.includes('description') || n === 'desc') COL_DESC = k;
          if(n.includes('photo') || n.includes('urlphoto') || n.includes('image')) COL_PHOTO = k;
          if(n.includes('tag')) COL_TAGS = k;
        });

        if(!COL_REF) throw new Error('Colonne "Référence" introuvable. En-têtes trouvés : ' + headers.join(', '));

        var existingMap = {};
        products.forEach(function(p){ existingMap[p.ref] = p; });

        xlsxPendingData = [];
        var countNew = 0, countUpdate = 0, countNoChange = 0;

        rows.forEach(function(row){
          var ref = (row[COL_REF]||'').toString().trim();
          if(!ref) return;

          var newCataloguePrice = COL_NEW_PRICE   ? normalizePriceFormat((row[COL_NEW_PRICE]  ||'').toString().trim()) : '';
          var newSellingPrice   = COL_NEW_SELLING ? normalizePriceFormat((row[COL_NEW_SELLING]||'').toString().trim()) : '';
          // Compatibilité avec anciens exports (colonne "Nouveau prix (€)" unique)
          var newPrice = newCataloguePrice || newSellingPrice;
          var newName     = COL_NAME      ? (row[COL_NAME]     ||'').toString().trim() : '';
          var newBrand    = COL_BRAND     ? canonicalizeBrand((row[COL_BRAND]||'').toString().trim()) : '';
          var newFamily   = COL_FAMILY    ? (row[COL_FAMILY]   ||'').toString().trim() : '';
          var newSeries   = COL_SERIES    ? (row[COL_SERIES]   ||'').toString().trim() : '';
          var newSupplier = COL_SUPPLIER  ? (row[COL_SUPPLIER] ||'').toString().trim() : '';
          var newDesc     = COL_DESC      ? (row[COL_DESC]     ||'').toString().trim() : '';
          var newPhoto    = COL_PHOTO     ? (row[COL_PHOTO]    ||'').toString().trim() : '';
          var newTags     = COL_TAGS      ? canonicalizeTags((row[COL_TAGS]||'').toString().split(',').map(function(t){return t.trim();}).filter(Boolean)) : [];

          var existing = existingMap[ref];
          var status, oldPrice = '';

          if(!existing){
            // Nouvelle référence
            status = 'new';
            countNew++;
          } else {
            oldPrice = existing.price || '';
            // Même repli que l'export (voir "priceCatalogue" plus haut dans
            // ce fichier, colonne "Prix catalogue (€)") : la plupart des
            // produits n'ont pas de champ priceCatalogue dédié rempli, le
            // prix catalogue exporté vient alors du 1er historique de prix.
            // Sans ce même repli ici, comparer contre existing.priceCatalogue
            // (vide) trouvait TOUJOURS une "différence" avec la valeur
            // exportée, même sur un export réimporté sans aucune
            // modification (retour utilisateur : "il me trouve plein de
            // différence alors que c'est exactement le même fichier").
            var existingCatalogue = existing.priceCatalogue
              || (Array.isArray(existing.priceHistory) && existing.priceHistory.length > 0 ? existing.priceHistory[0].price : '')
              || '';
            var currentCatForCheck     = normPrice(existingCatalogue);
            var currentSellingForCheck = normPrice(existing.price || '');
            // Même repli que l'export pour la description (stripHtmlTags) —
            // même raison : existing.desc peut contenir du HTML, jamais égal
            // à la version texte brut réimportée depuis l'Excel.
            var existingDescPlain = stripHtmlTags(existing.desc || '');
            var hasChange = (newCataloguePrice && normPrice(newCataloguePrice) !== currentCatForCheck)
              || (newSellingPrice && normPrice(newSellingPrice) !== currentSellingForCheck)
              || (newName     && newName     !== (existing.name     ||''))
              || (newBrand    && newBrand    !== (existing.brand    ||''))
              || (newFamily   && newFamily   !== (existing.family   ||''))
              || (newSeries   && newSeries   !== (existing.series   ||''))
              || (newSupplier && newSupplier !== (existing.supplier ||''))
              || (newDesc     && newDesc     !== existingDescPlain);
            status = hasChange ? 'update' : 'nochange';
            if(hasChange) countUpdate++; else countNoChange++;
          }

          xlsxPendingData.push({
            ref, status, oldPrice,
            newPrice, newCataloguePrice, newSellingPrice,
            newName, newBrand, newFamily,
            newSeries, newSupplier, newDesc, newPhoto, newTags,
            existing: existing || null
          });
        });

        // Affiche la modale de prévisualisation
        document.getElementById('xlsxImportSummary').textContent =
          countNew + ' nouvelle(s) · ' + countUpdate + ' mise(s) à jour · ' + countNoChange + ' inchangée(s)';
        var hasDirectEditRights = window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin);
        document.getElementById('xlsxImportInfo').textContent = hasDirectEditRights
          ? 'Les lignes sans "Nouveau prix" conservent l\'ancien prix.'
          : 'Les lignes sans "Nouveau prix" conservent l\'ancien prix. Sans droit d\'édition directe, chaque ligne sera envoyée en demande d\'approbation.';
        var btnConfirmXlsxImportEl = document.getElementById('btnConfirmXlsxImport');
        if(btnConfirmXlsxImportEl) btnConfirmXlsxImportEl.textContent = hasDirectEditRights
          ? '✓ Confirmer l\'import'
          : '✓ Envoyer pour approbation';

        var thead = document.getElementById('xlsxPreviewHead');
        var tbody = document.getElementById('xlsxPreviewBody');
        thead.innerHTML = '<tr>' +
          '<th>Statut</th><th>Référence</th><th>Nom</th><th>Marque</th>' +
          '<th>Ancien prix</th><th>Nouveau prix</th>' +
          '</tr>';
        tbody.innerHTML = '';

        xlsxPendingData.forEach(function(item){
          var tr = document.createElement('tr');
          tr.className = 'row-' + item.status;

          var badge = item.status === 'new'
            ? '<span class="badge-new">Nouveau</span>'
            : item.status === 'update'
              ? '<span class="badge-update">Màj</span>'
              : '<span class="badge-nochange">Inchangé</span>';

          var priceCell = item.status === 'update' && item.newPrice
            ? '<span class="price-old">' + escapeHtml(item.oldPrice) + '</span><span class="price-new">' + escapeHtml(item.newPrice) + '</span>'
            : item.status === 'new'
              ? '<span class="price-new">' + escapeHtml(item.newPrice) + '</span>'
              : escapeHtml(item.oldPrice);

          tr.innerHTML =
            '<td>' + badge + '</td>' +
            '<td>' + escapeHtml(item.ref) + '</td>' +
            '<td>' + escapeHtml(item.newName || (item.existing && item.existing.name) || '') + '</td>' +
            '<td>' + escapeHtml(item.newBrand || (item.existing && item.existing.brand) || '') + '</td>' +
            '<td>' + escapeHtml(item.oldPrice) + '</td>' +
            '<td>' + priceCell + '</td>';
          tbody.appendChild(tr);
        });

        document.getElementById('xlsxImportOverlay').style.display = 'flex';
        document.body.classList.add('modal-open');
      } catch(err){
        showToast('Erreur : ' + err.message, 'err', 5000);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });

  // ── Confirmer l'import ────────────────────────────────────────
  document.getElementById('btnConfirmXlsxImport').addEventListener('click', async function(){
    var now = new Date().toISOString();
    var added = 0, updated = 0;
    var touchedByXlsx = [];

    // ── Sans droit d'édition directe : chaque ligne part en demande ──
    // (jamais d'écriture directe au catalogue pour ces utilisateurs)
    var hasDirectEditRights = window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin);
    if(!hasDirectEditRights){
      if(typeof window.reqSubmit !== 'function'){
        showToast('Serveur de demandes non configuré — import impossible sans droit d\'édition directe.', 'err', 5000);
        return;
      }
      var btnConfirm = this;
      btnConfirm.disabled = true;
      var toSubmit = xlsxPendingData.filter(function(item){ return item.status !== 'nochange'; });
      var submitted = 0, failed = 0;
      await Promise.all(toSubmit.map(async function(item){
        var payload, original;
        if(item.status === 'new'){
          var initHistory = [];
          var initPrice = '';
          if(item.newCataloguePrice && item.newSellingPrice){
            initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
            initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
            initPrice = item.newSellingPrice;
          } else if(item.newCataloguePrice){
            initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
            initPrice = item.newCataloguePrice;
          } else if(item.newSellingPrice){
            initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
            initPrice = item.newSellingPrice;
          } else if(item.newPrice){
            initHistory.push({price: item.newPrice, date: now});
            initPrice = item.newPrice;
          }
          payload = {
            ref: item.ref, name: item.newName, brand: item.newBrand, family: item.newFamily,
            series: item.newSeries, supplier: item.newSupplier, desc: item.newDesc,
            photo: item.newPhoto, tags: item.newTags, price: initPrice,
            priceCatalogue: item.newCataloguePrice || '', priceHistory: initHistory
          };
          original = null;
        } else {
          var existingP = item.existing;
          payload = Object.assign({}, existingP, {
            name:     item.newName     || existingP.name,
            brand:    item.newBrand    || existingP.brand,
            family:   item.newFamily   || existingP.family,
            series:   item.newSeries   || existingP.series,
            supplier: item.newSupplier || existingP.supplier,
            desc:     item.newDesc     || existingP.desc,
            photo:    item.newPhoto    || existingP.photo,
            tags:     (item.newTags && item.newTags.length) ? item.newTags : existingP.tags,
            price:          item.newSellingPrice   || existingP.price,
            priceCatalogue: item.newCataloguePrice || existingP.priceCatalogue
          });
          original = existingP;
        }
        var ok = await window.reqSubmit(payload, original);
        if(ok) submitted++; else failed++;
      }));
      btnConfirm.disabled = false;
      window._closeXlsxImportOverlay();
      if(submitted){
        showToast(submitted + ' demande(s) envoyée(s) pour approbation' + (failed ? ', ' + failed + ' échec(s)' : ''), failed ? 'warn' : 'ok', 4500);
      } else {
        showToast('Erreur lors de l\'envoi des demandes', 'err', 4000);
      }
      xlsxPendingData = [];
      return;
    }

    xlsxPendingData.forEach(function(item){
      if(item.status === 'nochange') return;

      if(item.status === 'new'){
        // Construire l'historique initial pour un nouveau produit
        var initHistory = [];
        var initPrice = '';
        if(item.newCataloguePrice && item.newSellingPrice){
          // Prix catalogue en historique, prix de vente = prix affiché
          initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
          initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
          initPrice = item.newSellingPrice;
        } else if(item.newCataloguePrice){
          initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
          initPrice = item.newCataloguePrice;
        } else if(item.newSellingPrice){
          initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
          initPrice = item.newSellingPrice;
        } else if(item.newPrice){
          initHistory.push({price: item.newPrice, date: now});
          initPrice = item.newPrice;
        }
        var p = {
          id       : 'p_' + Date.now() + '_' + _secureRandomBase36(6),
          ref      : item.ref,
          name     : item.newName,
          brand    : item.newBrand,
          family   : item.newFamily,
          series   : item.newSeries,
          supplier : item.newSupplier,
          desc     : item.newDesc,
          photo    : item.newPhoto,
          tags     : item.newTags,
          price    : initPrice,
          priceHistory: initHistory,
        };
        products.push(p);
        added++;
        touchedByXlsx.push(p);
      } else {
        // Mise à jour
        var p = item.existing;
        if(item.newName)     p.name     = item.newName;
        if(item.newBrand)    p.brand    = item.newBrand;
        if(item.newFamily)   p.family   = item.newFamily;
        if(item.newSeries)   p.series   = item.newSeries;
        if(item.newSupplier) p.supplier = item.newSupplier;
        if(item.newDesc)     p.desc     = item.newDesc;
        if(item.newPhoto)    p.photo    = item.newPhoto;
        if(item.newTags && item.newTags.length) p.tags = item.newTags;

        // S'assurer que l'historique existe
        if(!Array.isArray(p.priceHistory)) p.priceHistory = [];

        // Normalise un prix pour comparaison fiable (gère '32 €' vs '32' vs '32,00 €')
        function normPriceConfirm(s){
          var str = (s||'').toString().trim().replace(/\s/g,'').replace(/€/g,'').replace(',','.');
          var n = parseFloat(str);
          return isNaN(n) ? str : n.toFixed(2);
        }

        // Prix catalogue a changé ?
        var catChanged     = item.newCataloguePrice &&
          normPriceConfirm(item.newCataloguePrice) !== normPriceConfirm(p.priceCatalogue || '');
        // Prix de vente a changé ?
        var sellingChanged = item.newSellingPrice &&
          normPriceConfirm(item.newSellingPrice) !== normPriceConfirm(p.price || '');

        if(catChanged){
          p.priceCatalogue = item.newCataloguePrice;
          p.priceHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue fabricant'});
        }
        if(sellingChanged){
          p.price = item.newSellingPrice;
          p.priceHistory.push({price: item.newSellingPrice, date: now, label: 'Votre prix'});
        }
        p.updatedAt = Date.now();
        touchedByXlsx.push(p);
        updated++;
      }
    });

    // touchedByXlsx (jamais tout le catalogue) : seuls les produits
    // effectivement ajoutés/modifiés par cet import Excel ont changé — voir
    // les autres correctifs de ce type dans ce fichier.
    save(false, touchedByXlsx); render();
    // Même correctif que pour l'enregistrement d'un produit : rafraîchir
    // aussi la home si l'import a été lancé depuis là (compteur figé sinon
    // jusqu'à un F5 — retour utilisateur).
    var homePageEl2 = document.getElementById('homePage');
    if(homePageEl2 && !homePageEl2.classList.contains('hidden')) renderHome();
    window._closeXlsxImportOverlay();
    showToast(added + ' ajouté(s), ' + updated + ' mis à jour.', 'ok', 4000);
    xlsxPendingData = [];
  });

