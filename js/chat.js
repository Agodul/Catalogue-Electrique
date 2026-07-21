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
  return fetch(sUrl + '/configuratorRules', { headers: authHeaders() }).then(function(r){
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
// rangeTable (sélection de réf selon un seuil numérique).
function _configEvalRules(rules, answers){
  var totals = {};
  (rules || []).forEach(function(rule){
    var when = rule.when || {};
    var action = rule.action || {};
    var raw = answers[when.question];
    if(raw === undefined || raw === null) return;
    var values = Array.isArray(raw) ? raw : [raw];
    values.forEach(function(value){
      if(Object.prototype.hasOwnProperty.call(when, 'equals') && value !== when.equals) return;
      var ref, qty;
      if(action.rangeTable){
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
        ref = match.ref; qty = match.qty != null ? match.qty : 1;
      } else if(action.qtyPerUnit){
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
  return Object.keys(totals).map(function(ref){ return { ref: ref, qty: totals[ref] }; });
}

var _configState = null; // non-null pendant le questionnaire (détourne _chatSend)

function _configParseAnswer(q, text){
  var t = (text || '').trim().toLowerCase();
  if(q.type === 'boolean'){
    if(['oui','o','yes','y'].indexOf(t) !== -1) return true;
    if(['non','n','no'].indexOf(t) !== -1) return false;
    return null;
  }
  if(q.type === 'number'){
    var n = parseFloat(t.replace(',', '.'));
    return isNaN(n) ? null : n;
  }
  return text;
}

function _configAskQuestion(q, repeatIndex, repeatCount){
  var label = q.label || q.id;
  if(repeatIndex) label += ' (n°' + repeatIndex + '/' + repeatCount + ')';
  if(q.type === 'boolean') label += ' (oui/non)';
  _chatAppendMessage('assistant', label);
}

function _configAskNext(){
  var cfg = _configState;
  if(!cfg) return;
  if(cfg.repeatRemaining > 0){
    cfg.repeatIndex++;
    cfg.repeatRemaining--;
    _configAskQuestion(cfg.questions[cfg.qIndex], cfg.repeatIndex, cfg.repeatCount);
    return;
  }
  cfg.qIndex++;
  if(cfg.qIndex >= cfg.questions.length){
    _configFinish();
    return;
  }
  var q = cfg.questions[cfg.qIndex];
  if(q.repeatFor){
    var count = Math.max(0, Math.round(Number(cfg.answers[q.repeatFor]) || 0));
    if(count <= 0){ _configAskNext(); return; } // rien à répéter, passer à la suivante
    cfg.answers[q.id] = [];
    cfg.repeatIndex = 1;
    cfg.repeatRemaining = count - 1;
    cfg.repeatCount = count;
    _configAskQuestion(q, 1, count);
  } else {
    _configAskQuestion(q, null, null);
  }
}

function _configAdvance(userText){
  var cfg = _configState;
  if(!cfg) return;
  var q = cfg.questions[cfg.qIndex];
  var value = _configParseAnswer(q, userText);
  if(value === null){
    _chatAppendMessage('assistant', "Je n'ai pas compris, réponds par " + (q.type === 'boolean' ? '"oui" ou "non".' : 'un nombre.'));
    return;
  }
  if(q.repeatFor) cfg.answers[q.id].push(value);
  else cfg.answers[q.id] = value;
  _configAskNext();
}

function _configFinish(){
  var cfg = _configState;
  var items = _configEvalRules(cfg.rules, cfg.answers);
  _configState = null;
  if(!items.length){
    _chatAppendMessage('assistant', "Aucun matériel déterminé à partir de tes réponses.");
    return;
  }
  var lines = items.map(function(it){
    var p = (window.products || []).find(function(x){ return x.ref === it.ref; });
    return '• ' + it.qty + ' × ' + it.ref + (p ? ' — ' + (p.name || '') : ' (référence introuvable dans le catalogue)');
  });
  _chatAppendMessage('assistant', 'Liste de matériel :\n' + lines.join('\n'));
}

function _configStart(){
  fetchConfiguratorRules().then(function(rules){
    if(!rules || !Array.isArray(rules.questions) || !rules.questions.length){
      _chatAppendMessage('assistant', "Aucune question n'est configurée pour le moment. Utilise l'icône ⚙️ pour en définir.");
      return;
    }
    _configState = { questions: rules.questions, rules: rules.rules || [], answers: {}, qIndex: -1, repeatRemaining: 0 };
    _chatAppendMessage('assistant', "C'est parti — je vais te poser quelques questions pour établir la liste de matériel.");
    _configAskNext();
  }).catch(function(e){
    if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err');
  });
}

// ── Éditeur de règles (admin) ─────────────────────────────────────────
function _configRulesOpen(){
  var overlay = document.getElementById('configRulesOverlay');
  var textarea = document.getElementById('configRulesTextarea');
  if(!overlay || !textarea) return;
  overlay.style.display = 'flex';
  document.body.classList.add('modal-open');
  textarea.value = 'Chargement…';
  fetchConfiguratorRules().then(function(rules){
    textarea.value = JSON.stringify(rules, null, 2);
  }).catch(function(e){
    textarea.value = '';
    if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err');
  });
}

function _configRulesClose(){
  var overlay = document.getElementById('configRulesOverlay');
  if(overlay) overlay.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function _configRulesSave(){
  var textarea = document.getElementById('configRulesTextarea');
  if(!textarea) return;
  var parsed;
  try{
    parsed = JSON.parse(textarea.value);
  }catch(e){
    if(typeof showToast === 'function') showToast('JSON invalide : ' + e.message, 'err');
    return;
  }
  if(!parsed || !Array.isArray(parsed.questions) || !Array.isArray(parsed.rules)){
    if(typeof showToast === 'function') showToast('Le JSON doit contenir "questions" et "rules" (tableaux).', 'err');
    return;
  }
  saveConfiguratorRules(parsed).then(function(){
    if(typeof showToast === 'function') showToast('Règles enregistrées', 'ok');
    _configRulesClose();
  }).catch(function(e){
    if(typeof showToast === 'function') showToast('Erreur : ' + (e && e.message || e), 'err');
  });
}

// ── UI ────────────────────────────────────────────────────────────────
function _chatAppendMessage(role, text){
  var messagesEl = document.getElementById('chatMessages');
  if(!messagesEl) return;
  var div = document.createElement('div');
  div.className = 'chat-msg ' + (role === 'user' ? 'chat-msg-user' : 'chat-msg-bot');
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

  if(_configState){
    _configAdvance(question);
    return;
  }

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

  var btnConfigStart = document.getElementById('chatConfigStartBtn');
  if(btnConfigStart) btnConfigStart.addEventListener('click', _configStart);

  var btnConfigGear = document.getElementById('chatConfigGearBtn');
  if(btnConfigGear) btnConfigGear.addEventListener('click', _configRulesOpen);

  var btnConfigRulesClose = document.getElementById('configRulesCloseBtn');
  if(btnConfigRulesClose) btnConfigRulesClose.addEventListener('click', _configRulesClose);

  var btnConfigRulesSave = document.getElementById('configRulesSaveBtn');
  if(btnConfigRulesSave) btnConfigRulesSave.addEventListener('click', _configRulesSave);
})();
