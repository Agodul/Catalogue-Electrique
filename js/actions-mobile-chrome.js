  // ── Fermeture mutuelle des sheets ────────────────────────────
  // Ouvre le tiroir menu mobile/tablette — extrait du click handler de
  // bnMenu (bottom nav) pour être réutilisable, notamment pour rouvrir le
  // menu quand on ferme "Demandes en attente" après y être entré depuis ce
  // menu (voir reqClosePanel dans js/requests.js — retour utilisateur).
  window._openMenuSheet = function(){
    var sheet   = document.getElementById('menuSheet');
    var overlay = document.getElementById('menuSheetOverlay');
    if(!sheet) return;
    overlay.style.display='block';
    sheet.style.display='block';
    sheet.offsetHeight;
    sheet.classList.add('open');
    document.body.classList.add('modal-open');
    if(typeof window._syncMenuAuth === 'function') window._syncMenuAuth();
    var bnMenuBtn = document.getElementById('bnMenu');
    if(bnMenuBtn){
      [document.getElementById('bnHome'),document.getElementById('bnSearch'),document.getElementById('bnFilter'),bnMenuBtn]
        .forEach(function(b){ if(b) b.classList.remove('active'); });
      bnMenuBtn.classList.add('active');
    }
  };

  window._closeAllSheets = function(){
    // Filter sheet
    var fs = document.getElementById('filterSheet');
    var fo = document.getElementById('filterSheetOverlay');
    if(fs){ fs.classList.remove('open'); }
    if(fo){ fo.style.display = 'none'; }

    // Menu sheet
    var ms  = document.getElementById('menuSheet');
    var mso = document.getElementById('menuSheetOverlay');
    if(ms){ ms.classList.remove('open'); setTimeout(function(){ if(!ms.classList.contains('open')) ms.style.display='none'; }, 300); }
    if(mso){ mso.style.display = 'none'; }

    document.body.classList.remove('modal-open');
  };


  // ── Bottom Nav Bar ─────────────────────────────────────────────
  window._initBottomNav = function(){
    try {
      var bnHome   = document.getElementById('bnHome');
      var bnSearch = document.getElementById('bnSearch');
      var bnFilter = document.getElementById('bnFilter');
      var bnMenu   = document.getElementById('bnMenu');
      var bnFilterBadge = document.getElementById('bnFilterBadge');
      if(!bnHome) return;

      function setActive(btn){
        [bnHome,bnSearch,bnFilter,bnMenu].forEach(function(b){ if(b) b.classList.remove('active'); });
        if(btn) btn.classList.add('active');
      }

      function closeMenuSheet(){
        var ms=document.getElementById('menuSheet');
        var mso=document.getElementById('menuSheetOverlay');
        if(ms&&ms.classList.contains('open')){
          ms.classList.remove('open');
          if(mso) mso.style.display='none';
          document.body.classList.remove('modal-open');
          setTimeout(function(){ if(!ms.classList.contains('open')) ms.style.display='none'; },300);
        }
      }

      function closeFloatingSearchNow(){
        // Ferme visuellement sans reset (changement d'onglet nav)
        if(window._closeMobileSearchBar) window._closeMobileSearchBar(false);
        var fSearch=document.getElementById('floatingSearch');
        var fOverlay=document.getElementById('floatingSearchOverlay');
        var fInput=document.getElementById('floatingSearchInput');
        if(fSearch){ fSearch.style.display='none'; fSearch.style.transform=''; fSearch.style.marginBottom='0'; fSearch.style.bottom='0'; }
        if(fOverlay) fOverlay.style.display='none';
        if(fInput) fInput.blur();
      }

      function closeFilterSheetNow(){
        var fs=document.getElementById('filterSheet');
        var fo=document.getElementById('filterSheetOverlay');
        if(fs) fs.classList.remove('open');
        if(fo) fo.style.display='none';
        document.body.classList.remove('modal-open');
      }

      // Fermeture générale de TOUTES les autres fenêtres ouvertes (Paramètres,
      // configurateur d'armoire, connexion, documents, caractéristiques,
      // suggestions, demandes, conflits, etc.) — remplace les fermetures au
      // cas par cas qui ne couvraient que Paramètres/Armoire/Connexion et
      // laissaient toutes les autres ouvertes derrière (retour utilisateur :
      // vérifié sur les autres fenêtres mobiles, plusieurs ne se fermaient
      // pas). Réutilise la liste centralisée dans js/init.js
      // (_initModalEscape) — voir window._closeAllOverlays, qui exclut déjà
      // viewOverlay (traité séparément juste en dessous : son bouton fermer
      // peut remonter d'un niveau au lieu de fermer, voir closeView()).
      function closeAllOverlaysNow(){
        if(typeof window._closeAllOverlays === 'function') window._closeAllOverlays();
      }

      // Ferme complètement la fiche produit (jamais la navigation "retour
      // en arrière" de closeView() lors d'un changement d'onglet nav).
      function closeViewOverlayNow(){
        var _vo=document.getElementById('viewOverlay');
        if(_vo&&_vo.classList.contains('open')){_vo.classList.remove('open');document.body.classList.remove('modal-open');if(window._viewingId!==undefined)window._viewingId=null;}
      }

      bnHome.addEventListener('click', function(){
        closeMenuSheet();
        closeFloatingSearchNow();
        closeFilterSheetNow();
        closeAllOverlaysNow();
        closeViewOverlayNow();
        showHome();
        setActive(bnHome);
        // Remonter en haut de page
        window.scrollTo({ top: 0, behavior: 'smooth' });
        var ac = document.getElementById('appContent');
        if(ac) ac.scrollTo({ top: 0, behavior: 'smooth' });
      });

      bnSearch.addEventListener('click', function(){
        closeMenuSheet();
        closeFilterSheetNow();
        closeAllOverlaysNow();
        closeViewOverlayNow();
        var home = document.getElementById('homePage');
        if(home && !home.classList.contains('hidden')) showCatalogueAll();
        // Ouvrir la barre de recherche mobile sticky
        if(typeof _openMobileSearchBar === 'function') _openMobileSearchBar();
        setActive(bnSearch);
      });

      bnFilter.addEventListener('click', function(){
        closeMenuSheet();
        closeFloatingSearchNow();
        closeAllOverlaysNow();
        closeViewOverlayNow();
        var home=document.getElementById('homePage');
        var wasHome = home && !home.classList.contains('hidden');
        if(wasHome){
          showCatalogueAll();
          // Ouvrir le sheet après le rendu du catalogue
          setTimeout(function(){
            if(typeof window._openFilterSheet === 'function') window._openFilterSheet();
          }, 50);
        } else {
          if(typeof window._openFilterSheet === 'function') window._openFilterSheet();
        }
        setActive(bnFilter);
      });

      bnMenu.addEventListener('click', function(){
        closeFloatingSearchNow();
        closeFilterSheetNow();
        closeAllOverlaysNow();
        // Contrairement à Accueil/Recherche/Filtres (qui ramènent vraiment à
        // la liste catalogue), le Menu n'est qu'un tiroir posé par-dessus —
        // il s'affiche largement au-dessus de la fiche produit (voir
        // --z-sheet-high vs --z-overlay) sans la recouvrir entièrement. Pas
        // de raison de fermer la fiche en cours de consultation pour
        // l'ouvrir (retour utilisateur : perdait sa place en consultant un
        // produit sur mobile juste en ouvrant le menu).
        if(typeof window._openMenuSheet === 'function') window._openMenuSheet();
      });

      // Floating search logic
      var floatOverlay = document.getElementById('floatingSearchOverlay');
      var floatSearch  = document.getElementById('floatingSearch');
      var floatInput   = document.getElementById('floatingSearchInput');
      var floatClose   = document.getElementById('floatingSearchClose');
      var mainInput    = document.getElementById('searchInput');

      var _bottomNav = document.getElementById('bottomNav');

      // Ferme visuellement sans toucher aux valeurs (Entrée / validation)
      function closeFloatingSearchOnly(){
        if(window._closeMobileSearchBar) window._closeMobileSearchBar(false);
        if(floatSearch){
          floatSearch.style.display      = 'none';
          floatSearch.style.transform    = '';
          floatSearch.style.marginBottom = '0';
          floatSearch.style.bottom       = '0';
        }
        if(floatOverlay) floatOverlay.style.display = 'none';
        if(floatInput)   floatInput.blur();
      }

      // Ferme + remet à zéro (croix / overlay / annuler)
      function closeFloatingSearch(){
        if(window._closeMobileSearchBar) window._closeMobileSearchBar(true);
        closeFloatingSearchOnly();
        var bfEl=document.getElementById('familyFilter');
        var bbEl=document.getElementById('brandFilter');
        var bsEl=document.getElementById('seriesFilter');
        var si=document.getElementById('searchInput');
        if(bfEl) bfEl.value='';
        if(bbEl) bbEl.value='';
        if(bsEl) bsEl.value='';
        if(si) si.value='';
        if(typeof render==='function') render();
      }

      // ── Positionnement zone de recherche iOS ─────────────────────
      // On écoute uniquement resize (ouverture/fermeture clavier)
      // PAS scroll (ferait bouger la zone quand l'utilisateur scrolle)
      // ── Barre de recherche mobile sticky ─────────────────────────
      var _mobileSearchBar   = document.getElementById('mobileSearchBar');
      var _mobileSearchInput = document.getElementById('mobileSearchInput');
      var _mobileSearchClear = document.getElementById('mobileSearchClear');
      var _mobileSearchCancel= document.getElementById('mobileSearchCancel');

      function _openMobileSearchBar(){
        var si = document.getElementById('searchInput');
        if(_mobileSearchBar){
          _mobileSearchBar.style.display = 'block';
          if(_mobileSearchInput){
            _mobileSearchInput.value = si ? si.value : '';
            _mobileSearchClear && (_mobileSearchClear.style.display = _mobileSearchInput.value ? '' : 'none');
            // Scroll en haut puis focus — clavier s'ouvre naturellement
            // Scroller le conteneur appContent (pas window) sur mobile
            var _ac = document.getElementById('appContent');
            if(_ac) _ac.scrollTop = 0; else window.scrollTo({ top: 0, behavior: 'instant' });
            setTimeout(function(){ _mobileSearchInput.focus(); }, 80);
          }
        }
      }

      function _closeMobileSearchBar(doReset){
        if(_mobileSearchBar) _mobileSearchBar.style.display = 'none';
        if(_mobileSearchInput) _mobileSearchInput.blur();
        if(doReset){
          if(_mobileSearchInput) _mobileSearchInput.value = '';
          var si = document.getElementById('searchInput');
          if(si){ si.value = ''; if(typeof render==='function') render(); }
        }
      }

      if(_mobileSearchInput){
        _mobileSearchInput.addEventListener('input', function(){
          var si = document.getElementById('searchInput');
          if(si){ si.value = _mobileSearchInput.value; if(typeof render==='function') render(); }
          if(_mobileSearchClear) _mobileSearchClear.style.display = _mobileSearchInput.value ? '' : 'none';
        });
        _mobileSearchInput.addEventListener('keydown', function(e){
          if(e.key === 'Enter'){ _mobileSearchInput.blur(); }
        });
      }
      if(_mobileSearchClear) _mobileSearchClear.addEventListener('click', function(){
        if(_mobileSearchInput){ _mobileSearchInput.value = ''; _mobileSearchInput.focus(); }
        var si = document.getElementById('searchInput');
        if(si){ si.value = ''; if(typeof render==='function') render(); }
        if(_mobileSearchClear) _mobileSearchClear.style.display = 'none';
      });
      if(_mobileSearchCancel) _mobileSearchCancel.addEventListener('click', function(){
        _closeMobileSearchBar(false);
      });

      // Fermer le clavier quand on touche le contenu de la page (scroll, tap sur catalogue)
      // Le clavier se ferme via blur sur l'input
      document.addEventListener('touchstart', function(e){
        if(!_mobileSearchInput || !_mobileSearchBar || _mobileSearchBar.style.display === 'none') return;
        // Si le touch est en dehors de la barre de recherche → blur (ferme le clavier)
        if(!_mobileSearchBar.contains(e.target)){
          _mobileSearchInput.blur();
        }
      }, { passive: true });

      window._openMobileSearchBar  = _openMobileSearchBar;
      window._closeMobileSearchBar = _closeMobileSearchBar;

      if(floatClose)   floatClose.addEventListener('click', closeFloatingSearch);
      if(floatOverlay) floatOverlay.addEventListener('click', closeFloatingSearch);

      if(floatInput) floatInput.addEventListener('input', function(){
        // Propager vers le vrai searchInput
        if(mainInput){
          mainInput.value = floatInput.value;
          mainInput.dispatchEvent(new Event('input', {bubbles:true}));
        }
        // Vider les filtres catégorie
        var bfEl=document.getElementById('familyFilter');
        var bbEl=document.getElementById('brandFilter');
        var bsEl=document.getElementById('seriesFilter');
        if(bfEl) bfEl.value='';
        if(bbEl) bbEl.value='';
        if(bsEl) bsEl.value='';
      });

      if(floatInput) floatInput.addEventListener('keydown', function(e){
        if(e.key === 'Enter') closeFloatingSearchOnly();
      });

      function updateFilterBadge(){
        var bfEl=document.getElementById('familyFilter');
        var bbEl=document.getElementById('brandFilter');
        var bsEl=document.getElementById('seriesFilter');
        var siEl=document.getElementById('searchInput');
        var count=0;
        if(bbEl&&bbEl.value) count++;
        if(bfEl&&bfEl.value) count++;
        if(bsEl&&bsEl.value) count++;
        if(siEl&&siEl.value) count++;
        if(bnFilterBadge){ bnFilterBadge.textContent=count||''; bnFilterBadge.style.display=count>0?'':'none'; }
        if(count>0) bnFilter.classList.add('active'); else bnFilter.classList.remove('active');
      }
      // Exposé globalement : le tiroir "Filtres" mobile (_initFilterSheet)
      // applique ses filtres en écrivant directement .value sur les selects
      // desktop, ce qui ne déclenche pas d'événement "change" — updateFilterBadge
      // n'était donc jamais rappelée dans ce cas et le badge de la bottom nav
      // restait à 0 malgré un filtre actif (retour utilisateur).
      window._syncBnFilterBadge = updateFilterBadge;

      ['brandFilter','familyFilter','seriesFilter'].forEach(function(id){
        var el=document.getElementById(id);
        if(el) el.addEventListener('change', updateFilterBadge);
      });
      var si=document.getElementById('searchInput');
      if(si) si.addEventListener('input', updateFilterBadge);

      setActive(bnHome);

      document.addEventListener('spi_page_changed', function(e){
        if(e.detail==='home') setActive(bnHome);
      });

      // ── Fix iOS : bottom nav reste en bas quand le clavier s'ouvre ──


    } catch(e){ console.error('[BottomNav]', e); }
  };

  // ── Filter Sheet ───────────────────────────────────────────────
  window._initFilterSheet = function(){
    var sheet=document.getElementById('filterSheet');
    var overlay=document.getElementById('filterSheetOverlay');
    var btnOpen=document.getElementById('btnFilterSheet');
    var btnClose=document.getElementById('filterSheetClose');
    var btnApply=document.getElementById('filterSheetApply');
    var btnReset=document.getElementById('filterSheetReset');
    var selBrand=document.getElementById('filterSheetBrand');
    var selFamily=document.getElementById('filterSheetFamily');
    var selSeries=document.getElementById('filterSheetSeries');
    var selSort=document.getElementById('filterSheetSort');
    var brandFilterEl=document.getElementById('brandFilter');
    var familyFilterEl=document.getElementById('familyFilter');
    var seriesFilterEl=document.getElementById('seriesFilter');
    var searchInputEl=document.getElementById('searchInput');
    if(!sheet||!btnOpen) return;

    // ── Cascade mobile : recalcule les options en fonction des sélections ──
    // Utilise le même algorithme que la toolbar desktop (computeCascadeOptions
    // dans storage.js) pour garantir un comportement identique des deux côtés.
    function buildCascadeOptions(currentBrand, currentFamily, currentSeries){
      var opts = computeCascadeOptions(currentBrand, currentFamily, currentSeries);

      if(selBrand){
        selBrand.innerHTML = '<option value="">Toutes les marques</option>'
          + opts.brands.map(function(b){ return '<option value="'+_esc(b)+'">'+_esc(b)+'</option>'; }).join('');
        selBrand.value = opts.effectiveBrand;
      }
      if(selFamily){
        selFamily.innerHTML = '<option value="">Toutes les familles</option>'
          + opts.families.map(function(f){ return '<option value="'+_esc(f)+'">'+_esc(f)+'</option>'; }).join('');
        selFamily.value = opts.effectiveFamily;
      }
      if(selSeries){
        selSeries.innerHTML = '<option value="">Toutes les séries</option>'
          + opts.series.map(function(s){ return '<option value="'+_esc(s)+'">'+_esc(s)+'</option>'; }).join('');
        selSeries.value = opts.series.indexOf(currentSeries)!==-1 ? currentSeries : '';
      }
    }
    function _esc(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

    function openSheet(){
      // Fermer menu sheet si ouvert
      var ms=document.getElementById('menuSheet');
      var mso=document.getElementById('menuSheetOverlay');
      if(ms&&ms.classList.contains('open')){ ms.classList.remove('open'); if(mso) mso.style.display='none'; setTimeout(function(){ ms.style.display='none'; },300); }
      // Construire les options en cascade depuis les valeurs desktop actuelles
      buildCascadeOptions(
        (brandFilterEl&&brandFilterEl.value)||'',
        (familyFilterEl&&familyFilterEl.value)||'',
        (seriesFilterEl&&seriesFilterEl.value)||''
      );
      if(selSort) selSort.value = window._priceSort || '';
      overlay.style.display='block';
      sheet.classList.add('open');
      document.body.classList.add('modal-open');
    }
    function closeSheet(){
      sheet.classList.remove('open');
      overlay.style.display='none';
      document.body.classList.remove('modal-open');
    }
    function applyFilters(){
      if(brandFilterEl&&selBrand) brandFilterEl.value=selBrand.value;
      if(familyFilterEl&&selFamily) familyFilterEl.value=selFamily.value;
      if(seriesFilterEl&&selSeries) seriesFilterEl.value=selSeries.value;
      if(selSort && typeof window._setPriceSort==='function') window._setPriceSort(selSort.value || null);
      // .value= ne déclenche pas "change" → resynchroniser le badge de la
      // bottom nav à la main (voir window._syncBnFilterBadge, _initBottomNav).
      if(typeof window._syncBnFilterBadge === 'function') window._syncBnFilterBadge();
      closeSheet();
      if(typeof render==='function') render();
    }
    function resetFilters(){
      if(selBrand) selBrand.value='';
      if(selFamily) selFamily.value='';
      if(selSeries) selSeries.value='';
      if(selSort) selSort.value='';
      if(brandFilterEl) brandFilterEl.value='';
      if(familyFilterEl) familyFilterEl.value='';
      if(seriesFilterEl) seriesFilterEl.value='';
      if(searchInputEl) searchInputEl.value='';
      if(typeof window._setPriceSort==='function') window._setPriceSort(null);
      if(typeof window._syncBnFilterBadge === 'function') window._syncBnFilterBadge();
      closeSheet();
      if(typeof render==='function') render();
    }
    // Cascade en temps réel à chaque changement dans le sheet
    if(selBrand) selBrand.addEventListener('change', function(){
      buildCascadeOptions(selBrand.value, selFamily?selFamily.value:'', selSeries?selSeries.value:'');
    });
    if(selFamily) selFamily.addEventListener('change', function(){
      buildCascadeOptions(selBrand?selBrand.value:'', selFamily.value, selSeries?selSeries.value:'');
    });
    if(selSeries) selSeries.addEventListener('change', function(){
      buildCascadeOptions(selBrand?selBrand.value:'', selFamily?selFamily.value:'', selSeries.value);
    });
    window._openFilterSheet = openSheet;
    btnOpen.addEventListener('click', openSheet);
    if(btnClose) btnClose.addEventListener('click', closeSheet);
    if(btnApply) btnApply.addEventListener('click', applyFilters);
    if(btnReset) btnReset.addEventListener('click', resetFilters);
    if(overlay) overlay.addEventListener('click', closeSheet);
  };

  // ── Menu Sheet ─────────────────────────────────────────────────

  // ── Menu Sheet (version unique et définitive) ─────────────────
  window._initMenuSheet = function(){
    var sheet   = document.getElementById('menuSheet');
    var overlay = document.getElementById('menuSheetOverlay');
    var btnClose= document.getElementById('menuSheetClose');
    if(!sheet) return;

    function closeSheet(){
      sheet.classList.remove('open');
      if(overlay) overlay.style.display='none';
      document.body.classList.remove('modal-open');
      setTimeout(function(){ if(!sheet.classList.contains('open')) sheet.style.display='none'; }, 300);
      // Retirer l'état actif du bouton Menu
      var bnMenu = document.getElementById('bnMenu');
      if(bnMenu) bnMenu.classList.remove('active');
    }

    // Fermeture : bouton ✕
    if(btnClose) btnClose.onclick = closeSheet;

    // Fermeture : overlay
    if(overlay) overlay.onclick = closeSheet;

    function updateMenuAuth(){
      var p = window._userPerms || {};
      var loggedIn  = !!p.loggedIn;
      var isAdmin   = !!p.isAdmin;
      var canExport = !!p.canExport;
      var canEdit   = !!p.canEdit;
      var sUrl      = localStorage.getItem('cat_server_url') || '';
      // Même définition que js/auth.js (applyAuthUI) — non recopiée dans
      // window._userPerms, donc recalculée ici pour garder ce tiroir mobile
      // en phase avec le menu ⋮ desktop plutôt que de dupliquer une logique
      // divergente (retour utilisateur : les permissions doivent se
      // refléter à l'identique des deux côtés).
      var canPropose = loggedIn && !canEdit && !!sUrl;
      var user      = typeof authGetCurrentUser==='function' ? authGetCurrentUser() : null;

      // Auth label
      var msAuthIcon  = document.getElementById('msAuthIcon');
      var msAuthLabel = document.getElementById('msAuthLabel');
      var msAuthSub   = document.getElementById('msAuthSub');
      if(loggedIn && user){
        if(msAuthIcon)  msAuthIcon.className   = 'ti ti-logout';
        if(msAuthLabel) msAuthLabel.textContent = (user.displayName||user.username||'Compte');
        if(msAuthSub)   msAuthSub.textContent   = 'Appuyer pour se déconnecter';
      } else {
        if(msAuthIcon)  msAuthIcon.className   = 'ti ti-user';
        if(msAuthLabel) msAuthLabel.textContent = 'Se connecter';
        if(msAuthSub)   msAuthSub.textContent   = 'Accès réservé';
      }

      // Visibilité selon permissions — alignée sur le menu ⋮ desktop
      // (js/auth.js, applyAuthUI) : Export/Import JSON réservés aux admins
      // (écrase/fusionne tout le catalogue), Import Excel ouvert aussi aux
      // "proposeurs" (passe par le circuit de demandes, jamais d'écriture
      // directe), Demandes en attente ouvert à tout connecté avec serveur
      // (onglet "Mes demandes" pour les non-admins — voir reqRefreshPanel()
      // dans js/requests.js). Ces trois conditions divergeaient auparavant
      // du desktop (retour utilisateur : les permissions doivent se
      // refléter à l'identique, pas seulement pour les admins sur mobile).
      function show(id, v){ var el=document.getElementById(id); if(el) el.style.display=v?'':'none'; }
      show('msExport',     isAdmin);
      show('msImport',     isAdmin);
      // Même accès que l'import — miroir exact de btnExportXlsx côté
      // desktop (js/auth.js).
      show('msExportXlsx', canEdit || canPropose);
      // Basé sur canEdit (comme hasDirectEditRights dans
      // js/actions-import-export.js), pas canExport — miroir exact de
      // btnImportXlsx côté desktop (js/auth.js).
      show('msImportXlsx', canEdit || canPropose);
      show('msCleanDescs', isAdmin);
      show('msCompare',    true);
      // Miroir mobile de #btnDownloadExtension (menu ⋮ desktop, voir
      // js/auth.js) — visible pour tout utilisateur connecté.
      show('msDownloadExtension', loggedIn);
      // Miroir mobile de #btnUploadExtension — ADMIN uniquement.
      show('msUploadExtension', isAdmin);
      // Masqué pour un utilisateur qui peut éditer directement (canEdit) —
      // miroir exact de _showReq côté desktop (js/auth.js).
      show('msRequests',   loggedIn && !!sUrl && (isAdmin || !canEdit));
      // Signaler un bug : ouvert à TOUT utilisateur connecté avec serveur
      // (pas seulement les admins) — un bug peut être trouvé par n'importe
      // qui, même sans droit d'édition. Miroir exact de btnReportBug côté
      // desktop (js/auth.js). Réactivé — voir commentaire équivalent dans
      // js/auth.js (API dédiée aux bugs en place côté serveur).
      show('msReportBug',  loggedIn && !!sUrl);

      // Sous-titres adaptés à la conséquence réelle pour CET utilisateur
      // (retour utilisateur) — miroir exact de js/auth.js côté desktop.
      var msImportXlsxSub = document.getElementById('msImportXlsxSub');
      if(msImportXlsxSub) msImportXlsxSub.textContent = canEdit ? 'Mise à jour des prix' : 'Propose une mise à jour (validation admin)';
      var msRequestsSub = document.getElementById('msRequestsSub');
      if(msRequestsSub) msRequestsSub.textContent = isAdmin ? 'Modifications proposées' : 'Suivi de vos demandes';
      // Miroir exact de btnRequestsMenuTitle côté desktop (js/auth.js).
      var msRequestsTitle = document.getElementById('msRequestsTitle');
      if(msRequestsTitle) msRequestsTitle.textContent = isAdmin ? 'Demandes en attente' : 'Mes demandes en attente';
      // Miroir exact de btnSettingsSub côté desktop (js/auth.js).
      var msSettingsSub = document.getElementById('msSettingsSub');
      if(msSettingsSub) msSettingsSub.textContent = isAdmin ? 'Icônes des familles, Serveur' : 'Mon compte, Serveur';

      // Cacher sections vides
      function allHidden(ids){ return ids.every(function(id){ var el=document.getElementById(id); return !el||el.style.display==='none'; }); }
      var dataIds=['msExport','msImport','msExportXlsx','msImportXlsx'];
      var toolIds=['msCompare','msDownloadExtension','msUploadExtension','msCleanDescs'];
      var titles = document.querySelectorAll('#menuSheet .menu-sheet-section-title');
      var seps   = document.querySelectorAll('#menuSheet .menu-sheet-sep');
      if(titles[0]) titles[0].style.display = allHidden(dataIds) ? 'none' : '';
      if(titles[1]) titles[1].style.display = allHidden(toolIds) ? 'none' : '';
      if(seps[0]) seps[0].style.display = allHidden(['msRequests','msReportBug'])&&allHidden(dataIds) ? 'none' : '';
      if(seps[1]) seps[1].style.display = allHidden(dataIds) ? 'none' : '';
      if(seps[2]) seps[2].style.display = allHidden(toolIds)  ? 'none' : '';
    }

    window._syncMenuAuth = updateMenuAuth;
    document.addEventListener('spi_auth_changed', updateMenuAuth);

    // Auth click — mémorise "vient du menu mobile" UNIQUEMENT si le clic va
    // réellement ouvrir la modale de connexion (retour utilisateur : même
    // principe que msRequests/msSettings/msReportBug/msCompare ci-dessous).
    // btnAuthToggle sert aussi de bouton déconnexion quand on est déjà
    // connecté — dans ce cas aucune fenêtre ne s'ouvre, inutile (et faux) de
    // poser le drapeau, sinon la prochaine ouverture de la modale de
    // connexion (depuis le menu ⋮ desktop par ex.) rouvrirait ce tiroir par
    // erreur à sa fermeture.
    var msAuthBtn = document.getElementById('msAuth');
    if(msAuthBtn) msAuthBtn.onclick = function(){
      var loggedInNow = typeof authGetCurrentUser === 'function' && !!authGetCurrentUser();
      if(!loggedInNow){
        window._authOpenedFromMobileMenu = true;
        _setHeaderBackMode('authCloseBtn', 'authBackBtn', true);
      }
      closeSheet();
      setTimeout(function(){ var b=document.getElementById('btnAuthToggle'); if(b) b.click(); }, 320);
    };

    // Délégation boutons
    function ms(id, targetId){
      var btn=document.getElementById(id);
      var tgt=document.getElementById(targetId);
      if(btn&&tgt) btn.onclick = function(){ closeSheet(); setTimeout(function(){ tgt.click(); }, 320); };
    }
    // Variante de ms() qui pose en plus un drapeau "vient du menu mobile" et
    // bascule l'icône du bouton fermer en ← avant d'ouvrir la fenêtre cible
    // — pour les entrées qui ouvrent une vraie fenêtre à part entière (avec
    // sa propre croix de fermeture), afin que ce bouton ramène au menu
    // plutôt que de retomber sur la page du dessous, et le signale
    // visuellement (retour utilisateur : "il ne manque que les autres
    // fenêtres qui sont dans la page de menu mobile à faire la même chose",
    // puis "c'est cette flèche [des sous-pages Paramètres] que je voudrais
    // pour toutes les pages du menu mobile" — même principe déjà en place
    // pour msRequests/msSettings, généralisé ici).
    function msWithBack(id, targetId, flagName, closeBtnId, backBtnId){
      var btn=document.getElementById(id);
      var tgt=document.getElementById(targetId);
      if(btn&&tgt) btn.onclick = function(){
        window[flagName] = true;
        _setHeaderBackMode(closeBtnId, backBtnId, true);
        closeSheet();
        setTimeout(function(){ tgt.click(); }, 320);
      };
    }
    // Cas spécial (pas via le délégateur générique) : mémorise qu'on entre
    // dans "Demandes en attente" DEPUIS ce menu mobile, pour pouvoir le
    // rouvrir automatiquement à la fermeture du panneau — voir
    // reqClosePanel() dans js/requests.js (retour utilisateur : fermer la
    // croix devrait "revenir" au menu, pas juste retomber sur la page du
    // dessous).
    (function(){
      var btn = document.getElementById('msRequests');
      var tgt = document.getElementById('btnRequestsMenu');
      if(btn && tgt) btn.onclick = function(){
        window._reqOpenedFromMobileMenu = true;
        _setHeaderBackMode('requestsPanelClose', 'requestsBackBtn', true);
        closeSheet();
        setTimeout(function(){ tgt.click(); }, 320);
      };
    })();
    msWithBack('msReportBug', 'btnReportBug', '_bugReportOpenedFromMobileMenu', 'bugReportCloseBtn', 'bugReportBackBtn');
    ms('msExport',    'btnExport');
    ms('msImport',    'btnImport');
    ms('msExportXlsx','btnExportXlsx');
    ms('msImportXlsx','btnImportXlsx');
    msWithBack('msCompare', 'btnCompare', '_compareOpenedFromMobileMenu', 'compareClose', 'compareBackBtn');
    ms('msCleanDescs','btnCleanDescs');
    // Cas spécial (pas via le délégateur ms() générique) — même principe
    // que msRequests ci-dessus, pour Paramètres cette fois : mémorise
    // qu'on y entre DEPUIS ce menu mobile, pour pouvoir y revenir à la
    // fermeture (voir closeSettingsOverlay ci-dessous — retour
    // utilisateur : "je vais dans paramètres alors que je voulais me
    // connecter, au lieu de cliquer sur la croix je peux faire retour pour
    // aller au bon endroit").
    (function(){
      var btn = document.getElementById('msSettings');
      var tgt = document.getElementById('btnSettings');
      if(btn && tgt) btn.onclick = function(){
        window._settingsOpenedFromMobileMenu = true;
        _setHeaderBackMode('settingsClose', 'settingsBackBtn', true);
        closeSheet();
        setTimeout(function(){ tgt.click(); }, 320);
      };
    })();

    // Badge demandes — reflété sur bnMenuBadge (icône "Menu" de la bottom
    // nav) ET sur msBadge (à côté de "Demandes en attente" DANS le tiroir
    // menu mobile lui-même) : ce dernier n'était relié à aucun code, donc
    // jamais mis à jour — la pastille de notification restait invisible en
    // ouvrant le menu sur mobile/tablette (retour utilisateur). Synchronisé
    // une première fois tout de suite (état déjà connu à cet instant), puis
    // à chaque changement de requestsBadge (source de vérité, mise à jour
    // par reqUpdateBadge() dans js/requests.js).
    var reqBadgeEl = document.getElementById('requestsBadge');
    if(reqBadgeEl){
      var _syncReqBadgesMobile = function(){
        var bnBadge = document.getElementById('bnMenuBadge');
        var msBadgeEl = document.getElementById('msBadge');
        if(bnBadge){ bnBadge.textContent=reqBadgeEl.textContent; bnBadge.style.display=reqBadgeEl.style.display; }
        if(msBadgeEl){ msBadgeEl.textContent=reqBadgeEl.textContent; msBadgeEl.style.display=reqBadgeEl.style.display; }
      };
      _syncReqBadgesMobile();
      new MutationObserver(_syncReqBadgesMobile).observe(reqBadgeEl, {childList:true, attributes:true, attributeFilter:['style']});
    }
  };

  // ── Glisser-pour-fermer sur les poignées grises des tiroirs bas ──
  // Retour utilisateur : la barre grise en haut de Filtres/Menu/Paramètres
  // était purement décorative — faire en sorte qu'elle suive le doigt et
  // permette de fermer le tiroir en glissant vers le bas, comme les
  // tiroirs natifs iOS/Android. Générique plutôt que dupliqué 3 fois :
  // chaque entrée fournit juste l'élément qui bouge (le tiroir) et le
  // bouton de fermeture RÉEL à déclencher (btn.click()) — on ne
  // réimplémente pas la logique de fermeture de chaque tiroir (déjà
  // gérée par ces boutons dans _initFilterSheet/_initMenuSheet/
  // openSettingsOverlay ci-dessus), on se contente de la déclencher, même
  // technique que window._closeAllOverlays (js/init.js) pour rester
  // cohérent avec un seul point de vérité par tiroir.
  function _initDragHandle(handleEl, sheetEl, closeBtnId){
    if(!handleEl || !sheetEl) return;
    var startY = 0, startT = 0, dragging = false, currentDy = 0;
    var SHEET_TRANSITION = 'transform .3s cubic-bezier(.32,.72,0,1)';

    function onStart(e){
      // Ignorer si le tiroir n'est pas visuellement ouvert (évite de capturer
      // un toucher pendant l'animation d'entrée, avant que le tiroir soit
      // réellement à l'écran).
      var r = sheetEl.getBoundingClientRect();
      if(r.top >= window.innerHeight) return;
      dragging = true;
      currentDy = 0;
      startY = e.touches[0].clientY;
      startT = Date.now();
      sheetEl.style.transition = 'none';
    }
    function onMove(e){
      if(!dragging) return;
      var dy = e.touches[0].clientY - startY;
      if(dy < 0) dy = 0; // ne suit le doigt que vers le bas (fermeture)
      currentDy = dy;
      sheetEl.style.transform = 'translateY(' + dy + 'px)';
      e.preventDefault();
    }
    function onEnd(){
      if(!dragging) return;
      dragging = false;
      var dt = Math.max(1, Date.now() - startT);
      var velocity = currentDy / dt; // px/ms
      var sheetH = sheetEl.getBoundingClientRect().height || 1;
      var shouldDismiss = currentDy > sheetH * 0.28 || (currentDy > 24 && velocity > 0.5);

      sheetEl.style.transition = SHEET_TRANSITION;
      if(shouldDismiss){
        sheetEl.style.transform = 'translateY(100%)';
        setTimeout(function(){
          sheetEl.style.transform = '';
          sheetEl.style.transition = '';
          var btn = document.getElementById(closeBtnId);
          if(btn) btn.click();
        }, 300);
      } else {
        sheetEl.style.transform = 'translateY(0)';
        setTimeout(function(){
          sheetEl.style.transform = '';
          sheetEl.style.transition = '';
        }, 300);
      }
    }

    handleEl.addEventListener('touchstart', onStart, {passive:true});
    handleEl.addEventListener('touchmove', onMove, {passive:false});
    handleEl.addEventListener('touchend', onEnd);
    handleEl.addEventListener('touchcancel', onEnd);
  }

  window._initSheetDragHandles = function(){
    try {
      var filterSheet = document.getElementById('filterSheet');
      if(filterSheet) _initDragHandle(filterSheet.querySelector('.filter-sheet-handle'), filterSheet, 'filterSheetClose');

      var menuSheet = document.getElementById('menuSheet');
      if(menuSheet) _initDragHandle(menuSheet.querySelector('.filter-sheet-handle'), menuSheet, 'menuSheetClose');

      var settingsBox = document.querySelector('#settingsOverlay .settings-box');
      if(settingsBox) _initDragHandle(settingsBox.querySelector('.sheet-handle-bar'), settingsBox, 'settingsClose');
    } catch(e){ console.error('[SheetDragHandles]', e); }
  };
