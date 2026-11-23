'use strict';
// Accès base de données PostgreSQL :
//  - production (Vercel) : Supabase, via DATABASE_URL (rôle dédié « gsports_app », schéma « gsports ») ;
//  - local et tests : PGlite (PostgreSQL embarqué), stocké dans data/pg (ou en mémoire pour les tests).
// L'API reste proche de better-sqlite3 mais asynchrone : await db.prepare(sql).get(...args)
const path = require('node:path');
const fs = require('node:fs');
const { PROVINCES, CITIES, CATEGORY_GROUPS, TEMPLATES } = require('./seed-data');
const { slugify, normalize, hashPassword } = require('./util');

const DATABASE_URL = process.env.DATABASE_URL || '';
const IS_REMOTE = /^postgres(ql)?:\/\//.test(DATABASE_URL);
const DB_PATH = process.env.GSPORTS_DB || (process.env.VERCEL ? 'memory://' : path.join(__dirname, '..', 'data', 'pg'));
const SCHEMA_SQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const NO_RETURNING = /^\s*insert\s+into\s+(sessions|favorites|settings)\b/i;

// « ? » -> « $1, $2… » (hors chaînes entre apostrophes)
function toPg(sql) {
  let n = 0, out = '', q = false;
  for (const ch of sql) {
    if (ch === "'") q = !q;
    out += !q && ch === '?' ? `$${++n}` : ch;
  }
  return out;
}
const clean = (args) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));
const withReturning = (sql) => (/^\s*insert\s/i.test(sql) && !/\breturning\b/i.test(sql) && !NO_RETURNING.test(sql) ? `${sql} RETURNING id` : sql);

let exec; // (sql, params) => { rows, count }
let execMulti; // (sql) => void
let transaction; // (fn(execTx)) => résultat, sur une seule connexion
// Modules ESM chargés par import() dynamique (compatible avec tous les environnements Node)
let driver = null;
function getDriver() {
  if (driver) return driver;
  driver = (async () => {
    if (IS_REMOTE) {
      const m = await import('postgres');
      const postgres = m.default || m;
      const sql = postgres(DATABASE_URL, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
      // COUNT / SUM renvoient des entiers 64 bits (texte) : conversion en nombres d'après le type des colonnes
      const NUMERIC_OIDS = new Set([20, 1700]);
      const wrap = (q) => async (text, params) => {
        const r = await q.unsafe(text, params);
        const numCols = (r.columns || []).filter((c) => NUMERIC_OIDS.has(c.type)).map((c) => c.name);
        const rows = numCols.length ? r.map((row) => { for (const c of numCols) if (row[c] != null) row[c] = Number(row[c]); return row; }) : [...r];
        return { rows, count: r.count };
      };
      // Le relais de connexion Supabase (mode transaction) ne supporte pas plusieurs requêtes envoyées
      // en même temps sur une connexion : on les exécute strictement l'une après l'autre.
      let chain = Promise.resolve();
      const serial = (fn) => { const p = chain.then(fn, fn); chain = p.then(() => {}, () => {}); return p; };
      const run = wrap(sql);
      return {
        exec: (text, params) => serial(() => run(text, params)),
        execMulti: (text) => serial(() => sql.unsafe(text)),
        transaction: (fn) => serial(() => sql.begin((t) => fn(wrap(t)))),
      };
    }
    const { PGlite } = await import('@electric-sql/pglite');
    if (!DB_PATH.startsWith('memory://')) fs.mkdirSync(DB_PATH, { recursive: true });
    const pg = new PGlite(DB_PATH);
    const parsers = { 20: (x) => Number(x), 1700: (x) => Number(x) };
    const wrap = (q) => async (text, params) => { const r = await q.query(text, params, { parsers }); return { rows: r.rows, count: r.affectedRows ?? r.rows.length }; };
    return { exec: wrap(pg), execMulti: async (text) => { await pg.exec(text); }, transaction: (fn) => pg.transaction((t) => fn(wrap(t))) };
  })();
  return driver;
}
exec = async (text, params) => (await getDriver()).exec(text, params);
execMulti = async (text) => (await getDriver()).execMulti(text);
transaction = async (fn) => (await getDriver()).transaction(fn);

let ready = null;
const db = {
  prepare(sqlText) {
    const text = toPg(sqlText);
    return {
      async get(...args) { await ready; return (await exec(text, clean(args))).rows[0]; },
      async all(...args) { await ready; return (await exec(text, clean(args))).rows; },
      async run(...args) {
        await ready;
        const r = await exec(withReturning(text), clean(args));
        return { changes: r.count, lastInsertRowid: r.rows[0]?.id != null ? Number(r.rows[0].id) : null };
      },
    };
  },
  async exec(sqlText) { await ready; return execMulti(sqlText); },
  // Plusieurs écritures à la suite dans une transaction
  async batch(stmts) {
    await ready;
    await transaction(async (x) => { for (const [s, ...args] of stmts) await x(toPg(s), clean(args)); });
  },
};

async function init() {
  if (IS_REMOTE) {
    // Le schéma est créé par la migration Supabase ; le rôle gsports_app a search_path = gsports.
  } else {
    await execMulti('CREATE SCHEMA IF NOT EXISTS gsports; SET search_path TO gsports;');
    await execMulti(SCHEMA_SQL);
  }
  const count = (await exec('SELECT COUNT(*) AS c FROM provinces', [])).rows[0].c;
  if (Number(count) === 0) {
    await transaction(async (exec) => {
      const pid = {};
      for (const p of PROVINCES) pid[p.slug] = (await exec('INSERT INTO provinces (slug, name, capital) VALUES ($1, $2, $3) RETURNING id', [p.slug, p.name, p.capital])).rows[0].id;
      for (const [name, prov, lat, lng, featured] of CITIES) await exec('INSERT INTO cities (slug, name, province_id, lat, lng, featured) VALUES ($1, $2, $3, $4, $5, $6)', [slugify(name), name, pid[prov], lat, lng, featured]);
      for (const [i, g] of CATEGORY_GROUPS.entries()) {
        const gid = (await exec('INSERT INTO category_groups (slug, name, icon, color, image, kind, sort) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [g.slug, g.name, g.icon, g.color, g.image, g.kind, i])).rows[0].id;
        for (const [j, name] of g.items.entries()) await exec('INSERT INTO categories (slug, name, group_id, sort) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [slugify(name), name, gid, j]);
      }
      for (const t of TEMPLATES) await exec('INSERT INTO templates (slug, title, data) VALUES ($1, $2, $3)', [t.slug, t.title, JSON.stringify(t)]);
      await exec('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT DO NOTHING', ['home', JSON.stringify({
        heroTitle: "Trouvez l'activité qui fera grandir votre enfant.",
        heroSubtitle: 'Sports, loisirs, clubs, coachs, stages et activités extrascolaires partout au Gabon.',
        heroImage: 'basket-joie', slogan: 'À chaque jeune son activité. À chaque talent son terrain.', banner: '', holidays: [],
      })]);
    });
  }
  // Premier administrateur : créé si ADMIN_EMAIL et ADMIN_PASSWORD sont définis et qu'aucun admin n'existe
  const ae = process.env.ADMIN_EMAIL, ap = process.env.ADMIN_PASSWORD;
  if (ae && ap && ap.length >= 10) {
    const n = Number((await exec("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'", [])).rows[0].c);
    if (n === 0) await exec("INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'admin', 'Administrateur G-Sports') ON CONFLICT DO NOTHING", [ae.toLowerCase(), hashPassword(ap)]);
  }
}
ready = init();
ready.catch((e) => console.error('Initialisation de la base impossible :', e));

function listingSearchText(l, extra = {}) {
  return normalize([l.title, l.activity, l.description, l.district, l.address, extra.category, extra.group, extra.city, extra.profile].filter(Boolean).join(' '));
}

module.exports = { db, ready: () => ready, listingSearchText, DB_PATH, IS_REMOTE, normalize };
