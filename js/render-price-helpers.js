  function getLastPriceJumpPct(p){
    if(!Array.isArray(p.priceHistory) || p.priceHistory.length === 0) return null;
    var lastOld = p.priceHistory[p.priceHistory.length - 1].price;
    var prev = parsePriceNumber(lastOld);
    var cur = parsePriceNumber(p.price);
    if(prev === null || cur === null || prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  }

  // Reformate un prix en français à l'AFFICHAGE, quelle que soit la façon
  // dont il est stocké : toujours 2 décimales + séparateur de milliers
  // (ex. "2€" -> "2,00 €", "1000" -> "1 000,00 €", peu importe si la source
  // était en point, sans décimales, ou déjà groupée). Un prix arrivé hors du
  // formulaire (import Excel, historique, synchro serveur...) n'est pas
  // garanti d'avoir ce format au départ (retour utilisateur, capture à
  // l'appui) — reformater à l'affichage règle ça pour toutes les sources
  // d'un coup, sans avoir à corriger chaque chemin d'écriture séparément.
  // Devises non-EUR laissées telles quelles (convention différente).
  function _parsePriceNum(str){
    var cleaned = String(str).replace(/[^\d.,]/g, '').trim();
    if(!cleaned) return null;
    // Gère "1234.56", "1234,56" et "1.234,56"
    if(cleaned.indexOf(',') !== -1 && cleaned.indexOf('.') !== -1){
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if(cleaned.indexOf(',') !== -1){
      cleaned = cleaned.replace(',', '.');
    }
    var n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  function _displayPrice(v){
    if(!v) return v;
    if(/[$£¥]|USD|GBP|CHF|CAD/i.test(v)) return v;
    var n = _parsePriceNum(v);
    if(n === null) return v; // valeur non reconnue comme un nombre : laissée telle quelle
    return n.toLocaleString('fr-FR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' €';
  }

  // Retourne le prix catalogue fabricant si différent du prix de vente
  function getOriginalPrice(p){
    // Priorité : champ priceCatalogue dédié
    if(p.priceCatalogue && p.priceCatalogue !== p.price) return p.priceCatalogue;
    // Fallback : premier historique
    if(!Array.isArray(p.priceHistory) || p.priceHistory.length === 0) return null;
    var orig = p.priceHistory[0].price;
    if(!orig || orig === p.price) return null;
    return orig;
  }

  // Calcule la remise en % entre le prix d'origine et le prix actuel
  function getDiscountPct(p){
    var orig = getOriginalPrice(p);
    if(!orig) return null;
    var origNum = parsePriceNumber(orig);
    var curNum  = parsePriceNumber(p.price);
    if(!origNum || !curNum || origNum === 0) return null;
    var pct = ((curNum - origNum) / origNum) * 100;
    return pct; // négatif = remise, positif = hausse
  }

