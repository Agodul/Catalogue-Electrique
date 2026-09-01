  // ---------- Extraction from pasted HTML ----------
  function decodeEntities(str){
    var ta = document.createElement('textarea');
    ta.innerHTML = str;
    return ta.value;
  }

  // Retire les balises HTML et nettoie les espaces/sauts de ligne
  function stripHtml(str){
    if(!str) return str;
    // Remplace les balises de bloc par des espaces pour éviter les mots collés
    var s = str
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|strong|b|em|i)[^>]*>/gi, ' ');
    // Retire toutes les balises restantes
    s = s.replace(/<[^>]+>/g, '');
    // Décode les entités HTML
    s = decodeEntities(s);
    // Nettoie les espaces multiples et sauts de ligne
    s = s.replace(/\s+/g, ' ').trim();
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
    // Recolle les séparateurs (tirets, barres, puces) laissés orphelins par la suppression.
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/([-–—|•])(\s*\1)+/g, '$1').replace(/^[\s\-–—|•]+|[\s\-–—|•]+$/g, '');
    return s.replace(/\s+/g, ' ').trim();
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
    // Certains sites (catalogues pro sans prix public, ex. se.com) n'ont
    // jamais de prix à extraire — voir règle Schneider plus bas.
    var noPricingSite = false;

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
      'rs-components.fr'      : 'RS Components',
      'distrelec.fr'          : 'Distrelec',
      'conrad.fr'             : 'Conrad',
      'mouser.fr'             : 'Mouser',
      'digikey.fr'            : 'DigiKey',
      'farnell.com'           : 'Farnell',
      'element14.com'         : 'Farnell',
      'automation24.fr'       : 'Automation24',
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
      'Cembre.com'            : 'Cembre',
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

    // ── Règles spécifiques par site fournisseur ────────────────────────
    if(hostname.includes('balluff')){
      if(!result.ref)   result.ref   = txt(['.product-ordernumber','.order-number','[class*="ordernumber"]','[class*="article-number"]']);
      if(!result.brand) result.brand = 'Balluff';
    }
    if(hostname.includes('phoenixcontact')){
      if(!result.ref)   result.ref   = txt(['.product-order-number','.order-nr','[class*="article"]','[data-article-number]']);
      if(!result.brand) result.brand = 'Phoenix Contact';
    }
    if(hostname.includes('sick')){
      if(!result.ref)   result.ref   = txt(['.part-number','.product-id','[class*="partNumber"]','[data-part-number]']);
      if(!result.brand) result.brand = 'SICK';
    }
    if(hostname.includes('ifm')){
      if(!result.ref)   result.ref   = txt(['[class*="article-number"]','.article-no','[data-article]']);
      if(!result.brand) result.brand = 'IFM';
    }
    if(hostname.includes('schneider') || hostname.includes('se.com')){
      // '[class*="product-id"]' EN PREMIER : c'est le vrai champ référence
      // sur se.com (ex. <h2 class="main-product-info__bottom-item--
      // product-id">GB2DB05</h2>, testé en vrai) — placé avant
      // '[class*="reference"]' qui, sur ce site, attrapait la bannière de
      // cookies OneTrust ("save-preference-btn-handler" contient
      // "reference" comme sous-texte de "preference") avant d'atteindre un
      // vrai champ (retour utilisateur : "l'extension ne mets plus la
      // référence"). '-reference' (tiret devant) au lieu de 'reference' nu
      // pour ce même sélecteur, en repli, écarte ce faux positif tout en
      // gardant les classes composées habituelles.
      if(!result.ref)   result.ref   = txt(['[class*="product-id"]','.product-reference','.ref','[class*="-reference"]','[data-reference]']);
      if(!result.brand) result.brand = 'Schneider Electric';
      // se.com est un catalogue pro qui n'affiche jamais de prix public —
      // les deux fallbacks génériques plus bas (sélecteur [class*="price"]
      // et regex sur tout le texte de la page) tombaient régulièrement sur
      // un faux positif du type "1 $" sans rapport avec un prix réel
      // (retour utilisateur). On coupe donc explicitement la recherche de
      // prix pour ce site plutôt que d'essayer de rendre les fallbacks
      // génériques infaillibles pour un cas qui n'a de toute façon jamais
      // de prix à trouver.
      noPricingSite = true;
    }
    if(hostname.includes('wago')){
      if(!result.ref)   result.ref   = txt(['.article-number','[class*="article"]','[data-article-number]']);
      if(!result.brand) result.brand = 'WAGO';
    }
    if(hostname.includes('siemens')){
      if(!result.ref)   result.ref   = txt(['.mlfb','[class*="mlfb"]','[class*="article-number"]','[data-mlfb]']);
      if(!result.brand) result.brand = 'Siemens';
    }
    if(hostname.includes('rs-online') || hostname.includes('rs-components')){
      if(!result.ref)   result.ref   = txt(['.keyAttribute','[class*="stock-no"]','[class*="part-number"]']);
      if(!result.supplier && !result.brand) result.supplier = 'RS Components';
    }
    if(hostname.includes('automation24')){
      if(!result.supplier) result.supplier = 'Automation24';
      // La page ne marque en structuré (itemprop="sku") QUE le numéro
      // d'article INTERNE Automation24 (ex. "104356", "101561") — jamais la
      // référence du fabricant, qui n'apparaît qu'en texte libre dans le
      // titre, toujours au format "<catégorie> <marque> <référence>" (vérifié
      // en vrai : "Capteur inductif Datasensing AK1/AP-3A" → AK1/AP-3A,
      // "Capteur de pression WIKA A-10 - 12824837" → A-10 - 12824837) —
      // retour utilisateur : "j'arrive pas à extraire les data produit". On
      // retire donc la marque (déjà connue à ce stade) et tout ce qui la
      // précède pour isoler la vraie référence, en écrasant le numéro
      // interne récupéré plus haut par le repli générique itemprop="sku".
      if(result.name && result.brand){
        var a24BrandIdx = result.name.toLowerCase().lastIndexOf(result.brand.toLowerCase());
        if(a24BrandIdx !== -1){
          var a24AfterBrand = result.name.slice(a24BrandIdx + result.brand.length).replace(/^[\s\-:]+/, '').trim();
          if(a24AfterBrand) result.ref = a24AfterBrand;
        }
      }
    }
    if(hostname.includes('sonepar')){
      // Référence fournisseur
      // [data-testid="ref-product-manufacturerRefId"] vérifié EN PREMIER, et
      // REMPLACE même une valeur déjà trouvée par le repli générique plus
      // haut (donc PAS de garde "if(!result.ref)" ici, volontairement) —
      // testé en vrai sur GV2L14 : le sélecteur générique
      // '[class*="product-ref"]' (repli DOM générique, avant les règles par
      // site) matche "product-ref**erences**_buttonsContainer", le
      // CONTENEUR englobant À LA FOIS le bouton "Réf.fab" (référence
      // fabricant, ce qu'on veut) ET un second bouton "Réf." (référence
      // INTERNE Sonepar, un identifiant différent) — son .textContent
      // concatène donc les deux ("CopieRéf.fab GV2L14CopieRéf.
      // 00002021327"), jamais exploitable, et comme le générique passe
      // AVANT cette règle-ci, result.ref était déjà "pollué" avant même
      // d'arriver ici — un simple repli "si rien trouvé" n'aurait donc
      // jamais pu corriger quoi que ce soit (retour utilisateur, repro
      // confirmée). Le testid cible directement le bon bouton, sans
      // ambiguïté.
      var mfrRefBtn = doc.querySelector('[data-testid="ref-product-manufacturerRefId"]');
      if(mfrRefBtn){
        var mfrRef = mfrRefBtn.textContent.replace(/^\s*R[ée]f\.?\s*fab\.?\s*:?\s*/i, '').trim();
        if(mfrRef) result.ref = mfrRef;
      }
      if(!result.ref){
        var refLabel = doc.querySelector('[class*="supplier-ref"],[data-ref]');
        if(refLabel) result.ref = refLabel.textContent.trim();
      }
      if(!result.ref){
        // Fallback : meta-keywords contient la ref (ex: "GV2L14,SCH,SCHGV2L14")
        var kw = doc.querySelector('meta[name="meta-keywords"]') || doc.querySelector('meta[name="keywords"]');
        if(kw){
          var kwVal = kw.getAttribute('content') || '';
          // Prendre le premier token qui ressemble à une ref produit
          var kwParts = kwVal.split(',');
          for(var ki=0; ki<kwParts.length; ki++){
            var kp = kwParts[ki].trim();
            if(kp.length >= 4 && kp.length <= 20 && /[A-Z][A-Z0-9]/.test(kp) && !/^\d+$/.test(kp)){
              result.ref = kp; break;
            }
          }
        }
      }
      // Nom : meta-title est plus propre que og:title sur Sonepar
      if(!result.name){
        var mt = doc.querySelector('meta[name="meta-title"]');
        if(mt) result.name = mt.getAttribute('content') || '';
      }
      // Description Sonepar — chercher dans les metas ET via regex sur HTML brut
      if(!result.desc){
        // 1. Via DOMParser (fonctionne si le <head> est présent)
        var md = doc.querySelector('meta[name="meta-description"]')
               || doc.querySelector('meta[name="description"]');
        if(md){
          var mdVal = md.getAttribute('content') || '';
          mdVal = mdVal.replace(/&lt;[^&]+&gt;/g,'').replace(/&amp;/g,'&');
          mdVal = mdVal.replace(/<[^>]+>/g,'');
          mdVal = mdVal.replace(/\s+/g,' ').trim();
          if(mdVal.length > 10) result.desc = mdVal;
        }
        // 2. Regex sur HTML brut (si le proxy ne retourne pas le <head>)
        if(!result.desc){
          var descRegex = /meta[^>]+(?:name=["'](?:meta-)?description["'][^>]+content|content=["']([^"']+)["'][^>]+name=["'](?:meta-)?description)["']\s*([^"']*)/i;
          var mContent = htmlStr.match(/name=["']meta-description["'][^>]*content=["']([^"']+)["']/i)
                      || htmlStr.match(/content=["']([^"']+)["'][^>]*name=["']meta-description["']/i)
                      || htmlStr.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)
                      || htmlStr.match(/content=["']([^"']+)["'][^>]*name=["']description["']/i);
          if(mContent && mContent[1]){
            var raw = mContent[1];
            raw = raw.replace(/&lt;[^&]+&gt;/g,'').replace(/&amp;/g,'&').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
            if(raw.length > 10) result.desc = raw;
          }
        }
        // 3. Fallback DOM
        if(!result.desc){
          var descEl = doc.querySelector('[class*="description-detaillee"],[class*="product-description"],[class*="long-desc"],[itemprop="description"]');
          if(descEl) result.desc = descEl.textContent.replace(/\s+/g,' ').trim().slice(0, 500);
        }
      }
      // Marque
      if(!result.brand) result.brand = 'Schneider Electric'; // défaut Sonepar FR majoritairement SE
      // Photo : prendre la première image cloudinary PRODUCT/IMAGE
      if(!result.photo){
        var imgs = doc.querySelectorAll('img[src*="PRODUCT/IMAGE"]');
        if(imgs.length > 0) result.photo = imgs[0].getAttribute('src') || '';
      }
      if(!result.supplier) result.supplier = 'Sonepar';
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
      var targeted = doc.querySelectorAll(
        '[class*="spec" i], [id*="spec" i], [class*="characteristic" i], [id*="characteristic" i], ' +
        '[class*="technical" i], [id*="technical" i], [class*="attribute" i], [id*="attribute" i]'
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
    if(result.name)  result.name  = stripJunkPhrases(stripHtml(result.name).replace(/\s+/g,' ').trim());
    if(result.desc)  result.desc  = stripJunkPhrases(stripHtml(result.desc).replace(/\s+/g,' ').trim());
    if(result.price) result.price = stripJunkPhrases(decodeEntities(result.price).replace(/\s+/g,' ').trim());

    return result;
  }

  // ── Détection iOS → classe sur body ─────────────────────────────
  // ── État de chargement du bouton d'extraction ──────────────────────
  // "Extraction automatique" (donc ce bouton) n'est de toute façon plus
  // jamais affiché sur mobile/tablette (voir #productExtractTabs dans
  // css/styles.css) — l'ancien bouton "Coller le lien et extraire"
  // (Android) et la détection iOS qui l'accompagnait n'avaient plus aucun
  // effet visible, retirés.
  var btnExtractFromUrl  = document.getElementById('btnExtractFromUrl');
  var _extractUrlLabel   = btnExtractFromUrl ? btnExtractFromUrl.innerHTML : '';
  function setExtractLoading(isLoading){
    if(btnExtractFromUrl){
      btnExtractFromUrl.disabled = isLoading;
      btnExtractFromUrl.innerHTML = isLoading
        ? '<span class="btn-spinner" aria-hidden="true"></span> Extraction…'
        : _extractUrlLabel;
    }
  }

  btnExtractFromUrl.addEventListener('click', function(){
    var url = fUrl.value.trim();
    var hintEl = document.getElementById('extractUrlHint');
    if(!url){
      showToast('Collez d\'abord une URL dans le champ', 'warn', 2500);
      return;
    }
    setExtractLoading(true);
    hintEl.style.display = 'block';
    hintEl.style.color   = 'var(--ink-soft)';
    hintEl.textContent   = '⏳ Ouverture de la page via l\'extension Chrome…';

    // Extraction via l'extension Chrome (plus de fetch serveur/proxy) —
    // décision : certains sites fournisseurs (Balluff, se.com…) bloquent
    // activement toute requête venant d'un serveur (Cloudflare/Akamai
    // anti-bot), même via un proxy dédié maison — aucun fetch serveur ne
    // peut passer ces protections. L'extension, elle, ouvre la page dans
    // une VRAIE fenêtre de navigateur (masquée) : la page passe ces
    // contrôles normalement, exactement comme si l'utilisateur l'avait
    // ouverte lui-même. Voir catalogue-bridge.js côté extension pour le
    // relais spi_extract_url_request → spi_extract_url_result.
    var settled = false;
    var timer;
    function onResult(e){
      if(settled) return;
      settled = true;
      window.removeEventListener('spi_extract_url_result', onResult);
      clearTimeout(timer);
      var r = e.detail || {};
      if(!r.ok || !r.html){
        setExtractLoading(false);
        hintEl.style.color = '#DC2626';
        hintEl.textContent = '✗ ' + (r.error || 'Extraction impossible') + ' — collez le code source manuellement.';
        return;
      }
      fHtml.value = r.html;
      document.getElementById('btnExtract').click();
      setExtractLoading(false);
      hintEl.style.color  = '#059669';
      hintEl.textContent  = '✓ Extraction réussie !';
      setTimeout(function(){ hintEl.style.display = 'none'; }, 8000);
    }
    window.addEventListener('spi_extract_url_result', onResult);

    // 22s : le temps qu'une page fournisseur (photos, scripts tiers) charge
    // entièrement dans la fenêtre ouverte par l'extension, plus une marge.
    // Si rien ne répond dans ce délai, soit la page met vraiment trop
    // longtemps, soit l'extension n'est pas installée — dans les deux cas,
    // spi_extract_url_result ne sera jamais émis, ce timeout est donc le
    // seul moyen de ne pas rester bloqué en attente indéfiniment.
    timer = setTimeout(function(){
      if(settled) return;
      settled = true;
      window.removeEventListener('spi_extract_url_result', onResult);
      setExtractLoading(false);
      hintEl.style.color = '#DC2626';
      hintEl.textContent = '✗ Aucune réponse — l\'extension SPI est-elle bien installée ? Sinon, collez le code source manuellement.';
    }, 22000);

    window.dispatchEvent(new CustomEvent('spi_extract_url_request', { detail: { url: url } }));
  });

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
      extractStatus.textContent = 'Informations trouvées : ' + found.join(', ') + '. Vérifiez puis complétez à la main si besoin (onglet « Saisie manuelle »).';
      switchTab('manual');
    }else{
      extractStatus.className = 'extract-status warn show';
      extractStatus.textContent = 'Aucune information standard détectée sur cette page. Passez à l\'onglet « Saisie manuelle » pour remplir les champs vous-même.';
      switchTab('manual');
    }
  });
