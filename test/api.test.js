'use strict';
// Tests de bout en bout de l'API G-Sports (base de données temporaire, serveur lancé en mémoire).
// Lancer : npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gsports-test-'));
process.env.GSPORTS_DB = 'memory://';
process.env.GSPORTS_UPLOADS = path.join(TMP, 'uploads');
process.env.BACKUPS = '0';
const { server } = require('../server/index.js');
const { db } = require('../server/db');
const { hashPassword } = require('../server/util');
const api = require('../server/api');

let base;
class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body) {
    const res = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', 'X-GSports': '1', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0];
    let data = null; try { data = await res.json(); } catch { /* html */ }
    return { status: res.status, data };
  }
  get(u) { return this.req('GET', u); } post(u, b) { return this.req('POST', u, b || {}); }
  put(u, b) { return this.req('PUT', u, b || {}); } del(u, b) { return this.req('DELETE', u, b || {}); }
}
const city = async (name) => (await db.prepare('SELECT id, slug FROM cities WHERE name = ?').get(name));
const cat = async (name) => (await db.prepare('SELECT id FROM categories WHERE name = ?').get(name)).id;

test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  (await db.prepare("INSERT INTO users (email, password_hash, role, name) VALUES ('admin@test.ga', ?, 'admin', 'Admin')").run(hashPassword('AdminPass123')));
});
test.after(() => { server.close(); });

const admin = new Client(), pro = new Client(), parent = new Client(), visitor = new Client(), pro2 = new Client();
let listingId;

test('données de référence : 9 provinces et villes principales', async () => {
  const r = await visitor.get('/api/meta');
  assert.equal(r.status, 200);
  assert.equal(r.data.provinces.length, 9);
  for (const n of ['Libreville', 'Oyem', 'Bitam', 'Moanda', 'Port-Gentil', 'Lambaréné', 'Makokou', 'Koulamoutou', 'Tchibanga', 'Mouila', 'Gamba']) assert.ok(r.data.cities.find((c) => c.name === n), n);
  assert.ok(r.data.groups.length >= 9);
});

test('ville sans annonce : résultat vide honnête (aucune fausse annonce)', async () => {
  const r = await visitor.get('/api/listings?city=bitam');
  assert.equal(r.data.total, 0);
});

test('CSRF : POST sans en-tête refusé', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('inscription parent : validations', async () => {
  let r = await parent.post('/api/auth/register-parent', { name: 'Awa', email: 'awa@test.ga', password: 'court', accept: true, is_adult: true });
  assert.equal(r.status, 400);
  r = await parent.post('/api/auth/register-parent', { name: 'Awa', email: 'awa@test.ga', password: 'MotDePasse1', accept: false, is_adult: true });
  assert.equal(r.status, 400);
  r = await parent.post('/api/auth/register-parent', { name: 'Awa N.', email: 'awa@test.ga', password: 'MotDePasse1', accept: true, is_adult: true, city_id: (await city('Libreville')).id });
  assert.equal(r.status, 200);
  const me = await parent.get('/api/me');
  assert.equal(me.data.user.role, 'parent');
  r = await new Client().post('/api/auth/register-parent', { name: 'X', email: 'awa@test.ga', password: 'MotDePasse1', accept: true, is_adult: true });
  assert.equal(r.status, 409);
});

test('profils enfants privés : prénom + âge uniquement', async () => {
  const r = await parent.post('/api/me/children', { nickname: 'Léo', age: 8, interests: ['Sports collectifs'] });
  assert.equal(r.status, 200);
  const list = await parent.get('/api/me/children');
  assert.deepEqual(Object.keys(list.data.items[0]).sort(), ['age', 'id', 'interests', 'nickname']);
  assert.equal((await visitor.get('/api/me/children')).status, 401);
  assert.equal((await parent.post('/api/me/children', { nickname: 'Bébé', age: 1 })).status, 400);
});

test('alerte parent : Libreville, sports collectifs, 8 ans', async () => {
  const g = (await db.prepare("SELECT id FROM category_groups WHERE slug = 'sports-collectifs'").get()).id;
  assert.equal((await parent.post('/api/me/alerts', { city_id: (await city('Libreville')).id, group_id: g, age: 8 })).status, 200);
});

test('inscription professionnelle puis annonce en attente avant validation', async () => {
  let r = await pro.post('/api/auth/register-pro', { type: 'club', name: 'AS Test Libreville', main_activity: 'Football', city_id: (await city('Libreville')).id, manager_name: 'M. Test', email: 'club@test.ga', phone: '+241 01 23 45 67', whatsapp: '+241 07 00 00 00', password: 'ClubPass123', accept: true, accept_minors: true });
  assert.equal(r.status, 200);
  const body = { kind: 'activite', title: 'Football U10 – entraînements', category_id: (await cat('Football')), city_id: (await city('Libreville')).id, age_min: 7, age_max: 10, description: 'Entraînements de football pour les 7-10 ans, encadrés par deux éducateurs diplômés.', levels: ['debutant'], beginners: true, days: ['mer', 'sam'], price_amount: 15000, price_period: 'mois', reg_end: '2099-01-01' };
  r = await pro.post('/api/pro/listings', body);
  assert.equal(r.status, 200); assert.equal(r.data.status, 'pending');
  listingId = r.data.id;
  assert.equal((await visitor.get(`/api/listings/${listingId}`)).status, 404, 'invisible avant validation');
  assert.equal((await visitor.get('/api/profiles/as-test-libreville')).status, 404);
});

test('validation des entrées d\'annonce', async () => {
  const r = await pro.post('/api/pro/listings', { title: 'Test', category_id: (await cat('Football')), city_id: (await city('Oyem')).id, age_min: 12, age_max: 8, description: 'x'.repeat(40) });
  assert.equal(r.status, 400);
  const r2 = await pro.post('/api/pro/listings', { title: 'Avec photo sans accord', category_id: (await cat('Football')), city_id: (await city('Oyem')).id, age_min: 6, age_max: 8, description: 'x'.repeat(40), photos: ['/img/photos/basket-joie.jpg'] });
  assert.equal(r2.status, 400, 'consentement photo obligatoire');
});

test('permissions : un parent ne peut pas publier, un visiteur ne peut pas administrer', async () => {
  assert.equal((await parent.post('/api/pro/listings', {})).status, 403);
  assert.equal((await visitor.get('/api/admin/stats')).status, 401);
  assert.equal((await parent.get('/api/admin/stats')).status, 403);
  assert.equal((await pro.get('/api/admin/stats')).status, 403);
});

test('connexion admin : validation du pro publie ses annonces et déclenche les alertes', async () => {
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@test.ga', password: 'mauvais' })).status, 401);
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@test.ga', password: 'AdminPass123' })).status, 200);
  const pend = await admin.get('/api/admin/profiles?verification=pending');
  const p = pend.data.items.find((x) => x.name === 'AS Test Libreville');
  assert.ok(p);
  assert.equal((await admin.put(`/api/admin/profiles/${p.id}`, { verification: 'approved' })).status, 200);
  const l = await visitor.get(`/api/listings/${listingId}`);
  assert.equal(l.status, 200);
  assert.ok(l.data.badges.some((b) => b.k === 'ouvertes'));
  assert.ok(l.data.badges.some((b) => b.k === 'nouveau'));
  const notifs = await parent.get('/api/me/notifications');
  assert.ok(notifs.data.items.some((n) => n.type === 'alerte'), 'alerte parent reçue');
});

test('recherche : ville, âge, catégorie, gratuit, tri', async () => {
  assert.equal((await visitor.get('/api/listings?city=libreville&age=8')).data.total, 1);
  assert.equal((await visitor.get('/api/listings?city=libreville&age=14')).data.total, 0, 'âge inadapté exclu');
  assert.equal((await visitor.get('/api/listings?agegroup=7-9')).data.total, 1);
  assert.equal((await visitor.get('/api/listings?agegroup=16-18')).data.total, 0);
  assert.equal((await visitor.get('/api/listings?cat=football')).data.total, 1);
  assert.equal((await visitor.get('/api/listings?group=danse')).data.total, 0);
  assert.equal((await visitor.get('/api/listings?free=1')).data.total, 0);
  assert.equal((await visitor.get('/api/listings?q=entrainements')).data.total, 1, 'recherche sans accents');
  assert.equal((await visitor.get('/api/listings?weekend=1')).data.total, 1);
  assert.equal((await visitor.get('/api/listings?open=1')).data.total, 1);
  assert.equal((await visitor.get('/api/listings?maxprice=10000')).data.total, 0);
  const prox = await visitor.get('/api/listings?sort=proximite&lat=0.39&lng=9.45');
  assert.equal(prox.data.items[0].distance_km < 5, true);
});

test('demande de contact : consentement, réservée aux parents, notification au pro', async () => {
  let r = await visitor.post('/api/contact-requests', { listing_id: listingId, parent_name: 'Marie', email: 'marie@test.ga', message: 'Bonjour, des places ?', consent: false, is_guardian: true });
  assert.equal(r.status, 400);
  r = await visitor.post('/api/contact-requests', { listing_id: listingId, parent_name: 'Marie', email: 'marie@test.ga', message: 'Bonjour, des places ?', consent: true, is_guardian: true, website: 'spam' });
  assert.equal(r.status, 400, 'pot de miel');
  r = await pro.post('/api/contact-requests', { listing_id: listingId, parent_name: 'Pro', email: 'p@test.ga', message: 'Bonjour bonjour', consent: true, is_guardian: true });
  assert.equal(r.status, 403, 'un pro ne peut pas envoyer de demande');
  r = await parent.post('/api/contact-requests', { listing_id: listingId, type: 'inscription', parent_name: 'Awa N.', email: 'awa@test.ga', child_age: 8, message: 'Je souhaite inscrire mon fils.', consent: true, is_guardian: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.contact.whatsapp, '+241 07 00 00 00');
  const reqs = await pro.get('/api/pro/requests');
  assert.equal(reqs.data.items.length, 1);
  assert.equal(reqs.data.items[0].child_age, 8);
  assert.equal((await pro.put(`/api/pro/requests/${reqs.data.items[0].id}`, { reply: 'Bienvenue ! Venez mercredi à 15h.' })).status, 200);
  const mine = await parent.get('/api/me/requests');
  assert.equal(mine.data.items[0].status, 'repondu');
});

test('un pro ne peut pas modifier l\'annonce d\'un autre', async () => {
  await pro2.post('/api/auth/register-pro', { type: 'coach', name: 'Coach Test', main_activity: 'Natation', city_id: (await city('Oyem')).id, manager_name: 'Coach', email: 'coach@test.ga', phone: '070000000', password: 'CoachPass123', accept: true, accept_minors: true });
  assert.equal((await pro2.put(`/api/pro/listings/${listingId}`, { title: 'piraté' })).status, 404);
  assert.equal((await pro2.del(`/api/pro/listings/${listingId}`)).status, 404);
});

test('favoris et tableau de bord pro', async () => {
  assert.equal((await parent.post(`/api/me/favorites/${listingId}`)).status, 200);
  const d = await pro.get('/api/pro/dashboard');
  assert.equal(d.data.stats.active, 1);
  assert.equal(d.data.stats.favorites, 1);
  assert.equal(d.data.stats.requests, 1);
});

test('expiration automatique : une annonce dont la date de fin est passée disparaît', async () => {
  (await db.prepare("UPDATE listings SET end_date = '2020-01-01', expires_at = '2020-01-01' WHERE id = ?").run(listingId));
  await api.expireListings();
  assert.equal((await db.prepare('SELECT status FROM listings WHERE id = ?').get(listingId)).status, 'expired');
  assert.equal((await visitor.get(`/api/listings/${listingId}`)).status, 404);
  assert.equal((await visitor.get('/api/listings?city=libreville')).data.total, 0);
  const r = await pro.post(`/api/pro/listings/${listingId}/renew`);
  assert.equal(r.status, 400, 'renouvellement refusé tant que les dates sont passées');
  (await db.prepare('UPDATE listings SET end_date = NULL WHERE id = ?').run(listingId));
  assert.equal((await pro.post(`/api/pro/listings/${listingId}/renew`)).status, 200);
  assert.equal((await visitor.get(`/api/listings/${listingId}`)).status, 200);
});

test('signalement puis suspension par l\'admin', async () => {
  assert.equal((await visitor.post('/api/reports', { target_type: 'listing', target_id: listingId, reason: 'Tarif incorrect' })).status, 200);
  const reps = await admin.get('/api/admin/reports');
  assert.equal(reps.data.items[0].reason, 'Tarif incorrect');
  assert.equal((await admin.put(`/api/admin/listings/${listingId}`, { status: 'suspended', admin_note: 'Tarif à corriger' })).status, 200);
  assert.equal((await visitor.get(`/api/listings/${listingId}`)).status, 404);
  assert.equal((await pro.post(`/api/pro/listings/${listingId}/resume`)).status, 403, 'le pro ne peut pas lever une suspension de modération');
});

test('téléversement : refuse les faux fichiers image', async () => {
  const r = await pro.post('/api/uploads', { data: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') });
  assert.equal(r.status, 400);
  const png = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6300010000050001', 'hex');
  const ok = await pro.post('/api/uploads', { data: 'data:image/png;base64,' + png.toString('base64') });
  assert.equal(ok.status, 200); assert.match(ok.data.url, /^\/uploads\/.+\.png$/);
  assert.equal((await parent.post('/api/uploads', { data: 'x' })).status, 403);
});

test('SEO : page annonce indexable, ville vide non indexée, sitemap, robots', async () => {
  (await db.prepare("UPDATE listings SET status = 'published', admin_note = NULL WHERE id = ?").run(listingId));
  const html = await (await fetch(`${base}/annonce/${listingId}-football-u10`)).text();
  assert.match(html, /<title>Football U10/);
  assert.match(html, /index,follow/);
  const empty = await (await fetch(`${base}/activites/bitam`)).text();
  assert.match(empty, /noindex,follow/);
  const sm = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sm, new RegExp(`/annonce/${listingId}-`));
  assert.doesNotMatch(sm, /exemple/i);
  assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap:/);
  assert.equal((await fetch(`${base}/page-inexistante`)).status, 404);
});

test('suppression de compte parent', async () => {
  assert.equal((await parent.del('/api/account', { password: 'faux' })).status, 400);
  assert.equal((await parent.del('/api/account', { password: 'MotDePasse1' })).status, 200);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM children").get()).n, 0, 'profils enfants effacés');
  assert.equal((await parent.get('/api/me/children')).status, 401);
});

test('activités pour adultes : tranche Adultes, âge du participant majeur', async () => {
  const club = new Client();
  await club.post('/api/auth/register-pro', { type: 'salle', name: 'Salle Forme Test', main_activity: 'Fitness', city_id: (await city('Libreville')).id, manager_name: 'Gérant', email: 'forme@test.ga', phone: '011223344', password: 'FormePass123', accept: true, accept_minors: true });
  const p = (await admin.get('/api/admin/profiles?verification=pending')).data.items.find((x) => x.name === 'Salle Forme Test');
  await admin.put(`/api/admin/profiles/${p.id}`, { verification: 'approved' });
  const r = await club.post('/api/pro/listings', { kind: 'adultes', title: 'Remise en forme adultes', category_id: await cat('Remise en forme'), city_id: (await city('Libreville')).id, age_min: 18, age_max: 99, description: 'Cardio et renforcement musculaire pour adultes, tous niveaux, encadré par un coach.', reg_end: '2099-01-01' });
  assert.equal(r.status, 200);
  assert.equal((await visitor.get('/api/listings?agegroup=adultes')).data.items.some((l) => l.id === r.data.id), true);
  assert.equal((await visitor.get('/api/listings?agegroup=seniors')).data.items.some((l) => l.id === r.data.id), true);
  assert.equal((await visitor.get('/api/listings?agegroup=10-12')).data.items.some((l) => l.id === r.data.id), false);
  const c = await visitor.post('/api/contact-requests', { listing_id: r.data.id, type: 'inscription', parent_name: 'Jean Adulte', email: 'jean@test.ga', child_age: 42, message: 'Je souhaite m\'inscrire aux séances.', consent: true, is_guardian: true });
  assert.equal(c.status, 200);
});
