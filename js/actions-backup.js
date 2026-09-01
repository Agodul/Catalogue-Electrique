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
  // se contenter de restaurer une sauvegarde fixe côté serveur — le Swagger
  // ne documentait pas de corps de requête pour cette route, contrairement
  // à /pushDocsReq par ex., donc le nom exact du champ multipart ("file"
  // ci-dessous) est une supposition raisonnable, PAS confirmé — à vérifier
  // au premier essai réel (ajuster ici si 422/erreur de validation).
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
        fd.append('file', file, file.name);
        var r = await fetch(url + '/admin/restore', { method:'POST', headers: h, body: fd });
        if(!r.ok) throw new Error('HTTP ' + r.status);
        showToast('Sauvegarde restaurée ✓ — rechargement du catalogue…', 'ok', 3000);
        // Le contenu du serveur a potentiellement tout changé — recharger
        // depuis zéro plutôt que de tenter une fusion différentielle.
        setTimeout(function(){ if(typeof syncFromServer === 'function') syncFromServer(false); }, 800);
      }catch(e){
        showToast('Erreur lors de la restauration : '+e.message, 'err', 4000);
      }finally{
        btnAdminRestoreEl.disabled = false;
        btnAdminRestoreEl.style.opacity = '';
        btnAdminRestoreEl.innerHTML = original;
      }
    });
  }

