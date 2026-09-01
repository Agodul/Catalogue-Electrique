  var _cardIdx = 0; // compteur réinitialisé à chaque render pour l'animation cascade

  function renderCard(p){
    var idx = _cardIdx++;
    var photo = p.photo
      ? '<img src="'+escapeHtml(p.photo)+'" alt="'+escapeHtml(p.name||p.ref)+'" loading="lazy" data-fallback="append-note">'
      : '<span class="ph-placeholder sans">Pas de photo</span>';
    var tags = '';
    var tagItems = [];
    if(p.family) tagItems.push('<span class="tag family">'+escapeHtml(p.family)+'</span>');
    if(p.series) tagItems.push('<span class="tag series">'+escapeHtml(p.series)+'</span>');
    if(tagItems.length){
      tags = '<div class="tags">' + tagItems.join('') + '</div>';
    }
    // La bulle de hausse reste avec le reste des infos prix (retour
    // utilisateur : ne pas l'isoler sur la photo). Pour garder l'alignement
    // entre cartes même quand elle retombe sur une 2e ligne (prix + remise +
    // hausse ne tiennent pas toujours sur une seule ligne selon la longueur
    // des nombres) — plutôt que d'espérer que tout tienne sur une ligne et
    // gérer le débordement en secours (ancien comportement : le prix barré,
    // le prix et les badges se disputaient la même ligne et cassaient au
    // milieu d'un nombre selon la largeur dispo, retour utilisateur), la
    // structure est maintenant TOUJOURS empilée : prix catalogue barré, puis
    // prix remisé juste en dessous, puis les badges (remise/hausse) côte à
    // côte sur leur propre ligne. Prévisible dans tous les cas plutôt que
    // dépendant de la largeur de carte et du nombre de chiffres.
    var jumpPct = getLastPriceJumpPct(p);
    var priceJumpBadge = jumpPct !== null && jumpPct >= PRICE_ALERT_THRESHOLD
      ? '<span class="price-jump-badge" title="Hausse de '+jumpPct.toFixed(1)+' % depuis le dernier prix"><i class="ti ti-alert-triangle" aria-hidden="true"></i> +'+jumpPct.toFixed(0)+'%</span>'
      : '';
    var origPrice = getOriginalPrice(p);
    var discPct = getDiscountPct(p);
    var discBadge = discPct !== null && discPct < 0
      ? '<span class="discount-badge badge-anim">-'+Math.abs(discPct).toFixed(0)+' %</span>'
      : '';
    var priceHtml = (origPrice ? '<span class="price-original" title="Prix catalogue fabricant">'+escapeHtml(_displayPrice(origPrice))+'</span>' : '')+
                    '<span class="price-main">'+escapeHtml(_displayPrice(p.price)||'—')+'</span>'+
                    ((discBadge || priceJumpBadge) ? '<span class="price-badges">'+discBadge+priceJumpBadge+'</span>' : '');
    var supplierHtml = p.supplier
      ? '<div class="card-supplier">'+escapeHtml(p.supplier)+'</div>'
      : '';
    var meta = '';
    if(p.brand) meta += escapeHtml(p.brand);
    if(p.supplier) meta += (meta ? ' · ' : '') + escapeHtml(p.supplier);

    // Description courte : 100 chars max, coupe au dernier espace
    var rawDesc = stripHtmlTags(p.desc || '').trim();
    var shortDesc = rawDesc.length > 120
      ? rawDesc.slice(0, rawDesc.lastIndexOf(' ', 120) || 120) + '…'
      : rawDesc;

    // Nom : masquer si identique à la ref
    var displayName = (p.name && p.name.trim() !== (p.ref||'').trim())
      ? escapeHtml(p.name)
      : '';

    return '<div class="card card-visible" data-view="'+p.id+'" style="animation-delay:'+Math.min(idx*55, 600)+'ms">'+
      '<div class="photo">'+
        photo+
        (p.available3DX ? '<div class="three-d-overlay" title="Disponible dans la 3DEXPERIENCE"><img src="assets/three-d-badge.png" alt="3DEX"></div>' : '')+
        (p.essential ? '<div class="essential-badge" title="Produit essentiel"><i class="ti ti-star-filled"></i> Standard</div>' : '')+
      '</div>'+
      '<div class="body">'+
        '<div class="body-top">'+
          '<div class="ref">'+escapeHtml(p.ref||'—')+'</div>'+
          // title="" : nom tronqué visuellement à 2 lignes (-webkit-line-clamp,
          // voir css/styles.css) — le survol affiche le nom complet via
          // l'infobulle native du navigateur plutôt que de devoir ouvrir la
          // fiche pour le lire en entier (retour utilisateur — uniquement le
          // nom, pas la description).
          '<div class="name"'+(displayName ? ' title="'+escapeHtml(p.name||'')+'"' : '')+'>'+(displayName ? escapeHtml(p.name||'') : '')+'</div>'+
          '<div class="desc">'+(shortDesc ? escapeHtml(shortDesc) : '')+'</div>'+
        '</div>'+
        '<div class="body-bottom">'+
          '<div class="price-row">'+
            '<div class="price">'+priceHtml+'</div>'+
          '</div>'+
          (tags || '')+
        '</div>'+
      '</div>'+
    '</div>';
  }

  async function deleteProduct(id){
    var p = products.find(function(x){return x.id===id;});
    if(!p) return;

    // Le bouton "Supprimer" est déjà masqué sans ce droit (voir render.js
    // plus haut), mais cette fonction est aussi accessible directement
    // (console, autre appel) — vérifier ici aussi plutôt que de se reposer
    // uniquement sur l'UI (retour utilisateur : vérifier que les
    // permissions sont réellement appliquées, pas juste visuellement).
    var _perms = window._userPerms || {};
    if(!(_perms.canDelete || _perms.isAdmin)){
      showToast('Droit de suppression requis', 'err', 3000);
      return;
    }

    // Empêche de supprimer un produit que quelqu'un d'autre est en train de
    // modifier (retour utilisateur) — même vérification que "Modifier" (voir
    // _checkProductEditLockBlocks dans js/actions-editlock.js), avant même la
    // confirmation pour ne pas faire croire que la suppression va aboutir.
    if(typeof window._checkProductEditLockBlocks === 'function'){
      var lockCheck = await window._checkProductEditLockBlocks(p, 'supprimer');
      if(lockCheck.blocked){
        var delPopupMsg = lockCheck.lockedBy
          ? '<strong>' + escapeHtml(lockCheck.lockedBy) + '</strong> est en cours de modification de ce produit — impossible de le supprimer pour le moment.'
          : escapeHtml(lockCheck.message);
        customAlert('Produit en cours de modification', delPopupMsg);
        return;
      }
    }

    var confirmed = await customConfirm('Supprimer ce produit ?', '« '+escapeHtml(p.name||p.ref)+' » sera supprimé définitivement du catalogue.', { okLabel: 'Supprimer', danger: true });
    if(confirmed){
      var ref = p.ref;
      var sUrl = localStorage.getItem('cat_server_url');

      // Si serveur configuré → supprimer d'abord sur le serveur
      if(sUrl && ref){
        try{
          var r = await fetch(sUrl+'/deleteDatas?ref='+encodeURIComponent(ref), { method:'DELETE', headers: (function(){ var h = typeof window.authHeaders==='function'?Object.assign({},window.authHeaders()):{}; delete h['Content-Type']; return h; })() });
          if(!r.ok){
            showToast('Impossible de supprimer sur le serveur (HTTP '+r.status+') — suppression annulée', 'err', 4000);
            return;
          }
          // Forcer un re-sync complet sur tous les appareils au prochain check
          localStorage.setItem('cat_server_last_sync', '0');
        }catch(e){
          showToast('Serveur inaccessible — suppression annulée', 'err', 4000);
          return;
        }
      }

      // Supprimer en local
      products = products.filter(function(x){return x.id!==id;});
      // [] : la suppression côté serveur est déjà faite explicitement
      // au-dessus (/deleteDatas) — rien d'autre à repousser ici. save() sans
      // filtre repoussait TOUT le catalogue local restant à chaque
      // suppression de produit, avec createdAt forcé à maintenant sur
      // chacun (même risque que le bug corrigé dans syncFromServer/
      // pushToServer : un catalogue local resté en retard écraserait les
      // modifs récentes d'autrui, sur CHAQUE produit du catalogue, à chaque
      // suppression).
      save(true, []); // skipFileWrite pour ne pas bloquer

      // Actualisation en arrière-plan sans interrompre l'utilisateur
      var homePage = document.getElementById('homePage');
      var isOnHome = homePage && !homePage.classList.contains('hidden');
      if(isOnHome){
        renderHome();
      } else {
        // Fermer la fiche si elle affiche le produit supprimé
        var viewOverlay = document.getElementById('viewOverlay');
        if(viewOverlay && viewOverlay.classList.contains('open')){
          document.body.classList.remove('modal-open');
          if(typeof window._closeOverlayAnimated === 'function'){
            window._closeOverlayAnimated(viewOverlay, function(){ viewOverlay.classList.remove('open'); });
          } else {
            viewOverlay.classList.remove('open');
          }
        }
        render();
      }
      showToast(sUrl ? 'Produit supprimé du catalogue et du serveur ✓' : 'Produit supprimé ✓', 'ok', 2500);
    }
  }
