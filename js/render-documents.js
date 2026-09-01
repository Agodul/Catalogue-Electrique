  // ── Modale Documents ────────────────────────────────────────────
  // Charge JSZip si besoin
  function _loadJSZip(cb){
    if(window.JSZip){ cb(); return; }
    var s = document.createElement('script');
    // Auto-hébergé (js/jszip.min.js) plutôt que depuis cdnjs.cloudflare.com.
    s.src = 'js/jszip.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }

  // Fetch un fichier PDF par ref, extrait du ZIP si nécessaire par nom de fichier
  // Détecte si un ArrayBuffer est un ZIP via magic bytes (PK = 0x50 0x4B)
  function _isZipBuffer(ab){
    var view = new Uint8Array(ab, 0, 4);
    return view[0] === 0x50 && view[1] === 0x4B;
  }

  // Cache des buffers PDF déjà téléchargés (clé = ref + filename)
  var _pdfBufferCache = {};

  function _fetchPdfByName(sUrl, ref, filename, h, cb){
    var cacheKey = ref + '::' + filename;
    if(_pdfBufferCache[cacheKey]){
      cb(null, _pdfBufferCache[cacheKey], filename);
      return;
    }
    var url = sUrl + '/pullDocs?ref=' + encodeURIComponent(ref);
    fetch(url, { headers: h })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
      .then(function(ab){
        // Plafond généreux (100 Mo) pour ne bloquer aucun cas d'usage réel.
        var PDF_MAX_BYTES = 100 * 1024 * 1024;
        if(ab.byteLength > PDF_MAX_BYTES){
          cb(new Error('Document trop volumineux (' + Math.round(ab.byteLength/1024/1024) + ' Mo)'));
          return;
        }
        if(_isZipBuffer(ab)){
          _loadJSZip(function(){
            JSZip.loadAsync(ab).then(function(zip){
              var target = null;
              zip.forEach(function(path, f){
                if(path === filename || path.split('/').pop() === filename) target = f;
              });
              if(!target) zip.forEach(function(path, f){ if(!target) target = f; });
              if(target){
                target.async('arraybuffer').then(function(buf){
                  _pdfBufferCache[cacheKey] = buf;
                  cb(null, buf, filename);
                });
              } else cb(new Error('Fichier non trouvé dans le ZIP'));
            }).catch(function(e){ cb(e); });
          });
        } else {
          _pdfBufferCache[cacheKey] = ab;
          cb(null, ab, filename);
        }
      })
      .catch(function(e){ cb(e); });
  }

  // Types image acceptés à l'upload (voir accept="image/*" sur #modalPdfInput,
  // js/modal.js) — même liste que _isImg là-bas, pour rester cohérent entre
  // la modale d'édition et la visionneuse.
  var IMG_EXT_RE = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i;

  // Icône de l'en-tête adaptée au type de fichier (retour utilisateur :
  // "faut que l'icône de la visionneuse s'adapte au fichier") — figée sur
  // "PDF" auparavant, y compris pour une image. Même couleur/icône que les
  // lignes de la liste de documents (_docRenderItem plus bas), pour rester
  // cohérent entre les deux endroits.
  function _pdfUpdateTypeIcon(docName){
    var iconEl = document.getElementById('pdfViewerTypeIcon');
    if(!iconEl) return;
    if(IMG_EXT_RE.test(docName || '')){
      iconEl.className = 'ti ti-photo';
      iconEl.style.color = 'var(--copper)';
    } else {
      iconEl.className = 'ti ti-file-type-pdf';
      iconEl.style.color = '#E53E3E';
    }
  }

  // Message "connectez-vous au serveur" — retour utilisateur : "faudrait
  // mettre une notification pour dire au user de se connecter au serveur
  // pour pouvoir visionner un document". Avant, aucun serveur configuré ou
  // un serveur injoignable affichait le même "Aucun document disponible"
  // que s'il n'y avait vraiment aucun document — trompeur, l'utilisateur ne
  // pouvait pas deviner qu'il fallait se (re)connecter. Bouton "Ouvrir les
  // paramètres serveur" : ferme cette fenêtre de documents et saute
  // directement sur la sous-page Serveur (openSettingsOverlay/
  // showSettingsServerPage, définies dans js/actions.js — accessibles ici
  // car tous les scripts de l'app sont des scripts globaux classiques, pas
  // des modules isolés).
  function _docConnectServerMessage(reason){
    return '<div style="text-align:center;color:var(--ink-soft);padding:32px 20px;font-size:13px;">'
      + '<i class="ti ti-plug-connected-x" style="font-size:28px;display:block;margin:0 auto 10px;color:var(--ink-soft);"></i>'
      + '<div style="font-weight:700;color:var(--ink);margin-bottom:4px;font-size:14px;">Connectez-vous à un serveur</div>'
      + '<div style="margin-bottom:16px;">' + escapeHtml(reason) + '</div>'
      + '<button id="docConnectServerBtn" style="padding:8px 16px;border-radius:8px;border:1px solid var(--line);background:var(--paper-card);color:var(--ink);font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;">Ouvrir les paramètres serveur</button>'
      + '</div>';
  }
  function _docWireConnectServerBtn(overlay){
    var btn = document.getElementById('docConnectServerBtn');
    if(!btn) return;
    btn.onclick = function(){
      var closeBtn = document.getElementById('docCloseBtn');
      if(closeBtn) closeBtn.click(); else if(overlay) overlay.style.display = 'none';
      if(typeof window.openSettingsOverlay === 'function') window.openSettingsOverlay();
      if(typeof window.showSettingsServerPage === 'function') window.showSettingsServerPage();
    };
  }

  function _docRenderItem(docList, file, sUrl){
    var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
    delete h['Content-Type'];
    var docName = file.filename || 'Document.pdf';
    var isImg = IMG_EXT_RE.test(docName);

    var item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;';
    item.innerHTML = '<div style="width:40px;height:40px;background:'+(isImg?'#FFF7ED':'#FEF2F2')+';border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
      + (isImg
        ? '<i class="ti ti-photo" style="font-size:22px;color:var(--copper);"></i>'
        : '<i class="ti ti-file-type-pdf" style="font-size:22px;color:#E53E3E;"></i>')
      + '</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(docName)+'</div>'
      + '<div style="font-size:11px;color:var(--ink-soft);margin-top:2px;">'+(isImg?'Image':'PDF')+'</div>'
      + '</div>';

    var btnVoir = document.createElement('button');
    btnVoir.style.cssText = 'padding:7px 14px;border-radius:8px;border:1px solid var(--line);background:var(--paper-card);color:var(--ink);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;flex-shrink:0;font-family:inherit;';
    btnVoir.innerHTML = '<i class="ti ti-eye" style="font-size:14px;"></i> Voir';
    // Précharger le buffer au survol (avant le clic)
    btnVoir.addEventListener('mouseenter', function(){
      _fetchPdfByName(sUrl, file.ref, docName, h, function(){}); // warm cache
    }, { once: true });
    btnVoir.onclick = function(){
      window._openPdfViewerWithBuffer(docName, function(onBuffer, onError){
        _fetchPdfByName(sUrl, file.ref, docName, h, function(err, ab){
          if(err) onError(err); else onBuffer(ab);
        });
      });
    };

    item.appendChild(btnVoir);
    docList.appendChild(item);
  }

  window._openDocModal = function openDocModal(p, sUrl){
    var overlay = document.getElementById('docOverlay');
    var docList = document.getElementById('docList');
    if(!overlay || !docList) return;

    // Loader immédiat
    docList.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:32px;font-size:13px;">'
      + '<i class="ti ti-loader-2" style="font-size:24px;display:block;margin:0 auto 10px;animation:spin 1s linear infinite;"></i>'
      + 'Chargement…</div>';
    overlay.style.display = 'flex';
    document.body.classList.add('modal-open');

    if(p.ref && sUrl){
      var h = typeof window.authHeaders === 'function' ? Object.assign({}, window.authHeaders()) : {};
      delete h['Content-Type'];
      fetch(sUrl + '/pullDocs?nofile=true&ref=' + encodeURIComponent(p.ref), { headers: h })
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(d){
          var files = d && d.items ? d.items : [];
          docList.innerHTML = '';
          if(files.length === 0){
            docList.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:40px;font-size:14px;">Aucun document disponible</div>';
          } else {
            files.forEach(function(f){ _docRenderItem(docList, f, sUrl); });
          }
        })
        .catch(function(){
          // Échec réseau (pas juste un HTTP non-ok) — serveur probablement
          // injoignable, pas "vraiment aucun document" (retour utilisateur :
          // "dire au user de se connecter au serveur pour pouvoir visionner
          // un document"). p.hasDoc reste un repli utile : le document a pu
          // être vu/uploadé par le passé, autant tenter le bouton "Voir"
          // (qui échouera à son tour, proprement, si le serveur est
          // vraiment injoignable) plutôt que bloquer d'office.
          docList.innerHTML = '';
          if(p.hasDoc){
            _docRenderItem(docList, { filename: p.docFilename || 'Document.pdf', ref: p.ref }, sUrl);
          } else {
            docList.innerHTML = _docConnectServerMessage('Serveur injoignable — vérifiez la connexion pour voir les documents.');
            _docWireConnectServerBtn(overlay);
          }
        });
    } else if(!sUrl){
      docList.innerHTML = _docConnectServerMessage('Aucun serveur configuré — les documents y sont stockés et ne peuvent pas être affichés sans lui.');
      _docWireConnectServerBtn(overlay);
    } else {
      docList.innerHTML = '<div style="text-align:center;color:var(--ink-soft);padding:40px;font-size:14px;">Aucun document disponible</div>';
    }

    document.getElementById('docCloseBtn').onclick = function(){
      document.body.classList.remove('modal-open');
      if(typeof window._closeOverlayAnimated === 'function'){
        window._closeOverlayAnimated(overlay, function(){ overlay.style.display = 'none'; });
      } else {
        overlay.style.display = 'none';
      }
    };
    // clic extérieur bloqué — géré par _initModalEscape()
  }
  // ── Fin modale Documents ─────────────────────────────────────────

