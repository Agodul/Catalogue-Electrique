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
        // pushToServer, storage.js/js/actions-settings-sync.js — retour utilisateur : vieux
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

