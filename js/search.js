// ============================================================
// search.js — Recherche, filtres, scoring
// ============================================================

function refreshFilterCache(){
    var v = products.length;
    if(v === _filterCache.version) return;
    _filterCache.version   = v;
    _filterCache.brands    = Array.from(new Set(products.map(function(p){return p.brand||'';}).filter(Boolean))).sort();
    _filterCache.families  = Array.from(new Set(products.map(function(p){return p.family||'';}).filter(Boolean))).sort();
    _filterCache.series    = Array.from(new Set(products.map(function(p){return p.series||'';}).filter(Boolean))).sort();
    _filterCache.suppliers = Array.from(new Set(products.map(function(p){return p.supplier||'';}).filter(Boolean))).sort();
  }
  var familyListEl = null; // remplacé par autocomplete custom
  var seriesListEl = null; // remplacé par autocomplete custom
  var groupBy = 'brand'; // 'brand' | 'family' | 'series'

  function escapeHtml(s){
    return (s||'').replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // Normalise une chaîne pour la recherche : minuscules + sans accents
  function normalizeSearch(s){
    return (s||'').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 -]/g, ' ')
      .trim();
  }

  // Surligne les termes de recherche dans un texte (retourne HTML)
  function highlight(text, terms){
    if(!terms || !terms.length || !text) return escapeHtml(text);
    // Travailler caractère par caractère sur le texte original
    // pour éviter les décalages d'index entre normalisé et original
    var norm = normalizeSearch(text);
    var lower = text.toLowerCase();
    // Construire un tableau de positions à surligner
    var marks = new Array(text.length).fill(false);
    terms.forEach(function(t){
      if(!t || t.length < 2) return;
      var start = 0;
      while(true){
        var idx = norm.indexOf(t, start);
        if(idx === -1) break;
        // Marquer les positions dans le texte original
        for(var k = idx; k < Math.min(idx + t.length, text.length); k++) marks[k] = true;
        start = idx + 1;
      }
    });
    // Construire le HTML avec les balises <mark>
    var result = '';
    var inMark = false;
    for(var i = 0; i < text.length; i++){
      var ch = escapeHtml(text[i]);
      if(marks[i] && !inMark){ result += '<mark class="hl">'; inMark = true; }
      if(!marks[i] && inMark){ result += '</mark>'; inMark = false; }
      result += ch;
    }
    if(inMark) result += '</mark>';
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  //  RECHERCHE PAR PERTINENCE
  //  Score attribué à chaque produit selon la qualité de correspondance :
  //    100 — référence exacte (ex: "BMF00JC" → BMF00JC)
  //     80 — référence commence par le terme
  //     70 — nom exact complet
  //     60 — nom commence par le terme
  //     50 — marque ou famille exacte
  //     40 — marque ou famille contient le terme
  //     30 — série contient le terme
  //     20 — nom contient le terme (milieu de mot)
  //     10 — description contient le terme
  //      0 — fournisseur ou tags contiennent le terme
  //  Si plusieurs mots : score = somme des scores individuels
  //  Les produits sont triés par score décroissant
  // ─────────────────────────────────────────────────────────────
  function scoreProduct(p, terms){
    var score = 0;
    var ref  = normalizeSearch(p.ref);
    var tags = normalizeSearch((p.tags||[]).join(' '));

    terms.forEach(function(t){
      if(!t) return;
      // Référence
      if(ref === t)                 score += 100;
      else if(ref.indexOf(t) === 0) score += 80;
      else if(ref.indexOf(t) !== -1) score += 60;
      // Tags
      if(tags === t)                score += 80;
      else if(tags.indexOf(t) !== -1) score += 40;
    });
    return score;
  }

  function getFilteredProducts(){
    var raw = normalizeSearch(searchInputEl.value);
    var brand  = brandFilterEl.value;
    var family = familyFilterEl.value;
    var series = seriesFilterEl.value;

    // Filtrage par sélecteurs
    var filtered = products.filter(function(p){
      if(brand  && p.brand  !== brand)  return false;
      if(family && p.family !== family) return false;
      if(series && p.series !== series) return false;
      return true;
    });

    if(!raw){
      if(window._priceSort === 'asc'){
        filtered.sort(function(a,b){ return (parsePriceNumber(a.price)||0) - (parsePriceNumber(b.price)||0); });
      } else if(window._priceSort === 'desc'){
        filtered.sort(function(a,b){ return (parsePriceNumber(b.price)||0) - (parsePriceNumber(a.price)||0); });
      }
      return filtered;
    }

    // Découpe en mots pour recherche multi-termes
    var terms = raw.split(/\s+/).filter(Boolean);

    // Filtrer : garder seulement les produits qui contiennent TOUS les termes
    var matched = filtered.filter(function(p){
      var hay = normalizeSearch([p.ref, (p.tags||[]).join(' ')].join(' '));
      return terms.every(function(t){ return hay.indexOf(t) !== -1; });
    });

    // Calculer et stocker le score sur chaque produit
    matched.forEach(function(p){ p._score = scoreProduct(p, terms); });

    // Trier par score décroissant
    matched.sort(function(a, b){ return b._score - a._score; });

    // Appliquer ensuite le tri prix si actif (écrase le tri pertinence)
    if(window._priceSort === 'asc'){
      matched.sort(function(a,b){ return (parsePriceNumber(a.price)||0) - (parsePriceNumber(b.price)||0); });
    } else if(window._priceSort === 'desc'){
      matched.sort(function(a,b){ return (parsePriceNumber(b.price)||0) - (parsePriceNumber(a.price)||0); });
    }
    return matched;
  }

  function groupByField(list, field, fallbackLabel, hasSearch){
    var groups = {};
    var order = [];
    var groupScore = {}; // score max par groupe
    list.forEach(function(p){
      var key = p[field] || fallbackLabel;
      if(!groups[key]){ groups[key] = []; order.push(key); groupScore[key] = 0; }
      groups[key].push(p);
      // Garder le score max du groupe (stocké sur le produit via _score)
      if(p._score !== undefined && p._score > groupScore[key]) groupScore[key] = p._score;
    });
    if(hasSearch){
      // Trier les groupes par score max décroissant
      order.sort(function(a,b){ return groupScore[b] - groupScore[a]; });
    } else {
      order.sort(function(a,b){ return a.localeCompare(b, 'fr'); });
    }
    return {groups:groups, order:order};
  }

  var _lastRenderKey = '';
  var _vmMenuTimer = null;
  