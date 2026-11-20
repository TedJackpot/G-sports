'use strict';
const crypto = require('node:crypto');

function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function slugify(s) {
  return normalize(s).replace(/\s+/g, '-').slice(0, 80) || 'item';
}
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Hachage de mot de passe : scrypt avec sel aléatoire
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [algo, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

// Validation simple et explicite des champs
const V = {
  str(v, { max = 2000, min = 0, required = false, field = 'champ' } = {}) {
    if (v === undefined || v === null || v === '') {
      if (required) throw new HttpError(400, `Le champ « ${field} » est obligatoire.`);
      return null;
    }
    const s = String(v).replace(/\u0000/g, '').trim();
    if (required && !s) throw new HttpError(400, `Le champ « ${field} » est obligatoire.`);
    if (s.length < min) throw new HttpError(400, `Le champ « ${field} » est trop court.`);
    if (s.length > max) throw new HttpError(400, `Le champ « ${field} » est trop long (${max} caractères max).`);
    return s || null;
  },
  int(v, { min = -Infinity, max = Infinity, required = false, field = 'champ' } = {}) {
    if (v === undefined || v === null || v === '') {
      if (required) throw new HttpError(400, `Le champ « ${field} » est obligatoire.`);
      return null;
    }
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Le champ « ${field} » est invalide.`);
    return n;
  },
  num(v, { min = -Infinity, max = Infinity, field = 'champ' } = {}) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Le champ « ${field} » est invalide.`);
    return n;
  },
  bool(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0; },
  email(v, { required = false } = {}) {
    const s = V.str(v, { max: 200, required, field: 'email' });
    if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new HttpError(400, 'Adresse email invalide.');
    return s ? s.toLowerCase() : null;
  },
  phone(v, { required = false, field = 'téléphone' } = {}) {
    const s = V.str(v, { max: 30, required, field });
    if (s && !/^[+0-9 ().-]{6,30}$/.test(s)) throw new HttpError(400, `Numéro de ${field} invalide.`);
    return s;
  },
  date(v, { field = 'date' } = {}) {
    const s = V.str(v, { max: 10, field });
    if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s)))) throw new HttpError(400, `La ${field} est invalide.`);
    return s;
  },
  url(v, { field = 'lien' } = {}) {
    const s = V.str(v, { max: 300, field });
    if (!s) return null;
    try { const u = new URL(s.startsWith('http') ? s : 'https://' + s); if (!/^https?:$/.test(u.protocol)) throw 0; return u.toString(); }
    catch { throw new HttpError(400, `Le ${field} est invalide.`); }
  },
  oneOf(v, list, def) { return list.includes(v) ? v : def; },
  list(v, allowed, { max = 20 } = {}) {
    const arr = Array.isArray(v) ? v : String(v || '').split(',');
    return [...new Set(arr.map(x => String(x).trim()).filter(x => allowed ? allowed.includes(x) : x))].slice(0, max);
  },
};

function json(v, def) { try { return v ? JSON.parse(v) : def; } catch { return def; } }

module.exports = { normalize, slugify, today, addDays, hashPassword, verifyPassword, randomToken, sha256, HttpError, V, json };
