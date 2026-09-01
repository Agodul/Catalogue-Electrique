// ---------- Flèche "retour au menu" à gauche du titre (quand une fenêtre a
// été ouverte depuis le tiroir menu mobile) ----------
// Retour utilisateur : "regarde dans paramètres, chacune des fonctions a une
// flèche de retour, c'est cette flèche que je voudrais pour toutes les pages
// du menu mobile" puis "je voudrai la flèche à gauche du titre à chaque
// fois" — les sous-pages de Paramètres (Serveur, Utilisateurs, Fiches
// verrouillées, Icônes des familles) ont déjà une flèche ← dédiée, à gauche
// de leur titre (retour vers la liste Paramètres). Les autres fenêtres
// ouvertes depuis le menu mobile (Demandes, Paramètres lui-même, Connexion,
// Signaler un bug, Comparateur) n'avaient qu'une croix × en haut à droite —
// qui "revient" bien au menu fonctionnellement (voir msWithBack ci-dessous
// et les fonctions de fermeture dans js/auth.js/js/requests.js) mais sans ce
// même signal visuel ni cette même position.
// Chaque en-tête concerné a maintenant DEUX boutons distincts : la croix ×
// d'origine (en haut à droite, comportement inchangé) ET un nouveau bouton
// flèche ← (masqué par défaut, placé juste à gauche du titre dans le HTML —
// voir index.html). _setHeaderBackMode bascule laquelle des deux est
// visible ; le bouton flèche se contente de cliquer programmatiquement sur
// la croix d'origine pour réutiliser exactement la même logique de
// fermeture (confirmation de saisie non enregistrée, etc.) sans la
// dupliquer. Utilisé depuis actions.js/auth.js/requests.js, d'où
// l'exposition globale plutôt qu'une fonction interne à une seule IIFE.
var _headerBackWired = {};
function _setHeaderBackMode(closeBtnId, backBtnId, isBack){
  var closeBtn = document.getElementById(closeBtnId);
  var backBtn  = document.getElementById(backBtnId);
  if(!backBtn) return;
  if(!_headerBackWired[backBtnId]){
    _headerBackWired[backBtnId] = true;
    backBtn.addEventListener('click', function(){
      if(closeBtn) closeBtn.click();
    });
  }
  backBtn.style.display  = isBack ? 'inline-flex' : 'none';
  if(closeBtn) closeBtn.style.display = isBack ? 'none' : '';
}
window._setHeaderBackMode = _setHeaderBackMode;

// ---------- Chargement paresseux de XLSX (import/export Excel) ----------
  var _xlsxLoadPromise = null;
  function ensureXLSX(){
    if(window.XLSX) return Promise.resolve();
    if(_xlsxLoadPromise) return _xlsxLoadPromise;
    _xlsxLoadPromise = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      // Auto-hébergé (js/xlsx.full.min.js, SheetJS 0.20.3), comme js/pdf.min.js.
      s.src = 'js/xlsx.full.min.js';
      s.onload = function(){ _patchXlsxFormulaInjection(); resolve(); };
      s.onerror = function(){ _xlsxLoadPromise = null; reject(new Error('Échec du chargement de la librairie Excel')); };
      document.head.appendChild(s);
    });
    return _xlsxLoadPromise;
  }

  // Neutralise les cellules commençant par "=", "+", "-" ou "@" dans tous
  // les exports Excel (comparaison, tarifs, configurateur d'armoire…).
  // Patché ici une seule fois après le chargement de la librairie
  // (ensureXLSX est le point de passage unique avant tout appel XLSX.*
  // dans l'app — voir js/armoireConfig.js).
  function _patchXlsxFormulaInjection(){
    if(!window.XLSX || !XLSX.utils || XLSX.utils.aoa_to_sheet.__spiPatched) return;
    var original = XLSX.utils.aoa_to_sheet;
    function sanitizeCell(v){
      if(typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) return "'" + v;
      return v;
    }
    XLSX.utils.aoa_to_sheet = function(aoa, opts){
      var safe = aoa.map(function(row){
        return row.map(sanitizeCell);
      });
      return original.call(XLSX.utils, safe, opts);
    };
    XLSX.utils.aoa_to_sheet.__spiPatched = true;
  }

  // Fermeture animée de l'import Excel — exposée en global, appelée aussi bien
  // par les deux boutons de la fenêtre (✕ et Annuler, branchés juste en
  // dessous) que par la fin de l'import lui-même, plus bas dans ce fichier.
  window._closeXlsxImportOverlay = function(){
    var el = document.getElementById('xlsxImportOverlay');
    document.body.classList.remove('modal-open');
    if(!el) return;
    if(typeof window._closeOverlayAnimated === 'function'){
      window._closeOverlayAnimated(el, function(){ el.style.display = 'none'; });
    } else {
      el.style.display = 'none';
    }
  };

  // Ces deux boutons portaient un onclick="window._closeXlsxImportOverlay();"
  // dans index.html — du code exécutable dans un attribut, ce qui obligeait la
  // CSP à conserver 'unsafe-inline' dans script-src.
  ['btnCloseXlsxImport', 'btnCancelXlsxImport'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('click', function(){ window._closeXlsxImportOverlay(); });
  });

