// ── Téléchargement / envoi de l'extension Chrome depuis le serveur ───────
// Nouvelle API serveur ("/plugin/file", authentifiée) ajoutée par le
// développeur backend pour distribuer l'extension à tout utilisateur
// connecté sans passer par une distribution manuelle (email, clé USB…) —
// retour utilisateur : "le developpeur a ajouté une API pour pouvoir mettre
// a disposition l'extension [...] à tous les user loggin [...] c'est
// simplement de la distribution". L'envoi d'une nouvelle version (POST,
// voir uploadExtensionPlugin ci-dessous) est réservé aux ADMINS (retour
// utilisateur : "faudrai pouvoir ajouter depuis le client mais seulement
// pour les admins", voir js/auth.js/js/actions-mobile-chrome.js pour le
// filtrage isAdmin) : cette action remplace le fichier que TOUS les
// utilisateurs récupèrent ensuite via le téléchargement, une portée qui
// dépasse un simple compte utilisateur normal.
async function downloadExtensionPlugin(){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl){
    showToast('Aucun serveur configuré — impossible de récupérer l\'extension', 'err', 4000);
    return;
  }
  // Content-Type retiré comme pour tous les autres appels GET de l'app
  // (voir js/requests.js, js/actions-backup.js…) — un GET n'a pas de corps,
  // l'envoyer perturbe certains serveurs/proxys.
  var h = Object.assign({}, typeof authHeaders === 'function' ? authHeaders() : {});
  delete h['Content-Type'];
  showToast('Téléchargement en cours…', 'ok', 2000);
  try{
    var r = await fetch(sUrl + '/plugin/file', { headers: h });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    var blob = await r.blob();
    // Nom de fichier : celui suggéré par le serveur (Content-Disposition)
    // si présent, sinon un nom par défaut générique — la doc Swagger de cet
    // endpoint ne précise pas ce détail (réponse non typée, "schema":{}),
    // donc traité au mieux plutôt que supposé.
    var filename = 'spi-extension.zip';
    var cd = r.headers.get('Content-Disposition') || r.headers.get('content-disposition');
    if(cd){
      var m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      if(m && m[1]){
        try{ filename = decodeURIComponent(m[1]); }catch(e){ filename = m[1]; }
      }
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 10000);
    showToast('Extension téléchargée ✓', 'ok', 3000);
  }catch(e){
    showToast('Erreur lors du téléchargement : ' + (e && e.message || e), 'err', 4000);
  }
}

// Envoie un nouveau fichier vers /plugin/file (POST, multipart "file" —
// nom de champ confirmé par le Swagger, voir Body_push_plugin_file_plugin_
// file_post). Remplace ce que TOUS les utilisateurs connectés
// téléchargeront ensuite via downloadExtensionPlugin() ci-dessus —
// confirmation appuyée obligatoire, même principe que la restauration de
// sauvegarde serveur (js/actions-backup.js) : une action qui affecte tout
// le monde, pas seulement l'admin qui l'exécute.
async function uploadExtensionPlugin(file){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl){
    showToast('Aucun serveur configuré', 'warn', 2500);
    return;
  }
  var confirmed = await customConfirm(
    'Envoyer une nouvelle version de l\'extension ?',
    'Le fichier « ' + escapeHtml(file.name) + ' » remplacera celui distribué à TOUS les utilisateurs connectés qui téléchargent l\'extension depuis le Catalogue. Cette opération est irréversible.',
    { okLabel: 'Envoyer', danger: true }
  );
  if(!confirmed) return;
  var btn = document.getElementById('btnUploadExtension');
  var original = btn ? btn.innerHTML : null;
  if(btn){ btn.disabled = true; btn.style.opacity = '0.6'; }
  try{
    var h = Object.assign({}, typeof authHeaders === 'function' ? authHeaders() : {});
    delete h['Content-Type']; // laisser fetch fixer le boundary multipart
    var fd = new FormData();
    fd.append('file', file, file.name);
    var r = await fetch(sUrl + '/plugin/file', { method:'POST', headers: h, body: fd });
    if(!r.ok){
      // Détail FastAPI (422 notamment) affiché s'il existe — même principe
      // que btnAdminRestore (js/actions-backup.js) pour une route neuve.
      var errDetail = '';
      try{
        var errBody = await r.json();
        if(errBody && errBody.detail) errDetail = ' — ' + (typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail));
      }catch(eParse){}
      throw new Error('HTTP ' + r.status + errDetail);
    }
    showToast('Nouvelle version envoyée ✓', 'ok', 3000);
    _refreshExtensionVersionDisplay();
  }catch(e){
    showToast('Erreur lors de l\'envoi : ' + (e && e.message || e), 'err', 4000);
  }finally{
    if(btn){ btn.disabled = false; btn.style.opacity = ''; if(original !== null) btn.innerHTML = original; }
  }
}

// ── Numéro de version, saisi à la main par l'admin ────────────────────────
// Retour utilisateur : "faut qu'il puisse rentrer manuellement la version"
// (l'admin connaît la vraie version du zip qu'il envoie — extension avec
// tel fournisseur en plus — l'app ne peut pas le deviner). L'API n'a aucun
// champ dédié pour une métadonnée séparée (voir Body_push_plugin_file_
// plugin_file_post : uniquement "file") : le SEUL canal qui survit jusqu'au
// téléchargement d'un autre utilisateur est le NOM du fichier lui-même —
// en supposant que le serveur le préserve et le renvoie via
// Content-Disposition sur GET (comportement non garanti, non documenté
// dans ce Swagger — traité en best-effort, voir _refreshExtensionVersionDisplay).
function _extractVersionFromFilename(filename){
  if(!filename) return null;
  var m = /(\d+\.\d+(?:\.\d+)?)/.exec(filename);
  return m ? m[1] : null;
}

async function promptAndUploadExtension(file){
  var version = await customPrompt(
    'Version de cette extension',
    'Numéro de version de ce fichier (ex. 1.71) — affiché ensuite à tous les utilisateurs avant qu\'ils ne téléchargent. Laisser vide pour envoyer sans indication de version.',
    ''
  );
  if(version === null) return; // annulé
  version = (version || '').trim();
  var finalFile = file;
  if(version){
    var dot = file.name.lastIndexOf('.');
    var base = dot > -1 ? file.name.slice(0, dot) : file.name;
    var ext  = dot > -1 ? file.name.slice(dot) : '';
    // Retire un éventuel numéro de version déjà présent dans le nom choisi
    // par l'admin (ex. il a lui-même nommé son fichier "extension-1.70.zip")
    // avant d'ajouter celui saisi ici, pour ne jamais en avoir deux.
    base = base.replace(/[-_]?v?\d+\.\d+(?:\.\d+)?/gi, '');
    finalFile = new File([file], base + '-v' + version + ext, { type: file.type });
  }
  await uploadExtensionPlugin(finalFile);
}

// Vérifie la version actuellement disponible sur le serveur — via
// "/plugin/file/name" (GET, {"filename": "..."}), un endpoint dédié ajouté
// par le développeur backend spécifiquement pour ça (voir commentaire
// _extractVersionFromFilename ci-dessus). Deux raisons à cet endpoint séparé
// plutôt qu'un simple HEAD sur "/plugin/file" (ancienne approche,
// abandonnée) :
//  1. Le nom de fichier arrive ici comme un vrai champ JSON — pas soumis au
//     blocage CORS par défaut des navigateurs sur la lecture d'en-têtes de
//     réponse cross-origin (retour utilisateur : "le serveur me donne bien
//     le nom [...] mais du coup faudra recupere seulement la version").
//  2. Sur ce serveur, un HEAD sur "/plugin/file" nécessitait quand même de
//     télécharger le fichier en entier côté serveur pour construire la
//     réponse (retour utilisateur : "pour afficher la version il fallait
//     obligatoirement télécharger le fichier") — donc même sans le souci
//     CORS, ça aurait été un gaspillage de bande passante à chaque simple
//     affichage de version. "/plugin/file/name" est un vrai raccourci léger.
// Toujours en best-effort : jamais bloquant, jamais d'erreur visible.
async function _refreshExtensionVersionDisplay(){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl) return;
  try{
    var h = Object.assign({}, typeof authHeaders === 'function' ? authHeaders() : {});
    delete h['Content-Type'];
    var r = await fetch(sUrl + '/plugin/file/name', { headers: h });
    if(!r.ok) return;
    var data = await r.json();
    var filename = data && data.filename;
    if(!filename) return;
    var version = _extractVersionFromFilename(filename);
    if(!version) return;
    ['#btnDownloadExtension .mi-sub', '#msDownloadExtension .menu-sheet-sub'].forEach(function(sel){
      var el = document.querySelector(sel);
      if(el) el.textContent = 'Version ' + version + ' disponible';
    });
  }catch(e){ /* best-effort */ }
}

(function(){
  function wireDownloadExtensionBtn(id){
    var btn = document.getElementById(id);
    if(btn) btn.addEventListener('click', downloadExtensionPlugin);
  }
  wireDownloadExtensionBtn('btnDownloadExtension');
  wireDownloadExtensionBtn('msDownloadExtension');

  var fileUploadExtension = document.getElementById('fileUploadExtension');
  function wireUploadExtensionBtn(id){
    var btn = document.getElementById(id);
    if(btn && fileUploadExtension) btn.addEventListener('click', function(){
      fileUploadExtension.value = '';
      fileUploadExtension.click();
    });
  }
  wireUploadExtensionBtn('btnUploadExtension');
  wireUploadExtensionBtn('msUploadExtension');
  if(fileUploadExtension) fileUploadExtension.addEventListener('change', function(){
    var file = fileUploadExtension.files && fileUploadExtension.files[0];
    fileUploadExtension.value = '';
    if(file) promptAndUploadExtension(file);
  });

  // Vérifie/affiche la version disponible dès que possible (best-effort,
  // voir _refreshExtensionVersionDisplay) — un seul essai au chargement,
  // pas besoin de reproduire à chaque ouverture du menu : la version ne
  // change qu'après un envoi, déjà rafraîchie explicitement à ce moment-là
  // (voir uploadExtensionPlugin).
  _refreshExtensionVersionDisplay();
})();
