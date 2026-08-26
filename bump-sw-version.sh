#!/bin/bash
# Tamponne automatiquement sw.js avec un nouveau numéro de version, basé sur
# la date/heure courante plutôt qu'un compteur à incrémenter à la main
# (source d'oublis : le service worker ne se met à jour pour les visiteurs
# que si le contenu de sw.js change d'un déploiement à l'autre — voir le
# commentaire "CACHE" en haut de sw.js).
#
# À lancer une fois, juste avant chaque déploiement (avant "git push") si un
# fichier précaché a changé (n'importe quel .js/.css/.html listé dans FILES
# dans sw.js). Aucun effet si rien d'autre n'a changé : ça ne fait que
# réécrire la ligne de version, à committer avec le reste.
#
# Usage :
#   ./bump-sw-version.sh

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f sw.js ]; then
  echo "Erreur : sw.js introuvable dans $(pwd)" >&2
  exit 1
fi

NEW_VERSION="v$(date +%Y%m%d%H%M%S)"
OLD_LINE=$(grep -m1 '^const CACHE = ' sw.js || true)

if [ -z "$OLD_LINE" ]; then
  echo "Erreur : ligne 'const CACHE = ...' introuvable dans sw.js" >&2
  exit 1
fi

sed -i '' -E "s/^const CACHE = \"spi-catalogue-v[0-9]+\";/const CACHE = \"spi-catalogue-${NEW_VERSION}\";/" sw.js

echo "sw.js mis à jour :"
echo "  avant : ${OLD_LINE}"
echo "  après : $(grep -m1 '^const CACHE = ' sw.js)"
