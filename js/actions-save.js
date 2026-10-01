  // ---------- Save product ----------
  // Uniformise le séparateur décimal en virgule (format FR) — ne touche pas
  // aux devises non-euro, où le point est la convention normale.
  function normalizePriceFormat(v){
    if(!v) return v;
    if(/[$£¥]|USD|GBP|CHF|CAD/i.test(v)) return v;
    return v.replace(/(\d)\.(\d)/g, '$1,$2');
  }

  function formatPrice(raw){
    var v = normalizePriceFormat(raw.trim());
    if(!v) return v;
    // Si une devise est déjà présente (symbole ou code), on ne touche à rien
    if(/[€$£¥]|EUR|USD|GBP|CHF|CAD/i.test(v)) return v;
    return v + ' €';
  }

  // Retour utilisateur : "est-ce qu'il y a un spinner ?" — remplace le
  // contenu de #btnSave par une icône qui tourne (même technique que les
  // autres chargements de l'appli, ex. js/requests.js/js/render-documents.js :
  // ti-loader-2 + @keyframes spin, css/styles.css) pendant qu'un flux attend
  // réellement une réponse serveur (proposition/révision de demande ci-
  // dessous) — l'enregistrement direct admin, lui, n'attend jamais le
  // serveur (voir save() dans js/storage.js) et n'a donc pas besoin de ceci.
  // Le HTML d'origine du bouton (son libellé varie selon le mode — voir
  // js/modal-autocomplete.js/js/modal-request-review.js/js/modal-specs-
  // editor.js) est mémorisé le temps du chargement puis restauré tel quel.
  function _setBtnSaveLoading(btnSave, loading){
    if(!btnSave) return;
    if(loading){
      btnSave.dataset.origHtml = btnSave.innerHTML;
      btnSave.innerHTML = '<i class="ti ti-loader-2" aria-hidden="true" style="animation:spin 1s linear infinite;"></i>';
      btnSave.disabled = true;
    } else {
      if(btnSave.dataset.origHtml !== undefined){
        btnSave.innerHTML = btnSave.dataset.origHtml;
        delete btnSave.dataset.origHtml;
      }
      btnSave.disabled = false;
    }
  }
  // Retour utilisateur : "faut faire comme pour les autres fonction" —
  // exposée globalement pour être réutilisée par les autres actions
  // déclenchées par un clic direct (gestion des prix, compte utilisateur,
  // paramètres…) qui attendent elles aussi désormais une vraie confirmation
  // serveur avant d'écrire en local, au lieu de dupliquer cette fonction
  // dans chaque fichier.
  window._setBtnLoadingSpinner = _setBtnSaveLoading;

  // Extrait la valeur numérique d'un prix affiché (ex. "1 234,56 €" -> 1234.56)
  function parsePriceNumber(str){
    if(!str) return null;
    var cleaned = str.replace(/[^\d.,]/g, '').trim();
    if(!cleaned) return null;
    // Gère à la fois "1234.56" et "1234,56" et "1.234,56"
    if(cleaned.indexOf(',') !== -1 && cleaned.indexOf('.') !== -1){
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }else if(cleaned.indexOf(',') !== -1){
      cleaned = cleaned.replace(',', '.');
    }
    var n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }

  // Réutilise l'orthographe déjà présente dans le catalogue pour une marque
  // (insensible à la casse/accents) au lieu de laisser coexister deux entrées
  // pour la même marque (ex. "BALLUFF" et "Balluff") dans le filtre marque.
  function canonicalizeBrand(brand){
    if(!brand) return brand;
    var norm = normalizeSearch(brand);
    for(var i=0;i<products.length;i++){
      if(products[i].brand && normalizeSearch(products[i].brand) === norm) return products[i].brand;
    }
    return brand;
  }

  // Dédoublonne et réutilise l'orthographe déjà présente dans le catalogue
  // pour chaque tag (insensible à la casse/accents), pour éviter que
  // "câble cellule" et "cable cellule" cohabitent comme deux tags distincts.
  function canonicalizeTags(tagsArr){
    var seen = {};
    var result = [];
    tagsArr.forEach(function(t){
      var norm = normalizeSearch(t);
      if(!norm || seen[norm]) return;
      seen[norm] = true;
      var canonical = t;
      outer:
      for(var i=0;i<products.length;i++){
        var pt = products[i].tags;
        if(!pt) continue;
        for(var j=0;j<pt.length;j++){
          if(normalizeSearch(pt[j]) === norm){ canonical = pt[j]; break outer; }
        }
      }
      result.push(canonical);
    });
    return result;
  }

  // Rattrape les liens à sens unique (A → B sans B → A) sur TOUT le tableau
  // donné, pour un champ de liaison donné (suggestions ou spareParts —
  // même mécanique de liaison réciproque pour les deux, retour utilisateur :
  // "une rubrique pièces de rechange comme pour les suggestions") — utilisé
  // après un import JSON (Fusionner ou Remplacer), qui écrit les produits
  // directement sans repasser par le formulaire d'édition (seul endroit qui
  // applique déjà cette réciprocité au moment d'Enregistrer, voir
  // _sugLinkReciprocal/_sparePartsLinkReciprocal dans le handler de
  // btnSave). Idempotent : rejouer cette passe plusieurs fois ne change
  // rien de plus après la première fois. N'écrase jamais un lien existant,
  // ne supprime jamais rien — ajoute seulement ce qui manque.
  function reconcileLinksReciprocally(prods, field){
    var byRef = {};
    prods.forEach(function(p){ if(p.ref) byRef[p.ref] = p; });
    var touched = [];
    prods.forEach(function(p){
      if(!p.ref || !Array.isArray(p[field])) return;
      p[field].forEach(function(otherRef){
        var other = byRef[otherRef];
        if(!other || other.ref === p.ref) return;
        if(!Array.isArray(other[field])) other[field] = [];
        if(other[field].indexOf(p.ref) === -1){
          other[field].push(p.ref);
          other.updatedAt = Date.now();
          if(touched.indexOf(other) === -1) touched.push(other);
        }
      });
    });
    return touched;
  }
  function reconcileSuggestionsReciprocally(prods){ return reconcileLinksReciprocally(prods, 'suggestions'); }
  function reconcileSparePartsReciprocally(prods){ return reconcileLinksReciprocally(prods, 'spareParts'); }

  // N'accepte que des URL http(s) pour les champs "URL produit" / "Lien
  // 3DEXPERIENCE" — même règle déjà appliquée aux URL entrantes du pont
  // extension et du partage PWA (voir js/init.js).
  function _isSafeHttpUrl(str){
    if(!str) return true; // champ vide = autorisé (optionnel)
    try {
      var u = new URL(str);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch(e){ return false; }
  }
  window._isSafeHttpUrl = _isSafeHttpUrl;

  document.getElementById('btnSave').addEventListener('click', async function(){
    // Garde-fou défensif : si le formulaire était déjà ouvert avant une
    // déconnexion (forcée ou manuelle), applyAuthUI() ne le referme pas tout
    // seul (voir _authCloseSensitiveUI dans js/auth.js, qui s'en charge côté
    // déconnexion) — ce test protège en plus contre tout cas limite où le
    // bouton resterait cliquable malgré tout (retour utilisateur : actions
    // encore possibles après une déconnexion tant que la page n'est pas
    // rechargée).
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()){
      showToast('Vous avez été déconnecté — veuillez vous reconnecter.', 'err', 4000);
      if(typeof closeModal === 'function') closeModal();
      return;
    }
    var brand = canonicalizeBrand(fBrand.value.trim());
    var ref = fRef.value.trim();
    // Retour utilisateur : "faudrai mettre en rouge les zone a remplir
    // obligatoirement" — en plus du toast déjà existant, contour rouge
    // directement sur le(s) champ(s) fautif(s) (voir _markFieldInvalid,
    // js/modal-core.js) et focus posé dessus.
    if(!brand) _markFieldInvalid(fBrand); else _clearFieldInvalid(fBrand);
    if(!ref) _markFieldInvalid(fRef); else _clearFieldInvalid(fRef);
    if(!brand || !ref){
      showToast('La marque et la référence sont obligatoires.', 'err', 3000);
      (!brand ? fBrand : fRef).focus();
      return;
    }
    if(!_isSafeHttpUrl(fUrl.value.trim())){
      showToast('URL produit invalide — seuls les liens http:// et https:// sont autorisés.', 'err', 4000);
      return;
    }
    if(!_isSafeHttpUrl(f3dLink.value.trim())){
      showToast('Lien 3DEXPERIENCE invalide — seuls les liens http:// et https:// sont autorisés.', 'err', 4000);
      return;
    }
    // La photo passe par le même contrôle de protocole que les deux liens
    // ci-dessus : elle finit dans un src= d'image et n'était, elle, pas
    // vérifiée du tout. Une adresse en http:// serait bloquée comme contenu
    // mixte une fois le catalogue servi en HTTPS (donc une photo qui ne
    // s'affiche jamais, sans explication), et n'importe quel autre protocole
    // n'a rien à faire là.
    if(!_isSafeHttpUrl(fPhoto.value.trim())){
      showToast('URL de photo invalide — seuls les liens http:// et https:// sont autorisés.', 'err', 4000);
      return;
    }
    var cataloguePrice = formatPrice(fPrice.value);
    var sellingPriceRaw = fSellingPrice ? fSellingPrice.value.trim() : '';
    var newPrice = cataloguePrice;

    // En mode création : si un prix de vente est saisi, le prix catalogue va en historique
    // et le prix de vente devient le prix actuel
    var initialHistory = [];
    if(!editingId && sellingPriceRaw && sellingPriceZoneEl.style.display !== 'none'){
      var sellingPrice = formatPrice(sellingPriceRaw);
      if(cataloguePrice) initialHistory.push({price: cataloguePrice, date: Date.now()});
      newPrice = sellingPrice;
    } else if(!editingId && cataloguePrice){
      // Pas de prix de vente saisi : prix catalogue = prix actuel, historique vide
      newPrice = cataloguePrice;
    }

    // Domaine du formulaire — pour le payload uniquement : les familles
    // (nom ET icône) sont partagées entre les deux catalogues, voir
    // familyIcons juste en dessous, sans scope par domaine.
    var formDomain = (fDomain && fDomain.value === 'pneumatique') ? 'pneumatique' : 'electrique';

    // Sauvegarder l'icône si c'est une nouvelle famille
    var familyVal = fFamily.value.trim();
    if(familyVal && familyIconRow.classList.contains('show')){
      familyIcons[familyVal] = selectedFamilyIcon;
      saveFamilyIcons();
    }

    var _specsObjForPayload = typeof window._getSpecsObj === 'function' ? window._getSpecsObj() : {};

    var payload = {
      domaine: formDomain,
      brand: brand,
      ref: ref,
      family: familyVal,
      familyIcon: familyVal ? (familyIcons[familyVal] || selectedFamilyIcon || getFamilyIcon(familyVal)) : '',
      series: fSeries.value.trim(),
      supplier:  fSupplier.value.trim(),
      leadTime:  document.getElementById('fLeadTime') ? (document.getElementById('fLeadTime').value||'').trim() : '',
      url: fUrl.value.trim(),
      name: fName.value.trim(),
      desc: stripHtml(fDesc.value.trim()),
      tags: canonicalizeTags(fTags.value.split(',').map(function(t){ return t.trim(); }).filter(Boolean)),
      available3DX: f3dAvailable.checked,
      available3DXLink: f3dLink.value.trim(),
      essential: document.getElementById('fEssential') ? document.getElementById('fEssential').checked : false,
      spiLabs: document.getElementById('fSpiLabs') ? document.getElementById('fSpiLabs').checked : false,
      suggestions: typeof window._getSugRefs === 'function' ? window._getSugRefs() : [],
      suggestionsHidden: typeof window._getSugHidden === 'function' ? window._getSugHidden() : [],
      spareParts: typeof window._getSparePartsRefs === 'function' ? window._getSparePartsRefs() : [],
      sparePartsHidden: typeof window._getSparePartsHidden === 'function' ? window._getSparePartsHidden() : [],
      specs: _specsObjForPayload,
      price: newPrice,
      priceCatalogue: cataloguePrice || '',
      // Retour utilisateur : "afficher ci c'est un prix au metre a la piece
      // ou x quantité" — 'piece' est la valeur par défaut d'un produit sans
      // ce champ (voir js/render-price-helpers.js pour l'affichage), donc
      // rétrocompatible avec tous les produits déjà enregistrés.
      priceUnit: (fPriceUnit && (fPriceUnit.value === 'metre' || fPriceUnit.value === 'lot')) ? fPriceUnit.value : 'piece',
      priceUnitQty: (fPriceUnit && fPriceUnit.value === 'lot' && fPriceUnitQty) ? (parseInt(fPriceUnitQty.value, 10) || 0) : 0,
      photo: fPhoto.value.trim()
    };

    // ── Mode proposition : envoyer au serveur via reqSubmit ──
    if(window._proposeMode && typeof window.reqSubmit === 'function'){
      (async function(){
        var btnSave = document.getElementById('btnSave');
        // Retour utilisateur : "est-ce qu'il y a un spinner ?" — ce flux
        // attend réellement la réponse serveur (contrairement à
        // l'enregistrement direct admin, fire-and-forget, voir save() dans
        // js/storage.js), donc un vrai indicateur de chargement a du sens ici
        // (avant : juste disabled + opacité réduite, sans rien qui bouge).
        _setBtnSaveLoading(btnSave, true);
        var original = window._proposeOriginal || null;
        if(original) payload.ref = original.ref; // garder la ref originale pour la modif
        var ok = await window.reqSubmit(payload, original);
        if(ok === true && Array.isArray(window._proposeAttachedFiles) && window._proposeAttachedFiles.length && typeof window.reqUploadAttachedFiles === 'function'){
          await window.reqUploadAttachedFiles(payload.ref, window._proposeAttachedFiles);
        }
        window._proposeAttachedFiles = [];
        _setBtnSaveLoading(btnSave, false);
        if(ok === true){
          showToast('Demande envoyée ✓', 'ok', 3000);
          // Fermeture directe : la demande est déjà envoyée, il n'y a rien à
          // "perdre" — pas besoin de la confirmation "Annuler la saisie".
          if(typeof window._resetProposeModeUI === 'function') window._resetProposeModeUI();
          if(typeof closeModal === 'function') closeModal();
          else document.getElementById('modalOverlay').classList.remove('open');
        } else if(ok === 'conflict'){
          // Retour utilisateur : "ajouter une popup pour dire qu'une demande
          // est déjà en attente" — filet de sécurité en plus du contrôle
          // fait AVANT l'ouverture du formulaire (voir vmProposeMenuBtn dans
          // js/requests.js) : une autre demande a pu être soumise entretemps
          // pendant que ce formulaire était ouvert. Formulaire laissé
          // ouvert (pas de closeModal) : la saisie n'est pas perdue, rien
          // n'a été envoyé.
          customAlert('Demande déjà en attente', 'Une demande est déjà en attente de validation pour ce produit — attendez qu\'elle soit traitée avant d\'en proposer une nouvelle.');
        } else {
          showToast('Erreur lors de l\'envoi', 'warn', 3000);
        }
      })();
      return;
    }

    // ── Mode révision de demande (admin) : valider les modifs et accepter ──
    if(window._reviewMode && window._reviewItem && typeof window.reqAccept === 'function'){
      (async function(){
        var btnSave = document.getElementById('btnSave');
        _setBtnSaveLoading(btnSave, true); // voir le commentaire équivalent sur le mode proposition plus haut
        var item = window._reviewItem;
        var reviewUser = window._reviewUser;
        var base = window._reviewBase || {};
        if(base.id) payload.id = base.id;
        payload.createdAt = base.createdAt || Date.now();
        var history = Array.isArray(base.priceHistory) ? base.priceHistory.slice() : [];
        var oldReviewPrice = (base.price || '').trim();
        if(oldReviewPrice && oldReviewPrice !== newPrice.trim()) history.push({price: oldReviewPrice, date: Date.now()});
        payload.priceHistory = history;
        // Le champ prix de la modale standard représente le prix courant, pas
        // le prix catalogue — conserver celui soumis à l'origine (pas de champ
        // dédié pour le modifier dans ce flux de révision).
        payload.priceCatalogue = base.priceCatalogue || '';

        var ok = await window.reqAccept(item.ref, reviewUser, payload);
        _setBtnSaveLoading(btnSave, false);
        if(ok){
          showToast('Demande acceptée ✓', 'ok', 3000);
          if(typeof window._resetReviewModeUI === 'function') window._resetReviewModeUI();
          if(typeof closeModal === 'function') closeModal();
          else document.getElementById('modalOverlay').classList.remove('open');
          if(typeof reqOpenPanel === 'function') reqOpenPanel();
          if(typeof reqUpdateBadge === 'function') reqUpdateBadge();
        } else {
          showToast('Erreur lors de la validation', 'warn', 3000);
        }
      })();
      return;
    }

    // Retour utilisateur : "il faut que le serveur valide avant de
    // l'ecrire en local" — tout ce bloc calcule désormais ce qui SERAIT
    // enregistré (produit édité/créé, propagation d'icône de famille, liens
    // réciproques) dans des copies ("pendingXxx"), SANS toucher à `products`
    // ni appeler save() tant que le serveur n'a pas confirmé. Rien n'est
    // écrit localement avant la ligne "await pushToServer(...)" plus bas ;
    // en cas d'échec, la fonction s'arrête avant d'avoir rien modifié et le
    // formulaire reste ouvert avec la saisie intacte.
    var idx = -1;
    var existing;
    var pendingMainProduct;
    var oldRefBeforeEdit, refChangedOnEdit;
    // id -> { product: référence live dans `products`, changes: {...} } —
    // modifications en attente sur des produits AUTRES que celui édité/créé
    // (propagation d'icône de famille, liens réciproques).
    var pendingUpdates = {};
    function _queuePendingUpdate(product, changes){
      var entry = pendingUpdates[product.id];
      if(!entry){ entry = { product: product, changes: {} }; pendingUpdates[product.id] = entry; }
      Object.assign(entry.changes, changes);
    }

    if(editingId){
      idx = products.findIndex(function(x){return x.id===editingId;});
      if(idx !== -1){
        existing = products[idx];
        // En mode édition, fPrice contient le prix de vente actuel (voir
        // fillFormFromProduct), pas le prix catalogue — la ligne "cataloguePrice
        // = formatPrice(fPrice.value)" plus haut ne reflète donc PAS le prix
        // catalogue ici. Seule la sous-modale "Gestion des prix" (priceModalAddBtn)
        // gère ce champ séparément. Sans cette ligne, "Enregistrer" écrasait
        // p.priceCatalogue avec le prix de vente, effaçant silencieusement toute
        // remise déjà en place (bug : modifier prix catalogue ET remisé dans la
        // sous-modale, puis Enregistrer, ne gardait que le prix remisé).
        payload.priceCatalogue = existing.priceCatalogue || '';
        var oldPrice = (existing.price||'').trim();
        if(oldPrice && oldPrice !== newPrice.trim()){
          var history = Array.isArray(existing.priceHistory) ? existing.priceHistory.slice() : [];
          history.push({price: oldPrice, date: Date.now()});
          payload.priceHistory = history;
        }
        payload.updatedAt = Date.now(); // marquer comme modifié pour la sync serveur
        // Changement de référence : à retenir AVANT l'Object.assign ci-dessous
        // (qui écrase existing.ref) — voir le nettoyage serveur après le
        // if/else (retour utilisateur : "quand je modifie la référence, ça
        // crée un nouveau produit").
        oldRefBeforeEdit = (existing.ref || '').trim();
        refChangedOnEdit = oldRefBeforeEdit && oldRefBeforeEdit !== payload.ref;
        pendingMainProduct = Object.assign({}, existing, payload);
        // Retirer le verrou "en cours d'édition" (voir _tryLockProductForEdit
        // dans ce même fichier) — Object.assign ci-dessus aurait sinon
        // reconduit _editingBy/_editingAt/_editingSessionId de "existing" tel
        // quel, l'enregistrement ne les efface pas implicitement.
        delete pendingMainProduct._editingBy;
        delete pendingMainProduct._editingAt;
        delete pendingMainProduct._editingSessionId;
        // Propager l'icône à tous les produits de la même famille — bump
        // updatedAt sur chacun, sinon le serveur ignore silencieusement leur
        // envoi (pas plus récent que sa version déjà enregistrée). Condition
        // p.familyIcon !== payload.familyIcon ajoutée : sans elle, cette
        // boucle retouchait TOUS les frères de la famille à CHAQUE
        // modification du produit (même sans rapport avec l'icône, ex.
        // changer juste le fournisseur), gonflant inutilement la liste des
        // produits à synchroniser.
        if(familyVal && payload.familyIcon){
          products.forEach(function(p){
            if(p.family === familyVal && p.id !== editingId && p.familyIcon !== payload.familyIcon){
              _queuePendingUpdate(p, { familyIcon: payload.familyIcon, updatedAt: Date.now() });
            }
          });
        }
      }
    }else{
      payload.id = 'p_' + Date.now() + '_' + _secureRandomBase36(6);
      // Propager l'icône aux produits existants de la même famille — bump
      // updatedAt sur chacun, sinon le serveur ignore silencieusement leur
      // envoi (pas plus récent que sa version déjà enregistrée).
      if(familyVal && payload.familyIcon){
        products.forEach(function(p){
          if(p.family === familyVal && !p.familyIcon){
            _queuePendingUpdate(p, { familyIcon: payload.familyIcon, updatedAt: Date.now() });
          }
        });
      }
      payload.createdAt = Date.now();
      payload.updatedAt = Date.now();
      payload.priceHistory = initialHistory;
      pendingMainProduct = payload;
    }

    // ── Liaison réciproque des suggestions ET des pièces de rechange ──────
    // Ajouter B dans la liste de A crée automatiquement le lien A dans la
    // liste de B — sans ça, il fallait aller l'ajouter à la main des deux
    // côtés (retour utilisateur, étendu aux pièces de rechange : "une
    // rubrique pièces de rechange comme pour les suggestions"). Uniquement
    // dans le sens "nouvellement ajouté" : on ne touche jamais aux refs déjà
    // présentes avant cet enregistrement, ni à celles retirées côté A
    // (retirer un lien ou le masquer reste local à la fiche éditée — pour le
    // masquer aussi côté B, il faut le décocher directement sur la fiche B,
    // à la main, voir la case à cocher par puce dans js/modal-suggestions-autocomplete.js/
    // js/modal-spareparts-suggestions-dnd.js). Si B a
    // déjà A dans sa propre liste (retiré puis re-proposé, ou ajouté à la
    // main des deux côtés), on ne le re-rajoute pas.
    function _computeReciprocalLinks(field){
      var previous = (existing && Array.isArray(existing[field])) ? existing[field] : [];
      var final = Array.isArray(payload[field]) ? payload[field] : [];
      var finalRef = payload.ref;
      final.forEach(function(otherRef){
        if(previous.indexOf(otherRef) !== -1) return; // déjà lié avant cet enregistrement
        var other = products.find(function(p){ return p.ref === otherRef; });
        if(!other || other.ref === finalRef) return;
        // Repart de la liste déjà en attente (ex. ce même produit touché par
        // la propagation d'icône ci-dessus) plutôt que de la valeur live, pour
        // ne pas perdre un ajout déjà mis en file sur ce champ.
        var already = pendingUpdates[other.id];
        var otherList = (already && Array.isArray(already.changes[field])) ? already.changes[field] : (Array.isArray(other[field]) ? other[field] : []);
        if(otherList.indexOf(finalRef) !== -1) return; // déjà lié côté B
        var changes = {}; changes[field] = otherList.concat([finalRef]); changes.updatedAt = Date.now();
        _queuePendingUpdate(other, changes);
      });
    }
    _computeReciprocalLinks('suggestions');
    _computeReciprocalLinks('spareParts');

    // ── Construction de la liste à envoyer au serveur, à partir des copies
    // calculées ci-dessus — rien de tout ça n'existe encore dans `products`.
    var touchedForSync = [];
    if(pendingMainProduct) touchedForSync.push(pendingMainProduct);
    Object.keys(pendingUpdates).forEach(function(id){
      var entry = pendingUpdates[id];
      touchedForSync.push(Object.assign({}, entry.product, entry.changes));
    });

    // Retour utilisateur : "il faut que le serveur valide avant de l'ecrire
    // en local" — on attend ici la vraie confirmation serveur, AVANT
    // d'appliquer quoi que ce soit sur `products` ou en localStorage. Si le
    // serveur n'est pas configuré (pas d'URL), rien à valider : on enregistre
    // directement en local, comme avant.
    var serverConfigured = typeof pushToServer === 'function' && !!localStorage.getItem('cat_server_url');
    var btnSaveMain = document.getElementById('btnSave');
    var pushOk = true;
    if(serverConfigured && touchedForSync.length){
      _setBtnSaveLoading(btnSaveMain, true);
      pushOk = await pushToServer(touchedForSync);
      _setBtnSaveLoading(btnSaveMain, false);
    }
    if(!pushOk){
      // Rien n'a été écrit (ni products, ni localStorage) — formulaire
      // laissé ouvert avec la saisie intacte, l'utilisateur peut réessayer.
      showToast('Échec de synchronisation avec le serveur — rien n\'a été enregistré, réessayez.', 'err', 5000);
      return;
    }

    // ── Le serveur a confirmé (ou n'est pas configuré) : on applique
    // maintenant réellement tout ce qui a été calculé plus haut. ──
    if(editingId){
      if(idx !== -1) products[idx] = pendingMainProduct;
    } else {
      products.push(pendingMainProduct);
    }
    Object.keys(pendingUpdates).forEach(function(id){
      var entry = pendingUpdates[id];
      Object.assign(entry.product, entry.changes); // mutation en place, même référence que dans `products`
    });

    // ── Nettoyage serveur en cas de changement de référence ────────────────
    // /pushDatas fait un upsert par "ref" côté serveur (voir catalogue_core.py,
    // ON CONFLICT(ref) DO UPDATE) — il n'a AUCUN moyen de savoir qu'une
    // fiche a été RENOMMÉE plutôt que créée : pousser la nouvelle ref crée
    // une ligne supplémentaire, l'ANCIENNE reste orpheline sur le serveur.
    // Localement product[idx] est bien remplacé en place (une seule entrée,
    // pas de doublon visible tout de suite) — mais au prochain syncFromServer
    // (toutes les 15s en tâche de fond), cette ancienne ligne orpheline
    // revient comme si c'était un "nouveau produit" jamais vu localement,
    // créant le doublon que l'utilisateur voit apparaître après coup (retour
    // utilisateur : "quand je modifie la référence, ça crée un nouveau
    // produit"). Supprimer explicitement l'ancienne ref côté serveur une fois
    // la nouvelle poussée — même API que deleteProduct() dans js/render-card-grid.js.
    if(refChangedOnEdit){
      (function(oldRef){
        var sUrl = localStorage.getItem('cat_server_url');
        if(!sUrl) return;
        setTimeout(function(){
          fetch(sUrl+'/deleteDatas?ref='+encodeURIComponent(oldRef), {
            method: 'DELETE',
            headers: (function(){
              var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
              delete h['Content-Type'];
              return h;
            })()
          }).then(function(r){
            if(!r.ok) console.warn('Nettoyage ancienne référence: HTTP', r.status, '(', oldRef, ')');
          }).catch(function(e){ console.warn('Nettoyage ancienne référence:', e.message); });
        }, 1500); // laisser le temps au push de la nouvelle ref d'arriver en premier
      })(oldRefBeforeEdit);
    }

    // Persistance locale uniquement (localStorage + fichier) — le serveur a
    // déjà été synchronisé ci-dessus, [] évite un second aller-retour réseau
    // inutile (voir le repli "rien à envoyer" dans pushToServer, js/actions-
    // settings-sync.js).
    await save(false, []);
    render();
    // render() ne met à jour que la grille catalogue — si on enregistre
    // depuis la page d'accueil (bouton + de la home), la fiche produit
    // s'ouvre par-dessus puis se referme sur la home, jamais rafraîchie :
    // le compteur de produits/familles y restait figé jusqu'à un F5 (retour
    // utilisateur). deleteProduct()/syncFromServer() faisaient déjà cette
    // vérification, pas ce point d'enregistrement.
    var homePageEl = document.getElementById('homePage');
    if(homePageEl && !homePageEl.classList.contains('hidden')) renderHome();
    var savedId = editingId || products[products.length - 1].id;
    var savedRef = products.find(function(p){ return p.id === savedId; });
    savedRef = savedRef ? savedRef.ref : null;

    // Documents mis en attente pendant la CRÉATION directe (voir
    // window._directAttachedFiles, js/modal-autocomplete.js) — envoyés
    // maintenant que le produit vient d'être créé et poussé au serveur
    // ci-dessus (save(), quelques lignes plus haut), donc que sa ref est
    // définitive. En arrière-plan, sans bloquer la fermeture de la fenêtre —
    // retour utilisateur : "pouvoir ajouter un document lors de la création
    // d'un produit".
    if(!editingId && Array.isArray(window._directAttachedFiles) && window._directAttachedFiles.length
       && savedRef && typeof window._directUploadAttachedFiles === 'function'){
      (function(refForDocs, filesForDocs){
        window._directUploadAttachedFiles(refForDocs, filesForDocs).then(function(uploaded){
          if(!uploaded || !uploaded.length) return;
          var idx3 = products.findIndex(function(p){ return p.ref === refForDocs; });
          if(idx3 !== -1){
            products[idx3].hasDoc = true;
            products[idx3].docFilename = uploaded.map(function(f){ return f.filename; }).join(', ');
            products[idx3]._docFiles = uploaded;
            save(true, [products[idx3]]);
            if(typeof render === 'function') render();
          }
          showToast(uploaded.length + ' document' + (uploaded.length > 1 ? 's' : '') + ' envoyé' + (uploaded.length > 1 ? 's' : '') + ' ✓', 'ok', 2500);
        });
      })(savedRef, window._directAttachedFiles);
    }
    window._directAttachedFiles = [];

    closeModal();
    openView(savedId);

  });

