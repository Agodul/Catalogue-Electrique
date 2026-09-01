// ---------- Modal ----------
  var overlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  var fBrand = document.getElementById('fBrand');
  var fRef = document.getElementById('fRef');
  var fFamily = document.getElementById('fFamily');
  var fSeries = document.getElementById('fSeries');
  var fSupplier  = document.getElementById('fSupplier');
  var fLeadTime  = document.getElementById('fLeadTime');
  var fUrl = document.getElementById('fUrl');
  var fHtml = document.getElementById('fHtml');
  var chkShowHtml = document.getElementById('chkShowHtml');
  var htmlSourceContent = document.getElementById('htmlSourceContent');
  if(chkShowHtml){
    chkShowHtml.addEventListener('change', function(){
      htmlSourceContent.style.display = chkShowHtml.checked ? 'block' : 'none';
      if(chkShowHtml.checked){ fHtml.focus(); }
    });
  }
  var fName = document.getElementById('fName');
  var fDesc = document.getElementById('fDesc');

  var fPrice = document.getElementById('fPrice');
  var priceDisplayRow = document.getElementById('priceDisplayRow');
  var priceDisplayVal = document.getElementById('priceDisplayVal');
  var priceCreateRow  = document.getElementById('priceCreateRow');

  function updatePriceDisplay(){
    var val = fPrice.value;
    if(priceDisplayVal) priceDisplayVal.textContent = val || '—';
  }
  var fPhoto = document.getElementById('fPhoto');
  var photoPreview     = document.getElementById('photoPreview');
  var imgPreviewOverlay = document.getElementById('imgPreviewOverlay');
  var imgPreviewImg     = document.getElementById('imgPreviewImg');
  var f3dAvailable      = document.getElementById('f3dAvailable');
  var f3dLink           = document.getElementById('f3dLink');
  var f3dLinkRow        = document.getElementById('f3dLinkRow');
  var fEssential        = document.getElementById('fEssential');
  var fSuggestionsSearch = document.getElementById('fSuggestionsSearch');
  var fSuggestionsChips  = document.getElementById('fSuggestionsChips');
  var fSuggestionsDrop   = document.getElementById('fSuggestionsDrop');
  var _sugRefs = []; // tableau des refs sélectionnées (liaison bidirectionnelle avec ces produits)
  // Sous-ensemble de _sugRefs masqué sur CETTE fiche uniquement (la liaison
  // reste connue des deux côtés — voir la case à cocher par puce plus bas et
  // le lien automatique réciproque dans js/actions.js — mais l'affichage sur
  // la fiche produit reste indépendant par fiche : pour masquer une réf. sur
  // l'autre fiche, il faut aller la décocher là-bas, à la main — retour
  // utilisateur).
  var _sugHidden = [];
