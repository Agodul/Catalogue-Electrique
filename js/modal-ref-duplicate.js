  // ---------- Vérification de référence en doublon ----------
  var refCheckMsgEl  = document.getElementById('refCheckMsg');
  var refDupIconEl    = document.getElementById('refDupIcon');
  var refDupTooltipEl = document.getElementById('refDupTooltip');
  var refDupBannerEl  = document.getElementById('refDupBanner');
  function normalizeRef(s){ return (s||'').trim().toLowerCase(); }

  function checkDuplicateRef(){
    var brand = fBrand.value.trim();
    var ref = fRef.value.trim();
    if(!ref){
      refCheckMsgEl.className = 'ref-check-msg'; refCheckMsgEl.textContent = '';
    refDupIconEl.classList.remove('show'); refDupTooltipEl.textContent = '';
    refDupBannerEl.textContent = ''; refDupBannerEl.classList.remove('open');
    var btnSaveReset = document.getElementById('btnSave');
    btnSaveReset.disabled = false; btnSaveReset.style.opacity = ''; btnSaveReset.style.cursor = '';
      return;
    }
    var match = products.find(function(p){
      if(p.id === editingId) return false; // ignore le produit en cours d'édition lui-même
      var sameRef = normalizeRef(p.ref) === normalizeRef(ref);
      var sameBrand = brand ? normalizeRef(p.brand) === normalizeRef(brand) : true;
      return sameRef && sameBrand;
    });
    var btnSave = document.getElementById('btnSave');
    if(match){
      refCheckMsgEl.className = 'ref-check-msg warn show';
      refCheckMsgEl.textContent = '';
      refDupIconEl.classList.add('show');
      var dupMsg = 'Référence déjà présente pour ' + (match.brand || 'cette marque')
        + (match.name ? ' — « ' + match.name + ' »' : '') + '.';
      refDupTooltipEl.textContent = dupMsg;
      refDupBannerEl.textContent  = dupMsg;
      // Le bandeau s'affiche uniquement au tap sur l'icône (mobile)
      btnSave.disabled = true;
      btnSave.style.opacity = '0.4';
      btnSave.style.cursor  = 'not-allowed';
    }else{
      refCheckMsgEl.className = 'ref-check-msg';
      refCheckMsgEl.textContent = '';
      refDupIconEl.classList.remove('show');
      refDupTooltipEl.textContent = '';
      refDupBannerEl.textContent  = '';
      refDupBannerEl.classList.remove('open');
      btnSave.disabled = false;
      btnSave.style.opacity = '';
      btnSave.style.cursor  = '';
    }
  }
  fRef.addEventListener('input', checkDuplicateRef);
  fBrand.addEventListener('input', checkDuplicateRef);
