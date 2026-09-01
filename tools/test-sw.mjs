#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
//  TEST-SW.MJS — Tests du service worker hors navigateur
//  Catalogue Électrique — SPI Engineering
// ══════════════════════════════════════════════════════════════════════════
//
//   node tools/test-sw.mjs
//
// sw.js est le seul fichier du projet dont on ne voit PAS le résultat à
// l'écran : une erreur dedans ne se manifeste qu'en coupant le réseau, sur
// un appareil déjà installé, plusieurs jours après le déploiement. Ces tests
// exécutent le vrai fichier sw.js dans un environnement ServiceWorker
// simulé (caches, fetch, événements) et vérifient ce qui compte :
//
//   • l'installation met bien la coque de l'application en cache ;
//   • l'activation purge les vieux caches SANS toucher à celui des
//     bibliothèques, et le remplit ;
//   • une montée de version de l'application ne fait PAS retélécharger les
//     3,3 Mo de bibliothèques ;
//   • réseau coupé, la coque ET les bibliothèques répondent depuis le cache ;
//   • les requêtes vers un autre domaine (l'API métier) ne passent jamais
//     par le cache.
//
// Sans dépendance, comme tools/check.mjs.
// ══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ORIGIN = 'https://exemple.test';
const SCOPE = ORIGIN + '/Catalogue-Electrique/';

// ── Cache API simulée ────────────────────────────────────────────────────
// Les clés sont normalisées en URL absolues, comme le fait le vrai navigateur :
// c'est précisément ce qui fait qu'un cache.put('./js/x.js') et un
// cache.match(requêtePourHttps://…/js/x.js) se retrouvent.
function makeCaches() {
  const stores = new Map();
  const abs = (k) => new URL(typeof k === 'string' ? k : k.url, SCOPE).href;
  const api = {
    _stores: stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(key, res) { store.set(abs(key), res); },
        async match(key)     { return store.get(abs(key)); },
        async add(key)       { store.set(abs(key), new Response('')); },
        _store: store
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  return api;
}

// ── Réseau simulé ────────────────────────────────────────────────────────
// Sert les vrais fichiers du dépôt. `offline` coupe tout, comme un appareil
// sans connexion.
function makeFetch(state) {
  return async function fetchStub(input) {
    const url = typeof input === 'string' ? new URL(input, SCOPE).href : input.url;
    state.requests.push(url);
    if (state.offline) throw new TypeError('Failed to fetch');
    if (!url.startsWith(SCOPE)) return new Response('distant', { status: 200 });
    let rel = decodeURIComponent(url.slice(SCOPE.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const path = join(ROOT, rel);
    if (!existsSync(path)) return new Response('', { status: 404 });
    return new Response(readFileSync(path), { status: 200 });
  };
}

// ── Chargement de sw.js dans un contexte isolé ───────────────────────────
// `nouvelleVersion` simule un déploiement suivant : CACHE et CACHE_LIBS sont
// déclarés en `const` dans sw.js, donc invisibles depuis l'extérieur du
// contexte et impossibles à réaffecter — on réécrit la ligne dans la source
// avant exécution, exactement comme le fait ./bump-sw-version.sh.
const SW_SOURCE = readFileSync(join(ROOT, 'sw.js'), 'utf8');

function swConstant(name, source = SW_SOURCE) {
  const m = source.match(new RegExp('^const ' + name + ' = "([^"]+)";', 'm'));
  if (!m) throw new Error(`constante ${name} introuvable dans sw.js`);
  return m[1];
}

function loadServiceWorker(state, nouvelleVersion) {
  const listeners = new Map();
  const self = {
    location: { href: SCOPE + 'sw.js', origin: ORIGIN },
    addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
    skipWaiting: async () => { state.skipWaitingAppelé = true; },
    clients: { claim: async () => { state.claimAppelé = true; } }
  };
  const ctx = vm.createContext({
    self, caches: state.caches, fetch: makeFetch(state),
    Response, Request, URL, Promise, console,
    setTimeout, clearTimeout
  });
  ctx.globalThis = ctx;
  const source = nouvelleVersion
    ? SW_SOURCE.replace(/^const CACHE = "[^"]+";/m, `const CACHE = "${nouvelleVersion}";`)
    : SW_SOURCE;
  vm.runInContext(source, ctx, { filename: 'sw.js' });

  async function dispatch(type, event) {
    const waits = [];
    let response;
    const ev = Object.assign({
      waitUntil: (p) => waits.push(p),
      respondWith: (r) => { response = r; }
    }, event);
    for (const fn of listeners.get(type) || []) await fn(ev);
    await Promise.all(waits);
    return response ? await response : undefined;
  }

  return { dispatch, ctx, CACHE: swConstant('CACHE', source), CACHE_LIBS: swConstant('CACHE_LIBS', source) };
}

function request(url, init) {
  return new Request(new URL(url, SCOPE).href, init);
}

// ── Harnais de test ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`${GREEN}✓${OFF} ${name}`);
  } catch (e) {
    failed++;
    console.log(`${RED}✗${OFF} ${name}`);
    console.log(`    ${e.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg} — attendu ${JSON.stringify(b)}, obtenu ${JSON.stringify(a)}`);
}

// ── Scénario commun : un service worker installé et activé ───────────────
async function bootServiceWorker() {
  const state = { caches: makeCaches(), requests: [], offline: false };
  const sw = loadServiceWorker(state);
  await sw.dispatch('install', {});
  await sw.dispatch('activate', {});
  return { state, sw };
}

const VERSION_SUIVANTE = 'spi-catalogue-v29999999999999';

console.log('');

await test("L'installation met la coque de l'application en cache", async () => {
  const { state, sw } = await bootServiceWorker();
  const coque = await state.caches.open(sw.CACHE);
  assert(await coque.match('./index.html'), 'index.html absent du cache');
  assert(await coque.match('./css/styles.css'), 'styles.css absent du cache');
  assert(await coque.match('./js/actions-core.js'), 'actions-core.js absent du cache');
  assert(state.skipWaitingAppelé, 'skipWaiting() jamais appelé');
  void sw;
});

await test("L'activation prend la main sur les pages ouvertes", async () => {
  const { state } = await bootServiceWorker();
  assert(state.claimAppelé, 'clients.claim() jamais appelé — il était hors waitUntil');
});

await test("Les bibliothèques lourdes vont dans leur cache dédié, pas dans la coque", async () => {
  const { state, sw } = await bootServiceWorker();
  const coque = await state.caches.open(sw.CACHE);
  const libs  = await state.caches.open(sw.CACHE_LIBS);
  assert(await libs.match('./js/xlsx.full.min.js'), 'xlsx.full.min.js absent du cache des bibliothèques');
  assert(await libs.match('./js/pdf.worker.min.js'), 'pdf.worker.min.js absent du cache des bibliothèques');
  assert(!(await coque.match('./js/xlsx.full.min.js')), 'une bibliothèque a atterri dans le cache de la coque');
});

await test("Une nouvelle version de l'application ne retélécharge pas les bibliothèques", async () => {
  // Premier déploiement
  const state = { caches: makeCaches(), requests: [], offline: false };
  const sw1 = loadServiceWorker(state);
  await sw1.dispatch('install', {});
  await sw1.dispatch('activate', {});

  // Deuxième déploiement : même CACHE_LIBS (les bibliothèques n'ont pas
  // bougé), nouveau CACHE. On repart d'un compteur de requêtes vierge.
  state.requests = [];
  const sw2 = loadServiceWorker(state, VERSION_SUIVANTE);
  await sw2.dispatch('install', {});
  await sw2.dispatch('activate', {});

  const libsRedemandees = state.requests.filter(u => u.endsWith('.min.js'));
  assertEqual(libsRedemandees.length, 0,
    `${libsRedemandees.length} bibliothèque(s) retéléchargée(s) alors qu'elles étaient déjà en cache`);
});

await test("Le vieux cache est purgé, celui des bibliothèques est conservé", async () => {
  const state = { caches: makeCaches(), requests: [], offline: false };
  const sw1 = loadServiceWorker(state);
  await sw1.dispatch('install', {});
  await sw1.dispatch('activate', {});
  const ancienNom = sw1.CACHE;

  const sw2 = loadServiceWorker(state, VERSION_SUIVANTE);
  await sw2.dispatch('install', {});
  await sw2.dispatch('activate', {});

  const noms = await state.caches.keys();
  assert(!noms.includes(ancienNom), 'l\'ancien cache de la coque n\'a pas été purgé');
  assert(noms.includes(sw2.CACHE), 'le nouveau cache de la coque est absent');
  assert(noms.includes(sw2.CACHE_LIBS), 'le cache des bibliothèques a été purgé à tort');
});

await test('Hors ligne : la coque de l\'application répond depuis le cache', async () => {
  const { state, sw } = await bootServiceWorker();
  state.offline = true;
  const res = await sw.dispatch('fetch', { request: request('./index.html') });
  assert(res, 'aucune réponse produite');
  assertEqual(res.status, 200, 'statut inattendu');
  const html = await res.text();
  assert(html.includes('Catalogue Électrique'), 'ce n\'est pas la page attendue');
});

await test('Hors ligne : les bibliothèques répondent depuis le cache', async () => {
  // C'est LE test de BUG-03 : avant, ces fichiers n'étaient dans aucune liste
  // de précache, donc l'export Excel et la visionneuse PDF étaient
  // inutilisables hors ligne.
  const { state, sw } = await bootServiceWorker();
  state.offline = true;
  for (const lib of ['./js/xlsx.full.min.js', './js/exceljs.min.js', './js/jszip.min.js',
                     './js/pdf.min.js', './js/pdf.worker.min.js']) {
    const res = await sw.dispatch('fetch', { request: request(lib) });
    assert(res, `${lib} — aucune réponse`);
    assertEqual(res.status, 200, `${lib} — statut inattendu`);
    assert((await res.text()).length > 1000, `${lib} — réponse vide`);
  }
});

await test("Les requêtes vers l'API métier ne passent jamais par le cache", async () => {
  const { state, sw } = await bootServiceWorker();
  const avant = state.requests.length;
  await sw.dispatch('fetch', { request: new Request('https://api.exemple.test/pullDatas') });
  const nouvelles = state.requests.slice(avant);
  // .includes() sur l'URL complète (issue CodeQL "Incomplete URL substring
  // sanitization") : une sous-chaîne matche aussi une URL PIÉGÉE qui
  // contiendrait celle-ci ailleurs (ex. .../?x=https://api.exemple.test/pullDatas
  // sur un tout autre domaine) — comparer origine + chemin exacts via URL()
  // est la seule façon fiable de vérifier "c'est vraiment CETTE requête".
  const requeteApiPresente = nouvelles.some((u) => {
    try {
      const parsed = new URL(u);
      return parsed.origin === 'https://api.exemple.test' && parsed.pathname === '/pullDatas';
    } catch {
      return false;
    }
  });
  assert(requeteApiPresente, 'la requête distante n\'est pas partie sur le réseau');
  const noms = await state.caches.keys();
  for (const nom of noms) {
    const c = await state.caches.open(nom);
    for (const cle of c._store.keys()) {
      assert(!cle.includes('api.exemple.test'), `une réponse de l'API a été mise en cache : ${cle}`);
    }
  }
});

console.log('');
if (failed) {
  console.log(`${RED}${failed} test(s) en échec${OFF}${DIM}, ${passed} réussi(s).${OFF}\n`);
  process.exit(1);
}
console.log(`${GREEN}${passed} tests réussis.${OFF}\n`);
