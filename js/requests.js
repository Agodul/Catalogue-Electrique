"use strict";

// ═══════════════════════════════════════════════════════════════
//  MODULE DEMANDES (_req)
//  Workflow : user non-admin soumet des modifications
//             admin valide ou refuse
// ═══════════════════════════════════════════════════════════════

  var _reqPollInterval = null;
  var _reqPanelTab     = 'admin'; // 'admin' | 'mine'

  // ── Helpers ───────────────────────────────────────────────────
  function reqServerUrl(){
    return localStorage.getItem('cat_server_url') || '';
  }
  function reqHeaders(){
    return typeof window.authHeaders === 'function' ? window.authHeaders() : {};
  }
  function reqCurrentUser(){
    return typeof authGetCurrentUser === 'function' ? authGetCurrentUser() : null;
  }
  function reqIsAdmin(){
    var u = reqCurrentUser();
    return u && u.isAdmin;
  }

  // ── Badge notification ────────────────────────────────────────
  async function reqUpdateBadge(){
    var sUrl = reqServerUrl();
    if(!sUrl || !reqIsAdmin()) return;
    try {
      var h = Object.assign({}, reqHeaders());
      delete h['Content-Type'];
      var [rData, rDocs] = await Promise.all([
        fetch(sUrl + '/checkReq', { headers: h }),
        fetch(sUrl + '/checkDocsReq', { headers: h })
      ]);
      var dData = rData.ok ? await rData.json() : { count: 0 };
      var total = (dData.count || 0);
      var badge = document.getElementById('requestsBadge');
      if(badge){
        badge.textContent = total > 0 ? (total > 99 ? '99+' : total) : '';
        badge.style.display = total > 0 ? '' : 'none';
      }
      var badgeMenu = document.getElementById('requestsBadgeMenu');
      if(badgeMenu){
        badgeMenu.textContent = total > 0 ? (total > 99 ? '99+' : total) : '';
        badgeMenu.style.display = total > 0 ? '' : 'none';
      }
    } catch(e) {}
  }

  // ── Polling ───────────────────────────────────────────────────
  function reqStartPolling(){
    reqStopPolling();
    if(!reqServerUrl() || !reqIsAdmin()) return;
    reqUpdateBadge();
    _reqPollInterval = setInterval(reqUpdateBadge, 30000);
  }
  function reqStopPolling(){
    if(_reqPollInterval){ clearInterval(_reqPollInterval); _reqPollInterval = null; }
  }
  window._reqStartPolling = reqStartPolling;
  window._reqStopPolling  = reqStopPolling;

  // ── Soumettre une demande (user non-admin) ────────────────────
  window.reqSubmit = async function(payload, existingProduct){
    var sUrl = reqServerUrl();
    if(!sUrl) return false;
    var user = reqCurrentUser();
    if(!user) return false;
    var username = user.username || user.name || 'user';
    try {
      var h = reqHeaders();
      // Envoyer la demande données
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
      var r = await fetch(sUrl + '/pushDatasReq', {
        method: 'POST',
        headers: h,
        body: JSON.stringify([toSend])
      });
      return r.ok;
    } catch(e) {
      console.warn('reqSubmit:', e);
      return false;
    }
  };

  // ── Annuler une demande (user) ────────────────────────────────
  window.reqCancel = async function(ref){
    var sUrl = reqServerUrl();
    if(!sUrl) return false;
    var user = reqCurrentUser();
    if(!user) return false;
    var username = user.username || user.name || 'user';
    try {
      var h = Object.assign({}, reqHeaders());
      delete h['Content-Type'];
      var r = await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(username), {
        method: 'DELETE', headers: h
      });
      // Supprimer aussi les docs de la demande
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(username), {
        method: 'DELETE', headers: h
      }).catch(function(){});
      return r.ok;
    } catch(e) { return false; }
  };

  // ── Accepter une demande (admin) ─────────────────────────────
  window.reqAccept = async function(ref, user){
    var sUrl = reqServerUrl();
    if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = reqHeaders();
      var hGet = Object.assign({}, h); delete hGet['Content-Type'];

      // 1. Récupérer la demande
      var r = await fetch(sUrl + '/pullDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { headers: hGet });
      if(!r.ok) return false;
      var d = await r.json();
      if(!d.items || !d.items.length) return false;
      // L'API retourne {ref, user, data:{...}} — les vraies données sont dans .data
      var item = d.items[0].data || {};

      // Nettoyer les champs _req avant de pousser
      delete item._reqUser; delete item._reqAt; delete item._reqOriginal;
      item.updatedAt = Date.now();

      // 2. Pousser vers le catalogue principal
      var r2 = await fetch(sUrl + '/pushDatas', {
        method: 'POST', headers: h,
        body: JSON.stringify([item])
      });
      if(!r2.ok) return false;

      // 3. Récupérer et pousser les docs associés
      var rDocs = await fetch(sUrl + '/pullDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { headers: hGet });
      if(rDocs.ok){
        var dDocs = await rDocs.json();
        if(dDocs.items && dDocs.items.length){
          // Re-uploader chaque doc vers le catalogue principal
          for(var i = 0; i < dDocs.items.length; i++){
            var doc = dDocs.items[i];
            // Récupérer le fichier binaire
            var rFile = await fetch(sUrl + '/pullDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { headers: hGet });
            if(rFile.ok){
              var blob = await rFile.blob();
              var fd = new FormData();
              fd.append('ref', ref);
              fd.append('document', blob, doc.filename || 'document.pdf');
              var hFd = Object.assign({}, reqHeaders()); delete hFd['Content-Type'];
              await fetch(sUrl + '/pushDocs', { method: 'POST', headers: hFd, body: fd }).catch(function(){});
            }
          }
        }
      }

      // 4. Supprimer la demande
      await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), {
        method: 'DELETE', headers: hGet
      });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), {
        method: 'DELETE', headers: hGet
      }).catch(function(){});

      return true;
    } catch(e) { console.warn('reqAccept:', e); return false; }
  };

  // ── Refuser une demande (admin) ──────────────────────────────
  window.reqRefuse = async function(ref, user){
    var sUrl = reqServerUrl();
    if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      await fetch(sUrl + '/deleteDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), {
        method: 'DELETE', headers: h
      });
      await fetch(sUrl + '/deleteDocsReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), {
        method: 'DELETE', headers: h
      }).catch(function(){});
      return true;
    } catch(e) { return false; }
  };

  // ── Charger les demandes (admin) ─────────────────────────────
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
        html += '<div style="padding:10px 20px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);background:var(--paper);">'
          + '<i class="ti ti-user" style="font-size:12px;"></i> ' + escapeHtml(u) + ' — ' + byUser[u].length + ' demande(s)</div>';
        byUser[u].forEach(function(item){
          html += reqRenderAdminItem(item, u);
        });
      });
      body.innerHTML = html;

      // Clic sur item → modale détail
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
    var data     = (item.data && item.data.data) || item.data || {};
    var original = data._reqOriginal;
    var reqAt    = data._reqAt ? new Date(data._reqAt).toLocaleString('fr-FR') : '';
    var isNew    = !original;
    var refKey   = escapeHtml(item.ref);
    var userKey  = escapeHtml(user);

    // Diff champs
    var FIELDS = {
      name:'Nom', brand:'Marque', family:'Famille', series:'Série',
      supplier:'Fournisseur', price:'Prix', priceCatalogue:'Prix catalogue',
      desc:'Description', url:'URL', leadTime:'Délai', available3DX:'3DX'
    };
    var diffHtml = '';
    if(original){
      Object.keys(FIELDS).forEach(function(k){
        var ov = String(original[k] || '');
        var nv = String(data[k] || '');
        if(ov !== nv){
          diffHtml += '<div class="req-diff-field">'
            + '<span class="req-diff-label">' + FIELDS[k] + '</span>'
            + '<span class="req-diff-old">' + escapeHtml(ov || '—') + '</span>'
            + '<span class="req-diff-arrow"> → </span>'
            + '<span class="req-diff-new">' + escapeHtml(nv || '—') + '</span>'
            + '</div>';
        }
      });
      if(!diffHtml) diffHtml = '<div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">Aucune différence détectée</div>';
    } else {
      // Nouveau produit : afficher toutes les infos
      Object.keys(FIELDS).forEach(function(k){
        var v = String(data[k] || '');
        if(v){
          diffHtml += '<div class="req-diff-field">'
            + '<span class="req-diff-label">' + FIELDS[k] + '</span>'
            + '<span class="req-diff-new">' + escapeHtml(v) + '</span>'
            + '</div>';
        }
      });
      if(data.priceHistory && data.priceHistory.length){
        diffHtml += '<div class="req-diff-field"><span class="req-diff-label">Historique prix</span>'
          + '<span class="req-diff-new">' + data.priceHistory.map(function(h){ return h.price + ' (' + (h.date ? new Date(h.date).toLocaleDateString('fr-FR') : '') + ')'; }).join(', ') + '</span></div>';
      }
    }

    // Photo si disponible
    var photoHtml = '';
    if(data.photo){
      photoHtml = '<img src="' + escapeHtml(data.photo) + '" style="width:100%;max-height:180px;object-fit:contain;border-radius:8px;background:#f5f5f5;margin-bottom:10px;" onerror="this.style.display=&quot;none&quot;">';
    }

    // Détail collapsible
    var detailId = 'req-detail-' + refKey + '-' + userKey.replace(/[^a-z0-9]/gi,'');
    return '<div class="req-item" style="cursor:pointer;" data-req-detail="' + refKey + '" data-req-user-detail="' + userKey + '">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="var d=document.getElementById(&quot;' + detailId + '&quot;);d.style.display=d.style.display===&quot;none&quot;?&quot;block&quot;:&quot;none&quot;;">'
      +   '<div>'
      +     '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + refKey + '</div>'
      +     '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(data.name || '') + (reqAt ? ' · ' + reqAt : '') + '</div>'
      +   '</div>'
      +   '<div style="display:flex;align-items:center;gap:8px;">'
      +     '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:' + (isNew ? '#DCFCE7' : '#FEF3C7') + ';color:' + (isNew ? '#065F46' : '#92400E') + ';font-weight:700;">' + (isNew ? 'Nouveau' : 'Modification') + '</span>'
      +     '<i class="ti ti-chevron-down" style="font-size:14px;color:var(--ink-soft);"></i>'
      +   '</div>'
      + '</div>'
      + '<div id="' + detailId + '" style="display:none;margin-top:10px;">'
      +   photoHtml
      +   diffHtml
      +   '<div class="req-actions" style="margin-top:10px;">'
      +     '<button class="req-btn-accept" data-req-accept="' + refKey + '" data-req-user="' + userKey + '"><i class="ti ti-check"></i> Accepter</button>'
      +     '<button class="req-btn-refuse" data-req-refuse="' + refKey + '" data-req-user="' + userKey + '"><i class="ti ti-x"></i> Refuser</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  // ── Charger mes demandes (user) ───────────────────────────────
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
        var data = it.data || {};
        var reqAt = data._reqAt ? new Date(data._reqAt).toLocaleString('fr-FR') : '';
        return '<div class="req-item">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;">'
          +   '<div>'
          +     '<div style="font-size:13px;font-weight:700;color:var(--ink);">' + escapeHtml(it.ref) + '</div>'
          +     '<div style="font-size:11px;color:var(--ink-soft);margin-top:1px;">' + escapeHtml(data.name || '') + (reqAt ? ' · Soumis le ' + reqAt : '') + '</div>'
          +   '</div>'
          +   '<span style="font-size:10px;padding:2px 7px;border-radius:10px;background:#FEF3C7;color:#92400E;font-weight:700;">En attente</span>'
          + '</div>'
          + '<div class="req-actions">'
          +   '<button class="req-btn-cancel" data-req-cancel="' + escapeHtml(it.ref) + '"><i class="ti ti-trash"></i> Annuler</button>'
          + '</div>'
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
    var subtitle = document.getElementById('requestsPanelSubtitle');
    // Afficher/masquer onglet admin
    var tabAdmin = document.getElementById('reqTabAdmin');
    if(tabAdmin) tabAdmin.style.display = reqIsAdmin() ? '' : 'none';

    // Si non-admin, forcer onglet "mes demandes"
    if(!reqIsAdmin()) _reqPanelTab = 'mine';

    if(_reqPanelTab === 'admin'){
      reqLoadAdminList();
      if(subtitle) subtitle.textContent = 'Modifications proposées par les utilisateurs';
    } else {
      reqLoadMineList();
      if(subtitle) subtitle.textContent = 'Vos modifications en attente de validation';
    }
  }

  function reqClosePanel(){
    var overlay = document.getElementById('requestsOverlay');
    if(overlay) overlay.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  // ── Init listeners (différé, après DOM ready) ─────────────────
  function reqInitListeners(){
    var btnReqMenuEl = document.getElementById('btnRequestsMenu');
    if(btnReqMenuEl) btnReqMenuEl.addEventListener('click', function(){ document.getElementById('hdrMenu').classList.remove('show'); reqOpenPanel(); });

    var panelClose = document.getElementById('requestsPanelClose');
    if(panelClose) panelClose.addEventListener('click', reqClosePanel);

    var overlay = document.getElementById('requestsOverlay');
    if(overlay) overlay.addEventListener('click', function(e){
      if(e.target === this) reqClosePanel();
    });

    // Onglets
    document.querySelectorAll('.req-tab').forEach(function(tab){
      tab.addEventListener('click', function(){
        _reqPanelTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.req-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        reqRefreshPanel();
      });
    });

    // Tout accepter / tout refuser
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

  } // fin reqInitListeners

  // Appeler après chargement DOM
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', reqInitListeners);
  } else {
    reqInitListeners();
  }

  // Exposer pour démarrage depuis auth.js
  window._reqUpdateBadge  = reqUpdateBadge;