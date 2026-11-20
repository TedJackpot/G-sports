# G-Sports Gabon

Plateforme nationale **gratuite** de découverte des sports et activités extrascolaires pour les jeunes (5 ans et plus) partout au Gabon. Mise en relation directe entre parents et clubs, coachs, associations, gymnases et organisateurs de stages et de camps. **Aucun paiement, abonnement, commission ni mise en avant payante.**

## Démarrage rapide

Prérequis : **Node.js 22.9 ou plus récent**. Dépendances : `postgres` (Supabase en production), `@electric-sql/pglite` (PostgreSQL embarqué pour le développement et les tests) et `@vercel/blob` (photos en production).

```bash
npm install
npm start                      # http://localhost:3000
npm test                       # 19 tests de bout en bout (base temporaire)
npm run create-admin -- admin@exemple.ga "MotDePasseSolide2026" "Nom"
npm run seed-demo              # ajoute 3 EXEMPLES FICTIFS clairement signalés
npm run remove-demo            # les supprime (ou bouton « Supprimer les exemples » dans /admin)
```

Au premier démarrage, la base `data/gsports.db` est créée avec les 9 provinces, 51 villes et localités, 9 familles et ~90 activités, et 6 modèles d'annonces. **Aucune annonce réelle n'est inventée** : une ville sans annonce affiche un message honnête invitant à inscrire un club ou un coach.

En local, un compte administrateur de développement a été créé ; ses identifiants sont dans `data/dev-credentials.txt` (fichier local, exclu de git). En production, créez votre propre administrateur avec `npm run create-admin`.

## Architecture

| Couche | Choix | Pourquoi |
|---|---|---|
| Serveur | Node.js `http` natif (`server/index.js`), exposé sur Vercel via `api/index.js` | Léger, coût nul, même code en local et en production |
| API | REST JSON (`server/api.js`) | Rôles visiteur / parent / professionnel / administrateur appliqués côté serveur |
| Base | **PostgreSQL** : Supabase (projet LINGORA, schéma séparé `gsports`) en production, PGlite en local | Même SQL partout ; sauvegardes gérées par Supabase |
| Photos | Disque en local, **Vercel Blob** en production | Stockage durable compatible serverless |
| Front | SPA en JavaScript natif (modules ES), sans build | Léger, rapide sur connexion limitée |
| SEO | Rendu serveur des balises `title`, description, Open Graph, JSON-LD (Event, SportsOrganization, BreadcrumbList), `sitemap.xml`, `robots.txt` | Pages indexables ; pages vides en `noindex` |
| PWA | `manifest.webmanifest`, `sw.js`, icônes, page hors connexion | Installable Android, iPhone, Windows, Mac |

```
server/   index.js (HTTP, statique, SEO, tâches)  template.html (gabarit de page)  api.js (routes)  db.js (schéma)  seed-data.js  util.js  mailer.js
api/      index.js (fonction Vercel)
public/   css/app.css  js/core.js  js/pages-public.js  js/pages-account.js  js/pages-admin.js  sw.js  manifest.webmanifest
scripts/  create-admin.js  seed-demo.js
test/     api.test.js
data/     gsports.db  uploads/  backups/  logs/  (non versionné)
```

## Fonctionnalités

- **Recherche** : ville, province, quartier, famille/activité, âge précis ou tranche (5–6 … 18+), tarif, gratuit, niveau, débutants, dates, inscriptions ouvertes, vacances, week-end, semaine, indoor/outdoor, type de structure, type d'annonce ; tri nouveautés / date d'inscription / date de début / tarif / popularité / proximité (position demandée ponctuellement, jamais enregistrée) ; vue cartes ou liste ; favoris (sur l'appareil sans compte, synchronisés avec compte).
- **Pages** : accueil (14 sections), explorer, recherche avancée, sports, extrascolaire, clubs & salles, coachs, stages, camps, annonces (onglets), calendrier (avec vacances scolaires saisies par l'admin), carte du Gabon (Leaflet + OpenStreetMap), fiches annonce / club / coach, favoris, publier, modèles, inscription parent et pro, connexion, espace parent, espace pro, tableau de bord, demandes, à propos, comment ça marche, sécurité, contact, FAQ, conditions, confidentialité, signalement, administration.
- **Annonces** : 11 types (activité, inscriptions saison, recrutement, stage, camp, journée découverte, portes ouvertes, séance d'essai, tournoi, programme ados, événement), formules tarifaires, photos, champs camp/stage (horaires, inclus/non inclus, repas, hébergement, transport, programme). Badges calculés : inscriptions ouvertes, bientôt, places limitées / complet (seulement si confirmé), gratuit, nouveau. **Expiration automatique** à la date de fin (ou 120 jours), renouvellement en un clic, brouillon, suspension, duplication.
- **Contact** : appel, WhatsApp, message, demande d'informations / de rendez-vous / de séance découverte / d'inscription, avec consentement explicite et confirmation « parent ou responsable légal ». Réponse du pro notifiée au parent.
- **Espace parent** : profils enfants (prénom + âge uniquement), suggestions par enfant, favoris, alertes (ville, famille, âge, type), demandes et réponses, notifications, paramètres, suppression du compte.
- **Espace pro** : profil club ou coach (installations, diplômes déclarés, zone, domicile/salle/extérieur, disponibilités, formules, vidéos), annonces, demandes, statistiques (vues, favoris, demandes, inscriptions en cours, annonces expirant bientôt), calendrier.
- **Administration** : validation des pros, modération des annonces, signalements, photos, catégories, provinces et villes, comptes, contenus de l'accueil, vacances scolaires, annonces éditoriales, notifications d'information, messages, statistiques, purge des exemples.

## Sécurité et protection des mineurs

- Aucun profil public d'enfant ; aucune messagerie entre un professionnel et un enfant ; demandes réservées aux parents (un compte pro ou admin ne peut pas en envoyer) ; âge seulement, jamais de date de naissance.
- Mots de passe hachés (scrypt), sessions en cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` en production), jetons stockés hachés.
- Protection CSRF (en-tête obligatoire + contrôle de l'origine), limitation de débit sur connexion, inscription, contact, signalement et téléversement, pots de miel anti-spam.
- En-têtes de sécurité : CSP stricte, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS en production.
- Toutes les valeurs affichées sont échappées ; validation stricte de chaque champ côté serveur.
- Images : compressées sur l'appareil (métadonnées et position GPS retirées), contrôle du type réel, 3 Mo max, consentement photo obligatoire pour publier.
- La validation d'un compte n'est jamais présentée comme une certification ; chaque fiche indique que les informations sont déclarées par le professionnel.


## Déploiement sur Vercel (Supabase + Vercel Blob)

Le dépôt est prêt pour Vercel : `vercel.json` sert `public/` en statique (CDN), envoie toutes les autres URL vers la fonction `api/index.js` (région Paris `cdg1`, la plus proche du Gabon) et programme une tâche quotidienne `/api/cron/daily` qui retire les annonces expirées et envoie les rappels.

Variables d'environnement du projet Vercel (jamais exposées au navigateur) :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL Supabase via le pooler (port 6543) avec le rôle dédié `gsports_app`, limité au schéma `gsports` |
| `BLOB_READ_WRITE_TOKEN` | Stockage des photos (ajouté automatiquement en reliant un Blob store au projet) |
| `SITE_URL` | Adresse publique, ex. `https://g-sports.vercel.app` (sitemap, Open Graph) |
| `CRON_SECRET` | Secret aléatoire protégeant la tâche quotidienne |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Crée le premier administrateur au démarrage si aucun n'existe (à retirer ensuite) |
| `TRUST_PROXY=1` | Lit l'adresse IP réelle pour la limitation des tentatives |

Le schéma est créé par la migration Supabase `gsports_schema_init` (fichier de référence : `server/schema.sql`). Au premier démarrage, les données de référence sont ajoutées automatiquement (provinces, villes, catégories, modèles). Les exemples fictifs ne sont **pas** ajoutés en production ; pour les ajouter : `DATABASE_URL=… npm run seed-demo`.

Remarques serverless : la limitation des tentatives est tenue en mémoire par instance (protection de base) ; les photos envoyées sont limitées à ~4 Mo par requête (elles sont compressées sur l'appareil avant l'envoi).

## Autre hébergement (serveur Node classique)

1. Héberger sur tout service qui exécute Node.js ≥ 22.9, avec `DATABASE_URL` pointant vers PostgreSQL (sinon base PGlite locale dans `data/pg`).
2. Définir les variables de `.env.example` (`NODE_ENV=production`, `SITE_URL`, `TRUST_PROXY=1` derrière un proxy) ; `npm start` charge `.env` s'il existe.
3. Servir en **HTTPS** (obligatoire pour l'installation PWA et les cookies sécurisés).
4. Créer l'administrateur, puis supprimer les exemples fictifs dès les premières vraies annonces.
5. À chaque mise à jour du front, incrémenter `VERSION` dans `public/sw.js` pour renouveler le cache des appareils.

## À valider avant le lancement

- **Liste des villes et coordonnées** : 51 communes et localités saisies à partir de données publiques générales, coordonnées approximatives. À compléter et vérifier dans l'administration (Provinces & villes).
- **Textes juridiques** (conditions, confidentialité) : modèles à faire valider au regard du droit gabonais de la protection des données.
- **Photos fournies** : vérifier les droits d'utilisation (certaines portent des logos de marques ou de fondations) et l'accord des personnes photographiées.
- **Emails** : aucun service payant n'est branché ; les emails sont écrits dans `data/outbox.log` en attendant un fournisseur gratuit (`server/mailer.js`). Les notifications in-app fonctionnent.
- **Notifications push** : préparées côté PWA mais non activées (nécessitent des clés VAPID côté serveur).
- **Mot de passe oublié** : actuellement via le formulaire de contact ; un lien de réinitialisation par email sera possible dès qu'un service d'email sera branché.

## Évolutions préparées

Avis et évaluations modérés, tournois et compétitions, calendrier annuel sportif, programme ambassadeurs, annuaire des équipements : le schéma (types d'annonce « tournoi » et « événement », signalements, modération, notifications) permet de les ajouter sans bloquer le lancement.
