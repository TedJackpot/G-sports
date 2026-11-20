'use strict';
// G-Sports Gabon – serveur HTTP (local : node server/index.js ; Vercel : fonction api/index.js)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { db, DB_PATH, IS_REMOTE } = require('./db');
const { HttpError, json, today } = require('./util');
const api = require('./api');

const PORT = Number(process.env.PORT) || 3000;
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PUBLIC = path.join(__dirname, '..', 'public');
const UPLOADS = process.env.GSPORTS_UPLOADS || path.join(__dirname, '..', 'data', 'uploads');
const LOG_DIR = path.join(__dirname, '..', 'data', 'logs');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const IS_VERCEL = !!process.env.VERCEL;
const IS_PROD = process.env.NODE_ENV === 'production' || IS_VERCEL;
if (!IS_VERCEL) fs.mkdirSync(LOG_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg)/;

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.public.blob.vercel-storage.com",
  "connect-src 'self'",
  "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
].join('; ');

function logError(err, req) {
  const line = `[${new Date().toISOString()}] ${req?.method || ''} ${req?.url || ''}\n${err.stack || err}\n`;
  console.error(line);
  if (!IS_VERCEL) { try { fs.appendFileSync(path.join(LOG_DIR, 'error.log'), line); } catch { /* ignore */ } }
}

function parseCookies(h) {
  const out = {};
  for (const part of String(h || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function send(req, res, status, body, type, extraHeaders = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const headers = { 'Content-Type': type, ...extraHeaders };
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf, { level: 6 }); headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function readBody(req, limit) {
  // Sur Vercel, le corps peut déjà avoir été lu par l'environnement d'exécution
  const pre = req.body;
  if (pre !== undefined && pre !== null) {
    if (Buffer.isBuffer(pre) || typeof pre === 'string') { try { return Promise.resolve(JSON.parse(pre.toString() || '{}')); } catch { return Promise.reject(new HttpError(400, 'JSON invalide.')); } }
    return Promise.resolve(pre);
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Requête trop volumineuse.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'JSON invalide.')); }
    });
    req.on('error', reject);
  });
}

// ---------- Fichiers statiques ----------
const staticCache = new Map();
function serveStatic(req, res, file, cacheControl) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { ETag: etag, 'Cache-Control': cacheControl };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return true; }
  let entry = staticCache.get(file);
  if (!entry || entry.etag !== etag) { entry = { etag, body: fs.readFileSync(file) }; if (st.size < 2e6) staticCache.set(file, entry); }
  send(req, res, 200, entry.body, type, headers);
  return true;
}
function safeJoin(root, p) {
  const full = path.normalize(path.join(root, p));
  return full.startsWith(root) ? full : null;
}

// ---------- Rendu côté serveur des balises SEO ----------
let TEMPLATE = null;
function template() {
  if (!TEMPLATE || !IS_PROD) TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  return TEMPLATE;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEFAULT_DESC = "G-Sports Gabon : plateforme nationale et gratuite pour trouver une activité sportive, artistique, éducative ou de loisirs pour les enfants et les jeunes partout au Gabon.";
const STATIC_PAGES = {
  '/': ['G-Sports Gabon – Trouvez l\'activité qui fera grandir votre enfant', DEFAULT_DESC],
  '/activites': ['Explorer les activités pour enfants et jeunes au Gabon', 'Recherchez par ville, âge, catégorie, tarif et disponibilités parmi les activités référencées au Gabon.'],
  '/recherche': ['Recherche avancée – G-Sports Gabon', 'Filtres avancés : ville, province, âge, niveau, tarif, dates, vacances, week-end, indoor/outdoor.'],
  '/sports': ['Sports pour enfants et adolescents au Gabon', 'Football, basketball, natation, arts martiaux, tennis, athlétisme… Trouvez un club ou un coach.'],
  '/extrascolaire': ['Activités extrascolaires au Gabon', 'Arts, musique, danse, robotique, échecs, langues, soutien scolaire et ateliers pour les jeunes.'],
  '/clubs': ['Clubs, salles et structures – G-Sports Gabon', 'Clubs sportifs, gymnases, associations et centres de loisirs référencés au Gabon.'],
  '/coachs': ['Coachs sportifs indépendants au Gabon', 'Coachs et éducateurs : cours individuels ou en groupe, en salle, en extérieur ou à domicile.'],
  '/stages': ['Stages sportifs et activités de vacances au Gabon', 'Stages intensifs, journées découverte et programmes pendant les vacances scolaires.'],
  '/camps': ['Camps de vacances pour enfants et ados au Gabon', 'Camps sportifs, nature, culturels et multisports : dates, tarifs, encadrement.'],
  '/calendrier': ['Calendrier des inscriptions, stages et camps', 'Toutes les dates d\'inscription, de stages et de camps à venir au Gabon.'],
  '/carte': ['Carte des activités au Gabon', 'Explorez les activités par province et par ville sur la carte du Gabon.'],
  '/publier': ['Publier une annonce gratuitement – G-Sports', 'Clubs, coachs, associations : publiez vos activités gratuitement.'],
  '/connexion': ['Connexion – G-Sports Gabon', DEFAULT_DESC], '/inscription': ['Créer un compte parent – G-Sports Gabon', DEFAULT_DESC],
  '/inscription-pro': ['Référencer mon activité gratuitement – G-Sports Gabon', 'Inscription gratuite pour clubs, salles, associations, coachs et organisateurs.'],
  '/favoris': ['Mes favoris – G-Sports', DEFAULT_DESC], '/a-propos': ['À propos de G-Sports Gabon', DEFAULT_DESC],
  '/comment-ca-marche': ['Comment fonctionne G-Sports ?', 'Trouver une activité en moins de 30 secondes, contacter directement le club ou le coach, gratuitement.'],
  '/contact': ['Contacter G-Sports', DEFAULT_DESC], '/faq': ['Questions fréquentes – G-Sports', DEFAULT_DESC],
  '/conditions': ["Conditions d'utilisation – G-Sports", DEFAULT_DESC], '/confidentialite': ['Politique de confidentialité – G-Sports', DEFAULT_DESC],
  '/signalement': ['Signaler un contenu – G-Sports', DEFAULT_DESC], '/modeles': ["Modèles d'annonces – G-Sports", 'Modèles prêts à l\'emploi pour publier rapidement une activité, un stage ou un camp.'],
  '/securite': ['Sécurité et protection des mineurs – G-Sports', 'Nos engagements pour la protection des enfants et des données personnelles.'],
};
const PRIVATE_PREFIXES = ['/espace-parent', '/espace-pro', '/admin', '/demandes', '/favoris', '/connexion', '/inscription'];

async function buildPage(req) {
  const p = req.pathname.replace(/\/+$/, '') || '/';
  let title = null, desc = DEFAULT_DESC, image = '/img/photos/basket-joie.jpg', status = 200, robots = 'index,follow', ld = [], ssr = '';
  const abs = u => (u && u.startsWith('http') ? u : SITE_URL + u);
  let m;
  if ((m = /^\/annonce\/(\d+)(?:-[\w-]*)?$/.exec(p))) {
    const l = (await db.prepare(`${api.LISTING_SELECT} WHERE l.id = ? AND ${api.PUBLIC_WHERE}`).get(Number(m[1])));
    if (!l) { status = 404; title = 'Annonce indisponible – G-Sports'; robots = 'noindex,follow'; }
    else {
      const s = api.serializeListing(l, true);
      title = `${s.title} – ${s.city.name} (${s.age_min}–${s.age_max} ans) | G-Sports`;
      desc = `${s.kind_label} · ${s.cat_name || ''} à ${s.city.name}, ${s.province.name}. ${String(s.description).slice(0, 140)}`;
      if (s.cover) image = s.cover;
      if (s.is_demo) robots = 'noindex,nofollow';
      ssr = `<article class="ssr"><h1>${esc(s.title)}</h1><p>${esc(s.org.name)} · ${esc(s.city.name)} · ${s.age_min}–${s.age_max} ans</p><p>${esc(s.description)}</p></article>`;
      if (s.start_date && !s.is_demo) ld.push({
        '@context': 'https://schema.org', '@type': 'Event', name: s.title, description: String(s.description).slice(0, 500),
        startDate: s.start_date, endDate: s.end_date || undefined, eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', image: [abs(image)],
        location: { '@type': 'Place', name: s.address || s.city.name, address: { '@type': 'PostalAddress', addressLocality: s.city.name, addressRegion: s.province.name, addressCountry: 'GA' } },
        organizer: { '@type': 'Organization', name: s.org.name, url: abs(s.org.url) }, typicalAgeRange: `${s.age_min}-${s.age_max}`,
        offers: s.is_free ? { '@type': 'Offer', price: 0, priceCurrency: 'XAF', availability: 'https://schema.org/InStock', url: abs(s.url) }
          : s.price_amount != null ? { '@type': 'Offer', price: s.price_amount, priceCurrency: 'XAF', url: abs(s.url) } : undefined,
      });
      ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: abs('/') },
        { '@type': 'ListItem', position: 2, name: s.city.name, item: abs(`/activites/${s.city.slug}`) },
        { '@type': 'ListItem', position: 3, name: s.title, item: abs(s.url) }] });
    }
  } else if ((m = /^\/(clubs|coachs)\/([\w-]+)$/.exec(p)) && !['inscription'].includes(m[2])) {
    const pr = (await db.prepare(`${api.PROFILE_SELECT} WHERE pr.slug = ? AND pr.verification = 'approved' AND u.status = 'active'`).get(m[2]));
    if (!pr) { status = 404; title = 'Profil indisponible – G-Sports'; robots = 'noindex,follow'; }
    else {
      const s = api.serializeProfile(pr, true);
      title = `${s.name} – ${s.type_label}${s.city ? ' à ' + s.city.name : ''} | G-Sports`;
      desc = (s.description || `${s.type_label} ${s.main_activity || ''} au Gabon.`).slice(0, 160);
      if (s.cover) image = s.cover;
      if (s.is_demo) robots = 'noindex,nofollow';
      ssr = `<article class="ssr"><h1>${esc(s.name)}</h1><p>${esc(s.type_label)}${s.city ? ' · ' + esc(s.city.name) : ''}</p><p>${esc(s.description)}</p></article>`;
      if (!s.is_demo) ld.push({ '@context': 'https://schema.org', '@type': s.is_coach ? 'Person' : 'SportsOrganization', name: s.name, description: s.description || undefined,
        url: abs(s.url), image: s.cover ? abs(s.cover) : undefined, address: s.city ? { '@type': 'PostalAddress', addressLocality: s.city.name, addressRegion: s.province?.name, addressCountry: 'GA' } : undefined });
    }
  } else if ((m = /^\/(activites|clubs|stages)\/([\w-]+)(?:\/([\w-]+))?$/.exec(p))) {
    const city = (await db.prepare('SELECT c.name, c.slug FROM cities c WHERE c.slug = ?').get(m[2]));
    const what = m[3] ? ((await db.prepare('SELECT name FROM categories WHERE slug = ?').get(m[3])) || (await db.prepare('SELECT name FROM category_groups WHERE slug = ?').get(m[3]))) : null;
    const label = what ? what.name : (m[3] ? m[3].replace(/-/g, ' ') : 'Activités');
    const where = city ? `à ${city.name}` : 'au Gabon';
    title = `${label} pour enfants et jeunes ${where} | G-Sports`;
    desc = `Trouvez ${label.toLowerCase()} ${where} : clubs, coachs, stages et camps, âges, horaires et tarifs. Gratuit.`;
    const q = { limit: 1 };
    if (city) q.city = city.slug;
    if (m[3]) { if ((await db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(m[3]))) q.cat = m[3]; else if ((await db.prepare('SELECT 1 FROM category_groups WHERE slug = ?').get(m[3]))) q.group = m[3]; else if (m[3] === 'vacances') q.holidays = '1'; }
    if (m[1] === 'stages') q.kind = 'stage,camp';
    const total = (await api.searchListings(q)).total;
    if (!total) robots = 'noindex,follow'; // pas de pages vides indexées
  } else if ((m = /^\/age\/([\w+-]+)$/.exec(p))) {
    title = `Activités pour les ${m[1].replace('-ans', '').replace('-', ' à ')} ans au Gabon | G-Sports`;
  } else if (STATIC_PAGES[p]) {
    [title, desc] = STATIC_PAGES[p];
  } else if (!/^\/(espace-parent|espace-pro|admin|demandes|publier|recherche|hors-ligne)/.test(p)) {
    status = 404; title = 'Page introuvable – G-Sports'; robots = 'noindex,follow';
  }
  if (PRIVATE_PREFIXES.some(x => p.startsWith(x))) robots = 'noindex,nofollow';
  title = title || 'G-Sports Gabon';
  const canonical = SITE_URL + (p === '/' ? '/' : p);
  const meta = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc.slice(0, 300))}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="website"><meta property="og:site_name" content="G-Sports Gabon">`,
    `<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc.slice(0, 300))}">`,
    `<meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(abs(image))}">`,
    `<meta property="og:locale" content="fr_GA"><meta name="twitter:card" content="summary_large_image">`,
    ...ld.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`),
  ].join('\n  ');
  const html = template().replace('<!--META-->', meta).replace('<!--SSR-->', ssr);
  return { status, html };
}

async function sitemap() {
  const urls = Object.keys(STATIC_PAGES).filter(p => !PRIVATE_PREFIXES.some(x => p.startsWith(x)) && p !== '/publier').map(p => ({ loc: p }));
  for (const l of (await db.prepare(`SELECT l.id, l.slug, l.updated_at FROM listings l JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id WHERE ${api.PUBLIC_WHERE} AND l.is_demo = 0`).all()))
    urls.push({ loc: `/annonce/${l.id}-${l.slug}`, lastmod: l.updated_at.slice(0, 10) });
  for (const p of (await db.prepare("SELECT slug, type, updated_at FROM profiles WHERE verification = 'approved' AND is_demo = 0").all()))
    urls.push({ loc: `/${p.type === 'coach' || p.type === 'educateur' ? 'coachs' : 'clubs'}/${p.slug}`, lastmod: p.updated_at.slice(0, 10) });
  // Pages ville / ville+catégorie seulement si elles contiennent des annonces réelles
  for (const r of (await db.prepare(`SELECT DISTINCT c.slug city, cat.slug cat FROM listings l JOIN cities c ON c.id = l.city_id JOIN categories cat ON cat.id = l.category_id
    JOIN profiles pr ON pr.id = l.profile_id JOIN users u ON u.id = pr.user_id WHERE ${api.PUBLIC_WHERE} AND l.is_demo = 0`).all())) {
    urls.push({ loc: `/activites/${r.city}` }, { loc: `/activites/${r.city}/${r.cat}` });
  }
  const seen = new Set();
  const body = urls.filter(u => !seen.has(u.loc) && seen.add(u.loc)).map(u => `<url><loc>${esc(SITE_URL + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

// ---------- Serveur ----------
async function handler(req, res) {
  const t0 = Date.now();
  const url = new URL(req.url, 'http://x');
  req.pathname = decodeURIComponent(url.pathname);
  setProp(req, 'query', Object.fromEntries(url.searchParams));
  req.cookies = parseCookies(req.headers.cookie);
  req.ip = (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
  res.setCookie = (name, value, maxAge) => {
    res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${IS_PROD ? '; Secure' : ''}`);
  };
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.on('finish', () => { if (req.pathname.startsWith('/api/')) console.log(`${req.method} ${req.pathname} ${res.statusCode} ${Date.now() - t0}ms`); });

  try {
    if (req.pathname === '/api/cron/daily') {
      // Appelé chaque jour par Vercel Cron (en-tête Authorization: Bearer CRON_SECRET)
      if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) throw new HttpError(401, 'Non autorisé.');
      const n = await api.expireListings();
      return send(req, res, 200, JSON.stringify({ ok: true, expired: n }), MIME['.json'], { 'Cache-Control': 'no-store' });
    }
    if (req.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // Protection CSRF : en-tête personnalisé obligatoire + contrôle de l'origine
        if (req.headers['x-gsports'] !== '1') throw new HttpError(403, 'Requête refusée.');
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Origine refusée.');
        setProp(req, 'body', await readBody(req, req.pathname === '/api/uploads' ? 4.4 * 1024 * 1024 : 300 * 1024));
      } else setProp(req, 'body', {});
      const result = await api.handleApi(req, res);
      return send(req, res, 200, JSON.stringify(result ?? { ok: true }), MIME['.json'], { 'Cache-Control': 'no-store' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Méthode non autorisée.');
    if (req.pathname === '/robots.txt') {
      return send(req, res, 200, `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /espace-parent\nDisallow: /espace-pro\nDisallow: /admin\nDisallow: /demandes\n\nSitemap: ${SITE_URL}/sitemap.xml\n`, MIME['.txt']);
    }
    if (req.pathname === '/sitemap.xml') return send(req, res, 200, await sitemap(), MIME['.xml'], { 'Cache-Control': 'public, max-age=3600' });
    if (req.pathname.startsWith('/uploads/')) {
      const f = safeJoin(UPLOADS, req.pathname.slice('/uploads/'.length));
      if (f && serveStatic(req, res, f, 'public, max-age=31536000, immutable')) return;
      throw new HttpError(404, 'Image introuvable.');
    }
    if (path.extname(req.pathname) && req.pathname !== '/index.html') {
      const f = safeJoin(PUBLIC, req.pathname);
      const cc = req.pathname.startsWith('/img/') ? 'public, max-age=2592000' : 'no-cache';
      if (f && serveStatic(req, res, f, cc)) return;
      throw new HttpError(404, 'Fichier introuvable.');
    }
    const page = await buildPage(req);
    return send(req, res, page.status, page.html, MIME['.html'], { 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) logError(err, req);
    const message = status >= 500 ? 'Une erreur est survenue. Merci de réessayer.' : err.message;
    if (req.pathname.startsWith('/api/') || path.extname(req.pathname)) {
      return send(req, res, status, JSON.stringify({ error: message }), MIME['.json'], { 'Cache-Control': 'no-store' });
    }
    return send(req, res, status, `<!doctype html><meta charset="utf-8"><title>Erreur</title><p>${esc(message)}</p><a href="/">Retour à l'accueil</a>`, MIME['.html']);
  }
}
const server = http.createServer(handler);
// Écrit une propriété même si l'environnement (Vercel) l'a déjà définie
function setProp(obj, key, value) {
  try { Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: true }); } catch { obj[key] = value; }
}

// ---------- Tâches périodiques : expiration, sauvegardes ----------
async function backup() {
  if (IS_REMOTE) return; // Turso gère ses propres sauvegardes
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `gsports-${today()}.db`);
    if (!fs.existsSync(file)) await db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 7))) fs.unlinkSync(path.join(BACKUP_DIR, f));
  } catch (e) { logError(e); }
}
async function periodic() {
  try { const n = await api.expireListings(); if (n) console.log(`${n} annonce(s) expirée(s)`); } catch (e) { logError(e); }
}

if (require.main === module) {
  periodic();
  if (process.env.BACKUPS !== '0') backup();
  setInterval(periodic, 3600e3).unref();
  setInterval(backup, 24 * 3600e3).unref();
  server.listen(PORT, () => console.log(`G-Sports Gabon : ${SITE_URL}  (base : ${DB_PATH})`));
}
process.on('unhandledRejection', e => logError(e));

module.exports = { server, handler };
