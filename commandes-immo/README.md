# Outil de création de commandes IMMO — SPI / SPIL

Application locale, 100 % HTML / CSS / JavaScript. Aucune installation, aucun
serveur, aucun accès réseau : on ouvre `index.html` dans Edge ou Chrome.

---

## 1. Mise en route sur le PC Windows

1. Copier **tout le dossier** sur le PC (par exemple `C:\Commandes IMMO\`).
2. Double-cliquer sur `index.html` (ou faire *Ouvrir avec* → Microsoft Edge).
3. L'outil s'ouvre sur l'écran **Configuration**. Quatre choses à faire une fois :
   - **Emplacement des fichiers** : cliquer sur *Choisir un dossier de travail*
     (voir § 5 si le bouton refuse), puis y créer un sous-dossier `modeles`
     et y copier `Modele_SPI.docx` et `Modele_SPIL.docx`.
   - **Modèles Word** : si vous n'utilisez pas de dossier de travail, charger
     les deux fichiers ici. **Sans modèle, aucune commande ne peut être
     produite** (voir § 4).
   - **Sites** : cocher, pour chacun des 10 sites, la ou les entités dont il
     relève — un site peut être **à la fois SPI et SPIL**. Puis saisir les
     adresses de livraison manquantes. Seuls **Vendin** et **Saint-Vulbas**
     sont pré-remplis (les seules adresses présentes dans les masques Word
     fournis). Un site sans adresse reste utilisable comme site de commande,
     mais n'apparaît pas dans la liste des adresses de livraison ; un site
     sans aucune entité cochée n'apparaît, lui, dans aucune liste.
   - **Tampon de signature** : charger l'image du tampon.

Créer un raccourci vers `index.html` sur le bureau pour l'usage quotidien.

---

## 2. Créer une commande

**Nouvelle commande** → entité, site, fournisseur, commercial, date,
références, offre de prix, montant, délai, règlement.

- Le **fournisseur** est choisi dans le carnet, puis le **commercial** parmi
  ceux enregistrés pour ce fournisseur. Les deux listes sont chaînées : tant
  qu'aucun fournisseur n'est retenu, la liste des commerciaux reste inactive.
  Le bouton **+** à côté de chaque liste ajoute une entrée au carnet sans
  quitter le formulaire.
- **C'est le nom du commercial, et lui seul, qui figure sur le document**, à
  la ligne « A/To ». La raison sociale du fournisseur reste dans l'outil, pour
  le classement, la recherche et les filtres.

- Le **numéro** est calculé automatiquement : `JJMMAAAA` + code site +
  initiales du signataire, par exemple `07092026VENDINVV`. Une deuxième
  commande le même jour sur le même site reçoit le suffixe `1`, puis `2`…
- L'**adresse de livraison** se choisit dans une liste déroulante qui reprend
  les adresses de tous les sites configurés, en deux groupes : les sites de
  l'entité de la commande, puis les autres. Celle du
  site de la commande est proposée par défaut et suit automatiquement le site
  tant qu'on n'en a pas choisi une autre ; une fois un autre site retenu, il
  est conservé même si le site de la commande change. Une commande SPI peut
  ainsi être livrée sur un site SPIL, ce que la liste des commandes signale
  par la mention « livré à … ».
- L'**adresse de facturation** est celle de l'entité. Rien à ressaisir.
- Les **captures d'écran** s'ajoutent par glisser-déposer, par `Ctrl+V`, ou en
  cliquant la zone pointillée. Les boutons **Ajouter du texte** et **Ajouter
  un tableau** insèrent respectivement un paragraphe de texte libre ou un
  tableau au même titre — captures, texte et tableaux se mélangent dans une
  seule liste, réordonnable (flèches) et modifiable (clic sur un bloc pour
  le rééditer, croix pour le retirer). L'éditeur de texte propose gras,
  italique, souligné, couleur, taille, alignement (gauche/centré/droite/
  justifié) et « Effacer la mise en forme » (retire gras/italique/souligné/
  couleur/taille de la sélection, sans toucher à l'alignement — comme dans
  Word), comme un traitement de texte classique ; cette mise en forme
  est reprise telle quelle dans le .docx et le .pdf produits (voir
  `{@texteRiche}`, § 9). L'éditeur de tableau permet d'ajouter/retirer des
  lignes et colonnes, et de glisser une frontière à la souris pour ajuster
  une largeur de colonne ou une hauteur de ligne, comme dans Excel (double-
  clic sur la frontière basse d'une ligne pour l'ajuster automatiquement à
  son contenu) — chaque cellule a, comme le texte libre, gras/italique/
  souligné/couleur/taille et un bouton « Effacer » pour retirer cette mise
  en forme, PLUS un alignement horizontal (gauche/centre/droite) ET vertical
  (haut/milieu/bas) propre à la cellule, comme les deux groupes du ruban
  Alignement d'Excel, avec son propre bouton « Réinitialiser » qui remet la
  cellule active à son alignement par défaut (voir `{@tableauRiche}`, § 9).
- Le document produit tient en **deux parties** : le courrier d'introduction
  suivi des captures et du texte libre, dans l'ordre affiché, puis le
  récapitulatif (montant, délai, règlement, adresses, signature) qui
  commence **toujours sur une nouvelle page**, quel que soit le contenu
  au-dessus.
- **Générer le .docx** et **Générer le .pdf** sont deux actions séparées : on
  ne reproduit que le format dont on a besoin. Les mêmes boutons existent dans
  la liste, pour regénérer une commande déjà enregistrée.
- **Signer et figer la commande** insère le tampon et rend la commande non
  modifiable, puis propose un choix : **Word**, **PDF** ou **les deux**.

---

## 3. Où vont les fichiers

Avec un dossier de travail, l'outil crée un sous-dossier par commande :

```
<dossier de travail>/
  modeles/
    Modele_SPI.docx          ← modèles lus par l'outil
    Modele_SPIL.docx
  07092026VENDINVV/
    Commande_07092026VENDINVV.docx
    Commande_07092026VENDINVV.pdf
    captures/01.png, 02.png …
  07092026VENDINVV1/
    …
```

Sans dossier de travail, les fichiers produits partent dans les
**téléchargements** du navigateur. C'est parfaitement fonctionnel, simplement
moins rangé.

> Si vous choisissez « Les deux » après une signature, le `.docx` et le
> `.pdf` partent coup sur coup : Edge et Chrome affichent la première fois
> un bandeau **« Ce site tente de télécharger plusieurs fichiers »**.
> Répondre *Autoriser*.

---

## 4. Personnaliser les documents

**Les modèles ne sont pas dans le code : ce sont deux vrais fichiers `.docx`**,
un par entité. Pour changer une formulation, une marge, le logo ou une mention
légale, il suffit de les ouvrir dans Word et de les enregistrer. Rien à
recompiler, aucun outil de développement nécessaire.

Deux façons de les mettre en service :

| | Où | Prise en compte |
|---|---|---|
| **Dossier de travail** *(conseillé)* | `<dossier>/modeles/Modele_SPI.docx` | relu à **chaque** génération : une modification dans Word est active aussitôt |
| **Chargement manuel** | Configuration › Modèles Word | conservé dans la base locale ; à recharger après chaque modification |

L'écran **Configuration › Modèles Word** indique pour chaque entité la
provenance du modèle, sa date et sa taille, et **signale les balises
manquantes** si une modification en a supprimé une par mégarde.

### Balises disponibles dans les modèles

| Balise | Contenu |
|---|---|
| `{signataireNom}` `{signataireFonction}` `{signataireTel}` `{signataireFax}` | signataire |
| `{destinataire}` | nom du commercial — c'est lui qui est adressé |
| `{copies}` `{date}` `{references}` `{numero}` | en-tête du courrier |
| `{offreNumero}` `{offreDate}` | offre de prix du fournisseur |
| `{montant}` `{delai}` `{reglement}` | conditions |
| `{factNom}` + boucle `{#factLignes}{ligne}{/factLignes}` | adresse de facturation |
| `{livNom}` + boucle `{#livLignes}{ligne}{/livLignes}` | adresse de livraison |
| boucle `{#blocs}{#estImage}{%data}{/estImage}{#estTexte}{@texteRiche}{/estTexte}{#estTableau}{@tableauRiche}{/estTableau}{/blocs}` | captures d'écran, texte libre et tableaux, mélangés dans l'ordre affiché |
| boucle `{#signature}{%data}{/signature}` | tampon (uniquement si signée) |

`{#blocs}` a remplacé `{#captures}` le 8 septembre 2026, pour permettre
d'intercaler du texte libre entre les captures (voir plus haut). Chaque
élément de la boucle est soit une image (`estImage` vrai, `data` porte
l'image), soit un paragraphe de texte (`estTexte` vrai). Un modèle qui
n'aurait que l'ancienne balise `{#captures}` continuera de fonctionner pour
les captures, mais sans pouvoir afficher de texte libre : voir § 9 pour la
mise à jour directe dans Word.

`{@texteRiche}` (balise dite « brute », préfixée `@`) porte la mise en forme
choisie dans l'éditeur (gras, italique, souligné, couleur, taille — bouton
« Ajouter du texte » d'une commande) : elle remplace tout le paragraphe qui
la contient par le XML Word correspondant, un `<w:p>` par ligne tapée dans
l'éditeur. Un modèle qui n'aurait que l'ancienne balise simple `{texte}`
continue de fonctionner : le texte s'affiche, mais sans sa mise en forme
(gras/couleur/etc. perdus, pas le contenu) — voir § 9 pour la mise à jour
vers `{@texteRiche}`.

`{@tableauRiche}` (même principe, balise brute) porte un tableau créé avec
le bouton « Ajouter un tableau » d'une commande — colonnes de largeur égale
par défaut, avec la même mise en forme par cellule que le texte libre
(gras/italique/souligné/couleur/taille), plus un alignement horizontal ET
vertical propre à chaque cellule. Un modèle qui n'aurait pas encore cette
balise ne peut simplement pas afficher de tableau — pas d'ancienne balise de
repli ici, la fonctionnalité étant plus récente.

Deux balises facultatives sont également fournies si vous souhaitez les
utiliser : `{fournisseurNom}` (raison sociale) et `{commercial}` (identique
à `{destinataire}`). `{fournisseur}` reste acceptée comme ancien nom de
`{destinataire}`, pour les modèles retouchés avant l'ajout du commercial.

Le saut de page du récapitulatif est l'attribut Word « Saut de page avant »,
posé sur le paragraphe « L'ensemble livré au prix HT… ».

---

## 5. Ce que le navigateur autorise — à vérifier sur le PC

Une page ouverte directement depuis un fichier (`file://`) n'a pas tous les
droits d'une page servie en `http`. Selon la version d'Edge/Chrome et la
politique du poste, trois mécanismes peuvent être bloqués :

| Mécanisme | À quoi il sert | S'il est bloqué |
|---|---|---|
| IndexedDB | conserver commandes, configuration et modèles | repli sur localStorage, puis mémoire seule |
| localStorage | idem, en plus limité (~5 Mo), sans les modèles | repli sur mémoire seule |
| Accès aux dossiers | dossier par commande, et lecture des modèles | repli sur les téléchargements et le chargement manuel |

**L'outil teste les trois au démarrage** et s'adapte tout seul, sans action
nécessaire dans le cas normal. Seul le cas dégradé est signalé, par un
bandeau rouge en haut de l'écran au démarrage : **« Aucun stockage
persistant… »**. Ça veut dire que rien n'est conservé à la fermeture de
l'onglet. Deux solutions :

- exporter régulièrement la base (menu **⋮ › Exporter la base**), ou
- servir le dossier en `http://localhost` plutôt que de l'ouvrir en `file://`,
  ce qui débloque les trois mécanismes d'un coup.

Une sauvegarde exportée se recharge par **Importer une base**.

---

## 6. Le PDF n'est pas une conversion du Word

Un navigateur ne sait pas convertir un `.docx` en `.pdf` sans serveur ni
logiciel installé. Le PDF est donc **reconstruit** avec pdf-lib.

Il n'est pas figé pour autant : tout ce qui peut être lu dans le modèle l'est
à chaque génération — format de page, marges, taquets de tabulation, logo,
lignes de l'en-tête, filets, mentions légales du pied de page. **Modifier le
`.docx` modifie donc aussi le PDF.**

Restent propres au PDF, faute d'équivalent exact : l'enchaînement du corps du
document et l'interligne. Les polices Arial et Calibri sont rendues par
Helvetica, métriquement proche d'Arial : les retours à la ligne peuvent donc
différer légèrement sur les paragraphes longs. **Le `.docx` reste la
référence** ; si un PDF strictement identique au Word devient nécessaire, il
faudra l'exporter depuis Word.

---

## 7. Structure du dossier

```
index.html                  page unique de l'application
css/app.css             feuille de style (charte SPI)
css/polices.css         police et icônes de l'interface, encodées
js/utils.js          fonctions utilitaires
js/modeles.js        chargement des modèles .docx
js/stockage.js       détection et persistance locale
js/config.js         configuration, sites, entités
js/numerotation.js   attribution du numéro de commande
js/docx.js           assemblage du .docx
js/modele-infos.js   lecture de l'apparence dans le modèle
js/pdf.js            génération du .pdf
js/60-…80-…             écrans (liste, formulaire, configuration)
js/app.js            démarrage et navigation
lib/                        librairies locales, sans dépendance réseau
modeles/                    les deux modèles .docx à mettre en service — édités directement, voir § 9
```

Rien d'autre : pas de `tools/`, pas de `node_modules`, pas d'étape de
fabrication — exactement comme le Catalogue Électrique, l'outil est du
HTML/CSS/JS pur du premier au dernier fichier, y compris côté développeur.

---

## 8. Charte de style

L'habillage reprend la **charte SPI du Catalogue Électrique**, pour que les
deux outils internes se ressemblent : mêmes variables CSS (`--ink`,
`--copper`, `--paper`…), mêmes noms de classes (`.card`, `.tab-btn`,
`button.secondary`, `button.copper`), même échelle de z-index, mêmes points de
rupture, même convention pour les actions destructives (fond rose, bordure
`#FCA5A5`, mention « Cette opération est irréversible »). Le CSS est donc
transposable d'un projet à l'autre sans réécriture.

Deux adaptations, volontaires :

- **`.card`** ne porte ni `cursor:pointer` ni le survol « soulevé » de la
  charte : ici les cartes sont des panneaux de formulaire, pas des vignettes
  cliquables. Le comportement d'origine reste disponible sous
  `.card--clickable`.
- **Les icônes Tabler** sont posées en masque CSS à partir des SVG d'origine,
  et non via le webfont complet : 24 icônes pèsent 28 Ko contre 462 Ko pour la
  fonte entière. Le balisage reste celui de la charte,
  `<i class="ti ti-nom" aria-hidden="true"></i>`.

`css/polices.css` embarque la police et les icônes de l'interface. C'est
le seul fichier encodé qui subsiste : il ne concerne que l'habillage de
l'écran, jamais le contenu des documents, et l'encodage est ici nécessaire
car en `file://` un CDN est inaccessible et le chargement d'un `.woff2` voisin
n'est pas garanti. Si la police ne se charge pas, le repli est Calibri. C'est
un fichier statique comme les autres : pour ajouter une icône, encoder son
SVG en base64 (`base64 -i icone.svg`, sans rien installer) et ajouter la
règle `.ti-nom { -webkit-mask-image: url(data:image/svg+xml;base64,...); … }`
à la main, sur le modèle des règles déjà présentes dans le fichier.

---

## 9. Modèles Word — édités directement, aucun outil à part

`modeles/Modele_SPI.docx` et `modeles/Modele_SPIL.docx` sont la seule
référence : il n'y a plus de masque d'origine ni de script pour les
fabriquer — l'outil est du HTML/CSS/JS pur du premier au dernier fichier, y
compris côté développeur, exactement comme le Catalogue Électrique.

Pour un **simple ajustement de mise en page ou de texte** (marge, formulation,
mention légale…), ouvrez le `.docx` de `modeles/` dans Word, modifiez,
enregistrez — voir § 4.

Pour une **modification de la structure des balises** (ajouter/retirer une
zone comme `{#blocs}`, `{#factLignes}`…), c'est à la main dans Word : les
balises (`{#blocs}`, `{%data}`, `{@texteRiche}`…) sont du texte comme un
autre, tapées directement dans le paragraphe concerné — chaque balise de
boucle ou de condition (`{#xxx}`/`{/xxx}`) dans son propre paragraphe, vide à
part elle, pour que docxtemplater (option `paragraphLoop`, voir `js/
docx.js`) le retire proprement plutôt que de laisser une ligne blanche.
C'est ainsi qu'a été ajoutée la balise `{#blocs}` (texte libre mélangé aux
captures, voir § 4 et le tableau de balises plus haut).

`{@texteRiche}` (préfixe `@`) est une balise dite « brute » — elle ne remplit
pas un simple champ, elle **remplace tout le paragraphe qui la contient**
par du XML Word déjà mis en forme (gras, italique, souligné, couleur,
taille), construit par `js/docx.js` à partir de ce qui a été tapé
dans l'éditeur de la commande. C'est pour ça qu'elle doit rester **seule
dans son paragraphe**, comme les balises de boucle. Un modèle personnalisé
qui a gardé l'ancienne balise simple `{texte}` à cet endroit continue de
fonctionner (le contenu s'affiche), juste sans la mise en forme — pour la
récupérer, remplacez `{texte}` par `{@texteRiche}` au même endroit.
