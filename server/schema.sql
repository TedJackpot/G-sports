-- G-Sports – schéma PostgreSQL (Supabase en production, PGlite en local et pour les tests).
-- Toutes les tables vivent dans le schéma « gsports » (search_path), séparé des autres applications.
-- Les dates sont stockées en texte UTC « AAAA-MM-JJ HH:MI:SS », manipulées par gs_datetime / gs_date.

CREATE OR REPLACE FUNCTION gs_datetime(t text, m text DEFAULT NULL) RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT to_char((CASE WHEN t = 'now' THEN (now() AT TIME ZONE 'utc') ELSE t::timestamp END) + COALESCE(m::interval, interval '0'), 'YYYY-MM-DD HH24:MI:SS')
$$;
CREATE OR REPLACE FUNCTION gs_date(t text, m text DEFAULT NULL) RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT to_char((CASE WHEN t = 'now' THEN (now() AT TIME ZONE 'utc') ELSE t::timestamp END) + COALESCE(m::interval, interval '0'), 'YYYY-MM-DD')
$$;

CREATE TABLE IF NOT EXISTS provinces (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, capital TEXT
);
CREATE TABLE IF NOT EXISTS cities (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  province_id INTEGER NOT NULL REFERENCES provinces(id),
  lat DOUBLE PRECISION, lng DOUBLE PRECISION, featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS category_groups (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, icon TEXT, color TEXT,
  image TEXT, kind TEXT NOT NULL DEFAULT 'sport', sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES category_groups(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('parent','pro','admin')),
  name TEXT NOT NULL, phone TEXT, city_id INTEGER REFERENCES cities(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  email_notifications INTEGER NOT NULL DEFAULT 1, preferred_cities TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT gs_datetime('now'), last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT gs_datetime('now'), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS children (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL, age INTEGER NOT NULL CHECK (age BETWEEN 3 AND 25), interests TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL,
  logo TEXT, cover TEXT, photos TEXT NOT NULL DEFAULT '[]', description TEXT NOT NULL DEFAULT '',
  city_id INTEGER REFERENCES cities(id), address TEXT, district TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  phone TEXT, whatsapp TEXT, email TEXT, website TEXT, socials TEXT NOT NULL DEFAULT '{}',
  manager_name TEXT, main_activity TEXT, disciplines TEXT NOT NULL DEFAULT '', age_min INTEGER, age_max INTEGER,
  hours TEXT, facilities TEXT NOT NULL DEFAULT '[]', equipment TEXT, prices_info TEXT, registration_info TEXT,
  specialty TEXT, qualifications TEXT, experience TEXT, zone TEXT,
  travel INTEGER NOT NULL DEFAULT 0, home_lessons INTEGER NOT NULL DEFAULT 0, indoor INTEGER NOT NULL DEFAULT 0,
  outdoor INTEGER NOT NULL DEFAULT 0, individual INTEGER NOT NULL DEFAULT 0, group_lessons INTEGER NOT NULL DEFAULT 0,
  availability TEXT, session_duration TEXT, levels TEXT NOT NULL DEFAULT '', formulas TEXT NOT NULL DEFAULT '[]', media_links TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending','approved','rejected')),
  admin_note TEXT, views INTEGER NOT NULL DEFAULT 0, search_text TEXT NOT NULL DEFAULT '', is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT gs_datetime('now'), updated_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE TABLE IF NOT EXISTS listings (
  id SERIAL PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'activite', title TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id), activity TEXT,
  description TEXT NOT NULL DEFAULT '', objectives TEXT NOT NULL DEFAULT '[]', learn TEXT,
  city_id INTEGER NOT NULL REFERENCES cities(id), address TEXT, district TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
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
  created_at TEXT NOT NULL DEFAULT gs_datetime('now'), updated_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city_id);
CREATE INDEX IF NOT EXISTS idx_listings_cat ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_profile ON listings(profile_id);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT gs_datetime('now'), PRIMARY KEY (user_id, listing_id)
);
CREATE TABLE IF NOT EXISTS contact_requests (
  id SERIAL PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'info', parent_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, city TEXT,
  activity TEXT, child_age INTEGER, message TEXT NOT NULL, preferred_date TEXT,
  consent INTEGER NOT NULL CHECK (consent = 1), status TEXT NOT NULL DEFAULT 'nouveau',
  reply TEXT, replied_at TEXT, created_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE INDEX IF NOT EXISTS idx_requests_profile ON contact_requests(profile_id, created_at);
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_id INTEGER REFERENCES cities(id), group_id INTEGER REFERENCES category_groups(id), age INTEGER,
  kinds TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT, read_at TEXT,
  created_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY, target_type TEXT NOT NULL CHECK (target_type IN ('listing','profile')), target_id INTEGER NOT NULL,
  reason TEXT NOT NULL, details TEXT, reporter_email TEXT, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ouvert', admin_note TEXT, created_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, image TEXT, link TEXT,
  published INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS site_messages (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'nouveau', created_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, details TEXT,
  created_at TEXT NOT NULL DEFAULT gs_datetime('now')
);
