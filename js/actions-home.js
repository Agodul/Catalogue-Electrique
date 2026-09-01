  // ---------- Scroll to top ----------
  var btnScrollTop = document.getElementById('btnScrollTop');
  // Écouter scroll sur appContent (mobile) ou window (desktop)
  var _appContent = document.getElementById('appContent');
  var _scrollTarget = _appContent || window;
  _scrollTarget.addEventListener('scroll', function(){
    var _scrollY = _appContent ? _appContent.scrollTop : window.scrollY;
    btnScrollTop.classList.toggle('show', _scrollY > 400);
  });
  btnScrollTop.addEventListener('click', function(){
    var _acEl2=document.getElementById('appContent'); if(_acEl2) _acEl2.scrollTo({top:0,behavior:'smooth'}); else window.scrollTo({top:0,behavior:'smooth'});
  });

  // ---------- Page d'accueil ----------
  var homePage       = document.getElementById('homePage');
  var catalogueWrap  = document.getElementById('catalogueWrap');
  var homeStats      = document.getElementById('homeStats');
  var homeFamilies   = document.getElementById('homeFamilies');
  var homeAllBtn     = document.getElementById('homeAllBtn');

  // Icônes par famille (mots-clés → icône Tabler)
  // Fallback approximatif pour une famille jamais vue (pas dans
  // FAMILY_NAME_TO_ICON — voir js/familyIcons.js) : détection par mots-clés,
  // vers l'icône existante la plus proche.
  var familyIconMap = [
    { keys:['câble','cable','cordon','liaison','raccord'],          icon:'svg-cable-de-liaison' },
    { keys:['capteur','sensor','detect','proxim'],                  icon:'svg-capteur' },
    { keys:['module','bus','réseau','network'],                     icon:'svg-communication-reseau' },
    { keys:['master','plc','automate','controleur','contrôleur'],   icon:'svg-plc' },
    { keys:['aliment','power','psu','transfo'],                     icon:'svg-alimentation' },
    { keys:['variat','drive'],                                      icon:'svg-variateur' },
    { keys:['connect','fiche'],                                     icon:'svg-connecteur-confectionnables' },
    { keys:['prise'],                                               icon:'svg-prise' },
    { keys:['bornier','terminal','borne'],                          icon:'svg-borne' },
    { keys:['commut','switch'],                                     icon:'svg-switch' },
    { keys:['bouton','button','poussoir'],                          icon:'svg-bouton' },
    { keys:['relay','relai','relais'],                              icon:'svg-relais' },
    { keys:['contact'],                                             icon:'svg-contacteur' },
    { keys:['disjonct','breaker'],                                  icon:'svg-disjoncteur' },
    { keys:['affich','display','écran','ecran'],                    icon:'svg-ecran' },
    { keys:['armoire','coffret','enclosure'],                       icon:'svg-armoire' },
    { keys:['accessoire'],                                          icon:'svg-accessoire' },
    { keys:['barrière','barriere','immatériel'],                    icon:'svg-barriere-immaterielle' },
    { keys:['amplif'],                                              icon:'svg-amplificateur' },
    { keys:['rail','din'],                                          icon:'svg-rail-din' },
    { keys:['robot'],                                               icon:'svg-robot' },
    { keys:['moteur','motor'],                                      icon:'svg-moteur-brushless' },
    { keys:['ventilat','fan'],                                      icon:'svg-ventilateur' },
    { keys:['vision','camera','caméra'],                            icon:'svg-vision' },
    { keys:['bride'],                                               icon:'svg-bride' },
    { keys:['electrovanne','électrovanne'],                         icon:'svg-electrovanne' },
    { keys:['reducteur','réducteur'],                               icon:'svg-reducteur' },
    // "svg-cable-moteur-brushless" (nouvelle icône dédiée, plus précise que
    // le "moteur"/"motor" générique ci-dessus qui retombe sur
    // svg-moteur-brushless) volontairement PAS ajoutée ici en détection par
    // mots-clés : "câble" ET "moteur" pointent déjà chacun vers une icône
    // différente plus haut dans cette liste (le premier qui matche
    // l'emporte, voir getFamilyIcon ci-dessous) — un mot-clé composé
    // risquerait de mal deviner selon l'ordre des mots dans le nom réel de
    // la famille. Reste sélectionnable à la main dans le picker d'icônes
    // (FAMILY_ICON_CHOICES, js/familyIcons.js).
  ];

  function getFamilyIcon(name){
    // Priorité 1 : icône stockée dans localStorage (choix session courante)
    if(familyIcons[name]) return familyIcons[name];
    // Priorité 2 : icône PNG moderne déjà enregistrée sur un produit de cette
    // famille (FAMILY_ICON_CHOICES). Les anciennes valeurs "ti-xxx" (police
    // Tabler, d'avant l'introduction des icônes PNG) ne comptent PAS ici —
    // voir priorité 3bis plus bas : sans ce filtre, une famille connue
    // (correspondance exacte disponible) restait bloquée indéfiniment sur
    // son ancienne icône Tabler tant que personne ne la re-choisissait à la
    // main dans Paramètres (retour utilisateur : "les icônes sont encore
    // les icônes ti-ti-, jamais rafraîchies même après un changement").
    // Affichage uniquement : aucune donnée produit modifiée ici, aucun push
    // serveur déclenché — un vrai choix admin (priorité 1) reste prioritaire.
    for(var i=0;i<products.length;i++){
      if(products[i].family === name && products[i].familyIcon
         && FAMILY_ICON_CHOICES.indexOf(products[i].familyIcon) !== -1){
        return products[i].familyIcon;
      }
    }
    // Priorité 3 : correspondance exacte pour les familles réelles connues
    if(typeof FAMILY_NAME_TO_ICON !== 'undefined' && FAMILY_NAME_TO_ICON[name]){
      return FAMILY_NAME_TO_ICON[name];
    }
    // Priorité 3bis (repli) : ancienne valeur "ti-xxx" enregistrée sur un
    // produit, seulement si aucune correspondance moderne n'existe pour
    // cette famille (comportement historique inchangé pour les familles
    // hors des 54 connues).
    for(var i=0;i<products.length;i++){
      if(products[i].family === name && products[i].familyIcon){
        return products[i].familyIcon;
      }
    }
    // Fallback : détection par mots-clés
    var lower = name.toLowerCase();
    for(var i=0;i<familyIconMap.length;i++){
      for(var j=0;j<familyIconMap[i].keys.length;j++){
        if(lower.indexOf(familyIconMap[i].keys[j]) !== -1) return familyIconMap[i].icon;
      }
    }
    return 'svg-generique';
  }

  // Position de scroll de l'accueil juste avant de cliquer sur une carte
  // famille — mémorisée pour que la croix du bandeau de catégorie (voir
  // plus bas) ramène au niveau de la carte cliquée plutôt qu'en haut de
  // la page (retour utilisateur : accueil avec beaucoup de catégories,
  // clic sur la mauvaise carte tout en bas → la croix ne doit pas
  // renvoyer tout en haut).
  var _homeScrollBeforeCategory = null;

  function showHome(){
    if(window._setViewAll) window._setViewAll(false);
    // Vider la recherche au retour à l'accueil
    var si = document.getElementById('searchInput');
    if(si) si.value = '';
    homePage.classList.remove('hidden');
    catalogueWrap.style.display = 'none';
    document.getElementById('hdrCountChip').style.display = 'none';
    renderHome();
  }

  function showCatalogue(brandFilter, familyFilter){
    // Désactiver le mode viewAll si on filtre par marque ou famille
    if(brandFilter || familyFilter){
      if(window._setViewAll) window._setViewAll(false);
    }
    homePage.classList.add('hidden');
    catalogueWrap.style.display = '';
    document.getElementById('hdrCountChip').style.display = '';
    // Utiliser getElementById directement pour éviter la collision de noms
    var famEl = document.getElementById('familyFilter');
    var brandEl = document.getElementById('brandFilter');
    // Toujours affecter (même une chaîne vide), pas seulement si truthy —
    // sinon showCatalogue('','') ("Voir tout le catalogue") laissait les
    // <select> sur leur dernière valeur (ex. une famille cliquée depuis
    // l'accueil), qui reste ensuite utilisée par getFilteredProducts() —
    // viewAll ne change QUE l'affichage groupé/plat, jamais le filtrage
    // lui-même — d'où "Voir tout" affichant en réalité la dernière
    // catégorie, et le tiroir de filtres mobile la reprenant aussi comme
    // pré-sélection (retour utilisateur, les deux symptômes ont la même
    // cause).
    if(famEl) famEl.value = familyFilter || '';
    if(brandEl) brandEl.value = brandFilter || '';
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function showCatalogueAll(){
    document.querySelector('.toolbar').classList.add('filters-visible');
    if(window._setViewAll) window._setViewAll(true);
    showCatalogue('','');
  }

  // Croix du bandeau de catégorie active (.active-filter-close, voir
  // js/storage.js) — délégation sur #content, régénéré à chaque rendu
  // (render()), donc un listener direct posé dessus serait perdu au rendu
  // suivant (retour utilisateur : bouton retour pour "quand on s'est
  // trompé de catégorie").
  var contentElForFilterClose = document.getElementById('content');
  if(contentElForFilterClose){
    contentElForFilterClose.addEventListener('click', function(e){
      if(!e.target.closest('.active-filter-close')) return;
      var savedScroll = _homeScrollBeforeCategory;
      _homeScrollBeforeCategory = null;
      showHome();
      if(savedScroll !== null){
        // Attendre le prochain frame pour que renderHome() ait fini de
        // (re)peindre les cartes avant de scroller — sinon la page n'a pas
        // encore sa hauteur finale et le scroll peut être tronqué.
        requestAnimationFrame(function(){
          window.scrollTo({ top: savedScroll, behavior: 'instant' });
        });
      }
    });
  }

  function renderHome(){
    refreshFilterCache();
    var total  = products.length;
    var brands = _filterCache.brands.length;

    // Stats
    var avgDiscount = 0;
    var countWithDiscount = 0;
    products.forEach(function(p){
      // Prix catalogue = premier élément de priceHistory
      var origRaw = (Array.isArray(p.priceHistory) && p.priceHistory.length > 0)
        ? p.priceHistory[0].price : '';
      var orig = parseFloat((origRaw||'').toString().replace(/[^0-9.,]/g,'').replace(',','.'));
      var disc = parseFloat((p.price||'').toString().replace(/[^0-9.,]/g,'').replace(',','.'));
      if(orig > 0 && disc > 0 && orig > disc){
        avgDiscount += (1 - disc/orig)*100;
        countWithDiscount++;
      }
    });
    var avgDisp  = countWithDiscount > 0 ? '-'+Math.round(avgDiscount/countWithDiscount)+'%' : '--';
    var discTitle = countWithDiscount > 0 ? '' : ' title="Aucun produit avec remise actuellement"';

    homeStats.innerHTML =
      '<div class="home-stat"><div class="home-stat-val">'+total+'</div><div class="home-stat-lbl">Produits</div></div>' +
      '<div class="home-stat"><div class="home-stat-val">'+brands+'</div><div class="home-stat-lbl">Marques</div></div>' +
      '<div class="home-stat"'+discTitle+'><div class="home-stat-val">'+avgDisp+'</div><div class="home-stat-lbl">Remise moy.</div></div>';

    // Familles avec compteur
    var familyCounts = {};
    products.forEach(function(p){
      var f = (p.family||'').trim();
      if(!f) return;
      familyCounts[f] = (familyCounts[f]||0) + 1;
    });
    var families = Object.keys(familyCounts).sort(function(a,b){
      return a.localeCompare(b, 'fr', { sensitivity: 'base' });
    });

    if(families.length === 0){
      homeFamilies.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--ink-soft);font-size:13px;padding:20px 0;">Aucune famille définie — ajoutez des familles à vos produits pour les voir ici.</div>';
      homeFamilies.dataset.sig = '';
    } else {
      // renderHome() est rappelée très souvent (sync serveur en arrière-plan
      // ~1,5s après le chargement via loadServerConfig(), tout ajout/suppr.
      // de produit...) — reconstruire tout le innerHTML à chaque fois détruit
      // et recrée CHAQUE <img> d'icône, qui doit alors se recharger depuis
      // zéro même si rien n'a changé pour cette famille. Sur mobile (CPU/
      // réseau plus lents), ce second rendu tombe plus près du premier
      // affichage et se voit clairement : icônes qui "rechargent", cartes
      // qui semblent bouger (retour utilisateur : "les icônes chargent en
      // dernier, la taille des catégories bouge" au rafraîchissement,
      // beaucoup plus visible sur mobile/tablette que sur desktop). On ne
      // touche donc la grille que si son contenu a réellement changé.
      var sig = families.map(function(f){ return f+'|'+familyCounts[f]+'|'+getFamilyIcon(f); }).join(';');
      if(homeFamilies.dataset.sig === sig) return;
      homeFamilies.dataset.sig = sig;

      homeFamilies.innerHTML = families.map(function(f){
        var icon = getFamilyIcon(f);
        var count = familyCounts[f];
        return '<div class="home-family-card" data-family="'+escapeHtml(f)+'">'
          + '<div class="home-family-icon">'+renderFamilyIconHtml(icon)+'</div>'
          + '<div class="home-family-name">'+escapeHtml(f)+'</div>'
          + '<div class="home-family-count">'+count+(count>1?' références':' référence')+'</div>'
          + '</div>';
      }).join('');

      homeFamilies.querySelectorAll('.home-family-card').forEach(function(card){
        card.addEventListener('click', function(){
          _homeScrollBeforeCategory = window.scrollY;
          showCatalogue('', card.getAttribute('data-family'));
        });
      });
    }
  }

  document.getElementById('brandmarkLogo').addEventListener('click', function(){
    // Fermer la fiche produit : retirer la classe 'open' sur l'overlay
    var viewOverlayEl = document.getElementById('viewOverlay');
    if(viewOverlayEl) viewOverlayEl.classList.remove('open');
    // Fermer la modale d'édition
    // #modalOverlay, pas #overlay : cet identifiant-là n'existe pas dans
    // index.html, donc getElementById renvoyait null et le formulaire produit
    // restait ouvert derrière l'accueil après un clic sur le logo.
    //
    // Passer par requestCloseModal() plutôt que retirer la classe 'open' à la
    // main : le formulaire peut contenir une saisie non enregistrée, et c'est
    // requestCloseModal() qui affiche la confirmation "Annuler la saisie"
    // (comme la croix, "Annuler" et Échap). Sans ça, corriger l'identifiant
    // aurait remplacé un bouton sans effet par un bouton qui jette une saisie
    // en cours sans prévenir. Si une confirmation s'affiche, on interrompt
    // aussi le retour à l'accueil : l'utilisateur reste sur sa fiche tant
    // qu'il n'a pas tranché.
    var overlayEl = document.getElementById('modalOverlay');
    if(overlayEl && overlayEl.classList.contains('open')){
      if(typeof hasUnsavedInput === 'function' && hasUnsavedInput()){
        if(typeof requestCloseModal === 'function'){ requestCloseModal(); return; }
      }
      if(typeof closeModal === 'function') closeModal();
      else overlayEl.classList.remove('open');
    }
    // Fermer le panneau paramètres
    var settingsBoxEl = document.querySelector('.settings-box');
    if(settingsBoxEl) settingsBoxEl.classList.remove('open');
    familyFilterEl.value = '';
    brandFilterEl.value  = '';
    seriesFilterEl.value = '';
    document.querySelector('.toolbar').classList.remove('filters-visible');
    document.body.classList.remove('modal-open');
    showHome();
  });

  homeAllBtn.addEventListener('click', function(){
    showCatalogueAll();
  });

  // ---------- Picker icônes famille ----------
  // Liste des pictogrammes SVG maison (js/familyIcons.js) — remplace l'ancien
  // choix de ~90 icônes Tabler génériques par un set restreint mais parlant,
  // pensé pour un catalogue électrique.
  var ICON_LIST = FAMILY_ICON_CHOICES;

  function _setFamilyIconPreview(icon){
    var el = document.getElementById('familyIconPreview');
    if(el) el.innerHTML = renderFamilyIconHtml(icon);
  }

  // selectedFamilyIcon et familyIconRow sont déclarés dans
  // js/modal-spareparts-form.js (chargé avant celui-ci) et partagés avec le
  // formulaire produit — voir le
  // commentaire là-bas. Les re-déclarer ici ne créait pas de seconde variable,
  // ça écrasait la première au chargement.
  var familyIconPickerBtn = document.getElementById('familyIconPickerBtn');
  var iconPickerModal    = document.getElementById('iconPickerModal');
  var iconPickerClose    = document.getElementById('iconPickerClose');
  var iconPickerSearch   = document.getElementById('iconPickerSearch');
  var iconPickerGrid     = document.getElementById('iconPickerGrid');

  var knownFamilies = [];

  function refreshKnownFamilies(){
    var set = {};
    products.forEach(function(p){ if(p.family) set[p.family] = true; });
    knownFamilies = Object.keys(set);
  }

  function renderIconGrid(filter){
    var list = ICON_LIST.filter(function(ic){
      return !filter || ic.replace('svg-','').indexOf(filter.toLowerCase()) !== -1;
    });
    iconPickerGrid.innerHTML = list.map(function(ic){
      return '<div class="icon-picker-item'+(ic===selectedFamilyIcon?' selected':'')+'" data-icon="'+ic+'" title="'+ic.replace('svg-','')+'">'+renderFamilyIconHtml(ic)+'</div>';
    }).join('');
    iconPickerGrid.querySelectorAll('.icon-picker-item').forEach(function(el){
      el.addEventListener('click', function(){
        var icon = el.getAttribute('data-icon');
        selectedFamilyIcon = icon;
        iconPickerGrid.querySelectorAll('.icon-picker-item').forEach(function(x){ x.classList.remove('selected'); });
        el.classList.add('selected');
        // Mettre à jour l'aperçu dans le formulaire
        _setFamilyIconPreview(icon);
        _closeIconPicker();
        // Contexte Paramètres : sauvegarder sur tous les produits de la famille
        if(settingsEditingFamily){
          var _editedFamily = settingsEditingFamily;
          familyIcons[_editedFamily] = icon;
          saveFamilyIcons();
          var _touchedRefs = [];
          var _touchedProducts = [];
          products.forEach(function(p){
            if(p.family === _editedFamily){
              p.familyIcon = icon;
              p.updatedAt = Date.now(); // sans ça le serveur ignore l'envoi (pas plus récent que sa version)
              if(p.ref) _touchedRefs.push(p.ref);
              _touchedProducts.push(p);
            }
          });
          save(true, _touchedProducts);
          var thumb = document.getElementById('settings-thumb-'+_editedFamily);
          if(thumb) thumb.innerHTML = renderFamilyIconHtml(icon);
          settingsEditingFamily = null;
          renderHome();
          verifyFamilyIconOnServer(_editedFamily, icon, _touchedRefs);
        }
      });
    });
  }

  familyIconPickerBtn.addEventListener('click', function(){
    iconPickerSearch.value = '';
    renderIconGrid('');
    iconPickerModal.classList.add('show');
  });
  function _closeIconPicker(){
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(iconPickerModal, function(){ iconPickerModal.classList.remove('show'); });
    } else {
      iconPickerModal.classList.remove('show');
    }
  }
  iconPickerClose.addEventListener('click', _closeIconPicker);
  iconPickerModal.addEventListener('click', function(e){
    if(e.target === iconPickerModal) _closeIconPicker();
  });
  iconPickerSearch.addEventListener('input', function(){
    renderIconGrid(iconPickerSearch.value);
  });

  // Afficher le picker uniquement pour les nouvelles familles
  fFamily.addEventListener('input', function(){
    refreshKnownFamilies();
    var val = fFamily.value.trim();
    if(val && knownFamilies.indexOf(val) === -1){
      // Nouvelle famille → montrer le picker
      selectedFamilyIcon = getFamilyIcon(val); // pré-sélectionner par mots-clés
      _setFamilyIconPreview(selectedFamilyIcon);
      familyIconRow.classList.add('show');
    } else {
      familyIconRow.classList.remove('show');
    }
  });

