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
  // Retour utilisateur : "ajouter un bouton pour les référence qui sont
  // dans la mallette de test comme pour standard" — même traitement compact
  // que les deux repères juste au-dessus.
  if(p.spiLabs) html += '<i class="ti ti-briefcase" title="Disponible dans la mallette de test SPI-LABS" style="color:var(--copper);font-size:11px;margin-left:5px;vertical-align:middle;"></i>';
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
      // Retour utilisateur : "applique aussi ce menu ⋯ au reste du site",
      // puis "je te parlais dans le kebab pas le bouton qui l'affiche" —
      // le bouton ⋯ (#vmInfoBtn) reste rond/plein/copper à part (voir plus
      // haut), mais le CONTENU du menu déroulant reprend maintenant
      // .kebab-menu telle quelle (retour utilisateur : "je parle du
      // contenu [...] faudrait unifier les styles" — tailles/marges/police
      // différaient encore malgré les mêmes icônes/couleurs). class
      // kebab-menu-danger au lieu de danger, et plus de <hr> séparateur
      // (.kebab-menu n'en a pas ailleurs dans l'app).
      '<button class="vm-info-btn" id="vmInfoBtn" title="Plus d\'actions"><i class="ti ti-dots" aria-hidden="true"></i></button>' +
      '<div class="vm-info-menu kebab-menu" id="vmInfoMenu" role="menu">' +
        '<button id="vmEditBtn" role="menuitem"><i class="ti ti-pencil" aria-hidden="true"></i> Modifier la fiche</button>' +
        '<button id="vmProposeMenuBtn" role="menuitem" style="display:none;"><i class="ti ti-edit" aria-hidden="true"></i> Proposer une modification</button>' +
        '<button id="vmDeleteBtn" class="kebab-menu-danger" role="menuitem"><i class="ti ti-trash" aria-hidden="true"></i> Supprimer le produit</button>' +
      '</div>' +
      '<div class="vm-scroll">' +
        // Retour utilisateur : "modifie l'apparence de la fiche produit
        // pour se rapprocher de [maquette d'une fiche produit e-commerce]"
        // — .vm-body passe d'une seule colonne (tout empilé, prix compris)
        // à deux zones : .vm-main (identité produit — référence, nom, infos
        // générales, description, accès Documents/Suggestions/
        // Caractéristiques/Pièces de rechange) et .vm-side (prix +
        // "Ajouter à la configuration", en carte à part comme le bloc prix
        // de la maquette) — voir .vm-body/.vm-main/.vm-side (grid 2
        // colonnes sur desktop, empilées sur mobile) dans css/styles.css.
        // Pas de panier/quantité au sens e-commerce (aucune notion de
        // panier dans cette app) : réutilise "Ajouter à la configuration"
        // (déjà existant, voir plus bas) comme CTA principal à la place,
        // avec le même sélecteur de quantité que la maquette puisque
        // _armoireAddToDraft accepte déjà une quantité.
        '<div class="vm-body">' +
          '<div class="vm-main">' +
            '<div class="vm-ref" id="vmRef"></div>' +
            '<div class="vm-name" id="vmName"></div>' +
            '<div class="vm-tags" id="vmTags"></div>' +
            '<div class="vm-meta" id="vmMeta"></div>' +
            '<div class="vm-desc" id="vmDesc"></div>' +
            // Retour utilisateur : "fais en sorte que ça remplace les
            // boutons avec les icônes" (capture à l'appui — rangée
            // d'onglets texte "Caractéristiques / Documents (3) / Produits
            // associés (4)") — remplace la rangée de petites icônes
            // carrées (.vm-action-btn) par des onglets texte + décompte
            // entre parenthèses, même ordre que la maquette (Pièces de
            // rechange ajouté après : 4ème catégorie que la maquette n'a
            // pas, voir .vm-tabs-row/.vm-tab-btn dans css/styles.css).
            // Chaque onglet ouvre toujours sa fenêtre dédiée (retour
            // utilisateur explicite plus tôt : garder les fenêtres
            // actuelles plutôt que fusionner leur contenu dans la page) —
            // seule l'APPARENCE du déclencheur change ici, pas la
            // navigation.
            '<div class="vm-tabs-row">' +
              '<div id="vmSpecsSection" class="vm-tab-wrap" style="display:none;">' +
                '<button id="vmSpecsToggle" class="vm-tab-btn" title="Voir les caractéristiques">Caractéristiques<span id="vmSpecsToggleLabel" class="vm-tab-count"></span></button>' +
              '</div>' +
              '<div id="vmDocBtnWrap" class="vm-tab-wrap" style="display:none;">' +
                '<button id="vmDocBtn" class="vm-tab-btn" title="Documents">Documents</button>' +
              '</div>' +
              '<div id="vmCommentsSection" class="vm-tab-wrap" style="display:none;">' +
                '<button id="vmCommentsToggle" class="vm-tab-btn" title="Commentaires">Commentaires<span id="vmCommentsToggleLabel" class="vm-tab-count"></span></button>' +
              '</div>' +
              '<div id="vmSuggestionsSection" class="vm-tab-wrap" style="display:none;">' +
                '<button id="vmSuggestionsToggle" class="vm-tab-btn" title="Afficher suggestions">Produits associés<span id="vmSuggestionsToggleLabel" class="vm-tab-count"></span></button>' +
              '</div>' +
              '<div id="vmSparePartsSection" class="vm-tab-wrap" style="display:none;">' +
                '<button id="vmSparePartsToggle" class="vm-tab-btn" title="Voir les pièces de rechange">Pièces de rechange<span id="vmSparePartsToggleLabel" class="vm-tab-count"></span></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="vm-side">' +
            '<div class="vm-side-card">' +
              '<div class="vm-price-row"><div class="vm-price" id="vmPrice"></div></div>' +
              '<div id="vmPriceLabel" class="vm-price-label"></div>' +
              '<div id="vmAddToConfigWrap" class="vm-add-config-row" style="display:none;">' +
                '<div class="vm-qty-stepper">' +
                  '<button type="button" id="vmQtyMinus" aria-label="Diminuer la quantité">−</button>' +
                  '<input type="text" inputmode="numeric" id="vmQtyInput" value="1" aria-label="Quantité">' +
                  '<button type="button" id="vmQtyPlus" aria-label="Augmenter la quantité">+</button>' +
                '</div>' +
                // "+" plutôt que list-check (retour utilisateur) — même
                // icône que les autres actions d'ajout du configurateur
                // d'armoire (ex. "Insérer" un bloc, "Ajouter un
                // fournisseur", voir armoireConfig.js/index.html), plus
                // immédiatement lisible comme "ajouter" que la coche.
                '<button type="button" id="vmAddToConfigBtn" class="copper vm-add-config-btn" title="Ajouter à la configuration">' +
                  '<i id="vmAddToConfigIcon" class="ti ti-plus" aria-hidden="true"></i> Ajouter à la configuration' +
                '</button>' +
              '</div>' +
              // Retour utilisateur : "j'aimerai mettre en place un système
              // de comparaison afin de faire de la comparaison entre
              // plusieurs produits qui auront été sélectionnés par le
              // user" — ajout uniquement depuis la fiche produit (choix
              // explicite), pas de limite de nombre, ouvert à tous (pas
              // une action qui modifie des données, pas de permission à
              // vérifier contrairement à "Ajouter à la configuration").
              // Voir js/actions-productcompare.js pour l'état et la fenêtre
              // de comparaison elle-même. #vmCompareRow reste toujours
              // visible (pas conditionné à p.ref comme #vmAddToConfigWrap
              // au-dessus) : _compareToggle gère lui-même le cas où
              // vmCompareRef n'a pas de ref (bouton désactivé, voir plus
              // bas dans ce fichier).
              '<div class="vm-add-config-row" id="vmCompareRow" style="margin-top:10px;">' +
                '<button type="button" id="vmCompareBtn" class="secondary vm-add-config-btn" title="Comparer ce produit avec d\'autres">' +
                  '<i id="vmCompareIcon" class="ti ti-scale" aria-hidden="true"></i> <span id="vmCompareLabel">Comparer</span>' +
                '</button>' +
              '</div>' +
            '</div>' +
            '<div class="vm-side-card vm-price-history" id="vmPriceHistory"></div>' +
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
      var wrap = e.target.closest ? e.target.closest('.vm-ref-copy') : null;
      if(!wrap) return;
      var ref = wrap.getAttribute('data-copy') || '';
      copyToClipboard(ref).then(function(){
        showToast('Référence copiée ✓', 'ok', 1800);
        wrap.classList.add('copied');
        setTimeout(function(){ wrap.classList.remove('copied'); }, 1200);
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

    // Photo — badges Essentiel/3DEXPERIENCE (retour utilisateur : aussi
    // visibles sur la fiche produit, pas seulement sur la carte catalogue).
    // Construits à part et ajoutés APRÈS coup (pas dans le même innerHTML
    // que la photo lorsqu'elle réussit) : l'ancien onerror remplaçait tout
    // le innerHTML du conteneur en cas d'échec de chargement, ce qui aurait
    // aussi effacé les badges — onerror cible maintenant l'<img> lui-même
    // (outerHTML), pas son parent.
    // Retour utilisateur : "les badges dans la vignette de la fiche produit
    // [...] c'est pas joli de les mettre dans tous les coins" — les 3
    // repères (3D/Essentiel/SPI-LABS) étaient chacun dans un coin différent
    // de la photo. Regroupés en une seule pile (.vm-badges, voir
    // css/styles.css) au lieu de chacun sa propre position:absolute —
    // chaque badge n'a donc plus qu'à exister ou non, c'est la pile qui
    // gère sa place, jamais plus d'un coin occupé.
    // Retour utilisateur : "après on est pas obligé de mettre le texte des
    // badges" — icône seule (le title porte toujours le libellé complet,
    // au survol/pour les lecteurs d'écran) plutôt que la pastille large
    // "⭐ Standard"/"💼 SPI-LABS" utilisée sur la carte catalogue — la pile
    // groupée (.vm-badges) rend le texte redondant avec l'icône.
    var vmBadgesHtml = (p.available3DX ? '<div class="three-d-overlay" title="Disponible dans la 3DEXPERIENCE"><img src="assets/three-d-badge.png" alt="3DEX"></div>' : '')
      + (p.essential ? '<div class="essential-badge" title="Produit essentiel"><i class="ti ti-star-filled"></i></div>' : '')
      + (p.spiLabs ? '<div class="spi-labs-badge" title="Disponible dans la mallette de test SPI-LABS"><i class="ti ti-briefcase"></i></div>' : '');
    if(vmBadgesHtml) vmBadgesHtml = '<div class="vm-badges">' + vmBadgesHtml + '</div>';
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
    // Retour utilisateur : "modifie l'apparence de la fiche produit pour se
    // rapprocher de [maquette]" — icône par ligne (voir la maquette : une
    // pastille par propriété — tension, tag, calendrier…) au lieu d'une
    // simple étiquette texte ; .vm-meta passe d'une grille 2 colonnes à une
    // liste à une colonne, chaque ligne = icône + libellé/valeur empilés
    // (voir .vm-meta/.vm-meta-item dans css/styles.css).
    // Retour utilisateur : une couleur par propriété avait été ajoutée ici
    // ("ajoute un peu de couleur"), puis retirée ("retire les couleurs des
    // icônes, je ne t'ai jamais demandé ça" — mal compris : la couleur
    // demandée visait la rangée de boutons SOUS ce tableau, voir
    // .vm-action-btn/#vmDocBtn etc. dans css/styles.css, pas les icônes
    // d'ici). Icônes revenues à une seule couleur unie (voir
    // .vm-meta-icon, css/styles.css).
    var META_ICONS = {
      'Marque': 'ti-tag', 'Référence': 'ti-hash', 'Famille': 'ti-folder',
      'Série': 'ti-stack-2', 'Fournisseur': 'ti-truck', 'Délai': 'ti-calendar-time',
      '3DEXPERIENCE': 'ti-cube', 'URL': 'ti-link'
    };
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
        // Retour utilisateur : "que le bouton copier la référence soit
        // plutôt lorsqu'on clique sur la ref, ça copie la ref" — toute la
        // zone (texte + icône) devient la cible du clic (role="button" +
        // data-copy posé ici, sur .vm-ref-copy lui-même) plutôt qu'un
        // <button> séparé à côté du texte ; voir la délégation de clic sur
        // .vm-ref-copy (et non plus .vm-copy-btn) plus haut dans ce
        // fichier. L'icône reste affichée (copier/coche) comme simple
        // repère visuel, mais n'est plus, seule, la cible cliquable.
        val = '<span class="vm-ref-copy" role="button" tabindex="0" data-copy="'+escapeHtml(m[1])+'" title="Copier la référence" aria-label="Copier la référence">'
          + '<span>'+escapeHtml(m[1])+'</span>'
          + '<i class="ti ti-copy vm-copy-icon" aria-hidden="true"></i><i class="ti ti-check vm-copy-icon" aria-hidden="true"></i>'
          + '</span>';
      } else {
        val = '<span>'+escapeHtml(m[1])+'</span>';
      }
      var iconClass = META_ICONS[m[0]] || 'ti-info-circle';
      return '<div class="vm-meta-item"><i class="ti '+iconClass+' vm-meta-icon" aria-hidden="true"></i><div class="vm-meta-text"><label>'+escapeHtml(m[0])+'</label>'+val+'</div></div>';
    }).join('');
    vmMeta.style.display = metaItems.length ? '' : 'none';

    // Description avec troncature + "Voir plus" (mobile et desktop).
    // Tags HTML retirés comme sur la carte catalogue (renderCard) — sans ça,
    // une description contenant du HTML collé par erreur affichait les
    // balises en clair ici alors que la carte les nettoyait déjà (retour
    // utilisateur : incohérence entre les deux vues).
    // Retour utilisateur : "fais en sorte que quand la description affiche
    // le bouton voir plus, ça ouvre une fenêtre avec la description
    // complète" — "Voir plus" dépliait jusqu'ici le texte SUR PLACE (avec
    // un "Voir moins" pour revenir, et un verrou de hauteur sur #viewModal
    // pour empêcher la fiche de s'agrandir pendant ce dépliage, voir
    // js/render-view-modal-close.js) ; ouvre maintenant la même fenêtre
    // réutilisée que Caractéristiques/Documents/Produits associés (voir
    // #sugOverlay, _vmOpenDescModal ci-dessous) avec le texte complet —
    // .vm-desc reste toujours tronqué, plus de "Voir moins" ni de verrou de
    // hauteur à gérer (plus nécessaires : la fiche elle-même ne change
    // jamais de taille).
    var fullDesc = stripHtmlTags(p.desc || '').trim();
    var isMobile = window.innerWidth <= 640;
    var CHAR_LIMIT = isMobile ? 160 : 300;
    vmDesc.style.display = fullDesc ? '' : 'none';

    if(fullDesc.length > CHAR_LIMIT){
      var truncated = fullDesc.slice(0, fullDesc.lastIndexOf(' ', CHAR_LIMIT) || CHAR_LIMIT);
      vmDesc.innerHTML = escapeHtml(truncated)
        + '<span class="vm-desc-toggle" role="button" tabindex="0"> Voir plus</span>';
      var _span = vmDesc.querySelector('.vm-desc-toggle');
      if(_span){ _span.dataset.full = fullDesc; }
    } else {
      vmDesc.textContent = fullDesc;
    }

    // Prix + badge hausse + prix d'origine barré + remise
    // Retour utilisateur : "corrige la section prix des fiches produit pour
    // que toutes les fiches soient identiques peu importe le prix" (capture
    // à l'appui : le symbole "€" et les badges remise/hausse retombaient à
    // la ligne au milieu du prix quand les deux badges étaient présents en
    // même temps) — tout était concaténé en un seul bloc de texte inline
    // (#vmPrice), qui cassait n'importe où selon la largeur disponible et
    // le nombre de badges. Même correctif déjà appliqué aux cartes du
    // catalogue (voir renderCard, js/render-card-grid.js, et le commentaire
    // équivalent juste au-dessus de .price-badges dans css/styles.css) :
    // structure TOUJOURS empilée (prix catalogue barré, puis prix affiché,
    // puis les badges côte à côte sur leur propre ligne) plutôt que
    // dépendante de la largeur et du nombre de chiffres.
    var jumpPct = getLastPriceJumpPct(p);
    var badge = jumpPct!==null && jumpPct>=PRICE_ALERT_THRESHOLD
      ? '<span class="price-jump-badge price-jump-badge-lg"><i class="ti ti-alert-triangle"></i> +'+jumpPct.toFixed(0)+'%</span>' : '';
    var orig = getOriginalPrice(p);
    var discPct = getDiscountPct(p);
    var discBadgeVm = discPct !== null && discPct < 0
      ? '<span class="discount-badge discount-badge-lg">-'+Math.abs(discPct).toFixed(0)+' %</span>'
      : '';
    vmPrice.innerHTML = (orig ? '<span class="vm-price-original" title="Prix catalogue fabricant">'+escapeHtml(_displayPrice(orig))+'</span>' : '')+
                        '<span class="vm-price-main">'+(escapeHtml(_displayPrice(p.price)||'—'))+'</span>'+
                        ((discBadgeVm || badge) ? '<span class="vm-price-badges">'+discBadgeVm+badge+'</span>' : '');
    // Légende sous le prix (retour utilisateur : maquette avec "Prix
    // unitaire (HT)" sous le prix) — affichée seulement s'il y a bien un
    // prix, pas comme légende flottante sur un prix manquant ("—").
    var vmPriceLabelEl = document.getElementById('vmPriceLabel');
    if(vmPriceLabelEl) vmPriceLabelEl.textContent = p.price ? 'Prix unitaire (HT)' : '';

    // Retour utilisateur : "fais attention lorsqu'il n'y a pas d'historique
    // de prix tu m'affiche une bulle vide" (capture à l'appui) —
    // buildPriceHistoryReadonly() renvoie '' sans historique, mais
    // #vmPriceHistory reste un .vm-side-card (bordure/fond/ombre, voir
    // css/styles.css) même vide : ça affichait quand même une carte
    // blanche vide sous le bouton "Ajouter à la configuration". Masquer le
    // conteneur lui-même quand il n'y a rien à y montrer, pas juste vider
    // son contenu.
    var priceHistoryHtml = buildPriceHistoryReadonly(p);
    vmPriceHistory.innerHTML = priceHistoryHtml;
    vmPriceHistory.style.display = priceHistoryHtml ? '' : 'none';

    // ── Bouton Document (visible pour tous les visiteurs non connectés —
    // un document public reste public ; pour un compte connecté, respecte
    // maintenant canViewDocs) ────────────────────────────────────────
    // Retour utilisateur : "regarde que chaque perm affiche les boutons
    // autorisés" — "Voir les documents PDF" (canViewDocs) existe bien comme
    // case à cocher par utilisateur (voir Ajouter/Modifier utilisateur,
    // js/auth.js) mais n'était vérifiée nulle part : ce bouton s'affichait
    // pour absolument tout le monde, y compris un compte connecté SANS
    // cette permission. Un visiteur NON connecté continue de voir les
    // documents publics comme avant (_perms.loggedIn faux) — seul un compte
    // connecté sans canViewDocs se le voit désormais retiré.
    var vmDocBtn     = document.getElementById('vmDocBtn');
    var vmDocBtnWrap = document.getElementById('vmDocBtnWrap');
    var sUrlDoc      = localStorage.getItem('cat_server_url');
    // _perms est déclarée plus bas dans cette même fonction (section
    // "Appliquer permissions sur les boutons de la fiche") — pas encore
    // disponible ici, donc relu directement depuis window._userPerms.
    var _permsDoc    = window._userPerms || {};
    var _canViewDocs = !_permsDoc.loggedIn || !!_permsDoc.canViewDocs;
    if(vmDocBtnWrap) vmDocBtnWrap.style.display = (p.hasDoc && sUrlDoc && _canViewDocs) ? '' : 'none';
    if(vmDocBtn) vmDocBtn.onclick = function(){ window._openDocModal(p, sUrlDoc); };
    // ── Fin bouton Document ─────────────────────────────────────────

    // ── Bouton Commentaires ──────────────────────────────────────────
    // Retour utilisateur : "j'aimerai ajouter un bouton commentaire [...]
    // pour ajouter des information que le fabriquant de dis pas ou même des
    // retour apres uilisation" — ajouter reste réservé à canEdit (outil
    // d'équipe pour la saisie), mais retour utilisateur suivant : "il faut
    // que les commentaire soit visible par un non login" — la CONSULTATION
    // suit désormais la même règle que les documents publics (vmDocBtnWrap
    // un peu plus haut) : un visiteur non connecté voit l'onglet (les
    // commentaires existants restent une information publique du produit),
    // seul un compte connecté SANS canEdit se le voit retiré (ce n'est pas
    // un espace de discussion public pour autant : ajouter un commentaire
    // reste réservé à l'équipe, voir _canAddComment/commentsModalNewBtn
    // ci-dessous et le garde-fou d'_openCommentsModal, js/render-comments.js).
    // Retour utilisateur suivant : "je veux qui soit integere comme ici
    // [l'onglet Commentaires, au même endroit que Caractéristiques] et
    // retire le du kebab" — le second accès ajouté un temps dans le menu ⋯
    // (à côté de "Modifier la fiche"/"Supprimer le produit") est retiré :
    // CET onglet reste le seul chemin.
    var vmCommentsSection = document.getElementById('vmCommentsSection');
    var vmCommentsToggle  = document.getElementById('vmCommentsToggle');
    var vmCommentsLabel   = document.getElementById('vmCommentsToggleLabel');
    var _canViewComments = !_permsDoc.loggedIn || !!(_permsDoc.canEdit || _permsDoc.isAdmin);
    var _commentsCount = Array.isArray(p.comments) ? p.comments.length : 0;
    if(vmCommentsSection) vmCommentsSection.style.display = _canViewComments ? '' : 'none';
    if(vmCommentsToggle)  vmCommentsToggle.title = 'Commentaires' + (_commentsCount ? ' (' + _commentsCount + ')' : '');
    if(vmCommentsLabel)   vmCommentsLabel.textContent = _commentsCount ? ' (' + _commentsCount + ')' : '';
    if(vmCommentsToggle)  vmCommentsToggle.onclick = function(){ if(typeof window._openCommentsModal === 'function') window._openCommentsModal(p); };
    // ── Fin bouton Commentaires ───────────────────────────────────────

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
    // produit elle-même. Retour utilisateur suivant : "j'aimerais que le
    // configurateur soit disponible lorsqu'on n'est pas loggé" — même règle
    // d'accès que le configurateur lui-même (accueil, js/auth.js) désormais
    // ouvert à tous, connecté ou non ; un visiteur anonyme garde sa
    // configuration en cours sur cet appareil (voir js/armoireConfig.js).
    var vmAddToConfigWrap = document.getElementById('vmAddToConfigWrap');
    var vmAddToConfigBtn  = document.getElementById('vmAddToConfigBtn');
    var vmAddToConfigIcon = document.getElementById('vmAddToConfigIcon');
    var vmQtyInput        = document.getElementById('vmQtyInput');
    var vmQtyMinus        = document.getElementById('vmQtyMinus');
    var vmQtyPlus         = document.getElementById('vmQtyPlus');
    if(vmAddToConfigWrap) vmAddToConfigWrap.style.display = p.ref ? '' : 'none';

    // Retour utilisateur : "modifie l'apparence de la fiche produit pour se
    // rapprocher de [maquette]" — bouton devenu un vrai CTA (texte +
    // icône, plus une icône seule), avec le même sélecteur de quantité que
    // la maquette. Remis à "1" à chaque ouverture de fiche (nouveau
    // produit = nouvelle saisie, jamais celle du produit précédent).
    if(vmQtyInput) vmQtyInput.value = '1';
    function _vmQtyClamp(){
      if(!vmQtyInput) return 1;
      var n = parseInt(vmQtyInput.value, 10);
      if(!n || n < 1) n = 1;
      vmQtyInput.value = n;
      return n;
    }
    if(vmQtyMinus) vmQtyMinus.onclick = function(){
      vmQtyInput.value = Math.max(1, _vmQtyClamp() - 1);
    };
    if(vmQtyPlus) vmQtyPlus.onclick = function(){
      vmQtyInput.value = _vmQtyClamp() + 1;
    };
    if(vmQtyInput){
      vmQtyInput.onchange = _vmQtyClamp;
      vmQtyInput.onblur = _vmQtyClamp;
    }

    if(vmAddToConfigBtn){
      vmAddToConfigBtn.onclick = function(){
        if(typeof _armoireAddToDraft !== 'function' || !p.ref) return;
        var qtyToAdd = _vmQtyClamp();
        _armoireAddToDraft(p.ref, qtyToAdd);
        var existing = _armoireDraft.find(function(it){ return it.ref === p.ref; });
        var qty = existing ? existing.qty : qtyToAdd;
        if(typeof showToast === 'function') showToast('Ajouté à la configuration en cours (' + qty + ' ex.)', 'ok', 2500);
        // Retour visuel bref (coche verte, 1,4s) en plus du toast ci-dessus
        // — repris de l'ancienne version icône seule du bouton.
        if(vmAddToConfigIcon){
          vmAddToConfigIcon.className = 'ti ti-check';
          vmAddToConfigIcon.style.color = '#4ADE80';
          setTimeout(function(){
            vmAddToConfigIcon.className = 'ti ti-plus';
            vmAddToConfigIcon.style.color = '';
          }, 1400);
        }
      };
    }
    // ── Fin bouton Ajouter à la configuration ───────────────────────

    // ── Bouton Comparer ──────────────────────────────────────────────
    // Retour utilisateur : "j'aimerai mettre en place un système de
    // comparaison afin de faire de la comparaison entre plusieurs
    // produits qui auront été sélectionnés par le user" — voir
    // js/actions-productcompare.js pour _compareToggle/_compareIsIn (état
    // + fenêtre de comparaison). Ouvert à tous, jamais masqué par
    // permission (à l'inverse de "Ajouter à la configuration") : comparer
    // ne modifie aucune donnée du catalogue.
    var vmCompareBtn   = document.getElementById('vmCompareBtn');
    var vmCompareIcon  = document.getElementById('vmCompareIcon');
    var vmCompareLabel = document.getElementById('vmCompareLabel');
    function _vmSyncCompareBtn(){
      if(!vmCompareBtn) return;
      var inCompare = typeof window._compareIsIn === 'function' && p.ref && window._compareIsIn(p.ref);
      vmCompareBtn.classList.toggle('vm-compare-active', !!inCompare);
      if(vmCompareIcon) vmCompareIcon.className = inCompare ? 'ti ti-check' : 'ti ti-scale';
      if(vmCompareLabel) vmCompareLabel.textContent = inCompare ? 'Dans la comparaison' : 'Comparer';
      vmCompareBtn.title = inCompare ? 'Retirer de la comparaison' : 'Comparer ce produit avec d\'autres';
    }
    _vmSyncCompareBtn();
    if(vmCompareBtn){
      vmCompareBtn.onclick = function(){
        if(typeof window._compareToggle !== 'function' || !p.ref) return;
        var nowIn = window._compareToggle(p.ref);
        _vmSyncCompareBtn();
        if(typeof showToast === 'function'){
          showToast(nowIn ? 'Ajouté à la comparaison' : 'Retiré de la comparaison', 'ok', 2000);
        }
      };
    }
    // ── Fin bouton Comparer ──────────────────────────────────────────

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
        // Onglet texte "Produits associés (N)" (retour utilisateur, voir
        // .vm-tab-count dans css/styles.css) — le span du décompte suit
        // directement le libellé posé en dur dans _vmInjectTemplate
        // plus haut, d'où le "(" / ")" ajoutés ici autour du nombre.
        if(sugToggle) sugToggle.title = 'Afficher les suggestions (' + sugRefs.length + ')';
        if(sugLabel) sugLabel.textContent = ' (' + sugRefs.length + ')';

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
      // Retour utilisateur : "sur mobile, quand je suis sur une fenêtre, il
      // faut que les boutons en bas à droite (Config, remonter en haut…)
      // disparaissent" — #sugOverlay (Caractéristiques/Documents/Produits
      // associés/Pièces de rechange/Description, voir plus haut) ne s'ouvre
      // JAMAIS seul : toujours par-dessus une autre fenêtre encore ouverte
      // derrière (la fiche produit). Retirer 'modal-open' sans condition
      // ici faisait réapparaître le FAB stack (masqué par
      // body.modal-open .fab-stack, css/styles.css) alors qu'une autre
      // fenêtre restait affichée — voir window._isOtherOverlayOpen, js/init.js.
      if(typeof window._isOtherOverlayOpen !== 'function' || !window._isOtherOverlayOpen('sugOverlay')){
        document.body.classList.remove('modal-open');
      }
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
        if(sparePartsLabel) sparePartsLabel.textContent = ' (' + sparePartsRefs.length + ')';

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
        if(specsToggleLabel) specsToggleLabel.textContent = ' (' + specEntries.length + ')';

        if(specsToggle) specsToggle.onclick = function(){
          var sugModalTitle = document.getElementById('sugModalTitle');
          if(sugModalTitle) sugModalTitle.innerHTML = '<i class="ti ti-tool"></i> Caractéristiques techniques';
          if(sugList){
            // Retour utilisateur : "faire en sorte que l'affichage des
            // caractéristiques soit comme [le tableau Propriété/Valeur]
            // lorsqu'on clique sur les caractéristiques sur la fiche
            // produit" — remplace l'ancien affichage empilé
            // (.spec-list-item : étiquette au-dessus, valeur en gras
            // dessous) par le même tableau à deux colonnes que l'aperçu du
            // formulaire d'édition (.specs-table, voir #specsSummaryTable
            // dans js/modal-specs-editor.js) — sans la colonne d'actions
            // "⋯", ici en lecture seule. #sugList (.modal-body) défile déjà
            // tout seul si la liste est longue, l'en-tête Propriété/Valeur
            // reste collé en haut pendant ce défilement (position:sticky,
            // voir .specs-table th, css/styles.css) comme dans le
            // formulaire. white-space:pre-wrap sur la cellule Valeur :
            // respecte les retours à la ligne saisis dans le formulaire
            // (textarea .spec-value, js/modal-specs-editor.js) — sans ça,
            // une caractéristique regroupant plusieurs sous-valeurs (ex.
            // puissance par tension) redevient un seul long paragraphe
            // illisible (retour utilisateur historique, capture à l'appui).
            sugList.innerHTML = '<table class="specs-table"><tr><th>Propriété</th><th>Valeur</th></tr>'
              + specEntries.map(function(entry){
                  return '<tr><td>'+escapeHtml(entry[0])+'</td><td style="white-space:pre-wrap;">'+escapeHtml(entry[1])+'</td></tr>';
                }).join('')
              + '</table>';
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

