"use strict";

// ── Capture des erreurs JS récentes (pour "Signaler un bug", requests.js) ──
// Placé dans le tout premier script chargé pour attraper le plus tôt
// possible. Tampon circulaire (dernières 25 entrées) exposé sur
// window._bugErrorLog — lu par reqSubmitBug() au moment de l'envoi, pour
// qu'un rapport de bug transmette de quoi diagnostiquer une vraie erreur de
// code (message, fichier/ligne, stack) plutôt qu'une simple phrase.
//
// Persisté dans sessionStorage (pas juste en mémoire) : un premier essai
// s'est révélé inutile en usage réel — l'utilisateur rencontre un bug,
// recharge la page pour vérifier si ça persiste, PUIS va signaler le bug ;
// un tampon uniquement en mémoire est vidé par ce rechargement et le
// rapport arrivait sans aucun log (retour utilisateur, capture à l'appui).
// sessionStorage survit au F5, se vide à la fermeture de l'onglet.
var _BUG_LOG_KEY = 'cat_bug_error_log';
try {
  window._bugErrorLog = JSON.parse(sessionStorage.getItem(_BUG_LOG_KEY) || '[]');
  if(!Array.isArray(window._bugErrorLog)) window._bugErrorLog = [];
} catch(e){ window._bugErrorLog = []; }

function _bugLogPush(entry){
  entry.at = new Date().toISOString();
  window._bugErrorLog.push(entry);
  if(window._bugErrorLog.length > 25) window._bugErrorLog.shift();
  try { sessionStorage.setItem(_BUG_LOG_KEY, JSON.stringify(window._bugErrorLog)); } catch(e){}
}
window.addEventListener('error', function(e){
  _bugLogPush({
    type: 'error',
    message: e.message,
    source: (e.filename || '') + (e.lineno ? ':' + e.lineno + ':' + (e.colno||0) : ''),
    stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 500) : ''
  });
});
window.addEventListener('unhandledrejection', function(e){
  var reason = e.reason;
  _bugLogPush({
    type: 'unhandledrejection',
    message: reason && reason.message ? reason.message : String(reason),
    stack: reason && reason.stack ? String(reason.stack).slice(0, 500) : ''
  });
});
// PAS d'interception de console.log/warn/error : sur retour du dev, seule
// une vraie erreur JS (exception non attrapée / promesse rejetée) doit
// remonter dans le rapport de bug, pas le bruit des console.log/warn de
// debug déjà présents dans le code (ex. les "[PDF] ..." de render.js), qui
// noyait le vrai signal.

// ── Visionneuse plein écran pour une image (aperçu bug signalé, capture
//    jointe au formulaire…) ── Volontairement PAS un window.open(url,
//    '_blank') sur l'URL blob: de l'image : plusieurs navigateurs/contextes
//    PWA déclenchent alors un téléchargement du fichier au lieu d'afficher
//    l'image dans un nouvel onglet (retour utilisateur, capture à l'appui).
//    Un simple calque plein écran reste dans la page — jamais de
//    navigation, donc jamais de téléchargement déclenché.
function _showImageLightbox(url){
  if(!url) return;
  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.85);' +
    'display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
  var img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5);cursor:zoom-out;';
  overlay.appendChild(img);
  function close(){
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e){ if(e.key === 'Escape') close(); }
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
}
window._showImageLightbox = _showImageLightbox;

// ── Popups custom (remplacent alert/confirm/prompt natifs) ─────────────────
// Style unique et cohérent dans toute l'app (repris de la confirmation
// "Annuler la saisie"). Toutes les fonctions retournent une Promise :
//   customAlert(titre, message)              -> Promise<void>
//   customConfirm(titre, message, opts)       -> Promise<boolean>
//   customPrompt(titre, message, valeurInit)  -> Promise<string|null>
// Les chaînes titre/message sont insérées telles quelles (HTML) : le
// caller doit passer les valeurs dynamiques déjà échappées via escapeHtml().

function _popupOverlay(innerHtml){
  var overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:var(--z-popup,11000);background:var(--overlay-scrim);' +
    'display:flex;align-items:center;justify-content:center;padding:16px;';
  overlay.innerHTML =
    '<div style="background:#fff;border-radius:12px;padding:24px;max-width:380px;width:100%;' +
    'box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:var(--font-sans,inherit);">' +
      innerHtml +
    '</div>';
  document.body.appendChild(overlay);
  return overlay;
}

function customAlert(title, message){
  return new Promise(function(resolve){
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">' + title + '</div>' +
      (message ? '<div style="font-size:13px;color:#64748b;margin-bottom:20px;white-space:pre-line;">' + message + '</div>' : '') +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<button id="_popupOk" style="padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:var(--copper,#194093);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">OK</button>' +
      '</div>'
    );
    function close(){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(); }
    overlay.querySelector('#_popupOk').addEventListener('click', close);
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(); });
    document.addEventListener('keydown', function onKey(e){
      if(e.key === 'Enter' || e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(); }
    });
  });
}

function customConfirm(title, message, opts){
  opts = opts || {};
  var okLabel     = opts.okLabel || 'Confirmer';
  var cancelLabel = opts.cancelLabel || 'Annuler';
  var okStyle = opts.danger
    ? 'border:1px solid #FCA5A5;background:#FEF2F2;color:#991B1B;'
    : 'border:1px solid var(--copper,#194093);background:var(--copper,#194093);color:#fff;';
  return new Promise(function(resolve){
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">' + title + '</div>' +
      (message ? '<div style="font-size:13px;color:#64748b;margin-bottom:20px;white-space:pre-line;">' + message + '</div>' : '') +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<button id="_popupConfirm" style="padding:10px 14px;border-radius:8px;' + okStyle + 'font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">' + okLabel + '</button>' +
        '<button id="_popupCancel" style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">' + cancelLabel + '</button>' +
      '</div>'
    );
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    overlay.querySelector('#_popupConfirm').addEventListener('click', function(){ close(true); });
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(false); });
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(false); });
    document.addEventListener('keydown', function onKey(e){
      if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(false); }
    });
  });
}

function customPrompt(title, message, defaultValue){
  return new Promise(function(resolve){
    var safeDefault = defaultValue ? String(defaultValue).replace(/"/g, '&quot;') : '';
    var overlay = _popupOverlay(
      '<div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px;">' + title + '</div>' +
      (message ? '<div style="font-size:13px;color:#64748b;margin-bottom:14px;">' + message + '</div>' : '') +
      '<input id="_popupInput" type="text" value="' + safeDefault + '" style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid var(--line,#C9D0D8);font-size:14px;font-family:inherit;margin-bottom:20px;" />' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="_popupCancel" style="flex:1;padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:transparent;color:#64748b;font-size:13px;cursor:pointer;font-family:inherit;">Annuler</button>' +
        '<button id="_popupOk" style="flex:1;padding:10px 14px;border-radius:8px;border:1px solid var(--copper,#194093);background:var(--copper,#194093);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">OK</button>' +
      '</div>'
    );
    var input = overlay.querySelector('#_popupInput');
    function close(result){ if(overlay.parentNode) document.body.removeChild(overlay); resolve(result); }
    overlay.querySelector('#_popupOk').addEventListener('click', function(){ close(input.value); });
    overlay.querySelector('#_popupCancel').addEventListener('click', function(){ close(null); });
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(null); });
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); close(input.value); }
      if(e.key === 'Escape'){ e.preventDefault(); close(null); }
    });
    setTimeout(function(){ input.focus(); input.select(); }, 30);
  });
}
