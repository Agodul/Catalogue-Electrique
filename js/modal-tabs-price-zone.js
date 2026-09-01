  // ---------- Tabs ----------
  // Scopé à #productExtractTabs (Extraction automatique/Saisie manuelle) —
  // PAS document.querySelectorAll('.tab-btn') tout court : .tab-btn est une
  // classe générique réutilisée ailleurs sur le site (ex. .req-tab dans le
  // panneau Demandes, voir js/requests.js). Sans ce scope, resetForm()
  // (appelée par _openReviewModal en ouvrant le détail d'une demande) et son
  // switchTab('auto') désactivaient au passage l'onglet actif "Demandes
  // produit"/"Bugs signalés", qui partage la même classe — l'onglet
  // redevenait gris après avoir ouvert puis refermé une demande, sans lien
  // apparent avec ce qui venait d'être cliqué (retour utilisateur : "le
  // bouton de la section en cours n'est plus sélectionné").
  function switchTab(name){
    document.querySelectorAll('#productExtractTabs .tab-btn').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-tab')===name);
    });
    document.getElementById('tab-auto').classList.toggle('active', name==='auto');
    document.getElementById('tab-manual').classList.toggle('active', name==='manual');
  }
  document.querySelectorAll('#productExtractTabs .tab-btn').forEach(function(b){
    b.addEventListener('click', function(){ switchTab(b.getAttribute('data-tab')); });
  });

  fPhoto.addEventListener('input', updatePhotoPreview);
  var pricePreviewEl = document.getElementById('pricePreview');
  // fPrice input géré par la modale prix

  // ---------- Zone prix de vente ----------
  var sellingPriceZoneEl = document.getElementById('sellingPriceZone');
  var fSellingPrice      = document.getElementById('fSellingPrice');
  var sellingPriceHint   = document.getElementById('sellingPriceHint');
  // fTags déclaré en haut du fichier
  // f3dAvailable, f3dLink, f3dLinkRow déclarés en haut du fichier

  function updateSellingPriceHint(){
    if(!sellingPriceZoneEl || sellingPriceZoneEl.style.display === 'none') return;
    var catalogue = parsePriceNumber(fPrice.value);
    var selling   = parsePriceNumber(fSellingPrice.value);
    if(catalogue && selling){
      var diff = ((selling - catalogue) / catalogue) * 100;
      var sign = diff >= 0 ? '+' : '';
      sellingPriceHint.textContent = 'Prix catalogue fabricant : ' + formatPrice(fPrice.value) +
        ' → Votre prix : ' + formatPrice(fSellingPrice.value) +
        ' (' + sign + diff.toFixed(1) + ' %)';
    } else {
      sellingPriceHint.textContent = '';
    }
  }
  fSellingPrice.addEventListener('input', updateSellingPriceHint);

  function update3dLinkVisibility(){
    f3dLinkRow.style.display = f3dAvailable.checked ? 'block' : 'none';
  }
  f3dAvailable.addEventListener('change', update3dLinkVisibility);

  function updatePhotoPreview(){
    if(fPhoto.value.trim()){
      photoPreview.innerHTML = '<img src="'+escapeHtml(fPhoto.value.trim())+'" data-fallback="parent-note">';
    }else{
      photoPreview.innerHTML = '<span class="hint sans" style="padding:6px;text-align:center;">aperçu</span>';
    clearPhotoGallery();
    }
  }

