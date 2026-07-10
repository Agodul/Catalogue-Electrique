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
  async function reqUpdateBadge(){
    var sUrl = reqServerUrl();
    if(!sUrl || !reqIsAdmin()) return;
    try {
      var h = Object.assign({}, reqHeaders()); delete h['Content-Type'];
      var r = await fetch(sUrl + '/checkReq', { headers: h });
      var d = r.ok ? await r.json() : { count: 0 };
      var total = d.count || 0;
      ['requestsBadge','requestsBadgeMenu'].forEach(function(id){
        var el = document.getElementById(id);
        if(el){ el.textContent = total > 0 ? (total > 99 ? '99+' : total) : ''; el.style.display = total > 0 ? '' : 'none'; }
      });
    } catch(e) {}
  }

  // ── Polling ───────────────────────────────────────────────────
  function reqStartPolling(){ reqStopPolling(); if(!reqServerUrl() || !reqIsAdmin()) return; reqUpdateBadge(); _reqPollInterval = setInterval(reqUpdateBadge, 30000); }
  function reqStopPolling(){ if(_reqPollInterval){ clearInterval(_reqPollInterval); _reqPollInterval = null; } }
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
  window.reqAccept = async function(ref, user){
    var sUrl = reqServerUrl(); if(!sUrl || !reqIsAdmin()) return false;
    try {
      var h = reqHeaders();
      var hGet = Object.assign({}, h); delete hGet['Content-Type'];
      var r = await fetch(sUrl + '/pullDatasReq?ref=' + encodeURIComponent(ref) + '&user=' + encodeURIComponent(user), { headers: hGet });
      if(!r.ok) return false;
      var d = await r.json();
      if(!d.items || !d.items.length) return false;
      var item = d.items[0].data || {};
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
    var title    = document.getElementById('reqDetailTitle');
    var subtitle = document.getElementById('reqDetailSubtitle');
    var body     = document.getElementById('reqDetailBody');
    var btnAcc   = document.getElementById('reqDetailAccept');
    var btnRef   = document.getElementById('reqDetailRefuse');
    if(!overlay) return;

    if(title)    title.textContent    = (isNew ? 'Nouveau produit : ' : 'Modification : ') + escapeHtml(item.ref);
    if(subtitle) subtitle.textContent = 'Soumis par ' + escapeHtml(user) + (data._reqAt ? ' · ' + new Date(data._reqAt).toLocaleString('fr-FR') : '');

    var FIELDS = { name:'Nom', brand:'Marque', ref:'Référence', family:'Famille', series:'Série', supplier:'Fournisseur', price:'Prix', priceCatalogue:'Prix catalogue', leadTime:'Délai', url:'URL', desc:'Description' };
    var html = '';

    if(data.photo) html += '<div style="text-align:center;margin-bottom:16px;"><img src="' + escapeHtml(data.photo) + '" style="max-width:100%;max-height:200px;border-radius:8px;object-fit:contain;" onerror="this.style.display=\'none\'"></div>';

    if(isNew){
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:16px;">';
      Object.keys(FIELDS).forEach(function(k){
        if(k==='desc'||k==='url') return;
        var v = data[k]; if(!v) return;
        html += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin-bottom:2px;">' + FIELDS[k] + '</div><div style="font-size:13px;font-weight:600;color:var(--ink);">' + escapeHtml(String(v)) + '</div></div>';
      });
      html += '</div>';
      if(data.desc) html += '<div style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;padding:10px;background:var(--paper);border-radius:8px;">' + escapeHtml(data.desc) + '</div>';
      if(data.url)  html += '<a href="' + escapeHtml(data.url) + '" target="_blank" style="font-size:13px;color:#194093;">Ouvrir la page</a>';
    } else {
      html += '<div style="margin-bottom:16px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin-bottom:8px;">Modifications proposées</div>';
      var hasDiff = false;
      Object.keys(FIELDS).forEach(function(k){
        var ov = String(original[k]||''); var nv = String(data[k]||'');
        if(ov===nv) return;
        hasDiff = true;
        html += '<div style="display:grid;grid-template-columns:100px 1fr 1fr;gap:4px 8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line);"><span style="font-size:11px;font-weight:600;color:var(--ink-soft);">' + FIELDS[k] + '</span><span style="font-size:12px;color:#991B1B;text-decoration:line-through;">' + escapeHtml(ov||'—') + '</span><span style="font-size:12px;color:#065F46;font-weight:600;">' + escapeHtml(nv||'—') + '</span></div>';
      });
      if(!hasDiff) html += '<div style="font-size:13px;color:var(--ink-soft);">Aucune différence détectée</div>';
      html += '</div><div style="padding:12px;background:var(--paper);border-radius:8px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-soft);margin-bottom:8px;">État actuel</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;">';
      ['name','brand','family','series','supplier','price'].forEach(function(k){
        if(!original[k]) return;
        html += '<div><div style="font-size:10px;color:var(--ink-soft);">' + FIELDS[k] + '</div><div style="font-size:13px;font-weight:600;">' + escapeHtml(String(original[k])) + '</div></div>';
      });
      html += '</div></div>';
    }

    if(body) body.innerHTML = html;

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

    document.getElementById('reqDetailClose').onclick = function(){ overlay.style.display='none'; document.body.classList.remove('modal-open'); };
    overlay.onclick = function(e){ if(e.target===overlay){ overlay.style.display='none'; document.body.classList.remove('modal-open'); } };
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');
  }

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
    var subtitle = document.getElementById('requestsPanelSubtitle');
    var tabAdmin = document.getElementById('reqTabAdmin');
    if(tabAdmin) tabAdmin.style.display = reqIsAdmin() ? '' : 'none';
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

  // ── Init listeners ────────────────────────────────────────────
  function reqInitListeners(){
    var btnReqMenuEl = document.getElementById('btnRequestsMenu');
    if(btnReqMenuEl) btnReqMenuEl.addEventListener('click', function(){ document.getElementById('hdrMenu').classList.remove('show'); reqOpenPanel(); });

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