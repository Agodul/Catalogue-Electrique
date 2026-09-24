  fPhoto.addEventListener('input', updatePhotoPreview);
  var pricePreviewEl = document.getElementById('pricePreview');
  // fPrice input géré par la modale prix

  // ---------- Zone prix de vente ----------
  var sellingPriceZoneEl = document.getElementById('sellingPriceZone');
  var fSellingPrice      = document.getElementById('fSellingPrice');
  _restrictToPriceChars(fSellingPrice);
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

