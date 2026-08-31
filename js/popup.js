"use strict";

// ── Refus d'être affiché dans un cadre (clickjacking) ────────────────────
// La bonne réponse serait la directive frame-ancestors de la CSP. Impossible
// ici, deux fois : la CSP du projet est déclarée dans une balise <meta>, où
// frame-ancestors est ignoré par construction, et GitHub Pages ne permet
// d'ajouter aucun en-tête HTTP. Ce repli en JavaScript est donc tout ce dont
// on dispose. Il retire le scénario le plus courant : l'application affichée
// dans un iframe invisible, par-dessus lequel un site tiers fait cliquer sur
// des boutons qui ne sont pas ceux que l'utilisateur croit viser.
//
// On REFUSE DE S'AFFICHER, on n'essaie pas de reprendre la fenêtre du dessus.
// Un premier jet faisait « window.top.location = window.self.location » et ne
// se rabattait sur le refus qu'en cas d'exception — or un iframe sandboxé
// sans allow-top-navigation ne lève RIEN : le navigateur ignore l'écriture en
// silence. Le code repartait donc satisfait, en laissant l'application
// utilisable dans le cadre, exactement le cas qu'il devait empêcher. Refuser
// de s'afficher, c'est aussi la sémantique exacte de frame-ancestors.
//
// La page est masquée tout de suite (aucun clic possible, aucune image de
// l'interface exploitable), puis remplacée par un message une fois le reste
// des scripts passés — les remplacer avant ferait échouer chacun d'eux sur
// des éléments introuvables, pour rien.
(function _refuseFraming(){
  if (window.top === window.self) return;

  var hide = document.createElement('style');
  hide.textContent = 'html{visibility:hidden !important}';
  (document.head || document.documentElement).appendChild(hide);

  function refuser(){
    var here = window.self.location.href;
    if (document.body) document.body.textContent = '';
    var body = document.body || document.documentElement.appendChild(document.createElement('body'));

    // Retirer TOUTES les feuilles de style de l'application avant d'habiller
    // cette page — la mienne exceptée. index.html impose un fond clair avec
    // « body:not(:has(#app-splash:not(.hide))){ background:… !important } » :
    // un !important porté par un sélecteur contenant un identifiant, qui bat
    // aussi bien un style en ligne qu'un « body{…!important} » de ma part. Le
    // message s'affichait donc en blanc sur blanc, invisible — la protection
    // avait l'air de ne rien faire. Cette page de refus n'a de toute façon
    // aucun besoin du CSS de l'application.
    var feuilles = document.querySelectorAll('style, link[rel="stylesheet"]');
    for (var i = 0; i < feuilles.length; i++) {
      if (feuilles[i] !== hide) feuilles[i].parentNode.removeChild(feuilles[i]);
    }

    hide.textContent =
      'html{visibility:visible}' +
      'body{margin:0;padding:48px 24px;text-align:center;' +
      'background:#194093;color:#fff;' +
      'font:15px/1.7 system-ui,-apple-system,sans-serif;}' +
      'body a{color:#fff;font-weight:600;}';

    var msg = document.createElement('p');
    msg.textContent = "Cette application refuse de s'afficher à l'intérieur d'un autre site.";
    msg.style.cssText = 'margin:0 0 16px;';

    var link = document.createElement('a');
    link.href = here;
    link.target = '_top';
    link.rel = 'noopener';
    link.textContent = 'Ouvrir le catalogue';

    body.appendChild(msg);
    body.appendChild(link);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refuser);
  } else {
    refuser();
  }
})();

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

// ── Repli d'affichage des images cassées ─────────────────────────────────
// Remplace les anciens attributs onerror="…" écrits directement dans les
// chaînes HTML de render.js / modal.js / armoireConfig.js. Ces attributs
// étaient du code inline : ils obligeaient la CSP à garder 'unsafe-inline'
// dans script-src, c'est-à-dire la directive qui protégerait vraiment
// l'application le jour où un échappement HTML serait oublié quelque part.
//
// UN SEUL écouteur, posé sur document en phase de CAPTURE : les événements
// 'error' d'une image ne remontent pas (pas de bulle), mais ils descendent
// bien la phase de capture, donc ce listener unique voit toutes les images de
// la page — y compris celles insérées plus tard par innerHTML, sans avoir à
// re-brancher quoi que ce soit après chaque rendu.
//
// Chaque image indique le repli voulu par data-fallback="…" :
//   photo-icon   → l'emplacement affiche un pictogramme "photo absente"
//   hide-self    → l'image seule disparaît, son emplacement reste
//   hide-parent  → l'emplacement disparaît complètement
//   replace-self → l'image cède la place au texte "Image indisponible"
//   append-note  → l'image est masquée et le texte ajouté à côté
//   parent-note  → l'emplacement affiche "image introuvable" (aperçu de saisie)
function _imageFallbackSpan(className, text){
  var span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

document.addEventListener('error', function(e){
  var img = e.target;
  if(!img || img.tagName !== 'IMG') return;
  var mode = img.getAttribute('data-fallback');
  if(!mode) return;
  // Ne réagir qu'une fois : remplacer le contenu du parent peut réinsérer une
  // image (galeries), et une boucle d'erreurs figerait l'affichage.
  if(img.dataset.fallbackDone) return;
  img.dataset.fallbackDone = '1';

  var parent = img.parentElement;
  switch(mode){
    case 'photo-icon':
      if(!parent) return;
      parent.textContent = '';
      var icon = document.createElement('i');
      icon.className = 'ti ti-photo-off';
      parent.appendChild(icon);
      break;
    case 'hide-self':
      img.style.display = 'none';
      break;
    case 'hide-parent':
      if(parent) parent.style.display = 'none';
      break;
    case 'replace-self':
      img.replaceWith(_imageFallbackSpan('ph-placeholder', 'Image indisponible'));
      break;
    case 'append-note':
      img.style.display = 'none';
      if(parent) parent.appendChild(_imageFallbackSpan('ph-placeholder', 'Image indisponible'));
      break;
    case 'parent-note':
      if(!parent) return;
      parent.textContent = '';
      var note = _imageFallbackSpan('hint sans', 'image introuvable');
      note.style.padding   = '6px';
      note.style.textAlign = 'center';
      parent.appendChild(note);
      break;
  }
}, true);

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
// Les chaînes titre/message sont insérées TELLES QUELLES (HTML, pas de
// texte) — volontaire : au moins 2 appels (js/armoireConfig.js, détails
// bloc/délais) passent un vrai fragment HTML construit (ex. un tableau),
// pas une simple phrase, donc customAlert/customConfirm ne peuvent pas
// échapper title/message eux-mêmes sans casser ces popups-là. La règle
// reste donc : le CALLER doit passer ses valeurs dynamiques déjà échappées
// via escapeHtml() avant de les concaténer dans title/message — cf. la
// majorité des appels existants (auth.js, render.js, requests.js…). Une
// issue CodeQL "DOM text reinterpreted as HTML" a été trouvée sur 2 appels
// (js/actions.js) qui ne suivaient pas cette règle — corrigés à la source,
// pas ici, pour ne pas casser les popups à contenu HTML volontaire.


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
