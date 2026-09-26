// ── Onglets Blocs / Configurations ───────────────────────────────────────

function _armoireSwitchTab(tab){
  _armoireActiveTab = tab;
  document.querySelectorAll('.armoire-tab-btn').forEach(function(btn){
    var active = btn.getAttribute('data-tab') === tab;
    btn.classList.toggle('active', active);
  });
  var blocksEl = document.getElementById('armoireConfigBlocksList');
  var savedEl = document.getElementById('armoireConfigSavedList');
  var ordersEl = document.getElementById('armoireConfigOrdersList');
  if(blocksEl) blocksEl.style.display = tab === 'blocks' ? '' : 'none';
  if(savedEl) savedEl.style.display = tab === 'configs' ? '' : 'none';
  if(ordersEl) ordersEl.style.display = tab === 'orders' ? '' : 'none';
}

// ── Tiroir "Blocs / Configurations" — partagés
// entre tous les utilisateurs connectés, pas propres à chacun (d'où le
// libellé neutre plutôt que "Mes...", retour utilisateur). ─────────────
// Ouvert à la demande par-dessus la liste de familles (voir CSS
// .armoire-blocks-drawer) au lieu d'être empilé en permanence dessous.

function _armoireOpenBlocksDrawer(){
  var drawer = document.getElementById('armoireBlocksDrawer');
  if(drawer) drawer.style.display = 'flex';
  if(!_armoireDrawerOutsideHandler){
    _armoireDrawerOutsideHandler = function(e){
      var d = document.getElementById('armoireBlocksDrawer');
      var trigger = document.getElementById('armoireBlocksDrawerTrigger');
      if(!d || d.style.display === 'none') return;
      if(d.contains(e.target) || (trigger && trigger.contains(e.target))) return;
      // Un clic sur/dans une popup ouverte par-dessus (ex. "Voir le
      // contenu" au clic sur le petit "i", via customAlert) n'est pas un
      // clic "à l'extérieur" du panneau — sans ce garde-fou, fermer cette
      // popup fermait aussi le panneau Blocs/Configurations en dessous
      // (retour utilisateur).
      if(e.target.closest && e.target.closest('.spi-popup-overlay')) return;
      _armoireCloseBlocksDrawer();
    };
    document.addEventListener('mousedown', _armoireDrawerOutsideHandler);
  }
}

// instant (défaut false) : saute l'animation de fermeture — utilisé
// seulement pour remettre le tiroir à l'état fermé en arrière-plan (à
// l'ouverture/fermeture du configurateur lui-même, voir _armoireOpen/
// _armoireClose plus bas), où une animation supplémentaire n'aurait rien à
// montrer (le tiroir n'a jamais été visible) et ne ferait que retarder
// inutilement le display:none. Une vraie fermeture demandée par
// l'utilisateur (croix, clic à l'extérieur) reste animée — retour
// utilisateur : "ajouter des animations pour les ouverture et fermeture des
// différents éléments dans le configurateur d'armoire".
function _armoireCloseBlocksDrawer(instant){
  var drawer = document.getElementById('armoireBlocksDrawer');
  if(!drawer || drawer.style.display === 'none') return;
  if(instant || typeof window._closeOverlayAnimated !== 'function'){
    drawer.classList.remove('closing');
    drawer.style.display = 'none';
    return;
  }
  window._closeOverlayAnimated(drawer, function(){ drawer.style.display = 'none'; });
}

var _armoireDrawerOutsideHandler = null;

// ── Bascule mobile "Parcourir" / "Ma configuration" ──────────────────────
// Sous 768px, empiler les deux colonnes moitié-moitié les rendait
// inutilisables (listes minuscules, double scroll) — une seule colonne
// plein écran à la fois, sélectionnée via cette bascule. Sans effet sur
// desktop où les deux colonnes restent affichées côte à côte (CSS).
var _armoireMobileView = 'browse';

function _armoireSetMobileView(view){
  _armoireMobileView = view;
  document.querySelectorAll('.armoire-mobile-tab').forEach(function(btn){
    btn.classList.toggle('active', btn.getAttribute('data-view') === view);
  });
  var browseEl = document.querySelector('.armoire-cfg-browse');
  var draftEl = document.querySelector('.armoire-cfg-draft');
  if(browseEl) browseEl.classList.toggle('armoire-mobile-hidden', view !== 'browse');
  if(draftEl) draftEl.classList.toggle('armoire-mobile-hidden', view !== 'draft');
}

function _armoireUpdateMobileDraftBadge(){
  var badge = document.getElementById('armoireMobileDraftBadge');
  if(!badge) return;
  if(_armoireDraft.length){
    badge.textContent = _armoireDraft.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

// ── Ouverture / fermeture ────────────────────────────────────────────────

// Retour utilisateur : "corriger le problème de fenêtre avec le clavier"
// (capture à l'appui : le pied de page de la modale flottant au milieu de
// l'écran, l'accueil visible dans l'espace resté découvert en dessous, puis
// le clavier) — CE fichier calculait encore la position/hauteur de la
// modale en JS via window.visualViewport (voir l'historique retiré ici),
// exactement le même piège déjà rencontré et corrigé pour la fenêtre de
// connexion (voir js/auth.js/index.html, interactive-widget=resizes-
// content) : visualViewport ne reflète pas toujours fidèlement la hauteur
// ajoutée par les barres d'accessoire d'iOS au-dessus du clavier (suggestion
// de mot, "Mots de passe"/Face ID…), donc une modale dimensionnée dessus
// peut s'arrêter avant la vraie limite visible. index.html porte déjà
// interactive-widget=resizes-content pour TOUTE la page : le viewport de
// mise en page lui-même rétrécit quand le clavier s'ouvre, qu'une modale
// l'utilise via du CSS position:fixed ou non — plus besoin de le
// recalculer à la main ici. #armoireConfigModal (voir css/styles.css)
// s'ancre donc désormais en pur CSS (position:fixed; bottom:var(--nav-h)),
// sans plus aucune ligne de JS ; le seul cas que le CSS seul ne peut pas
// connaître (la bottom-nav qui se masque PENDANT la saisie, voir
// _navHideOnKeyboardCheck, js/actions-mobile-chrome.js) est géré par un
// sélecteur :has() dédié (body:has(.bottom-nav-kb-hidden) #armoireConfigModal).

