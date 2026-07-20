"use strict";

// ═══════════════════════════════════════════════════════════════
//  MODULE DEMANDES (_req)
// ═══════════════════════════════════════════════════════════════

  var _reqPollInterval = null;
  var _reqPanelTab     = 'admin';

  // ── Helpers ───────────────────────────────────────────────────
  function reqServerUrl(){ return localStorage.getItem('cat_server_url') || ''; }
  function reqHeaders(){ return typeof window.authHeaders === 'function' ? window.authHeaders() : {}; }
  function reqCurrentUser(){ return typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null; }
  function reqIsAdmin(){ var u = reqCurrentUser(); return u && u.isAdmin; }

  // ── Badge notification ────────────────────────────────────────
  var _reqLastCount   = 0;
  var _reqLastCheckTs = 0;  // timestamp du dernier poll réussi (ms)

  function _reqNotifyAdmin(newCount){
    if(!reqIsAdmin()) return;
    if(newCount <= _reqLastCount) return;
    if(typeof Notification === 'undefined') return;
    if(Notification.permission !== 'granted') return;
    var diff = newCount - _reqLastCount;
    try {
      new Notification('Catalogue SPI — Nouvelle demande', {
        body: diff === 1
          ? 'Une nouvelle demande est en attente de validation.'
          : diff + ' nouvelles demandes sont en attente de validation.',
        icon: '/assets/icon-192.png',
        tag: 'spi-req-badge',
        renotify: true,
        silent: false
      });
    } catch(e) {}
  }

  function _reqAskNotifPermission(){
    if(typeof Notification === 'undefined') return;
    if(Notification.permission === 'default'){
      Notification.requestPermission();
    }
  }

  async function reqUpdateBadge(){
    var sUrl = reqServerUrl();
    if(!sUrl || !reqIsAdmin()) return;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      // Premier poll : pas de timestamp → compte tout
      // Polls suivants : timestamp= pour ne compter que les nouvelles entrées
      var tsParam = _reqLastCheckTs > 0 ? '?timestamp=' + _reqLastCheckTs : '';
      var now = Date.now();
      var [rData, rDocs] = await Promise.all([
        fetch(sUrl + '/checkReq'     + tsParam, { headers: h }),
        fetch(sUrl + '/checkDocsReq' + tsParam, { headers: h })
      ]);
      var dData = rData.ok ? await rData.json() : null;
      var dDocs = rDocs.ok ? await rDocs.json() : null;
      if(!dData && !dDocs) return; // serveur down, on ne met pas à jour
      // Premier poll : total absolu ; polls suivants : delta (nouvelles depuis lastCheck)
      var total;
      if(_reqLastCheckTs === 0){
        total = ((dData && dData.count) || 0) + ((dDocs && dDocs.refs) || 0);
      } else {
        // Des nouvelles demandes sont arrivées depuis le dernier check
        var newData = (dData && dData.count) || 0;
        var newDocs = (dDocs && dDocs.refs)  || 0;
        // Si delta > 0, ajouter au total connu ; sinon garder le total actuel
        total = _reqLastCount + newData + newDocs;
      }
      _reqLastCheckTs = now;
      ['requestsBadge','requestsBadgeMenu'].forEach(function(id){
        var el = document.getElementById(id);
        if(el){ el.textContent = total > 0 ? (total > 99 ? '99+' : total) : ''; el.style.display = total > 0 ? '' : 'none'; }
      });
      _reqNotifyAdmin(total);
      _reqLastCount = total;
    } catch(e) {}
  }

  // ── Polling ───────────────────────────────────────────────────
  function reqStartPolling(){
    reqStopPolling();
    if(!reqServerUrl() || !reqIsAdmin()) return;
    _reqAskNotifPermission();
    reqUpdateBadge();
    _reqPollInterval = setInterval(reqUpdateBadge, 30000);
  }
  function reqStopPolling(){ if(_reqPollInterval){ clearInterval(_reqPollInterval); _reqPollInterval = null; } _reqLastCheckTs = 0; _reqLastCount = 0; }
  window._reqStartPolling = reqStartPolling;
  window._reqStopPolling  = reqStopPolling;

  // ── Soumettre une demande ─────────────────────────────────────
  window.reqSubmit = async function(payload, existingProduct){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    var username = user.username || user.name || 'user';
    try {
      var h = reqHeaders();
      var now = Date.now();
      var toSend = Object.assign({}, payload, {
        id:           payload.id || ('p_' + now + '_' + Math.random().toString(36).substr(2,6)),
        user:         username,
        createdAt:    payload.createdAt || now,
        updatedAt:    now,
        _reqUser:     username,
        _reqAt:       now,
        _reqOriginal: existingProduct || null
      });
      var r = await fetch(sUrl + '/pushDatasReq', { method:'POST', headers:h, body:JSON.stringify([toSend]) });
      return r.ok;
    } catch(e) { console.warn('reqSubmit:', e); return false; }
  };

  // ── Annuler une demande ───────────────────────────────────────
  window.reqCancel = async function(ref){
    var sUrl = reqServerUrl(); if(!sUrl) return false;
    var user = reqCurrentUser(); if(!user) return false;
    var username = user.username || user.name || 'user';
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(username), { method:'DELETE', headers:h });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(username), { method:'DELETE', headers:h }).catch(function(){});
      return r.ok;
    } catch(e) { return false; }
  };

  // ── Accepter une demande ──────────────────────────────────────
  // overrideData : si fourni (édition admin), utiliser directement ces données
  //                 au lieu de re-fetcher depuis le serveur
  window.reqAccept = async function(ref, user, overrideData){
    var sUrl = reqServerUrl(); if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = reqHeaders();
      var hGet = Object.assign({}, h); delete hGet['Content-Type'];
      var item;
      if(overrideData){
        // Données déjà éditées côté admin — on les utilise directement
        item = Object.assign({}, overrideData);
      } else {
        // Cas normal : récupérer depuis le serveur
        var r = await fetch(sUrl + '/pullDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { headers: hGet });
        if(!r.ok) return false;
        var d = await r.json();
        if(!d.items || !d.items.length) return false;
        item = d.items[0].data || {};
      }
      delete item._reqUser; delete item._reqAt; delete item._reqOriginal; delete item.user;
      item.updatedAt = Date.now();
      var r2 = await fetch(sUrl + '/pushDatas', { method:'POST', headers:h, body:JSON.stringify([item]) });
      if(!r2.ok) return false;
      await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:hGet });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:hGet }).catch(function(){});
      return true;
    } catch(e) { console.warn('reqAccept:', e); return false; }
  };

  // ── Refuser une demande ───────────────────────────────────────
  window.reqRefuse = async function(ref, user){
    var sUrl = reqServerUrl(); if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:h });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { method:'DELETE', headers:h }).catch(function(){});
      return true;
    } catch(e) { return false; }
  };

  // ── Modale détail demande ─────────────────────────────────────
  function reqOpenDetail(item, user){
    var data     = item.data || {};
    var original = data._reqOriginal;
    var isNew    = !original;
    var overlay  = document.getElementById('reqDetailOverlay');
    if(!overlay) return;

    // Remplir le titre
    var titleEl = document.getElementById('reqDetailTitle');
    var subtitleEl = document.getElementById('reqDetailSubtitle');
    if(titleEl)    titleEl.textContent = (isNew ? 'Nouveau produit : ' : 'Modification : ') + escapeHtml(item.ref);
    if(subtitleEl) subtitleEl.textContent = 'Soumis par ' + escapeHtml(user) + (data._reqAt ? ' · ' + new Date(data._reqAt).toLocaleString('fr-FR') : '');

    // Construire le corps avec le même HTML que openView
    var body = document.getElementById('reqDetailBody');
    if(!body) return;

    var p = isNew ? data : Object.assign({}, original, data, { _reqOriginal: original, _reqUser: data._reqUser, _reqAt: data._reqAt });
    // Pour une modif : afficher les valeurs proposées
    if(!isNew) {
      Object.keys(data).forEach(function(k){
        if(k !== '_reqOriginal' && k !== '_reqUser' && k !== '_reqAt') p[k] = data[k];
      });
    }

    // Photo
    var photoHtml = '';
    if(p.photo){
      photoHtml = '<div class="vm-photo" style="height:200px;border-radius:10px 10px 0 0;overflow:hidden;background:#eee;margin-bottom:16px;">'
        + '<img src="' + escapeHtml(p.photo) + '" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display=\'none\'">'
        + '</div>';
    }

    // Référence + nom
    var refHtml = '<div class="vm-ref" style="margin-bottom:4px;">' + escapeHtml((p.brand ? p.brand + ' — ' : '') + (p.ref || '')) + '</div>';
    var nameHtml = '<div class="vm-name" style="margin-bottom:12px;">' + escapeHtml(p.name || '(Sans nom)') + '</div>';

    // Méta
    var metaItems = [];
    if(p.brand)    metaItems.push(['MARQUE',       p.brand]);
    if(p.ref)      metaItems.push(['RÉFÉRENCE',    p.ref]);
    if(p.family)   metaItems.push(['FAMILLE',      p.family]);
    if(p.series)   metaItems.push(['SÉRIE',        p.series]);
    if(p.supplier) metaItems.push(['FOURNISSEUR',  p.supplier]);
    if(p.leadTime) metaItems.push(['DÉLAI',        p.leadTime]);
    if(p.url)      metaItems.push(['URL',          p.url]);

    var metaHtml = '';
    if(metaItems.length){
      metaHtml = '<div class="vm-meta" style="margin-bottom:12px;">'
        + metaItems.map(function(m){
            var val = m[0] === 'URL'
              ? '<a href="' + escapeHtml(m[1]) + '" target="_blank" style="color:var(--copper-deep)">Ouvrir la page</a>'
              : '<span>' + escapeHtml(m[1]) + '</span>';
            return '<div class="vm-meta-item"><label>' + escapeHtml(m[0]) + '</label>' + val + '</div>';
          }).join('')
        + '</div>';
    }

    // Description
    var descHtml = p.desc ? '<div class="vm-desc" style="margin-bottom:12px;">' + escapeHtml(p.desc) + '</div>' : '';

    // Prix
    var priceHtml = '';
    if(p.price){
      var orig = p.priceCatalogue && p.priceCatalogue !== p.price ? p.priceCatalogue : '';
      priceHtml = '<div class="vm-price-row"><div class="vm-price">'
        + (orig ? '<span class="vm-price-original">' + escapeHtml(orig) + '</span>' : '')
        + escapeHtml(p.price)
        + '</div></div>';
    }

    // Historique prix
    var histHtml = '';
    if(p.priceHistory && p.priceHistory.length){
      histHtml = '<div class="vm-price-history">'
        + '<div style="font-size:13px;font-weight:700;margin:12px 0 8px;">Historique des prix</div>'
        + p.priceHistory.map(function(h){
            var d = h.date ? new Date(h.date).toLocaleDateString('fr-FR') : '';
            return '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0;border-bottom:1px solid var(--line);">'
              + '<span>' + escapeHtml(d || h.label || '') + '</span>'
              + '<span>' + escapeHtml(h.price || '') + '</span>'
              + '</div>';
          }).join('')
        + '</div>';
    }

    // Diff (pour modification) 
    var diffHtml = '';
    if(!isNew && original){
      var FIELDS = { name:'Nom', brand:'Marque', family:'Famille', series:'Série', supplier:'Fournisseur', price:'Prix', priceCatalogue:'Prix catalogue', desc:'Description', url:'URL', leadTime:'Délai' };
      var diffs = [];
      Object.keys(FIELDS).forEach(function(k){
        var ov = String(original[k]||''); var nv = String(data[k]||'');
        if(ov !== nv) diffs.push({ label: FIELDS[k], old: ov, new: nv });
      });
      if(diffs.length){
        diffHtml = '<div style="margin-bottom:16px;padding:12px;background:#FEF3C7;border-radius:8px;border:1px solid #FDE68A;">'
          + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#92400E;margin-bottom:8px;">Modifications proposées</div>'
          + diffs.map(function(d){
              return '<div style="display:grid;grid-template-columns:100px 1fr 1fr;gap:4px 8px;align-items:center;padding:4px 0;border-bottom:1px solid #FDE68A;">'
                + '<span style="font-size:11px;font-weight:600;color:#92400E;">' + escapeHtml(d.label) + '</span>'
                + '<span style="font-size:12px;color:#991B1B;text-decoration:line-through;">' + escapeHtml(d.old||'—') + '</span>'
                + '<span style="font-size:12px;color:#065F46;font-weight:600;">' + escapeHtml(d.new||'—') + '</span>'
                + '</div>';
            }).join('')
          + '</div>';
      }
    }

    body.innerHTML = photoHtml + diffHtml + refHtml + nameHtml + metaHtml + descHtml + priceHtml + histHtml;

    // Boutons footer
    var btnAcc = document.getElementById('reqDetailAccept');
    var btnRef = document.getElementById('reqDetailRefuse');
    if(btnAcc){ btnAcc.disabled=false; btnAcc.innerHTML='<i class="ti ti-check"></i> Accepter';
      btnAcc.onclick = async function(){
        btnAcc.disabled=true; btnAcc.textContent='…';
        var ok = await window.reqAccept(item.ref, user);
        if(ok){ overlay.style.display='none'; document.body.classList.remove('modal-open'); showToast('Demande acceptée ✓','ok',2500); reqOpenPanel(); reqUpdateBadge(); }
        else { btnAcc.disabled=false; btnAcc.innerHTML='<i class="ti ti-check"></i> Accepter'; }
      };
    }
    if(btnRef){ btnRef.disabled=false; btnRef.innerHTML='<i class="ti ti-x"></i> Refuser';
      btnRef.onclick = async function(){
        btnRef.disabled=true;
        var ok = await window.reqRefuse(item.ref, user);
        if(ok){ overlay.style.display='none'; document.body.classList.remove('modal-open'); showToast('Demande refusée','ok',2500); reqOpenPanel(); reqUpdateBadge(); }
        else { btnRef.disabled=false; btnRef.innerHTML='<i class="ti ti-x"></i> Refuser'; }
      };
    }

    // Bouton Modifier — visible pour admins uniquement
    var btnEdit = document.getElementById('reqDetailEdit');
    if(btnEdit){
      btnEdit.style.display = reqIsAdmin() ? 'flex' : 'none';
      btnEdit.onclick = function(){ _reqStartEditMode(item, user, data, original, isNew); };
    }

    document.getElementById('reqDetailClose').onclick = function(){ overlay.style.display='none'; document.body.classList.remove('modal-open'); };
    overlay.onclick = null;
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
  }

  // ── Mode édition inline dans la modale détail demande ──────────
  function _reqStartEditMode(item, user, data, original, isNew){
    var body = document.getElementById('reqDetailBody');
    if(!body) return;
    var p = isNew ? Object.assign({}, data) : Object.assign({}, original, data);
    // Supprimer les clés internes de l'objet éditable
    var EDIT_FIELDS = [
      { key:'photo',           label:'Photo (URL)',     type:'text' },
      { key:'name',            label:'Nom',             type:'text' },
      { key:'brand',           label:'Marque',          type:'text' },
      { key:'ref',             label:'Référence',       type:'text' },
      { key:'family',          label:'Famille',         type:'text' },
      { key:'series',          label:'Série',           type:'text' },
      { key:'supplier',        label:'Fournisseur',     type:'text' },
      { key:'leadTime',        label:'Délai',           type:'text' },
      { key:'price',           label:'Prix',            type:'text' },
      { key:'priceCatalogue',  label:'Prix catalogue',  type:'text' },
      { key:'desc',            label:'Description',     type:'textarea' },
      { key:'url',             label:'URL produit',     type:'text' }
    ];

    var rows = EDIT_FIELDS.map(function(f){
      var val = escapeHtml(p[f.key] || '');
      if(f.type === 'textarea'){
        return '<div style="margin-bottom:12px;">'
          + '<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin-bottom:4px;">' + escapeHtml(f.label) + '</label>'
          + '<textarea data-key="' + f.key + '" rows="3" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:var(--font-sans);background:var(--paper);color:var(--ink);resize:vertical;box-sizing:border-box;">' + val + '</textarea>'
          + '</div>';
      }
      return '<div style="margin-bottom:12px;">'
        + '<label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin-bottom:4px;">' + escapeHtml(f.label) + '</label>'
        + '<input type="' + f.type + '" data-key="' + f.key + '" value="' + val + '" style="width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:7px;font-size:13px;font-family:var(--font-sans);background:var(--paper);color:var(--ink);box-sizing:border-box;">'
        + '</div>';
    }).join('');

    body.innerHTML = '<div style="padding:4px 0 8px;font-size:12px;color:var(--ink-soft);margin-bottom:12px;">Modifiez les champs ci-dessous avant d\'accepter la demande.</div>'
      + rows;

    // Changer les boutons du footer
    var btnAccept = document.getElementById('reqDetailAccept');
    var btnEdit   = document.getElementById('reqDetailEdit');
    var btnRefuse = document.getElementById('reqDetailRefuse');
    if(btnEdit)  btnEdit.style.display = 'none';
    if(btnRefuse) btnRefuse.innerHTML = '<i class="ti ti-arrow-left"></i> Annuler';

    // Remplacer temporairement Refuser → Annuler
    if(btnRefuse){
      btnRefuse.innerHTML = '<i class="ti ti-arrow-left"></i> Annuler';
      btnRefuse.onclick = function(){ reqOpenDetail(item, user); };
    }

    // Bouton Accepter → valider les modifs et accepter
    if(btnAccept){
      btnAccept.innerHTML = '<i class="ti ti-check"></i> Valider et accepter';
      btnAccept.onclick = async function(){
        // Collecter les valeurs éditées
        var edited = {};
        body.querySelectorAll('[data-key]').forEach(function(el){
          edited[el.dataset.key] = el.value;
        });
        // Fusionner avec les données de la demande
        var merged = Object.assign({}, data, edited);
        // Supprimer les clés internes avant d'envoyer au serveur
        delete merged._reqUser;
        delete merged._reqAt;
        delete merged._reqOriginal;
        delete merged.user;
        btnAccept.disabled = true; btnAccept.textContent = '…';
        // Passer les données éditées directement à reqAccept (3ème argument)
        var ok = await window.reqAccept(item.ref, user, merged);
        var overlay = document.getElementById('reqDetailOverlay');
        if(ok){ if(overlay){ overlay.style.display='none'; document.body.classList.remove('modal-open'); } showToast('Demande acceptée ✓','ok',2500); reqOpenPanel(); reqUpdateBadge(); }
        else { btnAccept.disabled=false; btnAccept.innerHTML='<i class="ti ti-check"></i> Valider et accepter'; }
      };
    }
  }

  // ── Charger les demandes admin ────────────────────────────────
  // ── Charger les demandes admin ────────────────────────────────
  async function reqLoadAdminList(){
    var sUrl = reqServerUrl();
    var body = document.getElementById('requestsBody');
    if(!body) return;
    body.innerHTML = '<div class="req-empty"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/pullDatasReq', { headers: h });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      var items = d.items || [];
      if(items.length === 0){
        body.innerHTML = '<div class="req-empty"><i class="ti ti-bell-off" style="font-size:32px;display:block;margin-bottom:8px;"></i>Aucune demande en attente</div>';
        var footer = document.getElementById('requestsFooter');
        if(footer) footer.style.display = 'none';
        return;
      }
      var footer = document.getElementById('requestsFooter');
      if(footer) footer.style.display = 'flex';

      // Grouper par user
      var byUser = {};
      items.forEach(function(it){
        var data = it.data || {};
        var u = data._reqUser || it.user || '?';
        if(!byUser[u]) byUser[u] = [];
        byUser[u].push({ ref: it.ref, data: data });
      });

      var html = '';
      Object.keys(byUser).forEach(function(u){
        html += '<div style="padding:10px 20px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);background:var(--paper);"><i class="ti ti-user" style="font-size:12px;"></i> ' + escapeHtml(u) + ' — ' + byUser[u].length + ' demande(s)</div>';
        byUser[u].forEach(function(item){
          html += reqRenderAdminItem(item, u);
        });
      });
      body.innerHTML = html;

      // Clic → modale détail
      body.querySelectorAll('[data-req-detail]').forEach(function(el){
        el.addEventListener('click', function(){
          var ref  = el.getAttribute('data-req-detail');
          var user = el.getAttribute('data-req-user-detail');
          var matchItem = items.find(function(it){ return it.ref === ref; });
          if(matchItem) reqOpenDetail(matchItem, user);
        });
      });
    } catch(e){
      body.innerHTML = '<div class="req-empty">Erreur : ' + escapeHtml(e.message) + '</div>';
    }
  }

  function reqRenderAdminItem(item, user){
    var data   = item.data || {};
    var reqAt  = data._reqAt ? new Date(data._reqAt).toLocaleString('fr-FR') : '';
    var isNew  = !data._reqOriginal;
    var refKey = escapeHtml(item.ref);
    var userKey = escapeHtml(user);
    return '<div class="req-item" style="cursor:pointer;" data-req-detail="' + refKey + '" data-req-user-detail="' + userKey + '">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;">'
      +   '<div>'
      +     '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(item.ref) + '</div>'
      +     '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(data.name || '') + (reqAt ? ' · ' + reqAt : '') + '</div>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px;">'
      +     '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:' + (isNew ? '#DCFCE7' : '#FEF3C7') + ';color:' + (isNew ? '#065F46' : '#92400E') + ';font-weight:700;">' + (isNew ? 'Nouveau' : 'Modification') + '</span>'
      +     '<i class="ti ti-chevron-right" style="font-size:14px;color:var(--ink-soft);"></i>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Charger mes demandes ──────────────────────────────────────
  async function reqLoadMineList(){
    var sUrl = reqServerUrl();
    var body = document.getElementById('requestsBody');
    if(!body) return;
    var user = reqCurrentUser();
    if(!user){ body.innerHTML = '<div class="req-empty">Non connecté</div>'; return; }
    var username = user.username || user.name || '';
    body.innerHTML = '<div class="req-empty"><i class="ti ti-loader-2" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/pullDatasReq?user=' + encodeURIComponent(username), { headers: h });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      var d = await r.json();
      var items = d.items || [];
      var footer = document.getElementById('requestsFooter');
      if(footer) footer.style.display = 'none';
      if(items.length === 0){
        body.innerHTML = '<div class="req-empty"><i class="ti ti-check-circle" style="font-size:32px;display:block;margin-bottom:8px;color:#059669;"></i>Aucune demande en attente</div>';
        return;
      }
      var html = items.map(function(it){
        var data  = it.data || {};
        var reqAt = data._reqAt ? new Date(data._reqAt).toLocaleString('fr-FR') : '';
        return '<div class="req-item">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;">'
          +   '<div><div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(it.ref) + '</div>'
          +   '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(data.name || '') + (reqAt ? ' · Soumis le ' + reqAt : '') + '</div></div>'
          +   '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;font-weight:700;">En attente</span>'
          + '</div>'
          + '<div class="req-actions"><button class="req-btn-cancel" data-req-cancel="' + escapeHtml(it.ref) + '"><i class="ti ti-trash"></i> Annuler</button></div>'
          + '</div>';
      }).join('');
      body.innerHTML = html;
      body.querySelectorAll('[data-req-cancel]').forEach(function(btn){
        btn.addEventListener('click', async function(){
          var ref = btn.getAttribute('data-req-cancel');
          if(!confirm('Annuler la demande pour ' + ref + ' ?')) return;
          btn.disabled = true;
          var ok = await window.reqCancel(ref);
          if(ok){ showToast('Demande annulée', 'ok', 2000); reqLoadMineList(); }
          else { showToast('Erreur', 'err', 3000); btn.disabled = false; }
        });
      });
    } catch(e){
      body.innerHTML = '<div class="req-empty">Erreur : ' + escapeHtml(e.message) + '</div>';
    }
  }

  // ── Ouvrir le panneau ─────────────────────────────────────────
  function reqOpenPanel(){
    var overlay = document.getElementById('requestsOverlay');
    if(!overlay) return;
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
    reqRefreshPanel();
  }

  function reqRefreshPanel(){
    var subtitle  = document.getElementById('requestsPanelSubtitle');
    var tabAdmin  = document.getElementById('reqTabAdmin');
    var tabMine   = document.getElementById('reqTabMine');
    var tabsDiv   = document.getElementById('requestsTabs');
    var isAdmin   = reqIsAdmin();

    // Admins : onglet unique "Demandes reçues", cacher "Mes demandes" et la barre d'onglets
    if(isAdmin){
      if(tabsDiv) tabsDiv.style.display = 'none';
      _reqPanelTab = 'admin';
      reqLoadAdminList();
      if(subtitle) subtitle.textContent = 'Modifications proposées par les utilisateurs';
    } else {
      if(tabsDiv) tabsDiv.style.display = '';
      if(tabAdmin) tabAdmin.style.display = 'none';
      _reqPanelTab = 'mine';
      reqLoadMineList();
      if(subtitle) subtitle.textContent = 'Vos modifications en attente de validation';
    }
  }

  function reqClosePanel(){
    var overlay = document.getElementById('requestsOverlay');
    if(overlay) overlay.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  // ── Init listeners ────────────────────────────────────────────
  function reqInitListeners(){
    var btnReqMenuEl = document.getElementById('btnRequestsMenu');
    if(btnReqMenuEl) btnReqMenuEl.addEventListener('click', function(){ document.getElementById('hdrMenu').classList.remove('show'); reqOpenPanel(); });

    // ── Boutons "Proposer un produit" ──
    ['btnProposeProduct','btnFabPropose'].forEach(function(id){
      var btn = document.getElementById(id);
      if(btn) btn.addEventListener('click', function(){
        if(typeof window._openProposeModal === 'function') window._openProposeModal(null);
      });
    });

    // ── Bouton "Proposer une modification" (fiche produit) ──
    var vmProposeBtn = document.getElementById('vmProposeBtn');
    if(vmProposeBtn) vmProposeBtn.addEventListener('click', function(){
      var productId = window._viewingId || null;
      if(typeof window._openProposeModal === 'function') window._openProposeModal(productId);
    });

    var panelClose = document.getElementById('requestsPanelClose');
    if(panelClose) panelClose.addEventListener('click', reqClosePanel);

    var overlay = document.getElementById('requestsOverlay');
    if(overlay) overlay.addEventListener('click', function(e){ if(e.target === this) reqClosePanel(); });

    document.querySelectorAll('.req-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        _reqPanelTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.req-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        reqRefreshPanel();
      });
    });

    var btnAccept = document.getElementById('btnAcceptAllRequests');
    if(btnAccept) btnAccept.addEventListener('click', async function(){
      if(!confirm('Accepter toutes les demandes ?')) return;
      var sUrl = reqServerUrl();
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/pullDatasReq', { headers: h });
      if(!r.ok) return;
      var d = await r.json();
      var items = d.items || [];
      for(var i = 0; i < items.length; i++){
        var it = items[i];
        var user = (it.data || {})._reqUser || it.user || '';
        await window.reqAccept(it.ref, user);
      }
      showToast(items.length + ' demande(s) acceptée(s) ✓', 'ok', 3000);
      reqOpenPanel(); reqUpdateBadge();
    });

    var btnRefuse = document.getElementById('btnRefuseAllRequests');
    if(btnRefuse) btnRefuse.addEventListener('click', async function(){
      if(!confirm('Refuser toutes les demandes ?')) return;
      var sUrl = reqServerUrl();
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/pullDatasReq', { headers: h });
      if(!r.ok) return;
      var d = await r.json();
      var items = d.items || [];
      for(var i = 0; i < items.length; i++){
        var it = items[i];
        var user = (it.data || {})._reqUser || it.user || '';
        await window.reqRefuse(it.ref, user);
      }
      showToast(items.length + ' demande(s) refusée(s)', 'ok', 3000);
      reqOpenPanel(); reqUpdateBadge();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', reqInitListeners);
  } else {
    reqInitListeners();
  }

  window._reqUpdateBadge = reqUpdateBadge;