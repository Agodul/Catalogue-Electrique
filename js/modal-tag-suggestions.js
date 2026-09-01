  // ── Suggestions de tags depuis la description ───────────────────────
  var TAG_STOPWORDS = ['pour','avec','sans','dans','entre','vers','sous','chez',
    'les','des','une','un','le','la','de','du','et','ou','ce','cet','cette','ces',
    'est','sont','sur','par','au','aux','en','plus','tres','tout','tous','toute',
    'toutes','qui','que','quoi','son','sa','ses','leur','leurs','ne','pas','aussi',
    'comme','etre','avoir','ainsi','ils','elle','elles','il','on','notre','votre',
    'nos','vos','permet','permettant','ideal','idéal','produit','produits'];

  function extractTagSuggestions(desc, existingTags){
    // Retirer les balises HTML avant d'extraire des mots — sans ça, une
    // description contenant du HTML collé par erreur (ex. copié depuis une
    // page web) polluait les suggestions avec des mots comme "html" ou
    // "script" au lieu de vrais mots-clés produit (retour utilisateur).
    var cleanDesc = stripHtmlTags(desc || '');
    var norm = typeof normalizeSearch === 'function' ? normalizeSearch(cleanDesc) : cleanDesc.toLowerCase();
    var words = norm.split(/[\s-]+/).filter(Boolean);
    var existing = {};
    (existingTags||[]).forEach(function(t){
      var nt = typeof normalizeSearch === 'function' ? normalizeSearch(t) : t.toLowerCase();
      existing[nt] = true;
    });
    var seen = {};
    var out = [];
    words.forEach(function(w){
      if(w.length < 4 || w.length > 20) return;
      if(TAG_STOPWORDS.indexOf(w) !== -1) return;
      if(/^\d+$/.test(w)) return;
      if(seen[w] || existing[w]) return;
      seen[w] = true;
      out.push(w);
    });
    return out.slice(0, 8);
  }

  function renderTagSuggestions(){
    if(!tagSuggestionsEl || !fDesc || !fTags) return;
    var currentTags = fTags.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean);
    var suggestions = extractTagSuggestions(fDesc.value, currentTags);
    if(!suggestions.length){
      tagSuggestionsEl.style.display = 'none';
      tagSuggestionsEl.innerHTML = '';
      return;
    }
    tagSuggestionsEl.style.display = 'flex';
    tagSuggestionsEl.innerHTML = suggestions.map(function(w){
      return '<button type="button" class="tag-suggestion-chip" data-word="'+escapeHtml(w)+'">+ '+escapeHtml(w)+'</button>';
    }).join('');
  }

  if(fDesc){
    var _tagSuggestTimer = null;
    fDesc.addEventListener('input', function(){
      clearTimeout(_tagSuggestTimer);
      _tagSuggestTimer = setTimeout(renderTagSuggestions, 300);
    });
  }
  if(fTags) fTags.addEventListener('input', renderTagSuggestions);
  if(tagSuggestionsEl){
    tagSuggestionsEl.addEventListener('click', function(e){
      var btn = e.target.closest('.tag-suggestion-chip');
      if(!btn) return;
      var word = btn.getAttribute('data-word');
      var current = fTags.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean);
      if(current.indexOf(word) === -1) current.push(word);
      fTags.value = current.join(', ');
      renderTagSuggestions();
    });
  }

  photoPreview.addEventListener('click', function(){
    var img = photoPreview.querySelector('img');
    if(!img) return;
    imgPreviewImg.src = img.src;
    imgPreviewOverlay.classList.add('show');
  });
  imgPreviewOverlay.addEventListener('click', function(){
    imgPreviewOverlay.classList.remove('show');
    imgPreviewImg.src = '';
  });
  // Fermer avec Escape
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') imgPreviewOverlay.classList.remove('show');
  });
  var photoGallery     = document.getElementById('photoGallery');
  var photoGalleryGrid = document.getElementById('photoGalleryGrid');
  // Photos candidates en mémoire — jamais stockées, vidées à la fermeture de la modale
  var pendingPhotos = [];

  function showPhotoGallery(photos){
    pendingPhotos = photos || [];
    photoGalleryGrid.innerHTML = '';
    if(pendingPhotos.length <= 1){ photoGallery.classList.remove('show'); return; }
    pendingPhotos.forEach(function(url, idx){
      var thumb = document.createElement('div');
      thumb.className = 'photo-gallery-thumb' + (idx === 0 ? ' selected' : '');
      thumb.innerHTML = '<img src="'+escapeHtml(url)+'" loading="lazy" data-fallback="hide-parent">'
                      + '<span class="thumb-check">✓</span>';
      thumb.addEventListener('click', function(){
        photoGalleryGrid.querySelectorAll('.photo-gallery-thumb').forEach(function(t){ t.classList.remove('selected'); });
        thumb.classList.add('selected');
        fPhoto.value = url;
        updatePhotoPreview();
      });
      photoGalleryGrid.appendChild(thumb);
    });
    photoGallery.classList.add('show');
  }

  function clearPhotoGallery(){
    pendingPhotos = [];
    photoGalleryGrid.innerHTML = '';
    photoGallery.classList.remove('show');
  }
  var extractStatus = document.getElementById('extractStatus');
  var modalLeftFoot = document.getElementById('modalLeftFoot');

  var PRICE_ALERT_THRESHOLD = 3; // % d'augmentation à partir duquel on signale une grosse hausse
  var btnOpenPriceModal   = document.getElementById('btnOpenPriceModal');
  var priceModalOverlay   = document.getElementById('priceModalOverlay');

  // Une remise est active quand le prix catalogue et le prix affiché sont
  // tous les deux connus et différents.
  function hasActiveRemise(p){
    return !!(p.priceCatalogue && p.price && p.priceCatalogue !== p.price);
  }

