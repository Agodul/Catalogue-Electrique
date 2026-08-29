# Outils de vérification

Ces deux scripts ne sont **pas déployés** : `bump-sw-version.sh` écarte le
dossier `tools/` de la liste de précache du service worker, et
`tools/check.mjs` le sait aussi. Ils ne servent qu'au poste de développement.

Aucune dépendance à installer — ni `package.json`, ni `node_modules`. Node
suffit.

## Avant chaque déploiement

```bash
./bump-sw-version.sh
```

Régénère `sw.js` (listes de précache depuis le disque, numéro de version,
empreinte des bibliothèques), **puis lance les deux scripts ci-dessous**.
C'est la seule commande à retenir. Elle sort en erreur si un contrôle échoue :
dans ce cas, corriger avant de committer.

## Les deux scripts, séparément

```bash
node tools/check.mjs
```

Six contrôles statiques :

| Contrôle | Ce qu'il attrape |
|---|---|
| Syntaxe | un fichier qui ne se parse plus |
| Variables globales | la même variable déclarée dans deux fichiers — tous les scripts partagent **une seule** portée (voir `index.html`) |
| Identifiants | un `getElementById('…')` qui vise un élément supprimé de `index.html` |
| Précache | `sw.js` et le disque qui ne disent plus la même chose |
| Gestionnaires inline | un `onclick="…"` / `onerror="…"` réintroduit — la CSP le bloquerait en silence |
| Empreinte CSP | le script inline du splash modifié sans recalcul de son `sha256` (le splash resterait alors affiché en plein écran) |

```bash
node tools/test-sw.mjs
```

Dix tests du service worker, exécutés hors navigateur dans un environnement
simulé. `sw.js` est le seul fichier dont une erreur ne se voit pas à l'écran :
elle ne se manifeste qu'en coupant le réseau, sur un appareil déjà installé,
plusieurs jours après le déploiement. Les tests couvrent l'installation, la
purge des anciens caches, le mode hors ligne (coque **et** bibliothèques), le
contournement des requêtes vers l'API métier, et le partage d'un lien depuis
le téléphone.
