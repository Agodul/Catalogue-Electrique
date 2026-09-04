  // ── Modale gestion des prix ───────────────────────────────────────
  function openPriceModal(){
    var p = products.find(function(x){ return x.id === editingId; });
    if(!p) return;

    // Ref produit en sous-titre
    document.getElementById('priceModalRef').textContent = (p.brand ? p.brand + ' — ' : '') + (p.ref || p.name || '');

    // Prix catalogue / prix remisé actuels
    var remiseActive = hasActiveRemise(p);
    document.getElementById('priceModalCurrentCatalogue').textContent = (p.priceCatalogue || p.price || '—');
    document.getElementById('priceModalCurrentRemiseWrap').style.display = remiseActive ? '' : 'none';
    document.getElementById('priceModalCurrent').textContent = p.price || '—';

    // Delta global
    var deltaEl = document.getElementById('priceModalDelta');
    if(Array.isArray(p.priceHistory) && p.priceHistory.length > 0 && p.price){
      var first = parsePriceNumber(p.priceHistory[0].price);
      var cur   = parsePriceNumber(p.price);
      if(first && cur && first !== 0){
        var pct = ((cur - first) / first) * 100;
        var sign = pct >= 0 ? '+' : '';
        deltaEl.textContent = sign + pct.toFixed(1) + ' %';
        deltaEl.style.color = pct > 0 ? 'var(--warn)' : (pct < 0 ? 'var(--moss,#4a7c59)' : 'var(--ink-soft)');
      } else { deltaEl.textContent = '—'; deltaEl.style.color = ''; }
    } else { deltaEl.textContent = '—'; deltaEl.style.color = ''; }

    renderPriceModalTable(p);

    // Pré-remplir date du jour
    var today = new Date();
    var dd = String(today.getDate()).padStart(2,'0');
    var mm = String(today.getMonth()+1).padStart(2,'0');
    document.getElementById('priceModalNewDate').value = today.getFullYear()+'-'+mm+'-'+dd;
    // Pré-remplir avec les valeurs actuelles : modifier juste l'un des deux
    // champs et cliquer sur Ajouter ne touche alors que ce prix-là.
    document.getElementById('priceModalNewCatalogue').value = p.priceCatalogue || p.price || '';
    document.getElementById('priceModalNewRemise').value = remiseActive ? p.price : '';
    document.getElementById('priceModalError').style.display = 'none';

    priceModalOverlay.style.display = 'flex';
  }

  function closePriceModal(){
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(priceModalOverlay, function(){ priceModalOverlay.style.display = 'none'; });
    } else {
      priceModalOverlay.style.display = 'none';
    }
  }

  function renderPriceModalTable(p){
    var tbody = document.getElementById('priceModalBody');
    var emptyEl = document.getElementById('priceModalEmpty');
    tbody.innerHTML = '';

    var history = Array.isArray(p.priceHistory) ? p.priceHistory : [];
    var all = history.map(function(h){ return {price: h.price, date: h.date, label: h.label||'', current: false}; });
    if(p.price) all.push({price: p.price, date: null, label: hasActiveRemise(p) ? 'Votre prix' : '', current: true});

    if(all.length === 0){ emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';

    all.forEach(function(entry, i){
      var tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--line)';
      if(entry.current){ tr.style.background = 'var(--paper)'; tr.style.fontStyle = 'italic'; }

      // Date
      var tdDate = document.createElement('td');
      tdDate.style.cssText = 'padding:8px 10px;color:var(--ink-soft);white-space:nowrap;font-size:13px;';
      tdDate.textContent = entry.current ? 'Prix actuel' : (entry.date ? new Date(entry.date).toLocaleDateString('fr-FR') : '—');
      tr.appendChild(tdDate);

      // Prix
      var tdPrice = document.createElement('td');
      tdPrice.style.cssText = 'padding:8px 10px;text-align:right;font-weight:600;white-space:nowrap;font-size:13px;';
      tdPrice.textContent = entry.price || '—';
      if(entry.label){
        var lblSpan = document.createElement('span');
        lblSpan.style.cssText = 'display:block;font-weight:400;font-size:10.5px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em;';
        lblSpan.textContent = entry.label;
        tdPrice.appendChild(lblSpan);
      }
      tr.appendChild(tdPrice);

      // Delta
      var tdDelta = document.createElement('td');
      tdDelta.style.cssText = 'padding:8px 10px;text-align:right;font-size:13px;';
      if(i > 0){
        var prev = parsePriceNumber(all[i-1].price);
        var cur  = parsePriceNumber(entry.price);
        if(prev && cur && prev !== 0){
          var pct = ((cur - prev) / prev) * 100;
          var sign = pct >= 0 ? '▲ +' : '▼ ';
          var span = document.createElement('span');
          span.style.cssText = 'font-weight:600;font-size:12px;padding:2px 6px;border-radius:10px;';
          span.textContent = sign + pct.toFixed(1) + ' %';
          if(pct > 0){ span.style.background='#FEE2E2'; span.style.color='var(--warn)'; }
          else if(pct < 0){ span.style.background='#EAF3DE'; span.style.color='#3B6D11'; }
          tdDelta.appendChild(span);
        }
      }
      tr.appendChild(tdDelta);

      // Supprimer (pas sur le prix actuel)
      var tdDel = document.createElement('td');
      tdDel.style.cssText = 'padding:8px 6px;width:32px;';
      if(!entry.current){
        var btn = document.createElement('button');
        btn.style.cssText = 'background:none;border:none;color:var(--ink-soft);font-size:16px;cursor:pointer;padding:0 4px;border-radius:3px;';
        btn.textContent = '×';
        btn.title = 'Supprimer';
        btn.addEventListener('mouseover', function(){ this.style.color='var(--warn)'; this.style.background='#FEE2E2'; });
        btn.addEventListener('mouseout',  function(){ this.style.color='var(--ink-soft)'; this.style.background='none'; });
        btn.addEventListener('click', function(){
          var prod = products.find(function(x){ return x.id === editingId; });
          if(!prod) return;
          prod.priceHistory.splice(i, 1);
          // [prod] : seul CE produit a été touché — save() sans filtre
          // repoussait tout le catalogue local au serveur pour la suppression
          // d'UNE seule ligne d'historique de prix (même risque que le bug
          // corrigé dans syncFromServer/pushToServer : un catalogue local
          // resté en retard écraserait les modifs récentes d'autrui).
          save(false, [prod]);
          renderPriceModalTable(prod);
          renderPriceHistory(prod);
          document.getElementById('priceModalCurrent').textContent = prod.price || '—';
        });
        tdDel.appendChild(btn);
      }
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    });
  }

  // Bouton ouvrir modale prix (visible uniquement en mode édition)
  if(btnOpenPriceModal){
    btnOpenPriceModal.addEventListener('click', openPriceModal);
    btnOpenPriceModal.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; this.style.color='var(--copper)'; });
    btnOpenPriceModal.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; this.style.color='var(--ink)'; });
  }

  document.getElementById('priceModalClose').addEventListener('click', closePriceModal);
  document.getElementById('priceModalCancel').addEventListener('click', closePriceModal);
  // clic extérieur bloqué — géré par _initModalEscape()

  // Ajouter un nouveau prix — le prix catalogue et le prix remisé sont
  // modifiés indépendamment : ne renseigner que l'un des deux ne touche que
  // ce prix-là (les champs sont pré-remplis avec les valeurs actuelles par
  // openPriceModal, donc laisser un champ inchangé revient à ne rien lui
  // faire). Même logique que l'import Excel en masse (catChanged/sellingChanged).
  document.getElementById('priceModalAddBtn').addEventListener('click', function(){
    var rawCat = document.getElementById('priceModalNewCatalogue').value.trim();
    var rawRem = document.getElementById('priceModalNewRemise').value.trim();
    var rawDate = document.getElementById('priceModalNewDate').value;
    var errEl = document.getElementById('priceModalError');
    errEl.style.display = 'none';

    if(!rawCat && !rawRem){
      errEl.textContent = 'Renseignez le prix catalogue, le prix remisé, ou les deux.';
      errEl.style.display = 'block';
      return;
    }

    var p = products.find(function(x){ return x.id === editingId; });
    if(!p) return;

    // À vérifier AVANT toute modification : s'il n'y avait pas de remise en
    // cours, une mise à jour du seul prix catalogue doit suivre sur le prix
    // affiché plutôt que fabriquer une remise qui n'existait pas.
    var hadDiscount = hasActiveRemise(p);

    var dateMs = rawDate ? new Date(rawDate).getTime() : Date.now();
    var history = Array.isArray(p.priceHistory) ? p.priceHistory.slice() : [];
    var changed = false;

    if(rawCat){
      var newCat = formatPrice(rawCat);
      if(newCat !== (p.priceCatalogue || '')){
        if(p.priceCatalogue) history.push({price: p.priceCatalogue, date: dateMs, label: 'Prix catalogue'});
        p.priceCatalogue = newCat;
        changed = true;
      }
    }

    if(rawRem){
      var newRem = formatPrice(rawRem);
      if(newRem !== (p.price || '')){
        if(p.price) history.push({price: p.price, date: dateMs, label: 'Votre prix'});
        p.price = newRem;
        changed = true;
      }
    } else if(rawCat && !hadDiscount && formatPrice(rawCat) !== (p.price || '')){
      // Pas de remise active : le prix affiché suit le prix catalogue
      if(p.price) history.push({price: p.price, date: dateMs, label: 'Votre prix'});
      p.price = formatPrice(rawCat);
      changed = true;
    }

    if(!changed){
      errEl.textContent = 'Les valeurs saisies sont identiques aux prix actuels.';
      errEl.style.display = 'block';
      return;
    }

    p.priceHistory = history;
    fPrice.value = p.price || '';
    updatePriceDisplay();

    // [p] : seul CE produit a été touché — voir commentaire équivalent sur
    // la suppression d'une ligne d'historique de prix un peu plus haut.
    save(false, [p]); render();
    renderPriceHistory(p);
    renderPriceModalTable(p);

    var remiseActive = hasActiveRemise(p);
    document.getElementById('priceModalCurrentCatalogue').textContent = p.priceCatalogue || p.price || '—';
    document.getElementById('priceModalCurrentRemiseWrap').style.display = remiseActive ? '' : 'none';
    document.getElementById('priceModalCurrent').textContent = p.price || '—';
    document.getElementById('priceModalNewCatalogue').value = p.priceCatalogue || p.price || '';
    document.getElementById('priceModalNewRemise').value = remiseActive ? p.price : '';
  });

  // Appliquer et fermer
  document.getElementById('priceModalSave').addEventListener('click', function(){
    var p = products.find(function(x){ return x.id === editingId; });
    if(p) renderPriceHistory(p);
    closePriceModal();
  });

  function renderPriceHistory(product){ /* géré par la modale prix */ }
  function resetForm(){
    // chkShowHtml/htmlSourceContent n'existent plus (retour utilisateur :
    // "je voudrai supprimer le mode collé le code source", voir
    // js/templates.js/js/modal-core.js) — fHtml reste à vider, c'est
    // toujours un rouage interne du moteur d'extraction générique.
    fBrand.value=''; fRef.value=''; fFamily.value=''; fSeries.value=''; fSupplier.value=''; if(fLeadTime) fLeadTime.value=''; fUrl.value=''; fHtml.value='';
    familyIconRow.classList.remove('show');
    selectedFamilyIcon = 'svg-generique';
    _setFamilyIconPreview('svg-generique');
    fName.value=''; fDesc.value=''; fTags.value=''; fPrice.value=''; fPhoto.value='';
    renderTagSuggestions();
    if(priceDisplayRow) priceDisplayRow.style.display = 'none';
    if(priceCreateRow)  priceCreateRow.style.display  = 'block';
    f3dAvailable.checked = false;
    f3dLink.value = '';
    f3dLinkRow.style.display = 'none';
    if(fEssential) fEssential.checked = false;
    _sugRefs = [];
    _sugHidden = [];
    _sugRenderChips();
    _sparePartsRefs = [];
    _sparePartsHidden = [];
    _sparePartsRenderChips();
    _specsRows = [];
    _specsRenderRows();
    photoPreview.innerHTML = '<span class="hint sans" style="padding:6px;text-align:center;">aperçu</span>';
    clearPhotoGallery();
    extractStatus.className = 'extract-status'; extractStatus.textContent='';
    refCheckMsgEl.className = 'ref-check-msg'; refCheckMsgEl.textContent = '';
    refDupIconEl.classList.remove('show'); refDupTooltipEl.textContent = '';
    refDupBannerEl.textContent = ''; refDupBannerEl.classList.remove('open');
    var btnSaveReset = document.getElementById('btnSave');
    btnSaveReset.disabled = false; btnSaveReset.style.opacity = ''; btnSaveReset.style.cursor = '';
    // Reset zone prix de vente
    sellingPriceZoneEl.style.display = 'none';
    fSellingPrice.value = '';
    sellingPriceHint.textContent = '';
    switchTab('auto');
  }
