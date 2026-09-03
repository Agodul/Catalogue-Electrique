// Badges compacts (Essentiel / 3DEXPERIENCE) pour les listes à vignette
// réduite (recherche du configurateur d'armoire, Suggestions, Pièces de
// rechange) — les badges pleine taille (.essential-badge/.three-d-overlay,
// voir plus bas) sont conçus pour les grandes photos de la grille catalogue
// et de la fiche produit, disproportionnés sur une vignette de 32-44px
// (retour utilisateur : les rendre visibles aussi dans ces listes plus
// compactes). Insérés en ligne à côté de la référence plutôt qu'en overlay
// sur la vignette. Global (pas d'IIFE dans ce fichier) : appelé aussi
// depuis js/armoireConfig.js.
function _productBadgesCompactHtml(p){
  var html = '';
  if(p.essential) html += '<i class="ti ti-star-filled" title="Produit essentiel" style="color:var(--copper);font-size:11px;margin-left:5px;vertical-align:middle;"></i>';
  if(p.available3DX) html += '<img src="assets/three-d-badge.png" alt="3DEX" title="Disponible dans la 3DEXPERIENCE" style="width:13px;height:13px;margin-left:4px;vertical-align:middle;">';
  return html;
}

// ---------- Modale de consultation ----------
// Gabarit de #viewModal généré ici plutôt qu'écrit en dur dans index.html
// (retour utilisateur : "corrigé le problème de code html trop imposant...
// lorsqu'on clique sur un produit un code js génère la page"). Doit
// s'exécuter AVANT les récupérations par id "vm..." juste en dessous :
// scripts classiques chargés avec defer, donc exécutés dans l'ordre des
// balises <script> d'index.html — ce fichier est le premier de la chaîne à
// référencer #viewModal, l'injection ici garantit que ces éléments
// existent déjà au moment où ce même fichier les capture plus bas. Le
// contenu de chaque produit (texte, photo...) reste rempli par openView()
// plus bas dans ce fichier, comme avant — seule la coquille (structure,
// ids, classes) a changé d'endroit.
(function _vmInjectTemplate(){
  var root = document.getElementById('viewModal');
  if(!root) return;
  root.innerHTML =
    '<div class="vm-inner">' +
      '<div class="vm-photo" id="vmPhoto"><span class="ph-placeholder">Pas de photo</span></div>' +
      '<button class="vm-close-btn" id="vmCloseBtn" title="Fermer">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>' +
      '<button class="vm-info-btn" id="vmInfoBtn" title="Actions">i</button>' +
      '<div class="vm-info-menu" id="vmInfoMenu">' +
        '<button id="vmEditBtn">Modifier la fiche</button>' +
        '<button id="vmProposeMenuBtn" style="display:none;">Proposer une modification</button>' +
        '<hr>' +
        '<button id="vmDeleteBtn" class="danger">Supprimer le produit</button>' +
      '</div>' +
      '<div class="vm-scroll">' +
        '<div class="vm-body">' +
          '<div class="vm-ref" id="vmRef"></div>' +
          '<div class="vm-name" id="vmName"></div>' +
          '<div class="vm-tags" id="vmTags"></div>' +
          '<div class="vm-meta" id="vmMeta"></div>' +
          '<div class="vm-desc" id="vmDesc"></div>' +
          '<div class="vm-price-row"><div class="vm-price" id="vmPrice"></div></div>' +
          '<div id="vmPriceLabel" style="font-size:13px;color:var(--ink-soft);margin-bottom:8px;font-family:var(--font-sans);"></div>' +
          '<div class="vm-price-history" id="vmPriceHistory"></div>' +
          '<div class="vm-actions-row">' +
            '<div id="vmDocBtnWrap" class="vm-action-wrap" style="display:none;">' +
              '<button id="vmDocBtn" class="vm-action-btn" title="Documents">' +
                // Icône générique de document (même icône que le titre de la
                // modale "Documents produit" elle-même, voir docOverlay dans
                // js/templates.js) plutôt que le logo PDF — retour
                // utilisateur : les documents ne sont pas tous des PDF.
                '<i class="ti ti-files" style="font-size:19px;"></i>' +
              '</button>' +
            '</div>' +
            '<div id="vmSuggestionsSection" class="vm-action-wrap" style="display:none;">' +
              '<button id="vmSuggestionsToggle" class="vm-action-btn" title="Afficher suggestions">' +
                '<i class="ti ti-bulb" style="font-size:19px;"></i>' +
                '<span id="vmSuggestionsToggleLabel" class="vm-action-badge"></span>' +
              '</button>' +
            '</div>' +
            '<div id="vmSpecsSection" class="vm-action-wrap" style="display:none;">' +
              '<button id="vmSpecsToggle" class="vm-action-btn" title="Voir les caractéristiques">' +
                '<i class="ti ti-list-details" style="font-size:19px;"></i>' +
                '<span id="vmSpecsToggleLabel" class="vm-action-badge"></span>' +
              '</button>' +
            '</div>' +
            '<div id="vmSparePartsSection" class="vm-action-wrap" style="display:none;">' +
              '<button id="vmSparePartsToggle" class="vm-action-btn" title="Voir les pièces de rechange">' +
                '<i class="ti ti-tool" style="font-size:19px;"></i>' +
                '<span id="vmSparePartsToggleLabel" class="vm-action-badge"></span>' +
              '</button>' +
            '</div>' +
            '<div id="vmAddToConfigWrap" class="vm-action-wrap" style="display:none;">' +
              '<button id="vmAddToConfigBtn" class="vm-action-btn" title="Ajouter à la configuration">' +
                // "+" plutôt que list-check (retour utilisateur) — même
                // icône que les autres actions d'ajout du configurateur
                // d'armoire (ex. "Insérer" un bloc, "Ajouter un
                // fournisseur", voir armoireConfig.js/index.html), plus
                // immédiatement lisible comme "ajouter" que la coche.
                '<i id="vmAddToConfigIcon" class="ti ti-plus" style="font-size:19px;"></i>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
})();

  var viewOverlay  = document.getElementById('viewOverlay');
  var vmPhoto      = document.getElementById('vmPhoto');
  var vmRef        = document.getElementById('vmRef');
  var vmName       = document.getElementById('vmName');
  var vmTags       = document.getElementById('vmTags');
  var vmMeta       = document.getElementById('vmMeta');
  var vmDesc       = document.getElementById('vmDesc');
  var vmPrice      = document.getElementById('vmPrice');
  var vmPriceHistory = document.getElementById('vmPriceHistory');
  var vmInfoBtn    = document.getElementById('vmInfoBtn');
  var vmCloseBtn   = document.getElementById('vmCloseBtn');
  var vmInfoMenu   = document.getElementById('vmInfoMenu');
  var viewingId    = null;
  var _viewHistory = []; // pile pour retour suggestion → parent
  var _sugOpen     = false; // mémorise si le carrousel suggestions est ouvert

  // ── Copier la référence (délégué une seule fois, le contenu de vmMeta est régénéré à chaque ouverture) ──
  function copyToClipboard(text){
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(text);
    }
    // Repli pour contextes non sécurisés / anciens navigateurs
    return new Promise(function(resolve, reject){
      try{
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand a échoué'));
      }catch(e){ reject(e); }
    });
  }
  if(vmMeta){
    vmMeta.addEventListener('click', function(e){
      var btn = e.target.closest ? e.target.closest('.vm-copy-btn') : null;
      if(!btn) return;
      var ref = btn.getAttribute('data-copy') || '';
      copyToClipboard(ref).then(function(){
        showToast('Référence copiée ✓', 'ok', 1800);
        btn.classList.add('copied');
        setTimeout(function(){ btn.classList.remove('copied'); }, 1200);
      }).catch(function(){
        showToast('Impossible de copier la référence', 'err', 2500);
      });
    });
  }

  function buildPriceHistoryReadonly(product){
    if(!product || !Array.isArray(product.priceHistory) || product.priceHistory.length === 0) return '';
    var entries = product.priceHistory.map(function(h){ return {price:h.price, date:h.date}; });
    entries.push({price:product.price||'', date:null, current:true});
    var rows = '';
    var firstDate = entries[0].date ? new Date(entries[0].date).toLocaleDateString('fr-FR') : 'Premier prix';
    rows += '<tr><td class="ph-date">'+escapeHtml(firstDate)+'</td><td class="ph-price">'+escapeHtml(entries[0].price||'—')+'</td><td class="ph-delta"></td></tr>';
    for(var i=1;i<entries.length;i++){
      var prev = parsePriceNumber(entries[i-1].price);
      var cur  = parsePriceNumber(entries[i].price);
      var deltaHtml = '';
      if(prev!==null && cur!==null && prev!==0){
        var pct = ((cur-prev)/prev)*100;
        var sign = pct>=0 ? '+' : '';
        var cls  = pct>0 ? 'up' : (pct<0 ? 'down' : '');
        deltaHtml = '<span class="ph-delta '+cls+'">'+sign+pct.toFixed(1)+' %</span>';
      }
      var dl = entries[i].current ? 'Prix actuel' : (entries[i].date ? new Date(entries[i].date).toLocaleDateString('fr-FR') : '—');
      rows += '<tr'+(entries[i].current?' class="ph-current"':'')+'>'+
        '<td class="ph-date">'+escapeHtml(dl)+'</td>'+
        '<td class="ph-price">'+escapeHtml(entries[i].price||'—')+'</td>'+
        '<td class="ph-delta">'+deltaHtml+'</td>'+
      '</tr>';
    }
    return '<div class="ph-title" style="margin-top:0">Historique des prix</div>'+
           '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'+rows+'</table>';
  }

  function openView(id){
    var p = products.find(function(x){return x.id===id;});
    if(!p) return;
    viewingId = id;
    window._viewingId = id; // exposé pour requests.js
    vmInfoMenu.classList.remove('open');
    // Retire un éventuel verrou de hauteur posé par "Voir plus" sur la
    // fiche précédente (voir plus bas) — sans ça, ouvrir un nouveau produit
    // hériterait de la hauteur figée du précédent au lieu de s'ajuster à
    // son propre contenu.
    var vmModalEl = document.getElementById('viewModal');
    if(vmModalEl) vmModalEl.style.height = '';

    // Photo — badges Essentiel/3DEXPERIENCE (retour utilisateur : aussi
    // visibles sur la fiche produit, pas seulement sur la carte catalogue).
    // Construits à part et ajoutés APRÈS coup (pas dans le même innerHTML
    // que la photo lorsqu'elle réussit) : l'ancien onerror remplaçait tout
    // le innerHTML du conteneur en cas d'échec de chargement, ce qui aurait
    // aussi effacé les badges — onerror cible maintenant l'<img> lui-même
    // (outerHTML), pas son parent.
    var vmBadgesHtml = (p.available3DX ? '<div class="three-d-overlay" title="Disponible dans la 3DEXPERIENCE"><img src="assets/three-d-badge.png" alt="3DEX"></div>' : '')
      + (p.essential ? '<div class="essential-badge" title="Produit essentiel"><i class="ti ti-star-filled"></i> Standard</div>' : '');
    if(p.photo){
      // Pas de loading="lazy" (retiré, même raison que render-card-grid.js) :
      // sur une fiche produit, la photo est la seule/l'unique image affichée
      // et déjà visible dès l'ouverture — la charger en différé n'apportait
      // aucun bénéfice, seulement un léger délai avant apparition.
      vmPhoto.innerHTML = '<img src="'+escapeHtml(p.photo)+'" alt="'+escapeHtml(p.name||p.ref)+'" style="width:100%;height:100%;object-fit:contain;transform:scale(1.12);display:block;" data-fallback="replace-self">' + vmBadgesHtml;
    }else{
      vmPhoto.innerHTML = '<span class="ph-placeholder">Pas de photo</span>' + vmBadgesHtml;
    }

    vmRef.textContent  = p.brand ? p.brand+' — '+( p.ref||'') : (p.ref||'');
    vmName.textContent = p.name || '(Sans nom)';

    // Tags
    // Tags stored for search only; not shown in the product detail modal.
    vmTags.innerHTML = '';
    vmTags.style.display = 'none';

    // Méta-infos
    var metaItems = [];
    if(p.brand)    metaItems.push(['Marque',     p.brand]);
    if(p.ref)      metaItems.push(['Référence',  p.ref]);
    if(p.family)   metaItems.push(['Famille',    p.family]);
    if(p.series)   metaItems.push(['Série',      p.series]);
    if(p.supplier) metaItems.push(['Fournisseur',p.supplier]);
    if(p.leadTime) metaItems.push(['Délai',p.leadTime]);
    if(p.available3DX) metaItems.push(['3DEXPERIENCE', '<span class="three-d-badge" title="Disponible dans la 3DEXPERIENCE"><img src="assets/three-d-badge.png" alt="3DEX" /></span>']);
    if(p.url)      metaItems.push(['URL',        p.url]);
    vmMeta.innerHTML = metaItems.map(function(m){
      var val;
      if(m[0] === 'URL'){
        val = (typeof window._isSafeHttpUrl === 'function' && !window._isSafeHttpUrl(m[1]))
          ? escapeHtml(m[1])
          : '<a href="'+escapeHtml(m[1])+'" target="_blank" rel="noopener noreferrer" style="color:var(--copper-deep)">Ouvrir la page</a>';
      } else if(m[0] === '3DEXPERIENCE'){
        var _link3dSafe = p.available3DXLink && (typeof window._isSafeHttpUrl !== 'function' || window._isSafeHttpUrl(p.available3DXLink));
        val = _link3dSafe
          ? '<a href="'+escapeHtml(p.available3DXLink)+'" target="_blank" rel="noopener noreferrer" class="three-d-badge" title="Disponible dans la 3DEXPERIENCE">'+m[1]+'</a>'
          : m[1];
      } else if(m[0] === 'Référence'){
        val = '<span class="vm-ref-copy">'
          + '<span>'+escapeHtml(m[1])+'</span>'
          + '<button type="button" class="vm-copy-btn" data-copy="'+escapeHtml(m[1])+'" title="Copier la référence" aria-label="Copier la référence"><i class="ti ti-copy" aria-hidden="true"></i><i class="ti ti-check" aria-hidden="true"></i></button>'
          + '</span>';
      } else {
        val = '<span>'+escapeHtml(m[1])+'</span>';
      }
      return '<div class="vm-meta-item"><label>'+escapeHtml(m[0])+'</label>'+val+'</div>';
    }).join('');
    vmMeta.style.display = metaItems.length ? '' : 'none';

    // Description avec troncature + "Voir plus" / "Voir moins" (mobile et desktop)
    // Tags HTML retirés comme sur la carte catalogue (renderCard) — sans ça,
    // une description contenant du HTML collé par erreur affichait les
    // balises en clair ici alors que la carte les nettoyait déjà (retour
    // utilisateur : incohérence entre les deux vues).
    var fullDesc = stripHtmlTags(p.desc || '').trim();
    var isMobile = window.innerWidth <= 640;
    var CHAR_LIMIT = isMobile ? 160 : 300;
    vmDesc.style.display = fullDesc ? '' : 'none';

    if(fullDesc.length > CHAR_LIMIT){
      var truncated = fullDesc.slice(0, fullDesc.lastIndexOf(' ', CHAR_LIMIT) || CHAR_LIMIT);
      var _shortText = truncated;
      var _fullText  = fullDesc;
      vmDesc.innerHTML = escapeHtml(truncated)
        + '<span class="vm-desc-toggle" role="button" tabindex="0"> Voir plus</span>';
      var _span = vmDesc.querySelector('.vm-desc-toggle');
      if(_span){ _span.dataset.full = _fullText; _span.dataset.short = _shortText; _span.dataset.expanded = 'false'; }
    } else {
      vmDesc.textContent = fullDesc;
    }

    // Prix + badge hausse + prix d'origine barré + remise
    var jumpPct = getLastPriceJumpPct(p);
    var badge = jumpPct!==null && jumpPct>=PRICE_ALERT_THRESHOLD
      ? ' <span class="price-jump-badge price-jump-badge-lg"><i class="ti ti-alert-triangle"></i> +'+jumpPct.toFixed(0)+'%</span>' : '';
    var orig = getOriginalPrice(p);
    var discPct = getDiscountPct(p);
    var discBadgeVm = discPct !== null && discPct < 0
      ? ' <span class="discount-badge discount-badge-lg">-'+Math.abs(discPct).toFixed(0)+' %</span>'
      : '';
    vmPrice.innerHTML = (orig ? '<span class="vm-price-original" title="Prix catalogue fabricant">'+escapeHtml(_displayPrice(orig))+'</span>' : '')+
                        escapeHtml(_displayPrice(p.price)||'—')+discBadgeVm+badge;
    // Ligne explicite catalogue vs votre prix
    var vmPriceLabelEl = document.getElementById('vmPriceLabel');
    if(vmPriceLabelEl) vmPriceLabelEl.innerHTML = '';

    vmPriceHistory.innerHTML = buildPriceHistoryReadonly(p);

    // ── Bouton Document (visible pour tous) ────────────────────────
    var vmDocBtn     = document.getElementById('vmDocBtn');
    var vmDocBtnWrap = document.getElementById('vmDocBtnWrap');
    var sUrlDoc      = localStorage.getItem('cat_server_url');
    if(vmDocBtnWrap) vmDocBtnWrap.style.display = (p.hasDoc && sUrlDoc) ? '' : 'none';
    if(vmDocBtn) vmDocBtn.onclick = function(){ window._openDocModal(p, sUrlDoc); };
    // ── Fin bouton Document ─────────────────────────────────────────

    // ── Bouton "Ajouter à la configuration" ─────────────────────────
    // Retour utilisateur (1) : "ajouter un bouton [...] lorsqu'on a une
    // configuration en cours" — visible à l'origine uniquement s'il y avait
    // déjà quelque chose dans le brouillon (_armoireDraft, voir
    // js/armoireConfig.js). Retour utilisateur (2), ensuite : "accéder à la
    // configuration en cours ou même pouvoir en créer une" — la condition
    // "déjà un brouillon non vide" empêchait justement de DÉMARRER une
    // configuration depuis une fiche produit (le tout premier ajout n'avait
    // alors aucun bouton pour le déclencher). _armoireAddToDraft gère déjà
    // nativement un brouillon vide (push le 1er item), donc plus besoin de
    // cette condition — le bouton crée la configuration à la volée si
    // besoin. Un 2nd bouton "ouvrir le configurateur complet" a été ajouté
    // ici un temps, puis retiré (retour utilisateur (3) : "je veux
    // seulement le bouton ajouter à la configuration [...] je veux qu'il
    // [l'accès au configurateur] soit pas dans la fiche produit") — cet
    // accès reste disponible ailleurs, désormais via une bulle flottante
    // permanente juste au-dessus de "Ajouter un produit" (voir
    // #btnFabArmoireConfig, index.html/js/auth.js), juste plus sur la fiche
    // produit elle-même. Même règle d'accès que le configurateur lui-même
    // (accueil, js/auth.js) : tout utilisateur connecté, pas seulement
    // canEdit — ce n'est pas une modification du
    // catalogue, juste une liste personnelle.
    var vmAddToConfigWrap = document.getElementById('vmAddToConfigWrap');
    var vmAddToConfigBtn  = document.getElementById('vmAddToConfigBtn');
    var vmAddToConfigIcon = document.getElementById('vmAddToConfigIcon');
    var _armoireLoggedIn = typeof authIsLoggedIn === 'function' && authIsLoggedIn();
    if(vmAddToConfigWrap) vmAddToConfigWrap.style.display = (_armoireLoggedIn && p.ref) ? '' : 'none';

    if(vmAddToConfigBtn){
      vmAddToConfigBtn.onclick = function(){
        if(typeof _armoireAddToDraft !== 'function' || !p.ref) return;
        _armoireAddToDraft(p.ref, 1);
        var existing = _armoireDraft.find(function(it){ return it.ref === p.ref; });
        var qty = existing ? existing.qty : 1;
        if(typeof showToast === 'function') showToast('Ajouté à la configuration en cours (' + qty + ' ex.)', 'ok', 2500);
        // Bouton devenu icône seule (retour utilisateur : "petit icon pour
        // gagné de la place") — plus de texte "Ajouté ✓" à afficher, le
        // retour visuel passe par l'icône elle-même (coche verte, 1,4s)
        // en plus du toast déjà affiché ci-dessus.
        if(vmAddToConfigIcon){
          vmAddToConfigIcon.className = 'ti ti-check';
          vmAddToConfigIcon.style.color = '#2E7D32';
          setTimeout(function(){
            vmAddToConfigIcon.className = 'ti ti-plus';
            vmAddToConfigIcon.style.color = '';
          }, 1400);
        }
      };
    }
    // ── Fin bouton Ajouter à la configuration ───────────────────────

    // Appliquer permissions sur les boutons de la fiche
    // Par défaut : interdit si non connecté ou permissions non chargées
    var _perms   = window._userPerms || {};
    var _canEdit   = !!_perms.canEdit;
    var _canDelete = !!_perms.canDelete;
    var _vmEdit = document.getElementById('vmEditBtn');
    var _vmDel  = document.getElementById('vmDeleteBtn');
    if(_vmEdit)   _vmEdit.style.display   = _canEdit   ? '' : 'none';
    if(_vmDel)    _vmDel.style.display    = _canDelete ? '' : 'none';

    if(typeof authApplyOnProductModal === 'function') authApplyOnProductModal();

    // ── Section Suggestions (ouvre une modale, comme le bouton Documents) ──
    var sugSection = document.getElementById('vmSuggestionsSection');
    var sugToggle  = document.getElementById('vmSuggestionsToggle');
    var sugLabel   = document.getElementById('vmSuggestionsToggleLabel');
    var sugOverlay = document.getElementById('sugOverlay');
    var sugList    = document.getElementById('sugList');
    // Filtrer les refs vides, masquées SUR CETTE FICHE (p.suggestionsHidden —
    // voir la case à cocher par puce dans le formulaire, js/modal-suggestions-autocomplete.js) ET
    // vérifier que les produits existent réellement
    var _allProds = window.products || [];
    var _hiddenSugs = Array.isArray(p.suggestionsHidden) ? p.suggestionsHidden : [];
    var sugRefs = Array.isArray(p.suggestions)
      ? p.suggestions.filter(function(r){
          return r && r.trim() && _hiddenSugs.indexOf(r) === -1 && _allProds.some(function(x){ return x.ref === r; });
        })
      : [];

    if(sugSection){
      if(sugRefs.length){
        sugSection.style.display = '';
        // Icône seule (retour utilisateur : gagner de la place) : le
        // libellé complet passe en infobulle (title) sur le bouton, seul le
        // nombre reste visible en permanence, dans une petite pastille.
        if(sugToggle) sugToggle.title = 'Afficher les suggestions (' + sugRefs.length + ')';
        if(sugLabel) sugLabel.textContent = sugRefs.length;

        if(sugToggle) sugToggle.onclick = function(){
          var sugModalTitle = document.getElementById('sugModalTitle');
          if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-bulb"></i> Produits suggérés';
          if(sugList){
            // Liste compacte (comme la modale Documents) plutôt qu'une grille
            // de grandes vignettes : miniature fixe + texte sur une ligne.
            var prods = window.products || [];
            sugList.innerHTML = sugRefs.map(function(ref){
              var sp = prods.find(function(x){ return x.ref === ref; });
              if(!sp) return ''; // produit supprimé
              var photoHtml = sp.photo
                ? '<img src="'+escapeHtml(sp.photo)+'" alt="'+escapeHtml(sp.name||sp.ref)+'" loading="lazy" data-fallback="photo-icon">'
                : '<i class="ti ti-photo-off"></i>';
              return '<div class="sug-list-item" data-id="'+escapeHtml(sp.id)+'">'+
                '<div class="sug-list-photo">'+photoHtml+'</div>'+
                '<div class="sug-list-body">'+
                  '<div class="sug-list-ref">'+escapeHtml(sp.ref||'')+_productBadgesCompactHtml(sp)+'</div>'+
                  '<div class="sug-list-name">'+escapeHtml((sp.name||'').substring(0,60))+'</div>'+
                '</div>'+
                '<i class="ti ti-chevron-right sug-list-chevron"></i>'+
              '</div>';
            }).join('');

            // Clic sur une suggestion → empile la fiche courante, ferme la
            // modale et ouvre la suggestion
            sugList.querySelectorAll('.sug-list-item[data-id]').forEach(function(row){
              row.addEventListener('click', function(){
                var pid = row.getAttribute('data-id');
                if(pid){
                  _viewHistory.push(id);
                  if(sugOverlay) sugOverlay.style.display = 'none';
                  openView(pid);
                }
              });
            });
          }
          if(sugOverlay){
            sugOverlay.style.display = 'flex';
            document.body.classList.add('modal-open');
          }
        };
      } else {
        sugSection.style.display = 'none';
      }
    }
    var sugCloseBtn = document.getElementById('sugCloseBtn');
    if(sugCloseBtn) sugCloseBtn.onclick = function(){
      document.body.classList.remove('modal-open');
      if(sugOverlay){
        if(typeof window._closeOverlayAnimated === 'function'){
          window._closeOverlayAnimated(sugOverlay, function(){ sugOverlay.style.display = 'none'; });
        } else {
          sugOverlay.style.display = 'none';
        }
      }
    };

    // ── Section Pièces de rechange — même mécanique que Suggestions
    // ci-dessus, réutilise la même modale (sugOverlay/sugList), juste avec
    // un titre et une source de données différents (retour utilisateur :
    // "une rubrique pièces de rechange comme pour les suggestions"). ──
    var sparePartsSection = document.getElementById('vmSparePartsSection');
    var sparePartsToggle  = document.getElementById('vmSparePartsToggle');
    var sparePartsLabel   = document.getElementById('vmSparePartsToggleLabel');
    var _hiddenSpareParts = Array.isArray(p.sparePartsHidden) ? p.sparePartsHidden : [];
    var sparePartsRefs = Array.isArray(p.spareParts)
      ? p.spareParts.filter(function(r){
          return r && r.trim() && _hiddenSpareParts.indexOf(r) === -1 && _allProds.some(function(x){ return x.ref === r; });
        })
      : [];

    if(sparePartsSection){
      if(sparePartsRefs.length){
        sparePartsSection.style.display = '';
        if(sparePartsToggle) sparePartsToggle.title = 'Voir les pièces de rechange (' + sparePartsRefs.length + ')';
        if(sparePartsLabel) sparePartsLabel.textContent = sparePartsRefs.length;

        if(sparePartsToggle) sparePartsToggle.onclick = function(){
          var sugModalTitle = document.getElementById('sugModalTitle');
          if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-tool"></i> Pièces de rechange';
          if(sugList){
            var prods = window.products || [];
            sugList.innerHTML = sparePartsRefs.map(function(ref){
              var sp = prods.find(function(x){ return x.ref === ref; });
              if(!sp) return ''; // produit supprimé
              var photoHtml = sp.photo
                ? '<img src="'+escapeHtml(sp.photo)+'" alt="'+escapeHtml(sp.name||sp.ref)+'" loading="lazy" data-fallback="photo-icon">'
                : '<i class="ti ti-photo-off"></i>';
              return '<div class="sug-list-item" data-id="'+escapeHtml(sp.id)+'">'+
                '<div class="sug-list-photo">'+photoHtml+'</div>'+
                '<div class="sug-list-body">'+
                  '<div class="sug-list-ref">'+escapeHtml(sp.ref||'')+_productBadgesCompactHtml(sp)+'</div>'+
                  '<div class="sug-list-name">'+escapeHtml((sp.name||'').substring(0,60))+'</div>'+
                '</div>'+
                '<i class="ti ti-chevron-right sug-list-chevron"></i>'+
              '</div>';
            }).join('');

            sugList.querySelectorAll('.sug-list-item[data-id]').forEach(function(row){
              row.addEventListener('click', function(){
                var pid = row.getAttribute('data-id');
                if(pid){
                  _viewHistory.push(id);
                  if(sugOverlay) sugOverlay.style.display = 'none';
                  openView(pid);
                }
              });
            });
          }
          if(sugOverlay){
            sugOverlay.style.display = 'flex';
            document.body.classList.add('modal-open');
          }
        };
      } else {
        sparePartsSection.style.display = 'none';
      }
    }

    // ── Section Caractéristiques (réutilise le même overlay/liste que Suggestions) ──
    var specsSection = document.getElementById('vmSpecsSection');
    var specsToggle  = document.getElementById('vmSpecsToggle');
    var specsToggleLabel = document.getElementById('vmSpecsToggleLabel');
    var specEntries = (p.specs && typeof p.specs === 'object')
      ? Object.keys(p.specs).filter(function(k){ return p.specs[k]; }).map(function(k){ return [k, p.specs[k]]; })
      : [];

    if(specsSection){
      if(specEntries.length){
        specsSection.style.display = '';
        if(specsToggle) specsToggle.title = 'Voir les caractéristiques (' + specEntries.length + ')';
        if(specsToggleLabel) specsToggleLabel.textContent = specEntries.length;

        if(specsToggle) specsToggle.onclick = function(){
          var sugModalTitle = document.getElementById('sugModalTitle');
          if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-tool"></i> Caractéristiques techniques';
          if(sugList){
            // Classe dédiée (pas .vm-meta-item directement, réutilisée ailleurs
            // dans une grille 2 colonnes différente) : séparateur entre chaque
            // ligne + white-space:pre-wrap pour respecter les retours à la
            // ligne saisis dans la valeur (voir textarea .spec-value dans
            // js/modal-specs-editor.js) — avant, une caractéristique regroupant plusieurs
            // sous-valeurs (ex. puissance par tension) formait un seul long
            // paragraphe illisible, sans distinction visuelle claire entre
            // chaque ligne (retour utilisateur, capture à l'appui).
            sugList.innerHTML = specEntries.map(function(entry){
              return '<div class="spec-list-item"><label>'+escapeHtml(entry[0])+'</label><span>'+escapeHtml(entry[1])+'</span></div>';
            }).join('');
          }
          if(sugOverlay){
            sugOverlay.style.display = 'flex';
            document.body.classList.add('modal-open');
          }
        };
      } else {
        specsSection.style.display = 'none';
      }
    }


    viewOverlay.classList.add('open');
    document.body.classList.add('modal-open');
  }

