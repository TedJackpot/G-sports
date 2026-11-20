'use strict';
// Accès base de données via libSQL :
//  - en local : fichier SQLite (data/gsports.db) ;
//  - en production (Vercel) : base Turso, via TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (côté serveur uniquement).
const path = require('node:path');
const fs = require('node:fs');
const { createClient } = require('@libsql/client');
const { PROVINCES, CITIES, CATEGORY_GROUPS, TEMPLATES } = require('./seed-data');
const { slugify, normalize, hashPassword } = require('./util');

const REMOTE_URL = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '';
const IS_REMOTE = /^(libsql|https?|wss?):/.test(REMOTE_URL);
// Sur Vercel sans Turso configuré : base temporaire dans /tmp (effacée au redémarrage) pour que le site reste consultable
const DB_PATH = process.env.GSPORTS_DB || (process.env.VERCEL ? '/tmp/gsports.db' : path.join(__dirname, '..', 'data', 'gsports.db'));
if (process.env.VERCEL && !IS_REMOTE) console.warn('ATTENTION : TURSO_DATABASE_URL absent, base temporaire non persistante utilisée.');
if (!IS_REMOTE) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const client = createClient(IS_REMOTE
  ? { url: REMOTE_URL, authToken: process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN }
  : { url: 'file:' + DB_PATH.replace(/\\/g, '/') });

const toObj = (rs, row) => { const o = {}; rs.columns.forEach((c, i) => { o[c] = row[i]; }); return o; };
const clean = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));

// API proche de better-sqlite3, mais asynchrone : await db.prepare(sql).get(...args)
let ready = null;
const db = {
  prepare(sql) {
    return {
      async get(...args) { await ready; const rs = await client.execute({ sql, args: clean(args) }); return rs.rows.length ? toObj(rs, rs.rows[0]) : undefined; },
      async all(...args) { await ready; const rs = await client.execute({ sql, args: clean(args) }); return rs.rows.map((r) => toObj(rs, r)); },
      async run(...args) { await ready; const rs = await client.execute({ sql, args: clean(args) }); return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null }; },
    };
  },
  async exec(sql) { await ready; return client.executeMultiple(sql); },
  // Plusieurs écritures atomiques en une seule requête réseau
  async batch(stmts) { await ready; return client.batch(stmts.map(([sql, ...args]) => ({ sql, args: clean(args) })), 'write'); },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS provinces (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, capital TEXT
);
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  province_id INTEGER NOT NULL REFERENCES provinces(id),
  lat REAL, lng REAL, featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS category_groups (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, icon TEXT, color TEXT,
  image TEXT, kind TEXT NOT NULL DEFAULT 'sport', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent','pro','admin')),
  name TEXT NOT NULL, phone TEXT, city_id INTEGER REFERENCES cities(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  email_notifications INTEGER NOT NULL DEFAULT 1, preferred_cities TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL, age INTEGER NOT NULL CHECK (age BETWEEN 3 AND 25), interests TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL,
  logo TEXT, cover TEXT, photos TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '',
  city_id INTEGER REFERENCES cities(id), address TEXT, district TEXT, lat REAL, lng REAL,
  phone TEXT, whatsapp TEXT, email TEXT, website TEXT, socials TEXT NOT NULL DEFAULT '{}',
  manager_name TEXT, main_activity TEXT, disciplines TEXT NOT NULL DEFAULT '', age_min INTEGER, age_max INTEGER,
  hours TEXT, facilities TEXT NOT NULL DEFAULT '[]', equipment TEXT, prices_info TEXT, registration_info TEXT,
  specialty TEXT, qualifications TEXT, experience TEXT, zone TEXT,
  travel INTEGER NOT NULL DEFAULT 0, home_lessons INTEGER NOT NULL DEFAULT 0, indoor INTEGER NOT NULL DEFAULT 0,
  outdoor INTEGER NOT NULL DEFAULT 0, individual INTEGER NOT NULL DEFAULT 0, group_lessons INTEGER NOT NULL DEFAULT 0,
  availability TEXT, session_duration TEXT, levels TEXT NOT NULL DEFAULT '', formulas TEXT NOT NULL DEFAULT '[]', media_links TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending','approved','rejected')),
  admin_note TEXT, views INTEGER NOT NULL DEFAULT 0, search_text TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'activite', title TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id), activity TEXT,
  description TEXT NOT NULL DEFAULT '', objectives TEXT NOT NULL DEFAULT '[]', learn TEXT,
  city_id INTEGER NOT NULL REFERENCES cities(id), address TEXT, district TEXT, lat REAL, lng REAL,
  age_min INTEGER NOT NULL, age_max INTEGER NOT NULL, levels TEXT NOT NULL DEFAULT 'debutant',
  beginners INTEGER NOT NULL DEFAULT 1, gender TEXT NOT NULL DEFAULT 'mixte',
  places INTEGER, places_status TEXT NOT NULL DEFAULT '',
  days TEXT NOT NULL DEFAULT '', schedule TEXT, session_duration TEXT,
  start_date TEXT, end_date TEXT, reg_start TEXT, reg_end TEXT,
  price_amount INTEGER, price_period TEXT, price_text TEXT, is_free INTEGER NOT NULL DEFAULT 0, extra_fees TEXT,
  formulas TEXT NOT NULL DEFAULT '[]',
  equipment TEXT, outfit TEXT, conditions TEXT, supervision TEXT, safety TEXT,
  setting TEXT NOT NULL DEFAULT 'mixte', holidays INTEGER NOT NULL DEFAULT 0,
  arrival_time TEXT, departure_time TEXT, duration TEXT, included TEXT, not_included TEXT,
  meals TEXT, lodging TEXT, transport TEXT, program TEXT,
  cover TEXT, photos TEXT NOT NULL DEFAULT '[]', photo_consent INTEGER NOT NULL DEFAULT 0,
  contact_phone TEXT, contact_whatsapp TEXT, contact_email TEXT, registration_info TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','published','suspended','expired')),
  admin_note TEXT, expires_at TEXT, published_at TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0, search_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city_id);
CREATE INDEX IF NOT EXISTS idx_listings_cat ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_profile ON listings(profile_id);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, listing_id)
);
CREATE TABLE IF NOT EXISTS contact_requests (
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'info', parent_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, city TEXT,
  activity TEXT, child_age INTEGER, message TEXT NOT NULL, preferred_date TEXT,
  consent INTEGER NOT NULL CHECK (consent = 1), status TEXT NOT NULL DEFAULT 'nouveau',
  reply TEXT, replied_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_profile ON contact_requests(profile_id, created_at);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_id INTEGER REFERENCES cities(id), group_id INTEGER REFERENCES category_groups(id), age INTEGER,
  kinds TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, target_type TEXT NOT NULL CHECK (target_type IN ('listing','profile')), target_id INTEGER NOT NULL,
  reason TEXT NOT NULL, details TEXT, reporter_email TEXT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ouvert', admin_note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, image TEXT, link TEXT,
  published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS site_messages (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nouveau', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

async function init() {
  if (!IS_REMOTE) await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA foreign_keys = ON');
  await client.executeMultiple(SCHEMA);
  const count = Number((await client.execute('SELECT COUNT(*) c FROM provinces')).rows[0][0]);
  if (count === 0) {
    const s = [];
    PROVINCES.forEach((p, i) => s.push({ sql: 'INSERT INTO provinces (id, slug, name, capital) VALUES (?, ?, ?, ?)', args: [i + 1, p.slug, p.name, p.capital] }));
    const pid = Object.fromEntries(PROVINCES.map((p, i) => [p.slug, i + 1]));
    for (const [name, prov, lat, lng, featured] of CITIES) s.push({ sql: 'INSERT INTO cities (slug, name, province_id, lat, lng, featured) VALUES (?, ?, ?, ?, ?, ?)', args: [slugify(name), name, pid[prov], lat, lng, featured] });
    CATEGORY_GROUPS.forEach((g, i) => {
      s.push({ sql: 'INSERT INTO category_groups (id, slug, name, icon, color, image, kind, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: [i + 1, g.slug, g.name, g.icon, g.color, g.image, g.kind, i] });
      g.items.forEach((name, j) => s.push({ sql: 'INSERT OR IGNORE INTO categories (slug, name, group_id, sort) VALUES (?, ?, ?, ?)', args: [slugify(name), name, i + 1, j] }));
    });
    for (const t of TEMPLATES) s.push({ sql: 'INSERT INTO templates (slug, title, data) VALUES (?, ?, ?)', args: [t.slug, t.title, JSON.stringify(t)] });
    s.push({ sql: 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', args: ['home', JSON.stringify({
      heroTitle: "Trouvez l'activité qui fera grandir votre enfant.",
      heroSubtitle: 'Sports, loisirs, clubs, coachs, stages et activités extrascolaires partout au Gabon.',
      heroImage: 'basket-joie', slogan: 'À chaque jeune son activité. À chaque talent son terrain.', banner: '', holidays: [],
    })] });
    await client.batch(s, 'write');
  }
  // Premier administrateur : créé automatiquement si ADMIN_EMAIL et ADMIN_PASSWORD sont définis et qu'aucun admin n'existe
  const ae = process.env.ADMIN_EMAIL, ap = process.env.ADMIN_PASSWORD;
  if (ae && ap && ap.length >= 10) {
    const n = Number((await client.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")).rows[0][0]);
    if (n === 0) await client.execute({ sql: "INSERT OR IGNORE INTO users (email, password_hash, role, name) VALUES (?, ?, 'admin', 'Administrateur G-Sports')", args: [ae.toLowerCase(), hashPassword(ap)] });
  }
}
ready = init();
ready.catch((e) => console.error('Initialisation de la base impossible :', e));

// Texte de recherche normalisé (sans accents, minuscule)
function listingSearchText(l, extra = {}) {
  return normalize([l.title, l.activity, l.description, l.district, l.address, extra.category, extra.group, extra.city, extra.profile].filter(Boolean).join(' '));
}

module.exports = { db, client, ready: () => ready, listingSearchText, DB_PATH, IS_REMOTE, normalize };
