#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
//  CHECK.MJS — Contrôles statiques du projet
//  Catalogue Électrique — SPI Engineering
// ══════════════════════════════════════════════════════════════════════════
//
// À lancer avant chaque déploiement :
//   node tools/check.mjs
//
// Sort en code 1 dès qu'un contrôle échoue, pour pouvoir être branché sur un
// hook git ou une CI plus tard. Volontairement SANS AUCUNE DÉPENDANCE (pas
// de package.json, pas de node_modules) : le projet est un site statique
// servi tel quel, y ajouter une chaîne d'outils npm pour cinq contrôles
// serait disproportionné.
//
// Ce que ça vérifie :
//   1. Syntaxe    — chaque script se parse (node --check)
//   2. Globales   — aucune variable de premier niveau déclarée deux fois
//                   (tous les scripts partagent UNE portée : voir index.html,
//                    aucun n'est un module ni encapsulé dans une IIFE)
//   3. Éléments   — chaque getElementById() vise un id qui existe vraiment
//   4. Précache   — la liste FILES de sw.js correspond au disque
//   5. CSP        — aucun gestionnaire d'événement inline ne subsiste
//   6. CSP        — l'empreinte du script inline correspond à son contenu
//
// ══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Ordre de chargement réel, lu depuis index.html plutôt que recopié ici :
// la détection de collisions ci-dessous n'a de sens que sur l'ordre réel, et
// une liste figée se désynchroniserait au premier script ajouté.
const APP_SCRIPTS = [...read('index.html').matchAll(/<script src="(js\/[^"]+)"/g)]
  .map((m) => m[1]);

let failures = 0;
const results = [];

function check(name, fn) {
  let problems;
  try {
    problems = fn() || [];
  } catch (e) {
    problems = [`le contrôle lui-même a échoué : ${e.message}`];
  }
  results.push({ name, problems });
  if (problems.length) failures++;
}

// ── 1. Syntaxe ───────────────────────────────────────────────────────────
check('Syntaxe des scripts', () => {
  const problems = [];
  for (const f of [...APP_SCRIPTS, 'sw.js', 'tools/check.mjs']) {
    try {
      execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'pipe' });
    } catch (e) {
      problems.push(`${f} — ${String(e.stderr || e.message).split('\n')[0]}`);
    }
  }
  return problems;
});

// ── Petit analyseur de portée de premier niveau ───────────────────────────
// Suffisant et sans dépendance : on retire commentaires, chaînes, littéraux
// gabarits et expressions régulières, puis on ne retient que les
// déclarations rencontrées à une profondeur d'accolades nulle.
function topLevelDeclarations(src) {
  const out = [];
  let depth = 0;     // accolades / parenthèses / crochets
  let line = 1;
  let i = 0;
  let lastSignificant = ''; // pour distinguer une division d'une regex
  const n = src.length;

  // Une déclaration ne compte que si elle commence une instruction ; on note
  // donc la profondeur au moment où le mot-clé est lu.
  while (i < n) {
    const c = src[i];

    if (c === '\n') { line++; i++; continue; }

    // Commentaires
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2;
      continue;
    }

    // Chaînes et gabarits
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') i++;
        else if (src[i] === '\n') line++;
        i++;
      }
      i++;
      lastSignificant = 'str';
      continue;
    }

    // Expression régulière : un « / » qui ne suit pas une valeur
    if (c === '/' && !/^(?:id|num|\)|\]|\}|str)$/.test(lastSignificant)) {
      i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) break;
        else if (src[i] === '\n') break; // pas une regex après tout
        i++;
      }
      i++;
      lastSignificant = 'str';
      continue;
    }

    if (c === '{' || c === '(' || c === '[') { depth++; i++; lastSignificant = c; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; lastSignificant = c; continue; }

    // Identifiant / mot-clé
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      const word = src.slice(i, j);

      if (depth === 0 && (word === 'var' || word === 'let' || word === 'const' ||
                          word === 'function' || word === 'class')) {
        // Nom(s) déclaré(s) : on lit ce qui suit jusqu'au « = », « ; » ou saut
        // de ligne. Suffisant ici — le code n'utilise pas la déstructuration
        // en portée globale.
        const rest = src.slice(j, j + 400);
        const m = rest.match(/^\s*(?:\*\s*)?([A-Za-z_$][\w$]*)/);
        if (m && m[1] !== 'function') out.push({ name: m[1], line, kind: word });
      }
      i = j;
      lastSignificant = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else)$/.test(word)
        ? 'kw' : 'id';
      continue;
    }

    if (/[0-9]/.test(c)) {
      while (i < n && /[\w.]/.test(src[i])) i++;
      lastSignificant = 'num';
      continue;
    }

    i++;
    if (!/\s/.test(c)) lastSignificant = c;
  }
  return out;
}

// ── 2. Collisions de variables globales ──────────────────────────────────
check('Unicité des variables globales', () => {
  const seen = new Map();
  for (const f of APP_SCRIPTS) {
    for (const d of topLevelDeclarations(read(f))) {
      if (!seen.has(d.name)) seen.set(d.name, []);
      seen.get(d.name).push(`${f}:${d.line}`);
    }
  }
  return [...seen.entries()]
    .filter(([, where]) => where.length > 1)
    .map(([name, where]) => `${name} déclarée ${where.length} fois — ${where.join(', ')}`);
});

// ── 3. Identifiants HTML référencés depuis le JS ─────────────────────────
check('Identifiants getElementById existants', () => {
  const html = read('index.html');
  const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

  // Ids créés dynamiquement par le JS : soit dans une chaîne de gabarit HTML
  // (id="…" / id='…'), soit par affectation (el.id = '…').
  const jsIds = new Set();
  for (const f of APP_SCRIPTS) {
    const src = read(f);
    for (const m of src.matchAll(/\bid=\\?["']([A-Za-z_][\w-]*)\\?["']/g)) jsIds.add(m[1]);
    for (const m of src.matchAll(/\.id\s*=\s*["']([A-Za-z_][\w-]*)["']/g)) jsIds.add(m[1]);
  }

  const problems = [];
  for (const f of APP_SCRIPTS) {
    const src = read(f).split('\n');
    src.forEach((line, i) => {
      for (const m of line.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)) {
        const id = m[1];
        if (!htmlIds.has(id) && !jsIds.has(id)) {
          problems.push(`${f}:${i + 1} — #${id} n'existe ni dans index.html ni créé en JS`);
        }
      }
    });
  }
  return problems;
});

// ── 4. Liste de précache du service worker ───────────────────────────────
const PRECACHE_EXT = /\.(js|css|html|webmanifest|png|ico|mp4|webm|svg|woff2?)$/i;
const PRECACHE_SKIP = new Set(['sw.js', 'tools', '.git', 'node_modules']);

export function walkAssets(dir = '', acc = []) {
  for (const entry of readdirSync(join(ROOT, dir)).sort()) {
    if (entry.startsWith('.') || PRECACHE_SKIP.has(entry)) continue;
    const rel = dir ? `${dir}/${entry}` : entry;
    if (PRECACHE_SKIP.has(rel)) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walkAssets(rel, acc);
    else if (PRECACHE_EXT.test(entry)) acc.push(rel);
  }
  return acc;
}

check('Liste de précache du service worker', () => {
  const sw = read('sw.js');
  const listed = new Set(
    [...sw.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '')
  );
  const onDisk = new Set(walkAssets());

  const problems = [];
  for (const f of listed) {
    if (!existsSync(join(ROOT, f))) problems.push(`${f} — listé dans sw.js mais absent du disque`);
  }
  for (const f of onDisk) {
    if (!listed.has(f)) problems.push(`${f} — présent sur le disque mais absent de sw.js`);
  }
  return problems;
});

// ── 5. Gestionnaires d'événements inline ─────────────────────────────────
// La CSP retire 'unsafe-inline' de script-src : tout on*="…" restant, qu'il
// soit écrit dans index.html ou construit dans une chaîne HTML côté JS, ne
// s'exécutera plus du tout dans le navigateur — en silence.
const INLINE_HANDLER = /\bon(?:click|error|load|change|input|submit|ended|focus|blur|keydown|keyup|mouseover|mouseout)\s*=\s*\\?["']/g;

check("Absence de gestionnaires d'événements inline", () => {
  const problems = [];
  for (const f of ['index.html', ...APP_SCRIPTS]) {
    read(f).split('\n').forEach((line, i) => {
      // Les commentaires en parlent (« remplace l'ancien onerror="…" ») sans en
      // contenir : les compter donnerait un échec impossible à faire passer
      // autrement qu'en cessant de documenter le correctif.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('<!--')) return;
      for (const m of line.matchAll(INLINE_HANDLER)) {
        problems.push(`${f}:${i + 1} — ${m[0].trim()} (bloqué par la CSP)`);
      }
    });
  }
  return problems;
});

// ── 6. Empreinte CSP du script inline ────────────────────────────────────
// script-src n'accepte plus 'unsafe-inline' : l'unique script inline (celui du
// splash, juste après <body>) n'est autorisé que par son sha256. Modifier ce
// script sans recalculer l'empreinte le fait taire SANS aucune erreur visible
// à part un message dans la console — le splash resterait affiché en plein
// écran par-dessus l'application. D'où ce contrôle, qui affiche directement la
// valeur à recopier.
check("Empreinte CSP du script inline", () => {
  const html = read('index.html');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  if (!csp) return ['aucune balise Content-Security-Policy trouvée dans index.html'];

  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);

  const declared = new Set([...csp[1].matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));

  if (/script-src[^;]*'unsafe-inline'/.test(csp[1])) {
    return ["script-src accepte 'unsafe-inline' — le durcissement a été annulé"];
  }

  const problems = [];
  for (const src of inline) {
    const hash = 'sha256-' + createHash('sha256').update(src, 'utf8').digest('base64');
    if (!declared.has(hash)) {
      problems.push(`script inline non autorisé — ajouter '${hash}' à script-src`);
    }
    declared.delete(hash);
  }
  for (const stale of declared) {
    problems.push(`'${stale}' déclarée dans la CSP mais ne correspond à aucun script inline`);
  }
  return problems;
});

// ── Rapport ──────────────────────────────────────────────────────────────
const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', OFF = '\x1b[0m';
console.log('');
for (const { name, problems } of results) {
  if (problems.length) {
    console.log(`${RED}✗${OFF} ${name} ${DIM}— ${problems.length} problème(s)${OFF}`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    console.log(`${GREEN}✓${OFF} ${name}`);
  }
}
console.log('');
if (failures) {
  console.log(`${RED}${failures} contrôle(s) en échec.${OFF}\n`);
  process.exit(1);
}
console.log(`${GREEN}Tous les contrôles passent.${OFF}\n`);
