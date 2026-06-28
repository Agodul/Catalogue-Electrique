#!/bin/bash
# build.sh — Régénère js/app.js depuis les fichiers sources dans js/modules/
# Usage : ./build.sh

MODULES_DIR="js/modules"
OUTPUT="js/app.js"

echo "🔨 Build Catalogue Électrique..."

# Ordre de concaténation (respecter les dépendances)
MODULES=(
  "core.js"
  "search.js"
  "price.js"
  "render.js"
  "modal.js"
  "extraction.js"
  "settings.js"
)

# Entête IIFE
echo "(function(){" > $OUTPUT
echo '"use strict";' >> $OUTPUT
echo "" >> $OUTPUT

for module in "${MODULES[@]}"; do
  if [ -f "$MODULES_DIR/$module" ]; then
    echo "// $(printf '=%.0s' {1..60})" >> $OUTPUT
    echo "// $module" >> $OUTPUT
    echo "// $(printf '=%.0s' {1..60})" >> $OUTPUT
    echo "" >> $OUTPUT
    cat "$MODULES_DIR/$module" >> $OUTPUT
    echo "" >> $OUTPUT
    echo "  ✅ $module"
  else
    echo "  ❌ $module introuvable"
  fi
done

# Fermeture IIFE
echo "})();" >> $OUTPUT

SIZE=$(du -sh $OUTPUT | cut -f1)
echo "✅ $OUTPUT généré ($SIZE)"
