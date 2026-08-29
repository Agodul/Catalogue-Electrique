#!/bin/bash
# Prépare sw.js pour un déploiement. Trois choses, dans cet ordre :
#
#   1. Régénère FILES et FILES_DEFERRED à partir du contenu RÉEL du disque.
#      Ces listes étaient recopiées à la main et avaient dérivé dans les deux
#      sens (un fichier inexistant réclamé, cinq bibliothèques oubliées) —
#      voir le commentaire en tête de sw.js.
#   2. Recalcule CACHE_LIBS à partir d'une empreinte du contenu des
#      bibliothèques : leur cache n'est purgé que si elles changent vraiment,
#      pas à chaque déploiement.
#   3. Tamponne CACHE avec la date/heure courante — c'est le changement de
#      cette valeur qui déclenche la mise à jour chez les visiteurs (voir le
#      commentaire "CACHE" en haut de sw.js et js/pwa.js).
#
# À lancer une fois, juste avant chaque déploiement (avant "git push"), puis
# committer sw.js avec le reste.
#
# Usage :
#   ./bump-sw-version.sh

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f sw.js ]; then
  echo "Erreur : sw.js introuvable dans $(pwd)" >&2
  exit 1
fi

# ── Outil d'empreinte : shasum sur macOS, sha1sum sur la plupart des Linux ──
if command -v shasum >/dev/null 2>&1; then
  SHA="shasum"
elif command -v sha1sum >/dev/null 2>&1; then
  SHA="sha1sum"
else
  echo "Erreur : ni shasum ni sha1sum disponibles" >&2
  exit 1
fi

# ── 1. Inventaire du disque ────────────────────────────────────────────────
# Tout ce que le service worker doit pouvoir servir hors ligne, SAUF sw.js
# lui-même (jamais mis en cache par lui-même) et tools/ (outillage de
# développement, jamais déployé). Trié pour que deux exécutions successives
# produisent le même fichier, donc un diff git vide s'il n'y a rien de neuf.
#
# Les .min.js vont dans FILES_DEFERRED : ce sont les bibliothèques lourdes
# auto-hébergées (PDF.js, SheetJS, ExcelJS, JSZip), téléchargées après
# l'activation plutôt que pendant l'installation.
ALL_FILES=$(find . \
    \( -name .git -o -name node_modules -o -name tools \) -prune -o \
    -type f \( -name '*.js'   -o -name '*.css'  -o -name '*.html' \
            -o -name '*.webmanifest' -o -name '*.png' -o -name '*.ico' \
            -o -name '*.svg'  -o -name '*.mp4'  -o -name '*.webm' \
            -o -name '*.woff' -o -name '*.woff2' \) -print \
  | sed 's|^\./||' \
  | grep -v '^sw\.js$' \
  | grep -v '^\.' \
  | grep -v '/\.' \
  | LC_ALL=C sort)

SHELL_FILES=$(echo "$ALL_FILES" | grep -v '\.min\.js$' || true)
LIB_FILES=$(echo "$ALL_FILES" | grep    '\.min\.js$' || true)

if [ -z "$SHELL_FILES" ]; then
  echo "Erreur : aucun fichier trouvé à mettre en cache — mauvais dossier ?" >&2
  exit 1
fi

# ── 2. Nouvelles valeurs ───────────────────────────────────────────────────
NEW_VERSION="v$(date +%Y%m%d%H%M%S)"

# Empreinte du CONTENU des bibliothèques (pas de leur date de modification :
# un simple "git checkout" la change sans que le fichier bouge).
if [ -n "$LIB_FILES" ]; then
  LIBS_HASH=$(echo "$LIB_FILES" | tr '\n' '\0' | xargs -0 $SHA | $SHA | cut -c1-16)
else
  LIBS_HASH="0000000000000000"
fi

# ── 3. Réécriture de sw.js ─────────────────────────────────────────────────
# Fichier temporaire + mv plutôt que "sed -i" : la syntaxe de l'option -i
# diffère entre BSD (macOS, qui exige un argument) et GNU (Linux, qui le
# refuse). L'ancienne version utilisait `sed -i ''`, qui échouait sur Linux —
# et comme le script tourne sous `set -e`, il s'arrêtait là, sans version
# incrémentée, donc sans mise à jour chez les visiteurs, et en silence.
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

# Remplace le contenu entre "// >>> NOM >>>" et "// <<< NOM <<<" par un
# tableau JavaScript construit à partir de la liste passée sur l'entrée
# standard. Les marqueurs eux-mêmes sont conservés.
# Les listes traversent awk avec « | » en séparateur, pas un saut de ligne :
# l'awk de BSD (macOS) refuse un saut de ligne dans une variable passée par
# -v (« newline in string »), là où celui de GNU l'accepte.
awk -v shell_files="$(echo "$SHELL_FILES" | tr '\n' '|')" \
    -v lib_files="$(echo "$LIB_FILES" | tr '\n' '|')" \
    -v version="$NEW_VERSION" \
    -v libs_hash="$LIBS_HASH" '
  function emit_array(name, list,    n, i, parts) {
    print "const " name " = ["
    if (name == "FILES") print "  \"./\","
    n = split(list, parts, "|")
    for (i = 1; i <= n; i++) if (parts[i] != "") print "  \"./" parts[i] "\","
    print "];"
  }
  /^\/\/ >>> FILES >>>$/            { print; emit_array("FILES", shell_files);        skip = 1; next }
  /^\/\/ <<< FILES <<<$/            { print; skip = 0; next }
  /^\/\/ >>> FILES_DEFERRED >>>$/   { print; emit_array("FILES_DEFERRED", lib_files);  skip = 1; next }
  /^\/\/ <<< FILES_DEFERRED <<<$/   { print; skip = 0; next }
  /^\/\/ >>> CACHE_LIBS >>>$/       { print; print "const CACHE_LIBS = \"spi-catalogue-libs-" libs_hash "\";"; skip = 1; next }
  /^\/\/ <<< CACHE_LIBS <<<$/       { print; skip = 0; next }
  /^const CACHE = "spi-catalogue-v[0-9]+";$/ { print "const CACHE = \"spi-catalogue-" version "\";"; next }
  skip { next }
  { print }
' sw.js > "$TMP"

# Garde-fou : ne jamais écraser sw.js par un fichier vide ou tronqué (awk qui
# échoue, marqueur disparu...).
if [ ! -s "$TMP" ] || ! grep -q '^const CACHE = ' "$TMP"; then
  echo "Erreur : la réécriture de sw.js a échoué, fichier laissé intact." >&2
  exit 1
fi

cat "$TMP" > sw.js

echo "sw.js mis à jour :"
echo "  version    : $(grep -m1 '^const CACHE = ' sw.js | sed 's/.*"\(.*\)".*/\1/')"
echo "  coque      : $(echo "$SHELL_FILES" | grep -c . ) fichiers"
echo "  librairies : $(echo "$LIB_FILES" | grep -c . ) fichiers — $(grep -m1 '^const CACHE_LIBS = ' sw.js | sed 's/.*"\(.*\)".*/\1/')"

# Contrôles statiques dans la foulée, s'ils sont disponibles : c'est le
# moment le plus utile pour attraper une liste désynchronisée ou une variable
# globale déclarée deux fois — juste avant de committer.
if command -v node >/dev/null 2>&1; then
  if [ -f tools/check.mjs ]; then
    echo ""
    node tools/check.mjs
  fi
  if [ -f tools/test-sw.mjs ]; then
    echo "Service worker :"
    node tools/test-sw.mjs
  fi
fi
