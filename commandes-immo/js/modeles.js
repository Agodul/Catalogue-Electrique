/* =========================================================================
   modeles.js — chargement des modèles Word

   Les modèles ne sont PAS embarqués dans le code : ce sont de vrais fichiers
   .docx, que l'on doit pouvoir ouvrir dans Word, modifier et remettre en
   place sans rien recompiler.

   Chargé une fois depuis l'écran Configuration et réutilisé par toute
   l'équipe, sur n'importe quel poste (retour utilisateur : "le projet
   commande immo doit fonctionner avec le serveur du catalogue"). Stocké via
   les mêmes routes génériques que le reste des documents du Catalogue
   (/pushDocs, /pullDocs, /deleteDocs — voir serveur.js et refServeur
   ci-dessous), pas de table dédiée côté serveur. Plus de "dossier de
   travail" local (File System Access API, retour utilisateur : "ça ne doit
   plus exister") : sans connexion au serveur, la génération est bloquée
   avec un message explicite.
   ========================================================================= */
(function () {
  "use strict";

  const CODES = ["SPI", "SPIL"];
  const M = {
    /** { SPI: {octets, nom, taille, source}, ... } */
    charges: {},
  };

  const refServeur = (code) => `commandesImmoModele:${code}`;
  const nomFichierServeur = (code) => `Modele_${code}.docx`;

  /* ------------------------------------------------------------ Lecture */

  /** Charge (ou recharge) les deux modèles depuis le serveur. À appeler au
   *  démarrage, puis avant chaque génération pour reprendre un modèle
   *  remplacé entre-temps par un autre poste. */
  M.charger = async function () {
    for (const code of CODES) {
      let entree = null;

      if (typeof Serveur !== "undefined" && Serveur.connecte()) {
        try {
          const liste = await Serveur.requeteJSON(
            "/pullDocs?nofile=true&ref=" + encodeURIComponent(refServeur(code))
          );
          if (liste && liste.count) {
            const r = await Serveur.requete("/pullDocs?ref=" + encodeURIComponent(refServeur(code)));
            const octets = await r.arrayBuffer();
            entree = {
              octets,
              nom: liste.items[0].filename,
              taille: octets.byteLength,
              source: "serveur",
            };
          }
        } catch (e) {
          console.warn("modèle " + code + " : lecture serveur impossible", e);
        }
      }

      if (entree && !valide(entree.octets)) {
        console.warn("modèle " + code + " illisible, ignoré");
        entree = null;
      }
      M.charges[code] = entree;
    }
    return M.charges;
  };

  /** Vérifie sommairement qu'il s'agit bien d'un .docx exploitable. */
  function valide(octets) {
    try {
      const zip = new PizZip(new Uint8Array(octets));
      return !!zip.file("word/document.xml");
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------- Import */

  /** Envoie un modèle choisi par l'utilisateur sur le serveur du Catalogue,
   *  partagé ensuite par toute l'équipe. Lève une erreur parlante si le
   *  fichier n'est pas un document Word exploitable. Le nom envoyé au
   *  serveur est toujours le même pour un code donné (Modele_SPI.docx),
   *  quel que soit le nom du fichier local choisi : ça garantit un
   *  remplacement propre côté serveur plutôt qu'un doublon. */
  M.importer = async function (code, fichier) {
    const octets = await fichier.arrayBuffer();
    if (!valide(octets))
      throw new Error(
        "« " + fichier.name + " » n'est pas un document Word exploitable " +
        "(word/document.xml introuvable). Enregistrez-le au format .docx " +
        "depuis Word, pas .doc ni .dotx."
      );
    const manquantes = balisesManquantes(octets);
    const fd = new FormData();
    fd.append("ref", refServeur(code));
    fd.append("document", new Blob([octets], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }), nomFichierServeur(code));
    await Serveur.requete("/pushDocs", { method: "POST", body: fd });
    await M.charger();
    return { manquantes };
  };

  M.oublier = async function (code) {
    await Serveur.requete("/deleteDocs?ref=" + encodeURIComponent(refServeur(code)), { method: "DELETE" });
    await M.charger();
  };

  /* ------------------------------------------------------------- Accès */

  M.octets = function (code) {
    const e = M.charges[code];
    if (!e)
      throw new Error(
        "Aucun modèle Word pour l'entité " + code + ". Chargez-le dans " +
        "Configuration › Modèles Word."
      );
    return e.octets;
  };

  M.disponible = (code) => !!M.charges[code];
  M.etat = (code) => M.charges[code] || null;
  M.codes = () => CODES.slice();

  /* ------------------------------------------------- Contrôle des balises */

  /** Balises attendues par le générateur. Permet de prévenir tout de suite
   *  si un modèle retouché en a perdu une. */
  const BALISES = [
    "signataireNom", "signataireTel", "signataireFax", "signataireFonction",
    "copies", "date", "references", "numero",
    "offreNumero", "offreDate", "montant", "delai", "reglement",
    "factNom", "#factLignes", "livNom", "#livLignes", "#signature",
  ];

  // Le destinataire s'écrit {destinataire} ; {fournisseur} reste acceptée
  // pour les modèles retouchés avant l'ajout du nom de commercial. Pareil
  // pour {#blocs} (captures + texte libre, remplace {#captures} le 8
  // septembre 2026) : un modèle avec l'ancienne balise n'affiche pas le
  // texte libre mais reste utilisable, donc pas signalé comme incomplet.
  const EQUIVALENTS = [["destinataire", "fournisseur"], ["#blocs", "#captures"]];

  function balisesManquantes(octets) {
    let texte;
    try {
      texte = new PizZip(new Uint8Array(octets)).file("word/document.xml").asText();
    } catch (e) {
      return [];
    }
    // Word découpe un texte en plusieurs « runs » : on retire le balisage
    // avant de chercher, sinon « {montant} » peut apparaître coupé en deux.
    const nu = texte.replace(/<[^>]+>/g, "");
    const absentes = BALISES.filter((b) => !nu.includes("{" + b));
    for (const groupe of EQUIVALENTS) {
      if (!groupe.some((b) => nu.includes("{" + b))) absentes.push(groupe[0]);
    }
    return absentes;
  }

  M.balisesManquantes = balisesManquantes;

  window.Modeles = M;
})();
