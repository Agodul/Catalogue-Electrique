  // ── Pièces de rechange — même mécanique que Produits suggérés ci-dessus
  // (champ + suggestions, liaison réciproque, case à cocher par puce). ──
  var fSparePartsSearch = document.getElementById('fSparePartsSearch');
  var fSparePartsChips  = document.getElementById('fSparePartsChips');
  var fSparePartsDrop   = document.getElementById('fSparePartsDrop');
  var _sparePartsRefs = [];
  var _sparePartsHidden = [];
  var _specsRows = []; // [{key, value}] — caractéristiques techniques libres
  var fTags             = document.getElementById('fTags');
  var tagSuggestionsEl  = document.getElementById('tagSuggestions');
  // Icône de famille — état PARTAGÉ avec le sélecteur d'icônes de
  // js/actions-home.js (_setFamilyIconPreview, iconPickerModal…). Aucun
  // script n'étant encapsulé, tout se joue dans une portée globale unique :
  // ces deux variables étaient déclarées une seconde fois en bas de
  // l'ancien js/actions.js (aujourd'hui js/actions-home.js), ce qui n'en
  // créait pas de nouvelles mais RÉÉCRIVAIT celles-ci au chargement. Ça ne
  // fonctionnait que parce que les fichiers actions-*.js se chargent tous
  // après les fichiers modal-*.js (voir index.html) et imposaient donc leur
  // valeur — la bonne, 'svg-generique' ; la valeur ci-dessous
  // était 'ti-package', un nom d'icône Tabler qui n'existe plus depuis le
  // passage aux images assets/icons/families/svg-*.png (voir familyIcons.js).
  // Inverser les deux balises <script> dans index.html aurait donc suffi à
  // enregistrer tous les produits avec une icône introuvable. Déclaré une
  // seule fois, ici, dans le fichier chargé en premier.
  var familyIconRow     = document.getElementById('familyIconRow');
  var selectedFamilyIcon = 'svg-generique';

