// ── Icônes de famille — pictogrammes PNG ───────────────────────────────────
// Chaque icône est un vrai fichier .png dans assets/icons/families/ (un
// fichier par clé, ex. svg-disjoncteur.png — le préfixe "svg-" du nom de
// fichier est resté pour ne pas casser les valeurs déjà enregistrées sur des
// produits, mais le fichier lui-même est bien un PNG). Pour changer une
// icône : remplacer directement le fichier .png correspondant (512×512px,
// fond transparent), aucune modification de code nécessaire. Pour en
// ajouter une nouvelle : déposer le fichier .png dans ce dossier (même
// dimension, palette #194093 / #5B7DC4 / #A8BCE3 pour rester cohérent avec
// les autres) puis ajouter sa clé dans FAMILY_ICON_CHOICES ci-dessous.
//
// Générées à l'origine par Gemini à partir des 54 vraies familles du
// catalogue (une photo réelle par famille) et d'un style de référence
// flat/isométrique monochrome bleu fourni par l'utilisateur.
//
// Rétrocompatible : les anciennes valeurs "ti-xxx" déjà enregistrées sur des
// produits existants continuent de s'afficher via la police Tabler — voir
// renderFamilyIconHtml() plus bas, aucune migration de données nécessaire.
"use strict";

var FAMILY_ICONS_BASE_PATH = 'assets/icons/families/';

var FAMILY_ICON_CHOICES = [
  'svg-accessoire','svg-alimentation','svg-amplificateur','svg-armoire',
  'svg-barriere-immaterielle','svg-boite-a-bouton','svg-borne','svg-bouton',
  'svg-cable-de-liaison','svg-cable-de-raccordement','svg-capteur',
  'svg-capteur-magnetique','svg-capteur-pneumatique','svg-carte-entree-plc',
  'svg-carte-entree-securite','svg-carte-relais-securite','svg-carte-sortie-plc',
  'svg-carte-sortie-securite','svg-chemin-de-cable','svg-climatisation',
  'svg-colonne-lumineuse','svg-communication-reseau',
  'svg-connecteur-confectionnables','svg-contact-auxiliaire',
  'svg-contact-de-porte','svg-contacteur','svg-controleur',
  'svg-controleur-cobot','svg-controleur-de-securite','svg-disjoncteur',
  'svg-eclairage','svg-ecran','svg-fibre-optique','svg-goulotte',
  'svg-identification','svg-interrupteur-sectionneur','svg-lecteur-code',
  'svg-master','svg-moteur-brushless','svg-plc','svg-presse-etoupe',
  'svg-prise','svg-rail-din','svg-relais','svg-relais-de-securite',
  'svg-repartiteur','svg-repartiteurs-en-y','svg-robot',
  'svg-robot-collaboratif','svg-router','svg-switch','svg-variateur',
  'svg-ventilateur','svg-vision',
  'svg-generique'
];

// Correspondance EXACTE nom de famille → icône, pour les 54 familles réelles
// du catalogue au moment de la création de ce module. Prioritaire sur la
// détection par mots-clés (familyIconMap dans actions.js) car aucun produit
// existant n'a encore de champ familyIcon enregistré — sans cette table,
// TOUTES les familles réelles retomberaient sur la détection approximative
// par mots-clés au premier chargement.
var FAMILY_NAME_TO_ICON = {
  'Accessoire': 'svg-accessoire',
  'Alimentation': 'svg-alimentation',
  'Amplificateur': 'svg-amplificateur',
  'Armoire': 'svg-armoire',
  'Barrière immatérielle': 'svg-barriere-immaterielle',
  'Boîte à bouton': 'svg-boite-a-bouton',
  'Borne': 'svg-borne',
  'Bouton': 'svg-bouton',
  'Cable de liaison': 'svg-cable-de-liaison',
  'Cable de raccordement': 'svg-cable-de-raccordement',
  'Capteur': 'svg-capteur',
  'Capteur magnétique': 'svg-capteur-magnetique',
  'Capteur pneumatique': 'svg-capteur-pneumatique',
  'Carte entrée PLC': 'svg-carte-entree-plc',
  'Carte entrée sécurité': 'svg-carte-entree-securite',
  'Carte relais sécurité': 'svg-carte-relais-securite',
  'Carte sortie PLC': 'svg-carte-sortie-plc',
  'Carte sortie sécurité': 'svg-carte-sortie-securite',
  'Chemin de câble': 'svg-chemin-de-cable',
  'Climatisation': 'svg-climatisation',
  'Colonne lumineuse': 'svg-colonne-lumineuse',
  'Communication réseau': 'svg-communication-reseau',
  'Connecteur confectionnables': 'svg-connecteur-confectionnables',
  'Contact auxiliaire': 'svg-contact-auxiliaire',
  'Contact de porte': 'svg-contact-de-porte',
  'Contacteur': 'svg-contacteur',
  'Contrôleur': 'svg-controleur',
  'Contrôleur cobot': 'svg-controleur-cobot',
  'Contrôleur de sécurité': 'svg-controleur-de-securite',
  'Disjoncteur': 'svg-disjoncteur',
  'Eclairage': 'svg-eclairage',
  'Ecran': 'svg-ecran',
  'Fibre Optique': 'svg-fibre-optique',
  'Goulotte': 'svg-goulotte',
  'Identification': 'svg-identification',
  'Interrupteur sectionneur': 'svg-interrupteur-sectionneur',
  'Lecteur code': 'svg-lecteur-code',
  'Master': 'svg-master',
  'Moteur Brushless': 'svg-moteur-brushless',
  'PLC': 'svg-plc',
  'Presse étoupe': 'svg-presse-etoupe',
  'Prise': 'svg-prise',
  'Rail DIN': 'svg-rail-din',
  'Relais': 'svg-relais',
  'Relais de sécurité': 'svg-relais-de-securite',
  'Répartiteur': 'svg-repartiteur',
  'Répartiteurs en Y': 'svg-repartiteurs-en-y',
  'Robot': 'svg-robot',
  'Robot collaboratif': 'svg-robot-collaboratif',
  'Router': 'svg-router',
  'Switch': 'svg-switch',
  'Variateur': 'svg-variateur',
  'Ventilateur': 'svg-ventilateur',
  'Vision': 'svg-vision'
};

// Rend une icône de famille : <img> pointant vers le fichier .png si `icon`
// est une des clés ci-dessus, sinon repli sur la police Tabler (anciennes
// valeurs "ti-xxx" déjà enregistrées sur des produits existants avant
// l'introduction de ce module — aucune migration nécessaire, elles restent
// affichées telles quelles). `extraAttrs` : attributs HTML additionnels sur
// l'élément rendu (ex. style="width:20px;height:20px").
function renderFamilyIconHtml(icon, extraAttrs){
  extraAttrs = extraAttrs || '';
  if(icon && FAMILY_ICON_CHOICES.indexOf(icon) !== -1){
    return '<img src="'+FAMILY_ICONS_BASE_PATH+icon+'.png" alt="" aria-hidden="true" '+extraAttrs+'>';
  }
  return '<i class="ti '+(icon || 'ti-package')+'" aria-hidden="true"></i>';
}
