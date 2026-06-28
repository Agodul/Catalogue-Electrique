# Catalogue Électrique — SPI Engineering

## Structure du projet

```
catalogue/
├── index.html              ← HTML principal
├── css/style.css           ← Tous les styles
├── js/
│   ├── app.js              ← Script compilé (NE PAS ÉDITER DIRECTEMENT)
│   └── modules/            ← Fichiers sources à éditer
│       ├── core.js         ← Stockage IDB, load/save, utilitaires
│       ├── search.js       ← Recherche, filtres, scoring
│       ├── price.js        ← Utilitaires prix + modale historique
│       ├── render.js       ← Rendu cartes, grille, home
│       ├── modal.js        ← Formulaire produit, autocomplete
│       ├── extraction.js   ← Extraction fournisseurs URL/HTML
│       └── settings.js     ← Paramètres, serveur, PWA, Quoi de neuf
├── img/
│   ├── img_3dx.png         ← Logo 3DEXPERIENCE
│   └── icon-512.png        ← Icône PWA (copie)
├── build.sh                ← Script de build (concatène les modules)
├── manifest.webmanifest    ← Manifest PWA
├── sw.js                   ← Service Worker
├── favicon.ico
├── icon-192.png
├── icon-512.png
└── apple-touch-icon.png
```

## Workflow d'édition

1. Modifier le fichier dans `js/modules/` correspondant :
   - Nouveau champ formulaire → `modal.js`
   - Rendu des cartes → `render.js`
   - Nouveau fournisseur → `extraction.js`
   - Prix et historique → `price.js`
   - Paramètres, PWA → `settings.js`

2. Régénérer `app.js` :
   ```bash
   ./build.sh
   ```

3. Pousser sur GitHub → GitHub Pages se met à jour automatiquement.

## Quel module modifier selon la tâche

| Tâche | Fichier |
|-------|---------|
| Ajouter un champ produit | `modal.js` |
| Changer l'affichage des cartes | `render.js` |
| Ajouter un fournisseur d'extraction | `extraction.js` |
| Modifier la gestion des prix | `price.js` |
| Changer la recherche/filtres | `search.js` |
| Modifier les paramètres serveur | `settings.js` |
| Changer le stockage localStorage/IDB | `core.js` |
| Modifier les styles | `css/style.css` |
