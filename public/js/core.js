import { picto, styleFor } from './pictos.js';
// G-Sports Gabon – noyau front : rendu, API, routeur, état, composants partagés

// ---------- Gabarits HTML sûrs (échappement automatique) ----------
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += val(v) + strings[i + 1]; });
  return new Raw(out);
}
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// ---------- API ----------
export const state = { meta: null, me: null, unread: 0, profile: null, favs: new Set(), fromCache: false };
export async function api(path, { method = 'GET', body, quiet } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-GSports': '1' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Connexion impossible. Vérifiez votre accès à internet et réessayez.");
  }
  if (res.headers.get('X-GS-Cache') === '1') { state.fromCache = true; showOffline(true); }
  let data = {};
  try { data = await res.json(); } catch { /* vide */ }
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    if (res.status === 401 && !quiet) { state.me = null; }
    throw err;
  }
  return data;
}

// ---------- Routeur ----------
const routes = [];
export function addRoute(pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler });
}
let renderId = 0;
const mountHooks = [];
export function onMount(fn) { mountHooks.push(fn); }
export async function render() {
  const id = ++renderId;
  const path = decodeURI(location.pathname);
  const r = routes.find((x) => x.re.test(path));
  const app = $('#app');
  closeDrawer(); closeModal();
  mountHooks.length = 0;
  const ctx = { path, query: Object.fromEntries(new URLSearchParams(location.search)), params: {} };
  if (r) { const m = r.re.exec(path); r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(m[i + 1]); }); }
  const t = setTimeout(() => { if (id === renderId) app.innerHTML = skeletonPage(); }, 180);
  let out;
  try {
    out = r ? await r.handler(ctx) : notFound();
  } catch (e) {
    out = errorView(e);
  }
  clearTimeout(t);
  if (id !== renderId) return;
  if (out !== undefined) app.innerHTML = String(out);
  updateNav();
  for (const fn of mountHooks.splice(0)) { try { fn(); } catch (e) { console.error(e); } }
  revealSections();
  if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}
// Apparition douce des sections au défilement (désactivée si « réduire les animations »)
let revealObs = null;
function revealSections() {
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  revealObs?.disconnect();
  revealObs = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('#app .section').forEach((s, i) => { if (i === 0) return; s.classList.add('reveal'); revealObs.observe(s); });
}
export function navigate(url, { replace = false } = {}) {
  if (url === location.pathname + location.search && !replace) { render(); return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
  render();
}
export function setQuery(params, { replace = true } = {}) {
  const sp = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(params)) { if (v === '' || v == null || v === false) sp.delete(k); else sp.set(k, v); }
  const qs = sp.toString();
  navigate(location.pathname + (qs ? '?' + qs : ''), { replace });
}

export function setMeta(title, desc) {
  document.title = title ? `${title} | G-Sports Gabon` : 'G-Sports Gabon';
  if (desc) { let m = document.querySelector('meta[name="description"]'); if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); } m.content = desc; }
}

// ---------- Actions et formulaires délégués ----------
const actions = {};
const forms = {};
export const action = (name, fn) => { actions[name] = fn; };
export const form = (name, fn) => { forms[name] = fn; };
export function formData(f) {
  const out = {};
  for (const el of f.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); }
      else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}
document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-action]');
  if (act && actions[act.dataset.action]) { e.preventDefault(); actions[act.dataset.action](act, e); return; }
  const a = e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') || href.startsWith('//') || a.dataset.external !== undefined || /\.(xml|txt|jpg|png|pdf)$/.test(href)) return;
  e.preventDefault();
  navigate(href);
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f || !forms[f.dataset.form]) return;
  e.preventDefault();
  const btn = f.querySelector('[type=submit]');
  const err = f.querySelector('.form-error');
  if (err) err.textContent = '';
  if (btn) btn.disabled = true;
  try { await forms[f.dataset.form](f, formData(f), e); }
  catch (ex) { if (err) { err.textContent = ex.message; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else toast(ex.message, 'err'); }
  finally { if (btn && document.contains(btn)) btn.disabled = false; }
});
window.addEventListener('popstate', render);

// ---------- Retours visuels ----------
export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
let modalClose = null;
export function openModal(content, { onOpen, label = 'Fenêtre' } = {}) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = String(html`<div class="modal" role="dialog" aria-modal="true" aria-label="${label}"><div class="scrim" data-action="close-modal"></div>
    <div class="box"><button class="icon-btn close" data-action="close-modal" aria-label="Fermer">${icon('close')}</button>${content}</div></div>`);
  const prev = document.activeElement;
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  modalClose = () => { document.removeEventListener('keydown', onKey); root.innerHTML = ''; prev?.focus?.(); modalClose = null; };
  setTimeout(() => { const first = root.querySelector('input, select, textarea, button:not(.close)'); first?.focus(); }, 50);
  onOpen?.(root.querySelector('.box'));
}
export function closeModal() { modalClose?.(); }
action('close-modal', closeModal);

export function confirmDialog(message, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    openModal(html`<h3>${message}</h3><div class="row" style="margin-top:16px;justify-content:flex-end">
      <button class="btn btn-ghost" data-action="confirm-no">Annuler</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-navy'}" data-action="confirm-yes">${ok}</button></div>`, { label: 'Confirmation' });
    action('confirm-yes', () => { closeModal(); resolve(true); });
    action('confirm-no', () => { closeModal(); resolve(false); });
  });
}

let offlineEl = null;
export function showOffline(fromCache) {
  if (offlineEl) return;
  offlineEl = document.createElement('div');
  offlineEl.className = 'offline-bar';
  offlineEl.textContent = navigator.onLine === false
    ? 'Hors connexion : affichage des informations enregistrées, peut-être pas à jour.'
    : fromCache ? 'Connexion lente : certaines informations affichées peuvent ne pas être à jour.' : 'Connexion limitée.';
  document.body.appendChild(offlineEl);
  setTimeout(() => { offlineEl?.remove(); offlineEl = null; }, navigator.onLine === false ? 10000 : 6000);
}
window.addEventListener('offline', () => showOffline(false));
window.addEventListener('online', () => { offlineEl?.remove(); offlineEl = null; toast('Connexion rétablie', 'ok'); });

// ---------- Icônes ----------
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.5 3.4 5 6.9 5c2 0 3.5 1.1 5.1 3 1.6-1.9 3.1-3 5.1-3 3.5 0 5.7 3.5 4.4 6.8C19.5 16.4 12 21 12 21z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', phone: '<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>', pin: '<path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  age: '<circle cx="12" cy="7" r="3"/><path d="M7 21v-5a5 5 0 0 1 10 0v5"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12l5 5L20 7"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 19z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/>',
};
export const icon = (n, size = 20) => raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`);

// ---------- Formatage ----------
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function fmtDate(d, long = false) {
  if (!d) return '';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${long ? MONTHS_LONG[m - 1] : MONTHS[m - 1]} ${y}`;
}
export function fmtDateTime(d) { if (!d) return ''; const x = new Date(d.replace(' ', 'T') + (d.includes('Z') ? '' : 'Z')); return x.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); }
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const PERIODS = { seance: '/ séance', semaine: '/ semaine', mois: '/ mois', trimestre: '/ trimestre', annee: '/ an', stage: '/ stage', total: '' };
export function fmtPrice(l, short = false) {
  if (l.is_free) return 'Gratuit';
  if (l.price_amount != null) return `${Number(l.price_amount).toLocaleString('fr-FR')} FCFA ${PERIODS[l.price_period] || ''}`.trim();
  return short ? 'Tarif sur demande' : (l.price_text || 'Tarif sur demande');
}
export const fmtAge = (a, b) => (b >= 99 ? `${a} ans et +` : `${a}–${b} ans`);
export const LEVEL_LABELS = { debutant: 'Débutant', intermediaire: 'Intermédiaire', avance: 'Avancé' };
export const DAY_LABELS = { lun: 'Lun', mar: 'Mar', mer: 'Mer', jeu: 'Jeu', ven: 'Ven', sam: 'Sam', dim: 'Dim' };
export const SETTING_LABELS = { indoor: 'En intérieur', outdoor: 'En extérieur', mixte: 'Intérieur & extérieur' };
export const GENDER_LABELS = { mixte: 'Mixte', filles: 'Filles', garcons: 'Garçons' };
export const AGE_GROUP_LABELS = { '5-6': '5–6 ans', '7-9': '7–9 ans', '10-12': '10–12 ans', '13-15': '13–15 ans', '16-18': '16–18 ans', '18+': '18 ans et +' };
export const cityById = (id) => state.meta?.cities.find((c) => c.id === Number(id));
export const cityBySlug = (s) => state.meta?.cities.find((c) => c.slug === s);
export const groupBySlug = (s) => state.meta?.groups.find((g) => g.slug === s);
export function catBySlug(s) { for (const g of state.meta?.groups || []) { const c = g.categories.find((x) => x.slug === s); if (c) return { ...c, group: g }; } return null; }
export const photo = (name, sm) => `/img/photos/${name}${sm ? '-sm' : ''}.jpg`;
export const initials = (s) => String(s || '?').split(/\s+/).map((w) => w.match(/\p{L}/u)?.[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';

// ---------- Favoris ----------
const LS_FAV = 'gs_favs';
function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } }
export { lsGet, lsSet };
export async function loadFavs() {
  if (state.me) {
    const local = lsGet(LS_FAV, []);
    if (local.length) { try { await api('/api/me/favorites-sync', { method: 'POST', body: { ids: local } }); lsSet(LS_FAV, []); } catch { /* plus tard */ } }
    try { const r = await api('/api/me/favorites'); state.favs = new Set(r.ids); } catch { /* ignore */ }
  } else state.favs = new Set(lsGet(LS_FAV, []));
}
action('fav', async (el) => {
  const id = Number(el.dataset.id);
  const on = !state.favs.has(id);
  try {
    if (state.me) await api(`/api/me/favorites/${id}`, { method: on ? 'POST' : 'DELETE' });
    on ? state.favs.add(id) : state.favs.delete(id);
    if (!state.me) lsSet(LS_FAV, [...state.favs]);
    $$(`.fav-btn[data-id="${id}"]`).forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Retirer des favoris' : 'Ajouter aux favoris'); });
    toast(on ? 'Ajouté à vos favoris' : 'Retiré de vos favoris');
  } catch (e) { toast(e.message, 'err'); }
});
export const favBtn = (id) => html`<button class="fav-btn ${state.favs.has(id) ? 'on' : ''}" data-action="fav" data-id="${id}" aria-pressed="${state.favs.has(id)}" aria-label="${state.favs.has(id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${icon('heart', 18)}</button>`;

// ---------- Composants ----------
export function badgeList(l, max = 3) {
  const b = [...(l.is_demo ? [{ k: 'demo', t: 'Exemple fictif' }] : []), ...l.badges].slice(0, max);
  return b.map((x) => html`<span class="badge ${x.k}">${x.t}</span>`);
}
// Statut d'inscription lisible par un parent
export function regLine(l, onDetail = false) {
  if (l.reg_state === 'complet') return 'Complet';
  if (l.reg_state === 'ouvertes') return l.reg_end ? `Inscriptions jusqu'au ${fmtDate(l.reg_end)}` : 'Inscriptions ouvertes';
  if (l.reg_state === 'bientot') return l.reg_start ? `Inscriptions dès le ${fmtDate(l.reg_start)}` : (l.start_date ? `Démarre le ${fmtDate(l.start_date)}` : 'Bientôt');
  if (l.reg_state === 'closes') return 'Inscriptions closes';
  return onDetail ? "Modalités d'inscription : voir la section 3" : "Modalités d'inscription sur la fiche";
}
export function priceParts(l) {
  if (l.is_free) return { amount: 'Gratuit', unit: '' };
  if (l.price_amount != null) return { amount: `${Number(l.price_amount).toLocaleString('fr-FR')} FCFA`, unit: PERIODS[l.price_period] || '' };
  return { amount: 'Sur demande', unit: '' };
}
const DAY_SHORT = { lun: 'lun.', mar: 'mar.', mer: 'mer.', jeu: 'jeu.', ven: 'ven.', sam: 'sam.', dim: 'dim.' };
export const daysText = (days) => days.map((d) => DAY_SHORT[d]).join(' · ');
const smallPhoto = (u) => u.replace(/(\/img\/photos\/[\w-]+)\.jpg$/, '$1-sm.jpg');
// Nombre de jours avant une date (pour le compte à rebours des inscriptions)
export function daysUntil(d) { if (!d) return null; return Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(todayStr() + 'T00:00:00Z')) / 864e5); }
function deadline(l) {
  const n = l.reg_state === 'ouvertes' ? daysUntil(l.reg_end) : null;
  if (n != null && n >= 0) return { cls: n <= 7 ? 'urgent' : 'ouvertes', text: n === 0 ? "Inscriptions : dernier jour" : `Inscriptions : J-${n}` };
  return { cls: l.reg_state || 'info', text: regLine(l) };
}
// Visuel d'une annonce : sa propre photo, sinon une photo de la même activité, sinon le pictogramme de l'activité
export function visualFor(l, size = 72) {
  const st = styleFor(l.cat_slug, l.group?.slug);
  if (l.cover) return { color: st.color, html: html`<img src="${smallPhoto(l.cover)}" alt="" loading="lazy" decoding="async">` };
  return { color: st.color, html: raw(picto(st.key, { size, title: l.cat_name || '' })) };
}
export function listingCard(l) {
  const p = priceParts(l);
  const v = visualFor(l);
  const dl = deadline(l);
  const chipsMini = [fmtAge(l.age_min, l.age_max)];
  if (l.days.length) chipsMini.push(daysText(l.days));
  else if (l.start_date) chipsMini.push(fmtDate(l.start_date) + (l.end_date && l.end_date !== l.start_date ? ' → ' + fmtDate(l.end_date) : ''));
  chipsMini.push(l.levels.map((x) => LEVEL_LABELS[x]).join(', '));
  return html`<a class="lcard fade-in" href="${l.url}" style="--c:${v.color}">
    <div class="lcard-visual ${l.cover ? 'photo' : 'picto-box'}">${v.html}${l.cover && l.cover_is_generic ? html`<span class="illus">Illustration</span>` : ''}</div>
    <div class="lcard-body">
      <div class="lcard-top"><span class="tag">${l.cat_name || l.kind_label}</span><span class="kind">${l.kind_label}</span>${l.is_demo ? html`<span class="badge demo">Exemple fictif</span>` : ''}${l.badges.filter((b) => ['complet', 'limitees', 'nouveau', 'gratuit'].includes(b.k)).map((b) => html`<span class="badge ${b.k}">${b.t}</span>`)}</div>
      <h3>${l.title}</h3>
      <p class="where">${l.org.name} · <b>${l.city.name}</b>${l.district ? ', ' + l.district : ''}${l.distance_km != null ? ` · ${l.distance_km} km` : ''}</p>
      <ul class="mini">${chipsMini.filter(Boolean).map((c) => html`<li>${c}</li>`)}</ul>
      <div class="lcard-foot"><span class="price">${p.amount}${p.unit ? html`<small> ${p.unit}</small>` : ''}</span><span class="deadline ${dl.cls}">${dl.text}</span></div>
    </div>
    <div class="lcard-fav">${favBtn(l.id)}</div>
  </a>`;
}
export function profileCard(p) {
  return html`<a class="pcard fade-in" href="${p.url}">
    <div class="pcard-logo">${p.logo ? html`<img src="${p.logo}" alt="" loading="lazy">` : html`<span>${initials(p.name)}</span>`}</div>
    <div class="pcard-body"><span class="tag">${p.type_label}</span>${p.is_demo ? html` <span class="badge demo">Exemple fictif</span>` : ''}
      <h3>${p.name}</h3><p class="where">${p.specialty || p.main_activity || p.disciplines || ''}${p.city ? html` · <b>${p.city.name}</b>` : ''}</p>
      <p class="count">${p.listing_count ? `${p.listing_count} annonce${p.listing_count > 1 ? 's' : ''} en cours →` : 'Voir le profil →'}</p></div>
  </a>`;
}
export function emptyCity(cityName, { what } = {}) {
  return html`<div class="empty"><div class="ico">🔎</div>
    <h3>${cityName ? `Aucune ${what || 'activité'} référencée à ${cityName} pour le moment` : 'Aucun résultat pour ces critères'}</h3>
    <p>${cityName ? 'Nous recherchons actuellement des activités dans cette ville. Vous pouvez nous aider à enrichir G-Sports en invitant un club ou un coach à s\'inscrire.' : 'Essayez d\'élargir votre recherche : autre ville, autre tranche d\'âge ou moins de filtres.'}</p>
    <div class="row" style="justify-content:center">
      <button class="btn btn-primary" data-action="invite">${icon('share', 18)} Inviter un club ou un coach</button>
      <a class="btn btn-ghost" href="/inscription-pro">Je suis un professionnel</a>
    </div></div>`;
}
action('invite', async () => {
  const text = "Référencez vos activités pour les jeunes sur G-Sports Gabon : les parents y comparent tarifs, horaires et modalités d'inscription.";
  const url = location.origin + '/inscription-pro';
  if (navigator.share) { try { await navigator.share({ title: 'G-Sports Gabon', text, url }); } catch { /* annulé */ } }
  else openModal(html`<h3>Inviter un club ou un coach</h3><p class="muted">Partagez ce lien avec la structure :</p>
    <input class="input" readonly value="${url}" aria-label="Lien d'inscription">
    <div class="row" style="margin-top:12px"><a class="btn btn-wa" href="https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}" target="_blank" rel="noopener">${icon('wa', 18)} WhatsApp</a>
    <button class="btn btn-ghost" data-action="copy" data-text="${url}">Copier le lien</button></div>`);
});
action('copy', async (el) => { try { await navigator.clipboard.writeText(el.dataset.text); toast('Lien copié', 'ok'); } catch { toast('Copie impossible', 'err'); } });

export function citySelect(name, selected, { placeholder = 'Toutes les villes', required = false, id, cls = 'input', byId = false } = {}) {
  const cities = state.meta?.cities || [];
  const v = (c) => (byId ? c.id : c.slug);
  const sel = (c) => String(v(c)) === String(selected ?? '');
  const featured = cities.filter((c) => c.featured).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return html`<select class="${cls}" name="${name}" ${id ? raw(`id="${esc(id)}"`) : ''} ${required ? 'required' : ''} aria-label="Ville">
    <option value="">${placeholder}</option>
    <optgroup label="Villes principales">${featured.map((c) => html`<option value="${v(c)}" ${sel(c) ? 'selected' : ''}>${c.name}</option>`)}</optgroup>
    ${(state.meta?.provinces || []).map((p) => html`<optgroup label="${p.name}">${cities.filter((c) => c.province === p.slug).map((c) => html`<option value="${v(c)}" ${sel(c) && !c.featured ? 'selected' : ''}>${c.name}</option>`)}</optgroup>`)}
  </select>`;
}
export function provinceSelect(name, selected, { placeholder = 'Toutes les provinces' } = {}) {
  return html`<select class="input" name="${name}" aria-label="Province"><option value="">${placeholder}</option>${(state.meta?.provinces || []).map((p) => html`<option value="${p.slug}" ${p.slug === selected ? 'selected' : ''}>${p.name}</option>`)}</select>`;
}
export function categorySelect(name, selected, { placeholder = 'Toutes les activités', byId = false, required = false, groupsSelectable = true } = {}) {
  return html`<select class="input" name="${name}" ${required ? 'required' : ''} aria-label="Activité"><option value="">${placeholder}</option>
    ${(state.meta?.groups || []).map((g) => html`<optgroup label="${g.name}">
      ${groupsSelectable && !byId ? html`<option value="g:${g.slug}" ${selected === 'g:' + g.slug ? 'selected' : ''}>Tout : ${g.name}</option>` : ''}
      ${g.categories.map((c) => { const v = byId ? c.id : c.slug; return html`<option value="${v}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${c.name}</option>`; })}
    </optgroup>`)}</select>`;
}
export function ageSelect(name, selected, { placeholder = 'Tous les âges', cls = 'input' } = {}) {
  const opts = [];
  for (let a = 5; a <= 18; a++) opts.push(html`<option value="${a}" ${String(a) === String(selected) ? 'selected' : ''}>${a} ans</option>`);
  return html`<select class="${cls}" name="${name}" aria-label="Âge de l'enfant"><option value="">${placeholder}</option>
    <optgroup label="Tranches d'âge">${Object.entries(AGE_GROUP_LABELS).map(([k, l]) => html`<option value="t:${k}" ${selected === 't:' + k ? 'selected' : ''}>${l}</option>`)}</optgroup>
    <optgroup label="Âge précis">${opts}</optgroup></select>`;
}
export const skeletonGrid = (n = 4) => html`<div class="grid cards">${Array.from({ length: n }, () => html`<div class="skel card-h"></div>`)}</div>`;
export const skeletonPage = () => String(html`<div class="container" style="padding:30px 16px"><div class="skel" style="height:120px;margin-bottom:20px"></div>${skeletonGrid(4)}</div>`);
export function errorView(e) {
  const offline = navigator.onLine === false;
  return html`<div class="container" style="padding:40px 16px"><div class="empty"><div class="ico">${offline ? '📶' : '⚠️'}</div>
    <h3>${offline ? 'Vous êtes hors connexion' : e.status === 404 ? 'Contenu introuvable' : e.status === 401 ? 'Connexion requise' : 'Un problème est survenu'}</h3>
    <p>${offline ? "Cette page n'est pas encore disponible hors connexion. Les informations affichées hors ligne peuvent ne pas être à jour." : e.message}</p>
    <div class="row" style="justify-content:center">${e.status === 401 ? html`<a class="btn btn-primary" href="/connexion?retour=${encodeURIComponent(location.pathname + location.search)}">Se connecter</a>` : html`<button class="btn btn-primary" data-action="reload">Réessayer</button>`}
    <a class="btn btn-ghost" href="/">Accueil</a></div></div></div>`;
}
action('reload', () => render());
export const notFound = () => { setMeta('Page introuvable'); return html`<div class="container" style="padding:40px 16px"><div class="empty"><div class="ico">🧭</div><h3>Page introuvable</h3><p>Cette page n'existe pas ou a été déplacée.</p><a class="btn btn-primary" href="/">Retour à l'accueil</a></div></div>`; };

// Exiger une connexion
export function requireLogin(roles) {
  if (!state.me) { navigate(`/connexion?retour=${encodeURIComponent(location.pathname + location.search)}`, { replace: true }); return false; }
  if (roles && !roles.includes(state.me.role)) { const e = new Error("Cette page n'est pas accessible avec votre type de compte."); e.status = 403; throw e; }
  return true;
}

// ---------- Images : compression côté appareil puis envoi ----------
// Le redimensionnement retire aussi les métadonnées (EXIF, position GPS) des photos.
export async function compressImage(file, maxSize = 1600, quality = 0.82) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Format accepté : JPEG, PNG ou WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Image trop lourde (15 Mo maximum avant compression).');
  const bmp = await createImageBitmap(file).catch(() => null);
  let w, h, src;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); w = src.naturalWidth; h = src.naturalHeight; }
  const ratio = Math.min(1, maxSize / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
export function pickAndUpload({ multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.multiple = multiple;
    input.onchange = async () => {
      const urls = [];
      for (const f of [...input.files].slice(0, 8)) {
        try { toast('Envoi de la photo…'); const data = await compressImage(f); const r = await api('/api/uploads', { method: 'POST', body: { data } }); urls.push(r.url); }
        catch (e) { toast(e.message, 'err'); }
      }
      resolve(urls);
    };
    input.click();
  });
}

// ---------- Mise en page (en-tête, menu, pied de page) ----------
const NAV = [
  ['/', 'Accueil', 'home'], ['/activites', 'Activités', 'search'], ['/clubs', 'Clubs & salles', 'grid'], ['/coachs', 'Coachs', 'user'],
  ['/stages', 'Stages & camps', 'cal'], ['/annonces', 'Annonces', 'list'], ['/publier', 'Ajouter une annonce', 'plus'],
];
function isActive(href) { const p = location.pathname; return href === '/' ? p === '/' : p === href || p.startsWith(href + '/'); }
export function spaceLink() {
  if (!state.me) return null;
  return state.me.role === 'admin' ? '/admin' : state.me.role === 'pro' ? '/espace-pro' : '/espace-parent';
}
export function season() {
  const d = new Date(); const y = d.getFullYear();
  return d.getMonth() >= 7 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}
export function renderLayout() {
  const me = state.me;
  $('#header').innerHTML = String(html`<div class="container bar">
    <a class="logo" href="/" aria-label="G-Sports Gabon, accueil"><img src="/img/icons/icon-192.png" alt="" width="34" height="34"><span class="wordmark">G-Sports</span><small>Gabon</small></a>
    <nav class="main-nav" aria-label="Navigation principale">${NAV.map(([h, l]) => html`<a href="${h}" class="${isActive(h) ? 'active' : ''}">${l}</a>`)}</nav>
    <div class="header-actions">
      <a class="icon-btn hide-sm" href="/favoris" aria-label="Mes favoris">${icon('heart')}</a>
      ${me ? html`<a class="icon-btn" href="${spaceLink()}?tab=notifications" aria-label="Notifications">${icon('bell')}${state.unread ? html`<span class="dot">${state.unread}</span>` : ''}</a>
        <a class="btn btn-navy btn-sm hide-sm" href="${spaceLink()}">${icon('user', 16)} Mon espace</a>`
      : html`<a class="btn btn-ghost btn-sm hide-sm" href="/connexion">Se connecter</a><a class="btn btn-primary btn-sm" href="/inscription">Inscription</a>`}
      <button class="icon-btn menu-toggle" data-action="drawer" aria-label="Ouvrir le menu" aria-expanded="false">${icon('menu')}</button>
    </div></div>`);
  $('#bottom-nav').innerHTML = String(html`
    <a href="/" class="${isActive('/') ? 'active' : ''}">${icon('home')}Accueil</a>
    <a href="/activites" class="${isActive('/activites') ? 'active' : ''}">${icon('search')}Explorer</a>
    <a href="/publier" class="publish ${isActive('/publier') ? 'active' : ''}"><span class="ic">${icon('plus')}</span>Publier</a>
    <a href="/favoris" class="${isActive('/favoris') ? 'active' : ''}">${icon('heart')}Favoris</a>
    <a href="${me ? spaceLink() : '/connexion'}" class="${me && isActive(spaceLink()) ? 'active' : ''}">${icon('user')}${me ? 'Mon espace' : 'Compte'}</a>`);
  $('#footer').innerHTML = String(html`<div class="container">
    <div class="cols">
      <div><a class="logo" href="/"><img src="/img/icons/icon-192.png" alt="" width="34" height="34"><span class="wordmark">G-Sports</span><small>Gabon</small></a>
        <p class="footer-slogan">${state.meta?.home?.slogan || 'À chaque jeune son activité. À chaque talent son terrain.'}</p>
        ${installAvailable() ? html`<p style="margin-top:14px"><button class="btn btn-primary btn-sm" data-action="install">${icon('download', 16)} Installer l'application</button></p>` : ''}</div>
      <div><h4>Explorer</h4><ul><li><a href="/activites">Toutes les activités</a></li><li><a href="/sports">Sports</a></li><li><a href="/extrascolaire">Extrascolaire</a></li><li><a href="/stages">Stages</a></li><li><a href="/camps">Camps de vacances</a></li><li><a href="/calendrier">Calendrier</a></li><li><a href="/carte">Carte du Gabon</a></li></ul></div>
      <div><h4>Professionnels</h4><ul><li><a href="/inscription-pro">Référencer mon activité</a></li><li><a href="/publier">Publier une annonce</a></li><li><a href="/modeles">Modèles d'annonces</a></li><li><a href="/clubs">Clubs & salles</a></li><li><a href="/coachs">Coachs</a></li></ul></div>
      <div><h4>G-Sports</h4><ul><li><a href="/a-propos">À propos</a></li><li><a href="/comment-ca-marche">Comment ça marche</a></li><li><a href="/securite">Sécurité des jeunes</a></li><li><a href="/faq">FAQ</a></li><li><a href="/contact">Contact</a></li><li><a href="/signalement">Signaler un contenu</a></li></ul></div>
    </div>
    <div class="bottom"><span>© ${new Date().getFullYear()} G-Sports Gabon — mise en relation entre familles et professionnels</span>
      <span><a href="/conditions">Conditions d'utilisation</a> · <a href="/confidentialite">Confidentialité</a></span></div></div>`);
}
function updateNav() {
  $$('.main-nav a').forEach((a) => a.classList.toggle('active', isActive(a.getAttribute('href'))));
  $$('#bottom-nav a').forEach((a) => a.classList.toggle('active', isActive(a.getAttribute('href'))));
}
action('drawer', () => {
  const me = state.me;
  const d = $('#drawer');
  d.innerHTML = String(html`<div class="scrim" data-action="close-drawer"></div><div class="panel" role="dialog" aria-label="Menu">
    <div class="row between" style="margin-bottom:8px"><span class="logo"><span class="wordmark">G-Sports</span><small>Gabon</small></span>
      <button class="icon-btn" data-action="close-drawer" aria-label="Fermer le menu">${icon('close')}</button></div>
    ${NAV.map(([h, l]) => html`<a class="nav ${isActive(h) ? 'active' : ''}" href="${h}">${l}</a>`)}
    <a class="nav" href="/calendrier">Calendrier des inscriptions</a><a class="nav" href="/carte">Carte du Gabon</a>
    <a class="nav" href="/favoris">Mes favoris</a>
    <hr style="border:0;border-top:1px solid var(--line);width:100%">
    ${me ? html`<a class="nav" href="${spaceLink()}">${icon('user')} Mon espace (${me.name})</a><button class="btn btn-ghost" data-action="logout">Se déconnecter</button>`
      : html`<a class="btn btn-primary" href="/inscription">Créer un compte parent</a><a class="btn btn-ghost" href="/connexion">Se connecter</a><a class="btn btn-navy" href="/inscription-pro">Référencer mon activité</a>`}
    ${installAvailable() ? html`<button class="btn btn-turq" data-action="install" style="margin-top:8px">${icon('download', 18)} Installer l'application</button>` : ''}
  </div>`);
  d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
});
export function closeDrawer() { const d = $('#drawer'); if (d) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); d.innerHTML = ''; } }
action('close-drawer', closeDrawer);
action('logout', async () => {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  state.me = null; state.unread = 0; state.profile = null; await loadFavs(); renderLayout(); navigate('/');
  toast('Vous êtes déconnecté');
});

export async function refreshMe() {
  try {
    const r = await api('/api/me', { quiet: true });
    state.me = r.user; state.unread = r.unread || 0; state.profile = r.profile || null;
  } catch { state.me = null; }
}

// ---------- Installation (PWA) ----------
let deferredPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const installAvailable = () => !isStandalone() && (!!deferredPrompt || isIOS());
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; renderLayout(); document.dispatchEvent(new Event('gs:install')); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; renderLayout(); toast('G-Sports Gabon est installé', 'ok'); });
action('install', async () => {
  if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => null); deferredPrompt = null; renderLayout(); return; }
  openModal(html`<h3>Installer G-Sports Gabon</h3>
    <p>Sur iPhone ou iPad (Safari) :</p><ol><li>Touchez le bouton <b>Partager</b> (carré avec une flèche).</li><li>Choisissez <b>« Sur l'écran d'accueil »</b>.</li><li>Validez avec <b>Ajouter</b>.</li></ol>
    <p class="muted small">Sur Android, Windows ou Mac, utilisez le menu du navigateur (Chrome, Edge) : « Installer l'application ». L'application reste utilisable dans le navigateur sans installation.</p>`);
});
