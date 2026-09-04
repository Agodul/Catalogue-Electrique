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
  // se contenter de restaurer une sauvegarde fixe côté serveur). Champ
  // multipart "backup_file" (nom confirmé par le Swagger, POST /admin/restore
  // — voir mémoire project_backend_api_swagger) — un premier essai avec
  // "file" a produit une 422 (FastAPI valide le nom du champ multipart
  // strictement), confirmant qu'il fallait bien le nom exact du Swagger.
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
        fd.append('backup_file', file, file.name);
        var r = await fetch(url + '/admin/restore', { method:'POST', headers: h, body: fd });
        if(!r.ok){
          // Détail FastAPI (422 notamment : {detail:[{loc,msg,...}]}) affiché
          // s'il existe, plutôt qu'un simple "HTTP 422" sans info exploitable
          // — retour utilisateur, premier essai réel sur cette route neuve.
          var errDetail = '';
          try{
            var errBody = await r.json();
            if(errBody && errBody.detail) errDetail = ' — ' + (typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail));
          }catch(eParse){}
          throw new Error('HTTP ' + r.status + errDetail);
        }
        showToast('Sauvegarde restaurée ✓ — rechargement du catalogue…', 'ok', 3000);
        // Le contenu du serveur a potentiellement TOUT changé (catalogue,
        // blocs/configurations armoire, demandes en attente, bugs) — pas
        // seulement le catalogue. Reprend exactement la même séquence que
        // doCheckAllSync() (js/actions-settings-sync.js) quand elle détecte
        // un changement, plutôt que le seul syncFromServer(false) d'avant :
        // celui-ci est un pull DIFFÉRENTIEL, qui ne peut jamais voir une
        // suppression (voir commentaire de doCheckAllSync) — une
        // restauration vers un état plus ancien, par nature, en comporte
        // potentiellement beaucoup (produits, configs, etc. qui n'existaient
        // pas encore dans la sauvegarde restaurée).
        setTimeout(function(){
          if(typeof syncFromServer === 'function') syncFromServer(false);
          if(typeof syncDeletions === 'function') syncDeletions();
          if(typeof _armoireFetchBlocks === 'function') _armoireFetchBlocks();
          if(typeof _armoireFetchSavedConfigs === 'function') _armoireFetchSavedConfigs();
          if(typeof window._reqUpdateBadge === 'function') window._reqUpdateBadge();
        }, 800);
      }catch(e){
        showToast('Erreur lors de la restauration : '+e.message, 'err', 4000);
      }finally{
        btnAdminRestoreEl.disabled = false;
        btnAdminRestoreEl.style.opacity = '';
        btnAdminRestoreEl.innerHTML = original;
      }
    });
  }

