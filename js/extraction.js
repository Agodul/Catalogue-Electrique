// ============================================================
// extraction.js — Extraction fournisseurs URL/HTML
// ============================================================

function extractFromHtml(htmlStr, pageUrl){
    var result = {photo:null, photos:[], name:null, desc:null, price:null, brand:null, ref:null, supplier:null};
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
    if(!result.ref){
      result.ref = txt([
        '[itemprop="sku"]','[itemprop="mpn"]','[itemprop="productID"]',
        '[data-sku]','[data-ref]','[data-product-ref]','[data-product-id]',
        '[class*="product-ref"]','[class*="product-sku"]','[class*="sku"]',
        '[class*="ref-produit"]','[class*="reference"]'
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
      if(!result.ref)   result.ref   = txt(['.product-reference','.ref','[class*="reference"]','[data-reference]']);
      if(!result.brand) result.brand = 'Schneider Electric';
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
    if(hostname.includes('sonepar')){
      // Référence fournisseur
      if(!result.ref){
        // Chercher "Réf. Fournisseur" puis valeur suivante
        var refLabel = doc.querySelector('[class*="supplier-ref"],[class*="product-ref"],[data-ref]');
        if(refLabel) result.ref = refLabel.textContent.trim();
        // Fallback : meta-keywords contient la ref (ex: "GV2L14,SCH,SCHGV2L14")
        if(!result.ref){
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
    if(!result.price){
      var priceEl = doc.querySelector('[class*="price"], [itemprop="price"], [data-price]');
      if(priceEl){
        var ptxt = priceEl.getAttribute('content') || priceEl.textContent;
        if(ptxt) result.price = ptxt.trim().replace(/\s+/g,' ').slice(0,40);
      }
    }
    if(!result.price){
      var bodyText = doc.body ? doc.body.textContent : '';
      var m = bodyText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(€|\$|£|EUR|USD|GBP)/);
      if(m) result.price = m[0].trim();
    }

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
    if(result.name)  result.name  = stripHtml(result.name).replace(/\s+/g,' ').trim();
    if(result.desc)  result.desc  = stripHtml(result.desc).replace(/\s+/g,' ').trim();
    if(result.price) result.price = decodeEntities(result.price).replace(/\s+/g,' ').trim();

    return result;
  }

  // ── Détection iOS → classe sur body ─────────────────────────────
  if(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream){
    document.body.classList.add('ios');
  }

  // ── Bouton mobile Android : Coller & Extraire ────────────────────
  var btnPasteExtract = document.getElementById('btnPasteExtract');
  if(btnPasteExtract){
    btnPasteExtract.addEventListener('click', function(){
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText()
          .then(function(text){
            text = (text || '').trim();
            if(text && /^https?:\/\//.test(text)){
              fUrl.value = text;
              document.getElementById('btnExtractFromUrl').click();
            } else {
              showToast('Aucun lien trouvé dans le presse-papier', 'warn', 2500);
            }
          })
          .catch(function(){
            showToast('Accès au presse-papier refusé', 'warn', 2500);
          });
      } else {
        showToast('Presse-papier non disponible', 'warn', 2500);
      }
    });
  }

  document.getElementById('btnExtractFromUrl').addEventListener('click', function(){
    var url = fUrl.value.trim();
    var hintEl = document.getElementById('extractUrlHint');
    if(!url){
      showToast('Collez d\'abord une URL dans le champ', 'warn', 2500);
      return;
    }
    hintEl.style.display = 'block';
    hintEl.style.color   = 'var(--ink-soft)';
    hintEl.textContent   = '⏳ Récupération de la page en cours…';

    // Essayer plusieurs proxies CORS en cascade
    var proxies = [
      function(u){ return 'https://api.allorigins.win/get?url=' + encodeURIComponent(u); },
      function(u){ return 'https://corsproxy.io/?' + encodeURIComponent(u); },
      function(u){ return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); }
    ];

    function tryProxy(idx){
      if(idx >= proxies.length){
        hintEl.style.color  = '#DC2626';
        hintEl.textContent  = '✗ Impossible de récupérer la page — collez le code source manuellement.';
        return;
      }
      hintEl.textContent = '⏳ Tentative '+(idx+1)+'/'+proxies.length+'…';
      var proxyUrl = proxies[idx](url);
      var controller = new AbortController();
      var timer = setTimeout(function(){ controller.abort(); }, 5000);
      fetch(proxyUrl, {signal: controller.signal})
        .then(function(r){
          clearTimeout(timer);
          if(!r.ok) throw new Error('HTTP '+r.status);
          return r.text();
        })
        .then(function(text){
          var html = text;
          try{ var json=JSON.parse(text); if(json.contents) html=json.contents; }catch(e){}
          if(!html || html.length < 100) throw new Error('Contenu vide');
          // Décoder les entités HTML si le proxy les a encodées
          if(html.indexOf('&lt;') !== -1){
            // Double décodage si nécessaire
            var ta = document.createElement('textarea');
            ta.innerHTML = html;
            html = ta.value;
            // Si encore encodé
            if(html.indexOf('&lt;') !== -1){
              ta.innerHTML = html;
              html = ta.value;
            }
          }
          fHtml.value = html;
          document.getElementById('btnExtract').click();
          hintEl.style.color  = '#059669';
          hintEl.textContent  = '✓ Extraction réussie !';
          setTimeout(function(){ hintEl.style.display = 'none'; }, 8000);
        })
        .catch(function(err){
          clearTimeout(timer);
          tryProxy(idx + 1);
        });
    }

    tryProxy(0);
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
    if(data.desc)     { fDesc.value     = stripHtml(data.desc);   found.push('description'); }
    if(data.price)    { fPrice.value    = data.price;             found.push('prix'); }
    if(data.photo)    { fPhoto.value    = data.photo; updatePhotoPreview(); found.push('photo'); }
    // Afficher la galerie si plusieurs photos trouvées (ou même une seule via proxy)
    if(data.photos && data.photos.length > 0){ showPhotoGallery(data.photos); }
    else { clearPhotoGallery(); }
    if(data.brand)    { fBrand.value    = data.brand;             found.push('marque'); }
    if(data.ref)      { fRef.value      = data.ref;               found.push('référence'); }
    if(data.supplier) { fSupplier.value = data.supplier;          found.push('fournisseur'); }
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

  // ---------- Save product ----------
  