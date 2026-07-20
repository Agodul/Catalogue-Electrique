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
    tags: normalizeSearch(Array.isArray(p.tags) ? p.tags.join(' ') : '')
  };
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
    else if(f.ref && terms.some(function(t){ return f.ref.indexOf(t) === 0; })) score += 80;
    terms.forEach(function(t){
      if(f.name.indexOf(t) !== -1) score += 40;
      if(f.brand.indexOf(t) !== -1) score += 30;
      if(f.family.indexOf(t) !== -1) score += 30;
      if(f.tags.indexOf(t) !== -1) score += 25;
      if(f.desc.indexOf(t) !== -1) score += 15;
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
      priceCatalogue: s.p.priceCatalogue || ''
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
})();
