// ---------- Modal ----------
  var overlay = document.getElementById('modalOverlay');
  var modalTitle = document.getElementById('modalTitle');
  // Domaine (Électrique/Pneumatique) — voir window._getActiveDomain/
  // _setActiveDomain dans js/storage.js. Lu/écrit ici comme n'importe quel
  // autre champ du formulaire (resetForm/fillFormFromProduct/payload de
  // sauvegarde), rien de spécifique au cycle de vie de la modale.
  var fDomain = document.getElementById('fDomain');
  var fBrand = document.getElementById('fBrand');
  var fRef = document.getElementById('fRef');
  // Retour utilisateur : "faudrai mettre en rouge les zone a remplir
  // obligatoirement" — Marque et Référence sont les deux seuls champs
  // bloquants à l'enregistrement (voir la validation dans
  // js/actions-save.js, qui appelle _markFieldInvalid). Le contour rouge
  // (.field-invalid, voir css/styles.css) repart dès que l'utilisateur
  // retape dans le champ fautif, pas seulement à la réouverture de la
  // fenêtre — sinon il resterait rouge même une fois corrigé tant qu'on n'a
  // pas re-cliqué "Enregistrer".
  function _markFieldInvalid(el){ if(el) el.classList.add('field-invalid'); }
  function _clearFieldInvalid(el){ if(el) el.classList.remove('field-invalid'); }
  [fBrand, fRef].forEach(function(el){
    if(el) el.addEventListener('input', function(){ _clearFieldInvalid(el); });
  });
  var fFamily = document.getElementById('fFamily');
  var fSeries = document.getElementById('fSeries');
  var fSupplier  = document.getElementById('fSupplier');
  var fLeadTime  = document.getElementById('fLeadTime');
  var fUrl = document.getElementById('fUrl');
  // #fHtml reste un rouage interne du moteur d'extraction générique
  // (jamais affiché ni actionné à la main désormais — retour utilisateur :
  // "je voudrai supprimer le mode collé le code source", voir
  // js/templates.js) : plus de case à cocher à câbler ici.
  var fHtml = document.getElementById('fHtml');
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
  var fSpiLabs          = document.getElementById('fSpiLabs');
  var fSuggestionsSearch = document.getElementById('fSuggestionsSearch');
  var fSuggestionsChips  = document.getElementById('fSuggestionsChips');
  var fSuggestionsDrop   = document.getElementById('fSuggestionsDrop');
  var _sugRefs = []; // tableau des refs sélectionnées (liaison bidirectionnelle avec ces produits)
  // Sous-ensemble de _sugRefs masqué sur CETTE fiche uniquement (la liaison
  // reste connue des deux côtés — voir la case à cocher par puce plus bas et
  // le lien automatique réciproque dans js/actions-save.js — mais l'affichage sur
  // la fiche produit reste indépendant par fiche : pour masquer une réf. sur
  // l'autre fiche, il faut aller la décocher là-bas, à la main — retour
  // utilisateur).
  var _sugHidden = [];
