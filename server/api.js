'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { db, listingSearchText } = require('./db');
const { FACILITIES } = require('./seed-data');
const { normalize, slugify, today, addDays, hashPassword, verifyPassword, randomToken, sha256, HttpError, V, json } = require('./util');
const mailer = require('./mailer');

const UPLOAD_DIR = process.env.GSPORTS_UPLOADS || path.join(__dirname, '..', 'data', 'uploads');

const SESSION_DAYS = 30;
const LISTING_TTL_DAYS = 120; // durée de vie d'une annonce sans date de fin, renouvelable

const KINDS = {
  activite: 'Activité régulière', inscriptions: 'Inscriptions saison', recrutement: 'Recrutement de jeunes',
  stage: 'Stage', camp: 'Camp', decouverte: 'Journée découverte', 'portes-ouvertes': 'Portes ouvertes',
  essai: "Séance d'essai", tournoi: 'Tournoi', programme: 'Programme ados', evenement: 'Événement',
};
const PROFILE_TYPES = {
  club: 'Club sportif', association: 'Association', gymnase: 'Gymnase', salle: 'Salle de sport',
  centre: 'Centre de loisirs', organisateur: 'Organisateur de camps & stages', ecole: 'Structure extrascolaire',
  coach: 'Coach sportif indépendant', educateur: 'Éducateur / Animateur',
};
const LEVELS = ['debutant', 'intermediaire', 'avance'];
const DAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const REQUEST_TYPES = { info: "Demande d'informations", essai: 'Séance découverte', rdv: 'Rendez-vous', inscription: "Demande d'inscription" };
const REPORT_REASONS = ['Information incorrecte', 'Activité inexistante', 'Tarif incorrect', 'Contenu inapproprié', "Suspicion d'arnaque", 'Problème de sécurité', 'Autre'];
const AGE_GROUPS = { '5-6': [5, 6], '7-9': [7, 9], '10-12': [10, 12], '13-15': [13, 15], '16-18': [16, 18], '18+': [18, 99] };

// ---------- Limitation de débit (anti-abus des formulaires) ----------
const buckets = new Map();
function rateLimit(req, key, max, windowMs) {
  const k = `${key}:${req.ip}`;
  const now = Date.now();
  const b = buckets.get(k) || { n: 0, t: now };
  if (now - b.t > windowMs) { b.n = 0; b.t = now; }
  b.n++; buckets.set(k, b);
  if (b.n > max) throw new HttpError(429, 'Trop de tentatives. Merci de patienter quelques minutes.');
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.t > 3600e3) buckets.delete(k); }, 600e3).unref();

// ---------- Sessions ----------
async function getUser(req) {
  if (req._user !== undefined) return req._user;
  const token = req.cookies.gs_session;
  req._user = null;
  if (token) {
    const row = (await db.prepare(`SELECT u.id, u.email, u.role, u.name, u.phone, u.city_id, u.status, u.email_notifications, u.preferred_cities
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')`).get(sha256(token)));
    if (row && row.status === 'active') req._user = row;
  }
  return req._user;
}
async function requireUser(req, ...roles) {
  const u = await getUser(req);
  if (!u) throw new HttpError(401, 'Veuillez vous connecter.');
  if (roles.length && !roles.includes(u.role)) throw new HttpError(403, "Vous n'avez pas accès à cette fonctionnalité.");
  return u;
}
async function createSession(res, userId) {
  const token = randomToken();
  (await db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).run(sha256(token), userId));
  (await db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(userId));
  res.setCookie('gs_session', token, SESSION_DAYS * 86400);
}
async function audit(userId, action, details) {
  (await db.prepare('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)').run(userId || null, action, details ? JSON.stringify(details) : null));
}
async function notify(userId, type, title, body, link) {
  (await db.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)').run(userId, type, title, body || null, link || null));
  const u = (await db.prepare('SELECT email, email_notifications FROM users WHERE id = ?').get(userId));
  if (u && u.email_notifications) mailer.send({ to: u.email, subject: `G-Sports – ${title}`, text: `${body || ''}\n${link ? 'Voir : ' + link : ''}` });
}

// ---------- Suppressions en cascade explicites (indépendantes du réglage foreign_keys) ----------
async function deleteListing(id) {
  await db.batch([
    ['DELETE FROM favorites WHERE listing_id = ?', id],
    ['UPDATE contact_requests SET listing_id = NULL WHERE listing_id = ?', id],
    ['DELETE FROM listings WHERE id = ?', id],
  ]);
}
async function deleteUser(id) {
  const p = await db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(id);
  const stmts = [];
  if (p) {
    stmts.push(['DELETE FROM favorites WHERE listing_id IN (SELECT id FROM listings WHERE profile_id = ?)', p.id],
      ['DELETE FROM contact_requests WHERE profile_id = ?', p.id], ['DELETE FROM listings WHERE profile_id = ?', p.id], ['DELETE FROM profiles WHERE id = ?', p.id]);
  }
  stmts.push(['DELETE FROM sessions WHERE user_id = ?', id], ['DELETE FROM children WHERE user_id = ?', id], ['DELETE FROM favorites WHERE user_id = ?', id],
    ['DELETE FROM alerts WHERE user_id = ?', id], ['DELETE FROM notifications WHERE user_id = ?', id],
    ['UPDATE contact_requests SET user_id = NULL WHERE user_id = ?', id], ['UPDATE reports SET user_id = NULL WHERE user_id = ?', id],
    ['DELETE FROM users WHERE id = ?', id]);
  await db.batch(stmts);
}

// ---------- Sérialisation ----------
const LISTING_SELECT = `SELECT l.*, c.name city_name, c.slug city_slug, c.lat city_lat, c.lng city_lng,
  pv.name province_name, pv.slug province_slug, cat.name cat_name, cat.slug cat_slug,
  g.id group_id, g.slug group_slug, g.name group_name, g.icon group_icon, g.color group_color, g.image group_image,
  pr.name org_name, pr.slug org_slug, pr.type org_type, pr.logo org_logo, pr.verification org_verification,
  pr.phone org_phone, pr.whatsapp org_whatsapp, pr.is_demo org_demo
  FROM listings l
  JOIN cities c ON c.id = l.city_id JOIN provinces pv ON pv.id = c.province_id
  LEFT JOIN categories cat ON cat.id = l.category_id LEFT JOIN category_groups g ON g.id = cat.group_id
  JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id`;
const PUBLIC_WHERE = `l.status = 'published' AND (l.expires_at IS NULL OR l.expires_at >= date('now'))
  AND pr.verification = 'approved' AND u.status = 'active'`;

function registrationState(l) {
  const t = today();
  const hasReg = l.reg_start || l.reg_end;
  if (l.places_status === 'complet') return 'complet';
  if (hasReg) {
    if (l.reg_start && l.reg_start > t) return 'bientot';
    if (!l.reg_end || l.reg_end >= t) return 'ouvertes';
    return 'closes';
  }
  if (l.start_date && l.start_date > t) return 'bientot';
  return '';
}
function badges(l) {
  const b = [];
  const st = registrationState(l);
  if (st === 'ouvertes') b.push({ k: 'ouvertes', t: 'Inscriptions ouvertes' });
  if (st === 'bientot') b.push({ k: 'bientot', t: 'Bientôt disponible' });
  if (st === 'complet') b.push({ k: 'complet', t: 'Complet' });
  if (l.places_status === 'limitees' && st !== 'complet') b.push({ k: 'limitees', t: 'Places limitées' });
  if (l.is_free) b.push({ k: 'gratuit', t: 'Activité gratuite' });
  if (l.published_at && (Date.now() - Date.parse(l.published_at + 'Z')) < 14 * 86400e3) b.push({ k: 'nouveau', t: 'Nouvelle annonce' });
  return b;
}
function photoUrl(p) { return p || null; }
// Photo d'illustration UNIQUEMENT si elle montre la même activité que l'annonce (sinon aucune image)
const MATCHING_PHOTOS = {
  football: 'football-entrainement', futsal: 'football-jonglage',
  basketball: 'basket-dribble',
  karate: 'arts-martiaux-2', judo: 'arts-martiaux-2', taekwondo: 'arts-martiaux', 'boxe-educative': 'arts-martiaux', kickboxing: 'arts-martiaux',
  lutte: 'arts-martiaux-2', aikido: 'arts-martiaux-2', 'jiu-jitsu': 'arts-martiaux-2', 'self-defense-jeunes': 'arts-martiaux',
  'natation-debutant': 'natation-cours', 'natation-perfectionnement': 'natation-dos', 'natation-competition': 'natation-groupe',
  natation: 'natation-cours', 'stages-aquatiques': 'natation-groupe', 'aquagym-jeunes': 'natation-initiation',
  randonnee: 'randonnee-foret', 'camping-encadre': 'camp-nature', 'decouverte-de-la-nature': 'exploration-nature',
  excursions: 'exploration-nature', 'observation-de-la-faune': 'exploration-nature', 'camps-de-vacances': 'camp-nature',
};
function matchingPhoto(catSlug) { return MATCHING_PHOTOS[catSlug] ? `/img/photos/${MATCHING_PHOTOS[catSlug]}.jpg` : null; }
function serializeListing(l, full = false) {
  const photos = json(l.photos, []);
  const cover = l.cover || photos[0] || matchingPhoto(l.cat_slug);
  const out = {
    id: l.id, slug: l.slug, url: `/annonce/${l.id}-${l.slug}`, kind: l.kind, kind_label: KINDS[l.kind] || 'Activité',
    title: l.title, activity: l.activity, cat_name: l.cat_name, cat_slug: l.cat_slug,
    group: l.group_slug ? { slug: l.group_slug, name: l.group_name, icon: l.group_icon, color: l.group_color } : null,
    city: { name: l.city_name, slug: l.city_slug }, province: { name: l.province_name, slug: l.province_slug },
    district: l.district, age_min: l.age_min, age_max: l.age_max, levels: (l.levels || '').split(',').filter(Boolean),
    beginners: !!l.beginners, gender: l.gender, start_date: l.start_date, end_date: l.end_date,
    reg_start: l.reg_start, reg_end: l.reg_end, reg_state: registrationState(l),
    price_amount: l.price_amount, price_period: l.price_period, price_text: l.price_text, is_free: !!l.is_free,
    days: (l.days || '').split(',').filter(Boolean), schedule: l.schedule, setting: l.setting, holidays: !!l.holidays,
    cover: photoUrl(cover), cover_is_generic: !l.cover && !photos.length, badges: badges(l), published_at: l.published_at,
    org: { name: l.org_name, slug: l.org_slug, type: l.org_type, type_label: PROFILE_TYPES[l.org_type], logo: l.org_logo, url: `/${l.org_type === 'coach' || l.org_type === 'educateur' ? 'coachs' : 'clubs'}/${l.org_slug}` },
    is_demo: !!(l.is_demo || l.org_demo), status: l.status, expires_at: l.expires_at,
  };
  if (l._distance != null) out.distance_km = Math.round(l._distance * 10) / 10;
  if (full) Object.assign(out, {
    description: l.description, objectives: json(l.objectives, []), learn: l.learn, address: l.address,
    lat: l.lat ?? l.city_lat, lng: l.lng ?? l.city_lng, approx_location: l.lat == null,
    places: l.places, places_status: l.places_status, session_duration: l.session_duration,
    extra_fees: l.extra_fees, formulas: json(l.formulas, []), equipment: l.equipment, outfit: l.outfit,
    conditions: l.conditions, supervision: l.supervision, safety: l.safety, photos,
    arrival_time: l.arrival_time, departure_time: l.departure_time, duration: l.duration, included: l.included,
    not_included: l.not_included, meals: l.meals, lodging: l.lodging, transport: l.transport, program: l.program,
    registration_info: l.registration_info, views: l.views, category_id: l.category_id, city_id: l.city_id,
    contact: {
      phone: l.contact_phone || l.org_phone || null, whatsapp: l.contact_whatsapp || l.org_whatsapp || null,
      email: l.contact_email || null,
    },
    photo_consent: !!l.photo_consent, admin_note: undefined,
  });
  return out;
}

const PROFILE_SELECT = `SELECT pr.*, c.name city_name, c.slug city_slug, c.lat city_lat, c.lng city_lng, pv.name province_name, pv.slug province_slug
  FROM profiles pr JOIN users u ON u.id = pr.user_id LEFT JOIN cities c ON c.id = pr.city_id LEFT JOIN provinces pv ON pv.id = c.province_id`;
function serializeProfile(p, full = false) {
  const isCoach = p.type === 'coach' || p.type === 'educateur';
  const out = {
    id: p.id, slug: p.slug, type: p.type, type_label: PROFILE_TYPES[p.type] || p.type, is_coach: isCoach,
    url: `/${isCoach ? 'coachs' : 'clubs'}/${p.slug}`, name: p.name, logo: p.logo,
    cover: p.cover || json(p.photos, [])[0] || null, city: p.city_name ? { name: p.city_name, slug: p.city_slug } : null,
    province: p.province_name ? { name: p.province_name, slug: p.province_slug } : null, district: p.district,
    main_activity: p.main_activity, specialty: p.specialty, disciplines: p.disciplines, age_min: p.age_min, age_max: p.age_max,
    excerpt: (p.description || '').slice(0, 180), verification: p.verification, is_demo: !!p.is_demo,
    listing_count: p.listing_count ?? undefined,
  };
  if (full) Object.assign(out, {
    description: p.description, photos: json(p.photos, []), address: p.address, lat: p.lat ?? p.city_lat, lng: p.lng ?? p.city_lng,
    approx_location: p.lat == null, phone: p.phone, whatsapp: p.whatsapp, email: p.email, website: p.website,
    socials: json(p.socials, {}), manager_name: p.manager_name, hours: p.hours, facilities: json(p.facilities, []),
    equipment: p.equipment, prices_info: p.prices_info, registration_info: p.registration_info, qualifications: p.qualifications,
    experience: p.experience, zone: p.zone, travel: !!p.travel, home_lessons: !!p.home_lessons, indoor: !!p.indoor,
    outdoor: !!p.outdoor, individual: !!p.individual, group_lessons: !!p.group_lessons, availability: p.availability,
    session_duration: p.session_duration, levels: (p.levels || '').split(',').filter(Boolean), formulas: json(p.formulas, []),
    media_links: json(p.media_links, []), city_id: p.city_id, created_at: p.created_at,
  });
  return out;
}

// ---------- Recherche d'annonces ----------
function haversine(a, b, c, d) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(c - a), dLng = toR(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
async function searchListings(q, { publicOnly = true, extraWhere = '', extraParams = [] } = {}) {
  const where = [publicOnly ? PUBLIC_WHERE : '1=1'];
  const params = [];
  if (extraWhere) { where.push(extraWhere); params.push(...extraParams); }
  if (q.q) {
    for (const term of normalize(q.q).split(' ').filter(t => t.length > 1).slice(0, 6)) {
      where.push('(l.search_text LIKE ? OR pr.search_text LIKE ?)'); params.push(`%${term}%`, `%${term}%`);
    }
  }
  if (q.city) { where.push('c.slug = ?'); params.push(String(q.city)); }
  if (q.province) { where.push('pv.slug = ?'); params.push(String(q.province)); }
  if (q.district) { where.push('l.search_text LIKE ?'); params.push(`%${normalize(q.district)}%`); }
  if (q.group) { where.push('g.slug = ?'); params.push(String(q.group)); }
  if (q.groupkind) { where.push('g.kind = ?'); params.push(String(q.groupkind)); }
  if (q.cat) { where.push('cat.slug = ?'); params.push(String(q.cat)); }
  const age = Number(q.age);
  if (q.age && Number.isInteger(age)) { where.push('l.age_min <= ? AND l.age_max >= ?'); params.push(age, age); }
  else if (q.agegroup && AGE_GROUPS[q.agegroup]) {
    const [a, b] = AGE_GROUPS[q.agegroup]; where.push('l.age_min <= ? AND l.age_max >= ?'); params.push(b, a);
  }
  if (q.kind) {
    const kinds = String(q.kind).split(',').filter(k => KINDS[k]);
    if (kinds.length) { where.push(`l.kind IN (${kinds.map(() => '?').join(',')})`); params.push(...kinds); }
  }
  if (q.ptype) {
    const types = String(q.ptype).split(',').filter(k => PROFILE_TYPES[k]);
    if (types.length) { where.push(`pr.type IN (${types.map(() => '?').join(',')})`); params.push(...types); }
  }
  if (q.free === '1') where.push('l.is_free = 1');
  if (q.maxprice) { const m = Number(q.maxprice); if (m >= 0) { where.push('(l.is_free = 1 OR (l.price_amount IS NOT NULL AND l.price_amount <= ?))'); params.push(m); } }
  if (q.level && LEVELS.includes(q.level)) { where.push("(',' || l.levels || ',') LIKE ?"); params.push(`%,${q.level},%`); }
  if (q.beginner === '1') where.push('l.beginners = 1');
  if (q.open === '1') where.push(`(l.reg_start IS NOT NULL OR l.reg_end IS NOT NULL) AND (l.reg_start IS NULL OR l.reg_start <= date('now'))
    AND (l.reg_end IS NULL OR l.reg_end >= date('now')) AND l.places_status != 'complet'`);
  if (q.holidays === '1') where.push("(l.holidays = 1 OR l.kind IN ('stage','camp'))");
  if (q.weekend === '1') where.push("(l.days LIKE '%sam%' OR l.days LIKE '%dim%')");
  if (q.weekday === '1') where.push("(l.days LIKE '%lun%' OR l.days LIKE '%mar%' OR l.days LIKE '%mer%' OR l.days LIKE '%jeu%' OR l.days LIKE '%ven%')");
  if (q.setting === 'indoor' || q.setting === 'outdoor') { where.push('(l.setting = ? OR l.setting = \'mixte\')'); params.push(q.setting); }
  if (q.from) { where.push('(COALESCE(l.end_date, l.expires_at, \'9999\') >= ?)'); params.push(String(q.from).slice(0, 10)); }
  if (q.to) { where.push('(COALESCE(l.start_date, l.reg_start, \'0000\') <= ?)'); params.push(String(q.to).slice(0, 10)); }
  if (q.upcoming === '1') where.push("(l.start_date IS NULL OR l.start_date >= date('now') OR l.end_date >= date('now'))");
  if (q.profile) { where.push('pr.id = ?'); params.push(Number(q.profile)); }
  if (q.ids) {
    const ids = String(q.ids).split(',').map(Number).filter(Number.isInteger).slice(0, 100);
    if (!ids.length) return { items: [], total: 0 };
    where.push(`l.id IN (${ids.map(() => '?').join(',')})`); params.push(...ids);
  }
  let order = 'l.published_at DESC';
  switch (q.sort) {
    case 'inscription': order = "CASE WHEN l.reg_end IS NULL THEN 1 ELSE 0 END, l.reg_end ASC"; break;
    case 'prix': order = 'CASE WHEN l.is_free = 1 THEN 0 WHEN l.price_amount IS NULL THEN 2 ELSE 1 END, l.price_amount ASC'; break;
    case 'date': order = "CASE WHEN l.start_date IS NULL THEN 1 ELSE 0 END, l.start_date ASC"; break;
    case 'populaire': order = 'l.views DESC'; break;
  }
  const sql = `${LISTING_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}, l.id DESC`;
  let rows = (await db.prepare(sql).all(...params));
  const lat = Number(q.lat), lng = Number(q.lng);
  if (q.sort === 'proximite' && Number.isFinite(lat) && Number.isFinite(lng) && q.lat && q.lng) {
    for (const r of rows) { const la = r.lat ?? r.city_lat, ln = r.lng ?? r.city_lng; r._distance = la != null ? haversine(lat, lng, la, ln) : 1e9; }
    rows.sort((a, b) => a._distance - b._distance);
  }
  const limit = Math.min(Math.max(Number(q.limit) || 24, 1), 100);
  const page = Math.max(Number(q.page) || 1, 1);
  return { total: rows.length, page, pages: Math.ceil(rows.length / limit), items: rows.slice((page - 1) * limit, page * limit).map(r => serializeListing(r)) };
}

// ---------- Saisie d'une annonce ----------
function parseFormulas(v) {
  const arr = Array.isArray(v) ? v : [];
  return arr.slice(0, 12).map(f => ({
    name: V.str(f.name, { max: 80, required: true, field: 'nom de la formule' }),
    price: V.str(f.price, { max: 60, field: 'prix de la formule' }) || '',
    details: V.str(f.details, { max: 300, field: 'détails de la formule' }) || '',
  }));
}
function parsePhotos(v, max = 8) {
  const arr = Array.isArray(v) ? v : [];
  return arr.filter(p => typeof p === 'string' && (/^\/(uploads|img\/photos)\/[\w.-]+\.(jpg|jpeg|png|webp)$/.test(p)
    || /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/uploads\/[\w.-]+\.(jpg|jpeg|png|webp)$/.test(p))).slice(0, max);
}
async function parseListingInput(b) {
  const kind = KINDS[b.kind] ? b.kind : 'activite';
  const city = (await db.prepare('SELECT id FROM cities WHERE id = ? AND active = 1').get(Number(b.city_id)));
  if (!city) throw new HttpError(400, 'Veuillez choisir une ville valide.');
  const category = b.category_id ? (await db.prepare('SELECT id, name FROM categories WHERE id = ?').get(Number(b.category_id))) : null;
  if (!category) throw new HttpError(400, 'Veuillez choisir une catégorie.');
  const age_min = V.int(b.age_min, { min: 3, max: 99, required: true, field: 'âge minimum' });
  const age_max = V.int(b.age_max, { min: 3, max: 99, required: true, field: 'âge maximum' });
  if (age_max < age_min) throw new HttpError(400, "L'âge maximum doit être supérieur ou égal à l'âge minimum.");
  const start_date = V.date(b.start_date, { field: 'date de début' });
  const end_date = V.date(b.end_date, { field: 'date de fin' });
  if (start_date && end_date && end_date < start_date) throw new HttpError(400, 'La date de fin doit être après la date de début.');
  const reg_start = V.date(b.reg_start, { field: "date d'ouverture des inscriptions" });
  const reg_end = V.date(b.reg_end, { field: 'date limite d\'inscription' });
  if (reg_start && reg_end && reg_end < reg_start) throw new HttpError(400, "La date limite d'inscription doit être après la date d'ouverture.");
  const photos = parsePhotos(b.photos);
  const is_free = V.bool(b.is_free);
  const objectives = (Array.isArray(b.objectives) ? b.objectives : String(b.objectives || '').split('\n'))
    .map(s => String(s).trim()).filter(Boolean).slice(0, 15).map(s => s.slice(0, 120));
  if (photos.length && !V.bool(b.photo_consent)) throw new HttpError(400, "Merci de confirmer que vous disposez des autorisations nécessaires pour les photos (notamment l'accord des parents si des enfants sont reconnaissables).");
  return {
    kind, title: V.str(b.title, { required: true, min: 5, max: 120, field: 'titre' }),
    category_id: category.id, activity: V.str(b.activity, { max: 80, field: 'activité' }) || category.name,
    description: V.str(b.description, { required: true, min: 30, max: 6000, field: 'description' }),
    objectives: JSON.stringify(objectives), learn: V.str(b.learn, { max: 2000, field: 'ce que l\'enfant va apprendre' }),
    city_id: city.id, address: V.str(b.address, { max: 200, field: 'adresse' }), district: V.str(b.district, { max: 100, field: 'quartier' }),
    lat: V.num(b.lat, { min: -4.5, max: 2.5, field: 'latitude' }), lng: V.num(b.lng, { min: 8.5, max: 15, field: 'longitude' }),
    age_min, age_max, levels: V.list(b.levels, LEVELS).join(',') || 'debutant', beginners: V.bool(b.beginners),
    gender: V.oneOf(b.gender, ['mixte', 'filles', 'garcons'], 'mixte'),
    places: V.int(b.places, { min: 1, max: 100000, field: 'places' }), places_status: V.oneOf(b.places_status, ['', 'limitees', 'complet'], ''),
    days: V.list(b.days, DAYS).join(','), schedule: V.str(b.schedule, { max: 300, field: 'horaires' }),
    session_duration: V.str(b.session_duration, { max: 60, field: 'durée des séances' }),
    start_date, end_date, reg_start, reg_end,
    price_amount: is_free ? null : V.int(b.price_amount, { min: 0, max: 100000000, field: 'tarif' }),
    price_period: V.oneOf(b.price_period, ['', 'seance', 'semaine', 'mois', 'trimestre', 'annee', 'stage', 'total'], ''),
    price_text: V.str(b.price_text, { max: 200, field: 'précisions tarif' }), is_free,
    extra_fees: V.str(b.extra_fees, { max: 500, field: 'frais supplémentaires' }), formulas: JSON.stringify(parseFormulas(b.formulas)),
    equipment: V.str(b.equipment, { max: 800, field: 'matériel' }), outfit: V.str(b.outfit, { max: 300, field: 'tenue' }),
    conditions: V.str(b.conditions, { max: 1000, field: 'conditions' }), supervision: V.str(b.supervision, { max: 1000, field: 'encadrement' }),
    safety: V.str(b.safety, { max: 1000, field: 'sécurité' }), setting: V.oneOf(b.setting, ['indoor', 'outdoor', 'mixte'], 'mixte'),
    holidays: V.bool(b.holidays) || (kind === 'stage' || kind === 'camp' ? V.bool(b.holidays) : 0),
    arrival_time: V.str(b.arrival_time, { max: 20, field: "heure d'arrivée" }), departure_time: V.str(b.departure_time, { max: 20, field: 'heure de départ' }),
    duration: V.str(b.duration, { max: 60, field: 'durée' }), included: V.str(b.included, { max: 1000, field: 'inclus' }),
    not_included: V.str(b.not_included, { max: 1000, field: 'non inclus' }), meals: V.str(b.meals, { max: 300, field: 'repas' }),
    lodging: V.str(b.lodging, { max: 300, field: 'hébergement' }), transport: V.str(b.transport, { max: 300, field: 'transport' }),
    program: V.str(b.program, { max: 3000, field: 'programme' }),
    cover: photos[0] || null, photos: JSON.stringify(photos), photo_consent: V.bool(b.photo_consent),
    contact_phone: V.phone(b.contact_phone), contact_whatsapp: V.phone(b.contact_whatsapp, { field: 'WhatsApp' }),
    contact_email: V.email(b.contact_email), registration_info: V.str(b.registration_info, { max: 1500, field: "modalités d'inscription" }),
  };
}
function computeExpiry(l) {
  if (l.end_date) return l.end_date;
  return addDays(today(), LISTING_TTL_DAYS);
}
async function refreshListingSearch(id) {
  const l = (await db.prepare(`SELECT l.*, cat.name cname, g.name gname, c.name cityname, pr.name prname FROM listings l
    LEFT JOIN categories cat ON cat.id = l.category_id LEFT JOIN category_groups g ON g.id = cat.group_id
    JOIN cities c ON c.id = l.city_id JOIN profiles pr ON pr.id = l.profile_id WHERE l.id = ?`).get(id));
  if (l) (await db.prepare('UPDATE listings SET search_text = ? WHERE id = ?').run(listingSearchText(l, { category: l.cname, group: l.gname, city: l.cityname, profile: l.prname }), id));
}
async function refreshProfileSearch(id) {
  const p = (await db.prepare('SELECT pr.*, c.name cityname FROM profiles pr LEFT JOIN cities c ON c.id = pr.city_id WHERE pr.id = ?').get(id));
  if (p) (await db.prepare('UPDATE profiles SET search_text = ? WHERE id = ?').run(normalize([p.name, p.main_activity, p.specialty, p.disciplines, p.description, p.cityname, p.district].join(' ')), id));
}
async function notifyAlertsFor(listingId) {
  const l = (await db.prepare(`${LISTING_SELECT} WHERE l.id = ? AND ${PUBLIC_WHERE}`).get(listingId));
  if (!l || l.is_demo || l.org_demo) return;
  const alerts = (await db.prepare(`SELECT a.*, u.id uid FROM alerts a JOIN users u ON u.id = a.user_id WHERE u.status = 'active'
    AND (a.city_id IS NULL OR a.city_id = ?) AND (a.group_id IS NULL OR a.group_id = ?) AND (a.age IS NULL OR (a.age BETWEEN ? AND ?))`)
    .all(l.city_id, l.group_id ?? -1, l.age_min, l.age_max));
  const seen = new Set();
  for (const a of alerts) {
    if (a.kinds && !a.kinds.split(',').includes(l.kind)) continue;
    if (seen.has(a.uid)) continue; seen.add(a.uid);
    const label = l.kind === 'camp' ? 'Nouveau camp' : l.kind === 'stage' ? 'Nouveau stage' : 'Nouvelle activité';
    await notify(a.uid, 'alerte', `${label} à ${l.city_name}`, `${l.title} (${l.age_min}–${l.age_max} ans) par ${l.org_name}`, `/annonce/${l.id}-${l.slug}`);
  }
}

// ---------- Images ----------
async function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Format d\'image non accepté (JPEG, PNG ou WebP).');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw new HttpError(413, 'Image trop lourde (3 Mo maximum).');
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
  const isWebp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  const ext = isJpeg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : null;
  if (!ext) throw new HttpError(400, 'Fichier image invalide.');
  const name = `${Date.now().toString(36)}-${randomToken(9)}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Production (Vercel) : stockage durable sur Vercel Blob
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${name}`, buf, { access: 'public', contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, addRandomSuffix: false });
    return blob.url;
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

// ---------- Profil professionnel ----------
async function parseProfileInput(b, existing) {
  const city = b.city_id ? (await db.prepare('SELECT id FROM cities WHERE id = ?').get(Number(b.city_id))) : null;
  if (!city) throw new HttpError(400, 'Veuillez choisir une ville.');
  const socials = {};
  for (const k of ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin']) {
    const u = b.socials && b.socials[k] ? V.url(b.socials[k], { field: `lien ${k}` }) : null;
    if (u) socials[k] = u;
  }
  const media = (Array.isArray(b.media_links) ? b.media_links : String(b.media_links || '').split('\n'))
    .map(s => String(s).trim()).filter(Boolean).slice(0, 6).map(s => V.url(s, { field: 'lien vidéo' }));
  return {
    name: V.str(b.name, { required: true, min: 2, max: 120, field: 'nom' }),
    type: PROFILE_TYPES[b.type] ? b.type : existing.type,
    logo: parsePhotos([b.logo], 1)[0] || null, cover: parsePhotos([b.cover], 1)[0] || null,
    photos: JSON.stringify(parsePhotos(b.photos, 10)), description: V.str(b.description, { max: 5000, field: 'description' }) || '',
    city_id: city.id, address: V.str(b.address, { max: 200, field: 'adresse' }), district: V.str(b.district, { max: 100, field: 'quartier' }),
    lat: V.num(b.lat, { min: -4.5, max: 2.5, field: 'latitude' }), lng: V.num(b.lng, { min: 8.5, max: 15, field: 'longitude' }),
    phone: V.phone(b.phone), whatsapp: V.phone(b.whatsapp, { field: 'WhatsApp' }), email: V.email(b.email),
    website: V.url(b.website, { field: 'site web' }), socials: JSON.stringify(socials),
    manager_name: V.str(b.manager_name, { max: 100, field: 'responsable' }), main_activity: V.str(b.main_activity, { max: 100, field: 'activité principale' }),
    disciplines: V.str(b.disciplines, { max: 500, field: 'disciplines' }) || '',
    age_min: V.int(b.age_min, { min: 3, max: 99, field: 'âge minimum' }), age_max: V.int(b.age_max, { min: 3, max: 99, field: 'âge maximum' }),
    hours: V.str(b.hours, { max: 600, field: 'horaires' }), facilities: JSON.stringify(V.list(b.facilities, FACILITIES)),
    equipment: V.str(b.equipment, { max: 800, field: 'équipements' }), prices_info: V.str(b.prices_info, { max: 1000, field: 'tarifs' }),
    registration_info: V.str(b.registration_info, { max: 1000, field: "conditions d'inscription" }),
    specialty: V.str(b.specialty, { max: 120, field: 'spécialité' }), qualifications: V.str(b.qualifications, { max: 1500, field: 'diplômes' }),
    experience: V.str(b.experience, { max: 1500, field: 'expérience' }), zone: V.str(b.zone, { max: 300, field: "zone d'intervention" }),
    travel: V.bool(b.travel), home_lessons: V.bool(b.home_lessons), indoor: V.bool(b.indoor), outdoor: V.bool(b.outdoor),
    individual: V.bool(b.individual), group_lessons: V.bool(b.group_lessons), availability: V.str(b.availability, { max: 600, field: 'disponibilités' }),
    session_duration: V.str(b.session_duration, { max: 60, field: 'durée des séances' }), levels: V.list(b.levels, LEVELS).join(','),
    formulas: JSON.stringify(parseFormulas(b.formulas)), media_links: JSON.stringify(media),
  };
}

async function uniqueSlug(table, base, ignoreId) {
  let slug = slugify(base), i = 1;
  while ((await db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`).get(slug, ignoreId || 0))) slug = `${slugify(base)}-${++i}`;
  return slug;
}
async function getOwnProfile(user) {
  const p = (await db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(user.id));
  if (!p) throw new HttpError(404, 'Profil professionnel introuvable.');
  return p;
}
async function getOwnListing(user, id) {
  const p = await getOwnProfile(user);
  const l = (await db.prepare('SELECT * FROM listings WHERE id = ? AND profile_id = ?').get(Number(id), p.id));
  if (!l) throw new HttpError(404, 'Annonce introuvable.');
  return { p, l };
}

// ---------- Méta-données ----------
async function getMeta() {
  const cities = (await db.prepare(`SELECT c.id, c.slug, c.name, c.lat, c.lng, c.featured, pv.slug province, pv.name province_name,
    (SELECT COUNT(*) FROM listings l JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id WHERE l.city_id = c.id AND ${PUBLIC_WHERE}) listings
    FROM cities c JOIN provinces pv ON pv.id = c.province_id WHERE c.active = 1 ORDER BY c.name COLLATE NOCASE`).all());
  const provinces = (await db.prepare('SELECT id, slug, name, capital FROM provinces ORDER BY name').all());
  const groups = (await db.prepare('SELECT id, slug, name, icon, color, image, kind FROM category_groups WHERE active = 1 ORDER BY sort, name').all());
  const cats = (await db.prepare('SELECT id, slug, name, group_id FROM categories WHERE active = 1 ORDER BY group_id, sort, name').all());
  for (const g of groups) g.categories = cats.filter(c => c.group_id === g.id).map(({ id, slug, name }) => ({ id, slug, name }));
  const home = json((await db.prepare("SELECT value FROM settings WHERE key = 'home'").get())?.value, {});
  return { provinces, cities, groups, kinds: KINDS, profileTypes: PROFILE_TYPES, levels: LEVELS, days: DAYS, requestTypes: REQUEST_TYPES, reportReasons: REPORT_REASONS, ageGroups: Object.keys(AGE_GROUPS), facilities: FACILITIES, home };
}

// =================== ROUTES ===================
const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler });
}

// --- Public ---
route('GET', '/api/meta', async () => await getMeta());
route('GET', '/api/me', async (req) => {
  const u = await getUser(req);
  if (!u) return { user: null };
  const unread = (await db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(u.id)).n;
  const profile = u.role === 'pro' ? (await db.prepare('SELECT id, slug, name, type, verification FROM profiles WHERE user_id = ?').get(u.id)) : null;
  return { user: { id: u.id, email: u.email, role: u.role, name: u.name, phone: u.phone, city_id: u.city_id, email_notifications: !!u.email_notifications, preferred_cities: json(u.preferred_cities, []) }, unread, profile };
});

route('GET', '/api/listings', async (req) => await searchListings(req.query));
route('GET', '/api/listings/:id', async (req, res, { id }) => {
  const u = await getUser(req);
  let l = (await db.prepare(`${LISTING_SELECT} WHERE l.id = ? AND ${PUBLIC_WHERE}`).get(Number(id)));
  let preview = false;
  if (!l && u) {
    // Le propriétaire ou un administrateur peut prévisualiser une annonce non publiée
    const any = (await db.prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(Number(id)));
    if (any && (u.role === 'admin' || (await db.prepare('SELECT 1 FROM profiles WHERE id = ? AND user_id = ?').get(any.profile_id, u.id)))) { l = any; preview = true; }
  }
  if (!l) {
    const expired = (await db.prepare('SELECT id, title FROM listings WHERE id = ?').get(Number(id)));
    throw new HttpError(404, expired ? "Cette annonce n'est plus disponible (expirée, suspendue ou retirée)." : 'Annonce introuvable.');
  }
  if (!preview) (await db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(l.id));
  const out = serializeListing(l, true);
  out.preview = preview;
  out.favorites = (await db.prepare('SELECT COUNT(*) n FROM favorites WHERE listing_id = ?').get(l.id)).n;
  out.is_favorite = u ? !!(await db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(u.id, l.id)) : false;
  const similar = (await searchListings({ group: l.group_slug, city: l.city_slug, limit: 5 })).items.filter(x => x.id !== l.id).slice(0, 4);
  out.similar = similar;
  return out;
});

route('GET', '/api/profiles', async (req) => {
  const q = req.query;
  const where = ["pr.verification = 'approved'", "u.status = 'active'"]; const params = [];
  if (q.coach === '1') where.push("pr.type IN ('coach','educateur')");
  if (q.coach === '0') where.push("pr.type NOT IN ('coach','educateur')");
  if (q.type && PROFILE_TYPES[q.type]) { where.push('pr.type = ?'); params.push(q.type); }
  if (q.city) { where.push('c.slug = ?'); params.push(String(q.city)); }
  if (q.province) { where.push('pv.slug = ?'); params.push(String(q.province)); }
  if (q.q) for (const t of normalize(q.q).split(' ').filter(x => x.length > 1).slice(0, 6)) { where.push('pr.search_text LIKE ?'); params.push(`%${t}%`); }
  if (q.discipline) { where.push('pr.search_text LIKE ?'); params.push(`%${normalize(q.discipline)}%`); }
  if (q.age) { const a = Number(q.age); if (Number.isInteger(a)) { where.push('(pr.age_min IS NULL OR pr.age_min <= ?) AND (pr.age_max IS NULL OR pr.age_max >= ?)'); params.push(a, a); } }
  if (q.home === '1') where.push('pr.home_lessons = 1');
  const rows = (await db.prepare(`${PROFILE_SELECT.replace('SELECT pr.*,', `SELECT pr.*, (SELECT COUNT(*) FROM listings l WHERE l.profile_id = pr.id AND l.status = 'published' AND (l.expires_at IS NULL OR l.expires_at >= date('now'))) listing_count,`)}
    WHERE ${where.join(' AND ')} ORDER BY pr.updated_at DESC LIMIT 200`).all(...params));
  return { total: rows.length, items: rows.map(r => serializeProfile(r)) };
});
route('GET', '/api/profiles/:slug', async (req, res, { slug }) => {
  const u = await getUser(req);
  let p = (await db.prepare(`${PROFILE_SELECT} WHERE pr.slug = ? AND pr.verification = 'approved' AND u.status = 'active'`).get(String(slug)));
  if (!p && u) {
    const any = (await db.prepare(`${PROFILE_SELECT} WHERE pr.slug = ?`).get(String(slug)));
    if (any && (u.role === 'admin' || any.user_id === u.id)) p = any;
  }
  if (!p) throw new HttpError(404, 'Profil introuvable ou en attente de validation.');
  (await db.prepare('UPDATE profiles SET views = views + 1 WHERE id = ?').run(p.id));
  const out = serializeProfile(p, true);
  out.listings = (await searchListings({ profile: p.id, limit: 50 })).items;
  return out;
});

route('GET', '/api/home', async () => {
  const pick = async (q) => (await searchListings({ limit: 8, ...q })).items;
  const [popular, open, camps, holidays, newest, free, discover] = await Promise.all([
    pick({ sort: 'populaire' }), pick({ open: '1', sort: 'inscription' }), pick({ kind: 'stage,camp', upcoming: '1', sort: 'date' }),
    pick({ holidays: '1', upcoming: '1', sort: 'date' }), pick({}), pick({ maxprice: 10000, sort: 'prix' }), pick({ kind: 'decouverte,essai,portes-ouvertes' })]);
  const cityCounts = (await db.prepare(`SELECT c.slug, c.name, COUNT(l.id) n FROM cities c
    LEFT JOIN listings l ON l.city_id = c.id AND l.id IN (SELECT l.id FROM listings l JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id WHERE ${PUBLIC_WHERE})
    WHERE c.featured = 1 GROUP BY c.id ORDER BY c.name`).all());
  const stats = {
    listings: (await db.prepare(`SELECT COUNT(*) n FROM listings l JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id WHERE ${PUBLIC_WHERE} AND l.is_demo = 0`).get()).n,
    profiles: (await db.prepare("SELECT COUNT(*) n FROM profiles WHERE verification = 'approved' AND is_demo = 0").get()).n,
    cities: (await db.prepare(`SELECT COUNT(DISTINCT l.city_id) n FROM listings l JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id WHERE ${PUBLIC_WHERE} AND l.is_demo = 0`).get()).n,
  };
  const clubs = (await db.prepare(`${PROFILE_SELECT} WHERE pr.verification = 'approved' AND u.status = 'active' AND pr.type NOT IN ('coach','educateur') ORDER BY pr.updated_at DESC LIMIT 8`).all()).map(p => serializeProfile(p));
  const coaches = (await db.prepare(`${PROFILE_SELECT} WHERE pr.verification = 'approved' AND u.status = 'active' AND pr.type IN ('coach','educateur') ORDER BY pr.updated_at DESC LIMIT 8`).all()).map(p => serializeProfile(p));
  const posts = (await db.prepare('SELECT id, title, body, image, link, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 3').all());
  return {
    popular, open, camps, holidays, newest, free, discover,
    clubs, coaches, cityCounts, stats, posts,
  };
});

route('GET', '/api/calendar', async (req) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
  const start = `${month}-01`;
  const end = addDays(addDays(start, 32).slice(0, 7) + '-01', -1);
  const rows = (await db.prepare(`${LISTING_SELECT} WHERE ${PUBLIC_WHERE} AND (
      (l.start_date BETWEEN ? AND ?) OR (l.end_date BETWEEN ? AND ?) OR (l.reg_end BETWEEN ? AND ?) OR (l.reg_start BETWEEN ? AND ?)
      OR (l.start_date < ? AND l.end_date > ?))
    ORDER BY l.start_date`).all(start, end, start, end, start, end, start, end, start, end));
  const events = [];
  for (const r of rows) {
    const s = serializeListing(r);
    if (r.reg_start && r.reg_start >= start && r.reg_start <= end) events.push({ date: r.reg_start, type: 'reg_start', label: 'Ouverture des inscriptions', listing: s });
    if (r.reg_end && r.reg_end >= start && r.reg_end <= end) events.push({ date: r.reg_end, type: 'reg_end', label: "Date limite d'inscription", listing: s });
    if (r.start_date && r.start_date >= start && r.start_date <= end) events.push({ date: r.start_date, end: r.end_date, type: 'start', label: r.kind === 'camp' || r.kind === 'stage' ? 'Début' : 'Démarrage', listing: s });
    else if (r.start_date && r.start_date < start && r.end_date && r.end_date >= start) events.push({ date: start, end: r.end_date, type: 'ongoing', label: 'En cours', listing: s });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return { month, start, end, events };
});

route('GET', '/api/map', async () => {
  const rows = (await db.prepare(`SELECT c.id, c.slug, c.name, c.lat, c.lng, pv.slug province, pv.name province_name, g.name gname, g.slug gslug, COUNT(l.id) n
    FROM cities c JOIN provinces pv ON pv.id = c.province_id
    LEFT JOIN listings l ON l.city_id = c.id AND l.id IN (SELECT l.id FROM listings l JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id WHERE ${PUBLIC_WHERE})
    LEFT JOIN categories cat ON cat.id = l.category_id LEFT JOIN category_groups g ON g.id = cat.group_id
    WHERE c.active = 1 GROUP BY c.id, g.id ORDER BY c.name`).all());
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.id)) map.set(r.id, { slug: r.slug, name: r.name, lat: r.lat, lng: r.lng, province: r.province, province_name: r.province_name, total: 0, groups: [] });
    const c = map.get(r.id);
    if (r.gname && r.n) { c.total += r.n; c.groups.push({ name: r.gname, slug: r.gslug, n: r.n }); }
  }
  return { cities: [...map.values()] };
});

route('GET', '/api/templates', async () => ({ items: (await db.prepare('SELECT slug, title, data FROM templates ORDER BY id').all()).map(t => ({ slug: t.slug, title: t.title, ...json(t.data, {}) })) }));
route('GET', '/api/posts', async () => ({ items: (await db.prepare('SELECT id, title, body, image, link, created_at FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 20').all()) }));

// --- Demande de contact (parent -> professionnel) ---
route('POST', '/api/contact-requests', async (req) => {
  rateLimit(req, 'contact', 8, 3600e3);
  const b = req.body;
  if (b.website) throw new HttpError(400, 'Requête refusée.'); // pot de miel anti-spam
  const u = await getUser(req);
  if (u && u.role !== 'parent') throw new HttpError(403, 'Seuls les parents ou responsables légaux peuvent envoyer une demande.');
  if (!V.bool(b.consent)) throw new HttpError(400, 'Merci d\'accepter le partage de vos coordonnées avec le professionnel.');
  if (!V.bool(b.is_guardian)) throw new HttpError(400, 'Les demandes sont réservées aux parents ou responsables légaux.');
  let profile, listing = null;
  if (b.listing_id) {
    listing = (await db.prepare(`${LISTING_SELECT} WHERE l.id = ? AND ${PUBLIC_WHERE}`).get(Number(b.listing_id)));
    if (!listing) throw new HttpError(404, "Cette annonce n'est plus disponible.");
    profile = (await db.prepare('SELECT * FROM profiles WHERE id = ?').get(listing.profile_id));
  } else {
    profile = (await db.prepare("SELECT pr.* FROM profiles pr JOIN users u ON u.id = pr.user_id WHERE pr.id = ? AND pr.verification = 'approved' AND u.status = 'active'").get(Number(b.profile_id)));
  }
  if (!profile) throw new HttpError(404, 'Professionnel introuvable.');
  if (profile.is_demo || listing?.is_demo) throw new HttpError(400, 'Ceci est un exemple fictif : aucune demande ne peut être envoyée.');
  const type = REQUEST_TYPES[b.type] ? b.type : 'info';
  const data = {
    parent_name: V.str(b.parent_name, { required: true, min: 2, max: 100, field: 'nom' }),
    email: V.email(b.email, { required: true }), phone: V.phone(b.phone),
    city: V.str(b.city, { max: 80, field: 'ville' }), activity: V.str(b.activity, { max: 120, field: 'activité' }) || listing?.title || null,
    child_age: V.int(b.child_age, { min: 3, max: 25, field: "âge de l'enfant" }),
    message: V.str(b.message, { required: true, min: 10, max: 2000, field: 'message' }),
    preferred_date: V.str(b.preferred_date, { max: 100, field: 'date souhaitée' }),
  };
  const r = (await db.prepare(`INSERT INTO contact_requests (profile_id, listing_id, user_id, type, parent_name, email, phone, city, activity, child_age, message, preferred_date, consent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`).run(profile.id, listing?.id || null, u?.id || null, type, data.parent_name, data.email, data.phone, data.city, data.activity, data.child_age, data.message, data.preferred_date));
  await notify(profile.user_id, 'demande', `${REQUEST_TYPES[type]} reçue`, `${data.parent_name} – ${data.activity || ''}`, '/espace-pro?tab=demandes');
  return { ok: true, id: Number(r.lastInsertRowid), contact: { phone: listing?.contact_phone || profile.phone, whatsapp: listing?.contact_whatsapp || profile.whatsapp, email: listing?.contact_email || profile.email } };
});

route('POST', '/api/reports', async (req) => {
  rateLimit(req, 'report', 10, 3600e3);
  const b = req.body;
  if (b.website) throw new HttpError(400, 'Requête refusée.');
  const target_type = b.target_type === 'profile' ? 'profile' : 'listing';
  const exists = (await db.prepare(`SELECT id FROM ${target_type === 'profile' ? 'profiles' : 'listings'} WHERE id = ?`).get(Number(b.target_id)));
  if (!exists) throw new HttpError(404, 'Contenu introuvable.');
  if (!REPORT_REASONS.includes(b.reason)) throw new HttpError(400, 'Veuillez choisir un motif.');
  const u = await getUser(req);
  (await db.prepare('INSERT INTO reports (target_type, target_id, reason, details, reporter_email, user_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(target_type, exists.id, b.reason, V.str(b.details, { max: 2000, field: 'détails' }), V.email(b.email), u?.id || null));
  for (const a of (await db.prepare("SELECT id FROM users WHERE role = 'admin'").all())) await notify(a.id, 'signalement', 'Nouveau signalement', `${b.reason}`, '/admin?tab=signalements');
  return { ok: true };
});

route('POST', '/api/site-messages', async (req) => {
  rateLimit(req, 'sitemsg', 5, 3600e3);
  const b = req.body;
  if (b.website) throw new HttpError(400, 'Requête refusée.');
  (await db.prepare('INSERT INTO site_messages (name, email, subject, message) VALUES (?, ?, ?, ?)').run(
    V.str(b.name, { required: true, max: 100, field: 'nom' }), V.email(b.email, { required: true }),
    V.str(b.subject, { max: 150, field: 'objet' }), V.str(b.message, { required: true, min: 10, max: 4000, field: 'message' })));
  return { ok: true };
});

// --- Authentification ---
function checkPassword(pw) {
  const s = String(pw || '');
  if (s.length < 8 || s.length > 200) throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) throw new HttpError(400, 'Le mot de passe doit contenir au moins une lettre et un chiffre.');
  return s;
}
route('POST', '/api/auth/register-parent', async (req, res) => {
  rateLimit(req, 'register', 10, 3600e3);
  const b = req.body;
  if (b.website) throw new HttpError(400, 'Requête refusée.');
  if (!V.bool(b.accept)) throw new HttpError(400, "Veuillez accepter les conditions d'utilisation et la politique de confidentialité.");
  if (!V.bool(b.is_adult)) throw new HttpError(400, "Le compte parent est réservé aux adultes (parents ou responsables légaux).");
  const email = V.email(b.email, { required: true });
  if ((await db.prepare('SELECT id FROM users WHERE email = ?').get(email))) throw new HttpError(409, 'Un compte existe déjà avec cet email.');
  const city = b.city_id ? (await db.prepare('SELECT id FROM cities WHERE id = ?').get(Number(b.city_id))) : null;
  const r = (await db.prepare('INSERT INTO users (email, password_hash, role, name, phone, city_id, preferred_cities) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(email, hashPassword(checkPassword(b.password)), 'parent', V.str(b.name, { required: true, min: 2, max: 100, field: 'nom' }), V.phone(b.phone), city?.id || null, JSON.stringify(city ? [city.id] : [])));
  await createSession(res, Number(r.lastInsertRowid));
  await audit(Number(r.lastInsertRowid), 'register-parent');
  return { ok: true };
});
route('POST', '/api/auth/register-pro', async (req, res) => {
  rateLimit(req, 'register', 10, 3600e3);
  const b = req.body;
  if (b.website) throw new HttpError(400, 'Requête refusée.');
  if (!V.bool(b.accept)) throw new HttpError(400, "Veuillez accepter les conditions d'utilisation.");
  if (!V.bool(b.accept_minors)) throw new HttpError(400, 'Veuillez accepter la charte de protection des mineurs.');
  const email = V.email(b.email, { required: true });
  if ((await db.prepare('SELECT id FROM users WHERE email = ?').get(email))) throw new HttpError(409, 'Un compte existe déjà avec cet email.');
  const type = PROFILE_TYPES[b.type] ? b.type : null;
  if (!type) throw new HttpError(400, 'Veuillez choisir le type de compte.');
  const city = (await db.prepare('SELECT id FROM cities WHERE id = ?').get(Number(b.city_id)));
  if (!city) throw new HttpError(400, 'Veuillez choisir une ville.');
  const name = V.str(b.name, { required: true, min: 2, max: 120, field: 'nom de la structure' });
  const manager = V.str(b.manager_name, { required: true, min: 2, max: 100, field: 'nom du responsable' });
  const phone = V.phone(b.phone, { required: true });
  // Toutes les validations d'abord, puis les écritures (avec annulation manuelle en cas d'échec)
  const password = checkPassword(b.password);
  const whatsapp = V.phone(b.whatsapp, { field: 'WhatsApp' });
  const mainActivity = V.str(b.main_activity, { required: true, max: 100, field: 'activité principale' });
  const description = V.str(b.description, { max: 3000, field: 'description' }) || '';
  const address = V.str(b.address, { max: 200, field: 'adresse' });
  const slug = await uniqueSlug('profiles', name);
  const r = (await db.prepare('INSERT INTO users (email, password_hash, role, name, phone, city_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(email, hashPassword(password), 'pro', manager, phone, city.id));
  const id = Number(r.lastInsertRowid);
  try {
    const pr = (await db.prepare(`INSERT INTO profiles (user_id, slug, type, name, city_id, phone, whatsapp, email, manager_name, main_activity, description, address, logo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, slug, type, name, city.id, phone, whatsapp, email, manager, mainActivity, description, address, parsePhotos([b.logo], 1)[0] || null));
    await refreshProfileSearch(Number(pr.lastInsertRowid));
  } catch (e) { await deleteUser(id); throw e; }
  await createSession(res, id);
  await audit(id, 'register-pro');
  for (const a of (await db.prepare("SELECT id FROM users WHERE role = 'admin'").all())) await notify(a.id, 'validation', 'Nouveau professionnel à valider', name, '/admin?tab=pros');
  return { ok: true };
});
route('POST', '/api/auth/login', async (req, res) => {
  rateLimit(req, 'login', 10, 900e3);
  const email = V.email(req.body.email, { required: true });
  const u = (await db.prepare('SELECT * FROM users WHERE email = ?').get(email));
  if (!u || !verifyPassword(String(req.body.password || ''), u.password_hash)) throw new HttpError(401, 'Email ou mot de passe incorrect.');
  if (u.status !== 'active') throw new HttpError(403, 'Ce compte est suspendu. Contactez G-Sports.');
  await createSession(res, u.id);
  return { ok: true, role: u.role };
});
route('POST', '/api/auth/logout', async (req, res) => {
  if (req.cookies.gs_session) (await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(req.cookies.gs_session)));
  res.setCookie('gs_session', '', 0);
  return { ok: true };
});
route('POST', '/api/auth/change-password', async (req) => {
  const u = await requireUser(req);
  rateLimit(req, 'pwd', 10, 900e3);
  const row = (await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id));
  if (!verifyPassword(String(req.body.current || ''), row.password_hash)) throw new HttpError(400, 'Mot de passe actuel incorrect.');
  (await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(checkPassword(req.body.password)), u.id));
  (await db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(u.id, sha256(req.cookies.gs_session)));
  return { ok: true };
});
route('DELETE', '/api/account', async (req, res) => {
  const u = await requireUser(req);
  if (u.role === 'admin' && (await db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get()).n <= 1) throw new HttpError(400, 'Impossible de supprimer le dernier administrateur.');
  const row = (await db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id));
  if (!verifyPassword(String(req.body.password || ''), row.password_hash)) throw new HttpError(400, 'Mot de passe incorrect.');
  await deleteUser(u.id);
  await audit(null, 'account-deleted', { role: u.role });
  res.setCookie('gs_session', '', 0);
  return { ok: true };
});

// --- Espace parent ---
route('PUT', '/api/me/settings', async (req) => {
  const u = await requireUser(req);
  const b = req.body;
  const wanted = (Array.isArray(b.preferred_cities) ? b.preferred_cities : []).map(Number).filter(Number.isInteger).slice(0, 10);
  const prefs = wanted.length ? (await db.prepare(`SELECT id FROM cities WHERE id IN (${wanted.map(() => '?').join(',')})`).all(...wanted)).map(r => r.id) : [];
  (await db.prepare('UPDATE users SET name = ?, phone = ?, city_id = ?, email_notifications = ?, preferred_cities = ? WHERE id = ?').run(
    V.str(b.name, { required: true, min: 2, max: 100, field: 'nom' }), V.phone(b.phone),
    b.city_id ? (db.prepare('SELECT id FROM cities WHERE id = ?').get(Number(b.city_id))?.id || null) : null,
    V.bool(b.email_notifications), JSON.stringify(prefs), u.id));
  return { ok: true };
});
route('GET', '/api/me/children', async (req) => ({ items: (await db.prepare('SELECT id, nickname, age, interests FROM children WHERE user_id = ? ORDER BY age').all((await requireUser(req, 'parent')).id)) }));
route('POST', '/api/me/children', async (req) => {
  const u = await requireUser(req, 'parent');
  if ((await db.prepare('SELECT COUNT(*) n FROM children WHERE user_id = ?').get(u.id)).n >= 10) throw new HttpError(400, 'Maximum 10 profils enfants.');
  const r = (await db.prepare('INSERT INTO children (user_id, nickname, age, interests) VALUES (?, ?, ?, ?)').run(u.id,
    V.str(req.body.nickname, { required: true, max: 40, field: 'prénom ou surnom' }), V.int(req.body.age, { required: true, min: 3, max: 25, field: 'âge' }),
    V.list(req.body.interests, null, { max: 10 }).join(',')));
  return { ok: true, id: Number(r.lastInsertRowid) };
});
route('PUT', '/api/me/children/:id', async (req, res, { id }) => {
  const u = await requireUser(req, 'parent');
  (await db.prepare('UPDATE children SET nickname = ?, age = ?, interests = ? WHERE id = ? AND user_id = ?').run(
    V.str(req.body.nickname, { required: true, max: 40, field: 'prénom ou surnom' }), V.int(req.body.age, { required: true, min: 3, max: 25, field: 'âge' }),
    V.list(req.body.interests, null, { max: 10 }).join(','), Number(id), u.id));
  return { ok: true };
});
route('DELETE', '/api/me/children/:id', async (req, res, { id }) => { (await db.prepare('DELETE FROM children WHERE id = ? AND user_id = ?').run(Number(id), (await requireUser(req, 'parent')).id)); return { ok: true }; });

route('GET', '/api/me/favorites', async (req) => {
  const u = await requireUser(req);
  const ids = (await db.prepare('SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(u.id)).map(r => r.listing_id);
  return { ids, items: ids.length ? (await searchListings({ ids: ids.join(','), limit: 100 })).items : [] };
});
route('POST', '/api/me/favorites/:id', async (req, res, { id }) => {
  const u = await requireUser(req);
  if (!(await db.prepare('SELECT 1 FROM listings WHERE id = ?').get(Number(id)))) throw new HttpError(404, 'Annonce introuvable.');
  (await db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)').run(u.id, Number(id)));
  return { ok: true };
});
route('DELETE', '/api/me/favorites/:id', async (req, res, { id }) => { (await db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run((await requireUser(req)).id, Number(id))); return { ok: true }; });
route('POST', '/api/me/favorites-sync', async (req) => {
  const u = await requireUser(req);
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(Number).filter(Number.isInteger).slice(0, 200);
  for (const id of ids) if ((await db.prepare('SELECT 1 FROM listings WHERE id = ?').get(id))) (await db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)').run(u.id, id));
  return { ok: true };
});

route('GET', '/api/me/alerts', async (req) => ({ items: (await db.prepare(`SELECT a.id, a.age, a.kinds, c.name city, g.name grp FROM alerts a LEFT JOIN cities c ON c.id = a.city_id
  LEFT JOIN category_groups g ON g.id = a.group_id WHERE a.user_id = ? ORDER BY a.id DESC`).all((await requireUser(req)).id)) }));
route('POST', '/api/me/alerts', async (req) => {
  const u = await requireUser(req);
  if ((await db.prepare('SELECT COUNT(*) n FROM alerts WHERE user_id = ?').get(u.id)).n >= 20) throw new HttpError(400, 'Maximum 20 alertes.');
  const b = req.body;
  const city = b.city_id ? (await db.prepare('SELECT id FROM cities WHERE id = ?').get(Number(b.city_id))) : null;
  const group = b.group_id ? (await db.prepare('SELECT id FROM category_groups WHERE id = ?').get(Number(b.group_id))) : null;
  (await db.prepare('INSERT INTO alerts (user_id, city_id, group_id, age, kinds) VALUES (?, ?, ?, ?, ?)').run(u.id, city?.id || null, group?.id || null,
    V.int(b.age, { min: 3, max: 25, field: 'âge' }), V.list(b.kinds, Object.keys(KINDS)).join(',')));
  return { ok: true };
});
route('DELETE', '/api/me/alerts/:id', async (req, res, { id }) => { (await db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(Number(id), (await requireUser(req)).id)); return { ok: true }; });

route('GET', '/api/me/requests', async (req) => {
  const u = await requireUser(req);
  const rows = (await db.prepare(`SELECT r.id, r.type, r.activity, r.child_age, r.message, r.status, r.reply, r.replied_at, r.created_at, r.preferred_date,
    pr.name org_name, pr.slug org_slug, pr.type org_type, pr.phone org_phone, pr.whatsapp org_whatsapp, l.id lid, l.slug lslug, l.title ltitle
    FROM contact_requests r JOIN profiles pr ON pr.id = r.profile_id LEFT JOIN listings l ON l.id = r.listing_id
    WHERE r.user_id = ? ORDER BY r.created_at DESC`).all(u.id));
  return { items: rows.map(r => ({ ...r, type_label: REQUEST_TYPES[r.type], org_url: `/${r.org_type === 'coach' || r.org_type === 'educateur' ? 'coachs' : 'clubs'}/${r.org_slug}`, listing_url: r.lid ? `/annonce/${r.lid}-${r.lslug}` : null })) };
});
route('GET', '/api/me/notifications', async (req) => ({ items: (await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all((await requireUser(req)).id)) }));
route('POST', '/api/me/notifications/read', async (req) => { (await db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run((await requireUser(req)).id)); return { ok: true }; });

// --- Téléversement d'images ---
route('POST', '/api/uploads', async (req) => {
  const u = await requireUser(req, 'pro', 'admin');
  rateLimit(req, 'upload', 60, 3600e3);
  const url = await saveImage(req.body.data);
  await audit(u.id, 'upload', { url });
  return { url };
});

// --- Espace professionnel ---
route('GET', '/api/pro/dashboard', async (req) => {
  const u = await requireUser(req, 'pro');
  const p = await getOwnProfile(u);
  const pFull = (await db.prepare(`${PROFILE_SELECT} WHERE pr.id = ?`).get(p.id));
  const favCounts = Object.fromEntries((await db.prepare('SELECT f.listing_id id, COUNT(*) n FROM favorites f JOIN listings l ON l.id = f.listing_id WHERE l.profile_id = ? GROUP BY f.listing_id').all(p.id)).map(r => [r.id, r.n]));
  const reqCounts = Object.fromEntries((await db.prepare('SELECT listing_id id, COUNT(*) n FROM contact_requests WHERE profile_id = ? AND listing_id IS NOT NULL GROUP BY listing_id').all(p.id)).map(r => [r.id, r.n]));
  const listings = (await db.prepare(`${LISTING_SELECT} WHERE l.profile_id = ? ORDER BY l.updated_at DESC`).all(p.id)).map(l => {
    const s = serializeListing(l, true);
    s.favorites = favCounts[l.id] || 0;
    s.requests = reqCounts[l.id] || 0;
    s.admin_note = l.admin_note; s.is_visible = l.status === 'published' && (!l.expires_at || l.expires_at >= today()) && p.verification === 'approved';
    return s;
  });
  const soon = addDays(today(), 14);
  const stats = {
    active: listings.filter(l => l.is_visible).length,
    pending: listings.filter(l => l.status === 'pending').length,
    expired: listings.filter(l => l.status === 'expired').length,
    views: listings.reduce((s, l) => s + l.views, 0) + p.views,
    favorites: listings.reduce((s, l) => s + l.favorites, 0),
    requests: (await db.prepare('SELECT COUNT(*) n FROM contact_requests WHERE profile_id = ?').get(p.id)).n,
    new_requests: (await db.prepare("SELECT COUNT(*) n FROM contact_requests WHERE profile_id = ? AND status = 'nouveau'").get(p.id)).n,
    inscriptions: (await db.prepare("SELECT COUNT(*) n FROM contact_requests WHERE profile_id = ? AND type = 'inscription' AND status IN ('nouveau','lu')").get(p.id)).n,
  };
  const expiring = listings.filter(l => l.is_visible && l.expires_at && l.expires_at <= soon);
  return { profile: serializeProfile(pFull, true), listings, stats, expiring };
});
route('PUT', '/api/pro/profile', async (req) => {
  const u = await requireUser(req, 'pro');
  const p = await getOwnProfile(u);
  const data = await parseProfileInput(req.body, p);
  const cols = Object.keys(data);
  (await db.prepare(`UPDATE profiles SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...cols.map(c => data[c]), p.id));
  await refreshProfileSearch(p.id);
  for (const l of (await db.prepare('SELECT id FROM listings WHERE profile_id = ?').all(p.id))) await refreshListingSearch(l.id);
  return { ok: true };
});
route('GET', '/api/pro/listings/:id', async (req, res, { id }) => {
  const { l } = await getOwnListing(await requireUser(req, 'pro'), id);
  const full = (await db.prepare(`${LISTING_SELECT} WHERE l.id = ?`).get(l.id));
  return serializeListing(full, true);
});
route('POST', '/api/pro/listings', async (req) => {
  const u = await requireUser(req, 'pro');
  const p = await getOwnProfile(u);
  rateLimit(req, 'listing-create', 30, 3600e3);
  if ((await db.prepare("SELECT COUNT(*) n FROM listings WHERE profile_id = ? AND status != 'expired'").get(p.id)).n >= 100) throw new HttpError(400, 'Nombre maximum d\'annonces atteint (100).');
  const d = await parseListingInput(req.body);
  const draft = V.bool(req.body.draft);
  const status = draft ? 'draft' : (p.verification === 'approved' ? 'published' : 'pending');
  const cols = Object.keys(d);
  const r = (await db.prepare(`INSERT INTO listings (profile_id, slug, status, expires_at, published_at, is_demo, ${cols.join(', ')})
    VALUES (?, ?, ?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`).run(p.id, slugify(d.title), status, computeExpiry(d),
    status === 'published' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, p.is_demo, ...cols.map(c => d[c])));
  const id = Number(r.lastInsertRowid);
  await refreshListingSearch(id);
  if (status === 'published') await notifyAlertsFor(id);
  await audit(u.id, 'listing-create', { id, status });
  return { ok: true, id, status };
});
route('PUT', '/api/pro/listings/:id', async (req, res, { id }) => {
  const u = await requireUser(req, 'pro');
  const { p, l } = await getOwnListing(u, id);
  if (l.status === 'suspended' && l.admin_note) { /* modification permise ; reste suspendue jusqu'à revue */ }
  const d = await parseListingInput(req.body);
  const cols = Object.keys(d);
  let status = l.status;
  const draft = V.bool(req.body.draft);
  if (draft && l.status !== 'published') status = 'draft';
  else if (l.status === 'draft' || l.status === 'expired') status = p.verification === 'approved' ? 'published' : 'pending';
  const publishedAt = status === 'published' && !l.published_at ? new Date().toISOString().slice(0, 19).replace('T', ' ') : l.published_at;
  (await db.prepare(`UPDATE listings SET ${cols.map(c => `${c} = ?`).join(', ')}, slug = ?, status = ?, expires_at = ?, published_at = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(...cols.map(c => d[c]), slugify(d.title), status, computeExpiry(d), publishedAt, l.id));
  await refreshListingSearch(l.id);
  if (status === 'published' && l.status !== 'published') await notifyAlertsFor(l.id);
  if (l.status === 'published') {
    for (const f of (await db.prepare('SELECT user_id FROM favorites WHERE listing_id = ?').all(l.id)))
      await notify(f.user_id, 'favori', 'Annonce favorite modifiée', d.title, `/annonce/${l.id}-${slugify(d.title)}`);
  }
  return { ok: true, status };
});
route('POST', '/api/pro/listings/:id/:action', async (req, res, { id, action }) => {
  const u = await requireUser(req, 'pro');
  const { p, l } = await getOwnListing(u, id);
  if (action === 'renew') {
    if (l.end_date && l.end_date < today()) throw new HttpError(400, 'Les dates de cette annonce sont passées : modifiez-les avant de la renouveler.');
    if (l.status === 'suspended' && l.admin_note) throw new HttpError(403, 'Cette annonce a été suspendue par la modération.');
    const status = p.verification === 'approved' ? 'published' : 'pending';
    (await db.prepare("UPDATE listings SET status = ?, expires_at = ?, published_at = COALESCE(published_at, datetime('now')), updated_at = datetime('now') WHERE id = ?").run(status, l.end_date || addDays(today(), LISTING_TTL_DAYS), l.id));
    return { ok: true, status };
  }
  if (action === 'suspend') { (await db.prepare("UPDATE listings SET status = 'suspended', admin_note = NULL, updated_at = datetime('now') WHERE id = ?").run(l.id)); return { ok: true }; }
  if (action === 'resume') {
    if (l.status !== 'suspended') throw new HttpError(400, "L'annonce n'est pas suspendue.");
    if (l.admin_note) throw new HttpError(403, 'Cette annonce a été suspendue par la modération. Contactez G-Sports.');
    if (l.expires_at && l.expires_at < today()) throw new HttpError(400, 'Annonce expirée : renouvelez-la.');
    (await db.prepare("UPDATE listings SET status = ?, updated_at = datetime('now') WHERE id = ?").run(p.verification === 'approved' ? 'published' : 'pending', l.id));
    return { ok: true };
  }
  if (action === 'duplicate') {
    const cols = Object.keys(l).filter(c => !['id', 'status', 'views', 'created_at', 'updated_at', 'published_at', 'admin_note', 'expires_at'].includes(c));
    const r = (await db.prepare(`INSERT INTO listings (${cols.join(', ')}, status) VALUES (${cols.map(() => '?').join(', ')}, 'draft')`).run(...cols.map(c => c === 'title' ? `${l.title} (copie)`.slice(0, 120) : l[c])));
    return { ok: true, id: Number(r.lastInsertRowid) };
  }
  throw new HttpError(404, 'Action inconnue.');
});
route('DELETE', '/api/pro/listings/:id', async (req, res, { id }) => {
  const u = await requireUser(req, 'pro');
  const { l } = await getOwnListing(u, id);
  await deleteListing(l.id);
  await audit(u.id, 'listing-delete', { id: l.id });
  return { ok: true };
});
route('GET', '/api/pro/requests', async (req) => {
  const p = await getOwnProfile(await requireUser(req, 'pro'));
  const rows = (await db.prepare(`SELECT r.*, l.title ltitle, l.slug lslug FROM contact_requests r LEFT JOIN listings l ON l.id = r.listing_id
    WHERE r.profile_id = ? ORDER BY r.created_at DESC LIMIT 500`).all(p.id));
  return { items: rows.map(r => ({ ...r, type_label: REQUEST_TYPES[r.type], listing_url: r.listing_id ? `/annonce/${r.listing_id}-${r.lslug}` : null })) };
});
route('PUT', '/api/pro/requests/:id', async (req, res, { id }) => {
  const u = await requireUser(req, 'pro');
  const p = await getOwnProfile(u);
  const r = (await db.prepare('SELECT * FROM contact_requests WHERE id = ? AND profile_id = ?').get(Number(id), p.id));
  if (!r) throw new HttpError(404, 'Demande introuvable.');
  const status = V.oneOf(req.body.status, ['nouveau', 'lu', 'repondu', 'archive'], r.status);
  const reply = V.str(req.body.reply, { max: 2000, field: 'réponse' });
  if (reply) {
    (await db.prepare("UPDATE contact_requests SET reply = ?, replied_at = datetime('now'), status = 'repondu' WHERE id = ?").run(reply, r.id));
    if (r.user_id) await notify(r.user_id, 'reponse', `Réponse de ${p.name}`, reply.slice(0, 200), '/espace-parent?tab=demandes');
    mailer.send({ to: r.email, subject: `G-Sports – Réponse de ${p.name}`, text: `${reply}\n\nContact : ${p.phone || ''} ${p.email || ''}` });
  } else (await db.prepare('UPDATE contact_requests SET status = ? WHERE id = ?').run(status, r.id));
  return { ok: true };
});

// --- Administration ---
route('GET', '/api/admin/stats', async (req) => {
  await requireUser(req, 'admin');
  const one = async (sql, ...p) => (await db.prepare(sql).get(...p)).n;
  return {
    users: { parents: await one("SELECT COUNT(*) n FROM users WHERE role = 'parent'"), pros: await one("SELECT COUNT(*) n FROM users WHERE role = 'pro'"), admins: await one("SELECT COUNT(*) n FROM users WHERE role = 'admin'") },
    profiles: { pending: await one("SELECT COUNT(*) n FROM profiles WHERE verification = 'pending'"), approved: await one("SELECT COUNT(*) n FROM profiles WHERE verification = 'approved'"), rejected: await one("SELECT COUNT(*) n FROM profiles WHERE verification = 'rejected'") },
    listings: Object.fromEntries((await db.prepare('SELECT status, COUNT(*) n FROM listings GROUP BY status').all()).map(r => [r.status, r.n])),
    demo: await one('SELECT COUNT(*) n FROM listings WHERE is_demo = 1') + await one('SELECT COUNT(*) n FROM profiles WHERE is_demo = 1'),
    requests: await one('SELECT COUNT(*) n FROM contact_requests'), reports: await one("SELECT COUNT(*) n FROM reports WHERE status = 'ouvert'"),
    messages: await one("SELECT COUNT(*) n FROM site_messages WHERE status = 'nouveau'"),
    views: await one('SELECT COALESCE(SUM(views),0) n FROM listings'), favorites: await one('SELECT COUNT(*) n FROM favorites'),
    byCity: (await db.prepare(`SELECT c.name, COUNT(l.id) n FROM listings l JOIN cities c ON c.id = l.city_id WHERE l.status = 'published' GROUP BY c.id ORDER BY n DESC LIMIT 15`).all()),
    byGroup: (await db.prepare(`SELECT g.name, COUNT(l.id) n FROM listings l JOIN categories cat ON cat.id = l.category_id JOIN category_groups g ON g.id = cat.group_id WHERE l.status = 'published' GROUP BY g.id ORDER BY n DESC`).all()),
  };
});
route('GET', '/api/admin/profiles', async (req) => {
  await requireUser(req, 'admin');
  const v = ['pending', 'approved', 'rejected'].includes(req.query.verification) ? req.query.verification : null;
  const rows = (await db.prepare(`${PROFILE_SELECT.replace('SELECT pr.*,', 'SELECT pr.*, u.email user_email, u.status user_status, u.created_at user_created,')} ${v ? 'WHERE pr.verification = ?' : ''} ORDER BY pr.created_at DESC LIMIT 500`).all(...(v ? [v] : [])));
  return { items: rows.map(r => ({ ...serializeProfile(r, true), user_email: r.user_email, user_status: r.user_status, admin_note: r.admin_note, user_id: r.user_id })) };
});
route('PUT', '/api/admin/profiles/:id', async (req, res, { id }) => {
  const a = await requireUser(req, 'admin');
  const p = (await db.prepare('SELECT * FROM profiles WHERE id = ?').get(Number(id)));
  if (!p) throw new HttpError(404, 'Profil introuvable.');
  const verification = V.oneOf(req.body.verification, ['pending', 'approved', 'rejected'], p.verification);
  const note = V.str(req.body.admin_note, { max: 1000, field: 'note' });
  {
    (await db.prepare("UPDATE profiles SET verification = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?").run(verification, note, p.id));
    if (verification === 'approved' && p.verification !== 'approved') {
      const pend = (await db.prepare("SELECT id FROM listings WHERE profile_id = ? AND status = 'pending'").all(p.id));
      (await db.prepare("UPDATE listings SET status = 'published', published_at = COALESCE(published_at, datetime('now')) WHERE profile_id = ? AND status = 'pending'").run(p.id));
      for (const l of pend) await notifyAlertsFor(l.id);
    }
  }
  const msg = verification === 'approved' ? 'Votre profil a été validé : vos annonces sont visibles.' : verification === 'rejected' ? `Votre profil n'a pas été validé. ${note || ''}` : 'Votre profil est en cours de vérification.';
  await notify(p.user_id, 'validation', 'Mise à jour de votre profil', msg, '/espace-pro');
  await audit(a.id, 'profile-verification', { id: p.id, verification });
  return { ok: true };
});
route('GET', '/api/admin/listings', async (req) => {
  await requireUser(req, 'admin');
  const st = ['draft', 'pending', 'published', 'suspended', 'expired'].includes(req.query.status) ? req.query.status : null;
  const params = []; const where = [];
  if (st) { where.push('l.status = ?'); params.push(st); }
  if (req.query.q) { where.push('l.search_text LIKE ?'); params.push(`%${normalize(req.query.q)}%`); }
  const rows = (await db.prepare(`${LISTING_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY l.updated_at DESC LIMIT 500`).all(...params));
  return { items: rows.map(r => ({ ...serializeListing(r), admin_note: r.admin_note, org_verification: r.org_verification, views: r.views, photos: json(r.photos, []) })) };
});
route('PUT', '/api/admin/listings/:id', async (req, res, { id }) => {
  const a = await requireUser(req, 'admin');
  const l = (await db.prepare('SELECT l.*, pr.user_id FROM listings l JOIN profiles pr ON pr.id = l.profile_id WHERE l.id = ?').get(Number(id)));
  if (!l) throw new HttpError(404, 'Annonce introuvable.');
  const status = V.oneOf(req.body.status, ['pending', 'published', 'suspended', 'expired'], l.status);
  const note = V.str(req.body.admin_note, { max: 1000, field: 'note' });
  (await db.prepare("UPDATE listings SET status = ?, admin_note = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END, updated_at = datetime('now') WHERE id = ?")
    .run(status, status === 'suspended' ? (note || 'Suspendue par la modération') : note, status, l.id));
  if (status !== l.status) await notify(l.user_id, 'moderation', status === 'suspended' ? 'Annonce suspendue par la modération' : 'Statut de votre annonce mis à jour', `${l.title}${note ? ' – ' + note : ''}`, '/espace-pro?tab=annonces');
  await audit(a.id, 'listing-moderation', { id: l.id, status });
  return { ok: true };
});
route('DELETE', '/api/admin/listings/:id', async (req, res, { id }) => {
  const a = await requireUser(req, 'admin');
  const l = (await db.prepare('SELECT l.title, pr.user_id FROM listings l JOIN profiles pr ON pr.id = l.profile_id WHERE l.id = ?').get(Number(id)));
  if (!l) throw new HttpError(404, 'Annonce introuvable.');
  await deleteListing(Number(id));
  await notify(l.user_id, 'moderation', 'Annonce supprimée par la modération', l.title, '/espace-pro');
  await audit(a.id, 'listing-delete-admin', { id: Number(id) });
  return { ok: true };
});
route('DELETE', '/api/admin/photo', async (req) => {
  const a = await requireUser(req, 'admin');
  const { target_type, target_id, url } = req.body;
  const table = target_type === 'profile' ? 'profiles' : 'listings';
  const row = (await db.prepare(`SELECT id, photos, cover${table === 'profiles' ? ', logo' : ''} FROM ${table} WHERE id = ?`).get(Number(target_id)));
  if (!row) throw new HttpError(404, 'Contenu introuvable.');
  const photos = json(row.photos, []).filter(p => p !== url);
  (await db.prepare(`UPDATE ${table} SET photos = ?, cover = CASE WHEN cover = ? THEN ? ELSE cover END${table === 'profiles' ? ", logo = CASE WHEN logo = ? THEN NULL ELSE logo END" : ''} WHERE id = ?`)
    .run(...[JSON.stringify(photos), url, photos[0] || null, ...(table === 'profiles' ? [url] : []), row.id]));
  await audit(a.id, 'photo-remove', { table, id: row.id, url });
  return { ok: true };
});
route('GET', '/api/admin/reports', async (req) => {
  await requireUser(req, 'admin');
  const rows = (await db.prepare('SELECT * FROM reports ORDER BY CASE status WHEN \'ouvert\' THEN 0 ELSE 1 END, created_at DESC LIMIT 300').all());
  for (const r of rows) {
    const t = r.target_type === 'profile' ? (await db.prepare('SELECT name title, slug, type FROM profiles WHERE id = ?').get(r.target_id)) : (await db.prepare('SELECT title, slug, status FROM listings WHERE id = ?').get(r.target_id));
    r.target = t || null;
    r.target_url = !t ? null : r.target_type === 'profile' ? `/${t.type === 'coach' || t.type === 'educateur' ? 'coachs' : 'clubs'}/${t.slug}` : `/annonce/${r.target_id}-${t.slug}`;
  }
  return { items: rows };
});
route('PUT', '/api/admin/reports/:id', async (req, res, { id }) => {
  const a = await requireUser(req, 'admin');
  (await db.prepare('UPDATE reports SET status = ?, admin_note = ? WHERE id = ?').run(V.oneOf(req.body.status, ['ouvert', 'traite', 'rejete'], 'traite'), V.str(req.body.admin_note, { max: 1000, field: 'note' }), Number(id)));
  await audit(a.id, 'report-update', { id: Number(id) });
  return { ok: true };
});
// Catégories
route('POST', '/api/admin/groups', async (req) => {
  await requireUser(req, 'admin'); const b = req.body;
  const name = V.str(b.name, { required: true, max: 80, field: 'nom' });
  (await db.prepare('INSERT INTO category_groups (slug, name, icon, color, kind, sort) VALUES (?, ?, ?, ?, ?, ?)').run(await uniqueSlug('category_groups', name), name, V.str(b.icon, { max: 8, field: 'icône' }) || '⭐', V.str(b.color, { max: 9, field: 'couleur' }) || '#16B8C5', V.oneOf(b.kind, ['sport', 'loisir', 'educatif'], 'sport'), 99));
  return { ok: true };
});
route('PUT', '/api/admin/groups/:id', async (req, res, { id }) => {
  await requireUser(req, 'admin'); const b = req.body;
  (await db.prepare('UPDATE category_groups SET name = ?, icon = ?, color = ?, kind = ?, active = ?, sort = ? WHERE id = ?').run(V.str(b.name, { required: true, max: 80, field: 'nom' }),
    V.str(b.icon, { max: 8, field: 'icône' }) || '⭐', V.str(b.color, { max: 9, field: 'couleur' }) || '#16B8C5', V.oneOf(b.kind, ['sport', 'loisir', 'educatif'], 'sport'), V.bool(b.active ?? 1), V.int(b.sort, { min: 0, max: 999 }) ?? 0, Number(id)));
  return { ok: true };
});
route('GET', '/api/admin/categories', async (req) => { await requireUser(req, 'admin'); return { groups: (await db.prepare('SELECT * FROM category_groups ORDER BY sort, name').all()), items: (await db.prepare('SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.category_id = c.id) n FROM categories c ORDER BY group_id, sort, name').all()) }; });
route('POST', '/api/admin/categories', async (req) => {
  await requireUser(req, 'admin');
  const name = V.str(req.body.name, { required: true, max: 80, field: 'nom' });
  const g = (await db.prepare('SELECT id FROM category_groups WHERE id = ?').get(Number(req.body.group_id)));
  if (!g) throw new HttpError(400, 'Groupe invalide.');
  (await db.prepare('INSERT INTO categories (slug, name, group_id, sort) VALUES (?, ?, ?, 99)').run(await uniqueSlug('categories', name), name, g.id));
  return { ok: true };
});
route('PUT', '/api/admin/categories/:id', async (req, res, { id }) => {
  await requireUser(req, 'admin');
  (await db.prepare('UPDATE categories SET name = ?, active = ?, group_id = COALESCE(?, group_id) WHERE id = ?').run(V.str(req.body.name, { required: true, max: 80, field: 'nom' }), V.bool(req.body.active ?? 1), V.int(req.body.group_id) , Number(id)));
  return { ok: true };
});
route('DELETE', '/api/admin/categories/:id', async (req, res, { id }) => {
  await requireUser(req, 'admin');
  if ((await db.prepare('SELECT COUNT(*) n FROM listings WHERE category_id = ?').get(Number(id))).n) throw new HttpError(400, 'Catégorie utilisée par des annonces : désactivez-la plutôt.');
  (await db.prepare('DELETE FROM categories WHERE id = ?').run(Number(id)));
  return { ok: true };
});
// Villes et provinces
route('GET', '/api/admin/cities', async (req) => { await requireUser(req, 'admin'); return { provinces: (await db.prepare('SELECT * FROM provinces ORDER BY name').all()), items: (await db.prepare('SELECT c.*, pv.name province_name FROM cities c JOIN provinces pv ON pv.id = c.province_id ORDER BY c.name').all()) }; });
route('POST', '/api/admin/cities', async (req) => {
  await requireUser(req, 'admin'); const b = req.body;
  const name = V.str(b.name, { required: true, max: 80, field: 'nom' });
  const pv = (await db.prepare('SELECT id FROM provinces WHERE id = ?').get(Number(b.province_id)));
  if (!pv) throw new HttpError(400, 'Province invalide.');
  (await db.prepare('INSERT INTO cities (slug, name, province_id, lat, lng, featured) VALUES (?, ?, ?, ?, ?, ?)').run(await uniqueSlug('cities', name), name, pv.id,
    V.num(b.lat, { min: -4.5, max: 2.5, field: 'latitude' }), V.num(b.lng, { min: 8.5, max: 15, field: 'longitude' }), V.bool(b.featured)));
  return { ok: true };
});
route('PUT', '/api/admin/cities/:id', async (req, res, { id }) => {
  await requireUser(req, 'admin'); const b = req.body;
  (await db.prepare('UPDATE cities SET name = ?, province_id = ?, lat = ?, lng = ?, featured = ?, active = ? WHERE id = ?').run(V.str(b.name, { required: true, max: 80, field: 'nom' }),
    Number(b.province_id), V.num(b.lat, { min: -4.5, max: 2.5, field: 'latitude' }), V.num(b.lng, { min: 8.5, max: 15, field: 'longitude' }), V.bool(b.featured), V.bool(b.active ?? 1), Number(id)));
  return { ok: true };
});
route('PUT', '/api/admin/provinces/:id', async (req, res, { id }) => {
  await requireUser(req, 'admin');
  (await db.prepare('UPDATE provinces SET name = ?, capital = ? WHERE id = ?').run(V.str(req.body.name, { required: true, max: 80, field: 'nom' }), V.str(req.body.capital, { max: 80, field: 'chef-lieu' }), Number(id)));
  return { ok: true };
});
// Comptes
route('GET', '/api/admin/users', async (req) => {
  await requireUser(req, 'admin');
  const params = []; let where = '';
  if (req.query.q) { where = 'WHERE u.email LIKE ? OR u.name LIKE ?'; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  return { items: (await db.prepare(`SELECT u.id, u.email, u.role, u.name, u.status, u.created_at, u.last_login, (SELECT COUNT(*) FROM children ch WHERE ch.user_id = u.id) children FROM users u ${where} ORDER BY u.created_at DESC LIMIT 500`).all(...params)) };
});
route('PUT', '/api/admin/users/:id', async (req, res, { id }) => {
  const a = await requireUser(req, 'admin');
  if (Number(id) === a.id) throw new HttpError(400, 'Vous ne pouvez pas modifier votre propre compte ici.');
  const status = V.oneOf(req.body.status, ['active', 'suspended'], 'active');
  (await db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, Number(id)));
  if (status === 'suspended') (await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(id)));
  await audit(a.id, 'user-status', { id: Number(id), status });
  return { ok: true };
});
// Contenus
route('PUT', '/api/admin/settings/home', async (req) => {
  await requireUser(req, 'admin'); const b = req.body;
  const v = {
    heroTitle: V.str(b.heroTitle, { required: true, max: 140, field: 'titre' }), heroSubtitle: V.str(b.heroSubtitle, { max: 240, field: 'sous-titre' }) || '',
    heroImage: /^[\w-]+$/.test(b.heroImage || '') ? b.heroImage : 'basket-joie', slogan: V.str(b.slogan, { max: 140, field: 'slogan' }) || '',
    banner: V.str(b.banner, { max: 300, field: 'bandeau' }) || '',
    // Périodes de vacances scolaires saisies par l'administration (aucune date inventée)
    holidays: (Array.isArray(b.holidays) ? b.holidays : []).slice(0, 12).map(h => ({
      name: V.str(h.name, { required: true, max: 60, field: 'nom des vacances' }),
      start: V.date(h.start, { field: 'date de début' }), end: V.date(h.end, { field: 'date de fin' }),
    })).filter(h => h.start && h.end && h.end >= h.start),
  };
  (await db.prepare("INSERT INTO settings (key, value) VALUES ('home', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(v)));
  return { ok: true };
});
route('GET', '/api/admin/posts', async (req) => { await requireUser(req, 'admin'); return { items: (await db.prepare('SELECT * FROM posts ORDER BY created_at DESC').all()) }; });
route('POST', '/api/admin/posts', async (req) => {
  await requireUser(req, 'admin'); const b = req.body;
  (await db.prepare('INSERT INTO posts (title, body, image, link, published) VALUES (?, ?, ?, ?, ?)').run(V.str(b.title, { required: true, max: 140, field: 'titre' }), V.str(b.body, { required: true, max: 4000, field: 'texte' }),
    parsePhotos([b.image], 1)[0] || null, V.str(b.link, { max: 200, field: 'lien' }), V.bool(b.published ?? 1)));
  return { ok: true };
});
route('DELETE', '/api/admin/posts/:id', async (req, res, { id }) => { await requireUser(req, 'admin'); (await db.prepare('DELETE FROM posts WHERE id = ?').run(Number(id))); return { ok: true }; });
route('POST', '/api/admin/broadcast', async (req) => {
  const a = await requireUser(req, 'admin');
  const audience = V.oneOf(req.body.audience, ['parent', 'pro', 'all'], 'all');
  const title = V.str(req.body.title, { required: true, max: 120, field: 'titre' });
  const body = V.str(req.body.body, { max: 1000, field: 'message' });
  const users = (await db.prepare(`SELECT id FROM users WHERE status = 'active' ${audience === 'all' ? '' : 'AND role = ?'}`).all(...(audience === 'all' ? [] : [audience])));
  for (let i = 0; i < users.length; i += 200) await db.batch(users.slice(i, i + 200).map(u => ['INSERT INTO notifications (user_id, type, title, body) VALUES (?, ?, ?, ?)', u.id, 'info', title, body]));
  await audit(a.id, 'broadcast', { audience, n: users.length });
  return { ok: true, sent: users.length };
});
route('GET', '/api/admin/messages', async (req) => { await requireUser(req, 'admin'); return { items: (await db.prepare('SELECT * FROM site_messages ORDER BY created_at DESC LIMIT 300').all()) }; });
route('PUT', '/api/admin/messages/:id', async (req, res, { id }) => { await requireUser(req, 'admin'); (await db.prepare('UPDATE site_messages SET status = ? WHERE id = ?').run(V.oneOf(req.body.status, ['nouveau', 'traite'], 'traite'), Number(id))); return { ok: true }; });
route('DELETE', '/api/admin/demo', async (req) => {
  const a = await requireUser(req, 'admin');
  const demoListings = await db.prepare('SELECT id FROM listings WHERE is_demo = 1').all();
  for (const l of demoListings) await deleteListing(l.id);
  const users = await db.prepare('SELECT user_id FROM profiles WHERE is_demo = 1').all();
  for (const u of users) await deleteUser(u.user_id);
  const r = demoListings.length + users.length;
  await audit(a.id, 'demo-purge', { n: r });
  return { ok: true, removed: r };
});

// Expiration automatique des annonces
async function expireListings() {
  const rows = (await db.prepare("SELECT l.id, l.title, l.slug, pr.user_id FROM listings l JOIN profiles pr ON pr.id = l.profile_id WHERE l.status = 'published' AND l.expires_at IS NOT NULL AND l.expires_at < date('now')").all());
  for (const r of rows) {
    (await db.prepare("UPDATE listings SET status = 'expired', updated_at = datetime('now') WHERE id = ?").run(r.id));
    await notify(r.user_id, 'expiration', 'Annonce expirée', `${r.title} n'est plus visible. Vous pouvez la renouveler depuis votre tableau de bord.`, '/espace-pro?tab=annonces');
    for (const f of (await db.prepare('SELECT user_id FROM favorites WHERE listing_id = ?').all(r.id))) await notify(f.user_id, 'favori', 'Annonce favorite expirée', r.title, null);
  }
  // Rappel : date limite d'inscription dans 3 jours pour les favoris
  const soon = (await db.prepare(`SELECT l.id, l.title, l.slug, l.reg_end, f.user_id FROM listings l JOIN favorites f ON f.listing_id = l.id
    WHERE l.status = 'published' AND l.reg_end = date('now', '+3 days')`).all());
  for (const s of soon) {
    const exists = (await db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND type = 'deadline' AND link = ?").get(s.user_id, `/annonce/${s.id}-${s.slug}`));
    if (!exists) await notify(s.user_id, 'deadline', "Date limite d'inscription proche", `${s.title} : inscriptions jusqu'au ${s.reg_end}`, `/annonce/${s.id}-${s.slug}`);
  }
  (await db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run());
  return rows.length;
}

async function handleApi(req, res) {
  const m = routes.find(r => r.method === req.method && r.re.test(req.pathname));
  if (!m) {
    const any = routes.some(r => r.re.test(req.pathname));
    throw new HttpError(any ? 405 : 404, any ? 'Méthode non autorisée.' : 'Ressource introuvable.');
  }
  const match = m.re.exec(req.pathname);
  const params = Object.fromEntries(m.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
  return m.handler(req, res, params);
}

module.exports = { deleteListing, deleteUser, handleApi, getUser, searchListings, serializeListing, serializeProfile, LISTING_SELECT, PROFILE_SELECT, PUBLIC_WHERE, expireListings, KINDS, PROFILE_TYPES, refreshListingSearch, refreshProfileSearch, computeExpiry, uniqueSlug };
