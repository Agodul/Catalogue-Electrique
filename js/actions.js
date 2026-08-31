// ---------- Flèche "retour au menu" à gauche du titre (quand une fenêtre a
// été ouverte depuis le tiroir menu mobile) ----------
// Retour utilisateur : "regarde dans paramètres, chacune des fonctions a une
// flèche de retour, c'est cette flèche que je voudrais pour toutes les pages
// du menu mobile" puis "je voudrai la flèche à gauche du titre à chaque
// fois" — les sous-pages de Paramètres (Serveur, Utilisateurs, Fiches
// verrouillées, Icônes des familles) ont déjà une flèche ← dédiée, à gauche
// de leur titre (retour vers la liste Paramètres). Les autres fenêtres
// ouvertes depuis le menu mobile (Demandes, Paramètres lui-même, Connexion,
// Signaler un bug, Comparateur) n'avaient qu'une croix × en haut à droite —
// qui "revient" bien au menu fonctionnellement (voir msWithBack ci-dessous
// et les fonctions de fermeture dans js/auth.js/js/requests.js) mais sans ce
// même signal visuel ni cette même position.
// Chaque en-tête concerné a maintenant DEUX boutons distincts : la croix ×
// d'origine (en haut à droite, comportement inchangé) ET un nouveau bouton
// flèche ← (masqué par défaut, placé juste à gauche du titre dans le HTML —
// voir index.html). _setHeaderBackMode bascule laquelle des deux est
// visible ; le bouton flèche se contente de cliquer programmatiquement sur
// la croix d'origine pour réutiliser exactement la même logique de
// fermeture (confirmation de saisie non enregistrée, etc.) sans la
// dupliquer. Utilisé depuis actions.js/auth.js/requests.js, d'où
// l'exposition globale plutôt qu'une fonction interne à une seule IIFE.
var _headerBackWired = {};
function _setHeaderBackMode(closeBtnId, backBtnId, isBack){
  var closeBtn = document.getElementById(closeBtnId);
  var backBtn  = document.getElementById(backBtnId);
  if(!backBtn) return;
  if(!_headerBackWired[backBtnId]){
    _headerBackWired[backBtnId] = true;
    backBtn.addEventListener('click', function(){
      if(closeBtn) closeBtn.click();
    });
  }
  backBtn.style.display  = isBack ? 'inline-flex' : 'none';
  if(closeBtn) closeBtn.style.display = isBack ? 'none' : '';
}
window._setHeaderBackMode = _setHeaderBackMode;

// ---------- Chargement paresseux de XLSX (import/export Excel) ----------
  var _xlsxLoadPromise = null;
  function ensureXLSX(){
    if(window.XLSX) return Promise.resolve();
    if(_xlsxLoadPromise) return _xlsxLoadPromise;
    _xlsxLoadPromise = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      // Auto-hébergé (js/xlsx.full.min.js, SheetJS 0.20.3), comme js/pdf.min.js.
      s.src = 'js/xlsx.full.min.js';
      s.onload = function(){ _patchXlsxFormulaInjection(); resolve(); };
      s.onerror = function(){ _xlsxLoadPromise = null; reject(new Error('Échec du chargement de la librairie Excel')); };
      document.head.appendChild(s);
    });
    return _xlsxLoadPromise;
  }

  // Neutralise les cellules commençant par "=", "+", "-" ou "@" dans tous
  // les exports Excel (comparaison, tarifs, configurateur d'armoire…).
  // Patché ici une seule fois après le chargement de la librairie
  // (ensureXLSX est le point de passage unique avant tout appel XLSX.*
  // dans l'app — voir js/armoireConfig.js).
  function _patchXlsxFormulaInjection(){
    if(!window.XLSX || !XLSX.utils || XLSX.utils.aoa_to_sheet.__spiPatched) return;
    var original = XLSX.utils.aoa_to_sheet;
    function sanitizeCell(v){
      if(typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
      return v;
    }
    XLSX.utils.aoa_to_sheet = function(aoa, opts){
      var safe = aoa.map(function(row){
        return row.map(sanitizeCell);
      });
      return original.call(XLSX.utils, safe, opts);
    };
    XLSX.utils.aoa_to_sheet.__spiPatched = true;
  }

  // Fermeture animée de l'import Excel — exposée en global, appelée aussi bien
  // par les deux boutons de la fenêtre (✕ et Annuler, branchés juste en
  // dessous) que par la fin de l'import lui-même, plus bas dans ce fichier.
  window._closeXlsxImportOverlay = function(){
    var el = document.getElementById('xlsxImportOverlay');
    document.body.classList.remove('modal-open');
    if(!el) return;
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(el, function(){ el.style.display = 'none'; });
    } else {
      el.style.display = 'none';
    }
  };

  // Ces deux boutons portaient un onclick="window._closeXlsxImportOverlay();"
  // dans index.html — du code exécutable dans un attribut, ce qui obligeait la
  // CSP à conserver 'unsafe-inline' dans script-src.
  ['btnCloseXlsxImport', 'btnCancelXlsxImport'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('click', function(){ window._closeXlsxImportOverlay(); });
  });

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

  document.getElementById('btnSave').addEventListener('click', function(){
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
    if(!brand || !ref){
      showToast('La marque et la référence sont obligatoires.', 'err', 3000);
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

    // Sauvegarder l'icône si c'est une nouvelle famille
    var familyVal = fFamily.value.trim();
    if(familyVal && familyIconRow.classList.contains('show')){
      familyIcons[familyVal] = selectedFamilyIcon;
      saveFamilyIcons();
    }

    var _specsObjForPayload = typeof window._getSpecsObj === 'function' ? window._getSpecsObj() : {};

    var payload = {
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
      suggestions: typeof window._getSugRefs === 'function' ? window._getSugRefs() : [],
      suggestionsHidden: typeof window._getSugHidden === 'function' ? window._getSugHidden() : [],
      spareParts: typeof window._getSparePartsRefs === 'function' ? window._getSparePartsRefs() : [],
      sparePartsHidden: typeof window._getSparePartsHidden === 'function' ? window._getSparePartsHidden() : [],
      specs: _specsObjForPayload,
      price: newPrice,
      priceCatalogue: cataloguePrice || '',
      photo: fPhoto.value.trim()
    };

    // ── Mode proposition : envoyer au serveur via reqSubmit ──
    if(window._proposeMode && typeof window.reqSubmit === 'function'){
      (async function(){
        var btnSave = document.getElementById('btnSave');
        if(btnSave){ btnSave.disabled = true; btnSave.style.opacity = '0.5'; }
        var original = window._proposeOriginal || null;
        if(original) payload.ref = original.ref; // garder la ref originale pour la modif
        var ok = await window.reqSubmit(payload, original);
        if(ok && Array.isArray(window._proposeAttachedFiles) && window._proposeAttachedFiles.length && typeof window.reqUploadAttachedFiles === 'function'){
          await window.reqUploadAttachedFiles(payload.ref, window._proposeAttachedFiles);
        }
        window._proposeAttachedFiles = [];
        if(btnSave){ btnSave.disabled = false; btnSave.style.opacity = ''; }
        if(ok){
          showToast('Demande envoyée ✓', 'ok', 3000);
          // Fermeture directe : la demande est déjà envoyée, il n'y a rien à
          // "perdre" — pas besoin de la confirmation "Annuler la saisie".
          if(typeof window._resetProposeModeUI === 'function') window._resetProposeModeUI();
          if(typeof closeModal === 'function') closeModal();
          else document.getElementById('modalOverlay').classList.remove('open');
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
        if(btnSave){ btnSave.disabled = true; btnSave.style.opacity = '0.5'; }
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
        if(btnSave){ btnSave.disabled = false; btnSave.style.opacity = ''; }
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

    // Produits réellement touchés par cet enregistrement (le produit
    // sauvegardé + les éventuels autres produits de la même famille dont
    // l'icône est propagée ci-dessous) — transmis à save() pour n'envoyer
    // que ceux-ci au serveur plutôt que tout le catalogue à chaque fois
    // (retour utilisateur + dev : gros payload identifié comme cause d'échec
    // de synchro pour les comptes non-admin).
    var touchedForSync = [];
    if(editingId){
      var idx = products.findIndex(function(x){return x.id===editingId;});
      if(idx !== -1){
        var existing = products[idx];
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
        var oldRefBeforeEdit = (existing.ref || '').trim();
        var refChangedOnEdit = oldRefBeforeEdit && oldRefBeforeEdit !== payload.ref;
        products[idx] = Object.assign({}, existing, payload);
        // Retirer le verrou "en cours d'édition" (voir _tryLockProductForEdit
        // dans ce même fichier) — Object.assign ci-dessus aurait sinon
        // reconduit _editingBy/_editingAt/_editingSessionId de "existing" tel
        // quel, l'enregistrement ne les efface pas implicitement.
        delete products[idx]._editingBy;
        delete products[idx]._editingAt;
        delete products[idx]._editingSessionId;
        touchedForSync.push(products[idx]);
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
            if(p.family === familyVal && p.id !== products[idx].id && p.familyIcon !== payload.familyIcon){
              p.familyIcon = payload.familyIcon;
              p.updatedAt = Date.now();
              touchedForSync.push(p);
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
            p.familyIcon = payload.familyIcon;
            p.updatedAt = Date.now();
            touchedForSync.push(p);
          }
        });
      }
      payload.createdAt = Date.now();
      payload.updatedAt = Date.now();
      payload.priceHistory = initialHistory;
      products.push(payload);
      touchedForSync.push(payload);
    }

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
    // la nouvelle poussée — même API que deleteProduct() dans js/render.js.
    if(typeof refChangedOnEdit !== 'undefined' && refChangedOnEdit){
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

    // ── Liaison réciproque des suggestions ET des pièces de rechange ──────
    // Ajouter B dans la liste de A crée automatiquement le lien A dans la
    // liste de B — sans ça, il fallait aller l'ajouter à la main des deux
    // côtés (retour utilisateur, étendu aux pièces de rechange : "une
    // rubrique pièces de rechange comme pour les suggestions"). Uniquement
    // dans le sens "nouvellement ajouté" : on ne touche jamais aux refs déjà
    // présentes avant cet enregistrement, ni à celles retirées côté A
    // (retirer un lien ou le masquer reste local à la fiche éditée — pour le
    // masquer aussi côté B, il faut le décocher directement sur la fiche B,
    // à la main, voir la case à cocher par puce dans js/modal.js). Si B a
    // déjà A dans sa propre liste (retiré puis re-proposé, ou ajouté à la
    // main des deux côtés), on ne le re-rajoute pas.
    function _linkReciprocal(field){
      var previous = (typeof existing !== 'undefined' && existing && Array.isArray(existing[field]))
        ? existing[field] : [];
      var final = Array.isArray(payload[field]) ? payload[field] : [];
      var finalRef = payload.ref;
      final.forEach(function(otherRef){
        if(previous.indexOf(otherRef) !== -1) return; // déjà lié avant cet enregistrement
        var other = products.find(function(p){ return p.ref === otherRef; });
        if(!other || other.ref === finalRef) return;
        var otherList = Array.isArray(other[field]) ? other[field] : [];
        if(otherList.indexOf(finalRef) !== -1) return; // déjà lié côté B
        other[field] = otherList.concat([finalRef]);
        other.updatedAt = Date.now();
        // Éviter un doublon si ce produit a déjà été ajouté à touchedForSync
        // plus haut (ex. propagation d'icône de famille sur ce même produit).
        if(touchedForSync.indexOf(other) === -1) touchedForSync.push(other);
      });
    }
    _linkReciprocal('suggestions');
    _linkReciprocal('spareParts');

    // Animation 5 — flash vert sur le bouton enregistrer
    var btnSaveEl = document.getElementById('btnSave');
    btnSaveEl.classList.remove('save-anim');
    void btnSaveEl.offsetWidth;
    btnSaveEl.classList.add('save-anim');

    save(false, touchedForSync);
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

    // Fermer après le flash
    setTimeout(function(){
      btnSaveEl.classList.remove('save-anim');
      closeModal();
      openView(savedId);
    }, 900);

  });

  // ---------- Search / filter ----------
  var _searchRenderDebounced = debounce(function(){ render(true); }, 180);
  searchInputEl.addEventListener('input', function(){
    // Si on est sur la home et qu'on tape, basculer vers le catalogue
    var homePage = document.getElementById('homePage');
    if(homePage && !homePage.classList.contains('hidden') && searchInputEl.value.trim().length > 0){
      showCatalogueAll();
    }
    _searchRenderDebounced();
  });
  brandFilterEl.addEventListener('change', function(){ render(); });
  familyFilterEl.addEventListener('change', function(){ render(); });
  seriesFilterEl.addEventListener('change', function(){ render(); });

  // ── Tri par prix ──────────────────────────────────────────────
  window._priceSort = null; // null | 'asc' | 'desc'
  var sortPriceBtn  = document.getElementById('sortPriceBtn');
  var sortPriceIcon = document.getElementById('sortPriceIcon');
  // Partagé avec le bottom-sheet filtres mobile (même état, même rendu)
  window._setPriceSort = function(mode){
    window._priceSort = mode || null;
    if(sortPriceBtn) sortPriceBtn.classList.remove('active-asc','active-desc');
    if(mode === 'asc'){
      if(sortPriceBtn) sortPriceBtn.classList.add('active-asc');
      if(sortPriceIcon) sortPriceIcon.className = 'ti ti-sort-ascending sort-icon';
    } else if(mode === 'desc'){
      if(sortPriceBtn) sortPriceBtn.classList.add('active-desc');
      if(sortPriceIcon) sortPriceIcon.className = 'ti ti-sort-descending sort-icon';
    } else {
      if(sortPriceIcon) sortPriceIcon.className = 'ti ti-arrows-sort sort-icon';
    }
  };
  if(sortPriceBtn){
    sortPriceBtn.addEventListener('click', function(){
      var next = window._priceSort === null ? 'asc' : window._priceSort === 'asc' ? 'desc' : null;
      window._setPriceSort(next);
      _lastRenderKey = ''; render();
    });
  }

  // Utilitaire debounce pour le filtre prix
  function debounce(fn, delay){
    var t;
    return function(){ clearTimeout(t); t = setTimeout(fn, delay); };
  }

  document.querySelectorAll('.grp-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      groupBy = btn.getAttribute('data-group');
      document.querySelectorAll('.grp-btn').forEach(function(b){
        b.classList.toggle('active', b===btn);
      });
      render();
    });
  });

  // ---------- Menu ⋮ (Exporter / Importer / Nettoyer) ----------
  // ── Paramètres ──────────────────────────────────────────────────────
  var btnSettings      = document.getElementById('btnSettings');
  var settingsOverlay  = document.getElementById('settingsOverlay');
  var settingsClose    = document.getElementById('settingsClose');
  var settingsFamilyList = document.getElementById('settingsFamilyList');
  var settingsEditingFamily = null; // famille en cours de modif depuis Paramètres

  function renderSettingsFamilies(){
    refreshKnownFamilies();
    // Compter produits par famille
    var counts = {};
    products.forEach(function(p){ if(p.family) counts[p.family] = (counts[p.family]||0)+1; });

    if(knownFamilies.length === 0){
      settingsFamilyList.innerHTML = '<p style="color:var(--ink-soft);font-size:13px;padding:10px 0;">Aucune famille définie.</p>';
      return;
    }
    settingsFamilyList.innerHTML = knownFamilies.sort().map(function(f){
      var icon = getFamilyIcon(f);
      var count = counts[f] || 0;
      return '<div class="family-icon-row-settings" data-family="'+escapeHtml(f)+'">'
        + '<div class="family-icon-thumb" id="settings-thumb-'+escapeHtml(f)+'">'+renderFamilyIconHtml(icon)+'</div>'
        + '<div class="family-icon-name">'+escapeHtml(f)+'</div>'
        + '<div class="family-icon-count">'+count+(count>1?' réf':' réf')+'</div>'
        + '<button class="family-icon-change-btn" data-family="'+escapeHtml(f)+'"><i class="ti ti-pencil"></i></button>'
        + '</div>';
    }).join('');

    settingsFamilyList.querySelectorAll('.family-icon-change-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        settingsEditingFamily = btn.getAttribute('data-family');
        selectedFamilyIcon = getFamilyIcon(settingsEditingFamily);
        iconPickerSearch.value = '';
        renderIconGrid('');
        iconPickerModal.classList.add('show');
      });
    });
  }

  var SERVER_KEY           = 'cat_server_url';
  var SERVER_LAST_SYNC_KEY = 'cat_server_last_sync';
  var CHECKALL_KEY         = 'cat_server_checkall_state'; // dernier snapshot /checkAll connu (par collection)
  var serverUrl  = '';

  function loadServerConfig(){
    serverUrl  = localStorage.getItem(SERVER_KEY) || '';
    updateServerSubtitle();
    if(serverUrl){
      setTimeout(function(){
        // doCheckAllSync()/startSyncPolling() tournent maintenant MÊME sans
        // connexion — un serveur injoignable l'est pour tout le monde, pas
        // seulement les comptes authentifiés. Avant, tout ce bloc (donc le
        // tout premier passage qui aurait pu détecter une panne) était
        // sauté sans session active, et startSyncPolling() lui-même
        // refusait de démarrer l'intervalle de vérification pour un compte
        // déconnecté — le point de statut restait donc bloqué sur son vert
        // optimiste initial indéfiniment (retour utilisateur : "le statut
        // du serveur ne passe pas en rouge lorsque le serveur n'est plus
        // joignable"). syncDeletions() reste réservé aux comptes connectés
        // (données du catalogue, nécessite une session).
        doCheckAllSync();
        startSyncPolling();
        if(typeof authIsLoggedIn === 'function' && authIsLoggedIn()) syncDeletions();
      }, 1500);
      // Sync suppressions toutes les 5 minutes (si connecté)
      setInterval(function(){
        if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
        syncDeletions();
      }, 5 * 60 * 1000);
    }
  }

  // Reflète la connectivité RÉELLE, pas juste "un serveur est configuré" —
  // avant, le point restait vert même Wi-Fi coupé (retour utilisateur :
  // "je suis toujours connecté alors que je peux plus taper le serveur").
  // Optimiste par défaut (true) tant qu'aucune vérification n'a encore
  // échoué, pour ne pas afficher rouge par erreur avant le tout premier
  // passage de doCheckAllSync(). Mis à jour à 2 endroits : ici via
  // navigator.onLine (instantané, coupure Wi-Fi/avion) et dans
  // doCheckAllSync() via le résultat réel du fetch (détecte aussi un
  // serveur injoignable alors que le Wi-Fi lui-même fonctionne).
  var _serverReachable = true;
  function updateServerSubtitle(){
    var el = document.getElementById('serverSettingsSub');
    if(!el) return;
    if(!serverUrl){ el.innerHTML = 'Non configuré'; return; }
    var online = typeof navigator === 'undefined' || navigator.onLine !== false;
    var reachable = _serverReachable && online;
    var dotColor = reachable ? '#22C55E' : '#DC2626';
    var suffix = reachable ? '' : (online ? ' — serveur injoignable' : ' — hors connexion');
    el.innerHTML = '<i class="ti ti-circle-filled" style="color:'+dotColor+';font-size:.7em;"></i> '+escapeHtml(serverUrl)+suffix;
  }
  // Réagit immédiatement à une coupure/reprise réseau (pas besoin d'attendre
  // le prochain cycle de 15s de doCheckAllSync) — 'online' relance aussi
  // tout de suite une vérification réelle plutôt que de supposer le serveur
  // à nouveau joignable simplement parce que le Wi-Fi est revenu.
  window.addEventListener('offline', function(){ updateServerSubtitle(); _scheduleServerLogoutCheck(); });
  window.addEventListener('online', function(){
    updateServerSubtitle();
    _cancelServerLogoutCheck();
    if(typeof doCheckAllSync === 'function') doCheckAllSync();
  });

  // ── Déconnexion automatique si le serveur reste injoignable (retour
  // utilisateur : "au bout de 3 secondes, déconnexion + message") ──────────
  // Dès qu'une injoignabilité est détectée (offline, ou échec réel du fetch
  // dans doCheckAllSync ci-dessous), programme UNE vérification 3s plus
  // tard — pas une déconnexion immédiate sur la première détection, pour ne
  // pas délog­ger sur un accroc réseau qui se résorbe tout seul en une
  // fraction de seconde (bascule Wi-Fi/4G...). Si le serveur répond de
  // nouveau avant l'échéance, le timer est annulé (voir 'online' et les
  // branches de succès de doCheckAllSync) — sinon, déconnexion via
  // _authForceLogout (js/auth.js), qui affiche déjà un message clair après
  // rechargement.
  var _serverLogoutTimer = null;
  function _scheduleServerLogoutCheck(){
    if(_serverLogoutTimer || !serverUrl) return;
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
    _serverLogoutTimer = setTimeout(async function(){
      _serverLogoutTimer = null;
      if(!serverUrl) return;
      // Revérifie une dernière fois avant de déconnecter — jamais sur la
      // seule foi d'un état resté figé depuis 3s.
      try{
        var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
        delete h['Content-Type'];
        var r = await fetch(serverUrl + '/checkAll', { headers: h });
        if(r.ok){
          _serverReachable = true;
          updateServerSubtitle();
          return;
        }
      }catch(e){}
      _serverReachable = false;
      updateServerSubtitle();
      if(typeof window._authForceLogout === 'function'){
        window._authForceLogout('Serveur injoignable — déconnexion automatique');
      }
    }, 3000);
  }
  function _cancelServerLogoutCheck(){
    if(_serverLogoutTimer){ clearTimeout(_serverLogoutTimer); _serverLogoutTimer = null; }
  }

  function saveServerConfig(){
    localStorage.setItem(SERVER_KEY, serverUrl);
    updateServerSubtitle();
  }

  // ── Polling /check toutes les 30s ─────────────────────────────────
  var _syncInterval = null;
  var _deletionWarnedRefs = {}; // {ref: true} - évite de répéter l'avertissement de suppression à chaque passage de syncDeletions() tant que la fenêtre reste ouverte sur ce produit

  // Sync complète pour détecter les suppressions côté serveur
  async function syncDeletions(){
    if(!serverUrl) return;
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
    try{
      var getHeaders = typeof window.authHeaders === 'function' ? window.authHeaders() : {};
      delete getHeaders['Content-Type'];
      var r = await fetch(serverUrl+'/pullDatas', { headers: getHeaders });
      if(!r.ok) return;
      var data = await r.json();
      var serverItems = data && Array.isArray(data.items)
        ? data.items.map(function(i){ return i.data; })
        : (Array.isArray(data) ? data : []);
      if(!serverItems.length) return;

      // Construire un Set des refs serveur
      var serverRefs = new Set(serverItems.map(function(p){ return p && p.ref; }).filter(Boolean));

      // Protéger le produit EN COURS D'ÉDITION (fenêtre "Modifier le
      // produit" ouverte) d'une suppression détectée ici — sans ça, un
      // produit supprimé côté serveur par quelqu'un d'autre pendant qu'on le
      // modifie disparaissait silencieusement de products[] sous les pieds
      // de l'utilisateur, en pleine saisie, sans aucun avertissement (retour
      // utilisateur : "j'ai plus de contrôle si il y a eu une suppression de
      // produit sur le serveur"). On le garde tant que la fenêtre reste
      // ouverte, et on prévient clairement — popup bloquante plutôt qu'un
      // toast, l'utilisateur pouvant très bien être absent au moment où
      // cette synchro tourne en arrière-plan (comme la fermeture automatique
      // pour inactivité, voir js/modal.js).
      var editingProduct = (typeof editingId !== 'undefined' && editingId)
        ? products.find(function(p){ return p.id === editingId; })
        : null;
      var editingRef = editingProduct ? editingProduct.ref : null;

      // Supprimer localement les produits absents du serveur
      var before = products.length;
      products = products.filter(function(p){
        if(p.ref && editingRef && p.ref === editingRef) return true; // jamais retiré pendant l'édition
        return !p.ref || serverRefs.has(p.ref);
      });
      var deleted = before - products.length;

      if(editingRef && !serverRefs.has(editingRef) && !_deletionWarnedRefs[editingRef]){
        _deletionWarnedRefs[editingRef] = true;
        if(typeof customAlert === 'function'){
          customAlert(
            'Produit supprimé côté serveur',
            'Ce produit a été supprimé par quelqu\'un d\'autre pendant que vous le modifiiez. Vos modifications restent locales tant que cette fenêtre reste ouverte — les enregistrer le recréera sur le serveur.'
          );
        }
      }

      if(deleted > 0){
        // [] : cette fonction ne fait QUE retirer localement des produits
        // déjà absents du serveur — rien à repousser (le serveur sait déjà
        // qu'ils n'existent plus, c'est justement pour ça qu'ils sont
        // filtrés ici). save() sans filtre repoussait tout le catalogue
        // local restant, avec createdAt forcé à maintenant sur chacun —
        // même risque que le bug corrigé dans syncFromServer/pushToServer,
        // mais ici déclenché automatiquement en arrière-plan dès qu'UNE
        // suppression est détectée, sur un compte au catalogue local resté
        // en retard (retour utilisateur : "un compte avec des perme[ssions]
        // pour ajouter un produit se connecte avec un vieux catalogue, ça
        // envoie sur le serveur").
        save(true, []);
        var homePage = document.getElementById('homePage');
        var isOnHome = homePage && !homePage.classList.contains('hidden');
        if(isOnHome){ renderHome(); } else { render(); }
      }
    }catch(e){ console.warn('syncDeletions:', e.message); }
  }

  async function doSyncCheck(){
    if(!serverUrl) return;
    if(typeof authIsLoggedIn === 'function' && !authIsLoggedIn()) return;
    try{
      var lastSync = localStorage.getItem(SERVER_LAST_SYNC_KEY) || '0';
      var checkUrl = serverUrl+'/check' + (lastSync !== '0' ? '?timestamp='+lastSync : '');
      var chkH = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete chkH['Content-Type'];
      var r = await fetch(checkUrl, { headers: chkH });
      if(!r.ok) return;
      var data = await r.json();
      if(data.count > 0){
        // Il y a des nouveautés → sync différentielle par ref
        await syncFromServer(false);
      }
    }catch(e){ /* silencieux */ }
  }

  // Vérifie en UNE requête l'état (révision/nombre/date) de chaque collection
  // côté serveur (catalogue, blocs, configurations) et ne relance que les
  // requêtes de rafraîchissement dont la collection a réellement changé
  // depuis le dernier check connu (comparaison locale, pas de refetch aveugle).
  async function doCheckAllSync(){
    if(!serverUrl) return;
    // La vérification de JOIGNABILITÉ (ce qui pilote le point rouge/vert de
    // updateServerSubtitle) tourne maintenant TOUJOURS, connecté ou pas — un
    // serveur injoignable l'est pour tout le monde. Seul le TRAITEMENT des
    // données (sync catalogue/configs/demandes plus bas) reste réservé aux
    // comptes connectés, via ce drapeau local plutôt qu'un retour anticipé
    // en tout début de fonction (retour utilisateur : "le statut du serveur
    // ne passe pas en rouge lorsque le serveur n'est plus joignable" — la
    // fonction entière, et startSyncPolling() qui la relance toutes les
    // 15s, étaient avant sautées sans session active).
    var loggedIn = typeof authIsLoggedIn === 'function' ? authIsLoggedIn() : true;
    try{
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      var r = await fetch(serverUrl + '/checkAll', { headers: h });
      if(!r.ok){
        // Ancien serveur sans /checkAll (404) : pas une panne, repli normal
        // sur l'ancien /check — ne pas marquer "injoignable" pour ça (mais
        // /check nécessite une session, inutile de l'appeler sans elle).
        if(r.status === 404) return loggedIn ? doSyncCheck() : undefined;
        // Sans session, un 401/403 signifie juste "pas autorisé", pas
        // "serveur éteint" — le serveur a bel et bien répondu. Sans ce cas
        // particulier, un compte déconnecté verrait le point rester rouge
        // en permanence dès que /checkAll exige une authentification, même
        // avec un serveur parfaitement joignable.
        if(!loggedIn && (r.status === 401 || r.status === 403)){
          _serverReachable = true;
          updateServerSubtitle();
          _cancelServerLogoutCheck();
          return;
        }
        _serverReachable = false;
        updateServerSubtitle();
        _scheduleServerLogoutCheck();
        return;
      }
      _serverReachable = true;
      updateServerSubtitle();
      _cancelServerLogoutCheck();
      if(!loggedIn) return; // rien à synchroniser sans session
      var data = await r.json();
      var prev = {};
      try{ prev = JSON.parse(localStorage.getItem(CHECKALL_KEY) || '{}'); }catch(e){}

      function hasChanged(key){
        var now = data[key], before = prev[key];
        if(!now) return false;
        if(!before) return true; // pas de référence locale → on rattrape par sécurité
        return now.revision !== before.revision || now.count !== before.count || now.changedAt !== before.changedAt;
      }

      var jobs = [];
      if(hasChanged('catalogue')){
        // syncFromServer fait un pull DIFFÉRENTIEL ("/pullDatas?date=...") :
        // par nature, il ne peut jamais voir une suppression (un produit
        // supprimé disparaît juste des résultats, aucun marqueur renvoyé).
        // syncDeletions() fait le pull complet nécessaire pour ça. Avant,
        // elle ne tournait que toutes les 5 min — un produit supprimé par
        // un collègue pouvait donc rester visible jusqu'à 5 min, alors que
        // les ajouts/modifs sont maintenant détectés en ~15s. On la lance
        // ici aussi pour que suppressions et ajouts soient au même rythme.
        jobs.push(syncFromServer(false));
        jobs.push(syncDeletions());
      }
      if(hasChanged('configBlocks') && typeof _armoireFetchBlocks === 'function') jobs.push(_armoireFetchBlocks());
      if(hasChanged('savedConfigs') && typeof _armoireFetchSavedConfigs === 'function') jobs.push(_armoireFetchSavedConfigs());
      // catalogueRequests/bugs : avant, js/requests.js faisait tourner son
      // propre poll indépendant (/checkReq+/checkBugs) toutes les 30s, sans
      // aucun rapport avec ce cycle-ci — deux détections de changement en
      // parallèle pour la même info (retour utilisateur : consolider sur
      // /checkAll). reqUpdateBadge() reste la source des VRAIS chiffres
      // (/checkReq+/checkBugs, déjà vérifiés contre le Swagger réel), on ne
      // fait que réutiliser CE signal-ci pour décider QUAND la relancer —
      // se neutralise déjà seule si personne n'est admin/connecté.
      if((hasChanged('catalogueRequests') || hasChanged('bugs')) && typeof window._reqUpdateBadge === 'function'){
        jobs.push(window._reqUpdateBadge());
      }
      if(jobs.length) await Promise.allSettled(jobs);

      localStorage.setItem(CHECKALL_KEY, JSON.stringify(data));
    }catch(e){
      // Échec réseau (pas juste un HTTP non-ok) — serveur injoignable.
      _serverReachable = false;
      updateServerSubtitle();
      _scheduleServerLogoutCheck();
    }
  }

  function startSyncPolling(){
    stopSyncPolling();
    if(!serverUrl) return;
    // Tourne aussi sans session — doCheckAllSync() gère lui-même ce qui est
    // sauté sans connexion (voir plus haut), mais la vérification de
    // joignabilité (point rouge/vert) doit continuer à tourner toutes les
    // 15s pour tout le monde.
    _syncInterval = setInterval(doCheckAllSync, 15000);
  }

  function stopSyncPolling(){
    if(_syncInterval){ clearInterval(_syncInterval); _syncInterval = null; }
  }

  // Revérifier immédiatement au retour au premier plan — sur mobile,
  // l'onglet mis en arrière-plan (écran verrouillé, appli changée) voit son
  // setInterval fortement ralenti/suspendu par le navigateur, bien plus
  // qu'au bureau où l'onglet reste généralement actif. Le point de statut
  // du serveur (updateServerSubtitle, alimenté par doCheckAllSync) restait
  // donc figé sur son dernier état jusqu'au prochain tic — qui pouvait
  // tarder longtemps, voire jamais vraiment reprendre normalement tant que
  // l'appli restait en arrière-plan (retour utilisateur : "le statut du
  // serveur ne s'actualise pas sur mobile"). Même principe déjà utilisé
  // pour authRefreshMe() (js/auth.js) et la vérification de mise à jour du
  // Service Worker (js/pwa.js).
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && _syncInterval) doCheckAllSync();
  });

  // ── Sync vers serveur ─────────────────────────────────────────────
  // Renvoie true/false selon le succès réel de l'envoi — auparavant la
  // fonction avalait silencieusement toute erreur (token expiré, rejet
  // serveur, coupure réseau...), donnant l'illusion que tout avait bien
  // été synchronisé alors que rien n'était arrivé côté serveur.
  async function pushToServer(changedProducts){
    if(!serverUrl) return true;
    // Un tableau explicitement VIDE veut dire "rien à repousser" — à ne pas
    // confondre avec `undefined` (repli volontaire sur tout le catalogue,
    // réservé aux flux bulk qui ne renseignent pas ce paramètre). Sans cette
    // distinction, passer [] retombait sur ce même repli "tout le
    // catalogue" — dangereux dès qu'un appel légitime n'a justement RIEN à
    // envoyer : dans syncFromServer(), recevoir un produit inconnu en local
    // (compte resté longtemps sans synchroniser) déclenchait ce repli, donc
    // un envoi de la TOTALITÉ du catalogue local — avec createdAt forcé à
    // "maintenant" sur chaque élément juste en dessous, ce qui écrasait
    // silencieusement, sur le serveur, les modifications récentes d'autrui
    // par les anciennes valeurs de ce vieux catalogue local (retour
    // utilisateur : "un compte avec des perme[ssions] pour ajouter un
    // produit se connecte avec un vieux catalogue, ça envoie [tout] sur le
    // serveur").
    if(Array.isArray(changedProducts) && changedProducts.length === 0) return true;
    try{
      // `changedProducts` : sous-ensemble réellement modifié (voir save() dans
      // storage.js) — n'envoyer que ça au lieu de tout le catalogue à chaque
      // sauvegarde. Repli sur la totalité si non fourni (flux bulk existants).
      var base = Array.isArray(changedProducts) && changedProducts.length
        ? changedProducts
        : products;
      var now = Date.now();
      // Pour forcer l'upsert des modifications, on envoie avec createdAt = now
      // Le serveur accepte le plus récent (createdAt) par ref
      var toSend = base.map(function(p){
        return Object.assign({}, p, { createdAt: now });
      });
      var r = await fetch(serverUrl+'/pushDatas', {
        method:'POST',
        headers: typeof window.authHeaders === 'function'
          ? window.authHeaders()
          : {'Content-Type':'application/json'},
        body: JSON.stringify(toSend)
      });
      if(!r.ok){
        console.warn('pushToServer: HTTP', r.status);
        return false;
      }
      return true;
    }catch(e){
      console.warn('pushToServer:', e.message);
      return false;
    }
  }
  // Exposer globalement pour storage.js
  window.pushToServer = pushToServer;

  // ── Verrou "en cours d'édition" ─────────────────────────────────────
  // Empêche deux utilisateurs de modifier le même produit en même temps
  // (retour utilisateur). Bricolage volontaire sur l'API produit EXISTANTE
  // (/pushDatas) plutôt qu'une vraie API de verrou dédiée côté serveur (qui
  // n'existe pas) : le verrou est juste deux champs ordinaires du produit,
  // _editingBy/_editingAt, pas un mécanisme atomique — voir withoutServerFields
  // ci-dessus, qui les exclut du calcul de conflit (poser/retirer ce verrou
  // n'est jamais un vrai conflit éditorial). Limite connue et acceptée : deux
  // utilisateurs cliquant "Modifier" à quelques centaines de ms d'intervalle
  // pourraient théoriquement passer tous les deux (fenêtre de course de
  // l'ordre d'un aller-retour réseau) — seule une vraie API de verrou
  // atomique côté serveur éliminerait ça complètement.
  // 10 min : au-delà, verrou considéré abandonné (onglet fermé/planté sans
  // libérer) côté client plutôt qu'un blocage définitif. AUCUNE purge
  // n'existe côté serveur — tout le cycle de vie du verrou (pose, lecture,
  // expiration, nettoyage) est géré côté client. Un verrou expiré n'est
  // donc jamais bloquant (voir _checkProductEditLockBlocks plus bas), mais
  // sans nettoyage actif ses champs resteraient sur le produit indéfiniment
  // tant que personne ne retente une édition dessus (qui les écraserait) —
  // _fetchAllLockedProducts s'en charge activement à chaque appel : tout
  // verrou expiré parmi les fiches reçues est nettoyé au passage plutôt que
  // simplement listé comme verrouillé.
  var EDIT_LOCK_TTL_MS = 10 * 60 * 1000;

  function _editLockCurrentUser(){
    var u = typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null;
    return u ? (u.username || u.name || null) : null;
  }

  // Identifiant unique par ONGLET (pas par compte) — sessionStorage : régénéré
  // à chaque nouvel onglet/fenêtre, conservé tant que cet onglet reste ouvert
  // (survit à un F5 dans ce même onglet). Nécessaire car le verrou comparait
  // jusqu'ici uniquement le NOM D'UTILISATEUR (_editingBy !== me) — deux
  // sessions connectées sous le MÊME compte (deux onglets, deux appareils, un
  // compte partagé par plusieurs personnes) se voyaient donc comme "moi-même"
  // l'une l'autre, et pouvaient éditer le même produit en parallèle sans
  // jamais être bloquées (retour utilisateur : "comment on fait quand c'est
  // deux sessions identiques ?"). Comparer l'ID de session plutôt que le nom
  // distingue bien deux onglets même identiquement connectés.
  // Math.random() n'est pas un générateur cryptographiquement sûr (issue
  // CodeQL "Insecure randomness") — prévisible en théorie, ce qui permettrait
  // à quelqu'un de deviner/forger un ID de session ou de produit. Remplacé
  // partout dans ce fichier (verrou d'édition + ID produit) par
  // crypto.getRandomValues(), la source d'aléa fournie par le navigateur
  // lui-même pour cet usage. Alphabet base36 (0-9a-z) comme avant, juste la
  // source d'aléa change — aucun format d'ID existant n'est cassé.
  function _secureRandomBase36(len){
    var out = '';
    while(out.length < len){
      var buf = new Uint8Array(1);
      window.crypto.getRandomValues(buf);
      out += (buf[0] % 36).toString(36);
    }
    return out.slice(0, len);
  }

  function _editLockSessionId(){
    try {
      var id = sessionStorage.getItem('cat_edit_lock_session');
      if(!id){
        id = 'sess_' + Date.now() + '_' + _secureRandomBase36(8);
        sessionStorage.setItem('cat_edit_lock_session', id);
      }
      return id;
    } catch(e){
      // sessionStorage indisponible (navigation privée stricte, etc.) —
      // repli sur un ID généré une fois en mémoire pour la durée de la page.
      if(!window._editLockSessionIdFallback){
        window._editLockSessionIdFallback = 'sess_' + Date.now() + '_' + _secureRandomBase36(8);
      }
      return window._editLockSessionIdFallback;
    }
  }

  // Lit l'état du verrou DIRECTEMENT depuis /pullDatas, sans passer par
  // syncFromServer()/le mécanisme habituel de fusion : pour un compte admin,
  // ce mécanisme ne réécrit JAMAIS products[idx] avec le contenu serveur
  // pour une ref déjà connue localement tant qu'aucun conflit n'est résolu
  // via la modale dédiée ("Local conservé par défaut pour l'admin", voir
  // plus haut) — un verrou posé par un AUTRE admin ne serait donc jamais vu
  // par ce biais. Lecture brute, en parallèle, sans toucher à products[].
  // Renvoie {fetched:true, state} en cas de succès (state=null si la ref est
  // introuvable côté serveur — cas normal), ou {fetched:false, state:null}
  // si le serveur n'a pas pu être joint — DISTINCT de "pas de verrou" : voir
  // _tryLockProductForEdit, qui bloque l'édition dans ce second cas (retour
  // utilisateur : l'édition hors-ligne ne devrait pas être possible tant
  // qu'un serveur est configuré, impossible sinon de savoir si quelqu'un
  // d'autre édite déjà ce produit).
  async function _fetchServerLockState(p){
    if(!serverUrl || !p) return { fetched:true, state:null };
    try {
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      // ?ref= : filtrer sur CE produit plutôt qu'un /pullDatas sans
      // paramètre (dump complet du catalogue) — confirmé fonctionnel côté
      // serveur réel (retour utilisateur, capture Swagger à l'appui), et
      // bien plus fiable/rapide qu'un dump complet à chaque clic sur
      // "Modifier" pour un catalogue de plusieurs centaines de produits.
      var url = serverUrl + '/pullDatas' + (p.ref ? '?ref=' + encodeURIComponent(p.ref) : '');
      var r = await fetch(url, { headers: h, cache: 'no-store' });
      if(!r.ok) return { fetched:false, state:null };
      var data = await r.json();
      var items = (data && Array.isArray(data.items)) ? data.items.map(function(it){ return it.data; }) : (Array.isArray(data) ? data : []);
      var found = items.find(function(it){ return it && (it.id === p.id || (p.ref && it.ref === p.ref)); }) || null;
      return { fetched:true, state: found };
    } catch(e){ return { fetched:false, state:null }; }
  }

  // Vérification partagée par _tryLockProductForEdit (avant d'ouvrir
  // "Modifier") ET deleteProduct (avant "Supprimer", voir js/render.js) — un
  // produit en cours d'édition par quelqu'un d'autre ne devrait pas non plus
  // pouvoir être supprimé sous ses pieds (retour utilisateur). Retourne
  // {blocked:false} si l'action peut continuer, {blocked:true, message,
  // lockedBy?} sinon (lockedBy seulement si le blocage vient d'un verrou
  // actif — pas d'une simple impossibilité de vérifier).
  async function _checkProductEditLockBlocks(p, actionVerb){
    actionVerb = actionVerb || 'modifier';
    if(!serverUrl || !p) return { blocked:false }; // pas de serveur configuré du tout = usage solo, rien à coordonner
    var me = _editLockCurrentUser();
    // Hors-ligne : impossible de vérifier si quelqu'un d'autre édite déjà ce
    // produit — bloquer plutôt que risquer un conflit découvert bien plus
    // tard à la resynchronisation (retour utilisateur). navigator.onLine
    // donne une réponse instantanée dans le cas évident (pas de réseau du
    // tout) ; le fetch ci-dessous reste la vérification faisant foi (attrape
    // aussi les cas où onLine ment : portail captif, serveur down, etc.).
    if(typeof navigator !== 'undefined' && navigator.onLine === false){
      return { blocked:true, message: 'Vous semblez hors connexion — impossible de vérifier si ce produit est déjà en cours de modification. Reconnectez-vous avant de le ' + actionVerb + '.' };
    }
    var check = await _fetchServerLockState(p);
    if(!check.fetched){
      return { blocked:true, message: 'Impossible de joindre le serveur pour vérifier ce produit — vérifiez votre connexion avant de le ' + actionVerb + '.' };
    }
    var serverState = check.state;
    var mySessionId = _editLockSessionId();
    // Verrou posé par CET onglet précis (même ID de session) → jamais
    // bloquant, qu'importe le nom d'utilisateur (ex. re-cliquer "Modifier"
    // sur un produit déjà ouvert dans ce même onglet). Absence de
    // _editingSessionId (verrou posé par une version plus ancienne de
    // l'app, avant ce correctif) : repli sur la comparaison par nom
    // d'utilisateur d'avant, pour ne pas bloquer à tort pendant la
    // transition.
    var isMySession = serverState && serverState._editingSessionId
      ? serverState._editingSessionId === mySessionId
      : (serverState && serverState._editingBy === me);
    if(serverState && serverState._editingBy && !isMySession && serverState._editingAt && (Date.now() - serverState._editingAt) < EDIT_LOCK_TTL_MS){
      // lockedBy exposé à part (en plus de "message", déjà composé pour un
      // affichage texte brut) pour que l'appelant puisse construire une
      // popup HTML en échappant lui-même ce nom (voir vmEditBtn/deleteProduct
      // dans js/render.js) — un nom d'utilisateur reste une donnée
      // dynamique, jamais insérée telle quelle dans du HTML.
      // Même compte mais autre session (deux onglets/appareils connectés
      // sous le même identifiant) : message dédié plutôt que d'afficher à
      // l'utilisateur son propre nom, ce qui prêterait à confusion.
      var sameAccountOtherSession = serverState._editingBy === me;
      return {
        blocked:true,
        lockedBy: serverState._editingBy,
        message: sameAccountOtherSession
          ? 'Vous êtes déjà en train de modifier ce produit depuis un autre onglet ou un autre appareil — terminez ou fermez cette autre session avant de continuer ici.'
          : serverState._editingBy + ' est en cours de modification de ce produit — réessayez dans quelques instants.'
      };
    }
    return { blocked:false };
  }
  window._checkProductEditLockBlocks = _checkProductEditLockBlocks;

  // Appelé au clic sur "Modifier" (voir vmEditBtn dans js/render.js), AVANT
  // d'ouvrir le formulaire. Retourne {ok:true} si l'édition peut commencer,
  // {ok:false, message, lockedBy?} sinon.
  async function _tryLockProductForEdit(p){
    if(!serverUrl || !p) return { ok:true };
    var check = await _checkProductEditLockBlocks(p, 'modifier');
    if(check.blocked) return { ok:false, message: check.message, lockedBy: check.lockedBy };
    // Poser le verrou : push immédiat sur la base du contenu LOCAL (celui
    // affiché/édité par CET utilisateur — cohérent avec "Local conservé par
    // défaut pour l'admin" ci-dessus, on ne veut pas écraser silencieusement
    // un contenu local avec une copie serveur potentiellement plus ancienne
    // juste pour poser un verrou), en y ajoutant _editingBy/_editingAt (nom
    // affiché) et _editingSessionId (identité réelle du verrou — voir
    // _checkProductEditLockBlocks : distingue deux onglets/appareils même
    // connectés sous le même compte).
    var me = _editLockCurrentUser();
    var idx = products.findIndex(function(x){ return x.id === p.id; });
    var toLock = Object.assign({}, p, { _editingBy: me || 'Utilisateur', _editingAt: Date.now(), _editingSessionId: _editLockSessionId() });
    if(idx !== -1) products[idx] = toLock;
    await pushToServer([toLock]);
    return { ok:true };
  }
  window._tryLockProductForEdit = _tryLockProductForEdit;

  // Libère le verrou posé ci-dessus — appelé à la fermeture du formulaire
  // (voir closeModal dans js/modal.js), qu'il s'agisse d'un Enregistrer
  // (déjà nettoyé explicitement dans btnSave, ceci est alors sans effet) ou
  // d'un Annuler/fermeture directe (seul cas où c'est réellement utile,
  // sinon le verrou resterait posé jusqu'à expiration du TTL ci-dessus). Ne
  // libère JAMAIS un verrou posé par quelqu'un d'autre (vérifie _editingBy
  // === moi) — sans cette garde, appeler cette fonction depuis un contexte
  // qui n'a jamais posé le verrou (ex. mode "Proposer une modification" sur
  // le même produit) pourrait effacer à tort le verrou d'un tiers.
  async function _releaseProductEditLock(id){
    if(!serverUrl || !id) return;
    var idx = products.findIndex(function(x){ return x.id === id; });
    if(idx === -1) return;
    var p = products[idx];
    var me = _editLockCurrentUser();
    // Comparaison par ID de session (pas juste le nom) : sans ça, un second
    // onglet connecté sous le MÊME compte pouvait libérer par erreur le
    // verrou posé par un premier onglet toujours en train d'éditer (les deux
    // se ressemblaient comme "moi-même" par nom d'utilisateur seul). Repli
    // sur le nom si le produit local n'a pas encore ce champ (verrou posé
    // avant ce correctif).
    var isMySession = p._editingSessionId
      ? p._editingSessionId === _editLockSessionId()
      : (p._editingBy === me);
    if(!p._editingBy || !isMySession) return;
    delete p._editingBy;
    delete p._editingAt;
    delete p._editingSessionId;
    await pushToServer([p]);
  }
  window._releaseProductEditLock = _releaseProductEditLock;

  // Rafraîchit _editingAt sur le verrou déjà posé par CETTE session —
  // appelé périodiquement par le "heartbeat" (voir js/modal.js,
  // _startEditLockHeartbeat) tant que l'utilisateur interagit réellement
  // avec le formulaire "Modifier le produit" (retour utilisateur : sans ça,
  // éditer une fiche plus de 10 min d'affilée laisserait quelqu'un d'autre
  // commencer à éditer la même fiche en même temps — voir EDIT_LOCK_TTL_MS
  // plus haut et le nettoyage actif des verrous périmés dans
  // syncFromServer). Le heartbeat lui-même ne rafraîchit que sur activité
  // récente (frappe/clic dans le formulaire) — un onglet resté ouvert sans
  // personne devant doit continuer à laisser le verrou expirer normalement,
  // ce nettoyage-ci ne change rien à cette logique. Même garde que
  // _releaseProductEditLock : ne touche jamais un verrou qui n'est pas le
  // nôtre.
  async function _refreshProductEditLock(id){
    if(!serverUrl || !id) return;
    var idx = products.findIndex(function(x){ return x.id === id; });
    if(idx === -1) return;
    var p = products[idx];
    var me = _editLockCurrentUser();
    var isMySession = p._editingSessionId
      ? p._editingSessionId === _editLockSessionId()
      : (p._editingBy === me);
    if(!p._editingBy || !isMySession) return;
    p._editingAt = Date.now();
    await pushToServer([p]);
  }
  window._refreshProductEditLock = _refreshProductEditLock;

  // ── Déverrouillage manuel (admin) ────────────────────────────────────
  // Contrepartie de _releaseProductEditLock ci-dessus, mais SANS la
  // vérification "isMySession" : tout l'intérêt est justement de lever le
  // verrou de QUELQU'UN D'AUTRE, posé par une session qui a planté/fermé
  // son onglet sans jamais relâcher — sinon il faut attendre l'expiration
  // du TTL (10 min, EDIT_LOCK_TTL_MS ci-dessus) sans recours (retour
  // utilisateur). Lecture directe via /pullDatas (comme
  // _fetchServerLockState), jamais via syncFromServer()/le merge habituel,
  // pour ne déclencher aucune UI de résolution de conflit ici — cette page
  // ne fait que lister/déverrouiller, jamais fusionner de contenu produit.
  async function _fetchAllLockedProducts(){
    if(!serverUrl) return { fetched:false, locked:[] };
    try{
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      var r = await fetch(serverUrl + '/pullDatas', { headers: h, cache: 'no-store' });
      if(!r.ok) return { fetched:false, locked:[] };
      var data = await r.json();
      var items = (data && Array.isArray(data.items)) ? data.items.map(function(it){ return it.data; }) : (Array.isArray(data) ? data : []);
      var allLocked = items.filter(function(p){ return p && p._editingBy; });

      // Pas de purge serveur (voir EDIT_LOCK_TTL_MS ci-dessus) : nettoyer
      // ici, activement, tout verrou trouvé au-delà du TTL parmi les fiches
      // fraîchement reçues plutôt que de simplement le lister comme
      // "verrouillé" — sinon un verrou abandonné (crash/fermeture d'onglet)
      // reste affiché indéfiniment tant que personne ne le déverrouille à la
      // main ou ne retente une édition sur ce produit précis.
      var now = Date.now();
      var fresh = [];
      var cleanups = [];
      allLocked.forEach(function(p){
        var age = typeof p._editingAt === 'number' ? (now - p._editingAt) : null;
        if(age !== null && age >= EDIT_LOCK_TTL_MS){
          cleanups.push(_adminForceUnlockProduct(p));
        } else {
          fresh.push(p);
        }
      });
      if(cleanups.length) await Promise.all(cleanups);

      return { fetched:true, locked: fresh };
    }catch(e){ return { fetched:false, locked:[] }; }
  }
  window._fetchAllLockedProducts = _fetchAllLockedProducts;

  // Force le retrait du verrou d'un produit, quelle que soit la session qui
  // l'a posé — action explicite déclenchée par un admin depuis Paramètres →
  // Fiches verrouillées, avec confirmation dans l'UI avant l'appel (voir
  // renderSettingsLockedPage). p vient du dump serveur brut (pas forcément
  // dans products[] localement) — met aussi à jour products[] par cohérence
  // si l'entrée y existe déjà.
  async function _adminForceUnlockProduct(p){
    if(!serverUrl || !p) return false;
    var clean = Object.assign({}, p);
    delete clean._editingBy;
    delete clean._editingAt;
    delete clean._editingSessionId;
    var ok = await pushToServer([clean]);
    if(ok){
      var idx = products.findIndex(function(x){ return x.id === p.id || (p.ref && x.ref === p.ref); });
      if(idx !== -1){
        delete products[idx]._editingBy;
        delete products[idx]._editingAt;
        delete products[idx]._editingSessionId;
      }
    }
    return ok;
  }
  window._adminForceUnlockProduct = _adminForceUnlockProduct;

  // ── Vérifie qu'un changement d'icône de famille a bien été persisté par le
  // serveur — un fetch qui répond 200 ne garantit pas que le serveur a
  // effectivement conservé le champ familyIcon (il peut l'ignorer/le
  // rejeter silencieusement). On relit les données pour s'en assurer et on
  // alerte clairement si l'icône affichée par le serveur ne correspond pas.
  async function verifyFamilyIconOnServer(family, expectedIcon, refs){
    if(!serverUrl || !refs || !refs.length) return;
    try{
      // Laisser le temps au push (déclenché par save()) d'arriver au serveur
      await new Promise(function(r){ setTimeout(r, 1500); });
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      var r = await fetch(serverUrl+'/pullDatas', { headers: h });
      if(!r.ok) return;
      var data = await r.json();
      var serverItems = data && Array.isArray(data.items)
        ? data.items.map(function(i){ return i.data; })
        : (Array.isArray(data) ? data : []);
      var mismatched = refs.filter(function(ref){
        var sp = serverItems.find(function(x){ return x && x.ref === ref; });
        return sp && sp.familyIcon !== expectedIcon;
      });
      if(mismatched.length){
        showToast('Le serveur n\'a pas confirmé la nouvelle icône de "'+family+'" (vérifiez la configuration serveur)', 'warn', 6000);
        console.warn('verifyFamilyIconOnServer: mismatch pour', mismatched);
      }
    }catch(e){ console.warn('verifyFamilyIconOnServer:', e.message); }
  }

  // ── Pull différentiel : récupère les nouveautés serveur et fusionne par ref ──
  async function syncFromServer(silent){
    if(!serverUrl) return;
    try{
      var lastSync = localStorage.getItem(SERVER_LAST_SYNC_KEY) || '0';
      var pullUrl  = serverUrl+'/pullDatas' + (lastSync !== '0' ? '?date='+lastSync : '');
      var fetchOpts = { headers: typeof window.authHeaders === 'function' ? window.authHeaders() : {} };
      // Supprimer Content-Type pour les GET
      delete fetchOpts.headers['Content-Type'];
      var r = await fetch(pullUrl, fetchOpts);
      if(!r.ok) throw new Error('HTTP '+r.status);
      var data = await r.json();

      var serverItems = [];
      if(data && Array.isArray(data.items)){
        serverItems = data.items.map(function(item){ return item.data; });
      } else if(Array.isArray(data)){
        serverItems = data;
      }

      // Mettre à jour lastSync
      localStorage.setItem(SERVER_LAST_SYNC_KEY, Date.now().toString());
      if(serverItems.length === 0) return;

      // Index local par ref — Map et pas objet nu : une référence produit qui
      // s'appelle « __proto__ », « constructor » ou « toString » interroge
      // sinon la chaîne de prototypes d'Object au lieu de l'index, et le
      // produit part dans la mauvaise branche (conflit au lieu d'ajout, ou
      // l'inverse). Une Map n'a aucune clé héritée. Même correction sur les
      // deux autres index de ce fichier (import JSON, résolution de conflits).
      var localMap = new Map();
      products.forEach(function(p, i){ if(p.ref) localMap.set(p.ref, i); });

      var added = 0;
      var updatedExisting = 0; // refs déjà connues écrasées par la version serveur (voir plus bas)
      var sugMergedProducts = []; // produits dont seules les suggestions ont changé (fusion)
      var staleLockCleanups = []; // verrous "en cours d'édition" expirés à nettoyer côté serveur (voir plus bas)
      serverItems.forEach(function(sp){
        if(!sp || !sp.ref) return;

        // Nettoyage actif d'un verrou "en cours d'édition" expiré — aucune
        // purge n'existe côté serveur (voir EDIT_LOCK_TTL_MS plus haut), tout
        // le cycle de vie du verrou est géré côté client. Fait ici, dans le
        // flux de synchro normal (doCheckAllSync/syncFromServer, déclenché
        // pour TOUS les utilisateurs à la connexion puis toutes les 15s), et
        // pas seulement quand un admin ouvre "Fiches verrouillées" : dès
        // qu'une fiche avec un verrou périmé (> EDIT_LOCK_TTL_MS) est reçue
        // ici, on retire les champs tout de suite, avant toute fusion —
        // sinon la fiche resterait affichée comme verrouillée indéfiniment
        // tant que personne ne la déverrouille à la main ou ne retente une
        // édition dessus.
        if(sp._editingBy && typeof sp._editingAt === 'number' && (Date.now() - sp._editingAt) >= EDIT_LOCK_TTL_MS){
          delete sp._editingBy;
          delete sp._editingAt;
          delete sp._editingSessionId;
          staleLockCleanups.push(sp);
        }

        var idx = localMap.get(sp.ref);
        if(idx === undefined){
          // Ref inconnue → nouveau produit serveur
          localMap.set(sp.ref, products.length);
          products.push(sp);
          added++;
        } else {
          // Ref connue — le serveur gagne TOUJOURS désormais (retour
          // utilisateur : suppression de la fenêtre "conflits de
          // synchronisation", plus aucun choix demandé). Avant, seul un
          // compte admin gardait sa version locale et déclenchait cette
          // fenêtre en cas de différence ; comportement maintenant identique
          // pour tous les comptes — l'ancienne branche "non-admin" (serveur
          // prioritaire, écrasement silencieux) s'applique désormais à tous.
          var lp = products[idx];
          products[idx] = sp;
          updatedExisting++;

          // Fusion des liens réciproques (suggestions/pièces de rechange) :
          // union local+serveur, jamais un simple écrasement — un lien tout
          // juste ajouté localement (par l'édition d'un AUTRE produit, voir
          // _linkReciprocal dans le flux d'enregistrement) peut ne pas
          // encore être remonté sur le serveur au moment de cette synchro ;
          // sans cette fusion, l'écrasement ci-dessus le ferait disparaître
          // silencieusement. Comportement conservé tel quel, indépendant de
          // la suppression des conflits ci-dessus.
          var sugChanged = false;
          function _mergeLinkField(field, hiddenField){
            var merged = Array.prototype.concat.apply([],
              [Array.isArray(lp[field]) ? lp[field] : [], Array.isArray(sp[field]) ? sp[field] : []]
            ).filter(function(r, i, arr){ return r && arr.indexOf(r) === i; });
            var mergedHidden = Array.prototype.concat.apply([],
              [Array.isArray(lp[hiddenField]) ? lp[hiddenField] : [], Array.isArray(sp[hiddenField]) ? sp[hiddenField] : []]
            ).filter(function(r, i, arr){ return r && arr.indexOf(r) === i && merged.indexOf(r) !== -1; });
            if(merged.length && merged.length !== (Array.isArray(sp[field])?sp[field].length:0)){
              products[idx][field] = merged; sugChanged = true;
            }
            if(mergedHidden.length && mergedHidden.length !== (Array.isArray(sp[hiddenField])?sp[hiddenField].length:0)){
              products[idx][hiddenField] = mergedHidden; sugChanged = true;
            }
          }
          _mergeLinkField('suggestions', 'suggestionsHidden');
          _mergeLinkField('spareParts', 'sparePartsHidden');
          if(sugChanged){
            products[idx].updatedAt = Date.now();
            sugMergedProducts.push(products[idx]);
          }
        }
      });

      if(added > 0 || updatedExisting > 0 || sugMergedProducts.length > 0){
        // sugMergedProducts seul (sans nouveau produit) doit quand même être
        // persisté et repoussé au serveur — sinon la fusion des suggestions
        // reste en mémoire jusqu'au prochain rechargement de page, sans
        // jamais être sauvegardée (retour utilisateur : creusé en répondant
        // à "j'ai encore trop de problèmes de conflit").
        // Toujours borner à sugMergedProducts (jamais undefined) : les
        // produits "added"/"updatedExisting" viennent d'être reçus TELS
        // QUELS du serveur — les repousser serait un aller-retour inutile,
        // et surtout, undefined fait basculer pushToServer() sur la
        // TOTALITÉ du catalogue local (voir le commentaire détaillé dans
        // pushToServer, storage.js/actions.js — retour utilisateur : vieux
        // catalogue local repoussé en entier et écrasant des modifs
        // récentes d'autrui). sugMergedProducts reste [] si rien à
        // fusionner : pushToServer() traite désormais un tableau vide comme
        // "rien à envoyer", pas comme un repli bulk. save() reste
        // nécessaire même pour updatedExisting seul : products[idx] = sp
        // plus haut ne met à jour que la mémoire, jamais le stockage local
        // tant que save() n'a pas tourné (retour utilisateur : "j'ai changé
        // la Marque sur une même ref, le serveur a bien la modif mais ça ne
        // s'actualise pas sur le client" — le pull recevait bien la donnée,
        // mais rien ne la persistait ni ne la réaffichait puisque ce bloc ne
        // se déclenchait qu'avec un NOUVEAU produit ou une fusion de
        // suggestions, jamais pour une simple mise à jour de champ sur une
        // ref déjà connue).
        save(true, sugMergedProducts);
        var isModalOpen = document.body.classList.contains('modal-open');
        if(!isModalOpen){
          // Re-render uniquement la vue active
          var homePage = document.getElementById('homePage');
          var isOnHome = homePage && !homePage.classList.contains('hidden');
          if(isOnHome){
            renderHome();
          } else {
            render();
          }
        }
        if(added > 0 && !silent) showToast(added+' nouveau(x) produit(s) reçu(s) du serveur ✓', 'ok', 3000);
      }

      // Repousser au serveur les verrous expirés nettoyés ci-dessus — sans
      // ça, le nettoyage ne serait que local (visible seulement par CET
      // utilisateur) et la fiche redeviendrait "verrouillée" au prochain
      // pull d'un autre utilisateur. N'importe quel utilisateur qui tombe
      // le premier sur un verrou périmé s'en charge, pas seulement l'admin.
      if(staleLockCleanups.length > 0){
        pushToServer(staleLockCleanups);
      }
    }catch(e){ console.warn('syncFromServer:', e.message); }
  }

  // Envoie products au serveur (POST /pushDatas) puis retire un pull différentiel
  // pour rester synchronisé. Partagé par le bouton "Envoyer le catalogue local
  // au serveur" et par l'import JSON (Fusionner/Remplacer), qui ne poussaient
  // sinon la modification que dans le stockage local du navigateur.
  async function pushCatalogToServer(opts){
    opts = opts || {};
    var url = opts.url || serverUrl;
    if(!url) return { ok: false, reason: 'no-server' };
    try{
      var r = await fetch(url+'/pushDatas', {
        method:'POST',
        headers: typeof window.authHeaders === 'function' ? window.authHeaders() : {'Content-Type':'application/json'},
        body: JSON.stringify(products)
      });
      if(!r.ok) throw new Error('HTTP '+r.status);
      var result = await r.json();
      serverUrl = url;
      await syncFromServer(true);
      return { ok: true, upserted: result.upserted };
    }catch(e){
      return { ok: false, reason: 'error', message: e.message };
    }
  }

  // ── Navigation Paramètres ─────────────────────────────────────────
  var settingsFamilyPage  = document.getElementById('settingsFamilyPage');
  var settingsServerPage  = document.getElementById('settingsServerPage');
  var settingsUserPage    = document.getElementById('settingsUserPage');
  var settingsLockedPage  = document.getElementById('settingsLockedPage');
  var btnOpenFamilyIcons  = document.getElementById('btnOpenFamilyIcons');
  var btnFamilyPageBack   = document.getElementById('btnFamilyPageBack');
  var btnOpenServerSettings = document.getElementById('btnOpenServerSettings');
  var btnServerPageBack   = document.getElementById('btnServerPageBack');
  var serverUrlInput      = document.getElementById('serverUrlInput');
  var serverTestResult    = document.getElementById('serverTestResult');

  // .settings-header (titre "Paramètres" + croix/flèche de fermeture) est un
  // frère de .settings-body ET de chaque sous-page — jamais masqué par les
  // fonctions show* ci-dessous à l'origine, donc affiché EN PERMANENCE
  // au-dessus de la sous-page active. Chaque sous-page a pourtant déjà sa
  // propre flèche ← (retour à CETTE liste Paramètres) — les deux empilées
  // donnaient deux flèches ← visibles en même temps mais qui ne ramènent
  // PAS au même endroit (l'une revient au menu mobile, l'autre juste à la
  // liste Paramètres) — retour utilisateur : "j'ai deux flèches qui ne
  // retournent pas au même endroit". Masquer l'en-tête général dès qu'une
  // sous-page a sa propre navigation résout l'ambiguïté : un seul niveau de
  // retour visible à la fois, comme une pile d'écrans classique.
  var settingsHeaderEl = document.querySelector('.settings-header');
  function showSettingsMain(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = '';
    document.querySelector('.settings-body').style.display = '';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'none';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
  }
  function showSettingsFamilyPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'flex';
    settingsServerPage.style.display = 'none';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
    renderSettingsFamilies();
  }
  function showSettingsUserPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
    if(settingsUserPage){ settingsUserPage.style.display = 'flex'; if(typeof renderUserPage==='function') renderUserPage(); }
  }
  function showSettingsServerPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'flex';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage) settingsLockedPage.style.display = 'none';
    serverUrlInput.value = serverUrl;

  }
  function showSettingsLockedPage(){
    if(settingsHeaderEl) settingsHeaderEl.style.display = 'none';
    document.querySelector('.settings-body').style.display = 'none';
    settingsFamilyPage.style.display = 'none';
    settingsServerPage.style.display = 'none';
    if(settingsUserPage) settingsUserPage.style.display = 'none';
    if(settingsLockedPage){ settingsLockedPage.style.display = 'flex'; renderSettingsLockedPage(); }
  }

  // Formate un délai en secondes en texte court ("à l'instant", "12 min",
  // "1 h 05") — usage unique ici, pas besoin d'un utilitaire partagé.
  function _formatLockAge(ms){
    var min = Math.floor(ms / 60000);
    if(min < 1) return 'à l\'instant';
    if(min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    var rem = min % 60;
    return h + ' h' + (rem ? ' ' + String(rem).padStart(2, '0') : '');
  }

  async function renderSettingsLockedPage(){
    var listEl = document.getElementById('settingsLockedList');
    if(!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:20px 8px;"><i class="ti ti-loader-2" style="font-size:18px;"></i><br>Chargement…</div>';
    var result = await _fetchAllLockedProducts();
    if(!result.fetched){
      listEl.innerHTML = '<div style="text-align:center;color:#DC2626;font-size:12.5px;padding:20px 8px;">Impossible de joindre le serveur.</div>';
      return;
    }
    if(!result.locked.length){
      listEl.innerHTML = '<div style="text-align:center;color:var(--ink-soft);font-size:12.5px;padding:20px 8px;">Aucune fiche verrouillée actuellement.</div>';
      return;
    }
    var now = Date.now();
    listEl.innerHTML = result.locked.map(function(p){
      var age = p._editingAt ? (now - p._editingAt) : null;
      var expired = age != null && age > EDIT_LOCK_TTL_MS;
      var ageLabel = age != null ? _formatLockAge(age) : '?';
      return '<div class="locked-product-row" data-id="' + escapeHtml(p.id || '') + '" data-ref="' + escapeHtml(p.ref || '') + '" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-size:12.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.ref || p.name || '(sans référence)') + '</div>'
        + '<div style="font-size:11px;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(p.name || '') + '</div>'
        + '<div style="font-size:11px;color:' + (expired ? '#059669' : '#DC2626') + ';margin-top:3px;">'
          + 'Verrouillé par <strong>' + escapeHtml(p._editingBy || '?') + '</strong> — depuis ' + ageLabel
          + (expired ? ' (expiré — plus bloquant pour personne, sera nettoyé par la purge serveur)' : '')
        + '</div>'
        + '</div>'
        + '<button type="button" class="locked-product-unlock" style="flex-shrink:0;padding:8px 12px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">Déverrouiller</button>'
        + '</div>';
    }).join('');
  }

  var btnLockedPageBack = document.getElementById('btnLockedPageBack');
  if(btnLockedPageBack) btnLockedPageBack.addEventListener('click', function(){ showSettingsMain(); });
  var btnLockedPageRefresh = document.getElementById('btnLockedPageRefresh');
  if(btnLockedPageRefresh) btnLockedPageRefresh.addEventListener('click', function(){ renderSettingsLockedPage(); });
  var btnOpenLockedProducts = document.getElementById('btnOpenLockedProducts');
  if(btnOpenLockedProducts) btnOpenLockedProducts.addEventListener('click', function(){ showSettingsLockedPage(); });
  var settingsLockedListEl = document.getElementById('settingsLockedList');
  if(settingsLockedListEl) settingsLockedListEl.addEventListener('click', async function(e){
    var btn = e.target.closest ? e.target.closest('.locked-product-unlock') : null;
    if(!btn) return;
    var row = btn.closest('.locked-product-row');
    if(!row) return;
    var id = row.getAttribute('data-id');
    var ref = row.getAttribute('data-ref');
    var refLabel = ref || id;
    // refLabel vient d'une ref/id produit (saisie possible par n'importe
    // quel utilisateur autorisé à ajouter un produit) — échappé avant
    // insertion dans le popup HTML, comme les autres appels de
    // customConfirm/customAlert du projet (issue CodeQL "DOM text
    // reinterpreted as HTML" : ce site-ci ne le faisait pas encore).
    var ok = typeof customConfirm === 'function'
      ? await customConfirm('Déverrouiller cette fiche ?', 'Utilise ceci seulement si tu es sûr que ' + escapeHtml(refLabel) + ' n\'est plus en cours de modification par personne (crash/fermeture du navigateur). Continuer ?', { okLabel: 'Déverrouiller', danger: true })
      : confirm('Déverrouiller ' + refLabel + ' ?');
    if(!ok) return;
    btn.disabled = true;
    btn.textContent = 'Déverrouillage…';
    var result = await _fetchAllLockedProducts();
    var fresh = result.fetched ? result.locked.find(function(x){ return x.id === id || (ref && x.ref === ref); }) : null;
    var success = fresh ? await _adminForceUnlockProduct(fresh) : false;
    if(success){
      if(typeof showToast === 'function') showToast('Fiche ' + refLabel + ' déverrouillée ✓', 'ok');
      renderSettingsLockedPage();
    } else {
      if(typeof showToast === 'function') showToast('Échec du déverrouillage — réessaie.', 'err');
      btn.disabled = false;
      btn.textContent = 'Déverrouiller';
    }
  });

  btnOpenFamilyIcons.addEventListener('click', function(){ showSettingsFamilyPage(); });
  var btnOpenUserSettings = document.getElementById('btnOpenUserSettings');
  if(btnOpenUserSettings) btnOpenUserSettings.addEventListener('click', function(){ showSettingsUserPage(); });

  // Bouton Mon compte géré dans auth.js
  var btnUserPageBack = document.getElementById('btnUserPageBack');
  if(btnUserPageBack) btnUserPageBack.addEventListener('click', function(){ showSettingsMain(); });
  btnOpenFamilyIcons.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; });
  btnOpenFamilyIcons.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; });
  btnFamilyPageBack.addEventListener('click', function(){ showSettingsMain(); });

  btnOpenServerSettings.addEventListener('click', function(){ showSettingsServerPage(); });
  btnOpenServerSettings.addEventListener('mouseover', function(){ this.style.borderColor='var(--copper)'; });
  btnOpenServerSettings.addEventListener('mouseout',  function(){ this.style.borderColor='var(--line)'; });
  btnServerPageBack.addEventListener('click', function(){ showSettingsMain(); });

  // Vérifie qu'un serveur répond, avec un timeout court : une IP mal saisie
  // ou injoignable ne doit pas faire attendre l'utilisateur indéfiniment.
  function pingServerUrl(url){
    return new Promise(function(resolve){
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = setTimeout(function(){ if(ctrl) ctrl.abort(); }, 4000);
      fetch(url+'/health', ctrl ? {signal: ctrl.signal} : {})
        .then(function(r){ clearTimeout(timer); resolve(!!r.ok); })
        .catch(function(){ clearTimeout(timer); resolve(false); });
    });
  }

  // Test connexion
  document.getElementById('btnTestServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'');
    serverTestResult.style.display = 'block';
    // Sans ce contrôle, un champ vide déclenchait quand même un fetch — vers
    // une URL relative résolue sur la page elle-même — et affichait "HTTP
    // 404" comme si un vrai serveur avait répondu, message trompeur (retour
    // utilisateur).
    if(!url){
      serverTestResult.style.background = '#FEE2E2';
      serverTestResult.style.color = '#991B1B';
      serverTestResult.textContent = '✗ Entrez une URL avant de tester.';
      return;
    }
    serverTestResult.style.background = '#F1F5F9';
    serverTestResult.style.color = 'var(--ink)';
    serverTestResult.textContent = 'Connexion en cours…';
    try{
      var r = await fetch(url+'/health');
      if(r.ok){
        serverTestResult.style.background = '#ECFDF5';
        serverTestResult.style.color = '#065F46';
        serverTestResult.textContent = '✓ Serveur disponible';
      } else {
        throw new Error('HTTP '+r.status);
      }
    }catch(e){
      serverTestResult.style.background = '#FEE2E2';
      serverTestResult.style.color = '#991B1B';
      serverTestResult.textContent = '✗ Impossible de joindre le serveur : '+e.message;
    }
  });

  // Enregistrer config


  document.getElementById('btnSaveServer').addEventListener('click', async function(){
    var newUrl     = serverUrlInput.value.trim().replace(/\/+$/, '');
    var urlChanged = newUrl && newUrl !== serverUrl;

    // Si l'adresse a changé, vérifier qu'elle répond avant d'aller plus loin —
    // sinon la fenêtre de connexion s'affichait même pour un serveur injoignable
    // (IP mal saisie, serveur éteint...), ce qui n'a rien à faire là.
    if(urlChanged){
      var btnSaveServerEl = this;
      btnSaveServerEl.disabled = true;
      var reachable = await pingServerUrl(newUrl);
      btnSaveServerEl.disabled = false;
      if(!reachable){
        showToast('Serveur injoignable à cette adresse — vérifiez l\'IP et le port.', 'err', 4000);
        return;
      }
    }

    serverUrl  = newUrl;
    saveServerConfig();
    if(serverUrl) startSyncPolling(); else stopSyncPolling();

    // Si nouvelle URL et pas connecté → ouvrir la fenêtre de login d'abord
    if(urlChanged && serverUrl && typeof authIsLoggedIn === 'function' && !authIsLoggedIn()){
      showToast('Veuillez vous connecter pour importer le catalogue', 'warn', 3500);
      if(typeof openAuthModal === 'function') openAuthModal();
      showSettingsMain();
      return;
    }

    // Si l'URL vient d'être définie → import automatique du catalogue
    if(urlChanged && serverUrl){
      showToast('Import du catalogue depuis le serveur…', 'ok', 2500);
      try{
        var pullHeaders = typeof window.authHeaders === 'function' ? window.authHeaders() : {};
          delete pullHeaders['Content-Type'];
          var r = await fetch(serverUrl+'/pullDatas', { headers: pullHeaders });
        if(!r.ok) throw new Error('HTTP '+r.status);
        var data = await r.json();
        if(data && Array.isArray(data.items)){
          products = data.items.map(function(item){ return item.data; });
        } else if(Array.isArray(data)){
          products = data;
        } else {
          throw new Error('Format invalide');
        }
        // [] : products vient d'être remplacé par les données DU serveur —
        // les repousser serait un aller-retour inutile (et re-timbrerait
        // inutilement createdAt sur tout le catalogue, voir les autres
        // correctifs de ce type dans ce fichier).
        save(true, []);
        localStorage.setItem(SERVER_LAST_SYNC_KEY, Date.now().toString());
        // Fermer les paramètres et afficher la home proprement
        showSettingsMain();
        if(typeof window._closeSettingsOverlay === 'function') window._closeSettingsOverlay();
        document.body.classList.remove('modal-open');
        var homePage = document.getElementById('homePage');
        var catalogueWrap = document.getElementById('catalogueWrap');
        var hdrCountChip = document.getElementById('hdrCountChip');
        if(homePage) homePage.classList.remove('hidden');
        if(catalogueWrap) catalogueWrap.style.display = 'none';
        if(hdrCountChip) hdrCountChip.style.display = 'none';
        render();
        renderHome();
        showToast(products.length+' produits importés depuis le serveur ✓', 'ok', 3000);
        return;
      }catch(e){
        showToast('Import automatique échoué : '+e.message, 'err', 4000);
      }
    } else {
      showToast('Configuration serveur enregistrée ✓', 'ok', 2500);
    }
    showSettingsMain();
  });

  // Charger depuis serveur
  document.getElementById('btnSyncFromServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    try{
      var initH = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete initH['Content-Type'];
      var r = await fetch(url+'/pullDatas', { headers: initH });
      if(!r.ok) throw new Error('HTTP '+r.status);
      var data = await r.json();
      // Format serveur : { count: N, items: [ { ref, data: {...produit} } ] }
      if(data && Array.isArray(data.items)){
        products = data.items.map(function(item){ return item.data; });
      } else if(Array.isArray(data)){
        products = data;
      } else {
        throw new Error('Format invalide');
      }
      // [] : voir commentaire équivalent juste au-dessus (import auto au
      // changement d'URL serveur) — products vient d'être remplacé par les
      // données DU serveur, rien à repousser.
      save(true, []);
      localStorage.setItem(SERVER_LAST_SYNC_KEY, Date.now().toString());
      // Fermer les paramètres
      if(typeof window._closeSettingsOverlay === 'function') window._closeSettingsOverlay();
      document.body.classList.remove('modal-open');
      // Réinitialiser et afficher la home
      var homePage = document.getElementById('homePage');
      var catalogueWrap = document.getElementById('catalogueWrap');
      var hdrCountChip = document.getElementById('hdrCountChip');
      if(homePage) homePage.classList.remove('hidden');
      if(catalogueWrap) catalogueWrap.style.display = 'none';
      if(hdrCountChip) hdrCountChip.style.display = 'none';
      render();
      renderHome();
      showToast(products.length+' produits chargés depuis le serveur ✓', 'ok', 2500);
    }catch(e){
      showToast('Erreur : '+e.message, 'warn', 3000);
    }
  });

  // Envoyer vers serveur
  document.getElementById('btnPushToServer').addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    var res = await pushCatalogToServer({ url: url });
    if(res.ok) showToast(res.upserted+' envoyé(s), catalogue synchronisé ✓', 'ok', 3000);
    else showToast('Erreur : '+(res.message || 'aucun serveur configuré'), 'warn', 3000);
  });

  // ── Sauvegarde/restauration serveur (admin) — /admin/backup, /admin/restore ──
  var btnAdminBackupEl  = document.getElementById('btnAdminBackup');
  var btnAdminRestoreEl = document.getElementById('btnAdminRestore');

  if(btnAdminBackupEl) btnAdminBackupEl.addEventListener('click', async function(){
    var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
    if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
    var original = btnAdminBackupEl.innerHTML;
    btnAdminBackupEl.disabled = true;
    btnAdminBackupEl.style.opacity = '0.6';
    try{
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      var r = await fetch(url + '/admin/backup', { headers: h });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var data = await r.json();
      // Télécharge tel quel — même mécanisme que "Exporter" (btnExport)
      // ci-dessus, quelle que soit la forme exacte renvoyée (objet ou
      // chaîne), pour ne rien présumer du format de la sauvegarde serveur.
      var text = (typeof data === 'string') ? data : JSON.stringify(data, null, 2);
      var blob = new Blob([text], {type:'application/json'});
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      var d = new Date();
      var stamp = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0');
      a.download = 'sauvegarde-serveur-'+stamp+'.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Sauvegarde téléchargée ✓', 'ok', 2500);
    }catch(e){
      showToast('Erreur lors du téléchargement : '+e.message, 'err', 4000);
    }finally{
      btnAdminBackupEl.disabled = false;
      btnAdminBackupEl.style.opacity = '';
      btnAdminBackupEl.innerHTML = original;
    }
  });

  // Restaurer depuis un fichier choisi par l'admin (retour utilisateur :
  // /admin/restore doit accepter le fichier de sauvegarde de l'admin, pas
  // se contenter de restaurer une sauvegarde fixe côté serveur — le Swagger
  // ne documentait pas de corps de requête pour cette route, contrairement
  // à /pushDocsReq par ex., donc le nom exact du champ multipart ("file"
  // ci-dessous) est une supposition raisonnable, PAS confirmé — à vérifier
  // au premier essai réel (ajuster ici si 422/erreur de validation).
  var adminRestoreFileInput = document.getElementById('adminRestoreFileInput');
  if(btnAdminRestoreEl && adminRestoreFileInput){
    btnAdminRestoreEl.addEventListener('click', function(){
      var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
      if(!url){ showToast('Aucun serveur configuré', 'warn', 2500); return; }
      adminRestoreFileInput.value = '';
      adminRestoreFileInput.click();
    });
    adminRestoreFileInput.addEventListener('change', async function(){
      var file = adminRestoreFileInput.files && adminRestoreFileInput.files[0];
      if(!file) return;
      var url = serverUrlInput.value.trim().replace(/\/+$/,'') || serverUrl;
      // Action destructrice et irréversible (écrase les données côté
      // serveur) — confirmation appuyée obligatoire, comme pour une
      // suppression, avec le nom du fichier choisi pour que l'admin
      // vérifie qu'il ne s'est pas trompé de fichier.
      // file.name vient du sélecteur de fichier du système — un nom de
      // fichier peut contenir n'importe quel caractère selon l'OS, échappé
      // avant insertion dans le popup HTML pour la même raison que
      // refLabel plus haut (issue CodeQL "DOM text reinterpreted as HTML").
      var confirmed = await customConfirm(
        'Restaurer une sauvegarde ?',
        'Le serveur va être restauré à partir de « ' + escapeHtml(file.name) + ' », en écrasant l\'état actuel. Cette opération est irréversible et affecte TOUS les utilisateurs connectés à ce serveur.',
        { okLabel: 'Restaurer', danger: true }
      );
      adminRestoreFileInput.value = '';
      if(!confirmed) return;
      var original = btnAdminRestoreEl.innerHTML;
      btnAdminRestoreEl.disabled = true;
      btnAdminRestoreEl.style.opacity = '0.6';
      try{
        var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
        delete h['Content-Type']; // laisser fetch fixer le boundary multipart
        var fd = new FormData();
        fd.append('file', file, file.name);
        var r = await fetch(url + '/admin/restore', { method:'POST', headers: h, body: fd });
        if(!r.ok) throw new Error('HTTP ' + r.status);
        showToast('Sauvegarde restaurée ✓ — rechargement du catalogue…', 'ok', 3000);
        // Le contenu du serveur a potentiellement tout changé — recharger
        // depuis zéro plutôt que de tenter une fusion différentielle.
        setTimeout(function(){ if(typeof syncFromServer === 'function') syncFromServer(false); }, 800);
      }catch(e){
        showToast('Erreur lors de la restauration : '+e.message, 'err', 4000);
      }finally{
        btnAdminRestoreEl.disabled = false;
        btnAdminRestoreEl.style.opacity = '';
        btnAdminRestoreEl.innerHTML = original;
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  COMPARAISON OFFRES FOURNISSEURS
  // ══════════════════════════════════════════════════════════════
  var compareOverlay   = document.getElementById('compareOverlay');
  var compareClose     = document.getElementById('compareClose');
  var compareSuppliers = document.getElementById('compareSuppliers');
  var compareResult    = document.getElementById('compareResult');
  var compareTable     = document.getElementById('compareTable');

  // Structure : [{name:'RS', data:{ref: price, ...}}, ...]
  var supplierSlots = [];

  function addSupplierSlot(){
    var idx = supplierSlots.length;
    supplierSlots.push({name:'Fournisseur '+(idx+1), data:{}});
    renderSupplierSlots();
  }

  function renderSupplierSlots(){
    compareSuppliers.innerHTML = supplierSlots.map(function(s, i){
      var loaded = Object.keys(s.data).length > 0;
      return '<div class="compare-supplier-slot'+(loaded?' loaded':'')+'" data-idx="'+i+'">'
        + '<input class="compare-supplier-name" type="text" placeholder="Nom du fournisseur" value="'+escapeHtml(s.name)+'" data-idx="'+i+'">'
        + '<button class="compare-supplier-file-btn" data-idx="'+i+'"><i class="ti ti-upload"></i> Importer fichier</button>'
        + '<div class="compare-supplier-status">'+(loaded ? '✓ '+Object.keys(s.data).length+' référence(s)' : 'Aucun fichier')+'</div>'
        + '<input type="file" accept=".xlsx,.xls,.csv" style="display:none;" class="compare-file-input" data-idx="'+i+'">'
        + '</div>';
    }).join('');

    // Listeners noms
    compareSuppliers.querySelectorAll('.compare-supplier-name').forEach(function(inp){
      inp.addEventListener('input', function(){
        supplierSlots[parseInt(inp.getAttribute('data-idx'))].name = inp.value;
      });
    });

    // Listeners boutons import
    compareSuppliers.querySelectorAll('.compare-supplier-file-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var fi = compareSuppliers.querySelector('.compare-file-input[data-idx="'+btn.getAttribute('data-idx')+'"]');
        fi.click();
      });
    });

    // Listeners fichiers
    compareSuppliers.querySelectorAll('.compare-file-input').forEach(function(fi){
      fi.addEventListener('change', async function(){
        var idx = parseInt(fi.getAttribute('data-idx'));
        var file = fi.files[0];
        if(!file) return;
        try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }
        // Mettre à jour le nom si encore générique
        if(supplierSlots[idx].name === 'Fournisseur '+(idx+1)){
          supplierSlots[idx].name = file.name.replace(/\.[^.]+$/,'');
        }
        var reader = new FileReader();
        reader.onload = function(e){
          var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
          var data = {};
          // Chercher colonnes Référence et Prix
          var headerRow = -1;
          var colRef = -1, colPrice = -1;
          for(var r=0;r<Math.min(rows.length,5);r++){
            for(var c=0;c<rows[r].length;c++){
              var h = String(rows[r][c]).toLowerCase().trim();
              if(/r[ée]f/.test(h)) { colRef = c; headerRow = r; }
              if(/prix|price/.test(h)) { colPrice = c; headerRow = r; }
            }
            if(colRef !== -1 && colPrice !== -1) break;
          }
          // Si pas d'entêtes trouvés, supposer col0=ref, col1=prix
          if(colRef === -1) colRef = 0;
          if(colPrice === -1) colPrice = 1;
          var start = headerRow >= 0 ? headerRow+1 : 0;
          for(var i=start;i<rows.length;i++){
            var ref = String(rows[i][colRef]||'').trim();
            var price = String(rows[i][colPrice]||'').trim().replace(/[€$£\s]/g,'').replace(',','.');
            var pNum = parseFloat(price);
            if(ref && !isNaN(pNum) && pNum > 0) data[ref] = pNum;
          }
          supplierSlots[idx].data = data;
          renderSupplierSlots();
          showToast(Object.keys(data).length+' références importées pour '+supplierSlots[idx].name, 'ok', 2500);
        };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function runComparison(){
    var loaded = supplierSlots.filter(function(s){ return Object.keys(s.data).length > 0; });
    if(loaded.length < 2){ showToast('Importez au moins 2 fichiers fournisseurs', 'err', 2500); return; }

    // Collecter toutes les références présentes dans au moins un fichier
    var allRefs = {};
    loaded.forEach(function(s){ Object.keys(s.data).forEach(function(r){ allRefs[r]=true; }); });

    // Construire le tableau
    var headers = ['<th>Référence</th><th>Nom produit</th>']
      .concat(loaded.map(function(s){ return '<th>'+escapeHtml(s.name)+'</th>'; }))
      .concat(['<th>Meilleur prix</th><th>Économie</th><th>Action</th>']);

    var rows = Object.keys(allRefs).sort().map(function(ref){
      var prod = products.find(function(p){ return p.ref===ref; });
      var prices = loaded.map(function(s){ return s.data[ref] !== undefined ? s.data[ref] : null; });
      var validPrices = prices.filter(function(p){ return p !== null; });
      var bestPrice = validPrices.length ? Math.min.apply(null,validPrices) : null;
      var worstPrice = validPrices.length > 1 ? Math.max.apply(null,validPrices) : null;

      var priceCells = prices.map(function(p){
        if(p === null) return '<td><span class="compare-price-missing">—</span></td>';
        var cls = p===bestPrice ? 'compare-price-best' : (p===worstPrice && validPrices.length>1 ? 'compare-price-worst' : 'compare-price-mid');
        return '<td><span class="'+cls+'">'+p.toFixed(2)+' €</span></td>';
      }).join('');

      var economy = (bestPrice !== null && worstPrice !== null && worstPrice > bestPrice)
        ? '<span style="color:#059669;font-size:12px;">-'+((1-bestPrice/worstPrice)*100).toFixed(0)+'%</span>' : '—';

      var bestSupplier = bestPrice !== null ? loaded[prices.indexOf(bestPrice)] : null;
      var action = (bestPrice !== null && prod)
        ? '<button class="compare-save-btn" data-ref="'+escapeHtml(ref)+'" data-price="'+bestPrice+'" data-supplier="'+(bestSupplier?escapeHtml(bestSupplier.name):'')+'" title="Appliquer le meilleur prix">Appliquer</button>'
        : '—';

      return '<tr>'
        + '<td style="font-weight:700;color:var(--copper);white-space:nowrap;">'+escapeHtml(ref)+'</td>'
        + '<td style="color:var(--ink-soft);font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(prod?escapeHtml(prod.name||''):'<em>Inconnu</em>')+'</td>'
        + priceCells
        + '<td>'+(bestPrice!==null?'<strong>'+bestPrice.toFixed(2)+' €</strong>':'—')+'</td>'
        + '<td>'+economy+'</td>'
        + '<td>'+action+'</td>'
        + '</tr>';
    });

    compareTable.innerHTML = '<thead><tr>'+headers.join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody>';
    compareResult.style.display = 'block';

    // Listeners boutons Appliquer
    compareTable.querySelectorAll('.compare-save-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        var ref = btn.getAttribute('data-ref');
        var price = parseFloat(btn.getAttribute('data-price'));
        var supplier = btn.getAttribute('data-supplier');
        var idx = products.findIndex(function(p){ return p.ref===ref; });
        if(idx !== -1){
          var oldPrice = products[idx].price;
          if(oldPrice && oldPrice !== price.toFixed(2)+''){
            var hist = Array.isArray(products[idx].priceHistory) ? products[idx].priceHistory.slice() : [];
            hist.push({price:oldPrice, date:Date.now()});
            products[idx].priceHistory = hist;
          }
          products[idx].price = price.toFixed(2);
          if(supplier) products[idx].supplier = supplier;
          // [products[idx]] : seul CE produit a été touché — voir les autres
          // correctifs de ce type dans ce fichier (syncFromServer,
          // pushToServer) et dans js/modal.js/js/render.js.
          save(false, [products[idx]]);
          btn.textContent = '✓ Appliqué';
          btn.disabled = true;
          btn.style.color = '#059669';
          btn.style.borderColor = '#059669';
        }
      });
    });
  }

  // Appliquer TOUS les meilleurs prix
  document.getElementById('btnSaveBest').addEventListener('click', function(){
    compareTable.querySelectorAll('.compare-save-btn:not([disabled])').forEach(function(btn){ btn.click(); });
    showToast('Tous les meilleurs prix ont été appliqués ✓', 'ok', 3000);
  });

  // Exporter comparaison en Excel
  document.getElementById('btnExportCompare').addEventListener('click', async function(){
    try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }
    var loaded = supplierSlots.filter(function(s){ return Object.keys(s.data).length > 0; });
    var allRefs = {};
    loaded.forEach(function(s){ Object.keys(s.data).forEach(function(r){ allRefs[r]=true; }); });
    var headers = ['Référence','Nom produit'].concat(loaded.map(function(s){ return s.name+' (€)'; })).concat(['Meilleur prix (€)','Meilleur fournisseur','Économie (%)']);
    var aoa = [headers].concat(Object.keys(allRefs).sort().map(function(ref){
      var prod = products.find(function(p){ return p.ref===ref; });
      var prices = loaded.map(function(s){ return s.data[ref]!==undefined?s.data[ref]:''; });
      var validPrices = prices.filter(function(p){ return p!==''; });
      var best = validPrices.length ? Math.min.apply(null,validPrices) : '';
      var worst = validPrices.length>1 ? Math.max.apply(null,validPrices) : '';
      var bestIdx = best !== '' ? prices.indexOf(best) : -1;
      var bestSupplier = bestIdx !== -1 ? loaded[bestIdx].name : '';
      var eco = (best!==''&&worst!==''&&worst>best) ? Math.round((1-best/worst)*100) : '';
      return [ref, prod?prod.name:''].concat(prices).concat([best, bestSupplier, eco]);
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Comparaison');
    XLSX.writeFile(wb, 'SPI_comparaison_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('Export comparaison téléchargé ✓', 'ok', 2000);
  });

  document.getElementById('btnAddSupplierSlot').addEventListener('click', addSupplierSlot);
  document.getElementById('btnRunCompare').addEventListener('click', runComparison);

  document.getElementById('btnCompare').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    // Init avec 2 slots par défaut
    if(supplierSlots.length === 0){ addSupplierSlot(); addSupplierSlot(); }
    else renderSupplierSlots();
    compareResult.style.display = 'none';
    compareOverlay.classList.add('show');
    document.body.classList.add('modal-open');
  });
  document.getElementById('btnResetCompare').addEventListener('click', function(){
    supplierSlots = [];
    addSupplierSlot();
    addSupplierSlot();
    compareResult.style.display = 'none';
  });
  compareClose.addEventListener('click', function(){
    document.body.classList.remove('modal-open');
    // Sur mobile, si le comparateur a été ouvert DEPUIS le tiroir menu (voir
    // msWithBack('msCompare', ...) plus haut), la croix doit "revenir" au
    // menu plutôt que de retomber sur la page du dessous — même principe
    // que Paramètres/Demandes/Connexion/Signaler un bug. Rouvrir le menu
    // seulement une fois le comparateur réellement masqué (après l'anim de
    // fermeture), sinon les deux fonds grisés se superposent un instant.
    var reopenMenu = !!window._compareOpenedFromMobileMenu;
    if(reopenMenu) window._compareOpenedFromMobileMenu = false;
    _setHeaderBackMode('compareClose', 'compareBackBtn', false);
    function afterClose(){
      if(reopenMenu && typeof window._openMenuSheet === 'function') window._openMenuSheet();
    }
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(compareOverlay, function(){ compareOverlay.classList.remove('show'); afterClose(); });
    } else {
      compareOverlay.classList.remove('show');
      afterClose();
    }
  });

  document.getElementById('btnResetFilters').addEventListener('click', function(){
    brandFilterEl.value  = '';
    familyFilterEl.value = '';
    seriesFilterEl.value = '';
    // Réinitialiser aussi le tri prix
    window._setPriceSort(null);
    // .value= ne déclenche pas "change" → resynchroniser le badge de la
    // bottom nav à la main (bouton ⊘ visible aussi sur tablette, en même
    // temps que la bottom nav — voir window._syncBnFilterBadge, _initBottomNav).
    if(typeof window._syncBnFilterBadge === 'function') window._syncBnFilterBadge();
    _lastRenderKey = '';
    render();
  });

  loadServerConfig();

  // display posé puis reflow forcé avant .show : sans ça le navigateur
  // fusionne "display:none→flex" et le déclenchement du transform dans la
  // même passe et saute la transition de glissement (même technique que
  // #menuSheet — retour utilisateur : Paramètres apparaissait sans
  // l'animation des autres tiroirs mobiles). Symétriquement à la fermeture,
  // on laisse le temps à l'animation de glissement de se terminer avant de
  // repasser en display:none (sinon ça coupe l'animation inverse).
  function openSettingsOverlay(){
    settingsOverlay.style.display = 'flex';
    settingsOverlay.offsetHeight;
    settingsOverlay.classList.add('show');
    if(typeof window._refreshAppVersionInfo === 'function') window._refreshAppVersionInfo();
  }
  function closeSettingsOverlay(){
    settingsOverlay.classList.remove('show');
    // Sur mobile, si Paramètres a été ouvert DEPUIS le tiroir menu (voir
    // msSettings plus haut), la croix doit "revenir" au menu plutôt que de
    // retomber sur la page du dessous — même principe déjà en place pour
    // "Demandes en attente" (reqClosePanel, js/requests.js). Ne se
    // déclenche que pour cette entrée précise, jamais mis à true pour un
    // accès depuis le menu ⋮ desktop.
    var reopenMenu = !!window._settingsOpenedFromMobileMenu;
    if(reopenMenu) window._settingsOpenedFromMobileMenu = false;
    _setHeaderBackMode('settingsClose', 'settingsBackBtn', false);
    setTimeout(function(){
      if(!settingsOverlay.classList.contains('show')) settingsOverlay.style.display = 'none';
      // Rouvrir le menu seulement une fois Paramètres réellement masqué —
      // #settingsOverlay n'a pas de fondu (contrairement à #requestsOverlay/
      // fadeBgOut) : son fond grisé reste plein pot pendant les 300ms où le
      // panneau coulisse. Le rouvrir avant ce délai empilait un instant le
      // fond grisé de Paramètres par-dessus le menu tout juste réouvert
      // (retour utilisateur : "souci d'overlay").
      if(reopenMenu && typeof window._openMenuSheet === 'function') window._openMenuSheet();
    }, 300);
  }
  window._closeSettingsOverlay = closeSettingsOverlay;

  btnSettings.addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    showSettingsMain();
    openSettingsOverlay();
  });
  settingsClose.addEventListener('click', closeSettingsOverlay);
  // Clic en dehors ne ferme pas la modale Paramètres — croix obligatoire

  var hdrMenuBtn = document.getElementById('hdrMenuBtn');
  var hdrMenu    = document.getElementById('hdrMenu');
  hdrMenuBtn.addEventListener('click', function(e){
    e.stopPropagation();
    hdrMenu.classList.toggle('open');
  });
  document.addEventListener('click', function(e){
    if(!hdrMenu.contains(e.target) && e.target !== hdrMenuBtn){
      hdrMenu.classList.remove('open');
    }
  });

  document.getElementById('btnCleanDescs').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    var count = 0;
    var touchedByClean = [];
    products.forEach(function(p){
      var touched = false;
      var cleaned = stripHtml(p.desc || '');
      if(cleaned !== (p.desc || '')){ p.desc = cleaned; count++; touched = true; }
      var cleanedName = stripHtml(p.name || '');
      if(cleanedName !== (p.name || '')){ p.name = cleanedName; touched = true; }
      if(touched){ p.updatedAt = Date.now(); touchedByClean.push(p); }
    });
    // touchedByClean (jamais tout le catalogue) : seuls les produits dont la
    // description/le nom contenait vraiment du HTML à nettoyer ont changé —
    // voir les autres correctifs de ce type dans ce fichier.
    save(false, touchedByClean); render();

    customAlert('Nettoyer les descriptions', count > 0
      ? count + ' description(s) nettoyée(s) avec succès.'
      : 'Aucune description HTML à nettoyer — tout est déjà propre !');
  });

  // ---------- Export / Import ----------
  document.getElementById('btnExport').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    var blob = new Blob([JSON.stringify(products, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    a.download = 'catalogue-'+stamp+'.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  document.getElementById('btnImport').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    document.getElementById('fileImport').click();
  });
  document.getElementById('fileImport').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file){ e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      var imported;
      try{
        imported = JSON.parse(ev.target.result);
        if(!Array.isArray(imported)) throw new Error('format invalide');
      }catch(err){
        showToast('Fichier non valide — ce n\'est pas un export catalogue JSON.', 'err', 3500);
        e.target.value = '';
        return;
      }
      // Demander via showToast + choix (pas de confirm natif)
      var count = imported.length;
      var _pendingImport = imported;
      // Utiliser une mini modale inline
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:var(--overlay-scrim);display:flex;align-items:center;justify-content:center;padding:16px;';
      overlay.innerHTML = '<div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.25);">'
        + '<div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:8px;">Importer '+count+' produit(s)</div>'
        + '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Comment voulez-vous importer ce fichier ?</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;">'
        + '<button id="_importMerge" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#f8fafc;color:#1e293b;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Fusionner</strong> — ajouter aux produits existants</button>'
        + '<button id="_importReplace" style="padding:10px 14px;border-radius:8px;border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;font-size:13px;cursor:pointer;text-align:left;font-family:inherit;"><strong>Remplacer</strong> — effacer et remplacer le catalogue</button>'
        + '<button id="_importCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>'
        + '</div></div>';
      document.body.appendChild(overlay);
      overlay.querySelector('#_importMerge').addEventListener('click', async function(){
        // Même logique que syncFromServer : ref inconnue → ajout, ref connue → conflit
        // Map plutôt qu'objet nu — voir doCheckAllSync() plus haut.
        var localMap = new Map();
        products.forEach(function(p, i){ if(p.ref) localMap.set(p.ref, i); });
        var added = 0;
        var importConflicts = [];

        _pendingImport.forEach(function(p){
          if(!p.id) p.id = 'p_'+Date.now()+'_'+_secureRandomBase36(6);
          if(!p.ref){
            // Pas de ref → ajout direct
            products.push(p);
            added++;
            return;
          }
          var idx = localMap.get(p.ref);
          if(idx === undefined){
            // Ref inconnue → ajout
            localMap.set(p.ref, products.length);
            products.push(p);
            added++;
          } else {
            // Ref connue → conflit si contenu différent
            var lp = products[idx];
            function stripUpdated(o){ var c=Object.assign({},o); delete c.updatedAt; return JSON.stringify(c); }
            if(stripUpdated(lp) !== stripUpdated(p)){
              importConflicts.push({ ref: p.ref, local: lp, server: p });
            }
          }
        });

        // Rattrape les liens de suggestions à sens unique (voir commentaire
        // sur reconcileSuggestionsReciprocally) — retour utilisateur : un
        // import doit se comporter comme le formulaire, pas seulement les
        // ajouts un par un.
        reconcileSuggestionsReciprocally(products);
        reconcileSparePartsReciprocally(products);

        // [] : pas de push ici — save() sans filtre aurait repoussé tout le
        // catalogue local avec createdAt forcé à maintenant sur chaque
        // produit (même risque que le bug corrigé dans syncFromServer/
        // pushToServer), EN DOUBLE puisque pushCatalogToServer() juste en
        // dessous fait déjà l'envoi complet voulu pour cet import — lui,
        // sans forcer createdAt, laissant le serveur arbitrer normalement
        // par produit plutôt que gagner à coup sûr.
        save(false, []);
        // Forcer retour à la home
        var homePage = document.getElementById('homePage');
        var catalogueWrap = document.getElementById('catalogueWrap');
        var hdrCountChip = document.getElementById('hdrCountChip');
        if(homePage) homePage.classList.remove('hidden');
        if(catalogueWrap) catalogueWrap.style.display = 'none';
        if(hdrCountChip) hdrCountChip.style.display = 'none';
        render(); renderHome();
        document.body.removeChild(overlay);
        e.target.value = '';

        var pushRes = await pushCatalogToServer();
        var syncMsg = pushRes.ok ? ', envoyé au serveur ✓' : (pushRes.reason === 'no-server' ? '' : ' (échec envoi serveur : '+pushRes.message+')');
        if(importConflicts.length > 0){
          setTimeout(function(){
            if(typeof window.openConflictModal === 'function'){
              window.openConflictModal(importConflicts);
            }
          }, 300);
        } else {
          showToast(added+' produit(s) ajouté(s)'+syncMsg, 'ok', 3000);
        }
      });
      overlay.querySelector('#_importReplace').addEventListener('click', async function(){
        products = _pendingImport;
        // Voir commentaire équivalent dans #_importMerge ci-dessus : [] ici
        // aussi, pushCatalogToServer() juste en dessous fait déjà l'envoi
        // complet voulu pour ce remplacement.
        reconcileSuggestionsReciprocally(products);
        reconcileSparePartsReciprocally(products);
        save(false, []);
        var homePage = document.getElementById('homePage');
        var catalogueWrap = document.getElementById('catalogueWrap');
        var hdrCountChip = document.getElementById('hdrCountChip');
        if(homePage) homePage.classList.remove('hidden');
        if(catalogueWrap) catalogueWrap.style.display = 'none';
        if(hdrCountChip) hdrCountChip.style.display = 'none';
        render(); renderHome();
        document.body.removeChild(overlay);
        e.target.value = '';

        var pushRes = await pushCatalogToServer();
        var syncMsg = pushRes.ok ? ', envoyé au serveur ✓' : (pushRes.reason === 'no-server' ? '' : ' (échec envoi serveur : '+pushRes.message+')');
        showToast('Catalogue remplacé — '+count+' produit(s)'+syncMsg, 'ok', 3000);
      });
      overlay.querySelector('#_importCancel').addEventListener('click', function(){
        document.body.removeChild(overlay);
        e.target.value = '';
      });
    };
    reader.readAsText(file);
  });

  // ══════════════════════════════════════════════════════════════
  //  EXPORT EXCEL (fabricant) — produits filtrés actuellement
  // ══════════════════════════════════════════════════════════════
  document.getElementById('btnExportXlsx').addEventListener('click', async function(){
    hdrMenu.classList.remove('open');
    try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }

    // Récupère les produits filtrés (même logique que render)
    var search = (document.getElementById('searchInput') || {value:''}).value.toLowerCase().trim();
    var brand  = document.getElementById('brandFilter').value;
    var family = document.getElementById('familyFilter').value;
    var series = document.getElementById('seriesFilter').value;
    var filtered = products.filter(function(p){
      if(brand  && p.brand  !== brand)  return false;
      if(family && p.family !== family) return false;
      if(series && p.series !== series) return false;
      if(search){
        var hay = ((p.ref||'')+(p.name||'')+(p.desc||'')+(p.brand||'')).toLowerCase();
        if(!hay.includes(search)) return false;
      }
      return true;
    });

    if(filtered.length === 0){
      showToast('Aucun produit à exporter.', 'err'); return;
    }

    // Construction des lignes
    var rows = filtered.map(function(p){
      // Prix d'origine (1er historique) = prix catalogue fabricant
      var priceCatalogue = (Array.isArray(p.priceHistory) && p.priceHistory.length > 0)
        ? p.priceHistory[0].price : '';
      return {
        'Référence'        : p.ref      || '',
        'Nom'              : p.name     || '',
        'Marque'           : p.brand    || '',
        'Famille'          : p.family   || '',
        'Série'            : p.series   || '',
        'Prix catalogue (€)': p.priceCatalogue || priceCatalogue || '',
        'Prix de vente (€)' : p.price   || '',
        'Description'      : stripHtmlTags(p.desc || ''),
      };
    });

    // Construit le tableau avec ligne titre + en-têtes + données
    var d0 = new Date();
    var stamp0 = d0.getFullYear()+'-'+String(d0.getMonth()+1).padStart(2,'0')+'-'+String(d0.getDate()).padStart(2,'0');
    var headers = Object.keys(rows[0]);
    var aoa = [
      ['SPI Engineering — Liste tarif ' + d0.toLocaleDateString('fr-FR')],
      headers
    ].concat(rows.map(function(r){ return headers.map(function(h){ return r[h]; }); }));

    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      {wch:18},{wch:35},{wch:14},{wch:16},{wch:14},
      {wch:20},{wch:18},{wch:50}
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tarifs');

    XLSX.writeFile(wb, 'SPI_tarifs_' + stamp0 + '.xlsx');
    showToast(filtered.length + ' référence(s) exportée(s).', 'ok');
  });

  // ══════════════════════════════════════════════════════════════
  //  IMPORT EXCEL (mise à jour prix + ajout nouvelles réfs)
  // ══════════════════════════════════════════════════════════════
  var xlsxPendingData = [];

  document.getElementById('btnImportXlsx').addEventListener('click', function(){
    hdrMenu.classList.remove('open');
    document.getElementById('fileImportXlsx').click();
  });

  document.getElementById('fileImportXlsx').addEventListener('change', async function(e){
    var file = e.target.files[0];
    if(!file) return;
    try{ await ensureXLSX(); }catch(err){ showToast(err.message, 'err'); return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      try{
        var wb = XLSX.read(ev.target.result, {type:'array'});
        var ws = wb.Sheets[wb.SheetNames[0]];

        // Normalise les clés (insensible à la casse, espaces, accents, caractères spéciaux)
        function norm(s){ return (s||'').toString().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/\s+/g,'').replace(/[()€%]/g,''); }

        // Normalise un prix pour comparaison : retire €, espaces, remplace virgule par point
        function normPrice(s){
          var str = (s||'').toString().trim()
            .replace(/\s/g,'')         // espaces insécables et normaux
            .replace(/€/g,'')           // symbole euro
            .replace(',','.');          // virgule décimale → point
          var n = parseFloat(str);
          return isNaN(n) ? str : n.toFixed(2); // '32' = '32.00' = '32 €' = '32,00 €'
        }

        // Lire toutes les lignes en tableau brut pour détecter la ligne d'en-têtes
        var rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
        if(rawRows.length === 0) throw new Error('Fichier vide');

        // Chercher la ligne d'en-têtes : celle qui contient "Référence" ou "Reference"
        var headerRowIdx = 0;
        for(var hi = 0; hi < Math.min(5, rawRows.length); hi++){
          var rowNorm = rawRows[hi].map(function(c){ return norm(String(c)); });
          if(rowNorm.some(function(c){ return c.includes('ref') || c === 'reference'; })){
            headerRowIdx = hi;
            break;
          }
        }

        // Construire les données à partir de la ligne d'en-têtes
        var headers = rawRows[headerRowIdx];
        var rows = [];
        for(var ri = headerRowIdx + 1; ri < rawRows.length; ri++){
          var row = {};
          headers.forEach(function(h, ci){ row[h] = rawRows[ri][ci] !== undefined ? rawRows[ri][ci] : ''; });
          rows.push(row);
        }

        var COL_REF = null, COL_NEW_PRICE = null, COL_NEW_SELLING = null, COL_CATALOGUE = null;
        var COL_NAME = null, COL_BRAND = null, COL_FAMILY = null;
        var COL_SERIES = null, COL_SUPPLIER = null, COL_DESC = null;
        var COL_PHOTO = null, COL_TAGS = null;

        if(rows.length === 0) throw new Error('Aucune donnée trouvée après les en-têtes.');
        headers.forEach(function(k){
          var n = norm(k);
          if((n.includes('ref') || n === 'reference') && !n.includes('nouveau')) COL_REF = k;
          // "Prix catalogue (€)" → COL_NEW_PRICE (le fabricant modifie cette colonne directement)
          if(n.includes('prixcatalogue') || n.includes('newpricecatalogue') || n.includes('nouveauprixcatalogue')) COL_NEW_PRICE = k;
          // "Prix de vente (€)" → COL_NEW_SELLING (vous modifiez cette colonne)
          if(n.includes('prixdevente') || n.includes('prixvente') || n.includes('newsellingprice') || n.includes('nouveauprixdevente')) COL_NEW_SELLING = k;
          if(n === 'nom' || n === 'name') COL_NAME = k;
          if(n === 'marque' || n === 'brand') COL_BRAND = k;
          if(n === 'famille' || n === 'family') COL_FAMILY = k;
          if(n.includes('serie') || n === 'series') COL_SERIES = k;
          if(n === 'fournisseur' || n === 'supplier') COL_SUPPLIER = k;
          if(n.includes('description') || n === 'desc') COL_DESC = k;
          if(n.includes('photo') || n.includes('urlphoto') || n.includes('image')) COL_PHOTO = k;
          if(n.includes('tag')) COL_TAGS = k;
        });

        if(!COL_REF) throw new Error('Colonne "Référence" introuvable. En-têtes trouvés : ' + headers.join(', '));

        var existingMap = {};
        products.forEach(function(p){ existingMap[p.ref] = p; });

        xlsxPendingData = [];
        var countNew = 0, countUpdate = 0, countNoChange = 0;

        rows.forEach(function(row){
          var ref = (row[COL_REF]||'').toString().trim();
          if(!ref) return;

          var newCataloguePrice = COL_NEW_PRICE   ? normalizePriceFormat((row[COL_NEW_PRICE]  ||'').toString().trim()) : '';
          var newSellingPrice   = COL_NEW_SELLING ? normalizePriceFormat((row[COL_NEW_SELLING]||'').toString().trim()) : '';
          // Compatibilité avec anciens exports (colonne "Nouveau prix (€)" unique)
          var newPrice = newCataloguePrice || newSellingPrice;
          var newName     = COL_NAME      ? (row[COL_NAME]     ||'').toString().trim() : '';
          var newBrand    = COL_BRAND     ? canonicalizeBrand((row[COL_BRAND]||'').toString().trim()) : '';
          var newFamily   = COL_FAMILY    ? (row[COL_FAMILY]   ||'').toString().trim() : '';
          var newSeries   = COL_SERIES    ? (row[COL_SERIES]   ||'').toString().trim() : '';
          var newSupplier = COL_SUPPLIER  ? (row[COL_SUPPLIER] ||'').toString().trim() : '';
          var newDesc     = COL_DESC      ? (row[COL_DESC]     ||'').toString().trim() : '';
          var newPhoto    = COL_PHOTO     ? (row[COL_PHOTO]    ||'').toString().trim() : '';
          var newTags     = COL_TAGS      ? canonicalizeTags((row[COL_TAGS]||'').toString().split(',').map(function(t){return t.trim();}).filter(Boolean)) : [];

          var existing = existingMap[ref];
          var status, oldPrice = '';

          if(!existing){
            // Nouvelle référence
            status = 'new';
            countNew++;
          } else {
            oldPrice = existing.price || '';
            var currentCatForCheck     = normPrice(existing.priceCatalogue || '');
            var currentSellingForCheck = normPrice(existing.price           || '');
            var hasChange = (newCataloguePrice && normPrice(newCataloguePrice) !== currentCatForCheck)
              || (newSellingPrice && normPrice(newSellingPrice) !== currentSellingForCheck)
              || (newName     && newName     !== (existing.name     ||''))
              || (newBrand    && newBrand    !== (existing.brand    ||''))
              || (newFamily   && newFamily   !== (existing.family   ||''))
              || (newSeries   && newSeries   !== (existing.series   ||''))
              || (newSupplier && newSupplier !== (existing.supplier ||''))
              || (newDesc     && newDesc     !== (existing.desc     ||''));
            status = hasChange ? 'update' : 'nochange';
            if(hasChange) countUpdate++; else countNoChange++;
          }

          xlsxPendingData.push({
            ref, status, oldPrice,
            newPrice, newCataloguePrice, newSellingPrice,
            newName, newBrand, newFamily,
            newSeries, newSupplier, newDesc, newPhoto, newTags,
            existing: existing || null
          });
        });

        // Affiche la modale de prévisualisation
        document.getElementById('xlsxImportSummary').textContent =
          countNew + ' nouvelle(s) · ' + countUpdate + ' mise(s) à jour · ' + countNoChange + ' inchangée(s)';
        var hasDirectEditRights = window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin);
        document.getElementById('xlsxImportInfo').textContent = hasDirectEditRights
          ? 'Les lignes sans "Nouveau prix" conservent l\'ancien prix.'
          : 'Les lignes sans "Nouveau prix" conservent l\'ancien prix. Sans droit d\'édition directe, chaque ligne sera envoyée en demande d\'approbation.';
        var btnConfirmXlsxImportEl = document.getElementById('btnConfirmXlsxImport');
        if(btnConfirmXlsxImportEl) btnConfirmXlsxImportEl.textContent = hasDirectEditRights
          ? '✓ Confirmer l\'import'
          : '✓ Envoyer pour approbation';

        var thead = document.getElementById('xlsxPreviewHead');
        var tbody = document.getElementById('xlsxPreviewBody');
        thead.innerHTML = '<tr>' +
          '<th>Statut</th><th>Référence</th><th>Nom</th><th>Marque</th>' +
          '<th>Ancien prix</th><th>Nouveau prix</th>' +
          '</tr>';
        tbody.innerHTML = '';

        xlsxPendingData.forEach(function(item){
          var tr = document.createElement('tr');
          tr.className = 'row-' + item.status;

          var badge = item.status === 'new'
            ? '<span class="badge-new">Nouveau</span>'
            : item.status === 'update'
              ? '<span class="badge-update">Màj</span>'
              : '<span class="badge-nochange">Inchangé</span>';

          var priceCell = item.status === 'update' && item.newPrice
            ? '<span class="price-old">' + escapeHtml(item.oldPrice) + '</span><span class="price-new">' + escapeHtml(item.newPrice) + '</span>'
            : item.status === 'new'
              ? '<span class="price-new">' + escapeHtml(item.newPrice) + '</span>'
              : escapeHtml(item.oldPrice);

          tr.innerHTML =
            '<td>' + badge + '</td>' +
            '<td>' + escapeHtml(item.ref) + '</td>' +
            '<td>' + escapeHtml(item.newName || (item.existing && item.existing.name) || '') + '</td>' +
            '<td>' + escapeHtml(item.newBrand || (item.existing && item.existing.brand) || '') + '</td>' +
            '<td>' + escapeHtml(item.oldPrice) + '</td>' +
            '<td>' + priceCell + '</td>';
          tbody.appendChild(tr);
        });

        document.getElementById('xlsxImportOverlay').style.display = 'flex';
        document.body.classList.add('modal-open');
      } catch(err){
        showToast('Erreur : ' + err.message, 'err', 5000);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });

  // ── Confirmer l'import ────────────────────────────────────────
  document.getElementById('btnConfirmXlsxImport').addEventListener('click', async function(){
    var now = new Date().toISOString();
    var added = 0, updated = 0;
    var touchedByXlsx = [];

    // ── Sans droit d'édition directe : chaque ligne part en demande ──
    // (jamais d'écriture directe au catalogue pour ces utilisateurs)
    var hasDirectEditRights = window._userPerms && (window._userPerms.canEdit || window._userPerms.isAdmin);
    if(!hasDirectEditRights){
      if(typeof window.reqSubmit !== 'function'){
        showToast('Serveur de demandes non configuré — import impossible sans droit d\'édition directe.', 'err', 5000);
        return;
      }
      var btnConfirm = this;
      btnConfirm.disabled = true;
      var toSubmit = xlsxPendingData.filter(function(item){ return item.status !== 'nochange'; });
      var submitted = 0, failed = 0;
      await Promise.all(toSubmit.map(async function(item){
        var payload, original;
        if(item.status === 'new'){
          var initHistory = [];
          var initPrice = '';
          if(item.newCataloguePrice && item.newSellingPrice){
            initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
            initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
            initPrice = item.newSellingPrice;
          } else if(item.newCataloguePrice){
            initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
            initPrice = item.newCataloguePrice;
          } else if(item.newSellingPrice){
            initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
            initPrice = item.newSellingPrice;
          } else if(item.newPrice){
            initHistory.push({price: item.newPrice, date: now});
            initPrice = item.newPrice;
          }
          payload = {
            ref: item.ref, name: item.newName, brand: item.newBrand, family: item.newFamily,
            series: item.newSeries, supplier: item.newSupplier, desc: item.newDesc,
            photo: item.newPhoto, tags: item.newTags, price: initPrice,
            priceCatalogue: item.newCataloguePrice || '', priceHistory: initHistory
          };
          original = null;
        } else {
          var existingP = item.existing;
          payload = Object.assign({}, existingP, {
            name:     item.newName     || existingP.name,
            brand:    item.newBrand    || existingP.brand,
            family:   item.newFamily   || existingP.family,
            series:   item.newSeries   || existingP.series,
            supplier: item.newSupplier || existingP.supplier,
            desc:     item.newDesc     || existingP.desc,
            photo:    item.newPhoto    || existingP.photo,
            tags:     (item.newTags && item.newTags.length) ? item.newTags : existingP.tags,
            price:          item.newSellingPrice   || existingP.price,
            priceCatalogue: item.newCataloguePrice || existingP.priceCatalogue
          });
          original = existingP;
        }
        var ok = await window.reqSubmit(payload, original);
        if(ok) submitted++; else failed++;
      }));
      btnConfirm.disabled = false;
      window._closeXlsxImportOverlay();
      if(submitted){
        showToast(submitted + ' demande(s) envoyée(s) pour approbation' + (failed ? ', ' + failed + ' échec(s)' : ''), failed ? 'warn' : 'ok', 4500);
      } else {
        showToast('Erreur lors de l\'envoi des demandes', 'err', 4000);
      }
      xlsxPendingData = [];
      return;
    }

    xlsxPendingData.forEach(function(item){
      if(item.status === 'nochange') return;

      if(item.status === 'new'){
        // Construire l'historique initial pour un nouveau produit
        var initHistory = [];
        var initPrice = '';
        if(item.newCataloguePrice && item.newSellingPrice){
          // Prix catalogue en historique, prix de vente = prix affiché
          initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
          initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
          initPrice = item.newSellingPrice;
        } else if(item.newCataloguePrice){
          initHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue'});
          initPrice = item.newCataloguePrice;
        } else if(item.newSellingPrice){
          initHistory.push({price: item.newSellingPrice, date: now, label: 'Prix de vente'});
          initPrice = item.newSellingPrice;
        } else if(item.newPrice){
          initHistory.push({price: item.newPrice, date: now});
          initPrice = item.newPrice;
        }
        var p = {
          id       : 'p_' + Date.now() + '_' + _secureRandomBase36(6),
          ref      : item.ref,
          name     : item.newName,
          brand    : item.newBrand,
          family   : item.newFamily,
          series   : item.newSeries,
          supplier : item.newSupplier,
          desc     : item.newDesc,
          photo    : item.newPhoto,
          tags     : item.newTags,
          price    : initPrice,
          priceHistory: initHistory,
        };
        products.push(p);
        added++;
        touchedByXlsx.push(p);
      } else {
        // Mise à jour
        var p = item.existing;
        if(item.newName)     p.name     = item.newName;
        if(item.newBrand)    p.brand    = item.newBrand;
        if(item.newFamily)   p.family   = item.newFamily;
        if(item.newSeries)   p.series   = item.newSeries;
        if(item.newSupplier) p.supplier = item.newSupplier;
        if(item.newDesc)     p.desc     = item.newDesc;
        if(item.newPhoto)    p.photo    = item.newPhoto;
        if(item.newTags && item.newTags.length) p.tags = item.newTags;

        // S'assurer que l'historique existe
        if(!Array.isArray(p.priceHistory)) p.priceHistory = [];

        // Normalise un prix pour comparaison fiable (gère '32 €' vs '32' vs '32,00 €')
        function normPriceConfirm(s){
          var str = (s||'').toString().trim().replace(/\s/g,'').replace(/€/g,'').replace(',','.');
          var n = parseFloat(str);
          return isNaN(n) ? str : n.toFixed(2);
        }

        // Prix catalogue a changé ?
        var catChanged     = item.newCataloguePrice &&
          normPriceConfirm(item.newCataloguePrice) !== normPriceConfirm(p.priceCatalogue || '');
        // Prix de vente a changé ?
        var sellingChanged = item.newSellingPrice &&
          normPriceConfirm(item.newSellingPrice) !== normPriceConfirm(p.price || '');

        if(catChanged){
          p.priceCatalogue = item.newCataloguePrice;
          p.priceHistory.push({price: item.newCataloguePrice, date: now, label: 'Prix catalogue fabricant'});
        }
        if(sellingChanged){
          p.price = item.newSellingPrice;
          p.priceHistory.push({price: item.newSellingPrice, date: now, label: 'Votre prix'});
        }
        p.updatedAt = Date.now();
        touchedByXlsx.push(p);
        updated++;
      }
    });

    // touchedByXlsx (jamais tout le catalogue) : seuls les produits
    // effectivement ajoutés/modifiés par cet import Excel ont changé — voir
    // les autres correctifs de ce type dans ce fichier.
    save(false, touchedByXlsx); render();
    // Même correctif que pour l'enregistrement d'un produit : rafraîchir
    // aussi la home si l'import a été lancé depuis là (compteur figé sinon
    // jusqu'à un F5 — retour utilisateur).
    var homePageEl2 = document.getElementById('homePage');
    if(homePageEl2 && !homePageEl2.classList.contains('hidden')) renderHome();
    window._closeXlsxImportOverlay();
    showToast(added + ' ajouté(s), ' + updated + ' mis à jour.', 'ok', 4000);
    xlsxPendingData = [];
  });

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

  // selectedFamilyIcon et familyIconRow sont déclarés dans js/modal.js (chargé
  // avant celui-ci) et partagés avec le formulaire produit — voir le
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

  // ══════════════════════════════════════════════════════════════════
  //  GESTION DES CONFLITS DE SYNC
  // ══════════════════════════════════════════════════════════════════
  var CONFLICT_THRESHOLD = 3600000; // 1h en ms
  var _pendingConflicts  = [];
  var _conflictChoices   = {};
  var _selectedConflict  = null;

  var FIELD_LABELS = {
    ref:'Référence', name:'Nom', brand:'Marque', family:'Famille',
    series:'Série', supplier:'Fournisseur', price:'Prix', priceCatalogue:'Prix catalogue',
    desc:'Description', url:'URL', photo:'Photo', tags:'Tags',
    createdAt:'Créé le', updatedAt:'Modifié le', priceHistory:'Historique des prix'
  };

  function formatFieldValue(key, val){
    if(val === undefined || val === null || val === '') return '<em style="color:var(--ink-soft)">—</em>';
    if(key === 'createdAt' || key === 'updatedAt') return new Date(val).toLocaleString('fr-FR');
    if(key === 'priceHistory' && Array.isArray(val)){
      if(val.length === 0) return '<em style="color:var(--ink-soft)">Aucun</em>';
      return val.map(function(h){ return new Date(h.date).toLocaleDateString('fr-FR')+' → '+(typeof _displayPrice==='function'?_displayPrice(h.price):h.price); }).join('<br>');
    }
    // Prix affichés au même format que partout ailleurs dans l'app (virgule
    // + €, via _displayPrice() dans render.js) plutôt que la valeur brute
    // stockée — qui peut être au format point + "EUR" selon la source
    // (retour utilisateur, capture à l'appui : "154.50 EUR" dans la fenêtre
    // de conflits alors que le reste de l'app affiche "154,50 €").
    if((key === 'price' || key === 'priceCatalogue') && typeof _displayPrice === 'function'){
      return escapeHtml(String(_displayPrice(val)));
    }
    if(Array.isArray(val)) return val.join(', ') || '<em style="color:var(--ink-soft)">—</em>';
    if(typeof val === 'boolean') return val ? 'Oui' : 'Non';
    return escapeHtml(String(val));
  }

  window.openConflictModal = function openConflictModal(conflicts){
    _pendingConflicts = conflicts;
    _conflictChoices  = {};
    _selectedConflict = null;
    conflicts.forEach(function(c){ _conflictChoices[c.ref] = 'local'; });
    var overlay = document.getElementById('conflictOverlay');
    if(!overlay){ console.warn('conflictOverlay introuvable'); return; }
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.getElementById('conflictSubtitle').textContent =
      conflicts.length + ' produit(s) en conflit (modifié des deux côtés dans la même heure)';
    renderConflictList();
    if(conflicts.length > 0) selectConflict(conflicts[0].ref);
  }

  function renderConflictList(){
    var list = document.getElementById('conflictList');
    if(!list) return;
    list.innerHTML = _pendingConflicts.map(function(c){
      var choice = _conflictChoices[c.ref] || 'local';
      var isSel  = _selectedConflict === c.ref;
      return '<div class="conflict-item'+(isSel?' selected':'')+'" data-ref="'+escapeHtml(c.ref)+'" style="cursor:pointer;">'
        +'<div style="font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escapeHtml(c.ref)+'</div>'
        +'<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">'+escapeHtml((c.local.name||c.local.ref||''))+'</div>'
        +'<div style="margin-top:5px;display:flex;gap:4px;">'
        +'<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:'+(choice==='local'?'#194093':'var(--surface-1)')+';color:'+(choice==='local'?'#fff':'var(--ink-soft)')+';">Local</span>'
        +'<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:'+(choice==='server'?'#194093':'var(--surface-1)')+';color:'+(choice==='server'?'#fff':'var(--ink-soft)')+';">Serveur</span>'
        +'</div></div>';
    }).join('');
    list.querySelectorAll('.conflict-item').forEach(function(el){
      el.addEventListener('click', function(){ selectConflict(el.getAttribute('data-ref')); });
    });
  }

  function selectConflict(ref){
    _selectedConflict = ref;
    renderConflictList();
    renderConflictDetail(ref);
  }

  function renderConflictDetail(ref){
    var c = _pendingConflicts.find(function(x){ return x.ref === ref; });
    if(!c) return;
    var choice  = _conflictChoices[ref] || 'local';
    var detail  = document.getElementById('conflictDetail');
    if(!detail) return;
    // Même liste d'exclusion que withoutServerFields() plus haut — sinon ces
    // champs (jamais responsables du conflit lui-même) apparaissaient quand
    // même dans le tableau avec un "≠", laissant croire à tort qu'ils en
    // étaient la cause (retour utilisateur : "la raison c'est hasDoc
    // _docFiles docFilename" — alors qu'un vrai conflit se déclenchait sur
    // un autre champ, ces trois-là étant juste incidemment différents aussi).
    var allKeys = Object.keys(Object.assign({}, c.local, c.server))
      .filter(function(k){
        return ['id','familyIcon','updatedAt','createdAt','suggestions','suggestionsHidden','spareParts','sparePartsHidden','hasDoc','docFilename','_docFiles'].indexOf(k) === -1;
      });
    var rowsHtml = allKeys.map(function(key){
      var lv     = c.local[key];
      var sv     = c.server[key];
      var differ = JSON.stringify(lv) !== JSON.stringify(sv);
      return '<tr style="background:'+(differ?'#FEF9EC':'transparent')+';">'
        +'<td style="padding:8px 12px;font-size:12px;font-weight:600;color:var(--ink-soft);white-space:nowrap;border-bottom:1px solid var(--line);vertical-align:top;">'+(FIELD_LABELS[key]||key)+'</td>'
        +'<td style="padding:8px 12px;font-size:13px;border-bottom:1px solid var(--line);vertical-align:top;'+(differ&&choice==='local'?'background:#EEF4FF;':'')+'">'+formatFieldValue(key,lv)+'</td>'
        +'<td style="padding:8px 12px;font-size:13px;border-bottom:1px solid var(--line);vertical-align:top;'+(differ&&choice==='server'?'background:#EEF4FF;':'')+'">'+formatFieldValue(key,sv)+'</td>'
        +'<td style="padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:14px;color:#B45309;">'+(differ?'≠':'')+'</td>'
        +'</tr>';
    }).join('');
    detail.innerHTML = '<div style="margin-bottom:14px;display:flex;gap:10px;">'
      +'<button id="chooseLocal" style="flex:1;padding:9px;border-radius:8px;border:2px solid '+(choice==='local'?'#194093':'var(--line)')+';background:'+(choice==='local'?'#EEF4FF':'var(--paper-card)')+';font-size:13px;font-weight:600;cursor:pointer;color:'+(choice==='local'?'#194093':'var(--ink)')+';font-family:inherit;">✓ Garder ma version (locale)</button>'
      +'<button id="chooseServer" style="flex:1;padding:9px;border-radius:8px;border:2px solid '+(choice==='server'?'#194093':'var(--line)')+';background:'+(choice==='server'?'#EEF4FF':'var(--paper-card)')+';font-size:13px;font-weight:600;cursor:pointer;color:'+(choice==='server'?'#194093':'var(--ink)')+';font-family:inherit;">↓ Prendre la version serveur</button>'
      +'</div>'
      +'<table style="width:100%;border-collapse:collapse;">'
      +'<thead><tr>'
      +'<th style="padding:8px 12px;font-size:12px;color:var(--ink-soft);text-align:left;border-bottom:2px solid var(--line);width:130px;">Champ</th>'
      +'<th style="padding:8px 12px;font-size:12px;text-align:left;border-bottom:2px solid var(--line);"><i class="ti ti-device-mobile"></i> Version locale</th>'
      +'<th style="padding:8px 12px;font-size:12px;text-align:left;border-bottom:2px solid var(--line);"><i class="ti ti-cloud"></i> Version serveur</th>'
      +'<th style="width:24px;border-bottom:2px solid var(--line);"></th>'
      +'</tr></thead><tbody>'+rowsHtml+'</tbody></table>';
    detail.querySelector('#chooseLocal').addEventListener('click', function(){
      _conflictChoices[ref] = 'local'; renderConflictList(); renderConflictDetail(ref);
    });
    detail.querySelector('#chooseServer').addEventListener('click', function(){
      _conflictChoices[ref] = 'server'; renderConflictList(); renderConflictDetail(ref);
    });
  }

  function closeConflictModal(){
    var overlay = document.getElementById('conflictOverlay');
    document.body.classList.remove('modal-open');
    if(overlay){
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(overlay, function(){ overlay.style.display = 'none'; });
      } else {
        overlay.style.display = 'none';
      }
    }
  }

  function applyConflictChoices(){
    // Map plutôt qu'objet nu — voir doCheckAllSync() plus haut.
    var localMap = new Map();
    products.forEach(function(p, i){ if(p.ref) localMap.set(p.ref, i); });
    var touchedByConflict = [];
    _pendingConflicts.forEach(function(c){
      if((_conflictChoices[c.ref] || 'local') === 'server'){
        var idx = localMap.get(c.ref);
        if(idx !== undefined){ products[idx] = c.server; touchedByConflict.push(products[idx]); }
      }
    });
    // touchedByConflict (jamais tout le catalogue) : seuls les produits où
    // le choix "remplacer par la version importée" a été fait ont
    // réellement changé — voir les autres correctifs de ce type dans ce
    // fichier (syncFromServer, pushToServer, compare-save-btn).
    save(true, touchedByConflict); render(); renderHome();
    closeConflictModal();
    showToast('Conflits résolus ✓', 'ok', 2500);
  }

  // Listeners modale conflit
  (function initConflictModal(){
    var closeBtn   = document.getElementById('conflictCloseBtn');
    var applyBtn   = document.getElementById('conflictApplyBtn');
    var allLocal   = document.getElementById('conflictKeepAllLocal');
    var allServer  = document.getElementById('conflictKeepAllServer');
    var overlay    = document.getElementById('conflictOverlay');
    if(closeBtn)  closeBtn.addEventListener('click', closeConflictModal);
    if(applyBtn)  applyBtn.addEventListener('click', applyConflictChoices);
    if(allLocal)  allLocal.addEventListener('click', function(){
      _pendingConflicts.forEach(function(c){ _conflictChoices[c.ref] = 'local'; });
      renderConflictList(); if(_selectedConflict) renderConflictDetail(_selectedConflict);
    });
    if(allServer) allServer.addEventListener('click', function(){
      _pendingConflicts.forEach(function(c){ _conflictChoices[c.ref] = 'server'; });
      renderConflictList(); if(_selectedConflict) renderConflictDetail(_selectedConflict);
    });
    if(overlay)   overlay.addEventListener('click', function(e){ if(e.target===overlay) closeConflictModal(); });
  })();
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
      show('msExportXlsx', canExport);
      show('msImportXlsx', canExport || canPropose);
      show('msCleanDescs', isAdmin);
      show('msCompare',    true);
      show('msRequests',   loggedIn && !!sUrl);
      // Signaler un bug : ouvert à TOUT utilisateur connecté avec serveur
      // (pas seulement les admins) — un bug peut être trouvé par n'importe
      // qui, même sans droit d'édition. Miroir exact de btnReportBug côté
      // desktop (js/auth.js). Réactivé — voir commentaire équivalent dans
      // js/auth.js (API dédiée aux bugs en place côté serveur).
      show('msReportBug',  loggedIn && !!sUrl);

      // Sous-titres adaptés à la conséquence réelle pour CET utilisateur
      // (retour utilisateur) — miroir exact de js/auth.js côté desktop.
      var msImportXlsxSub = document.getElementById('msImportXlsxSub');
      if(msImportXlsxSub) msImportXlsxSub.textContent = canExport ? 'Mise à jour des prix' : 'Propose une mise à jour (validation admin)';
      var msRequestsSub = document.getElementById('msRequestsSub');
      if(msRequestsSub) msRequestsSub.textContent = isAdmin ? 'Modifications proposées' : 'Suivi de vos demandes';
      // Miroir exact de btnSettingsSub côté desktop (js/auth.js).
      var msSettingsSub = document.getElementById('msSettingsSub');
      if(msSettingsSub) msSettingsSub.textContent = isAdmin ? 'Icônes des familles, Serveur' : 'Mon compte, Serveur';

      // Cacher sections vides
      function allHidden(ids){ return ids.every(function(id){ var el=document.getElementById(id); return !el||el.style.display==='none'; }); }
      var dataIds=['msExport','msImport','msExportXlsx','msImportXlsx'];
      var toolIds=['msCompare','msCleanDescs'];
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