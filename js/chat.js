// ── Assistant IA admin (Q&A catalogue, lecture seule) ────────────────────
// Recherche les produits pertinents côté client, envoie la question + les
// candidats au serveur (/chatAsk) qui interroge un modèle local (Ollama).
// Aucune donnée n'est envoyée à un service tiers.

var CHAT_STOPWORDS = ['le','la','les','un','une','des','de','du','au','aux',
  'et','ou','est','sont','quel','quelle','quels','quelles','quoi','combien',
  'prix','y','a','t','il','pour','avec','sur','ce','cette','ces','qui','que'];

var _chatHistory = []; // [{role:'user'|'assistant', content:'...'}]

function _chatNormFields(p){
  return {
    ref: normalizeSearch(p.ref),
    name: normalizeSearch(p.name),
    brand: normalizeSearch(p.brand),
    family: normalizeSearch(p.family),
    desc: normalizeSearch(p.desc),
    chatNotes: normalizeSearch(p.chatNotes),
    // Tableau (pas une chaîne jointe) : chaque tag doit garder ses limites de
    // mot pour que la comparaison "champ contenu dans le terme" ci-dessous
    // fonctionne tag par tag (sinon un tag isolé comme "capteur" ne peut
    // jamais être vu comme "contenu dans" la question une fois noyé dans une
    // longue chaîne "capteur entree autre-tag").
    tags: Array.isArray(p.tags) ? p.tags.map(normalizeSearch) : []
  };
}

// Comparaison substring dans les deux sens (terme dans le champ, ou champ
// dans le terme), pour ne pas rater "capteurs" (question) vs "capteur" (tag
// enregistré) ou l'inverse — une simple correspondance à sens unique rate un
// des deux sens dès qu'un pluriel/singulier ne coïncide pas exactement.
function _chatMatches(field, term){
  if(!field || !term) return false;
  if(field.indexOf(term) !== -1) return true;
  return field.length >= 3 && term.indexOf(field) !== -1;
}

function _chatMatchesAny(fields, term){
  return fields.some(function(f){ return _chatMatches(f, term); });
}

function findChatCandidateProducts(query, limit){
  limit = limit || 12;
  var terms = normalizeSearch(query).split(/\s+/).filter(function(t){
    return t.length >= 2 && CHAT_STOPWORDS.indexOf(t) === -1;
  });
  var all = window.products || [];
  if(!terms.length) return [];

  var scored = [];
  for(var i = 0; i < all.length; i++){
    var p = all[i];
    var f = _chatNormFields(p);
    var score = 0;
    if(f.ref && terms.indexOf(f.ref) !== -1) score += 100;
    else if(f.ref && terms.some(function(t){ return _chatMatches(f.ref, t); })) score += 80;
    terms.forEach(function(t){
      if(_chatMatches(f.name, t)) score += 40;
      if(_chatMatches(f.brand, t)) score += 30;
      if(_chatMatches(f.family, t)) score += 30;
      if(_chatMatchesAny(f.tags, t)) score += 25;
      if(_chatMatches(f.desc, t)) score += 15;
      if(_chatMatches(f.chatNotes, t)) score += 15;
    });
    if(score > 0) scored.push({ p: p, score: score });
  }

  scored.sort(function(a, b){ return b.score - a.score; });
  return scored.slice(0, limit).map(function(s){
    return {
      ref: s.p.ref || '',
      name: s.p.name || '',
      brand: s.p.brand || '',
      family: s.p.family || '',
      price: s.p.price || '',
      priceCatalogue: s.p.priceCatalogue || '',
      desc: s.p.desc || '',
      tags: Array.isArray(s.p.tags) ? s.p.tags : [],
      chatNotes: s.p.chatNotes || ''
    };
  });
}

function askChat(question){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl) return Promise.reject(new Error("Aucun serveur configuré"));
  var candidates = findChatCandidateProducts(question, 12);
  return fetch(sUrl + '/chatAsk', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ question: question, candidates: candidates, history: _chatHistory.slice(-4) })
  }).then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(data){
    return data && data.answer ? data.answer : '';
  });
}

// ── Configurateur d'armoire (questionnaire déterministe, sans IA) ────────
// Les règles (questions + correspondances vers des réf/quantités) sont
// définies par l'admin via l'éditeur JSON (icône ⚙️), pas par le modèle —
// aucune improvisation possible sur du matériel électrique.

function fetchConfiguratorRules(){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl) return Promise.reject(new Error('Aucun serveur configuré'));
  return fetch(sUrl + '/configuratorRules', { headers: authHeaders(), cache: 'no-store' }).then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function saveConfiguratorRules(rules){
  var sUrl = localStorage.getItem('cat_server_url');
  if(!sUrl) return Promise.reject(new Error('Aucun serveur configuré'));
  return fetch(sUrl + '/configuratorRules', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(rules)
  }).then(function(r){
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

// Fonction pure : évalue les règles par rapport aux réponses données et
// retourne la liste agrégée [{ref, qty}]. Aucun eval()/formule libre —
// seulement qty fixe, qtyPerUnit (division arrondie au supérieur) et
// rangeTable (sélection de réf selon un seuil numérique). Les règles de
// type "choice" (l'utilisateur choisit lui-même dans une catégorie) sont
// ignorées ici — elles sont résolues à part, voir _configCollectChoices.
// Un composant/valeur supplémentaire "also" (condition combinée ET) ne peut
// viser que des composants top-level (pas une sous-question, ambiguë à
// référencer depuis une autre unité). answersLike : "answers" (moteur) ou
// fs.compValues (rendu du formulaire, avant soumission).
function _configWhenAlsoHolds(when, answersLike){
  return (when.also || []).every(function(c){
    var v = answersLike[c.question];
    return v !== undefined && v !== null && v === c.equals;
  });
}

// Consolide la logique de déclenchement d'une règle : gère à la fois une
// question primaire classique (avec répétition par unité) et une règle sans
// question (toujours déclenchée, ex: référence de base), plus les conditions
// "also" (ET) communes aux deux cas. Retourne les valeurs qui déclenchent la
// règle (une par unité concordante), ou un tableau vide si rien ne déclenche.
function _configFireValues(when, answers){
  if(!when.question) return _configWhenAlsoHolds(when, answers) ? [true] : [];
  var raw = answers[when.question];
  if(raw === undefined || raw === null) return [];
  var values = Array.isArray(raw) ? raw : [raw];
  return values.filter(function(value){
    if(Object.prototype.hasOwnProperty.call(when, 'equals') && value !== when.equals) return false;
    return _configWhenAlsoHolds(when, answers);
  });
}

function _configEvalRules(rules, answers){
  var totals = {};
  (rules || []).forEach(function(rule){
    var when = rule.when || {};
    var action = rule.action || {};
    var _actType = _configActionType(action);
    if(_actType === 'choice' || _actType === 'remove' || _actType === 'cumul') return;
    _configFireValues(when, answers).forEach(function(value){
      if(action.rangeTable){
        // Un palier peut ajouter plusieurs références à la fois (ex: variateur
        // + disjoncteur adapté + carte réseau pour une même tranche de puissance).
        var sorted = action.rangeTable.slice().sort(function(a, b){
          var am = (a.max === null || a.max === undefined) ? Infinity : a.max;
          var bm = (b.max === null || b.max === undefined) ? Infinity : b.max;
          return am - bm;
        });
        var match = sorted.filter(function(r){
          var m = (r.max === null || r.max === undefined) ? Infinity : r.max;
          return Number(value) <= m;
        })[0];
        if(!match) return;
        (match.items || []).forEach(function(item){
          if(!item.ref || !item.qty || item.qty <= 0) return;
          totals[item.ref] = (totals[item.ref] || 0) + item.qty;
        });
        return;
      }
      var ref, qty;
      if(action.qtyPerUnit){
        var per = action.qtyPerUnit.per || 1;
        ref = action.ref;
        qty = Math.ceil((Number(value) || 0) / per);
      } else {
        ref = action.ref;
        qty = action.qty != null ? action.qty : 1;
      }
      if(!ref || !qty || qty <= 0) return;
      totals[ref] = (totals[ref] || 0) + qty;
    });
  });
  // Deuxième passe : exclusions/remplacements — après coup, pour pouvoir
  // retirer une référence ajoutée par n'importe quelle règle ci-dessus.
  (rules || []).forEach(function(rule){
    var action = rule.action || {};
    if(_configActionType(action) !== 'remove') return;
    _configFireValues(rule.when || {}, answers).forEach(function(){
      if(action.removeRef) delete totals[action.removeRef];
      (action.replaceWith || []).forEach(function(item){
        if(!item.ref || !item.qty || item.qty <= 0) return;
        totals[item.ref] = (totals[item.ref] || 0) + item.qty;
      });
    });
  });
  // Troisième passe : cumul pondéré — quantité de carte déduite d'un total
  // pondéré sur plusieurs sources (ex: X entrées directes + 1 par bouton),
  // divisé par la capacité de la référence (lue sur sa fiche produit, ou la
  // valeur par défaut si non renseignée), arrondi au supérieur.
  (rules || []).forEach(function(rule){
    var action = rule.action || {};
    if(_configActionType(action) !== 'cumul') return;
    if(!_configFireValues(rule.when || {}, answers).length) return;
    var cumul = action.cumul || {};
    var total = (cumul.sources || []).reduce(function(sum, src){
      var raw = answers[src.question];
      var n = Array.isArray(raw) ? raw.reduce(function(s, v){ return s + (Number(v) || 0); }, 0) : (Number(raw) || 0);
      return sum + n * (src.weight || 0);
    }, 0);
    var capacityRaw = _configGetProductSpec(action.ref, cumul.specKey);
    var capacity = capacityRaw != null ? Number(capacityRaw) : cumul.perFallback;
    var qty = capacity > 0 ? Math.ceil(total / capacity) : 0;
    if(action.ref && qty > 0) totals[action.ref] = (totals[action.ref] || 0) + qty;
  });
  return Object.keys(totals).map(function(ref){ return { ref: ref, qty: totals[ref] }; });
}

// Règles de type "choice" qui se déclenchent d'après les réponses : retourne
// une occurrence par déclenchement (une règle peut se déclencher plusieurs
// fois si sa question est répétée), à résoudre une par une dans le chat.
// Messages d'accompagnement optionnels ("note" sur une règle), affichés une
// seule fois si la règle s'est déclenchée — ex: "Je vais ajouter les
// disjoncteurs adaptés + leur carte réseau."
function _configTriggeredNotes(rules, answers){
  var notes = [];
  (rules || []).forEach(function(rule){
    if(!rule.note) return;
    if(_configFireValues(rule.when || {}, answers).length && notes.indexOf(rule.note) === -1){
      notes.push(rule.note);
    }
  });
  return notes;
}

// Alertes de cohérence (non bloquantes) : soit une condition classique
// (équivalent à _configFireValues), soit "somme > seuil" — utile pour
// détecter un total anormal (ex: somme des puissances de tous les
// variateurs) plutôt qu'une égalité stricte sur une seule réponse.
function _configEvalAlerts(rules, answers){
  var messages = [];
  (rules || []).forEach(function(rule){
    if(_configActionType(rule.action) !== 'alert') return;
    var when = rule.when || {};
    if(!_configWhenAlsoHolds(when, answers)) return;
    var holds;
    if(when.compare === 'sumAbove'){
      var raw = when.question ? answers[when.question] : undefined;
      var sum = Array.isArray(raw) ? raw.reduce(function(s, v){ return s + (Number(v) || 0); }, 0) : (Number(raw) || 0);
      holds = sum > (when.threshold != null ? when.threshold : 0);
    } else {
      holds = _configFireValues(when, answers).length > 0;
    }
    if(holds && rule.action.alertMessage && messages.indexOf(rule.action.alertMessage) === -1){
      messages.push(rule.action.alertMessage);
    }
  });
  return messages;
}

function _configFinish(rules, answers, choiceResults){
  var items = _configEvalRules(rules, answers);
  (choiceResults || []).forEach(function(cr){
    if(!cr.ref || !cr.qty) return;
    var existing = items.find(function(it){ return it.ref === cr.ref; });
    if(existing) existing.qty += cr.qty;
    else items.push({ ref: cr.ref, qty: cr.qty });
  });
  _configEvalAlerts(rules, answers).forEach(function(msg){
    _chatAppendMessage('assistant', '⚠️ ' + msg, 'chat-msg-alert');
  });
  _configTriggeredNotes(rules, answers).forEach(function(n){
    _chatAppendMessage('assistant', n);
  });
  if(!items.length){
    _chatAppendMessage('assistant', "Aucun matériel déterminé à partir de tes réponses.");
    return;
  }
  var lines = items.map(function(it){
    var p = (window.products || []).find(function(x){ return x.ref === it.ref; });
    return '• ' + it.qty + ' × ' + it.ref + (p ? ' — ' + (p.name || '') : ' (référence introuvable dans le catalogue)');
  });
  _chatAppendMessage('assistant', 'Liste de matériel :\n' + lines.join('\n'));
  _configAppendExcelButton(items);
}

// ── Export Excel (coût, délai, une feuille par fournisseur) ────────────
// Réutilise ensureXLSX()/parsePriceNumber() déjà chargés par js/actions.js
// (mêmes scripts classiques partageant la portée globale).

// Best-effort : extrait un nombre de jours d'un délai en texte libre (ex:
// "2 semaines" -> 14, "10-15 jours" -> 15 [le plus grand, cas défavorable],
// "1 mois" -> 30). Retourne null si aucun nombre n'est trouvé dans le texte.
function _configParseLeadTimeDays(text){
  if(!text) return null;
  var t = String(text).toLowerCase();
  var nums = (t.match(/\d+(?:[.,]\d+)?/g) || []).map(function(s){ return parseFloat(s.replace(',', '.')); });
  if(!nums.length) return null;
  var n = Math.max.apply(null, nums);
  var factor = /mois/.test(t) ? 30 : /sem/.test(t) ? 7 : 1;
  return Math.round(n * factor);
}

function _configBuildExportData(items){
  var rows = items.map(function(it){
    var p = (window.products || []).find(function(x){ return x.ref === it.ref; });
    var unitPrice = p ? parsePriceNumber(p.price) : null;
    var leadDays = p ? _configParseLeadTimeDays(p.leadTime) : null;
    return {
      ref: it.ref, qty: it.qty,
      name: p ? (p.name || '') : '',
      brand: p ? (p.brand || '') : '',
      supplier: (p && p.supplier) ? p.supplier : 'Sans fournisseur',
      unitPrice: unitPrice,
      lineTotal: unitPrice != null ? unitPrice * it.qty : null,
      leadTimeRaw: p ? (p.leadTime || '') : '',
      leadDays: leadDays,
      found: !!p
    };
  });
  var totalCost = rows.reduce(function(s, r){ return s + (r.lineTotal || 0); }, 0);
  var maxLeadDays = rows.reduce(function(m, r){ return r.leadDays != null ? Math.max(m, r.leadDays) : m; }, 0);
  var unresolvedPrice = rows.filter(function(r){ return r.unitPrice == null; }).length;
  var unresolvedLead = rows.filter(function(r){ return r.leadDays == null; }).length;
  return { rows: rows, totalCost: totalCost, maxLeadDays: maxLeadDays, unresolvedPrice: unresolvedPrice, unresolvedLead: unresolvedLead };
}

// Nom de feuille Excel valide : 31 caractères max, sans \/?*[]:, dédupliqué.
function _configSafeSheetName(name, usedNames){
  var base = (name || 'Fournisseur').replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
  var candidate = base;
  var i = 2;
  while(usedNames[candidate]){
    var suffix = ' (' + i + ')';
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  usedNames[candidate] = true;
  return candidate;
}

async function _configExportExcel(items){
  try{ await ensureXLSX(); }catch(err){ if(typeof showToast === 'function') showToast(err.message, 'err'); return; }

  var data = _configBuildExportData(items);
  var d0 = new Date();
  var stamp = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');

  var summaryAoa = [
    ['SPI Engineering — Configuration armoire électrique ' + d0.toLocaleDateString('fr-FR')],
    [],
    ['Coût global estimé (€)', Math.round(data.totalCost * 100) / 100],
    ['Délai global estimé (jours, au plus lent)', data.maxLeadDays || ''],
    ['Délai global estimé (≈ semaines)', data.maxLeadDays ? Math.ceil(data.maxLeadDays / 7) : ''],
    ['Références sans prix renseigné', data.unresolvedPrice],
    ['Références sans délai renseigné', data.unresolvedLead],
    [],
    ['Référence', 'Désignation', 'Marque', 'Fournisseur', 'Quantité', 'Prix unitaire (€)', 'Total ligne (€)', 'Délai']
  ].concat(data.rows.map(function(r){
    return [r.ref, r.name, r.brand, r.supplier, r.qty, r.unitPrice, r.lineTotal, r.leadTimeRaw || (r.found ? '' : 'référence introuvable dans le catalogue')];
  }));
  var wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  wsSummary['!cols'] = [{wch:18},{wch:32},{wch:14},{wch:20},{wch:10},{wch:16},{wch:14},{wch:22}];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Récapitulatif');

  var bySupplier = {};
  data.rows.forEach(function(r){
    (bySupplier[r.supplier] = bySupplier[r.supplier] || []).push(r);
  });
  var usedNames = {};
  Object.keys(bySupplier).forEach(function(supplier){
    var supplierRows = bySupplier[supplier];
    var aoa = [
      [supplier + ' — références à commander'],
      ['Référence', 'Désignation', 'Marque', 'Quantité', 'Prix unitaire (€)', 'Total ligne (€)', 'Délai']
    ].concat(supplierRows.map(function(r){
      return [r.ref, r.name, r.brand, r.qty, r.unitPrice, r.lineTotal, r.leadTimeRaw || ''];
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:18},{wch:32},{wch:14},{wch:10},{wch:16},{wch:14},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws, _configSafeSheetName(supplier, usedNames));
  });

  XLSX.writeFile(wb, 'SPI_configuration_armoire_' + stamp + '.xlsx');
}

function _configAppendExcelButton(items){
  var messagesEl = document.getElementById('chatMessages');
  if(!messagesEl) return;
  var div = document.createElement('div');
  div.className = 'chat-msg chat-msg-bot cfg-excel-btn-wrap';
  div.innerHTML = '<button type="button" class="cfg-excel-btn">📊 Télécharger le fichier Excel (fournisseurs, coût, délai)</button>';
  div.querySelector('.cfg-excel-btn').addEventListener('click', function(){ _configExportExcel(items); });
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Formulaire unique de configuration ─────────────────────────────────
// Tout le questionnaire (quantités, sous-questions par unité, choix de
// référence dans une catégorie, valeur TM3/TM5 selon la référence choisie)
// se remplit dans UN formulaire réactif, sans aucune question posée tour
// par tour dans le chat. Toujours 100% déterministe : le formulaire ne fait
// que remplir "answers"/"choiceResults", exactement comme le faisait avant
// l'échange conversationnel — _configEvalRules/_configTriggeredNotes et
// l'éditeur de règles admin n'ont pas changé.
var _configFormState = null;

function _configFormRulesFor(rules, qid){
  var out = [];
  rules.forEach(function(r, i){ if(r.when && r.when.question === qid) out.push(i); });
  return out;
}

// Une règle "choice" attachée à un composant/sous-question doit-elle
// afficher son sélecteur de référence maintenant ? localValue = valeur
// actuelle de la question à laquelle la règle est attachée (le formulaire
// n'a pas encore de "answers" complet avant soumission, donc les conditions
// "also" (ET) sont vérifiées contre fs.compValues, qui a la même forme pour
// les composants top-level qu'elles ciblent).
function _configFormRuleFires(when, localValue, fs){
  if(localValue === undefined || localValue === null) return false;
  if(Object.prototype.hasOwnProperty.call(when, 'equals') && localValue !== when.equals) return false;
  return _configWhenAlsoHolds(when, fs.compValues);
}

// Résout la valeur associée à une référence choisie (ex: TM3/TM5) : soit
// elle doit être demandée à l'utilisateur (référence ambiguë), soit elle est
// déjà connue (association fixe, ou valeur par défaut).
function _configFormResolveTag(setTag, ref){
  var match = (setTag.rows || []).find(function(r){ return r.ref === ref; });
  if(match && match.ask && match.askOptions && match.askOptions.length){
    return { needsAsk: true, options: match.askOptions };
  }
  return { needsAsk: false, value: match ? match.tag : (setTag.default || '') };
}

// Références ajoutées automatiquement selon la référence choisie (ex: choisir
// le variateur ATV320U04M2B ajoute directement le disjoncteur + la carte
// réseau adaptés) — mêmes lignes que setTag, mais l'issue est du matériel
// plutôt qu'une valeur.
function _configFormResolveAddRefs(addRefs, ref){
  var match = (addRefs.rows || []).find(function(r){ return r.ref === ref; });
  var items = match ? match.items : ((addRefs.default && addRefs.default.items) || []);
  return items || [];
}

function _configFormChoiceHtml(ridx, unitIndex){
  var fs = _configFormState;
  var rule = fs.rules[ridx];
  var action = rule.action || {};
  var options = (window.products || []).filter(function(p){ return p.family === action.chooseFromFamily; });
  var currentRef = unitIndex == null ? fs.directChoiceRefs[ridx] : (fs.unitChoiceRefs[ridx] || [])[unitIndex];
  var unitAttr = unitIndex == null ? '' : (' data-unit="' + unitIndex + '"');
  var optsHtml = '<option value="">— choisir une référence —</option>' + options.map(function(p){
    return '<option value="' + escapeHtml(p.ref) + '"' + (p.ref === currentRef ? ' selected' : '') + '>' + escapeHtml(p.ref) + ' — ' + escapeHtml(p.name || '') + '</option>';
  }).join('');
  var html = ''
    + '<div class="cfg-form-choice" data-ruleidx="' + ridx + '"' + unitAttr + '>'
    + '  <label class="cfg-form-choice-label">Référence (' + escapeHtml(action.chooseFromFamily || '') + ')</label>'
    + '  <select class="cfg-form-choice-select">' + optsHtml + '</select>'
    + '</div>';
  if(currentRef && action.setTag){
    var resolved = _configFormResolveTag(action.setTag, currentRef);
    if(resolved.needsAsk){
      var currentTag = unitIndex == null ? fs.directTagAnswers[ridx] : (fs.unitTagAnswers[ridx] || [])[unitIndex];
      var tagOptsHtml = '<option value="">— choisir —</option>' + resolved.options.map(function(o){
        return '<option value="' + escapeHtml(o) + '"' + (o === currentTag ? ' selected' : '') + '>' + escapeHtml(o) + '</option>';
      }).join('');
      html += ''
        + '<div class="cfg-form-tagask" data-ruleidx="' + ridx + '"' + unitAttr + '>'
        + '  <label class="cfg-form-choice-label">' + escapeHtml(currentRef) + ' existe en plusieurs versions, laquelle ?</label>'
        + '  <select class="cfg-form-tagask-select">' + tagOptsHtml + '</select>'
        + '</div>';
    }
  }
  return html;
}

function _configFormUnitHtml(parentQ, subQuestions, unitIndex){
  var fs = _configFormState;
  var fieldsHtml = subQuestions.map(function(sq){
    var val = (fs.subValues[sq.id] || [])[unitIndex];
    var choiceIdxs = _configFormRulesFor(fs.rules, sq.id).filter(function(i){ return _configActionType(fs.rules[i].action) === 'choice'; });
    var choicesHtml = '';
    choiceIdxs.forEach(function(ridx){
      var when = fs.rules[ridx].when || {};
      if(_configFormRuleFires(when, val, fs)) choicesHtml += _configFormChoiceHtml(ridx, unitIndex);
    });
    return ''
      + '<div class="cfg-subq-card" data-qid="' + escapeHtml(sq.id) + '" data-unit="' + unitIndex + '">'
      + '  <div class="cfg-block-row"><span class="cfg-form-comp-label">' + escapeHtml(sq.label || sq.id) + '</span>'
      + '    <input type="number" class="cfg-form-sub-value" data-qid="' + escapeHtml(sq.id) + '" data-unit="' + unitIndex + '" step="any" value="' + (val != null ? val : '') + '">'
      + '  </div>'
      + (choicesHtml ? ('<div class="cfg-subq-rules">' + choicesHtml + '</div>') : '')
      + '</div>';
  }).join('');
  return ''
    + '<div class="cfg-form-unit">'
    + '  <div class="cfg-form-unit-title">' + escapeHtml(parentQ.label || parentQ.id) + ' n°' + (unitIndex + 1) + '</div>'
    + fieldsHtml
    + '</div>';
}

function _configFormComponentHtml(q){
  var fs = _configFormState;
  var value = fs.compValues[q.id];
  var directChoiceIdxs = _configFormRulesFor(fs.rules, q.id).filter(function(i){ return _configActionType(fs.rules[i].action) === 'choice'; });
  var subQuestions = fs.questions.filter(function(sq){ return sq.repeatFor === q.id && sq.type !== 'derived'; });

  var controlHtml = q.type === 'boolean'
    ? ('<select class="cfg-form-comp-value" data-qid="' + escapeHtml(q.id) + '">'
      + '  <option value="">—</option>'
      + '  <option value="oui"' + (value === true ? ' selected' : '') + '>Oui</option>'
      + '  <option value="non"' + (value === false ? ' selected' : '') + '>Non</option>'
      + '</select>')
    : ('<input type="number" class="cfg-form-comp-value" data-qid="' + escapeHtml(q.id) + '" min="0" step="1" value="' + (value != null ? value : 0) + '">');

  var directChoicesHtml = '';
  directChoiceIdxs.forEach(function(ridx){
    var when = fs.rules[ridx].when || {};
    if(_configFormRuleFires(when, value, fs)) directChoicesHtml += _configFormChoiceHtml(ridx, null);
  });

  var unitsHtml = '';
  if(q.type === 'number' && subQuestions.length){
    var count = Math.max(0, Math.round(Number(value) || 0));
    var blocks = [];
    for(var u = 0; u < count; u++) blocks.push(_configFormUnitHtml(q, subQuestions, u));
    if(blocks.length) unitsHtml = '<div class="cfg-form-units">' + blocks.join('') + '</div>';
  }

  return ''
    + '<div class="cfg-comp-card" data-qid="' + escapeHtml(q.id) + '">'
    + '  <div class="cfg-block-row"><span class="cfg-form-comp-label">' + escapeHtml(q.label || q.id) + '</span>' + controlHtml + '</div>'
    + (directChoicesHtml ? ('<div class="cfg-comp-rules">' + directChoicesHtml + '</div>') : '')
    + unitsHtml
    + '</div>';
}

function _configFormRender(){
  var div = document.getElementById('configFullForm');
  if(!div || !_configFormState) return;
  var topLevel = _configFormState.questions.filter(function(q){ return !q.repeatFor && q.type !== 'derived'; });
  div.innerHTML = '<div class="cfg-form-title">Configure ton armoire</div>'
    + topLevel.map(function(q){ return _configFormComponentHtml(q); }).join('')
    + '<button type="button" class="cfg-form-submit" id="configFormSubmitBtn">Valider la configuration</button>';
}

function _configRenderFullForm(questions, rules){
  _configFormState = {
    questions: questions, rules: rules,
    compValues: {}, subValues: {},
    directChoiceRefs: {}, directTagAnswers: {}, directAddRefsItems: {},
    unitChoiceRefs: {}, unitTagAnswers: {}, unitAddRefsItems: {}
  };
  var messagesEl = document.getElementById('chatMessages');
  if(!messagesEl) return;
  var div = document.createElement('div');
  div.className = 'chat-msg chat-msg-bot cfg-start-form';
  div.id = 'configFullForm';
  messagesEl.appendChild(div);
  _configFormRender();
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function _configFormSubmit(){
  var fs = _configFormState;
  if(!fs) return;
  var formEl = document.getElementById('configFullForm');
  if(!formEl) return;

  var missingChoice = Array.prototype.some.call(formEl.querySelectorAll('.cfg-form-choice-select, .cfg-form-tagask-select'), function(sel){
    return !sel.value;
  });
  if(missingChoice){
    if(typeof showToast === 'function') showToast('Merci de compléter tous les choix de référence avant de valider.', 'err');
    return;
  }
  var missingUnitValue = Array.prototype.some.call(formEl.querySelectorAll('.cfg-form-sub-value'), function(input){
    return input.value === '';
  });
  if(missingUnitValue){
    if(typeof showToast === 'function') showToast('Merci de compléter tous les champs des unités ajoutées avant de valider.', 'err');
    return;
  }

  var answers = {};
  fs.questions.forEach(function(q){
    if(q.type === 'derived') return;
    if(q.repeatFor){
      answers[q.id] = (fs.subValues[q.id] || []).map(function(v){ return v == null ? 0 : v; });
    } else {
      answers[q.id] = fs.compValues[q.id] != null ? fs.compValues[q.id] : (q.type === 'boolean' ? false : 0);
    }
  });

  var choiceResults = [];
  fs.rules.forEach(function(rule, ridx){
    if(_configActionType(rule.action) !== 'choice') return;
    var when = rule.when || {};
    var triggerQ = fs.questions.find(function(qq){ return qq.id === when.question; });
    var isDirect = !triggerQ || !triggerQ.repeatFor;
    if(isDirect){
      var ref = fs.directChoiceRefs[ridx];
      if(!ref) return;
      choiceResults.push({ family: rule.action.chooseFromFamily, qty: rule.action.qty != null ? rule.action.qty : 1, ref: ref });
      if(rule.action.setTag && fs.directTagAnswers[ridx] !== undefined){
        answers[rule.action.setTag.question] = fs.directTagAnswers[ridx];
      }
      (fs.directAddRefsItems[ridx] || []).forEach(function(item){
        if(!item.ref || !item.qty) return;
        choiceResults.push({ ref: item.ref, qty: item.qty });
      });
    } else {
      (fs.unitChoiceRefs[ridx] || []).forEach(function(ref, unitIdx){
        if(!ref) return;
        choiceResults.push({ family: rule.action.chooseFromFamily, qty: rule.action.qty != null ? rule.action.qty : 1, ref: ref });
        if(rule.action.setTag){
          var tagVal = fs.unitTagAnswers[ridx] && fs.unitTagAnswers[ridx][unitIdx];
          if(tagVal !== undefined) answers[rule.action.setTag.question] = tagVal;
        }
        ((fs.unitAddRefsItems[ridx] || [])[unitIdx] || []).forEach(function(item){
          if(!item.ref || !item.qty) return;
          choiceResults.push({ ref: item.ref, qty: item.qty });
        });
      });
    }
  });

  formEl.querySelectorAll('input, select, button').forEach(function(el){ el.disabled = true; });
  _configFinish(fs.rules, answers, choiceResults);
  _configFormState = null;
}

function _configFormContainerHandler(e){
  var formEl = e.target.closest ? e.target.closest('#configFullForm') : null;
  if(!formEl) return;
  var fs = _configFormState;
  if(!fs) return;
  var t = e.target;

  if(e.type === 'change' && t.classList.contains('cfg-form-comp-value')){
    var qid = t.getAttribute('data-qid');
    var q = fs.questions.find(function(qq){ return qq.id === qid; });
    fs.compValues[qid] = q.type === 'boolean'
      ? (t.value === 'oui' ? true : (t.value === 'non' ? false : undefined))
      : (t.value === '' ? 0 : Number(t.value));
    _configFormRender();
    return;
  }
  if(e.type === 'change' && t.classList.contains('cfg-form-sub-value')){
    var sqid = t.getAttribute('data-qid');
    var unit = parseInt(t.getAttribute('data-unit'), 10);
    fs.subValues[sqid] = fs.subValues[sqid] || [];
    fs.subValues[sqid][unit] = t.value === '' ? undefined : Number(t.value);
    _configFormRender();
    return;
  }
  if(e.type === 'change' && t.classList.contains('cfg-form-choice-select')){
    var wrap = t.closest('.cfg-form-choice');
    var ridx = parseInt(wrap.getAttribute('data-ruleidx'), 10);
    var unitAttr = wrap.getAttribute('data-unit');
    var ref = t.value || '';
    var rule = fs.rules[ridx];
    if(unitAttr === null){
      fs.directChoiceRefs[ridx] = ref;
      delete fs.directTagAnswers[ridx];
      delete fs.directAddRefsItems[ridx];
    } else {
      var u = parseInt(unitAttr, 10);
      fs.unitChoiceRefs[ridx] = fs.unitChoiceRefs[ridx] || [];
      fs.unitChoiceRefs[ridx][u] = ref;
      if(fs.unitTagAnswers[ridx]) delete fs.unitTagAnswers[ridx][u];
      if(fs.unitAddRefsItems[ridx]) delete fs.unitAddRefsItems[ridx][u];
    }
    if(ref && rule.action && rule.action.setTag){
      var resolved = _configFormResolveTag(rule.action.setTag, ref);
      if(!resolved.needsAsk){
        if(unitAttr === null) fs.directTagAnswers[ridx] = resolved.value;
        else { fs.unitTagAnswers[ridx] = fs.unitTagAnswers[ridx] || []; fs.unitTagAnswers[ridx][parseInt(unitAttr, 10)] = resolved.value; }
      }
    }
    if(ref && rule.action && rule.action.addRefs){
      var addItems = _configFormResolveAddRefs(rule.action.addRefs, ref);
      if(unitAttr === null) fs.directAddRefsItems[ridx] = addItems;
      else { fs.unitAddRefsItems[ridx] = fs.unitAddRefsItems[ridx] || []; fs.unitAddRefsItems[ridx][parseInt(unitAttr, 10)] = addItems; }
    }
    _configFormRender();
    return;
  }
  if(e.type === 'change' && t.classList.contains('cfg-form-tagask-select')){
    var wrap2 = t.closest('.cfg-form-tagask');
    var ridx2 = parseInt(wrap2.getAttribute('data-ruleidx'), 10);
    var unitAttr2 = wrap2.getAttribute('data-unit');
    if(unitAttr2 === null){
      fs.directTagAnswers[ridx2] = t.value;
    } else {
      var u2 = parseInt(unitAttr2, 10);
      fs.unitTagAnswers[ridx2] = fs.unitTagAnswers[ridx2] || [];
      fs.unitTagAnswers[ridx2][u2] = t.value;
    }
    return;
  }
  if(e.type === 'click' && t.id === 'configFormSubmitBtn'){
    _configFormSubmit();
    return;
  }
}

function _configStart(){
  fetchConfiguratorRules().then(function(rules){
    if(!rules || !Array.isArray(rules.questions) || !rules.questions.length){
      _chatAppendMessage('assistant', "Aucune question n'est configurée pour le moment. Utilise l'icône ⚙️ pour en définir.");
      return;
    }
    _configRenderFullForm(rules.questions, rules.rules || []);
  }).catch(function(e){
    if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err');
  });
}

// ── Éditeur de règles (admin) ─────────────────────────────────────────
var _configBuilderState = { questions: [], rules: [] };

function _configNewId(){
  return 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function _configActionType(action){
  if(!action) return 'fixed';
  if(action.rangeTable) return 'range';
  if(action.chooseFromFamily !== undefined) return 'choice';
  if(action.qtyPerUnit) return 'perUnit';
  if(action.removeRef !== undefined) return 'remove';
  if(action.alertMessage !== undefined) return 'alert';
  if(action.cumul !== undefined) return 'cumul';
  return 'fixed';
}

function _configFamilyOptions(){
  var families = [];
  (window.products || []).forEach(function(p){
    if(p.family && families.indexOf(p.family) === -1) families.push(p.family);
  });
  return families.sort();
}

// Lit une caractéristique technique libre (p.specs) d'un produit par sa
// référence — pas encore utilisé par un bloc de règle, prêt pour une future
// règle qui a besoin de piocher une valeur (ex: capacité d'une carte).
function _configGetProductSpec(ref, key){
  var p = (window.products || []).find(function(x){ return x.ref === ref; });
  return (p && p.specs && p.specs[key] !== undefined) ? p.specs[key] : null;
}

// Composants pouvant servir de cible à une condition "also" (ET) : uniquement
// les composants top-level (pas une sous-question, ambiguë à référencer
// depuis une autre unité ; pas une question dérivée, jamais posée).
function _configTopLevelQuestionOptions(excludeId){
  return _configBuilderState.questions.filter(function(q){
    return !q.repeatFor && q.type !== 'derived' && q.id !== excludeId;
  });
}

// ── Sélecteur de référence (recherche catalogue, réutilisable) ─────────
function _configRefPickerHtml(ref, slotAttr){
  var p = ref ? (window.products || []).find(function(x){ return x.ref === ref; }) : null;
  var chipLabel = ref ? (ref + (p ? ' — ' + (p.name || '') : ' (introuvable)')) : '';
  return ''
    + '<div class="cfg-refpick' + (ref ? '' : ' cfg-field-invalid') + '" ' + slotAttr + '>'
    + '  <div class="cfg-refpick-chip" style="' + (ref ? '' : 'display:none;') + '">'
    + '    <span>' + escapeHtml(chipLabel) + '</span>'
    + '    <button type="button" class="cfg-refpick-clear">✕</button>'
    + '  </div>'
    + '  <div class="cfg-refpick-search-wrap" style="' + (ref ? 'display:none;' : '') + '">'
    + '    <input type="text" class="cfg-refpick-input" placeholder="Rechercher réf/nom…" autocomplete="off">'
    + '    <div class="autocomplete-suggestions cfg-refpick-drop"></div>'
    + '  </div>'
    + '</div>';
}

function _configRefPickerSearch(inputEl){
  var wrap = inputEl.closest('.cfg-refpick-search-wrap');
  var drop = wrap ? wrap.querySelector('.cfg-refpick-drop') : null;
  if(!drop) return;
  var q = inputEl.value.trim().toLowerCase();
  if(!q){ drop.style.display = 'none'; drop.innerHTML = ''; return; }
  var results = (window.products || []).filter(function(p){
    return (p.ref || '').toLowerCase().indexOf(q) !== -1
        || (p.name || '').toLowerCase().indexOf(q) !== -1
        || (p.family || '').toLowerCase().indexOf(q) !== -1
        || (p.brand || '').toLowerCase().indexOf(q) !== -1;
  }).slice(0, 20);
  if(!results.length){ drop.style.display = 'none'; drop.innerHTML = ''; return; }
  drop.innerHTML = results.map(function(p){
    return '<div class="autocomplete-item" data-ref="' + escapeHtml(p.ref) + '"><strong>' + escapeHtml(p.ref) + '</strong> — ' + escapeHtml(p.name || '') + '</div>';
  }).join('');
  drop.style.display = 'block';
}

function _configRefPickerApply(pickerEl, ridx, ref){
  var rule = _configBuilderState.rules[ridx];
  if(!rule) return;
  var slot = pickerEl.getAttribute('data-slot');
  rule.action = rule.action || {};
  if(slot === 'action'){
    rule.action.ref = ref;
  } else if(slot === 'rangeItem'){
    var row = parseInt(pickerEl.getAttribute('data-row'), 10);
    var item = parseInt(pickerEl.getAttribute('data-item'), 10);
    if(rule.action.rangeTable && rule.action.rangeTable[row] && rule.action.rangeTable[row].items && rule.action.rangeTable[row].items[item]){
      rule.action.rangeTable[row].items[item].ref = ref;
    }
  } else if(slot === 'tagref'){
    var tidx = parseInt(pickerEl.getAttribute('data-tidx'), 10);
    if(rule.action.setTag && rule.action.setTag.rows && rule.action.setTag.rows[tidx]){
      rule.action.setTag.rows[tidx].ref = ref;
    }
  } else if(slot === 'addrefsRowRef'){
    var arow = parseInt(pickerEl.getAttribute('data-arow'), 10);
    if(rule.action.addRefs && rule.action.addRefs.rows && rule.action.addRefs.rows[arow]){
      rule.action.addRefs.rows[arow].ref = ref;
    }
  } else if(slot === 'addrefsItem'){
    var airow = parseInt(pickerEl.getAttribute('data-arow'), 10);
    var aiitem = parseInt(pickerEl.getAttribute('data-aitem'), 10);
    if(rule.action.addRefs && rule.action.addRefs.rows && rule.action.addRefs.rows[airow] && rule.action.addRefs.rows[airow].items[aiitem]){
      rule.action.addRefs.rows[airow].items[aiitem].ref = ref;
    }
  } else if(slot === 'addrefsDefaultItem'){
    var adidx = parseInt(pickerEl.getAttribute('data-aitem'), 10);
    if(rule.action.addRefs && rule.action.addRefs.default && rule.action.addRefs.default.items[adidx]){
      rule.action.addRefs.default.items[adidx].ref = ref;
    }
  } else if(slot === 'removeRef'){
    rule.action.removeRef = ref;
  } else if(slot === 'removeReplaceItem'){
    var rrIdx = parseInt(pickerEl.getAttribute('data-item'), 10);
    if(rule.action.replaceWith && rule.action.replaceWith[rrIdx]){
      rule.action.replaceWith[rrIdx].ref = ref;
    }
  } else if(slot === 'cumulRef'){
    rule.action.ref = ref;
  }
}

// ── Blocs "Règle" (SI … ALORS …) — toujours imbriquée sous sa question ──
// parentQuestion n'est plus choisie via un menu déroulant : elle est fixée
// dès la création de la règle (voir _configAddRuleForWithType), à la question
// dans laquelle la carte est physiquement affichée. Impossible de relier une
// règle à la mauvaise question par erreur.
function _configRuleCardHtml(ruleIdx, parentQuestion){
  var rule = _configBuilderState.rules[ruleIdx];
  var idx = ruleIdx;
  var action = rule.action || {};
  var actionType = _configActionType(action);
  var when = rule.when || {};

  var isBaseRef = !when.question;

  var equalsHtml = '';
  if(actionType === 'alert'){
    var compareMode = when.compare === 'sumAbove' ? 'sumAbove' : 'equals';
    equalsHtml = ''
      + '<select class="cfg-r-compare-mode">'
      + '  <option value="equals"' + (compareMode === 'equals' ? ' selected' : '') + '>= valeur</option>'
      + '  <option value="sumAbove"' + (compareMode === 'sumAbove' ? ' selected' : '') + '>somme &gt; seuil</option>'
      + '</select>';
    if(compareMode === 'sumAbove'){
      var thresholdInvalid = when.threshold == null || isNaN(when.threshold);
      equalsHtml += '<input type="number" class="cfg-r-alert-threshold' + (thresholdInvalid ? ' cfg-field-invalid' : '') + '" placeholder="seuil" value="' + (when.threshold != null ? when.threshold : '') + '">';
    } else if(parentQuestion && parentQuestion.type === 'boolean'){
      equalsHtml += ''
        + '<select class="cfg-r-equals">'
        + '  <option value="true"' + (when.equals === true ? ' selected' : '') + '>= Oui</option>'
        + '  <option value="false"' + (when.equals === false ? ' selected' : '') + '>= Non</option>'
        + '</select>';
    } else if(parentQuestion && parentQuestion.type === 'derived'){
      equalsHtml += '<span class="cfg-rule-equals-label">=</span><input type="text" class="cfg-r-equals-text" placeholder="valeur" value="' + escapeHtml(when.equals != null ? when.equals : '') + '">';
    }
  } else if(parentQuestion && parentQuestion.type === 'boolean'){
    equalsHtml = ''
      + '<select class="cfg-r-equals">'
      + '  <option value="true"' + (when.equals === true ? ' selected' : '') + '>= Oui</option>'
      + '  <option value="false"' + (when.equals === false ? ' selected' : '') + '>= Non</option>'
      + '</select>';
  } else if(parentQuestion && parentQuestion.type === 'derived'){
    equalsHtml = ''
      + '<span class="cfg-rule-equals-label">=</span>'
      + '<input type="text" class="cfg-r-equals-text" placeholder="valeur (ex: TM5)" value="' + escapeHtml(when.equals != null ? when.equals : '') + '">';
  }

  var alsoRowsHtml = (when.also || []).map(function(cond, ai){
    var targetQ = _configBuilderState.questions.find(function(qq){ return qq.id === cond.question; });
    var equalsCtl = (targetQ && targetQ.type === 'boolean')
      ? ('<select class="cfg-r-also-equals" data-aidx="' + ai + '">'
        + '  <option value="true"' + (cond.equals === true ? ' selected' : '') + '>Oui</option>'
        + '  <option value="false"' + (cond.equals === false ? ' selected' : '') + '>Non</option>'
        + '</select>')
      : ('<input type="text" class="cfg-r-also-equals-text" data-aidx="' + ai + '" placeholder="valeur" value="' + escapeHtml(cond.equals != null ? String(cond.equals) : '') + '">');
    var qOptions = _configTopLevelQuestionOptions(when.question).map(function(q2){
      return '<option value="' + escapeHtml(q2.id) + '"' + (cond.question === q2.id ? ' selected' : '') + '>' + escapeHtml(q2.label || q2.id) + '</option>';
    }).join('');
    return ''
      + '<div class="cfg-r-also-row" data-aidx="' + ai + '">'
      + '  <span class="cfg-rule-tag cfg-rule-tag-also">ET</span>'
      + '  <select class="cfg-r-also-question' + (cond.question ? '' : ' cfg-field-invalid') + '" data-aidx="' + ai + '"><option value="">— composant —</option>' + qOptions + '</select>'
      + '  <span class="cfg-rule-equals-label">=</span>'
      + '  ' + equalsCtl
      + '  <button type="button" class="cfg-btn-icon cfg-r-also-del" data-aidx="' + ai + '">✕</button>'
      + '</div>';
  }).join('');
  var alsoHtml = ''
    + '<div class="cfg-r-also-rows">' + alsoRowsHtml + '</div>'
    + '<button type="button" class="cfg-btn-add-row cfg-r-also-add">+ Condition (ET)</button>';

  var actionBody;
  if(actionType === 'fixed'){
    actionBody = _configRefPickerHtml(action.ref, 'data-slot="action"')
      + '<input type="number" class="cfg-r-qty" min="0" step="1" placeholder="Quantité" value="' + (action.qty != null ? action.qty : 1) + '">';
  } else if(actionType === 'perUnit'){
    actionBody = _configRefPickerHtml(action.ref, 'data-slot="action"')
      + '<span class="cfg-r-perunit-label">par tranche de</span>'
      + '<input type="number" class="cfg-r-per" min="1" step="1" value="' + ((action.qtyPerUnit && action.qtyPerUnit.per) || 8) + '">';
  } else if(actionType === 'choice'){
    var famOptions = _configFamilyOptions().map(function(f){
      return '<option value="' + escapeHtml(f) + '"' + (action.chooseFromFamily === f ? ' selected' : '') + '>' + escapeHtml(f) + '</option>';
    }).join('');
    actionBody = ''
      + '<select class="cfg-r-choice-family' + (action.chooseFromFamily ? '' : ' cfg-field-invalid') + '"><option value="">— choisir une catégorie —</option>' + famOptions + '</select>'
      + '<span class="cfg-r-perunit-label">quantité</span>'
      + '<input type="number" class="cfg-r-qty" min="0" step="1" value="' + (action.qty != null ? action.qty : 1) + '">'
      + '<label class="cfg-q-repeat-label" style="width:100%;margin-top:6px;"><input type="checkbox" class="cfg-r-tag-toggle"' + (action.setTag ? ' checked' : '') + '> Déterminer une valeur selon la référence choisie (ex: TM3/TM5)</label>';
    if(action.setTag){
      var tagRows = (action.setTag.rows || []).map(function(row, ti){
        var askInvalid = row.ask && !((row.askOptions || []).length >= 2);
        return ''
          + '<div class="cfg-tag-row" data-tidx="' + ti + '">'
          + '  ' + _configRefPickerHtml(row.ref, 'data-slot="tagref" data-tidx="' + ti + '"')
          + '  <span class="cfg-tag-arrow">→</span>'
          + (row.ask
            ? ('  <input type="text" class="cfg-tag-ask-options' + (askInvalid ? ' cfg-field-invalid' : '') + '" data-tidx="' + ti + '" placeholder="options séparées par une virgule (ex: TM3, TM5)" value="' + escapeHtml((row.askOptions || []).join(', ')) + '">')
            : ('  <input type="text" class="cfg-tag-value' + (row.tag ? '' : ' cfg-field-invalid') + '" data-tidx="' + ti + '" placeholder="valeur (ex: TM3)" value="' + escapeHtml(row.tag || '') + '">'))
          + '  <button type="button" class="cfg-btn-icon cfg-tag-del" data-tidx="' + ti + '">✕</button>'
          + '  <label class="cfg-tag-ask-label"><input type="checkbox" class="cfg-tag-ask-toggle" data-tidx="' + ti + '"' + (row.ask ? ' checked' : '') + '> demander à l\'utilisateur</label>'
          + '</div>';
      }).join('');
      actionBody += ''
        + '<div class="cfg-tag-rows">' + tagRows + '</div>'
        + '<button type="button" class="cfg-btn-add-row cfg-tag-add">+ Association</button>'
        + '<div class="cfg-tag-default-row"><span class="cfg-r-perunit-label">Sinon (par défaut) :</span>'
        + '  <input type="text" class="cfg-tag-default' + (action.setTag.default ? '' : ' cfg-field-invalid') + '" placeholder="valeur par défaut (ex: TM5)" value="' + escapeHtml(action.setTag.default || '') + '">'
        + '</div>';
    }
    actionBody += '<label class="cfg-q-repeat-label" style="width:100%;margin-top:6px;"><input type="checkbox" class="cfg-r-addrefs-toggle"' + (action.addRefs ? ' checked' : '') + '> Ajouter des références automatiquement selon la référence choisie</label>';
    if(action.addRefs){
      var addRefsRows = (action.addRefs.rows || []).map(function(row, ari){
        var items = row.items || [];
        var itemsHtml = items.map(function(item, aii){
          return ''
            + '<div class="cfg-addrefs-item" data-arow="' + ari + '" data-aitem="' + aii + '">'
            + '  ' + _configRefPickerHtml(item.ref, 'data-slot="addrefsItem" data-arow="' + ari + '" data-aitem="' + aii + '"')
            + '  <input type="number" class="cfg-addrefs-item-qty" data-arow="' + ari + '" data-aitem="' + aii + '" min="0" step="1" placeholder="Qté" value="' + (item.qty != null ? item.qty : 1) + '">'
            + '  <button type="button" class="cfg-btn-icon cfg-addrefs-item-del" data-arow="' + ari + '" data-aitem="' + aii + '">✕</button>'
            + '</div>';
        }).join('');
        return ''
          + '<div class="cfg-addrefs-row" data-arow="' + ari + '">'
          + '  <div class="cfg-addrefs-row-head">'
          + '    <span class="cfg-tag-arrow">Si</span>'
          + '    ' + _configRefPickerHtml(row.ref, 'data-slot="addrefsRowRef" data-arow="' + ari + '"')
          + '    <span class="cfg-tag-arrow">→ ajouter :</span>'
          + '    <button type="button" class="cfg-btn-icon cfg-addrefs-row-del" data-arow="' + ari + '" title="Supprimer l\'association">🗑️</button>'
          + '  </div>'
          + '  <div class="cfg-addrefs-items">' + itemsHtml + '</div>'
          + (items.length ? '' : '  <span class="cfg-inline-warn">⚠ Ajoute au moins une référence à ajouter.</span>')
          + '  <button type="button" class="cfg-btn-add-row cfg-addrefs-item-add" data-arow="' + ari + '">+ Référence</button>'
          + '</div>';
      }).join('');
      var defaultItems = (action.addRefs.default && action.addRefs.default.items) || [];
      var defaultItemsHtml = defaultItems.map(function(item, dii){
        return ''
          + '<div class="cfg-addrefs-item" data-aitem="' + dii + '">'
          + '  ' + _configRefPickerHtml(item.ref, 'data-slot="addrefsDefaultItem" data-aitem="' + dii + '"')
          + '  <input type="number" class="cfg-addrefs-default-qty" data-aitem="' + dii + '" min="0" step="1" placeholder="Qté" value="' + (item.qty != null ? item.qty : 1) + '">'
          + '  <button type="button" class="cfg-btn-icon cfg-addrefs-default-del" data-aitem="' + dii + '">✕</button>'
          + '</div>';
      }).join('');
      actionBody += ''
        + '<div class="cfg-addrefs-rows">' + addRefsRows + '</div>'
        + '<button type="button" class="cfg-btn-add-row cfg-addrefs-row-add">+ Association</button>'
        + '<div class="cfg-addrefs-default-block"><span class="cfg-r-perunit-label">Sinon (par défaut), ajouter :</span>'
        + '  <div class="cfg-addrefs-items">' + defaultItemsHtml + '</div>'
        + '  <button type="button" class="cfg-btn-add-row cfg-addrefs-default-add">+ Référence</button>'
        + '</div>';
    }
  } else if(actionType === 'remove'){
    var removeItems = (action.replaceWith || []).map(function(item, rwi){
      return ''
        + '<div class="cfg-addrefs-item" data-item="' + rwi + '">'
        + '  ' + _configRefPickerHtml(item.ref, 'data-slot="removeReplaceItem" data-item="' + rwi + '"')
        + '  <input type="number" class="cfg-remove-item-qty" data-item="' + rwi + '" min="0" step="1" placeholder="Qté" value="' + (item.qty != null ? item.qty : 1) + '">'
        + '  <button type="button" class="cfg-btn-icon cfg-remove-item-del" data-item="' + rwi + '">✕</button>'
        + '</div>';
    }).join('');
    actionBody = ''
      + '<span class="cfg-r-perunit-label">Retirer :</span>'
      + _configRefPickerHtml(action.removeRef, 'data-slot="removeRef"')
      + '<div class="cfg-addrefs-default-block"><span class="cfg-r-perunit-label">Remplacer par (optionnel) :</span>'
      + '  <div class="cfg-addrefs-items">' + removeItems + '</div>'
      + '  <button type="button" class="cfg-btn-add-row cfg-remove-item-add">+ Référence</button>'
      + '</div>';
  } else if(actionType === 'alert'){
    actionBody = '<input type="text" class="cfg-r-alert-message' + ((action.alertMessage || '').trim() ? '' : ' cfg-field-invalid') + '" placeholder="Message d\'alerte (ex: Puissance totale élevée, vérifier le disjoncteur général)" value="' + escapeHtml(action.alertMessage || '') + '">';
  } else if(actionType === 'cumul'){
    var cumul = action.cumul || { sources: [], specKey: '', perFallback: 1 };
    var cumulQOptions = _configTopLevelQuestionOptions(when.question);
    var sourceRows = (cumul.sources || []).map(function(src, si){
      var qOpts = cumulQOptions.map(function(q2){
        return '<option value="' + escapeHtml(q2.id) + '"' + (src.question === q2.id ? ' selected' : '') + '>' + escapeHtml(q2.label || q2.id) + '</option>';
      }).join('');
      return ''
        + '<div class="cfg-cumul-row" data-si="' + si + '">'
        + '  <select class="cfg-cumul-question' + (src.question ? '' : ' cfg-field-invalid') + '" data-si="' + si + '"><option value="">— composant —</option>' + qOpts + '</select>'
        + '  <span class="cfg-rule-equals-label">×</span>'
        + '  <input type="number" class="cfg-cumul-weight" data-si="' + si + '" step="any" value="' + (src.weight != null ? src.weight : 1) + '">'
        + '  <button type="button" class="cfg-btn-icon cfg-cumul-del" data-si="' + si + '">✕</button>'
        + '</div>';
    }).join('');
    actionBody = ''
      + '<span class="cfg-r-perunit-label">Carte :</span>'
      + _configRefPickerHtml(action.ref, 'data-slot="cumulRef"')
      + '<div class="cfg-cumul-rows">' + sourceRows + '</div>'
      + ((cumul.sources || []).length ? '' : '<span class="cfg-inline-warn">⚠ Ajoute au moins une source (ex: nombre d\'entrées, nombre de boutons…).</span>')
      + '<button type="button" class="cfg-btn-add-row cfg-cumul-add">+ Source</button>'
      + '<div class="cfg-cumul-spec-row">'
      + '  <span class="cfg-r-perunit-label">Caractéristique à lire :</span>'
      + '  <input type="text" class="cfg-cumul-speckey' + ((cumul.specKey || '').trim() ? '' : ' cfg-field-invalid') + '" placeholder="ex: Entrées" value="' + escapeHtml(cumul.specKey || '') + '">'
      + '  <span class="cfg-r-perunit-label">Par défaut si absente :</span>'
      + '  <input type="number" class="cfg-cumul-fallback" min="1" step="1" value="' + (cumul.perFallback != null ? cumul.perFallback : 1) + '">'
      + '</div>';
  } else {
    var rows = (action.rangeTable || []).map(function(row, rIdx){
      var items = row.items || [];
      var itemsHtml = items.map(function(item, iIdx){
        return ''
          + '<div class="cfg-range-item" data-row="' + rIdx + '" data-item="' + iIdx + '">'
          + '  ' + _configRefPickerHtml(item.ref, 'data-slot="rangeItem" data-row="' + rIdx + '" data-item="' + iIdx + '"')
          + '  <input type="number" class="cfg-range-item-qty" min="0" step="1" placeholder="Qté" value="' + (item.qty != null ? item.qty : 1) + '">'
          + '  <button type="button" class="cfg-btn-icon cfg-range-item-del" data-row="' + rIdx + '" data-item="' + iIdx + '">✕</button>'
          + '</div>';
      }).join('');
      return ''
        + '<div class="cfg-range-row" data-row="' + rIdx + '">'
        + '  <div class="cfg-range-row-head">'
        + '    <span class="cfg-range-upto">jusqu\'à</span>'
        + '    <input type="number" class="cfg-range-max" placeholder="(au-delà)" value="' + (row.max != null ? row.max : '') + '">'
        + '    <button type="button" class="cfg-btn-icon cfg-range-del" data-row="' + rIdx + '" title="Supprimer le palier">🗑️</button>'
        + '  </div>'
        + '  <div class="cfg-range-items">' + itemsHtml + '</div>'
        + (items.length ? '' : '  <span class="cfg-inline-warn">⚠ Ajoute au moins une référence pour ce palier.</span>')
        + '  <button type="button" class="cfg-btn-add-row cfg-range-item-add" data-row="' + rIdx + '">+ Référence</button>'
        + '</div>';
    }).join('');
    actionBody = '<div class="cfg-range-rows">' + rows + '</div>'
      + '<button type="button" class="cfg-btn-add-row cfg-range-add">+ Palier</button>';
  }

  var actionTypeHtml = isBaseRef
    ? '<span class="cfg-rule-if-label">Ajouter une référence</span>'
    : (''
      + '<select class="cfg-r-actiontype">'
      + '  <option value="fixed"' + (actionType === 'fixed' ? ' selected' : '') + '>Ajouter une référence</option>'
      + '  <option value="perUnit"' + (actionType === 'perUnit' ? ' selected' : '') + '>Ajouter par tranche</option>'
      + '  <option value="range"' + (actionType === 'range' ? ' selected' : '') + '>Selon un seuil</option>'
      + '  <option value="choice"' + (actionType === 'choice' ? ' selected' : '') + '>L\'utilisateur choisit (catégorie)</option>'
      + '  <option value="remove"' + (actionType === 'remove' ? ' selected' : '') + '>Retirer / remplacer</option>'
      + '  <option value="alert"' + (actionType === 'alert' ? ' selected' : '') + '>Alerte de cohérence</option>'
      + '  <option value="cumul"' + (actionType === 'cumul' ? ' selected' : '') + '>Cumul pondéré (quantité calculée)</option>'
      + '</select>');

  return ''
    + '<div class="cfg-rule-card" data-rindex="' + idx + '">'
    + '  <button type="button" class="cfg-btn-icon cfg-r-del" title="Supprimer la règle">🗑️</button>'
    + '  <div class="cfg-rule-if">'
    + '    <span class="cfg-rule-tag">' + (isBaseRef ? 'TOUJOURS' : 'SI') + '</span>'
    + '    <span class="cfg-rule-if-label">' + escapeHtml(parentQuestion ? (parentQuestion.label || parentQuestion.id) : '') + '</span>'
    + '    ' + equalsHtml
    + '  </div>'
    + '  ' + alsoHtml
    + '  <div class="cfg-rule-connector"></div>'
    + '  <div class="cfg-rule-then">'
    + '    <span class="cfg-rule-tag cfg-rule-tag-then">ALORS</span>'
    + '    ' + actionTypeHtml
    + '    <div class="cfg-rule-action-body">' + actionBody + '</div>'
    + '    <input type="text" class="cfg-r-note" placeholder="Message affiché quand cette règle se déclenche (optionnel)" value="' + escapeHtml(rule.note || '') + '">'
    + '  </div>'
    + '</div>';
}

function _configRulesFor(qid){
  var out = [];
  _configBuilderState.rules.forEach(function(r, idx){
    if(r.when && r.when.question === qid) out.push(idx);
  });
  return out;
}

// ── Blocs "Sous-question" (posée une fois par unité du composant parent) ─
function _configSubQuestionCardHtml(subq, subIdx){
  var ruleIdxs = _configRulesFor(subq.id);
  var rulesHtml = ruleIdxs.map(function(ridx){ return _configRuleCardHtml(ridx, subq); }).join('');
  var isDerived = subq.type === 'derived';
  return ''
    + '<div class="cfg-subq-card' + (isDerived ? ' cfg-subq-derived' : '') + '" data-sub="' + subIdx + '">'
    + '  <div class="cfg-block-row">'
    + '    <input type="text" class="cfg-sq-label' + (isDerived || (subq.label && subq.label.trim()) ? '' : ' cfg-field-invalid') + '" placeholder="' + (isDerived ? 'Nom de la valeur (ex: Technologie automate)' : 'Libellé (ex: Puissance moteur)') + '" value="' + escapeHtml(subq.label || '') + '">'
    + '    <button type="button" class="cfg-btn-icon cfg-sq-del" title="Supprimer">🗑️</button>'
    + '  </div>'
    + (isDerived ? '  <div class="hint" style="margin:4px 0 0;">🔧 Valeur déterminée automatiquement — jamais demandée dans le chat.</div>' : '')
    + (rulesHtml ? ('  <div class="cfg-subq-rules">' + rulesHtml + '</div>') : '')
    + '</div>';
}

// ── Blocs "Composant" (quantité + sous-questions + règles, tout groupé) ──
var _configCollapsedComponents = {}; // qid -> true si "Sous-questions" repliées (état UI, non sauvegardé)

function _configComponentCardHtml(q, qIdx){
  var subQuestions = [];
  _configBuilderState.questions.forEach(function(sq, i){
    if(sq.repeatFor === q.id) subQuestions.push({ sq: sq, i: i });
  });
  var directRuleIdxs = _configRulesFor(q.id);
  var directRulesHtml = directRuleIdxs.map(function(ridx){ return _configRuleCardHtml(ridx, q); }).join('');
  var subQuestionsHtml = subQuestions.map(function(o){ return _configSubQuestionCardHtml(o.sq, o.i); }).join('');
  var collapsed = !!_configCollapsedComponents[q.id];

  return ''
    + '<div class="cfg-comp-card" data-qindex="' + qIdx + '">'
    + '  <div class="cfg-block-row">'
    + '    <input type="text" class="cfg-q-label' + (q.label && q.label.trim() ? '' : ' cfg-field-invalid') + '" placeholder="Nom du composant (ex: Variateur de vitesse)" value="' + escapeHtml(q.label || '') + '">'
    + '    <select class="cfg-q-type">'
    + '      <option value="number"' + (q.type === 'number' ? ' selected' : '') + '>Nombre</option>'
    + '      <option value="boolean"' + (q.type === 'boolean' ? ' selected' : '') + '>Oui / Non</option>'
    + '    </select>'
    + '    <button type="button" class="cfg-btn-icon cfg-q-del" title="Supprimer ce composant">🗑️</button>'
    + '  </div>'
    + (directRulesHtml ? ('  <div class="cfg-comp-rules">' + directRulesHtml + '</div>') : '')
    + ((q.type === 'number' || subQuestions.length > 0)
      ? ('  <div class="cfg-comp-subquestions">'
        + '    <button type="button" class="cfg-comp-subquestions-label cfg-sq-toggle" data-qid="' + escapeHtml(q.id) + '">'
        + '      <span class="cfg-sq-toggle-arrow">' + (collapsed ? '▶' : '▼') + '</span>'
        + '      Sous-questions' + (q.type === 'number' ? ' (posées une fois par unité)' : '') + (subQuestions.length ? ' (' + subQuestions.length + ')' : '')
        + '    </button>'
        + (collapsed ? '' : subQuestionsHtml)
        + '  </div>')
      : '')
    + '</div>';
}

function _configBuilderRenderComponents(){
  var container = document.getElementById('configBuilderComponents');
  if(!container) return;
  var qs = _configBuilderState.questions;
  var topLevel = [];
  qs.forEach(function(q, i){ if(!q.repeatFor) topLevel.push({ q: q, i: i }); });

  var baseRefIdxs = [];
  _configBuilderState.rules.forEach(function(r, i){ if(!r.when || !r.when.question) baseRefIdxs.push(i); });
  var baseRefsHtml = baseRefIdxs.length
    ? ('<div class="cfg-baserefs-section">'
      + '  <div class="cfg-baserefs-title">🧱 Références toujours ajoutées</div>'
      + baseRefIdxs.map(function(ridx){ return _configRuleCardHtml(ridx, null); }).join('')
      + '</div>')
    : '';

  container.innerHTML = baseRefsHtml + topLevel.map(function(o){ return _configComponentCardHtml(o.q, o.i); }).join('')
    || '<div class="hint" style="margin:0;">Aucun composant — glisse un bloc "📦 Composant" depuis la palette de droite.</div>';
}

function _configAddComponent(){
  _configBuilderState.questions.push({ id: _configNewId(), label: '', type: 'number' });
  _configBuilderRenderComponents();
}

function _configAddBaseRefRule(){
  _configBuilderState.rules.push({ when: {}, action: { ref: '', qty: 1 } });
  _configBuilderRenderComponents();
}

function _configAddSubQuestion(parentId){
  _configBuilderState.questions.push({ id: _configNewId(), label: '', type: 'number', repeatFor: parentId });
  _configBuilderRenderComponents();
}

function _configAddRuleForWithType(qid, actionType){
  var action;
  if(actionType === 'fixed') action = { ref: '', qty: 1 };
  else if(actionType === 'perUnit') action = { ref: '', qtyPerUnit: { per: 8 } };
  else if(actionType === 'choice') action = { chooseFromFamily: '', qty: 1 };
  else if(actionType === 'remove') action = { removeRef: '', replaceWith: [] };
  else if(actionType === 'alert') action = { alertMessage: '' };
  else if(actionType === 'cumul') action = { ref: '', cumul: { sources: [], specKey: '', perFallback: 1 } };
  else action = { rangeTable: [{ max: null, items: [{ ref: '', qty: 1 }] }] };
  _configBuilderState.rules.push({ when: { question: qid }, action: action });
  _configBuilderRenderComponents();
}

// ── Drag and drop depuis la palette de blocs (#configPalette) ──
var _configDraggingType = null;
var _configDragHoverEl = null;

function _configDropTargetFor(el, draggingType){
  if(!el || !draggingType) return null;
  if(draggingType.indexOf('rule-') === 0){
    var subq = el.closest ? el.closest('.cfg-subq-card') : null;
    if(subq) return { kind: 'subq', el: subq };
    var comp = el.closest ? el.closest('.cfg-comp-card') : null;
    return comp ? { kind: 'comp', el: comp } : null;
  }
  if(draggingType === 'subquestion'){
    var comp2 = el.closest ? el.closest('.cfg-comp-card') : null;
    return comp2 ? { kind: 'comp', el: comp2 } : null;
  }
  if(draggingType === 'component' || draggingType === 'baseref'){
    var canvas = el.closest ? el.closest('.cfg-canvas-root') : null;
    return canvas ? { kind: 'canvas', el: canvas } : null;
  }
  return null;
}

function _configPaletteDragStart(e){
  var block = e.target.closest ? e.target.closest('.cfg-palette-block') : null;
  if(!block) return;
  _configDraggingType = block.getAttribute('data-blocktype');
  if(e.dataTransfer){
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', _configDraggingType);
  }
}

function _configPaletteDragEnd(){
  _configDraggingType = null;
  if(_configDragHoverEl){ _configDragHoverEl.classList.remove('cfg-drop-active'); _configDragHoverEl = null; }
}

function _configPaletteDragOver(e){
  var target = _configDropTargetFor(e.target, _configDraggingType);
  if(!target) return;
  e.preventDefault();
  if(_configDragHoverEl && _configDragHoverEl !== target.el) _configDragHoverEl.classList.remove('cfg-drop-active');
  target.el.classList.add('cfg-drop-active');
  _configDragHoverEl = target.el;
}

function _configPaletteDragLeave(e){
  var related = e.relatedTarget;
  if(_configDragHoverEl && (!related || !_configDragHoverEl.contains(related))){
    _configDragHoverEl.classList.remove('cfg-drop-active');
    _configDragHoverEl = null;
  }
}

function _configPaletteDrop(e){
  var type = _configDraggingType;
  var target = _configDropTargetFor(e.target, type);
  if(_configDragHoverEl){ _configDragHoverEl.classList.remove('cfg-drop-active'); _configDragHoverEl = null; }
  _configDraggingType = null;
  if(!target) return;
  e.preventDefault();
  if(target.kind === 'canvas' && type === 'component'){
    _configAddComponent();
    return;
  }
  if(target.kind === 'canvas' && type === 'baseref'){
    _configAddBaseRefRule();
    return;
  }
  if(target.kind === 'comp'){
    var qIdx = parseInt(target.el.getAttribute('data-qindex'), 10);
    var q = _configBuilderState.questions[qIdx];
    if(!q) return;
    if(type === 'subquestion') _configAddSubQuestion(q.id);
    else if(type.indexOf('rule-') === 0) _configAddRuleForWithType(q.id, type.slice(5));
    return;
  }
  if(target.kind === 'subq'){
    var subIdx = parseInt(target.el.getAttribute('data-sub'), 10);
    var subq = _configBuilderState.questions[subIdx];
    if(!subq) return;
    if(type.indexOf('rule-') === 0) _configAddRuleForWithType(subq.id, type.slice(5));
  }
}

function _configDeleteComponent(qIdx){
  var q = _configBuilderState.questions[qIdx];
  if(!q) return;
  var idsToRemove = [q.id];
  _configBuilderState.questions.forEach(function(sq){ if(sq.repeatFor === q.id) idsToRemove.push(sq.id); });
  _configBuilderState.rules = _configBuilderState.rules.filter(function(r){
    return !(r.when && idsToRemove.indexOf(r.when.question) !== -1);
  });
  _configBuilderState.questions = _configBuilderState.questions.filter(function(qq){
    return idsToRemove.indexOf(qq.id) === -1;
  });
  _configBuilderRenderComponents();
}

function _configDeleteSubQuestion(subId){
  _configBuilderState.rules = _configBuilderState.rules.filter(function(r){
    return !(r.when && r.when.question === subId);
  });
  _configBuilderState.questions = _configBuilderState.questions.filter(function(q){ return q.id !== subId; });
  _configBuilderRenderComponents();
}

// Gestionnaire unique délégué sur #configBuilderComponents. Vérifie les
// conteneurs du plus spécifique (carte de règle) au moins spécifique (carte
// de composant) pour éviter qu'un contrôle imbriqué ne soit intercepté par
// le mauvais niveau.
function _configComponentsContainerHandler(e){
  var t = e.target;

  if(e.type === 'input' && t.classList.contains('cfg-refpick-input')){
    _configRefPickerSearch(t);
    return;
  }

  var ruleCard = t.closest ? t.closest('.cfg-rule-card') : null;
  if(ruleCard){
    var ridx = parseInt(ruleCard.getAttribute('data-rindex'), 10);
    var rule = _configBuilderState.rules[ridx];
    if(!rule) return;
    rule.when = rule.when || {};
    rule.action = rule.action || {};

    if(e.type === 'click' && t.classList.contains('cfg-r-del')){
      _configBuilderState.rules.splice(ridx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-equals')){
      rule.when.equals = t.value === 'true';
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-equals-text')){
      rule.when.equals = t.value;
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-compare-mode')){
      if(t.value === 'sumAbove') rule.when.compare = 'sumAbove';
      else delete rule.when.compare;
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-alert-threshold')){
      rule.when.threshold = t.value === '' ? null : Number(t.value);
      t.classList.toggle('cfg-field-invalid', t.value === '' || isNaN(Number(t.value)));
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-alert-message')){
      rule.action.alertMessage = t.value;
      t.classList.toggle('cfg-field-invalid', !t.value.trim());
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-r-also-add')){
      rule.when.also = rule.when.also || [];
      rule.when.also.push({ question: '', equals: '' });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-r-also-del')){
      var delAlsoIdx = parseInt(t.getAttribute('data-aidx'), 10);
      rule.when.also.splice(delAlsoIdx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-also-question')){
      var alsoQIdx = parseInt(t.getAttribute('data-aidx'), 10);
      var targetQ = _configBuilderState.questions.find(function(qq){ return qq.id === t.value; });
      rule.when.also[alsoQIdx].question = t.value;
      rule.when.also[alsoQIdx].equals = targetQ && targetQ.type === 'boolean' ? true : '';
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-also-equals')){
      var alsoEIdx = parseInt(t.getAttribute('data-aidx'), 10);
      rule.when.also[alsoEIdx].equals = t.value === 'true';
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-also-equals-text')){
      var alsoETIdx = parseInt(t.getAttribute('data-aidx'), 10);
      rule.when.also[alsoETIdx].equals = t.value;
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-actiontype')){
      var type = t.value;
      var oldRef = rule.action.ref;
      if(type === 'fixed') rule.action = { ref: oldRef || '', qty: 1 };
      else if(type === 'perUnit') rule.action = { ref: oldRef || '', qtyPerUnit: { per: 8 } };
      else if(type === 'choice') rule.action = { chooseFromFamily: '', qty: 1 };
      else if(type === 'remove') rule.action = { removeRef: oldRef || '', replaceWith: [] };
      else if(type === 'alert') rule.action = { alertMessage: '' };
      else if(type === 'cumul') rule.action = { ref: oldRef || '', cumul: { sources: [], specKey: '', perFallback: 1 } };
      else rule.action = { rangeTable: [{ max: null, items: [{ ref: oldRef || '', qty: 1 }] }] };
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-choice-family')){
      rule.action.chooseFromFamily = t.value;
      t.classList.toggle('cfg-field-invalid', !t.value);
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-tag-toggle')){
      if(t.checked){
        var tagQid = _configNewId();
        _configBuilderState.questions.push({ id: tagQid, label: '', type: 'derived', repeatFor: rule.when.question });
        rule.action.setTag = { question: tagQid, rows: [], default: '' };
      } else if(rule.action.setTag){
        var oldTagQid = rule.action.setTag.question;
        delete rule.action.setTag;
        _configDeleteSubQuestion(oldTagQid); // retire aussi les règles qui en dépendaient, et re-rend
        return;
      }
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-tag-value')){
      var tvIdx = parseInt(t.getAttribute('data-tidx'), 10);
      if(rule.action.setTag && rule.action.setTag.rows[tvIdx]) rule.action.setTag.rows[tvIdx].tag = t.value;
      t.classList.toggle('cfg-field-invalid', !t.value);
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-tag-ask-options')){
      var taIdx = parseInt(t.getAttribute('data-tidx'), 10);
      var taOptions = t.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      if(rule.action.setTag && rule.action.setTag.rows[taIdx]){
        rule.action.setTag.rows[taIdx].askOptions = taOptions;
      }
      t.classList.toggle('cfg-field-invalid', taOptions.length < 2);
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-tag-ask-toggle')){
      var tgIdx = parseInt(t.getAttribute('data-tidx'), 10);
      if(rule.action.setTag && rule.action.setTag.rows[tgIdx]){
        rule.action.setTag.rows[tgIdx].ask = t.checked;
        if(t.checked) rule.action.setTag.rows[tgIdx].askOptions = rule.action.setTag.rows[tgIdx].askOptions || [];
      }
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-tag-default')){
      if(rule.action.setTag) rule.action.setTag.default = t.value;
      t.classList.toggle('cfg-field-invalid', !t.value);
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-tag-add')){
      rule.action.setTag.rows.push({ ref: '', tag: '' });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-tag-del')){
      var delTIdx = parseInt(t.getAttribute('data-tidx'), 10);
      rule.action.setTag.rows.splice(delTIdx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-addrefs-toggle')){
      if(t.checked) rule.action.addRefs = { rows: [], default: { items: [] } };
      else delete rule.action.addRefs;
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-addrefs-row-add')){
      rule.action.addRefs.rows.push({ ref: '', items: [{ ref: '', qty: 1 }] });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-addrefs-row-del')){
      var delARow = parseInt(t.getAttribute('data-arow'), 10);
      rule.action.addRefs.rows.splice(delARow, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-addrefs-item-add')){
      var addARow = parseInt(t.getAttribute('data-arow'), 10);
      rule.action.addRefs.rows[addARow].items = rule.action.addRefs.rows[addARow].items || [];
      rule.action.addRefs.rows[addARow].items.push({ ref: '', qty: 1 });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-addrefs-item-del')){
      var delAItemRow = parseInt(t.getAttribute('data-arow'), 10);
      var delAItemIdx = parseInt(t.getAttribute('data-aitem'), 10);
      rule.action.addRefs.rows[delAItemRow].items.splice(delAItemIdx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-addrefs-item-qty')){
      var qARow = parseInt(t.getAttribute('data-arow'), 10);
      var qAItem = parseInt(t.getAttribute('data-aitem'), 10);
      if(rule.action.addRefs.rows[qARow] && rule.action.addRefs.rows[qARow].items[qAItem]){
        rule.action.addRefs.rows[qARow].items[qAItem].qty = t.value === '' ? null : Number(t.value);
      }
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-addrefs-default-add')){
      rule.action.addRefs.default = rule.action.addRefs.default || { items: [] };
      rule.action.addRefs.default.items.push({ ref: '', qty: 1 });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-addrefs-default-del')){
      var delDefIdx = parseInt(t.getAttribute('data-aitem'), 10);
      rule.action.addRefs.default.items.splice(delDefIdx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-addrefs-default-qty')){
      var qDefIdx = parseInt(t.getAttribute('data-aitem'), 10);
      if(rule.action.addRefs.default.items[qDefIdx]){
        rule.action.addRefs.default.items[qDefIdx].qty = t.value === '' ? null : Number(t.value);
      }
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-remove-item-add')){
      rule.action.replaceWith = rule.action.replaceWith || [];
      rule.action.replaceWith.push({ ref: '', qty: 1 });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-remove-item-del')){
      var delRemoveIdx = parseInt(t.getAttribute('data-item'), 10);
      rule.action.replaceWith.splice(delRemoveIdx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-remove-item-qty')){
      var qRemoveIdx = parseInt(t.getAttribute('data-item'), 10);
      if(rule.action.replaceWith[qRemoveIdx]){
        rule.action.replaceWith[qRemoveIdx].qty = t.value === '' ? null : Number(t.value);
      }
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-cumul-add')){
      rule.action.cumul.sources.push({ question: '', weight: 1 });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-cumul-del')){
      var delCumulIdx = parseInt(t.getAttribute('data-si'), 10);
      rule.action.cumul.sources.splice(delCumulIdx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-cumul-question')){
      var cumulQIdx = parseInt(t.getAttribute('data-si'), 10);
      rule.action.cumul.sources[cumulQIdx].question = t.value;
      t.classList.toggle('cfg-field-invalid', !t.value);
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-cumul-weight')){
      var cumulWIdx = parseInt(t.getAttribute('data-si'), 10);
      rule.action.cumul.sources[cumulWIdx].weight = t.value === '' ? null : Number(t.value);
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-cumul-speckey')){
      rule.action.cumul.specKey = t.value;
      t.classList.toggle('cfg-field-invalid', !t.value.trim());
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-cumul-fallback')){
      rule.action.cumul.perFallback = t.value === '' ? null : Number(t.value);
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-qty')){
      rule.action.qty = t.value === '' ? null : Number(t.value);
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-per')){
      rule.action.qtyPerUnit = { per: t.value === '' ? 1 : Number(t.value) };
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-note')){
      rule.note = t.value;
      return;
    }
    if(t.classList.contains('cfg-range-max')){
      var rowIdx = parseInt(t.closest('.cfg-range-row').getAttribute('data-row'), 10);
      if(rule.action.rangeTable && rule.action.rangeTable[rowIdx]) rule.action.rangeTable[rowIdx].max = t.value === '' ? null : Number(t.value);
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-range-add')){
      rule.action.rangeTable = rule.action.rangeTable || [];
      rule.action.rangeTable.push({ max: null, items: [{ ref: '', qty: 1 }] });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-range-del')){
      var delRow = parseInt(t.getAttribute('data-row'), 10);
      rule.action.rangeTable.splice(delRow, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-range-item-qty')){
      var qRow = parseInt(t.closest('.cfg-range-item').getAttribute('data-row'), 10);
      var qItem = parseInt(t.closest('.cfg-range-item').getAttribute('data-item'), 10);
      if(rule.action.rangeTable && rule.action.rangeTable[qRow] && rule.action.rangeTable[qRow].items[qItem]){
        rule.action.rangeTable[qRow].items[qItem].qty = t.value === '' ? null : Number(t.value);
      }
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-range-item-add')){
      var addRow = parseInt(t.getAttribute('data-row'), 10);
      rule.action.rangeTable[addRow].items = rule.action.rangeTable[addRow].items || [];
      rule.action.rangeTable[addRow].items.push({ ref: '', qty: 1 });
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-range-item-del')){
      var delItemRow = parseInt(t.getAttribute('data-row'), 10);
      var delItemIdx = parseInt(t.getAttribute('data-item'), 10);
      rule.action.rangeTable[delItemRow].items.splice(delItemIdx, 1);
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-refpick-clear')){
      _configRefPickerApply(t.closest('.cfg-refpick'), ridx, '');
      _configBuilderRenderComponents();
      return;
    }
    return;
  }

  var subCard = t.closest ? t.closest('.cfg-subq-card') : null;
  if(subCard){
    var subIdx = parseInt(subCard.getAttribute('data-sub'), 10);
    var subq = _configBuilderState.questions[subIdx];
    if(!subq) return;
    if(e.type === 'input' && t.classList.contains('cfg-sq-label')){
      subq.label = t.value;
      if(subq.type !== 'derived') t.classList.toggle('cfg-field-invalid', !t.value.trim());
      return; // pas de re-rendu : garder le focus pendant la frappe
    }
    if(e.type === 'click' && t.classList.contains('cfg-sq-del')){
      _configDeleteSubQuestion(subq.id);
      return;
    }
    return;
  }

  var compCard = t.closest ? t.closest('.cfg-comp-card') : null;
  if(compCard){
    var qIdx = parseInt(compCard.getAttribute('data-qindex'), 10);
    var q = _configBuilderState.questions[qIdx];
    if(!q) return;
    if(e.type === 'input' && t.classList.contains('cfg-q-label')){
      q.label = t.value;
      t.classList.toggle('cfg-field-invalid', !t.value.trim());
      return; // pas de re-rendu : garder le focus pendant la frappe
    }
    if(e.type === 'change' && t.classList.contains('cfg-q-type')){
      q.type = t.value;
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'click' && t.classList.contains('cfg-q-del')){
      _configDeleteComponent(qIdx);
      return;
    }
    var toggleBtn = t.closest('.cfg-sq-toggle');
    if(e.type === 'click' && toggleBtn){
      var toggleQid = toggleBtn.getAttribute('data-qid');
      _configCollapsedComponents[toggleQid] = !_configCollapsedComponents[toggleQid];
      _configBuilderRenderComponents();
      return;
    }
  }
}

function _configComponentsContainerMousedown(e){
  var item = e.target.closest ? e.target.closest('.cfg-refpick-drop .autocomplete-item') : null;
  if(!item) return;
  e.preventDefault();
  var card = item.closest('.cfg-rule-card');
  var picker = item.closest('.cfg-refpick');
  if(!card || !picker) return;
  var ridx = parseInt(card.getAttribute('data-rindex'), 10);
  _configRefPickerApply(picker, ridx, item.getAttribute('data-ref'));
  _configBuilderRenderComponents();
}

// ── Ouverture / sauvegarde de l'éditeur ─────────────────────────────────
var _configActiveTab = 'diagram';

function _configRulesOpen(){
  var overlay = document.getElementById('configRulesOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');
  fetchConfiguratorRules().then(function(rules){
    _configBuilderState = {
      questions: Array.isArray(rules && rules.questions) ? rules.questions : [],
      rules: Array.isArray(rules && rules.rules) ? rules.rules : []
    };
    _configBuilderRenderComponents();
    _rulesToDiagram(_configBuilderState.questions, _configBuilderState.rules);
    _diagSetZoom(1);
    _diagRenderAll();
  }).catch(function(e){
    if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err');
  });
}

function _configSwitchTab(tab){
  if(tab === _configActiveTab) return;
  if(_configActiveTab === 'diagram') _diagramSyncToBuilderState();
  _configActiveTab = tab;
  var diagPanel = document.getElementById('tabPanelDiagram');
  var assistPanel = document.getElementById('tabPanelAssistant');
  if(diagPanel) diagPanel.style.display = tab === 'diagram' ? 'flex' : 'none';
  if(assistPanel) assistPanel.style.display = tab === 'assistant' ? 'flex' : 'none';
  document.querySelectorAll('.cfg-tab-btn').forEach(function(btn){
    btn.classList.toggle('cfg-tab-btn-active', btn.getAttribute('data-tab') === tab);
  });
  if(tab === 'diagram'){
    _rulesToDiagram(_configBuilderState.questions, _configBuilderState.rules);
    _diagRenderAll();
  } else {
    _configBuilderRenderComponents();
  }
}

function _configRulesClose(){
  var overlay = document.getElementById('configRulesOverlay');
  if(overlay) overlay.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function _configRulesSave(){
  if(_configActiveTab === 'diagram') _diagramSyncToBuilderState();
  for(var i = 0; i < _configBuilderState.questions.length; i++){
    var _q = _configBuilderState.questions[i];
    if(_q.type === 'derived') continue;
    if(!_q.label || !_q.label.trim()){
      if(typeof showToast === 'function') showToast('Chaque question doit avoir un libellé.', 'err');
      return;
    }
  }
  for(var j = 0; j < _configBuilderState.rules.length; j++){
    var r = _configBuilderState.rules[j];
    r.when = r.when || {};
    var rType = _configActionType(r.action);
    // Seule une règle "Ajouter une référence" peut n'être associée à aucune
    // question (référence toujours ajoutée) — voir _configAddBaseRefRule.
    if(!r.when.question && rType !== 'fixed'){
      if(typeof showToast === 'function') showToast('Chaque règle doit être associée à une question (seul le bloc "toujours ajoutée" peut s\'en passer).', 'err');
      return;
    }
    if((r.when.also || []).some(function(c){ return !c.question; })){
      if(typeof showToast === 'function') showToast('Chaque condition supplémentaire (ET) doit avoir un composant choisi.', 'err');
      return;
    }
    if(rType === 'remove'){
      var removeInvalid = !r.action.removeRef || (r.action.replaceWith || []).some(function(it){ return !it.ref; });
      if(removeInvalid){
        if(typeof showToast === 'function') showToast('Chaque règle "retirer / remplacer" doit avoir une référence à retirer, et chaque remplacement une référence choisie.', 'err');
        return;
      }
      continue;
    }
    if(rType === 'alert'){
      var alertInvalid = !r.action.alertMessage || !r.action.alertMessage.trim()
        || (r.when.compare === 'sumAbove' && (r.when.threshold == null || isNaN(r.when.threshold)));
      if(alertInvalid){
        if(typeof showToast === 'function') showToast('Chaque règle "alerte" doit avoir un message, et un seuil numérique si le mode "somme > seuil" est choisi.', 'err');
        return;
      }
      continue;
    }
    if(rType === 'cumul'){
      var cumulInvalid = !r.action.ref
        || !(r.action.cumul && r.action.cumul.sources && r.action.cumul.sources.length)
        || r.action.cumul.sources.some(function(src){ return !src.question; })
        || !r.action.cumul.specKey || !r.action.cumul.specKey.trim();
      if(cumulInvalid){
        if(typeof showToast === 'function') showToast('Chaque règle "cumul pondéré" doit avoir une référence, au moins une source choisie, et une caractéristique à lire.', 'err');
        return;
      }
      continue;
    }
    var invalid = rType === 'range'
      ? (r.action.rangeTable || []).some(function(row){ return !(row.items && row.items.length) || row.items.some(function(it){ return !it.ref; }); })
      : rType === 'choice'
        ? !r.action.chooseFromFamily
        : !(r.action && r.action.ref);
    if(invalid){
      if(typeof showToast === 'function') showToast(rType === 'choice' ? 'Chaque règle "catégorie" doit avoir une catégorie choisie.' : 'Chaque règle doit avoir une référence choisie.', 'err');
      return;
    }
    if(rType === 'choice' && r.action.setTag){
      var tagInvalid = !r.action.setTag.default
        || (r.action.setTag.rows || []).some(function(row){
          return !row.ref || (row.ask ? !(row.askOptions && row.askOptions.length >= 2) : !row.tag);
        });
      if(tagInvalid){
        if(typeof showToast === 'function') showToast('Le bloc "valeur selon la référence" doit avoir une valeur par défaut, et chaque association une référence + soit une valeur, soit au moins 2 options à proposer à l\'utilisateur.', 'err');
        return;
      }
    }
    if(rType === 'choice' && r.action.addRefs){
      var addRefsInvalid = (r.action.addRefs.rows || []).some(function(row){
        return !row.ref || !(row.items && row.items.length) || row.items.some(function(it){ return !it.ref; });
      }) || ((r.action.addRefs.default && r.action.addRefs.default.items) || []).some(function(it){ return !it.ref; });
      if(addRefsInvalid){
        if(typeof showToast === 'function') showToast('Le bloc "ajouter des références selon la référence choisie" : chaque association doit avoir une référence déclenchante et au moins une référence à ajouter, toutes choisies.', 'err');
        return;
      }
    }
  }
  saveConfiguratorRules(_configBuilderState).then(function(){
    if(typeof showToast === 'function') showToast('Règles enregistrées', 'ok');
    _configRulesClose();
  }).catch(function(e){
    if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err');
  });
}

// ── Import d'un fichier questionnaire (fusion, sans écraser l'existant) ──
// Fusionne question par question / règle par règle dans l'état du
// constructeur, en mémoire seulement : rien n'est envoyé au serveur tant que
// l'utilisateur n'a pas relu et cliqué "Enregistrer" lui-même.
function _configRulesImportFile(file){
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    var data;
    try { data = JSON.parse(reader.result); }
    catch(e){
      if(typeof showToast === 'function') showToast('Fichier JSON invalide : ' + (e && e.message || e), 'err');
      return;
    }
    if(!data || !Array.isArray(data.questions) || !Array.isArray(data.rules)){
      if(typeof showToast === 'function') showToast('Le fichier doit contenir { "questions": [...], "rules": [...] }.', 'err');
      return;
    }
    var existingIds = {};
    _configBuilderState.questions.forEach(function(q){ existingIds[q.id] = true; });
    var addedQ = 0, skippedQ = 0;
    data.questions.forEach(function(q){
      if(!q || !q.id){ return; }
      if(existingIds[q.id]){ skippedQ++; return; }
      existingIds[q.id] = true;
      _configBuilderState.questions.push(q);
      addedQ++;
    });
    data.rules.forEach(function(r){
      if(!r) return;
      _configBuilderState.rules.push(r);
    });
    _configBuilderRenderComponents();
    if(typeof showToast === 'function'){
      var msg = addedQ + ' question(s) et ' + data.rules.length + ' règle(s) importées.';
      if(skippedQ) msg += ' (' + skippedQ + ' question(s) ignorée(s), id déjà existant.)';
      showToast(msg, 'ok');
    }
  };
  reader.onerror = function(){
    if(typeof showToast === 'function') showToast('Impossible de lire le fichier.', 'err');
  };
  reader.readAsText(file);
}

// ── Assistant pas-à-pas (création simple d'un élément du questionnaire) ──
// Construit exactement les mêmes formes de données que l'éditeur avancé
// (_configAddComponent / _configAddSubQuestion / _configAddRuleForWithType),
// via une suite de questions simples, une à la fois. Ne remplace ni le
// moteur, ni le schéma, ni l'éditeur de cartes (qui reste la vue de
// relecture/réglage fin) — purement un autre chemin pour créer le même JSON.
var _wizardState = null;

function _wizardOpen(){
  _wizardState = { step: 'subject', label: '', qtype: null, wantsSub: null, subLabel: '', actionType: null, draft: {} };
  var overlay = document.getElementById('wizardOverlay');
  if(overlay){ overlay.style.display = 'flex'; document.body.classList.add('modal-open'); }
  _wizardRenderStep();
}

function _wizardClose(){
  var overlay = document.getElementById('wizardOverlay');
  if(overlay) overlay.style.display = 'none';
  document.body.classList.remove('modal-open');
  _wizardState = null;
}

function _wizardNavHtml(opts){
  opts = opts || {};
  return ''
    + '<div class="wiz-nav">'
    + (opts.back === false ? '<span></span>' : '<button type="button" class="wiz-btn-back">← Retour</button>')
    + (opts.next === false ? '' : '<button type="button" class="wiz-btn-next"' + (opts.nextDisabled ? ' disabled' : '') + '>' + (opts.nextLabel || 'Suivant →') + '</button>')
    + '</div>';
}

function _wizardChoiceCard(choice, icon, label, example, selected){
  return ''
    + '<button type="button" class="wiz-choice-card' + (selected ? ' wiz-choice-card-selected' : '') + '" data-choice="' + escapeHtml(choice) + '">'
    + '  <span class="wiz-choice-icon">' + icon + '</span>'
    + '  <span class="wiz-choice-label">' + escapeHtml(label) + '</span>'
    + (example ? ('  <span class="wiz-choice-example">' + escapeHtml(example) + '</span>') : '')
    + '</button>';
}

function _wizardRenderStep(){
  var body = document.getElementById('wizardStepBody');
  if(!body || !_wizardState) return;
  var ws = _wizardState;
  var html = '';

  if(ws.step === 'subject'){
    html = ''
      + '<div class="wiz-step-title">De quoi veux-tu parler ?</div>'
      + '<div class="wiz-step-sub">Le nom de l\'élément du questionnaire (ex: Variateur de vitesse, Automate, Bouton…).</div>'
      + '<input type="text" class="wiz-text-input" id="wizSubjectInput" placeholder="ex: Variateur de vitesse" value="' + escapeHtml(ws.label) + '">'
      + _wizardNavHtml({ back: false, nextDisabled: !ws.label.trim() });
  } else if(ws.step === 'type'){
    html = ''
      + '<div class="wiz-step-title">Pour « ' + escapeHtml(ws.label) + ' », l\'utilisateur va répondre…</div>'
      + '<div class="wiz-choice-grid">'
      + _wizardChoiceCard('number', '🔢', 'Un nombre', 'ex: combien de variateurs', ws.qtype === 'number')
      + _wizardChoiceCard('boolean', '✅', 'Oui ou Non', 'ex: as-tu besoin d\'un module ?', ws.qtype === 'boolean')
      + '</div>'
      + _wizardNavHtml({ next: false });
  } else if(ws.step === 'subquestion'){
    html = ''
      + '<div class="wiz-step-title">Faut-il poser une question EN PLUS, une fois par « ' + escapeHtml(ws.label) + ' » ?</div>'
      + '<div class="wiz-step-sub">ex: chaque variateur a sa propre puissance</div>'
      + '<div class="wiz-choice-grid">'
      + _wizardChoiceCard('yes', '➕', 'Oui', '', ws.wantsSub === true)
      + _wizardChoiceCard('no', '➖', 'Non', '', ws.wantsSub === false)
      + '</div>'
      + _wizardNavHtml({ next: false });
  } else if(ws.step === 'subquestionLabel'){
    html = ''
      + '<div class="wiz-step-title">Quelle question veux-tu ajouter ?</div>'
      + '<div class="wiz-step-sub">Posée une fois pour chaque « ' + escapeHtml(ws.label) + ' » (ex: Puissance du moteur (kW))</div>'
      + '<input type="text" class="wiz-text-input" id="wizSubLabelInput" placeholder="ex: Puissance du moteur (kW)" value="' + escapeHtml(ws.subLabel) + '">'
      + _wizardNavHtml({ nextDisabled: !ws.subLabel.trim() });
  } else if(ws.step === 'actionType'){
    html = ''
      + '<div class="wiz-step-title">Qu\'est-ce qu\'il faut ajouter comme matériel ?</div>'
      + '<div class="wiz-choice-grid wiz-choice-grid-vertical">'
      + _wizardChoiceCard('fixed', '➕', 'Toujours la même référence, en quantité fixe', 'ex: un disjoncteur général systématique', ws.actionType === 'fixed')
      + _wizardChoiceCard('perUnit', '📐', 'Une quantité proportionnelle au nombre saisi', 'ex: 1 carte tous les 8 entrées', ws.actionType === 'perUnit')
      + (ws.qtype === 'number' ? _wizardChoiceCard('range', '📊', 'Une référence différente selon un seuil', 'ex: la puissance détermine quel variateur', ws.actionType === 'range') : '')
      + _wizardChoiceCard('choice', '🗂️', 'L\'utilisateur choisit lui-même la référence', 'ex: quel modèle de bouton', ws.actionType === 'choice')
      + (ws.qtype === 'number' ? _wizardChoiceCard('cumul', '🧮', 'Une quantité calculée en additionnant plusieurs réponses', 'ex: X entrées directes + 1 par bouton', ws.actionType === 'cumul') : '')
      + '</div>'
      + _wizardNavHtml({ next: false });
  } else if(ws.step === 'detailFixed'){
    var dF = ws.draft;
    html = ''
      + '<div class="wiz-step-title">Quelle référence ajouter ?</div>'
      + '<div class="wiz-field-row">' + _configRefPickerHtml(dF.ref, 'data-slot="ref"') + '</div>'
      + '<div class="wiz-step-title" style="margin-top:16px;">En quelle quantité ?</div>'
      + '<input type="number" class="wiz-number-input" id="wizFixedQty" min="0" step="1" value="' + (dF.qty != null ? dF.qty : 1) + '">'
      + _wizardNavHtml({ nextLabel: 'Continuer →', nextDisabled: !dF.ref });
  } else if(ws.step === 'detailPerUnit'){
    var dP = ws.draft;
    html = ''
      + '<div class="wiz-step-title">Quelle référence ajouter ?</div>'
      + '<div class="wiz-field-row">' + _configRefPickerHtml(dP.ref, 'data-slot="ref"') + '</div>'
      + '<div class="wiz-step-title" style="margin-top:16px;">Tous les combien ?</div>'
      + '<div class="wiz-step-sub">ex: 8 → une référence ajoutée tous les 8 de « ' + escapeHtml(ws.wantsSub ? ws.subLabel : ws.label) + ' »</div>'
      + '<input type="number" class="wiz-number-input" id="wizPerUnitPer" min="1" step="1" value="' + (dP.per != null ? dP.per : 8) + '">'
      + _wizardNavHtml({ nextLabel: 'Continuer →', nextDisabled: !dP.ref });
  } else if(ws.step === 'detailRange'){
    var dR = ws.draft;
    var rowsHtml = (dR.rangeTable || []).map(function(row, rIdx){
      var itemsHtml = (row.items || []).map(function(item, iIdx){
        return ''
          + '<div class="cfg-range-item" data-row="' + rIdx + '" data-item="' + iIdx + '">'
          + _configRefPickerHtml(item.ref, 'data-slot="rangeItem" data-row="' + rIdx + '" data-item="' + iIdx + '"')
          + '<input type="number" class="wiz-qty-input cfg-range-item-qty" data-row="' + rIdx + '" data-item="' + iIdx + '" min="0" step="1" placeholder="Qté" value="' + (item.qty != null ? item.qty : 1) + '">'
          + '<button type="button" class="cfg-btn-icon cfg-range-item-del" data-row="' + rIdx + '" data-item="' + iIdx + '">✕</button>'
          + '</div>';
      }).join('');
      return ''
        + '<div class="cfg-range-row" data-row="' + rIdx + '">'
        + '  <div class="cfg-range-row-head">'
        + '    <span class="cfg-range-upto">jusqu\'à</span>'
        + '    <input type="number" class="cfg-range-max" data-row="' + rIdx + '" placeholder="(au-delà)" value="' + (row.max != null ? row.max : '') + '">'
        + (dR.rangeTable.length > 1 ? ('    <button type="button" class="cfg-btn-icon cfg-range-del" data-row="' + rIdx + '" title="Supprimer le palier">🗑️</button>') : '')
        + '  </div>'
        + '  <div class="cfg-range-items">' + itemsHtml + '</div>'
        + '  <button type="button" class="wiz-add-row-btn cfg-range-item-add" data-row="' + rIdx + '">+ Référence à ce palier</button>'
        + '</div>';
    }).join('');
    var rangeInvalid = (dR.rangeTable || []).some(function(row){ return !(row.items && row.items.length) || row.items.some(function(it){ return !it.ref; }); });
    html = ''
      + '<div class="wiz-step-title">Jusqu\'à quelle valeur, quelle(s) référence(s) ajouter ?</div>'
      + '<div class="wiz-step-sub">Le dernier palier (sans valeur « jusqu\'à ») couvre tout ce qui est au-delà.</div>'
      + '<div class="wiz-range-rows">' + rowsHtml + '</div>'
      + '<button type="button" class="wiz-add-row-btn cfg-range-add">+ Palier suivant</button>'
      + _wizardNavHtml({ nextLabel: 'Continuer →', nextDisabled: rangeInvalid });
  } else if(ws.step === 'detailChoice'){
    var dC = ws.draft;
    var famOpts = _configFamilyOptions().map(function(f){
      return '<option value="' + escapeHtml(f) + '"' + (dC.family === f ? ' selected' : '') + '>' + escapeHtml(f) + '</option>';
    }).join('');
    html = ''
      + '<div class="wiz-step-title">Dans quelle catégorie du catalogue l\'utilisateur doit-il choisir ?</div>'
      + '<select class="wiz-select-input" id="wizChoiceFamily"><option value="">— choisir une catégorie —</option>' + famOpts + '</select>'
      + '<div class="wiz-step-title" style="margin-top:16px;">Combien en ajouter à chaque fois ?</div>'
      + '<input type="number" class="wiz-number-input" id="wizChoiceQty" min="0" step="1" value="' + (dC.qty != null ? dC.qty : 1) + '">'
      + _wizardNavHtml({ nextLabel: 'Continuer →', nextDisabled: !dC.family });
  } else if(ws.step === 'detailCumul'){
    var dU = ws.draft;
    var cumulQOptions = _configTopLevelQuestionOptions();
    var sourceRowsHtml = (dU.sources || []).map(function(src, si){
      var qOpts = cumulQOptions.map(function(q2){
        return '<option value="' + escapeHtml(q2.id) + '"' + (src.question === q2.id ? ' selected' : '') + '>' + escapeHtml(q2.label || q2.id) + '</option>';
      }).join('');
      return ''
        + '<div class="cfg-cumul-row" data-si="' + si + '">'
        + '  <select class="cfg-cumul-question" data-si="' + si + '"><option value="">— quelle réponse ? —</option>' + qOpts + '</select>'
        + '  <span class="cfg-rule-equals-label">poids ×</span>'
        + '  <input type="number" class="cfg-cumul-weight" data-si="' + si + '" step="any" value="' + (src.weight != null ? src.weight : 1) + '">'
        + (dU.sources.length > 1 ? ('  <button type="button" class="cfg-btn-icon cfg-cumul-del" data-si="' + si + '">✕</button>') : '')
        + '</div>';
    }).join('');
    var cumulInvalid = !dU.ref || !(dU.sources && dU.sources.length && dU.sources.every(function(s){ return s.question; })) || !(dU.specKey || '').trim();
    html = ''
      + '<div class="wiz-step-title">Quelle carte/référence veux-tu calculer en quantité ?</div>'
      + '<div class="wiz-field-row">' + _configRefPickerHtml(dU.ref, 'data-slot="cumulRef"') + '</div>'
      + '<div class="wiz-step-title" style="margin-top:16px;">Quelles réponses faut-il additionner ?</div>'
      + '<div class="cfg-cumul-rows">' + sourceRowsHtml + '</div>'
      + '<button type="button" class="wiz-add-row-btn wiz-cumul-add">+ Ajouter une réponse à additionner</button>'
      + '<div class="wiz-step-title" style="margin-top:16px;">Quelle caractéristique lire sur la fiche produit ?</div>'
      + '<div class="wiz-step-sub">ex: "Entrées" — la capacité de la carte, renseignée dans ses caractéristiques techniques</div>'
      + '<input type="text" class="wiz-text-input" id="wizCumulSpecKey" placeholder="ex: Entrées" value="' + escapeHtml(dU.specKey || '') + '">'
      + '<div class="wiz-step-title" style="margin-top:16px;">Valeur par défaut si non renseignée ?</div>'
      + '<input type="number" class="wiz-number-input" id="wizCumulFallback" min="1" step="1" value="' + (dU.perFallback != null ? dU.perFallback : 1) + '">'
      + _wizardNavHtml({ nextLabel: 'Continuer →', nextDisabled: cumulInvalid });
  } else if(ws.step === 'recap'){
    html = ''
      + '<div class="wiz-step-title">Voilà ce que je vais ajouter :</div>'
      + '<div class="wiz-recap-text">' + _wizardRecapText() + '</div>'
      + _wizardNavHtml({ nextLabel: '✅ Ajouter au questionnaire' });
  } else if(ws.step === 'done'){
    html = ''
      + '<div class="wiz-step-title">✅ Ajouté !</div>'
      + '<div class="wiz-step-sub">Tu peux le retrouver dans la liste et le modifier si besoin.</div>'
      + '<div class="wiz-nav">'
      + '<button type="button" class="wiz-btn-restart">➕ Ajouter un autre élément</button>'
      + '<button type="button" class="wiz-btn-finish-close">Terminer</button>'
      + '</div>';
  }

  body.innerHTML = html;
}

function _wizardRecapText(){
  var ws = _wizardState;
  var subjectLabel = ws.wantsSub ? ws.subLabel : ws.label;
  var d = ws.draft;
  var actionText;
  if(ws.actionType === 'fixed'){
    actionText = 'ajouter ' + (d.qty != null ? d.qty : 1) + ' × ' + _wizardRefLabel(d.ref) + '.';
  } else if(ws.actionType === 'perUnit'){
    actionText = 'ajouter une ' + _wizardRefLabel(d.ref) + ' tous les ' + (d.per || 8) + '.';
  } else if(ws.actionType === 'range'){
    actionText = 'selon la valeur : ' + (d.rangeTable || []).map(function(row){
      var upTo = row.max != null ? ('jusqu\'à ' + row.max) : 'au-delà';
      var refs = (row.items || []).map(function(it){ return (it.qty != null ? it.qty : 1) + ' × ' + _wizardRefLabel(it.ref); }).join(', ');
      return upTo + ' → ' + refs;
    }).join(' ; ') + '.';
  } else if(ws.actionType === 'choice'){
    actionText = 'laisser choisir une référence dans la catégorie « ' + (d.family || '') + ' » (× ' + (d.qty != null ? d.qty : 1) + ').';
  } else if(ws.actionType === 'cumul'){
    var sourcesText = (d.sources || []).map(function(s){
      var q = _configBuilderState.questions.find(function(qq){ return qq.id === s.question; });
      return (s.weight != null ? s.weight : 1) + ' × [' + (q ? (q.label || q.id) : '?') + ']';
    }).join(' + ');
    actionText = 'calculer la quantité de ' + _wizardRefLabel(d.ref) + ' = (' + sourcesText + ') ÷ « ' + (d.specKey || '') + ' » (par défaut ' + (d.perFallback != null ? d.perFallback : 1) + ' si non renseignée).';
  }
  return 'Quand l\'utilisateur répond à « ' + escapeHtml(subjectLabel) + ' », ' + escapeHtml(actionText || '');
}

function _wizardRefLabel(ref){
  if(!ref) return '?';
  var p = (window.products || []).find(function(x){ return x.ref === ref; });
  return ref + (p ? ' (' + (p.name || '') + ')' : '');
}

function _wizardRefPickerApply(pickerEl, ref){
  var slot = pickerEl.getAttribute('data-slot');
  var ws = _wizardState;
  if(slot === 'ref' || slot === 'cumulRef'){
    ws.draft.ref = ref;
  } else if(slot === 'rangeItem'){
    var row = parseInt(pickerEl.getAttribute('data-row'), 10);
    var item = parseInt(pickerEl.getAttribute('data-item'), 10);
    ws.draft.rangeTable[row].items[item].ref = ref;
  }
  _wizardRenderStep();
}

function _wizardGoBack(){
  var ws = _wizardState;
  var order = {
    type: 'subject', subquestion: 'type', subquestionLabel: 'subquestion',
    actionType: (ws.qtype === 'number' ? 'subquestion' : 'type'),
    detailFixed: 'actionType', detailPerUnit: 'actionType', detailRange: 'actionType',
    detailChoice: 'actionType', detailCumul: 'actionType',
    recap: ('detail' + ws.actionType.charAt(0).toUpperCase() + ws.actionType.slice(1))
  };
  ws.step = order[ws.step] || 'subject';
  _wizardRenderStep();
}

function _wizardGoNext(){
  var ws = _wizardState;
  if(ws.step === 'subject'){
    ws.step = 'type';
  } else if(ws.step === 'subquestionLabel'){
    ws.step = 'actionType';
  } else if(ws.step === 'detailFixed' || ws.step === 'detailPerUnit' || ws.step === 'detailRange' || ws.step === 'detailChoice' || ws.step === 'detailCumul'){
    ws.step = 'recap';
  } else if(ws.step === 'recap'){
    _wizardFinish();
    return;
  }
  _wizardRenderStep();
}

function _wizardSelectActionType(type){
  var ws = _wizardState;
  ws.actionType = type;
  if(type === 'fixed') ws.draft = { ref: '', qty: 1 };
  else if(type === 'perUnit') ws.draft = { ref: '', per: 8 };
  else if(type === 'range') ws.draft = { rangeTable: [{ max: null, items: [{ ref: '', qty: 1 }] }] };
  else if(type === 'choice') ws.draft = { family: '', qty: 1 };
  else if(type === 'cumul') ws.draft = { ref: '', sources: [{ question: '', weight: 1 }], specKey: '', perFallback: 1 };
  ws.step = 'detail' + type.charAt(0).toUpperCase() + type.slice(1);
  _wizardRenderStep();
}

function _wizardFinish(){
  var ws = _wizardState;
  var qid = _configNewId();
  _configBuilderState.questions.push({ id: qid, label: ws.label, type: ws.qtype });
  var triggerId = qid;
  if(ws.qtype === 'number' && ws.wantsSub){
    var subId = _configNewId();
    _configBuilderState.questions.push({ id: subId, label: ws.subLabel, type: 'number', repeatFor: qid });
    triggerId = subId;
  }
  var when = { question: triggerId };
  if(ws.qtype === 'boolean') when.equals = true; // par défaut "SI Oui" (cohérent avec l'affichage par défaut du menu = Oui)

  var d = ws.draft, action;
  if(ws.actionType === 'fixed') action = { ref: d.ref, qty: d.qty != null ? d.qty : 1 };
  else if(ws.actionType === 'perUnit') action = { ref: d.ref, qtyPerUnit: { per: d.per || 8 } };
  else if(ws.actionType === 'range') action = { rangeTable: d.rangeTable };
  else if(ws.actionType === 'choice') action = { chooseFromFamily: d.family, qty: d.qty != null ? d.qty : 1 };
  else if(ws.actionType === 'cumul') action = { ref: d.ref, cumul: { sources: d.sources, specKey: d.specKey, perFallback: d.perFallback != null ? d.perFallback : 1 } };

  _configBuilderState.rules.push({ when: when, action: action });
  _configBuilderRenderComponents();
  ws.step = 'done';
  _wizardRenderStep();
}

function _wizardContainerHandler(e){
  var t = e.target;
  var ws = _wizardState;
  if(!ws) return;

  if(e.type === 'input' && t.classList.contains('cfg-refpick-input')){
    _configRefPickerSearch(t);
    return;
  }
  if(e.type === 'mousedown'){
    var item = t.closest ? t.closest('.cfg-refpick-drop .autocomplete-item') : null;
    if(item){
      e.preventDefault();
      var picker = item.closest('.cfg-refpick');
      _wizardRefPickerApply(picker, item.getAttribute('data-ref'));
      return;
    }
  }
  if(e.type === 'click' && t.classList.contains('cfg-refpick-clear')){
    _wizardRefPickerApply(t.closest('.cfg-refpick'), '');
    return;
  }

  if(e.type === 'click' && t.classList.contains('wiz-choice-card')){
    var choice = t.getAttribute('data-choice');
    if(ws.step === 'type'){ ws.qtype = choice; ws.step = 'subquestion'; if(choice === 'boolean') ws.step = 'actionType'; }
    else if(ws.step === 'subquestion'){ ws.wantsSub = choice === 'yes'; ws.step = choice === 'yes' ? 'subquestionLabel' : 'actionType'; }
    else if(ws.step === 'actionType'){ _wizardSelectActionType(choice); return; }
    _wizardRenderStep();
    return;
  }
  if(e.type === 'click' && t.classList.contains('wiz-btn-back')){ _wizardGoBack(); return; }
  if(e.type === 'click' && t.classList.contains('wiz-btn-next')){ _wizardGoNext(); return; }
  if(e.type === 'click' && t.classList.contains('wiz-btn-restart')){
    _wizardState = { step: 'subject', label: '', qtype: null, wantsSub: null, subLabel: '', actionType: null, draft: {} };
    _wizardRenderStep();
    return;
  }
  if(e.type === 'click' && t.classList.contains('wiz-btn-finish-close')){ _wizardClose(); return; }

  if(e.type === 'input' && t.id === 'wizSubjectInput'){
    ws.label = t.value;
    var nextBtn = document.querySelector('#wizardStepBody .wiz-btn-next');
    if(nextBtn) nextBtn.disabled = !t.value.trim();
    return;
  }
  if(e.type === 'input' && t.id === 'wizSubLabelInput'){
    ws.subLabel = t.value;
    var nextBtn2 = document.querySelector('#wizardStepBody .wiz-btn-next');
    if(nextBtn2) nextBtn2.disabled = !t.value.trim();
    return;
  }
  if(e.type === 'input' && t.id === 'wizFixedQty'){ ws.draft.qty = t.value === '' ? null : Number(t.value); return; }
  if(e.type === 'input' && t.id === 'wizPerUnitPer'){ ws.draft.per = t.value === '' ? null : Number(t.value); return; }
  if(e.type === 'change' && t.id === 'wizChoiceFamily'){
    ws.draft.family = t.value;
    var nextBtn3 = document.querySelector('#wizardStepBody .wiz-btn-next');
    if(nextBtn3) nextBtn3.disabled = !t.value;
    return;
  }
  if(e.type === 'input' && t.id === 'wizChoiceQty'){ ws.draft.qty = t.value === '' ? null : Number(t.value); return; }
  if(e.type === 'input' && t.id === 'wizCumulSpecKey'){
    ws.draft.specKey = t.value;
    var nextBtn4 = document.querySelector('#wizardStepBody .wiz-btn-next');
    if(nextBtn4) nextBtn4.disabled = !(ws.draft.ref) || !(ws.draft.sources || []).every(function(s){ return s.question; }) || !t.value.trim();
    return;
  }
  if(e.type === 'input' && t.id === 'wizCumulFallback'){ ws.draft.perFallback = t.value === '' ? null : Number(t.value); return; }

  // ── Détail "Selon un seuil" (paliers) ──
  if(e.type === 'input' && t.classList.contains('cfg-range-max')){
    var rmRow = parseInt(t.getAttribute('data-row'), 10);
    ws.draft.rangeTable[rmRow].max = t.value === '' ? null : Number(t.value);
    return;
  }
  if(e.type === 'input' && t.classList.contains('cfg-range-item-qty')){
    var rqRow = parseInt(t.getAttribute('data-row'), 10), rqItem = parseInt(t.getAttribute('data-item'), 10);
    ws.draft.rangeTable[rqRow].items[rqItem].qty = t.value === '' ? null : Number(t.value);
    return;
  }
  if(e.type === 'click' && t.classList.contains('cfg-range-item-add')){
    var raRow = parseInt(t.getAttribute('data-row'), 10);
    ws.draft.rangeTable[raRow].items.push({ ref: '', qty: 1 });
    _wizardRenderStep();
    return;
  }
  if(e.type === 'click' && t.classList.contains('cfg-range-item-del')){
    var rdRow = parseInt(t.getAttribute('data-row'), 10), rdItem = parseInt(t.getAttribute('data-item'), 10);
    ws.draft.rangeTable[rdRow].items.splice(rdItem, 1);
    _wizardRenderStep();
    return;
  }
  if(e.type === 'click' && t.classList.contains('cfg-range-add')){
    ws.draft.rangeTable.push({ max: null, items: [{ ref: '', qty: 1 }] });
    _wizardRenderStep();
    return;
  }
  if(e.type === 'click' && t.classList.contains('cfg-range-del')){
    var rdelRow = parseInt(t.getAttribute('data-row'), 10);
    ws.draft.rangeTable.splice(rdelRow, 1);
    _wizardRenderStep();
    return;
  }

  // ── Détail "Cumul pondéré" (sources) ──
  if(e.type === 'change' && t.classList.contains('cfg-cumul-question')){
    var cqIdx = parseInt(t.getAttribute('data-si'), 10);
    ws.draft.sources[cqIdx].question = t.value;
    _wizardRenderStep();
    return;
  }
  if(e.type === 'input' && t.classList.contains('cfg-cumul-weight')){
    var cwIdx = parseInt(t.getAttribute('data-si'), 10);
    ws.draft.sources[cwIdx].weight = t.value === '' ? null : Number(t.value);
    return;
  }
  if(e.type === 'click' && t.classList.contains('wiz-cumul-add')){
    ws.draft.sources.push({ question: '', weight: 1 });
    _wizardRenderStep();
    return;
  }
  if(e.type === 'click' && t.classList.contains('cfg-cumul-del')){
    var cdIdx = parseInt(t.getAttribute('data-si'), 10);
    ws.draft.sources.splice(cdIdx, 1);
    _wizardRenderStep();
    return;
  }
}

// ── Éditeur visuel en schéma (boîtes + flèches) ─────────────────────────
// Troisième mode de création, additif : mêmes données finales que
// l'assistant/l'éditeur avancé ({questions, rules}), juste une autre façon
// de les construire — en dessinant le graphe directement, comme sur le
// diagramme papier d'origine (Whiteboard.pdf). Ne modifie ni le moteur
// (_configEvalRules) ni le format de sauvegarde (_configRulesSave inchangé,
// appelé après synchronisation du graphe vers _configBuilderState).
//
// Nœuds : question (label+type, sort=out ; entrée=in seulement si
// type='derived', alimentée par un choix) / material (juste une référence,
// entrée=in) / choice (catégorie+qté, entrée=in, sortie=out "pick" vers du
// matériel ou une valeur dérivée) / and (combine 2+ conditions, entrée=in
// plusieurs fois, sortie=out) / cumul (référence+caractéristique+défaut,
// entrée=in déclencheur + entrée=src plusieurs fois pour les sources
// pondérées, pas de sortie — la cible est déjà dans le nœud).
var _diagramState = { nodes: [], edges: [], unmanagedRules: [] };
var _diagDrag = null;         // { nodeId, offsetX, offsetY } pendant un glisser de boîte (coords logiques, non zoomées)
var _diagConnecting = null;   // { fromNodeId } pendant un tirage de flèche
var _diagOpenPopoverEdgeId = null;
var _diagZoom = 1;            // échelle visuelle du canevas (1 = 100%)
var _diagPan = null;          // { startX, startY, scrollLeft, scrollTop } pendant un glisser du fond (déplacement de la vue)

function _diagApplyZoom(){
  var canvas = document.getElementById('diagCanvas');
  if(canvas) canvas.style.transform = 'scale(' + _diagZoom + ')';
  var label = document.getElementById('diagZoomLabel');
  if(label) label.textContent = Math.round(_diagZoom * 100) + '%';
}

function _diagSetZoom(z){
  _diagZoom = Math.max(0.3, Math.min(1.5, z));
  _diagApplyZoom();
  _diagRedrawEdges();
}

var DIAG_NODE_W = 220;
var DIAG_NODE_ICON = { question: '❓', material: '🧱', choice: '🗂️', and: '🔗', cumul: '🧮' };
var DIAG_NODE_TITLE = { question: 'Question', material: 'Matériel', choice: "L'utilisateur choisit", and: 'ET', cumul: 'Cumul pondéré' };

function _diagFindNode(id){ return _diagramState.nodes.find(function(n){ return n.id === id; }); }

function _diagNewNode(type, x, y){
  var n = { id: _configNewId(), type: type, x: x || 60, y: y || 60 };
  if(type === 'question'){ n.label = ''; n.qtype = 'number'; n.repeatOf = ''; n.derivedDefault = ''; }
  else if(type === 'material'){ n.ref = ''; n.qty = 1; }
  else if(type === 'choice'){ n.family = ''; n.qty = 1; }
  else if(type === 'cumul'){ n.cumulRef = ''; n.specKey = ''; n.perFallback = 1; }
  return n;
}

function _diagAddNode(type){
  var i = _diagramState.nodes.length;
  _diagramState.nodes.push(_diagNewNode(type, 60 + (i % 5) * 40, 40 + (i % 7) * 40));
  _diagRenderAll();
}

function _diagNodeHtml(node){
  var body = '';
  if(node.type === 'question'){
    body = ''
      + '<input type="text" class="diag-field diag-q-label' + (node.label && node.label.trim() ? '' : ' cfg-field-invalid') + '" data-field="label" placeholder="Libellé (ex: Nombre de variateurs)" value="' + escapeHtml(node.label || '') + '">'
      + '<select class="diag-field" data-field="qtype">'
      + '  <option value="number"' + (node.qtype === 'number' ? ' selected' : '') + '>🔢 Nombre</option>'
      + '  <option value="boolean"' + (node.qtype === 'boolean' ? ' selected' : '') + '>✅ Oui / Non</option>'
      + '  <option value="derived"' + (node.qtype === 'derived' ? ' selected' : '') + '>🔧 Valeur calculée (jamais posée)</option>'
      + '</select>';
    if(node.qtype === 'number'){
      var parentOpts = _diagramState.nodes.filter(function(n){ return n.type === 'question' && n.qtype === 'number' && n.id !== node.id; })
        .map(function(p){ return '<option value="' + escapeHtml(p.id) + '"' + (node.repeatOf === p.id ? ' selected' : '') + '>' + escapeHtml(p.label || p.id) + '</option>'; }).join('');
      body += '<select class="diag-field" data-field="repeatOf"><option value="">— question indépendante —</option>' + parentOpts + '</select>'
        + '<div class="diag-field-hint">"Sous-question de" = posée une fois par unité de la question choisie.</div>';
    } else if(node.qtype === 'derived'){
      body += '<input type="text" class="diag-field" data-field="derivedDefault" placeholder="Valeur par défaut (si aucun choix ne correspond)" value="' + escapeHtml(node.derivedDefault || '') + '">';
    }
  } else if(node.type === 'material'){
    body = _configRefPickerHtml(node.ref, 'data-slot="material" data-node-id="' + node.id + '"')
      + '<div class="diag-field-row"><span class="diag-field-label">Qté si toujours ajouté</span><input type="number" class="diag-field" data-field="qty" min="0" step="1" value="' + (node.qty != null ? node.qty : 1) + '"></div>';
  } else if(node.type === 'choice'){
    var famOpts = _configFamilyOptions().map(function(f){ return '<option value="' + escapeHtml(f) + '"' + (node.family === f ? ' selected' : '') + '>' + escapeHtml(f) + '</option>'; }).join('');
    body = ''
      + '<select class="diag-field' + (node.family ? '' : ' cfg-field-invalid') + '" data-field="family"><option value="">— catégorie —</option>' + famOpts + '</select>'
      + '<div class="diag-field-row"><span class="diag-field-label">Qté</span><input type="number" class="diag-field" data-field="qty" min="0" step="1" value="' + (node.qty != null ? node.qty : 1) + '"></div>';
  } else if(node.type === 'and'){
    body = '<div class="diag-field-hint">Combine plusieurs conditions (ET) : relie 2 questions ou plus à gauche, puis relie sa sortie vers un Matériel ou un Cumul.</div>';
  } else if(node.type === 'cumul'){
    body = ''
      + '<div class="diag-field-label">Carte à calculer</div>'
      + _configRefPickerHtml(node.cumulRef, 'data-slot="cumul" data-node-id="' + node.id + '"')
      + '<input type="text" class="diag-field' + ((node.specKey||'').trim() ? '' : ' cfg-field-invalid') + '" data-field="specKey" placeholder="Caractéristique à lire (ex: Entrées)" value="' + escapeHtml(node.specKey || '') + '">'
      + '<div class="diag-field-row"><span class="diag-field-label">Par défaut si absente</span><input type="number" class="diag-field" data-field="perFallback" min="1" step="1" value="' + (node.perFallback != null ? node.perFallback : 1) + '"></div>';
  }

  var ports = '';
  if(node.type === 'question'){
    ports += '<span class="diag-port diag-port-out" title="Relie vers une condition"></span>';
    if(node.qtype === 'derived') ports += '<span class="diag-port diag-port-in" title="Reçoit sa valeur d\'un bloc \'L\'utilisateur choisit\'"></span>';
  } else if(node.type === 'material'){
    ports += '<span class="diag-port diag-port-in" title="Condition qui ajoute cette référence"></span>';
  } else if(node.type === 'choice'){
    ports += '<span class="diag-port diag-port-in" title="Condition qui propose ce choix"></span><span class="diag-port diag-port-out" title="Relie vers le matériel ajouté ou la valeur déterminée, selon la référence choisie"></span>';
  } else if(node.type === 'and'){
    ports += '<span class="diag-port diag-port-in" title="Relie 2 conditions ou plus ici"></span><span class="diag-port diag-port-out" title="Sortie combinée (ET)"></span>';
  } else if(node.type === 'cumul'){
    ports += '<span class="diag-port diag-port-in" title="Déclencheur (optionnel)"></span><span class="diag-port diag-port-src" title="Sources à additionner (poids)"></span>';
  }

  return ''
    + '<div class="diag-node diag-node-' + node.type + '" data-node-id="' + node.id + '" style="left:' + node.x + 'px;top:' + node.y + 'px;width:' + DIAG_NODE_W + 'px;">'
    + '  <div class="diag-node-head">'
    + '    <span class="diag-node-icon">' + DIAG_NODE_ICON[node.type] + '</span>'
    + '    <span class="diag-node-title">' + DIAG_NODE_TITLE[node.type] + '</span>'
    + '    <button type="button" class="diag-node-del" title="Supprimer">🗑️</button>'
    + '  </div>'
    + '  <div class="diag-node-body">' + body + '</div>'
    + ports
    + '</div>';
}

// Le canevas et le SVG des flèches ont une taille fixe de base (1800×1200)
// mais doivent grandir pour couvrir toute boîte déplacée au-delà — sinon le
// SVG (qui se comporte comme n'importe quel élément avec overflow implicite)
// recadre les flèches qui sortent de sa zone et elles disparaissent.
var DIAG_MIN_W = 1800, DIAG_MIN_H = 1200, DIAG_MARGIN = 260;

function _diagFitCanvasSize(){
  var canvas = document.getElementById('diagCanvas');
  var svg = document.getElementById('diagEdgesSvg');
  if(!canvas) return;
  var maxX = DIAG_MIN_W, maxY = DIAG_MIN_H;
  _diagramState.nodes.forEach(function(n){
    maxX = Math.max(maxX, n.x + DIAG_NODE_W + DIAG_MARGIN);
    maxY = Math.max(maxY, n.y + DIAG_MARGIN);
  });
  canvas.style.width = maxX + 'px';
  canvas.style.height = maxY + 'px';
  if(svg){ svg.setAttribute('width', maxX); svg.setAttribute('height', maxY); svg.style.width = maxX + 'px'; svg.style.height = maxY + 'px'; }
}

function _diagRenderAll(){
  var canvas = document.getElementById('diagCanvas');
  if(!canvas) return;
  canvas.querySelectorAll('.diag-node').forEach(function(el){ el.remove(); });
  _diagFitCanvasSize();
  _diagramState.nodes.forEach(function(node){
    canvas.insertAdjacentHTML('beforeend', _diagNodeHtml(node));
  });
  _diagRedrawEdges();
}

function _diagPortCenter(nodeId, portClass){
  var canvas = document.getElementById('diagCanvas');
  var nodeEl = canvas ? canvas.querySelector('.diag-node[data-node-id="' + nodeId + '"]') : null;
  var portEl = nodeEl ? nodeEl.querySelector('.diag-port-' + portClass) : null;
  if(!canvas || !portEl) return null;
  var canvasRect = canvas.getBoundingClientRect();
  var portRect = portEl.getBoundingClientRect();
  // Coordonnées en espace logique (non zoomé) : les flèches/chips sont des
  // enfants du canevas mis à l'échelle, donc déjà multipliées par le zoom
  // au rendu — diviser ici évite de zoomer deux fois leur position.
  return {
    x: (portRect.left + portRect.width / 2 - canvasRect.left) / _diagZoom,
    y: (portRect.top + portRect.height / 2 - canvasRect.top) / _diagZoom
  };
}

function _diagScreenToCanvas(clientX, clientY){
  var canvas = document.getElementById('diagCanvas');
  var canvasRect = canvas.getBoundingClientRect();
  return { x: (clientX - canvasRect.left) / _diagZoom, y: (clientY - canvasRect.top) / _diagZoom };
}

function _diagEdgeLabel(edge){
  var fromNode = _diagFindNode(edge.from), toNode = _diagFindNode(edge.to);
  if(!fromNode || !toNode) return '?';
  if(edge.toPort === 'src') return 'poids × ' + (edge.weight != null ? edge.weight : 1);
  if(fromNode.type === 'choice'){
    var lbl = 'si ' + (edge.pickRef || '?');
    return lbl + (toNode.type === 'question' ? (' → ' + (edge.tagValue || '?')) : (' (×' + (edge.qty != null ? edge.qty : 1) + ')'));
  }
  if(fromNode.type === 'and') return toNode.type === 'material' ? ('×' + (edge.qty != null ? edge.qty : 1)) : '(ET)';
  if(fromNode.qtype === 'boolean') return '= ' + (edge.equals ? 'Oui' : 'Non') + (toNode.type === 'material' ? (' (×' + (edge.qty != null ? edge.qty : 1) + ')') : '');
  if(fromNode.qtype === 'derived') return '= ' + (edge.equals || '?') + (toNode.type === 'material' ? (' (×' + (edge.qty != null ? edge.qty : 1) + ')') : '');
  if(toNode.type !== 'material') return '= ' + (edge.equals != null ? edge.equals : '?');
  return (edge.mode === 'perUnit' ? ('tous les ' + (edge.per || 8)) : ('≤ ' + (edge.max != null ? edge.max : '∞'))) + ' (×' + (edge.qty != null ? edge.qty : 1) + ')';
}

function _diagRedrawEdges(){
  var svg = document.getElementById('diagEdgesSvg');
  var canvas = document.getElementById('diagCanvas');
  if(!svg || !canvas) return;
  canvas.querySelectorAll('.diag-edge-chip').forEach(function(el){ el.remove(); });
  var svgHtml = '<defs><marker id="diagArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--copper)"></path></marker></defs>';
  _diagramState.edges.forEach(function(edge){
    var fromP = _diagPortCenter(edge.from, 'out');
    var toP = _diagPortCenter(edge.to, edge.toPort || 'in');
    if(!fromP || !toP) return;
    var midX = (fromP.x + toP.x) / 2;
    svgHtml += '<path d="M' + fromP.x + ',' + fromP.y + ' C' + midX + ',' + fromP.y + ' ' + midX + ',' + toP.y + ' ' + toP.x + ',' + toP.y + '" fill="none" stroke="var(--copper)" stroke-width="2" marker-end="url(#diagArrow)"></path>';
    canvas.insertAdjacentHTML('beforeend',
      '<div class="diag-edge-chip" data-edge-id="' + edge.id + '" style="left:' + ((fromP.x + toP.x) / 2) + 'px;top:' + ((fromP.y + toP.y) / 2) + 'px;">' + escapeHtml(_diagEdgeLabel(edge)) + '</div>'
    );
  });
  svg.innerHTML = svgHtml;
}

function _diagNewEdge(fromNodeId, toNodeId, toPort){
  return { id: _configNewId(), from: fromNodeId, to: toNodeId, toPort: toPort, equals: true, mode: 'range', max: null, qty: 1, per: 8, weight: 1, pickRef: '', tagValue: '' };
}

// ── Glisser une boîte / tirer une flèche (souris) ───────────────────────
function _diagOnMouseDown(e){
  var portOutEl = e.target.closest ? e.target.closest('.diag-port-out') : null;
  if(portOutEl){
    e.preventDefault();
    var srcNodeEl = portOutEl.closest('.diag-node');
    _diagConnecting = { fromNodeId: srcNodeEl.getAttribute('data-node-id') };
    document.addEventListener('mousemove', _diagOnConnectMove);
    document.addEventListener('mouseup', _diagOnConnectUp);
    return;
  }
  var headEl = e.target.closest ? e.target.closest('.diag-node-head') : null;
  if(headEl && !e.target.closest('.diag-node-del')){
    e.preventDefault();
    var dragNodeEl = headEl.closest('.diag-node');
    var nodeId = dragNodeEl.getAttribute('data-node-id');
    var node = _diagFindNode(nodeId);
    var pStart = _diagScreenToCanvas(e.clientX, e.clientY);
    _diagDrag = { nodeId: nodeId, offsetX: pStart.x - node.x, offsetY: pStart.y - node.y };
    document.addEventListener('mousemove', _diagOnNodeMove);
    document.addEventListener('mouseup', _diagOnNodeUp);
    return;
  }
  // Clic sur le fond (pas une boîte) : déplace la vue (glisser le canevas).
  if(!e.target.closest || (!e.target.closest('.diag-node') && !e.target.closest('.diag-edge-chip'))){
    var wrap = document.getElementById('diagCanvasWrap');
    if(!wrap) return;
    _diagPan = { startX: e.clientX, startY: e.clientY, scrollLeft: wrap.scrollLeft, scrollTop: wrap.scrollTop };
    wrap.classList.add('diag-panning');
    document.addEventListener('mousemove', _diagOnPanMove);
    document.addEventListener('mouseup', _diagOnPanUp);
  }
}

function _diagOnNodeMove(e){
  if(!_diagDrag) return;
  var node = _diagFindNode(_diagDrag.nodeId);
  if(!node) return;
  var p = _diagScreenToCanvas(e.clientX, e.clientY);
  node.x = Math.max(0, p.x - _diagDrag.offsetX);
  node.y = Math.max(0, p.y - _diagDrag.offsetY);
  var canvas = document.getElementById('diagCanvas');
  var nodeEl = canvas.querySelector('.diag-node[data-node-id="' + node.id + '"]');
  if(nodeEl){ nodeEl.style.left = node.x + 'px'; nodeEl.style.top = node.y + 'px'; }
  _diagFitCanvasSize();
  _diagRedrawEdges();
}

function _diagOnPanMove(e){
  if(!_diagPan) return;
  var wrap = document.getElementById('diagCanvasWrap');
  wrap.scrollLeft = _diagPan.scrollLeft - (e.clientX - _diagPan.startX);
  wrap.scrollTop = _diagPan.scrollTop - (e.clientY - _diagPan.startY);
}

function _diagOnPanUp(){
  _diagPan = null;
  var wrap = document.getElementById('diagCanvasWrap');
  if(wrap) wrap.classList.remove('diag-panning');
  document.removeEventListener('mousemove', _diagOnPanMove);
  document.removeEventListener('mouseup', _diagOnPanUp);
}

function _diagOnNodeUp(){
  _diagDrag = null;
  document.removeEventListener('mousemove', _diagOnNodeMove);
  document.removeEventListener('mouseup', _diagOnNodeUp);
}

function _diagOnConnectMove(e){
  if(!_diagConnecting) return;
  var svg = document.getElementById('diagEdgesSvg');
  var fromP = _diagPortCenter(_diagConnecting.fromNodeId, 'out');
  if(!fromP) return;
  var mp = _diagScreenToCanvas(e.clientX, e.clientY);
  var mx = mp.x, my = mp.y;
  var tempEl = document.getElementById('diagTempEdge');
  var d = 'M' + fromP.x + ',' + fromP.y + ' L' + mx + ',' + my;
  if(!tempEl) svg.insertAdjacentHTML('beforeend', '<path id="diagTempEdge" d="' + d + '" fill="none" stroke="var(--ink-soft)" stroke-width="2" stroke-dasharray="5,4"></path>');
  else tempEl.setAttribute('d', d);
}

function _diagOnConnectUp(e){
  document.removeEventListener('mousemove', _diagOnConnectMove);
  document.removeEventListener('mouseup', _diagOnConnectUp);
  var tempEl = document.getElementById('diagTempEdge');
  if(tempEl) tempEl.remove();
  if(!_diagConnecting) return;
  var fromNodeId = _diagConnecting.fromNodeId;
  _diagConnecting = null;
  var target = document.elementFromPoint(e.clientX, e.clientY);
  var portEl = target && target.closest ? target.closest('.diag-port-in, .diag-port-src') : null;
  if(!portEl) return;
  var toNodeEl = portEl.closest('.diag-node');
  var toNodeId = toNodeEl.getAttribute('data-node-id');
  if(toNodeId === fromNodeId) return;
  var toPort = portEl.classList.contains('diag-port-src') ? 'src' : 'in';
  var fromNodeForConnect = _diagFindNode(fromNodeId);
  // Un seul déclencheur par boîte cible (remplacé par la nouvelle flèche) — sauf
  // les flèches "pick" venant d'un bloc Choix (setTag), qui doivent s'accumuler.
  if(toPort === 'in' && (!fromNodeForConnect || fromNodeForConnect.type !== 'choice')){
    _diagramState.edges = _diagramState.edges.filter(function(ed){ return !(ed.to === toNodeId && ed.toPort === 'in'); });
  }
  var edge = _diagNewEdge(fromNodeId, toNodeId, toPort);
  _diagramState.edges.push(edge);
  _diagRenderAll();
  _diagOpenEdgePopover(edge.id);
}

// ── Champs dans les boîtes (délégué sur #diagCanvasWrap) ────────────────
function _diagCanvasHandler(e){
  var t = e.target;

  if(e.type === 'input' && t.classList.contains('cfg-refpick-input')){ _configRefPickerSearch(t); return; }
  if(e.type === 'mousedown'){
    var item = t.closest ? t.closest('.cfg-refpick-drop .autocomplete-item') : null;
    if(item){
      e.preventDefault();
      var picker = item.closest('.cfg-refpick');
      var pNode = _diagFindNode(picker.getAttribute('data-node-id'));
      if(pNode){
        if(picker.getAttribute('data-slot') === 'material') pNode.ref = item.getAttribute('data-ref');
        else if(picker.getAttribute('data-slot') === 'cumul') pNode.cumulRef = item.getAttribute('data-ref');
      }
      _diagRenderAll();
      return;
    }
  }
  if(e.type === 'click' && t.classList.contains('cfg-refpick-clear')){
    var picker2 = t.closest('.cfg-refpick');
    var pNode2 = _diagFindNode(picker2.getAttribute('data-node-id'));
    if(pNode2){
      if(picker2.getAttribute('data-slot') === 'material') pNode2.ref = '';
      else if(picker2.getAttribute('data-slot') === 'cumul') pNode2.cumulRef = '';
    }
    _diagRenderAll();
    return;
  }

  var nodeEl = t.closest ? t.closest('.diag-node') : null;
  if(nodeEl){
    var n = _diagFindNode(nodeEl.getAttribute('data-node-id'));
    if(!n) return;
    if(e.type === 'click' && t.classList.contains('diag-node-del')){
      var nid = n.id;
      _diagramState.nodes = _diagramState.nodes.filter(function(x){ return x.id !== nid; });
      _diagramState.edges = _diagramState.edges.filter(function(ed){ return ed.from !== nid && ed.to !== nid; });
      _diagramState.nodes.forEach(function(x){ if(x.repeatOf === nid) x.repeatOf = ''; });
      _diagRenderAll();
      return;
    }
    if((e.type === 'input' || e.type === 'change') && t.classList.contains('diag-field')){
      var field = t.getAttribute('data-field');
      if(field === 'label'){ n.label = t.value; t.classList.toggle('cfg-field-invalid', !t.value.trim()); return; }
      if(field === 'family'){ n.family = t.value; t.classList.toggle('cfg-field-invalid', !t.value); return; }
      if(field === 'specKey'){ n.specKey = t.value; t.classList.toggle('cfg-field-invalid', !t.value.trim()); return; }
      if(field === 'qty'){ n.qty = t.value === '' ? null : Number(t.value); return; }
      if(field === 'perFallback'){ n.perFallback = t.value === '' ? null : Number(t.value); return; }
      if(field === 'derivedDefault'){ n.derivedDefault = t.value; return; }
      if(field === 'qtype'){ n.qtype = t.value; _diagRenderAll(); return; }
      if(field === 'repeatOf'){ n.repeatOf = t.value; return; }
    }
  }

  var chip = t.closest ? t.closest('.diag-edge-chip') : null;
  if(chip && e.type === 'click'){ _diagOpenEdgePopover(chip.getAttribute('data-edge-id')); return; }
}

// ── Popover d'édition de flèche ──────────────────────────────────────────
function _diagClosePopover(){
  var el = document.getElementById('diagPopover');
  if(el) el.remove();
  _diagOpenPopoverEdgeId = null;
}

function _diagOpenEdgePopover(edgeId){
  _diagClosePopover();
  var edge = _diagramState.edges.find(function(ed){ return ed.id === edgeId; });
  if(!edge) return;
  var fromNode = _diagFindNode(edge.from), toNode = _diagFindNode(edge.to);
  if(!fromNode || !toNode) return;
  _diagOpenPopoverEdgeId = edgeId;

  var f = '';
  if(edge.toPort === 'src'){
    f = '<label class="diag-pop-label">Poids</label><input type="number" step="any" class="diag-pop-field" data-pfield="weight" value="' + (edge.weight != null ? edge.weight : 1) + '">';
  } else if(fromNode.type === 'choice'){
    var famProducts = (window.products || []).filter(function(p){ return p.family === fromNode.family; });
    var refOpts = famProducts.map(function(p){ return '<option value="' + escapeHtml(p.ref) + '"' + (edge.pickRef === p.ref ? ' selected' : '') + '>' + escapeHtml(p.ref) + ' — ' + escapeHtml(p.name || '') + '</option>'; }).join('');
    f = '<label class="diag-pop-label">Si référence choisie =</label><select class="diag-pop-field" data-pfield="pickRef"><option value="">—</option>' + refOpts + '</select>';
    f += (toNode.type === 'question')
      ? ('<label class="diag-pop-label">Alors valeur =</label><input type="text" class="diag-pop-field" data-pfield="tagValue" placeholder="ex: TM3" value="' + escapeHtml(edge.tagValue || '') + '">')
      : ('<label class="diag-pop-label">Quantité</label><input type="number" class="diag-pop-field" data-pfield="qty" min="0" step="1" value="' + (edge.qty != null ? edge.qty : 1) + '">');
  } else if(fromNode.type === 'and'){
    f = (toNode.type === 'material')
      ? ('<label class="diag-pop-label">Quantité</label><input type="number" class="diag-pop-field" data-pfield="qty" min="0" step="1" value="' + (edge.qty != null ? edge.qty : 1) + '">')
      : '<div class="diag-pop-hint">Aucune condition ici — le ET combine déjà toutes ses entrées.</div>';
  } else if(fromNode.type === 'question' && fromNode.qtype === 'boolean'){
    f = '<label class="diag-pop-label">Condition</label><select class="diag-pop-field" data-pfield="equals"><option value="true"' + (edge.equals === true ? ' selected' : '') + '>= Oui</option><option value="false"' + (edge.equals === false ? ' selected' : '') + '>= Non</option></select>';
    if(toNode.type === 'material') f += '<label class="diag-pop-label">Quantité</label><input type="number" class="diag-pop-field" data-pfield="qty" min="0" step="1" value="' + (edge.qty != null ? edge.qty : 1) + '">';
  } else if(fromNode.type === 'question' && fromNode.qtype === 'derived'){
    f = '<label class="diag-pop-label">Condition (= valeur)</label><input type="text" class="diag-pop-field" data-pfield="equals" placeholder="ex: TM3" value="' + escapeHtml(edge.equals || '') + '">';
    if(toNode.type === 'material') f += '<label class="diag-pop-label">Quantité</label><input type="number" class="diag-pop-field" data-pfield="qty" min="0" step="1" value="' + (edge.qty != null ? edge.qty : 1) + '">';
  } else if(fromNode.type === 'question'){ // number
    if(toNode.type === 'material'){
      f = '<label class="diag-pop-label">Mode</label><select class="diag-pop-field" data-pfield="mode"><option value="range"' + (edge.mode === 'range' ? ' selected' : '') + '>Jusqu\'à une valeur (seuil)</option><option value="perUnit"' + (edge.mode === 'perUnit' ? ' selected' : '') + '>Tous les N</option></select>';
      f += (edge.mode === 'perUnit')
        ? ('<label class="diag-pop-label">Tous les</label><input type="number" class="diag-pop-field" data-pfield="per" min="1" step="1" value="' + (edge.per != null ? edge.per : 8) + '">')
        : ('<label class="diag-pop-label">Jusqu\'à (vide = au-delà)</label><input type="number" class="diag-pop-field" data-pfield="max" value="' + (edge.max != null ? edge.max : '') + '">');
      f += '<label class="diag-pop-label">Quantité</label><input type="number" class="diag-pop-field" data-pfield="qty" min="0" step="1" value="' + (edge.qty != null ? edge.qty : 1) + '">';
    } else {
      f = '<label class="diag-pop-label">Condition (= valeur)</label><input type="text" class="diag-pop-field" data-pfield="equals" value="' + escapeHtml(edge.equals != null ? edge.equals : '') + '">';
    }
  }

  var chip = document.querySelector('.diag-edge-chip[data-edge-id="' + edgeId + '"]');
  var rect = chip ? chip.getBoundingClientRect() : { left: 200, bottom: 200 };
  var html = ''
    + '<div id="diagPopover" class="diag-popover" style="left:' + rect.left + 'px;top:' + (rect.bottom + 6) + 'px;">'
    + '  <div class="diag-popover-fields">' + f + '</div>'
    + '  <div class="diag-popover-actions">'
    + '    <button type="button" class="diag-popover-del">🗑️ Supprimer la flèche</button>'
    + '    <button type="button" class="diag-popover-close">Fermer</button>'
    + '  </div>'
    + '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

function _diagPopoverHandler(e){
  var pop = document.getElementById('diagPopover');
  if(!pop) return;
  var t = e.target;
  if(!pop.contains(t)){
    if(e.type === 'mousedown' && !(t.closest && t.closest('.diag-edge-chip'))) _diagClosePopover();
    return;
  }
  var edge = _diagramState.edges.find(function(ed){ return ed.id === _diagOpenPopoverEdgeId; });
  if(!edge) return;
  if(e.type === 'click' && t.classList.contains('diag-popover-close')){ _diagClosePopover(); return; }
  if(e.type === 'click' && t.classList.contains('diag-popover-del')){
    _diagramState.edges = _diagramState.edges.filter(function(ed){ return ed.id !== edge.id; });
    _diagClosePopover();
    _diagRedrawEdges();
    return;
  }
  if((e.type === 'input' || e.type === 'change') && t.classList.contains('diag-pop-field')){
    var pf = t.getAttribute('data-pfield');
    if(pf === 'equals') edge.equals = (t.tagName === 'SELECT') ? (t.value === 'true') : t.value;
    else if(pf === 'qty') edge.qty = t.value === '' ? null : Number(t.value);
    else if(pf === 'weight') edge.weight = t.value === '' ? null : Number(t.value);
    else if(pf === 'mode'){ edge.mode = t.value; _diagOpenEdgePopover(edge.id); _diagRedrawEdges(); return; }
    else if(pf === 'max') edge.max = t.value === '' ? null : Number(t.value);
    else if(pf === 'per') edge.per = t.value === '' ? null : Number(t.value);
    else if(pf === 'pickRef') edge.pickRef = t.value;
    else if(pf === 'tagValue') edge.tagValue = t.value;
    _diagRedrawEdges();
  }
}

// ── Sérialisation : graphe ⇄ {questions, rules} ─────────────────────────
// Une règle est "gérable" par le schéma si son type d'action est parmi les
// 5 couverts (fixed/perUnit/range/choice/cumul) et qu'elle n'utilise pas
// l'option "demander à l'utilisateur" de setTag (non représentée en v1).
// Tout le reste (Retirer/remplacer, Alerte, ce cas de setTag) est laissé
// intact de côté (_diagramState.unmanagedRules) et jamais perdu.
function _diagRuleIsManageable(rule){
  var t = _configActionType(rule.action);
  if(t === 'remove' || t === 'alert') return false;
  if(t === 'choice' && rule.action.setTag && (rule.action.setTag.rows || []).some(function(r){ return r.ask; })) return false;
  return true;
}

function _diagramSyncToBuilderState(){
  var questions = [];
  var rules = [];

  _diagramState.nodes.forEach(function(n){
    if(n.type === 'question'){
      var q = { id: n.id, label: n.label, type: n.qtype };
      if(n.qtype === 'number' && n.repeatOf) q.repeatFor = n.repeatOf;
      questions.push(q);
    }
  });

  // Résout la chaîne "quelle question déclenche, avec quelle égalité" en
  // remontant depuis la boîte cible : soit directement une Question, soit
  // un nœud ET (première entrée = déclencheur principal, le reste = also).
  function triggerFor(nodeId){
    var inEdge = _diagramState.edges.find(function(e){ return e.to === nodeId && e.toPort === 'in'; });
    if(!inEdge) return { when: {}, qty: 1 };
    var src = _diagFindNode(inEdge.from);
    if(src && src.type === 'and'){
      var andInEdges = _diagramState.edges.filter(function(e){ return e.to === src.id && e.toPort === 'in'; });
      if(!andInEdges.length) return { when: {}, qty: inEdge.qty != null ? inEdge.qty : 1 };
      var primary = andInEdges[0], also = andInEdges.slice(1);
      return {
        when: {
          question: primary.from,
          equals: primary.equals,
          also: also.map(function(e){ return { question: e.from, equals: e.equals }; })
        },
        qty: inEdge.qty != null ? inEdge.qty : 1,
        edge: inEdge
      };
    }
    return { when: { question: inEdge.from, equals: inEdge.equals }, qty: inEdge.qty != null ? inEdge.qty : 1, edge: inEdge, srcNode: src };
  }

  // ── Matériel : range (regroupé par question+seuil), perUnit, fixed/and/derived/boolean ──
  var rangeGroups = {}; // clé "questionId::max" -> { question, max, items:[] }
  _diagramState.nodes.filter(function(n){ return n.type === 'material'; }).forEach(function(mat){
    var inEdge = _diagramState.edges.find(function(e){ return e.to === mat.id && e.toPort === 'in'; });
    if(!inEdge){
      rules.push({ when: {}, action: { ref: mat.ref, qty: mat.qty != null ? mat.qty : 1 } });
      return;
    }
    var src = _diagFindNode(inEdge.from);
    if(src && src.type === 'question' && src.qtype === 'number' && inEdge.mode === 'range'){
      var key = src.id + '::' + (inEdge.max == null ? 'inf' : inEdge.max);
      rangeGroups[key] = rangeGroups[key] || { question: src.id, max: inEdge.max, items: [] };
      rangeGroups[key].items.push({ ref: mat.ref, qty: inEdge.qty != null ? inEdge.qty : 1 });
      return;
    }
    if(src && src.type === 'question' && src.qtype === 'number' && inEdge.mode === 'perUnit'){
      rules.push({ when: { question: src.id }, action: { ref: mat.ref, qtyPerUnit: { per: inEdge.per || 8 } } });
      return;
    }
    var t = triggerFor(mat.id);
    rules.push({ when: t.when, action: { ref: mat.ref, qty: t.qty } });
  });
  // Regroupe les tiers de seuil par question déclenchante en une seule règle rangeTable.
  var byQuestion = {};
  Object.keys(rangeGroups).forEach(function(k){
    var g = rangeGroups[k];
    byQuestion[g.question] = byQuestion[g.question] || [];
    byQuestion[g.question].push({ max: g.max, items: g.items });
  });
  Object.keys(byQuestion).forEach(function(qid){
    rules.push({ when: { question: qid }, action: { rangeTable: byQuestion[qid] } });
  });

  // ── Choix catégorie : setTag (pick -> question dérivée) + addRefs (pick -> matériel) ──
  _diagramState.nodes.filter(function(n){ return n.type === 'choice'; }).forEach(function(choiceNode){
    var t = triggerFor(choiceNode.id);
    var action = { chooseFromFamily: choiceNode.family, qty: choiceNode.qty != null ? choiceNode.qty : 1 };
    var pickEdges = _diagramState.edges.filter(function(e){ return e.from === choiceNode.id; });
    var tagEdges = pickEdges.filter(function(e){ var tn = _diagFindNode(e.to); return tn && tn.type === 'question'; });
    var addEdges = pickEdges.filter(function(e){ var tn = _diagFindNode(e.to); return tn && tn.type === 'material'; });
    if(tagEdges.length){
      var tagTargetNode = _diagFindNode(tagEdges[0].to);
      action.setTag = {
        question: tagTargetNode.id,
        default: tagTargetNode.derivedDefault || '',
        rows: tagEdges.map(function(e){ return { ref: e.pickRef, tag: e.tagValue }; })
      };
    }
    if(addEdges.length){
      var addRows = {};
      addEdges.forEach(function(e){
        var matNode = _diagFindNode(e.to);
        addRows[e.pickRef] = addRows[e.pickRef] || { ref: e.pickRef, items: [] };
        addRows[e.pickRef].items.push({ ref: matNode.ref, qty: e.qty != null ? e.qty : 1 });
      });
      action.addRefs = { rows: Object.keys(addRows).map(function(k){ return addRows[k]; }), default: { items: [] } };
    }
    rules.push({ when: t.when, action: action });
  });

  // ── Cumul pondéré : sources (poids) + déclencheur ──
  _diagramState.nodes.filter(function(n){ return n.type === 'cumul'; }).forEach(function(cumulNode){
    var t = triggerFor(cumulNode.id);
    var sources = _diagramState.edges.filter(function(e){ return e.to === cumulNode.id && e.toPort === 'src'; })
      .map(function(e){ return { question: e.from, weight: e.weight != null ? e.weight : 1 }; });
    rules.push({
      when: t.when,
      action: { ref: cumulNode.cumulRef, cumul: { sources: sources, specKey: cumulNode.specKey, perFallback: cumulNode.perFallback != null ? cumulNode.perFallback : 1 } }
    });
  });

  _configBuilderState.questions = questions;
  _configBuilderState.rules = rules.concat(_diagramState.unmanagedRules);
}

// ── Reconstruction du graphe à partir de {questions, rules} (ouverture) ──
function _rulesToDiagram(questions, rules){
  _diagramState = { nodes: [], edges: [], unmanagedRules: [] };
  var byId = {};
  var col = 0, row = 0;
  function place(){ var pos = { x: 60 + col * 280, y: 40 + row * 170 }; row++; if(row > 5){ row = 0; col++; } return pos; }

  (questions || []).forEach(function(q){
    var pos = place();
    var n = { id: q.id, type: 'question', x: pos.x, y: pos.y, label: q.label || '', qtype: q.type, repeatOf: q.repeatFor || '', derivedDefault: '' };
    byId[q.id] = n;
    _diagramState.nodes.push(n);
  });

  (rules || []).forEach(function(rule){
    if(!_diagRuleIsManageable(rule)){ _diagramState.unmanagedRules.push(rule); return; }
    var when = rule.when || {};
    var rType = _configActionType(rule.action);

    // Nœud ET si "also" présent, sinon lien direct depuis la question primaire.
    function wireTrigger(targetNode, extra){
      if((when.also || []).length){
        var andPos = place();
        var andNode = { id: _configNewId(), type: 'and', x: andPos.x, y: andPos.y };
        _diagramState.nodes.push(andNode);
        var allConds = [{ question: when.question, equals: when.equals }].concat(when.also);
        allConds.forEach(function(c){
          if(byId[c.question]) _diagramState.edges.push(Object.assign(_diagNewEdge(c.question, andNode.id, 'in'), { equals: c.equals }));
        });
        _diagramState.edges.push(Object.assign(_diagNewEdge(andNode.id, targetNode.id, 'in'), extra || {}));
      } else if(when.question && byId[when.question]){
        _diagramState.edges.push(Object.assign(_diagNewEdge(when.question, targetNode.id, 'in'), { equals: when.equals }, extra || {}));
      }
    }

    if(rType === 'fixed'){
      var pos = place();
      var matNode = { id: _configNewId(), type: 'material', x: pos.x, y: pos.y, ref: rule.action.ref, qty: rule.action.qty != null ? rule.action.qty : 1 };
      _diagramState.nodes.push(matNode);
      if(when.question) wireTrigger(matNode, { qty: rule.action.qty != null ? rule.action.qty : 1, mode: 'range' });
      return;
    }
    if(rType === 'perUnit'){
      var posP = place();
      var matNodeP = { id: _configNewId(), type: 'material', x: posP.x, y: posP.y, ref: rule.action.ref, qty: 1 };
      _diagramState.nodes.push(matNodeP);
      wireTrigger(matNodeP, { mode: 'perUnit', per: (rule.action.qtyPerUnit && rule.action.qtyPerUnit.per) || 8 });
      return;
    }
    if(rType === 'range'){
      (rule.action.rangeTable || []).forEach(function(tier){
        (tier.items || []).forEach(function(item){
          var posR = place();
          var matNodeR = { id: _configNewId(), type: 'material', x: posR.x, y: posR.y, ref: item.ref, qty: 1 };
          _diagramState.nodes.push(matNodeR);
          if(when.question && byId[when.question]){
            _diagramState.edges.push(Object.assign(_diagNewEdge(when.question, matNodeR.id, 'in'), { mode: 'range', max: tier.max, qty: item.qty != null ? item.qty : 1 }));
          }
        });
      });
      return;
    }
    if(rType === 'choice'){
      var posC = place();
      var choiceNode = { id: _configNewId(), type: 'choice', x: posC.x, y: posC.y, family: rule.action.chooseFromFamily, qty: rule.action.qty != null ? rule.action.qty : 1 };
      _diagramState.nodes.push(choiceNode);
      wireTrigger(choiceNode);
      if(rule.action.setTag){
        var tagQ = byId[rule.action.setTag.question];
        if(tagQ) tagQ.derivedDefault = rule.action.setTag.default || '';
        (rule.action.setTag.rows || []).forEach(function(row){
          if(tagQ) _diagramState.edges.push(Object.assign(_diagNewEdge(choiceNode.id, tagQ.id, 'in'), { pickRef: row.ref, tagValue: row.tag }));
        });
      }
      if(rule.action.addRefs){
        (rule.action.addRefs.rows || []).forEach(function(row){
          (row.items || []).forEach(function(item){
            var posA = place();
            var matNodeA = { id: _configNewId(), type: 'material', x: posA.x, y: posA.y, ref: item.ref, qty: 1 };
            _diagramState.nodes.push(matNodeA);
            _diagramState.edges.push(Object.assign(_diagNewEdge(choiceNode.id, matNodeA.id, 'in'), { pickRef: row.ref, qty: item.qty != null ? item.qty : 1 }));
          });
        });
      }
      return;
    }
    if(rType === 'cumul'){
      var posU = place();
      var cumulNode = { id: _configNewId(), type: 'cumul', x: posU.x, y: posU.y, cumulRef: rule.action.ref, specKey: (rule.action.cumul || {}).specKey || '', perFallback: (rule.action.cumul || {}).perFallback != null ? rule.action.cumul.perFallback : 1 };
      _diagramState.nodes.push(cumulNode);
      wireTrigger(cumulNode);
      ((rule.action.cumul || {}).sources || []).forEach(function(src){
        if(byId[src.question]) _diagramState.edges.push(Object.assign(_diagNewEdge(src.question, cumulNode.id, 'src'), { weight: src.weight != null ? src.weight : 1 }));
      });
      return;
    }
  });

  _diagAutoLayout();
}

// Range en colonnes selon la profondeur logique (plus long chemin depuis une
// boîte sans entrée), pour que le schéma se lise gauche → droite dans le
// sens du déclenchement — bien plus lisible que l'ordre d'insertion brut.
// Les liens "sous-question de" comptent aussi comme un rattachement parent →
// enfant pour le placement, même s'ils ne sont pas dessinés comme une flèche.
function _diagAutoLayout(){
  var nodes = _diagramState.nodes, edges = _diagramState.edges;
  var incoming = {}, outgoing = {};
  nodes.forEach(function(n){ incoming[n.id] = 0; outgoing[n.id] = []; });
  edges.forEach(function(e){
    if(outgoing[e.from]) outgoing[e.from].push(e.to);
    if(incoming[e.to] !== undefined) incoming[e.to]++;
  });
  nodes.forEach(function(n){
    if(n.type === 'question' && n.repeatOf && outgoing[n.repeatOf]){
      outgoing[n.repeatOf].push(n.id);
      incoming[n.id]++;
    }
  });

  var layer = {};
  var queue = [];
  nodes.forEach(function(n){ if(incoming[n.id] === 0){ layer[n.id] = 0; queue.push(n.id); } });
  var guard = 0;
  while(queue.length && guard++ < 20000){
    var id = queue.shift();
    (outgoing[id] || []).forEach(function(toId){
      var candidate = layer[id] + 1;
      if(layer[toId] === undefined || candidate > layer[toId]){ layer[toId] = candidate; queue.push(toId); }
    });
  }
  nodes.forEach(function(n){ if(layer[n.id] === undefined) layer[n.id] = 0; });

  var colWidth = 300, rowHeight = 210;
  var colCounts = {};
  nodes.forEach(function(n){
    var col = layer[n.id];
    var row = colCounts[col] || 0;
    colCounts[col] = row + 1;
    n.x = 40 + col * colWidth;
    n.y = 30 + row * rowHeight;
  });
}

// ── UI ────────────────────────────────────────────────────────────────
function _chatAppendMessage(role, text, extraClass){
  var messagesEl = document.getElementById('chatMessages');
  if(!messagesEl) return;
  var div = document.createElement('div');
  div.className = 'chat-msg ' + (role === 'user' ? 'chat-msg-user' : 'chat-msg-bot') + (extraClass ? ' ' + extraClass : '');
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function _chatSetTyping(isTyping){
  var el = document.getElementById('chatTypingIndicator');
  if(el) el.style.display = isTyping ? 'block' : 'none';
}

function _chatSend(){
  var input = document.getElementById('chatInput');
  if(!input) return;
  var question = input.value.trim();
  if(!question) return;
  input.value = '';
  _chatAppendMessage('user', question);

  _chatSetTyping(true);
  askChat(question).then(function(answer){
    _chatSetTyping(false);
    var text = answer || "Je n'ai pas trouvé cette information dans le catalogue.";
    _chatAppendMessage('assistant', text);
    _chatHistory.push({ role: 'user', content: question });
    _chatHistory.push({ role: 'assistant', content: text });
  }).catch(function(e){
    _chatSetTyping(false);
    var msg = 'Erreur : ' + (e && e.message ? e.message : e);
    _chatAppendMessage('assistant', msg);
    if(typeof showToast === 'function') showToast(msg, 'err');
  });
}

function _chatOpen(){
  if(!window._userPerms || !window._userPerms.isAdmin) return;
  var overlay = document.getElementById('chatOverlay');
  if(!overlay) return;
  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');
  var input = document.getElementById('chatInput');
  if(input) setTimeout(function(){ input.focus(); }, 50);
}

function _chatClose(){
  var overlay = document.getElementById('chatOverlay');
  if(overlay) overlay.style.display = 'none';
  document.body.classList.remove('modal-open');
}

(function _initChat(){
  var btnFab = document.getElementById('btnFabChat');
  if(btnFab) btnFab.addEventListener('click', _chatOpen);

  var btnClose = document.getElementById('chatCloseBtn');
  if(btnClose) btnClose.addEventListener('click', _chatClose);

  var btnSend = document.getElementById('chatSendBtn');
  if(btnSend) btnSend.addEventListener('click', _chatSend);

  var input = document.getElementById('chatInput');
  if(input) input.addEventListener('keydown', function(e){
    if(e.key === 'Enter') _chatSend();
  });

  var chatMessagesEl = document.getElementById('chatMessages');
  if(chatMessagesEl){
    chatMessagesEl.addEventListener('change', _configFormContainerHandler);
    chatMessagesEl.addEventListener('click', _configFormContainerHandler);
  }

  var btnConfigStart = document.getElementById('chatConfigStartBtn');
  if(btnConfigStart) btnConfigStart.addEventListener('click', _configStart);

  var btnConfigGear = document.getElementById('chatConfigGearBtn');
  if(btnConfigGear) btnConfigGear.addEventListener('click', _configRulesOpen);

  var btnConfigRulesClose = document.getElementById('configRulesCloseBtn');
  if(btnConfigRulesClose) btnConfigRulesClose.addEventListener('click', _configRulesClose);

  var btnConfigRulesSave = document.getElementById('configRulesSaveBtn');
  if(btnConfigRulesSave) btnConfigRulesSave.addEventListener('click', _configRulesSave);

  var btnConfigRulesImport = document.getElementById('configRulesImportBtn');
  var configRulesImportInput = document.getElementById('configRulesImportInput');
  if(btnConfigRulesImport && configRulesImportInput){
    btnConfigRulesImport.addEventListener('click', function(){ configRulesImportInput.click(); });
    configRulesImportInput.addEventListener('change', function(){
      _configRulesImportFile(configRulesImportInput.files && configRulesImportInput.files[0]);
      configRulesImportInput.value = '';
    });
  }

  var btnOpenWizard = document.getElementById('btnOpenWizard');
  if(btnOpenWizard) btnOpenWizard.addEventListener('click', _wizardOpen);

  var wizardCloseBtn = document.getElementById('wizardCloseBtn');
  if(wizardCloseBtn) wizardCloseBtn.addEventListener('click', _wizardClose);

  var wizardStepBody = document.getElementById('wizardStepBody');
  if(wizardStepBody){
    wizardStepBody.addEventListener('input', _wizardContainerHandler);
    wizardStepBody.addEventListener('change', _wizardContainerHandler);
    wizardStepBody.addEventListener('click', _wizardContainerHandler);
    wizardStepBody.addEventListener('mousedown', _wizardContainerHandler);
  }

  var btnToggleAdvanced = document.getElementById('btnToggleAdvanced');
  var configPaletteEl = document.getElementById('configPalette');
  if(btnToggleAdvanced && configPaletteEl){
    btnToggleAdvanced.addEventListener('click', function(){
      var open = configPaletteEl.style.display !== 'none';
      configPaletteEl.style.display = open ? 'none' : 'flex';
      btnToggleAdvanced.textContent = open ? 'Mode avancé (glisser-déposer) ▾' : 'Mode avancé (glisser-déposer) ▲';
    });
  }

  document.querySelectorAll('.cfg-tab-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ _configSwitchTab(btn.getAttribute('data-tab')); });
  });

  var diagToolbar = document.getElementById('diagToolbar');
  if(diagToolbar){
    diagToolbar.addEventListener('click', function(e){
      var toolBtn = e.target.closest ? e.target.closest('.diag-tool-btn') : null;
      if(toolBtn) _diagAddNode(toolBtn.getAttribute('data-nodetype'));
    });
  }

  var diagCanvasWrap = document.getElementById('diagCanvasWrap');
  if(diagCanvasWrap){
    diagCanvasWrap.addEventListener('mousedown', function(e){ _diagCanvasHandler(e); _diagOnMouseDown(e); });
    diagCanvasWrap.addEventListener('input', _diagCanvasHandler);
    diagCanvasWrap.addEventListener('change', _diagCanvasHandler);
    diagCanvasWrap.addEventListener('click', _diagCanvasHandler);
    diagCanvasWrap.addEventListener('wheel', function(e){
      if(!e.ctrlKey && !e.metaKey) return; // molette normale = défilement classique
      e.preventDefault();
      _diagSetZoom(_diagZoom + (e.deltaY < 0 ? 0.1 : -0.1));
    }, { passive: false });
  }

  var diagZoomIn = document.getElementById('diagZoomIn');
  var diagZoomOut = document.getElementById('diagZoomOut');
  var diagZoomReset = document.getElementById('diagZoomReset');
  if(diagZoomIn) diagZoomIn.addEventListener('click', function(){ _diagSetZoom(_diagZoom + 0.1); });
  if(diagZoomOut) diagZoomOut.addEventListener('click', function(){ _diagSetZoom(_diagZoom - 0.1); });
  if(diagZoomReset) diagZoomReset.addEventListener('click', function(){ _diagSetZoom(1); });

  var diagReorganizeBtn = document.getElementById('diagReorganizeBtn');
  if(diagReorganizeBtn) diagReorganizeBtn.addEventListener('click', function(){ _diagAutoLayout(); _diagRenderAll(); });

  document.addEventListener('mousedown', _diagPopoverHandler);
  document.addEventListener('input', _diagPopoverHandler);
  document.addEventListener('change', _diagPopoverHandler);
  document.addEventListener('click', _diagPopoverHandler);

  var compContainer = document.getElementById('configBuilderComponents');
  if(compContainer){
    compContainer.addEventListener('input', _configComponentsContainerHandler);
    compContainer.addEventListener('change', _configComponentsContainerHandler);
    compContainer.addEventListener('click', _configComponentsContainerHandler);
    compContainer.addEventListener('mousedown', _configComponentsContainerMousedown);
    compContainer.addEventListener('dragover', _configPaletteDragOver);
    compContainer.addEventListener('dragleave', _configPaletteDragLeave);
    compContainer.addEventListener('drop', _configPaletteDrop);
  }

  var configPalette = document.getElementById('configPalette');
  if(configPalette){
    configPalette.addEventListener('dragstart', _configPaletteDragStart);
    configPalette.addEventListener('dragend', _configPaletteDragEnd);
  }
})();
