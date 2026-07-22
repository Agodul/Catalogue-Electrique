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
    if(_configActionType(action) === 'choice' || _configActionType(action) === 'remove') return;
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
  return 'fixed';
}

function _configFamilyOptions(){
  var families = [];
  (window.products || []).forEach(function(p){
    if(p.family && families.indexOf(p.family) === -1) families.push(p.family);
  });
  return families.sort();
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
    + '<div class="cfg-refpick" ' + slotAttr + '>'
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
      equalsHtml += '<input type="number" class="cfg-r-alert-threshold" placeholder="seuil" value="' + (when.threshold != null ? when.threshold : '') + '">';
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
      + '  <select class="cfg-r-also-question" data-aidx="' + ai + '"><option value="">— composant —</option>' + qOptions + '</select>'
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
      + '<select class="cfg-r-choice-family"><option value="">— choisir une catégorie —</option>' + famOptions + '</select>'
      + '<span class="cfg-r-perunit-label">quantité</span>'
      + '<input type="number" class="cfg-r-qty" min="0" step="1" value="' + (action.qty != null ? action.qty : 1) + '">'
      + '<label class="cfg-q-repeat-label" style="width:100%;margin-top:6px;"><input type="checkbox" class="cfg-r-tag-toggle"' + (action.setTag ? ' checked' : '') + '> Déterminer une valeur selon la référence choisie (ex: TM3/TM5)</label>';
    if(action.setTag){
      var tagRows = (action.setTag.rows || []).map(function(row, ti){
        return ''
          + '<div class="cfg-tag-row" data-tidx="' + ti + '">'
          + '  ' + _configRefPickerHtml(row.ref, 'data-slot="tagref" data-tidx="' + ti + '"')
          + '  <span class="cfg-tag-arrow">→</span>'
          + (row.ask
            ? ('  <input type="text" class="cfg-tag-ask-options" data-tidx="' + ti + '" placeholder="options séparées par une virgule (ex: TM3, TM5)" value="' + escapeHtml((row.askOptions || []).join(', ')) + '">')
            : ('  <input type="text" class="cfg-tag-value" data-tidx="' + ti + '" placeholder="valeur (ex: TM3)" value="' + escapeHtml(row.tag || '') + '">'))
          + '  <button type="button" class="cfg-btn-icon cfg-tag-del" data-tidx="' + ti + '">✕</button>'
          + '  <label class="cfg-tag-ask-label"><input type="checkbox" class="cfg-tag-ask-toggle" data-tidx="' + ti + '"' + (row.ask ? ' checked' : '') + '> demander à l\'utilisateur</label>'
          + '</div>';
      }).join('');
      actionBody += ''
        + '<div class="cfg-tag-rows">' + tagRows + '</div>'
        + '<button type="button" class="cfg-btn-add-row cfg-tag-add">+ Association</button>'
        + '<div class="cfg-tag-default-row"><span class="cfg-r-perunit-label">Sinon (par défaut) :</span>'
        + '  <input type="text" class="cfg-tag-default" placeholder="valeur par défaut (ex: TM5)" value="' + escapeHtml(action.setTag.default || '') + '">'
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
    actionBody = '<input type="text" class="cfg-r-alert-message" placeholder="Message d\'alerte (ex: Puissance totale élevée, vérifier le disjoncteur général)" value="' + escapeHtml(action.alertMessage || '') + '">';
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
    + '    <input type="text" class="cfg-sq-label" placeholder="' + (isDerived ? 'Nom de la valeur (ex: Technologie automate)' : 'Libellé (ex: Puissance moteur)') + '" value="' + escapeHtml(subq.label || '') + '">'
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
    + '    <input type="text" class="cfg-q-label" placeholder="Nom du composant (ex: Variateur de vitesse)" value="' + escapeHtml(q.label || '') + '">'
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
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-r-alert-message')){
      rule.action.alertMessage = t.value;
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
      else rule.action = { rangeTable: [{ max: null, items: [{ ref: oldRef || '', qty: 1 }] }] };
      _configBuilderRenderComponents();
      return;
    }
    if(e.type === 'change' && t.classList.contains('cfg-r-choice-family')){
      rule.action.chooseFromFamily = t.value;
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
      return;
    }
    if(e.type === 'input' && t.classList.contains('cfg-tag-ask-options')){
      var taIdx = parseInt(t.getAttribute('data-tidx'), 10);
      if(rule.action.setTag && rule.action.setTag.rows[taIdx]){
        rule.action.setTag.rows[taIdx].askOptions = t.value.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
      }
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
  }).catch(function(e){
    if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err');
  });
}

function _configRulesClose(){
  var overlay = document.getElementById('configRulesOverlay');
  if(overlay) overlay.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function _configRulesSave(){
  for(var i = 0; i < _configBuilderState.questions.length; i++){
    if(!_configBuilderState.questions[i].label || !_configBuilderState.questions[i].label.trim()){
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
