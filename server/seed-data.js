'use strict';
// Données de référence initiales. Tout est modifiable ensuite depuis le panneau d'administration.
// Géographie : provinces et principales communes/localités du Gabon. Coordonnées approximatives
// (centre-ville) utilisées uniquement pour la carte. À compléter/valider par l'administrateur.

const PROVINCES = [
  { slug: 'estuaire', name: 'Estuaire', capital: 'Libreville' },
  { slug: 'haut-ogooue', name: 'Haut-Ogooué', capital: 'Franceville' },
  { slug: 'moyen-ogooue', name: 'Moyen-Ogooué', capital: 'Lambaréné' },
  { slug: 'ngounie', name: 'Ngounié', capital: 'Mouila' },
  { slug: 'nyanga', name: 'Nyanga', capital: 'Tchibanga' },
  { slug: 'ogooue-ivindo', name: 'Ogooué-Ivindo', capital: 'Makokou' },
  { slug: 'ogooue-lolo', name: 'Ogooué-Lolo', capital: 'Koulamoutou' },
  { slug: 'ogooue-maritime', name: 'Ogooué-Maritime', capital: 'Port-Gentil' },
  { slug: 'woleu-ntem', name: 'Woleu-Ntem', capital: 'Oyem' },
];

// [nom, province, lat, lng, mise en avant]
const CITIES = [
  ['Libreville', 'estuaire', 0.3901, 9.4544, 1],
  ['Owendo', 'estuaire', 0.2910, 9.5040, 1],
  ['Akanda', 'estuaire', 0.5050, 9.4330, 1],
  ['Ntoum', 'estuaire', 0.3900, 9.7610, 1],
  ['Kango', 'estuaire', 0.1700, 10.1200, 0],
  ['Cocobeach', 'estuaire', 1.0000, 9.5830, 0],
  ['Cap Estérias', 'estuaire', 0.6170, 9.3170, 0],
  ['Donguila', 'estuaire', 0.1800, 9.7100, 0],
  ['Franceville', 'haut-ogooue', -1.6333, 13.5833, 1],
  ['Moanda', 'haut-ogooue', -1.5667, 13.2000, 1],
  ['Mounana', 'haut-ogooue', -1.4083, 13.1583, 0],
  ['Okondja', 'haut-ogooue', -0.6550, 13.6750, 0],
  ['Léconi', 'haut-ogooue', -1.5900, 14.2400, 0],
  ['Bongoville', 'haut-ogooue', -1.4200, 13.6900, 0],
  ['Akiéni', 'haut-ogooue', -1.1900, 13.8800, 0],
  ['Boumango', 'haut-ogooue', -2.1700, 13.5300, 0],
  ['Bakoumba', 'haut-ogooue', -1.7300, 12.9900, 0],
  ['Ngouoni', 'haut-ogooue', -1.2900, 13.9500, 0],
  ['Onga', 'haut-ogooue', -1.6900, 14.1200, 0],
  ['Lambaréné', 'moyen-ogooue', -0.7000, 10.2333, 1],
  ['Ndjolé', 'moyen-ogooue', -0.1800, 10.7650, 0],
  ['Bifoun', 'moyen-ogooue', -0.3300, 10.3800, 0],
  ['Mouila', 'ngounie', -1.8667, 11.0556, 1],
  ['Ndendé', 'ngounie', -2.4000, 11.3600, 0],
  ['Fougamou', 'ngounie', -1.2200, 10.6000, 0],
  ['Mbigou', 'ngounie', -1.9000, 11.9300, 0],
  ['Mimongo', 'ngounie', -1.6300, 11.6000, 0],
  ['Lébamba', 'ngounie', -2.2000, 11.4800, 0],
  ['Mandji', 'ngounie', -1.7000, 10.4000, 0],
  ['Tchibanga', 'nyanga', -2.8500, 11.0333, 1],
  ['Mayumba', 'nyanga', -3.4330, 10.6500, 0],
  ['Moabi', 'nyanga', -2.4300, 10.9400, 0],
  ['Mabanda', 'nyanga', -2.6300, 11.4000, 0],
  ['Makokou', 'ogooue-ivindo', 0.5667, 12.8667, 1],
  ['Booué', 'ogooue-ivindo', -0.1000, 11.9400, 0],
  ['Ovan', 'ogooue-ivindo', 0.3000, 12.1700, 0],
  ['Mékambo', 'ogooue-ivindo', 1.0200, 13.9300, 0],
  ['Koulamoutou', 'ogooue-lolo', -1.1333, 12.4667, 1],
  ['Lastourville', 'ogooue-lolo', -0.8170, 12.7080, 0],
  ['Pana', 'ogooue-lolo', -1.6000, 12.6600, 0],
  ['Iboundji', 'ogooue-lolo', -1.0500, 11.8000, 0],
  ['Port-Gentil', 'ogooue-maritime', -0.7193, 8.7815, 1],
  ['Gamba', 'ogooue-maritime', -2.6500, 10.0000, 1],
  ['Omboué', 'ogooue-maritime', -1.5700, 9.2600, 0],
  ['Setté Cama', 'ogooue-maritime', -2.5300, 9.7600, 0],
  ['Oyem', 'woleu-ntem', 1.6000, 11.5833, 1],
  ['Bitam', 'woleu-ntem', 2.0833, 11.5000, 1],
  ['Mitzic', 'woleu-ntem', 0.7833, 11.5500, 0],
  ['Minvoul', 'woleu-ntem', 2.1500, 12.1300, 0],
  ['Médouneu', 'woleu-ntem', 0.9500, 10.7800, 0],
  ['Éboro', 'woleu-ntem', 2.1700, 11.3200, 0],
];

// Groupes et catégories d'activités : [slug, nom, icône(emoji)], activités
const CATEGORY_GROUPS = [
  { slug: 'sports-collectifs', name: 'Sports collectifs', icon: '⚽', color: '#16B8C5', image: 'football-entrainement', kind: 'sport', items: ['Football', 'Basketball', 'Volleyball', 'Handball', 'Rugby', 'Futsal', 'Baseball et softball', 'Hockey', 'Sports collectifs divers'] },
  { slug: 'sports-individuels', name: 'Sports individuels', icon: '🎾', color: '#0E8A9A', image: 'multisport', kind: 'sport', items: ['Tennis', 'Tennis de table', 'Badminton', 'Athlétisme', 'Course', 'Musculation', 'Marche sportive', 'Natation', 'Plongée', 'Gymnastique', 'Trampoline', 'Escalade', 'Cyclisme', 'Skateboard', 'Roller', 'Arts du cirque'] },
  { slug: 'arts-martiaux', name: 'Arts martiaux & combat encadré', icon: '🥋', color: '#102C46', image: 'arts-martiaux-natation', kind: 'sport', items: ['Judo', 'Karaté', 'Taekwondo', 'Boxe éducative', 'Kickboxing', 'Lutte', 'Aïkido', 'Jiu-jitsu', 'Self-défense jeunes'] },
  { slug: 'danse', name: 'Danse & expression corporelle', icon: '💃', color: '#E5487A', image: null, kind: 'loisir', items: ['Danse classique', 'Hip-hop', 'Afro-dance', 'Danse contemporaine', 'Ballet', 'Danses traditionnelles', 'Zumba Kids', 'Chorégraphie', 'Expression corporelle', 'Salsa et danses de couple'] },
  { slug: 'aquatique', name: 'Activités aquatiques', icon: '🏊', color: '#1F8FE0', image: 'natation-groupe', kind: 'sport', items: ['Natation débutant', 'Natation perfectionnement', 'Natation compétition', 'Aquagym jeunes', 'Aquagym adultes', 'Initiation aux activités nautiques', 'Stages aquatiques'] },
  { slug: 'arts', name: 'Activités artistiques', icon: '🎨', color: '#9B5DE5', image: null, kind: 'loisir', items: ['Dessin', 'Peinture', 'Sculpture', 'Théâtre', 'Improvisation', 'Chant', 'Musique', 'Piano', 'Guitare', 'Batterie', 'Percussions', 'Ateliers créatifs'] },
  { slug: 'educatif', name: 'Éducatif & extrascolaire', icon: '🤖', color: '#2D9D5B', image: null, kind: 'educatif', items: ['Informatique', 'Programmation', 'Robotique', 'Échecs', 'Sciences', 'Lecture', 'Langues', 'Soutien scolaire', 'Mathématiques', 'Ateliers de découverte', 'Orientation et métiers'] },
  { slug: 'nature', name: 'Nature & aventure', icon: '🌿', color: '#3E7D2E', image: 'exploration-nature', kind: 'loisir', items: ['Randonnée', 'Camping encadré', 'Découverte de la nature', 'Camps de vacances', 'Activités de plage', 'Excursions', 'Initiation survie encadrée', 'Activités écologiques', 'Observation de la faune', 'Découverte du patrimoine'] },
  { slug: 'bien-etre', name: 'Bien-être & développement', icon: '🧘', color: '#FFB83E', image: null, kind: 'loisir', items: ['Yoga enfants', 'Yoga adultes', 'Fitness', 'Remise en forme', 'Pilates', 'Relaxation', 'Respiration', 'Motricité', 'Coordination', 'Confiance en soi', 'Concentration'] },
];

// Modèles d'annonces (exemples de structure, jamais publiés comme offres réelles)
const TEMPLATES = [
  {
    slug: 'football-jeunes',
    title: 'Football jeunes – Initiation et perfectionnement',
    activity: 'Football', city_hint: 'Libreville', age_min: 6, age_max: 16, level: 'debutant,intermediaire', kind: 'activite',
    description: "Séances d'initiation et de perfectionnement au football pour les jeunes, encadrées par des éducateurs. Travail technique, jeu collectif et valeurs du sport.",
    objectives: ['Technique', 'Dribble', 'Passe', 'Coordination', 'Jeu collectif', 'Respect et esprit sportif'],
  },
  {
    slug: 'karate-enfants',
    title: 'Karaté enfants',
    activity: 'Karaté', city_hint: 'Oyem', age_min: 5, age_max: 14, level: 'debutant', kind: 'activite',
    description: "Cours de karaté adaptés aux enfants : discipline, coordination et confiance en soi, dans un cadre bienveillant et sécurisé.",
    objectives: ['Discipline', 'Coordination', 'Respect', 'Concentration', 'Technique', 'Condition physique'],
  },
  {
    slug: 'camp-multisport',
    title: 'Camp multisport vacances',
    activity: 'Camps de vacances', city_hint: 'Port-Gentil', age_min: 7, age_max: 15, level: 'debutant', kind: 'camp', duration: '5 jours',
    description: "Une semaine de découverte sportive pendant les vacances : sports collectifs, jeux, course et activités de groupe.",
    objectives: ['Football', 'Basketball', 'Jeux collectifs', 'Course', 'Initiation', 'Activités de groupe'],
  },
  {
    slug: 'natation-debutant',
    title: 'Natation débutant – Apprendre à nager',
    activity: 'Natation débutant', city_hint: '', age_min: 5, age_max: 12, level: 'debutant', kind: 'activite',
    description: "Apprentissage progressif de la natation : aisance aquatique, flottaison, respiration, premiers déplacements. Encadrement par un maître-nageur.",
    objectives: ['Aisance aquatique', 'Flottaison', 'Respiration', 'Battements de jambes', 'Sécurité dans l\'eau'],
  },
  {
    slug: 'stage-basket-vacances',
    title: 'Stage de basketball pendant les vacances',
    activity: 'Basketball', city_hint: '', age_min: 8, age_max: 17, level: 'debutant,intermediaire', kind: 'stage',
    description: "Stage intensif de basketball : fondamentaux, dribble, tir, défense et matchs en fin de semaine.",
    objectives: ['Dribble', 'Tir', 'Passes', 'Défense', 'Jeu en équipe'],
  },
  {
    slug: 'journee-decouverte',
    title: 'Journée découverte / Portes ouvertes',
    activity: '', city_hint: '', age_min: 5, age_max: 18, level: 'debutant', kind: 'decouverte',
    description: "Venez découvrir notre structure, rencontrer les encadrants et essayer gratuitement l'activité.",
    objectives: ['Découvrir l\'activité', 'Rencontrer les encadrants', 'Essai gratuit'],
  },
  {
    slug: 'remise-en-forme-adultes',
    title: 'Remise en forme adultes',
    activity: 'Remise en forme', city_hint: '', age_min: 18, age_max: 99, level: 'debutant,intermediaire', kind: 'adultes',
    description: "Séances de remise en forme pour adultes, tous niveaux : cardio, renforcement musculaire et mobilité, encadrées par un coach.",
    objectives: ['Cardio', 'Renforcement musculaire', 'Souplesse et mobilité', 'Perte de poids accompagnée', 'Bien-être'],
  },
];

const FACILITIES = ['Gymnase', 'Salle de sport', 'Terrain extérieur', 'Terrain de football', 'Terrain multisport', 'Piscine', 'Salle de danse', 'Salle de combat', 'Salle de gymnastique', 'Piste', 'Espace de jeux', 'Salle polyvalente', 'Autres installations'];

module.exports = { PROVINCES, CITIES, CATEGORY_GROUPS, TEMPLATES, FACILITIES };
