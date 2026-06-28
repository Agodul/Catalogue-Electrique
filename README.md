# Catalogue Électrique — SPI Engineering

## Structure du projet

```
catalogue/
├── index.html          ← HTML principal (squelette)
├── icon-512.png        ← Icône PWA
├── img_3dx.png         ← Logo 3DEXPERIENCE
├── css/
│   └── style.css       ← Tous les styles
└── js/
    ├── core.js         ← Stockage (IDB/localStorage), load/save, utilitaires
    ├── search.js       ← Recherche, filtres, scoring de pertinence
    ├── render.js       ← Rendu cartes, grille, page d'accueil
    ├── price.js        ← Gestion des prix, modale historique
    ├── modal.js        ← Formulaire produit, autocomplete, modale
    ├── extraction.js   ← Extraction fournisseurs (URL/HTML)
    └── settings.js     ← Paramètres, serveur, comparaison, PWA
```

## Ordre de chargement (important)
Les fichiers JS doivent être chargés dans cet ordre (défini dans index.html) :
core → search → price → extraction → render → modal → settings

## Déploiement GitHub Pages
1. Pousser ce dossier sur GitHub
2. Activer GitHub Pages sur la branche main
3. L'app est accessible sur https://[user].github.io/[repo]/

## Modifier un module
- **Ajouter un champ au formulaire** → `modal.js`
- **Changer le rendu des cartes** → `render.js`
- **Ajouter un fournisseur d'extraction** → `extraction.js`
- **Modifier l'historique des prix** → `price.js`
- **Changer les styles** → `css/style.css`
