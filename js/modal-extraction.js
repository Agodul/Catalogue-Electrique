  // ---------- Extraction from pasted HTML ----------
  function decodeEntities(str){
    var ta = document.createElement('textarea');
    ta.innerHTML = str;
    return ta.value;
  }

  // Retire les balises HTML et nettoie les espaces — retour utilisateur :
  // "l'importation de la description produit ne garde pas sa mise en page
  // d'origine". Avant, TOUTES les balises de bloc (paragraphes, <br>,
  // puces de liste…) devenaient un simple espace, puis tout saut de ligne
  // restant était lui-même écrasé (.replace(/\s+/g,' ')) : une description
  // avec plusieurs paragraphes ou une liste à puces ressortait en un seul
  // bloc de texte collé, alors que #fDesc est une <textarea> qui affiche
  // très bien des sauts de ligne (et que la fiche produit les restitue
  // aussi, voir vmDesc en white-space:pre-wrap, js/render-view-modal.js).
  // Les frontières de bloc deviennent maintenant de vrais sauts de ligne
  // (et les puces de liste gardent un tiret, seul indice qui survit une
  // fois hors HTML) au lieu d'un espace — seuls les espaces/tabulations
  // sont ensuite aplatis, jamais les \n.
  function stripHtml(str){
    if(!str) return str;
    var s = str
      .replace(/<br\s*\/?>/gi, '\n')
      // Élément de liste : préfixé d'un tiret — sans balise, un saut de
      // ligne seul ne suffirait plus à distinguer une liste d'un paragraphe.
      // </li> ne produit RIEN (pas de \n) : le \n vient déjà du "\n- " de
      // l'élément SUIVANT (ou du </ul>/</ol> final) — sinon chaque puce se
      // retrouvait séparée de la suivante par une ligne vide, comme un
      // paragraphe à part entière plutôt qu'une liste compacte.
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/li>/gi, '')
      // Reste des balises de bloc (ouvrantes ET fermantes, <\/?>) : simple
      // frontière de paragraphe. Le nettoyage plus bas fusionne les sauts de
      // ligne consécutifs qui en résultent.
      .replace(/<\/?(p|div|ul|ol|h[1-6])[^>]*>/gi, '\n')
      // Emphase en ligne (gras/italique…) : jamais de saut de ligne, juste
      // un espace pour ne pas coller deux mots adjacents.
      .replace(/<\/?(strong|b|em|i)[^>]*>/gi, ' ');
    // Retire toutes les balises restantes — laisser le PARSEUR HTML du
    // navigateur s'en charger (stripHtmlTags, js/storage.js) plutôt qu'une
    // regex /<[^>]+>/g (alerte CodeQL "Incomplete multi-character
    // sanitization" : une regex de ce genre peut être contournée par des
    // balises malformées/imbriquées, ex. un fragment "<<script>" dont une
    // seule passe de retrait ne laisse ressortir qu'un "<script>" bien
    // formé — même correctif déjà appliqué à stripHtmlTags pour la même
    // raison, voir son commentaire complet dans js/storage.js). Le nœud
    // n'est jamais inséré dans le document, donc aucun script n'y est
    // jamais exécuté.
    s = stripHtmlTags(s);
    // Décode les entités HTML
    s = decodeEntities(s);
    // Nettoie les espaces/tabulations multiples (mais PAS les \n, qui
    // portent la mise en page d'origine), les espaces collés à un saut de
    // ligne, puis limite les sauts de ligne consécutifs à un maximum de 2
    // (un paragraphe vide entre deux blocs, jamais plus).
    s = s.replace(/[ \t]+/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return s;
  }

  // Bribes d'interface parasites parfois capturées avec le texte extrait
  // (ex: widget de prix Sonepar replié) — retirées automatiquement de tout
  // champ extrait, que ce soit via copier-coller ou l'extension Chrome
  // (même pipeline d'extraction, voir extractFromHtml).
  var EXTRACT_JUNK_PHRASES = [
    /sans\s+offre/gi,
    /d[ée]tails?\s*[:\-]?\s*du\s*[:\-]?\s*prix\s*[:\-]?\s*ferm[ée]s?/gi
  ];
  function stripJunkPhrases(str){
    if(!str) return str;
    var s = str;
    EXTRACT_JUNK_PHRASES.forEach(function(re){ s = s.replace(re, ' '); });
    // Recolle les séparateurs (tirets, barres, puces) laissés orphelins par
    // la suppression — [ \t]+ (pas \s+) : ne touche pas aux \n, qui portent
    // la mise en page d'origine de la description depuis stripHtml()
    // juste au-dessus (retour utilisateur : mise en page perdue à l'import).
    s = s.replace(/[ \t]+/g, ' ').trim();
    s = s.replace(/([-–—|•])(\s*\1)+/g, '$1').replace(/^[\s\-–—|•]+|[\s\-–—|•]+$/g, '');
    return s.replace(/[ \t]+/g, ' ').trim();
  }

  function extractFromHtml(htmlStr, pageUrl){
    var result = {photo:null, photos:[], name:null, desc:null, price:null, brand:null, ref:null, supplier:null, specs:null};
    var doc;
    try{
      var parser = new DOMParser();
      doc = parser.parseFromString(htmlStr, 'text/html');
    }catch(e){
      return result;
    }

    function meta(selectors){
      for(var i=0;i<selectors.length;i++){
        var el = doc.querySelector(selectors[i]);
        if(el){
          var v = el.getAttribute('content') || el.textContent;
          if(v && v.trim()) return v.trim();
        }
      }
      return null;
    }

    function txt(selectors){
      for(var i=0;i<selectors.length;i++){
        var el = doc.querySelector(selectors[i]);
        if(el){
          var v = el.textContent || el.getAttribute('data-value') || el.getAttribute('value') || '';
          if(v.trim()) return v.trim();
        }
      }
      return null;
    }

    // ── Détection du fournisseur depuis l'URL ──────────────────────────
    var hostname = '';
    try{ hostname = new URL(pageUrl).hostname.replace('www.',''); }catch(e){}
    // Plus de prix jamais trouvable sur certains sites (catalogues pro,
    // ex. se.com) : ce cas est géré par l'extension (sites/*.json côté
    // extension), qui envoie directement les champs déjà extraits. Ici,
    // volontairement générique — extraction purement générique dans tous
    // les cas (retour utilisateur : "je veux que seul l'extension gère
    // l'extraction [par site], pas l'app" — voir SPI catalogue extension/
    // spi-extension/background.js pour les règles par site).
    var noPricingSite = false;

    // Retour utilisateur : "l'extraction automatique... ça ne remplit pas le
    // fournisseur" — deux décalages trouvés en comparant cette table à celle,
    // équivalente, des sites gérés par l'extension (sites/*.json) : Sonepar
    // manquait ENTIÈREMENT ici (aucune entrée), et Weidmüller n'avait que
    // l'orthographe SANS le "e" allemand ("weidmuller.com/.fr") alors que le
    // vrai domaine ("weidmueller.com", ex. eshop.weidmueller.com — testé en
    // direct plusieurs fois cette session) s'écrit "weidmueller". "Cembre.com"
    // (avec majuscule) ne pouvait aussi jamais matcher : hostname est TOUJOURS
    // en minuscules (spec URL), une entrée de table avec une majuscule est
    // donc du code mort silencieux.
    var supplierMap = {
      'balluff.com'           : 'Balluff',
      'balluff.fr'            : 'Balluff',
      'phoenixcontact.com'    : 'Phoenix Contact',
      'phoenixcontact.fr'     : 'Phoenix Contact',
      'sick.com'              : 'SICK',
      'sick.fr'               : 'SICK',
      'se.com'                : 'Schneider Electric',
      'schneider-electric.com': 'Schneider Electric',
      'schneider-electric.fr' : 'Schneider Electric',
      'sonepar.fr'            : 'Sonepar',
      'sonepar.com'           : 'Sonepar',
      'ifm.com'               : 'IFM',
      'pepperl-fuchs.com'     : 'Pepperl+Fuchs',
      'pepperl-fuchs.fr'      : 'Pepperl+Fuchs',
      'turck.com'             : 'Turck',
      'turck.fr'              : 'Turck',
      'omron.com'             : 'Omron',
      'omron.fr'              : 'Omron',
      'festo.com'             : 'Festo',
      'festo.fr'              : 'Festo',
      'smc.eu'                : 'SMC',
      'smc.fr'                : 'SMC',
      'rs-online.com'         : 'RS Components',
      'rs-components.com'     : 'RS Components',
      'rs-components.fr'      : 'RS Components',
      'distrelec.fr'          : 'Distrelec',
      'conrad.fr'             : 'Conrad',
      'mouser.fr'             : 'Mouser',
      'digikey.fr'            : 'DigiKey',
      'farnell.com'           : 'Farnell',
      'element14.com'         : 'Farnell',
      'automation24.fr'       : 'Automation24',
      'automation24.com'      : 'Automation24',
      'automation24.de'       : 'Automation24',
      'weidmueller.com'       : 'Weidmüller',
      'weidmueller.fr'        : 'Weidmüller',
      'weidmuller.com'        : 'Weidmüller',
      'weidmuller.fr'         : 'Weidmüller',
      'wago.com'              : 'WAGO',
      'wago.fr'               : 'WAGO',
      'legrand.fr'            : 'Legrand',
      'legrand.com'           : 'Legrand',
      'hager.fr'              : 'Hager',
      'hager.com'             : 'Hager',
      'siemens.com'           : 'Siemens',
      'siemens.fr'            : 'Siemens',
      'abb.com'               : 'ABB',
      'abb.fr'                : 'ABB',
      'rockwellautomation.com': 'Rockwell Automation',
      'keyence.fr'            : 'Keyence',
      'keyence.com'           : 'Keyence',
      'banner-france.fr'      : 'Banner',
      'bannerengineering.com' : 'Banner',
      'contrinex.com'         : 'Contrinex',
      'baumer.com'            : 'Baumer',
      'leuze.com'             : 'Leuze',
      'leuze.fr'              : 'Leuze',
      'carlo-gavazzi.com'     : 'Carlo Gavazzi',
      'cembre.com'            : 'Cembre',
    };
    for(var domain in supplierMap){
      if(hostname === domain || hostname.endsWith('.' + domain)){
        result.supplier = supplierMap[domain];
        break;
      }
    }

    // ── JSON-LD (source la plus fiable) ───────────────────────────────
    var ldNodes = doc.querySelectorAll('script[type="application/ld+json"]');
    for(var i=0;i<ldNodes.length;i++){
      try{
        var data = JSON.parse(ldNodes[i].textContent);
        var candidates = Array.isArray(data) ? data : [data];
        if(data['@graph']) candidates = candidates.concat(data['@graph']);
        for(var c=0;c<candidates.length;c++){
          var node = candidates[c];
          if(!node) continue;
          var type = node['@type'];
          var typeStr = Array.isArray(type) ? type.join(',') : (type||'');
          if(typeStr.toLowerCase().indexOf('product') !== -1){
            if(!result.name  && node.name)        result.name  = node.name;
            if(!result.desc  && node.description) result.desc  = node.description;
            if(!result.ref   && node.sku)         result.ref   = node.sku;
            if(!result.ref   && node.mpn)         result.ref   = node.mpn;
            // "model" avant "productID" : testé en vrai sur Keyence, dont le
            // JSON-LD product fournit les DEUX — "model" contient la vraie
            // référence commerciale (ex. "LR-X100", celle affichée sur la
            // page/l'URL), tandis que "productID" est un identifiant interne
            // Keyence sans rapport (ex. "PM_243X100") que personne ne
            // reconnaît (retour utilisateur : "la référence entrée n'est pas
            // la bonne"). "model" reste un champ standard schema.org pour la
            // référence produit, donc probablement fiable sur d'autres sites
            // aussi — productID n'est gardé qu'en tout dernier repli.
            if(!result.ref   && node.model)       result.ref   = node.model;
            if(!result.ref   && node.productID)   result.ref   = node.productID;
            if(!result.brand && node.brand){
              var b = node.brand;
              result.brand = (typeof b === 'object') ? (b.name || '') : String(b);
            }
            if(!result.photo){
              var img = node.image;
              if(Array.isArray(img)) img = img[0];
              if(img && typeof img === 'object') img = img.url;
              if(img) result.photo = img;
            }
            if(!result.price){
              var offers = node.offers;
              if(Array.isArray(offers)) offers = offers[0];
              if(offers){
                var price = offers.price || offers.lowPrice;
                var currency = offers.priceCurrency || '';
                if(price) result.price = (price + ' ' + currency).trim();
              }
            }
          }
        }
      }catch(e){ /* ignore malformed JSON-LD */ }
    }

    // ── Open Graph / meta fallbacks ────────────────────────────────────
    if(!result.name) result.name = meta(['meta[property="og:title"]','meta[name="og:title"]','title']);
    if(!result.desc) result.desc = meta(['meta[property="og:description"]','meta[name="description"]']);
    if(!result.photo) result.photo = meta(['meta[property="og:image"]','meta[name="twitter:image"]']);
    if(!result.price) result.price = meta(['meta[property="product:price:amount"]','meta[property="og:price:amount"]']);
    if(!result.brand) result.brand = meta(['meta[property="product:brand"]','meta[name="brand"]','meta[itemprop="brand"]']);
    if(!result.ref)   result.ref   = meta(['meta[property="product:sku"]','meta[name="sku"]','meta[itemprop="sku"]',
                                           'meta[property="product:mpn"]','meta[name="mpn"]']);

    // ── Sélecteurs DOM génériques (itemprop, data-attributes) ─────────
    // '[class*="-reference"]' (tiret devant) plutôt que '[class*="reference"]'
    // seul — testé en vrai sur se.com (Schneider) : "reference" est un
    // simple SOUS-TEXTE de "preference", donc le sélecteur nu attrapait la
    // bannière de cookies OneTrust ("save-preference-btn-handler") avant
    // même d'atteindre un vrai champ référence produit (retour utilisateur :
    // "l'extension ne mets plus la référence"). Le tiret élimine ce faux
    // positif tout en gardant les classes composées habituelles
    // (product-reference, article-reference…).
    if(!result.ref){
      result.ref = txt([
        '[itemprop="sku"]','[itemprop="mpn"]','[itemprop="productID"]',
        '[data-sku]','[data-ref]','[data-product-ref]','[data-product-id]',
        '[class*="product-ref"]','[class*="product-sku"]','[class*="sku"]',
        '[class*="ref-produit"]','[class*="-reference"]'
      ]);
    }
    if(!result.brand){
      result.brand = txt([
        '[itemprop="brand"]','[data-brand]','[class*="brand-name"]',
        '[class*="product-brand"]','[class*="manufacturer"]',
        '[itemprop="manufacturer"]'
      ]);
    }

    // ── Nettoyage de la référence ──────────────────────────────────────
    if(result.ref){
      // Garder seulement la partie alphanumérique principale (supprimer labels "Réf :", "SKU :" etc.)
      result.ref = result.ref
        .replace(/^(ref\.?|réf\.?|sku|mpn|art\.?|n°|no\.?|référence|reference|article)\s*[:=\-]?\s*/i, '')
        .replace(/\s+/g,' ')
        .trim()
        .slice(0, 60);
    }

    // ── Nettoyage marque ───────────────────────────────────────────────
    if(result.brand){
      result.brand = stripHtml(result.brand).replace(/\s+/g,' ').trim().slice(0, 50);
    }

    // ── Prix fallback DOM ──────────────────────────────────────────────
    // noPricingSite (ex. Schneider/se.com) : catalogue pro sans prix public,
    // on ne cherche même pas — voir commentaire sur la règle Schneider.
    if(!result.price && !noPricingSite){
      // Exclut les cartes de carrousel "produits associés/similaires" : sur
      // Sonepar par exemple, TOUS les éléments [class*="price"] de la page
      // appartenaient à ce carrousel (aucun sur la fiche du produit
      // consulté, qui nécessite un compte pro pour afficher un prix) — le
      // premier trouvé était donc systématiquement le prix (ou pire, un
      // texte de mise en avant commerciale) d'un AUTRE produit, sans rapport
      // (retour utilisateur : prix visiblement faux/incohérent à chaque
      // fiche Sonepar). Ce filtre protège n'importe quel fournisseur ayant
      // ce genre de carrousel, pas seulement Sonepar.
      var priceCandidates = doc.querySelectorAll('[class*="price"], [itemprop="price"], [data-price]');
      var priceEl = null;
      for(var pi=0; pi<priceCandidates.length; pi++){
        var pEl = priceCandidates[pi];
        var pAncestor = pEl, inCarousel = false;
        while(pAncestor && pAncestor !== doc.body){
          var pCls = (pAncestor.className || '').toString();
          if(/slider|carousel|carrousel|related|similar|suggestion|recommend|associ[ée]/i.test(pCls)){
            inCarousel = true; break;
          }
          pAncestor = pAncestor.parentElement;
        }
        if(inCarousel) continue;
        // Ignore les prix "de comparaison" (barré, pourcentage d'économie…) :
        // jamais le prix effectivement facturé — vérifié en vrai sur
        // Automation24, qui affiche à la fois un badge "-19 %" (class
        // "price-saving") et le prix barré non remisé (class "priceUVP")
        // AVANT le vrai prix (class "price" tout court) dans l'ordre du DOM.
        var pCls2 = (pEl.className || '').toString();
        if(/saving|uvp|old|strike|barre|rrp|msrp|was[-_]?price|regular[-_]?price/i.test(pCls2)) continue;
        var pRaw = pEl.getAttribute('content') || pEl.textContent || '';
        // Doit ressembler à un vrai prix (symbole monétaire, ou attribut
        // "content" numérique façon microdonnées itemprop="price") — sinon
        // un badge sans rapport comme "-19 %" passe le filtre ci-dessus tout
        // en n'étant pas non plus à 0 (retour utilisateur, même cas).
        var hasCurrency = !!pEl.getAttribute('content') || /(€|\$|£|EUR|USD|GBP)/i.test(pRaw);
        if(!hasCurrency) continue;
        // Ignore un prix à 0 : jamais le vrai prix d'une fiche produit, mais
        // souvent celui d'un widget sans rapport présent plus haut dans le
        // DOM — ex. le total du mini-panier dans l'en-tête, à 0,00 € tant
        // que le panier est vide (retour utilisateur, Automation24 : premier
        // [class*="price"] de la page = ce mini-panier, jamais le prix
        // affiché de l'article recherché).
        var pNum = parseFloat(pRaw.replace(/\s/g,'').replace(',', '.'));
        if(!isNaN(pNum) && pNum === 0) continue;
        priceEl = pEl; break;
      }
      if(priceEl){
        var ptxt = priceEl.getAttribute('content') || priceEl.textContent;
        if(ptxt) result.price = ptxt.trim().replace(/\s+/g,' ').slice(0,40);
      }
    }
    if(!result.price && !noPricingSite){
      // textContent inclut le code source des balises <script>/<style> (ce
      // sont des nœuds texte comme les autres) — sur une page bourrée de JS
      // minifié, un simple "1$" (jQuery, template literal, etc.) suffisait
      // à déclencher un faux prix (retour utilisateur, ex. Schneider). On
      // clone le body et on retire scripts/styles/noscript avant de
      // chercher, pour ne matcher que du texte réellement affichable.
      var bodyClone = doc.body ? doc.body.cloneNode(true) : null;
      if(bodyClone){
        bodyClone.querySelectorAll('script, style, noscript').forEach(function(el){ el.remove(); });
        // Même exclusion carrousel que le fallback précédent : sans ça, un
        // prix de produit associé/similaire pouvait quand même être capté
        // ici si le produit consulté lui-même n'a aucun élément [class*=
        // "price"] (cas Sonepar sans compte pro connecté).
        bodyClone.querySelectorAll('[class*="slider" i],[class*="carousel" i],[class*="carrousel" i],[class*="related" i],[class*="similar" i],[class*="suggestion" i],[class*="recommend" i],[class*="associ" i]').forEach(function(el){ el.remove(); });
        var bodyText = bodyClone.textContent || '';
        var m = bodyText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(€|\$|£|EUR|USD|GBP)/);
        if(m) result.price = m[0].trim();
      }
    }

    // ── Caractéristiques techniques ─────────────────────────────────────
    // Cherche d'abord un conteneur explicitement dédié aux caractéristiques
    // (classe/id contenant spec/characteristic/technical/attribute), pour
    // éviter de ramasser des tableaux sans rapport (navigation, gammes de
    // prix, etc.). Si rien de ciblé n'est trouvé, retombe sur TOUS les
    // tableaux/listes à 2 colonnes de la page, avec un plafond de lignes
    // pour limiter les faux positifs. Fonctionne pour n'importe quel
    // fournisseur (pas de règle par site) : tables classiques (<tr><th|td>)
    // et listes de définition (<dl><dt><dd>), les deux formats les plus
    // courants pour une fiche technique. Sur les sites où les
    // caractéristiques ne sont chargées qu'après une interaction (ex.
    // accordéon replié sur une page très dynamique), rien n'est trouvé —
    // même limite que pour les autres champs : l'extension capture le HTML
    // tel qu'affiché au moment du clic droit.
    (function collectSpecs(){
      function addPair(pairs, k, v){
        k = k.replace(/\s+/g,' ').trim();
        v = v.replace(/\s+/g,' ').trim();
        // k.length>=2 : élimine les glyphes d'icône (police d'icônes rendue
        // en un seul caractère, ex. "i", "→") faussement pris pour une clé
        // — repéré en testant un lien "icône + texte" (ex. bouton Retour)
        // à l'intérieur d'un conteneur "spec", voir garde anti-lien plus
        // bas pour la même raison.
        if(k && v && k !== v && k.length >= 2 && k.length < 80 && v.length < 200 && !pairs[k]) pairs[k] = v;
      }
      // includeGenericRows : en plus des <tr>/<dt><dd> (tableaux/listes de
      // définition classiques), ramasse aussi le motif "div de ligne" —
      // <div><div>Clé</div><div>Valeur</div></div> — très courant sur les
      // sites modernes (React/Vue) qui n'utilisent plus de balises
      // sémantiques pour leurs tableaux de caractéristiques (retour
      // utilisateur : "quand j'ajoute au catalogue via l'extension les
      // caractéristiques techniques ne sont plus remplies" — repéré en
      // testant plusieurs structures HTML réalistes : seuls tr/dt-dd
      // étaient couverts jusqu'ici, rien pour ce motif très répandu).
      // Restreint aux enfants "feuilles" (aucun des deux n'a lui-même
      // d'enfant) pour ne pas remonter un conteneur plus large qui
      // engloberait plusieurs vraies lignes en une seule "paire", et
      // UNIQUEMENT quand includeGenericRows est vrai (jamais sur le repli
      // toute-la-page ci-dessous, qui ramasserait alors n'importe quelle
      // mise en page à 2 colonnes sans rapport — nav, grille produits…).
      function collectPairsFrom(container, includeGenericRows){
        var pairs = {};
        if(!container) return pairs;
        container.querySelectorAll('tr').forEach(function(row){
          var cells = row.querySelectorAll('th, td');
          if(cells.length === 2) addPair(pairs, cells[0].textContent, cells[1].textContent);
        });
        container.querySelectorAll('dt').forEach(function(dt){
          var dd = dt.nextElementSibling;
          if(dd && dd.tagName === 'DD') addPair(pairs, dt.textContent, dd.textContent);
        });
        if(includeGenericRows){
          container.querySelectorAll('*').forEach(function(el){
            if(el.children.length !== 2) return;
            if(el.tagName === 'TR' || el.tagName === 'DL') return;
            // Jamais un lien/bouton (ni un de ses descendants) — un bouton
            // "Retour"/"Partager"/"Imprimer" avec icône + texte à côté a
            // exactement la même forme (2 enfants "feuilles") qu'une vraie
            // ligne clé/valeur, mais n'en est pas une (repéré en testant :
            // un tel lien à l'intérieur d'un conteneur "spec" remontait
            // comme fausse caractéristique).
            if(el.closest('a, button, nav')) return;
            var a = el.children[0], b = el.children[1];
            if(a.children.length > 0 || b.children.length > 0) return;
            addPair(pairs, a.textContent, b.textContent);
          });
        }
        return pairs;
      }

      var specs = {};
      // "feature" ajouté — testé en vrai sur eshop.weidmueller.com : les 105
      // lignes de caractéristiques (motif "div de ligne", déjà couvert par
      // collectPairsFrom) vivent dans un conteneur ".feature-sml", jamais
      // trouvé sans ce mot-clé (spec/characteristic/technical/attribute
      // n'y apparaissent nulle part) — aucune caractéristique n'était donc
      // jamais collectée sur ce site, quelle que soit la structure DOM en
      // dessous (retour utilisateur : "aucune extraction").
      var targeted = doc.querySelectorAll(
        '[class*="spec" i], [id*="spec" i], [class*="characteristic" i], [id*="characteristic" i], ' +
        '[class*="technical" i], [id*="technical" i], [class*="attribute" i], [id*="attribute" i], ' +
        '[class*="feature" i], [id*="feature" i]'
      );
      for(var si=0; si<targeted.length; si++){
        var found = collectPairsFrom(targeted[si], true);
        Object.keys(found).forEach(function(k){ if(!specs[k]) specs[k] = found[k]; });
      }
      // Repli générique (toute la page) si aucun conteneur ciblé trouvé —
      // motif "div de ligne" volontairement PAS activé ici (voir plus haut).
      if(Object.keys(specs).length === 0){
        specs = collectPairsFrom(doc.body, false);
      }
      var keys = Object.keys(specs).slice(0, 40);
      if(keys.length){
        result.specs = {};
        keys.forEach(function(k){ result.specs[k] = specs[k]; });
      }
    })();

    // ── Résolution URL photo relative ──────────────────────────────────
    if(result.photo && pageUrl){
      try{ result.photo = new URL(result.photo, pageUrl).href; }catch(e){}
    }

    // ── Collecte de toutes les images de la page ──────────────────────
    var seenUrls = {};

    // Normalise une URL pour le dédoublonnage :
    // supprime les paramètres de taille courants (w=, h=, width=, size=, format=, quality=...)
    function normalizeForDedup(url){
      try{
        var u = new URL(url);
        var remove = ['w','h','width','height','size','format','quality','dpr','fit','auto','crop','scale','resize','tr','imwidth','imheight','wid','hei'];
        remove.forEach(function(k){ u.searchParams.delete(k); });
        // Aussi ignorer les suffixes de taille dans le path ex: image_300x300.jpg → image.jpg
        var path = u.pathname.replace(/_\d+x\d+(\.\w+)$/, '$1').replace(/-\d+x\d+(\.\w+)$/, '$1');
        return u.origin + path + u.search;
      }catch(e){ return url; }
    }

    function addPhoto(url){
      if(!url) return;
      try{
        var abs = pageUrl ? new URL(url, pageUrl).href : url;
        // Exclure data URI trop courts (pixels tracking, placeholders base64)
        if(abs.startsWith('data:') && abs.length < 500) return;
        // Filtrer les URLs qui ressemblent à des icônes/logos de nav
        var lower = abs.toLowerCase();
        if(/(\/(icon|logo|favicon|sprite|pixel|tracking|banner|badge|flag|avatar|placeholder)|picto)/.test(lower)) return;
        if(/\.(svg)(\?|$)/.test(lower)) return;
        // Dédoublonner sur l'URL normalisée (sans params de taille)
        var key = normalizeForDedup(abs);
        if(seenUrls[key]) return;
        seenUrls[key] = true;
        // Stocker la plus grande version disponible : préférer l'URL originale sans resize
        result.photos.push(abs);
      }catch(e){}
    }

    // Photo principale en premier
    if(result.photo) addPhoto(result.photo);

    // Toutes les images JSON-LD déjà parsées
    var ldNodes2 = doc.querySelectorAll('script[type="application/ld+json"]');
    for(var li=0; li<ldNodes2.length; li++){
      try{
        var ld2 = JSON.parse(ldNodes2[li].textContent);
        var cands2 = Array.isArray(ld2) ? ld2 : [ld2];
        if(ld2['@graph']) cands2 = cands2.concat(ld2['@graph']);
        cands2.forEach(function(n){
          if(!n) return;
          var imgs = n.image;
          if(!imgs) return;
          if(!Array.isArray(imgs)) imgs = [imgs];
          imgs.forEach(function(im){
            if(typeof im === 'object') im = im.url;
            addPhoto(im);
          });
        });
      }catch(e){}
    }

    // Toutes les balises <img> avec src
    // Filtres : exclure images trop petites (icônes) et éléments hors zone produit
    var imgEls = doc.querySelectorAll('img[src], img[data-src]');
    for(var ii=0; ii<imgEls.length; ii++){
      var el = imgEls[ii];

      // Exclure si dimensions déclarées trop petites (icônes, pictos)
      var w = parseInt(el.getAttribute('width')  || el.getAttribute('data-width')  || 0);
      var h = parseInt(el.getAttribute('height') || el.getAttribute('data-height') || 0);
      if((w > 0 && w < 80) || (h > 0 && h < 80)) continue;

      // Exclure si l'image est dans un élément de navigation/footer/header
      var parent = el.parentElement;
      var inNav = false;
      while(parent && parent !== doc.body){
        var tag = parent.tagName ? parent.tagName.toLowerCase() : '';
        var cls = (parent.className || '').toLowerCase();
        var pid = (parent.id || '').toLowerCase();
        if(tag === 'nav' || tag === 'header' || tag === 'footer'
          || /nav|header|footer|menu|breadcrumb|sidebar|aside|widget|social|share|cookie|banner|overlay/.test(cls)
          || /nav|header|footer|menu|sidebar/.test(pid)){
          inNav = true; break;
        }
        parent = parent.parentElement;
      }
      if(inNav) continue;

      var dataSrc = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
      var src = el.getAttribute('src');

      // Srcset : prendre la plus grande résolution
      var srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
      if(srcset){
        var parts = srcset.split(',').map(function(s){ return s.trim().split(/\s+/); });
        parts.sort(function(a,b){ return (parseInt(b[1])||0) - (parseInt(a[1])||0); });
        if(parts[0] && parts[0][0]){ addPhoto(parts[0][0]); continue; }
      }

      addPhoto(dataSrc || src);
    }

    // ── Nettoyage final ────────────────────────────────────────────────
    // .replace(/\s+/g,' ') après stripHtml() effacait tout saut de ligne
    // que stripHtml() venait de préserver (retour utilisateur : mise en
    // page d'origine perdue à l'import) — result.name reste sur une seule
    // ligne (aucune balise de bloc n'y a de sens), mais result.desc ne doit
    // plus repasser par ce même aplatissement.
    if(result.name)  result.name  = stripJunkPhrases(stripHtml(result.name).replace(/\s+/g,' ').trim());
    if(result.desc)  result.desc  = stripJunkPhrases(stripHtml(result.desc));
    if(result.price) result.price = stripJunkPhrases(decodeEntities(result.price).replace(/\s+/g,' ').trim());
    // Repli général : result.photo (LA photo principale, utilisée pour
    // fPhoto) restait null tant qu'aucune source dédiée (JSON-LD, og:image,
    // règle par site) ne la remplissait — même quand result.photos[] (la
    // galerie, elle, alimentée aussi par un simple balayage générique de
    // toutes les <img> plus haut) avait déjà trouvé la bonne image. Testé
    // en vrai sur eshop.weidmueller.com : aucun JSON-LD/og:image sur cette
    // page, mais une <img> de galerie tout à fait normale et valide — sans
    // ce repli, aucune photo n'était jamais proposée malgré une image
    // trouvable (retour utilisateur : "il ne peux trouve plus l'image du
    // produit"). Générique, profite à tout site dans le même cas, pas
    // seulement Weidmüller.
    if(!result.photo && result.photos.length) result.photo = result.photos[0];

    return result;
  }

  document.getElementById('btnExtract').addEventListener('click', function(){
    var html = fHtml.value;
    if(!html.trim()){
      extractStatus.className = 'extract-status warn show';
      extractStatus.textContent = 'Collez d\'abord le code source de la page produit dans le champ ci-dessus.';
      return;
    }
    var data = extractFromHtml(html, fUrl.value.trim());
    var found = [];
    if(data.name)     { fName.value     = data.name;              found.push('nom'); }
    if(data.desc)     { fDesc.value     = stripHtml(data.desc);   found.push('description'); renderTagSuggestions(); }
    if(data.price)    { fPrice.value    = data.price;             found.push('prix'); }
    if(data.photo)    { fPhoto.value    = data.photo; updatePhotoPreview(); found.push('photo'); }
    // Afficher la galerie si plusieurs photos trouvées (ou même une seule via proxy)
    if(data.photos && data.photos.length > 0){ showPhotoGallery(data.photos); }
    else { clearPhotoGallery(); }
    if(data.brand)    { fBrand.value    = data.brand;             found.push('marque'); }
    if(data.ref)      { fRef.value      = data.ref;               found.push('référence'); }
    if(data.supplier) { fSupplier.value = data.supplier;          found.push('fournisseur'); }
    if(data.specs){
      _specsRows = Object.keys(data.specs).map(function(k){ return { key: k, value: data.specs[k] }; });
      _specsRenderRows();
      found.push('caractéristiques (' + _specsRows.length + ')');
    }
    // Déclencher le contrôle doublon dès que ref/brand sont remplis (même via extension)
    checkDuplicateRef();

    if(found.length){
      extractStatus.className = 'extract-status ok show';
      extractStatus.textContent = 'Informations trouvées : ' + found.join(', ') + '. Vérifiez puis complétez à la main si besoin.';
    }else{
      extractStatus.className = 'extract-status warn show';
      extractStatus.textContent = 'Aucune information standard détectée sur cette page. Remplissez les champs vous-même.';
    }
  });
