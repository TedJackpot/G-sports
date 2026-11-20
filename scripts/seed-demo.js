'use strict';
// Ajoute des EXEMPLES FICTIFS, clairement signalés comme tels sur le site, pour visualiser
// la structure des annonces (modèles du cahier des charges : Libreville, Oyem, Port-Gentil…).
// Ils ne sont pas indexés, ne reçoivent aucune demande de contact et se suppriment en un clic
// depuis l'administration (« Supprimer les exemples ») ou via : node scripts/seed-demo.js --remove
const { db } = require('../server/db');
const { hashPassword, randomToken, slugify, addDays, today } = require('../server/util');
const api = require('../server/api');

async function remove() {
  const ls = await db.prepare('SELECT id FROM listings WHERE is_demo = 1').all();
  for (const l of ls) await api.deleteListing(l.id);
  const users = await db.prepare('SELECT user_id FROM profiles WHERE is_demo = 1').all();
  for (const u of users) await api.deleteUser(u.user_id);
  console.log(`${users.length} profil(s) d'exemple supprimé(s).`);
}

const city = async name => (await db.prepare('SELECT id FROM cities WHERE name = ?').get(name)).id;
const cat = async name => (await db.prepare('SELECT id FROM categories WHERE name = ?').get(name)).id;

async function demoProfile(name, type, cityName, activity) {
  const r = (await db.prepare("INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, 'pro', ?)").run(`exemple-${randomToken(6)}@exemple.invalid`, hashPassword(randomToken(24)), 'Exemple fictif'));
  const p = (await db.prepare(`INSERT INTO profiles (user_id, slug, type, name, city_id, main_activity, description, verification, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 1)`).run(Number(r.lastInsertRowid), await api.uniqueSlug('profiles', name), type, name, await city(cityName), activity,
    "EXEMPLE FICTIF – Ce profil sert uniquement à illustrer la présentation d'une structure sur G-Sports. Il ne correspond à aucune structure réelle."));
  await api.refreshProfileSearch(Number(p.lastInsertRowid));
  return Number(p.lastInsertRowid);
}
async function demoListing(profileId, d) {
  const base = {
    kind: 'activite', levels: 'debutant', beginners: 1, gender: 'mixte', days: '', setting: 'mixte', holidays: 0,
    objectives: '[]', photos: '[]', formulas: '[]', is_free: 0, price_text: 'Tarif : à renseigner', schedule: 'Horaires : à renseigner',
    registration_info: "Inscriptions : à renseigner par l'organisateur", supervision: 'Encadrement : à renseigner',
  };
  const l = { ...base, ...d };
  l.expires_at = l.end_date || addDays(today(), 120);
  const cols = Object.keys(l);
  const r = (await db.prepare(`INSERT INTO listings (profile_id, slug, status, published_at, is_demo, ${cols.join(', ')}) VALUES (?, ?, 'published', datetime('now'), 1, ${cols.map(() => '?').join(', ')})`)
    .run(profileId, slugify(l.title), ...cols.map(c => l[c])));
  await api.refreshListingSearch(Number(r.lastInsertRowid));
}

async function main() {
  if (process.argv.includes('--remove')) return remove();
  if ((await db.prepare('SELECT COUNT(*) n FROM profiles WHERE is_demo = 1').get()).n) return console.log('Les exemples existent déjà.');
  const p1 = await demoProfile('Exemple – Académie de football', 'club', 'Libreville', 'Football');
  await demoListing(p1, {
    title: 'Football jeunes – Initiation et perfectionnement', category_id: (await cat('Football')), activity: 'Football', city_id: (await city('Libreville')),
    age_min: 6, age_max: 16, levels: 'debutant,intermediaire', setting: 'outdoor', cover: '/img/photos/football-entrainement.jpg',
    photos: JSON.stringify(['/img/photos/football-entrainement.jpg', '/img/photos/football-coach.jpg', '/img/photos/football-jonglage.jpg']),
    description: "EXEMPLE FICTIF – Modèle d'annonce pour un club de football. Séances d'initiation et de perfectionnement encadrées : technique, jeu collectif et esprit sportif. Les horaires, tarifs, dates et contacts sont à renseigner par le club.",
    objectives: JSON.stringify(['Technique', 'Dribble', 'Passe', 'Coordination', 'Jeu collectif', 'Respect et esprit sportif']), days: 'mer,sam',
  });
  const p2 = await demoProfile('Exemple – Dojo karaté', 'club', 'Oyem', 'Karaté');
  await demoListing(p2, {
    title: 'Karaté enfants', category_id: (await cat('Karaté')), activity: 'Karaté', city_id: (await city('Oyem')), age_min: 5, age_max: 14, setting: 'indoor',

    description: "EXEMPLE FICTIF – Modèle d'annonce pour un cours de karaté enfants, débutants acceptés. Discipline, coordination, respect et concentration. Tarifs et inscriptions à renseigner.",
    objectives: JSON.stringify(['Discipline', 'Coordination', 'Respect', 'Concentration', 'Technique', 'Condition physique']),
  });
  const p3 = await demoProfile('Exemple – Organisateur de camps', 'organisateur', 'Port-Gentil', 'Camps multisports');
  await demoListing(p3, {
    kind: 'camp', title: 'Camp multisport vacances', category_id: (await cat('Camps de vacances')), activity: 'Camp multisport', city_id: (await city('Port-Gentil')),
    age_min: 7, age_max: 15, duration: '5 jours', holidays: 1, setting: 'outdoor', cover: '/img/photos/multisport.jpg',
    photos: JSON.stringify(['/img/photos/multisport.jpg']),
    description: "EXEMPLE FICTIF – Modèle d'annonce de camp multisport de 5 jours pendant les vacances. Dates, prix, lieu et contact à renseigner par l'organisateur.",
    objectives: JSON.stringify(['Football', 'Basketball', 'Jeux collectifs', 'Course', 'Initiation', 'Activités de groupe']),
    program: 'Jour 1 : accueil et jeux collectifs\nJour 2 : football\nJour 3 : basketball\nJour 4 : course et relais\nJour 5 : mini-tournoi et remise des diplômes',
    included: 'À renseigner', not_included: 'À renseigner', meals: 'À renseigner', lodging: 'Sans hébergement (exemple)', transport: 'À renseigner',
  });
  console.log('Exemples fictifs ajoutés (3 profils, 3 annonces), tous marqués « Exemple fictif ».');
}
main().catch((e) => { console.error(e); process.exit(1); });
