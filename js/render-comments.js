  // ── Modale Commentaires ──────────────────────────────────────────
  // Retour utilisateur : "j'aimerai rajouter une fonction au fiche produit
  // [...] un bouton commentaire [...] pour ajouter des information que le
  // fabriquant de dis pas ou même des retour apres uilisation" — un
  // commentaire est un texte libre attribué à son auteur (authGetCurrentUser)
  // et horodaté, stocké directement sur le produit (p.comments, comme
  // priceHistory) : synchronisé au serveur avec le reste de la fiche via
  // save() (js/storage.js), sans mécanisme de synchro dédié (contrairement
  // au brouillon d'armoire, propre à un seul utilisateur). Même droit
  // d'accès que l'historique des prix (canEdit) : outil pour l'équipe qui
  // entretient le catalogue, pas un espace de discussion public — décision
  // utilisateur explicite (canEdit pour ajouter, auteur+admin pour
  // modifier/supprimer), voir la garde en tête d'_openCommentsModal
  // ci-dessous et _commentsCanManage plus bas.

  function _commentsCanManage(c){
    var _perms = window._userPerms || {};
    if(_perms.isAdmin) return true;
    var me = typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null;
    return !!(me && c && c.author && me.username === c.author);
  }

  function _commentsSyncTabCount(p){
    var label = document.getElementById('vmCommentsToggleLabel');
    var toggle = document.getElementById('vmCommentsToggle');
    var count = Array.isArray(p.comments) ? p.comments.length : 0;
    if(label) label.textContent = count ? ' (' + count + ')' : '';
    if(toggle) toggle.title = 'Commentaires' + (count ? ' (' + count + ')' : '');
  }

  // Retour utilisateur : "tu as pas fait en sorte qu'il fonctionne comme les
  // autres bouton kebab du site" — réutilise désormais TEL QUEL le menu ⋯
  // générique déjà utilisé pour les blocs/configurations du configurateur
  // d'armoire et la liste des utilisateurs (.kebab-btn/.kebab-menu +
  // _bindKebabMenuOn/_closeAllKebabMenus, js/popup.js) plutôt qu'un
  // mécanisme d'ouverture/fermeture réécrit à la main pour cette seule
  // liste — même comportement (un seul menu ouvert à la fois, se ferme au
  // clic ailleurs) sans dupliquer cette logique une troisième fois.
  var _commentsCurrentProductId = null;
  function _commentsFindCurrentProduct(){
    return products.find(function(x){ return x.id === _commentsCurrentProductId; });
  }

  function _commentsRowHtml(c){
    var dateStr = c.date ? new Date(c.date).toLocaleString('fr-FR') : '';
    var menuHtml = '';
    if(_commentsCanManage(c)){
      menuHtml =
        '<div style="position:relative;flex-shrink:0;">'
          + '<button type="button" class="kebab-btn" title="Plus d\'actions" aria-haspopup="true" aria-expanded="false"><i class="ti ti-dots" aria-hidden="true"></i></button>'
          + '<div class="kebab-menu" role="menu" style="position:absolute;right:0;top:30px;z-index:5;">'
            + '<button type="button" class="comment-edit-btn" role="menuitem"><i class="ti ti-pencil" aria-hidden="true"></i> Modifier</button>'
            + '<button type="button" class="comment-delete-btn kebab-menu-danger" role="menuitem"><i class="ti ti-trash" aria-hidden="true"></i> Supprimer</button>'
          + '</div>'
        + '</div>';
    }
    return '<div class="comment-row" data-id="' + escapeHtml(c.id) + '" style="padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;">'
          + '<div style="font-size:11.5px;color:var(--ink-soft);"><strong style="color:var(--ink);">' + escapeHtml(c.author || '—') + '</strong>' + (dateStr ? ' · ' + escapeHtml(dateStr) : '') + '</div>'
          + menuHtml
        + '</div>'
        + '<div style="font-size:13px;color:var(--ink);white-space:pre-wrap;word-break:break-word;">' + escapeHtml(c.text || '') + '</div>'
      + '</div>';
  }

  function _commentsRenderList(p){
    var list  = document.getElementById('commentsModalList');
    var empty = document.getElementById('commentsModalEmpty');
    if(!list) return;
    var comments = Array.isArray(p.comments) ? p.comments : [];
    if(comments.length === 0){
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    // Plus récent en premier — ce qu'on cherche en priorité en rouvrant la fiche.
    list.innerHTML = comments.slice().reverse().map(_commentsRowHtml).join('');
  }

  // Clics délégués sur la liste (édition/suppression) — un seul écouteur
  // posé une fois ici plutôt qu'un addEventListener par ligne à chaque
  // rendu, même principe que _armoireListItemHtml (js/armoireConfig.js).
  // _bindKebabMenuOn (voir plus bas) gère déjà l'ouverture/fermeture du
  // menu ⋯ lui-même ; ceci ne traite que l'ACTION choisie dedans.
  (function _commentsBindListActions(){
    var list = document.getElementById('commentsModalList');
    if(!list) return;

    // Retour utilisateur (capture à l'appui) : le menu ⋯ d'un commentaire
    // proche du bas de la liste se retrouvait tronqué ("Supprimer" invisible,
    // seul "Modifier" restait affiché) — la liste défile (overflow-y:auto,
    // voir index.html) et .kebab-menu s'ouvre normalement en position:
    // absolute PAR RAPPORT à sa ligne, donc coupé dès qu'il dépasse le bas
    // de la zone visible de cette liste. Les autres menus ⋯ du site
    // (configurateur d'armoire, liste utilisateurs) n'ont pas ce problème
    // seulement parce qu'ils tombent rarement en bas d'une liste qui
    // défile — le mécanisme d'ouverture partagé (_bindKebabMenuOn,
    // js/popup.js) ne repositionne rien, il ne fait que basculer .open.
    // Recalcule donc ici, après coup (setTimeout 0 : le menu doit déjà
    // être ouvert par _bindKebabMenuOn, posé sur l'overlay ANCÊTRE — donc
    // exécuté après ce gestionnaire-ci lors de la même remontée d'événement),
    // une position:fixed par rapport au bouton ⋯ réellement cliqué : sort
    // ainsi du cadre découpé par la liste, quelle que soit la ligne.
    list.addEventListener('click', function(e){
      var kebabBtn = e.target.closest ? e.target.closest('.kebab-btn') : null;
      if(!kebabBtn) return;
      setTimeout(function(){
        var menu = kebabBtn.nextElementSibling;
        if(!menu || !menu.classList.contains('kebab-menu') || !menu.classList.contains('open')) return;
        var btnRect  = kebabBtn.getBoundingClientRect();
        var menuRect = menu.getBoundingClientRect();
        var openUpward = (btnRect.bottom + menuRect.height + 4) > window.innerHeight;
        menu.style.position = 'fixed';
        menu.style.right = (window.innerWidth - btnRect.right) + 'px';
        if(openUpward){
          menu.style.top = 'auto';
          menu.style.bottom = (window.innerHeight - btnRect.top + 4) + 'px';
        } else {
          menu.style.bottom = 'auto';
          menu.style.top = (btnRect.bottom + 4) + 'px';
        }
      }, 0);
    });

    list.addEventListener('click', function(e){
      var row = e.target.closest ? e.target.closest('.comment-row') : null;
      if(!row) return;
      var prod = _commentsFindCurrentProduct();
      if(!prod || !Array.isArray(prod.comments)) return;
      var commentId = row.getAttribute('data-id');
      var idx = prod.comments.findIndex(function(x){ return x.id === commentId; });
      if(idx === -1) return;
      if(e.target.closest('.comment-edit-btn')){
        _commentsOpenComposeWindow(prod, prod.comments[idx]);
      } else if(e.target.closest('.comment-delete-btn')){
        prod.comments.splice(idx, 1);
        save(false, [prod]);
        _commentsRenderList(prod);
        _commentsSyncTabCount(prod);
      }
    });
  })();

  // Retour utilisateur : "je veux que lorsqu'on clique [Nouveau commentaire]
  // une fenêtre apparaisse" — #commentsNewOverlay s'ouvre PAR-DESSUS
  // #commentsModalOverlay (toujours encore ouverte derrière), même mécanique
  // partagée que #docOverlay/#commentsModalOverlay eux-mêmes par-dessus la
  // fiche produit (js/render-documents.js). Réutilisée aussi bien pour un
  // nouveau commentaire que pour en modifier un existant (existingComment
  // optionnel) — même fenêtre, juste le titre/bouton/pré-remplissage changent.
  function _commentsOpenComposeWindow(p, existingComment){
    // Retour utilisateur : "il faut que les commentaire soit visible par un
    // non login" — la consultation (_openCommentsModal ci-dessous) est
    // désormais ouverte à tous, mais AJOUTER un commentaire reste réservé à
    // canEdit (#commentsModalNewBtn est déjà masqué sans ce droit, voir
    // js/render-view-modal.js/_openCommentsModal ci-dessous — mais cette
    // fonction reste accessible directement). Modifier un commentaire
    // EXISTANT est protégé séparément par _commentsCanManage (auteur ou
    // admin) côté appelant (le bouton "Modifier" du menu ⋯ n'existe même
    // pas sinon) — seul le cas "nouveau commentaire" a besoin d'un
    // garde-fou ici.
    if(!existingComment){
      var _perms = window._userPerms || {};
      if(!(_perms.canEdit || _perms.isAdmin)){
        if(typeof showToast === 'function') showToast('Droit de modification requis', 'err', 3000);
        return;
      }
    }
    var newOverlay = document.getElementById('commentsNewOverlay');
    var titleEl    = document.getElementById('commentsNewTitle');
    var newTextEl  = document.getElementById('commentsModalNewText');
    var errEl      = document.getElementById('commentsModalError');
    var addBtn     = document.getElementById('commentsModalAddBtn');
    if(!newOverlay) return;
    if(titleEl) titleEl.textContent = existingComment ? 'Modifier le commentaire' : 'Nouveau commentaire';
    if(addBtn)  addBtn.textContent  = existingComment ? 'Enregistrer' : 'Ajouter';
    if(newTextEl) newTextEl.value = existingComment ? (existingComment.text || '') : '';
    if(errEl) errEl.style.display = 'none';
    newOverlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    if(newTextEl) newTextEl.focus();

    function closeComposeWindow(){
      if(typeof window._isOtherOverlayOpen !== 'function' || !window._isOtherOverlayOpen('commentsNewOverlay')){
        document.body.classList.remove('modal-open');
      }
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(newOverlay, function(){ newOverlay.style.display = 'none'; });
      } else {
        newOverlay.style.display = 'none';
      }
    }
    document.getElementById('commentsNewClose').onclick = closeComposeWindow;
    document.getElementById('commentsModalCancelBtn').onclick = closeComposeWindow;

    addBtn.onclick = function(){
      var text = (newTextEl.value || '').trim();
      if(!text){
        errEl.textContent = 'Écrivez un commentaire avant de l\'ajouter.';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';
      var prod = products.find(function(x){ return x.id === p.id; });
      if(!prod) return;
      prod.comments = Array.isArray(prod.comments) ? prod.comments : [];

      if(existingComment){
        var target = prod.comments.find(function(x){ return x.id === existingComment.id; });
        if(!target) return;
        target.text = text;
      } else {
        var me = typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null;
        prod.comments.push({
          id: 'cm_' + Date.now() + '_' + _secureRandomBase36(6),
          author: (me && me.username) || '—',
          date: Date.now(),
          text: text
        });
      }
      // [prod] : seul CE produit a été touché — même raisonnement que pour
      // l'historique des prix (js/modal-price-history-form.js) : save()
      // sans filtre repousserait tout le catalogue local au serveur pour
      // l'ajout/la modification d'UN commentaire.
      save(false, [prod]);
      _commentsRenderList(prod);
      _commentsSyncTabCount(prod);
      closeComposeWindow();
    };
  }

  window._openCommentsModal = function openCommentsModal(p){
    // Retour utilisateur : "il faut que les commentaire soit visible par un
    // non login" — consulter la liste est désormais ouvert à tous, y
    // compris un visiteur non connecté (même règle que les documents
    // publics, voir _canViewComments dans js/render-view-modal.js) : ne
    // bloque plus qu'un compte connecté SANS canEdit, pas l'absence de
    // connexion elle-même. Ajouter un commentaire reste réservé à canEdit
    // (voir #commentsModalNewBtn masqué ci-dessous, et le garde-fou propre
    // à _commentsOpenComposeWindow pour un appel direct qui la
    // contournerait).
    var _perms = window._userPerms || {};
    if(_perms.loggedIn && !(_perms.canEdit || _perms.isAdmin)){
      if(typeof showToast === 'function') showToast('Droit de modification requis', 'err', 3000);
      return;
    }
    var overlay = document.getElementById('commentsModalOverlay');
    if(!overlay) return;

    _commentsCurrentProductId = p.id;
    document.getElementById('commentsModalRef').textContent = (p.brand ? p.brand + ' — ' : '') + (p.ref || p.name || '');

    _commentsRenderList(p);

    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');

    var newBtnEl = document.getElementById('commentsModalNewBtn');
    var _canAddComment = !!(_perms.canEdit || _perms.isAdmin);
    if(newBtnEl){
      newBtnEl.style.display = _canAddComment ? '' : 'none';
      newBtnEl.onclick = function(){ _commentsOpenComposeWindow(p); };
    }

    document.getElementById('commentsModalClose').onclick = function(){
      // Retour utilisateur (mécanisme partagé, voir js/render-documents.js) :
      // #commentsModalOverlay ne s'ouvre jamais seul — toujours par-dessus la
      // fiche produit (#viewOverlay) encore ouverte derrière.
      if(typeof window._isOtherOverlayOpen !== 'function' || !window._isOtherOverlayOpen('commentsModalOverlay')){
        document.body.classList.remove('modal-open');
      }
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(overlay, function(){ overlay.style.display = 'none'; });
      } else {
        overlay.style.display = 'none';
      }
    };
    // clic extérieur bloqué — géré par _initModalEscape()
  };

  // Menu ⋯ générique (js/popup.js) — un seul appel suffit (_bindKebabMenuOn
  // ignore tout second appel sur le même host), à poser sur l'overlay lui-
  // même plutôt que sur document (voir la mise en garde en tête de
  // _bindKebabMenuOn : un listener sur document ne recevrait jamais aucun
  // clic ici, #commentsModalOverlay fait partie des fenêtres dont
  // _initModalEscape stoppe la propagation de chaque clic interne).
  if(typeof _bindKebabMenuOn === 'function'){
    _bindKebabMenuOn(document.getElementById('commentsModalOverlay'));
  }
  // ── Fin modale Commentaires ──────────────────────────────────────
