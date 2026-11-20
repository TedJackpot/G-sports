// G-Sports Gabon – pages publiques
import {
  html, raw, esc, $, $$, api, state, addRoute, navigate, setMeta, action, form, onMount, toast, openModal, closeModal, icon,
  fmtDate, fmtPrice, fmtAge, LEVEL_LABELS, DAY_LABELS, SETTING_LABELS, GENDER_LABELS, AGE_GROUP_LABELS, MONTHS_LONG, todayStr,
  cityBySlug, groupBySlug, catBySlug, photo, initials, listingCard, profileCard, emptyCity, citySelect, provinceSelect,
  categorySelect, ageSelect, skeletonGrid, favBtn, badgeList, lsGet, lsSet, installAvailable, spaceLink, render,
} from './core.js';

// ================= ACCUEIL =================
// Met en valeur le mot « grandir » (ou le dernier mot) du titre principal
function heroTitle(t) {
  const m = /^(.*?)(grandir)(.*)$/i.exec(t);
  if (m) return html`${m[1]}<span class="hl">${m[2]}</span>${m[3]}`;
  return t;
}
function rail(items, emptyMsg) {
  if (!items.length) return html`<div class="empty" style="padding:22px"><p style="margin:0">${emptyMsg || 'Aucune annonce pour le moment.'} <a href="/inscription-pro">Vous êtes un club ou un coach ? Publiez gratuitement.</a></p></div>`;
  return html`<div class="rail">${items.map(listingCard)}</div>`;
}
function section(title, sub, link, body, alt = false, eyebrow = '') {
  return html`<section class="section ${alt ? 'alt' : ''}"><div class="container">
    <div class="section-head"><div>${eyebrow ? html`<span class="eyebrow">${eyebrow}</span>` : ''}<h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>
    ${link ? html`<a class="btn btn-ghost btn-sm" href="${link}">Tout voir →</a>` : ''}</div>${body}</div></section>`;
}
addRoute('/', async () => {
  setMeta(null, 'Trouvez gratuitement une activité sportive, artistique ou éducative pour votre enfant partout au Gabon.');
  const [home] = await Promise.all([api('/api/home')]);
  const m = state.meta;
  const h = m.home || {};
  const hasDemo = [...home.newest, ...home.popular].some((l) => l.is_demo);
  const prefCity = state.me ? (state.me.preferred_cities?.[0] || state.me.city_id) : lsGet('gs_city', null);
  const prefCityObj = prefCity ? m.cities.find((c) => c.id === Number(prefCity) || c.slug === prefCity) : null;
  const clubs = prefCityObj ? [...home.clubs.filter((c) => c.city?.slug === prefCityObj.slug), ...home.clubs.filter((c) => c.city?.slug !== prefCityObj.slug)] : home.clubs;
  const discover = m.groups.slice(0, 10);
  return html`
  <section class="hero">
    <div class="bg" style="background-image:url('${photo(h.heroImage || 'basket-joie')}')"></div>
    <div class="container inner">
      <span class="kicker">🇬🇦 Partout au Gabon · 100 % gratuit</span>
      <h1>${heroTitle(h.heroTitle || "Trouvez l'activité qui fera grandir votre enfant.")}</h1>
      <p class="sub">${h.heroSubtitle || 'Sports, loisirs, clubs, coachs, stages et activités extrascolaires partout au Gabon.'}</p>
      <form class="search-card" data-form="hero-search" role="search">
        <label class="field"><span>Quelle activité recherchez-vous ?</span><input name="q" list="dl-acts" placeholder="Football, natation, danse, robotique…" autocomplete="off"></label>
        <label class="field"><span>Dans quelle ville ?</span>${citySelect('city', prefCityObj?.slug, { placeholder: 'Tout le Gabon', cls: '' })}</label>
        <label class="field"><span>Quel âge a votre enfant ?</span>${ageSelect('age', '', { placeholder: 'Tous âges', cls: '' })}</label>
        <button class="btn btn-primary btn-lg" type="submit">${icon('search')} Trouver une activité</button>
        <datalist id="dl-acts">${m.groups.flatMap((g) => [html`<option value="${g.name}">`, ...g.categories.map((c) => html`<option value="${c.name}">`)])}</datalist>
      </form>
      <div class="chips scroll" style="margin-top:16px">${m.groups.map((g) => html`<a class="chip" href="/activites?what=g:${g.slug}">${g.icon} ${g.name}</a>`)}</div>
      <div class="hero-stats">
        ${home.stats.listings >= 10 ? html`<div><b>${home.stats.listings}</b>annonces actives</div><div><b>${home.stats.profiles}</b>clubs & coachs</div>`
          : html`<div><b>100 %</b>gratuit, sans abonnement</div><div><b>Direct</b>contact avec le club ou le coach</div>`}
        <div><b>9</b>provinces couvertes</div>
        <div class="hide-xs"><b>5 ans +</b>sport, art, nature, sciences</div>
      </div>
    </div>
  </section>
  ${h.banner ? html`<div class="container" style="margin-top:16px"><div class="notice">${h.banner}</div></div>` : ''}
  ${hasDemo ? html`<div class="container" style="margin-top:16px"><div class="notice demo"><b>Exemples fictifs :</b> les annonces marquées « Exemple fictif » illustrent la présentation des offres. Elles ne correspondent à aucune activité réelle et seront retirées dès l'arrivée des premières annonces.</div></div>` : ''}
  ${home.posts.length ? html`<div class="container" style="margin-top:16px">${home.posts.map((p) => html`<div class="notice" style="margin-bottom:8px"><b>${p.title}</b> — ${p.body.slice(0, 220)} ${p.link ? html`<a href="${p.link}">En savoir plus</a>` : ''}</div>`)}</div>` : ''}

  ${section('Activités populaires', 'Les annonces les plus consultées par les familles.', '/activites?sort=populaire', rail(home.popular))}
  ${section("Trouver une activité par âge", 'Des propositions adaptées à chaque étape de croissance.', null, html`<div class="age-grid">
    ${Object.entries(AGE_GROUP_LABELS).map(([k, l]) => html`<a class="age-tile" href="/activites?age=t:${k}"><b>${l.replace(' ans', '').replace(' et +', '+')}</b><span>ans</span></a>`)}</div>`, true)}
  ${section('Explorer par ville', "Libreville, Port-Gentil, Franceville, Oyem… et toutes les localités du Gabon.", '/carte', html`<div class="city-grid">
    ${home.cityCounts.map((c) => html`<a class="city-tile" href="/activites/${c.slug}"><span>${c.name}</span><span class="count-pill ${c.n ? '' : 'zero'}">${c.n}</span></a>`)}</div>
    <p class="small muted" style="margin-top:10px">Une autre localité ? <a href="/activites">Choisissez-la dans la recherche</a> ou <a href="/carte">explorez la carte</a>.</p>`)}
  ${section('Clubs et salles près de chez vous', prefCityObj ? `Autour de ${prefCityObj.name} en priorité.` : 'Clubs sportifs, gymnases, associations et centres de loisirs.', '/clubs', clubs.length ? html`<div class="grid cards">${clubs.slice(0, 6).map(profileCard)}</div>` : rail([], 'Aucun club référencé pour le moment.'), true)}
  ${section('Coachs sportifs indépendants', 'Cours individuels ou en groupe, en salle, en extérieur ou à domicile.', '/coachs', home.coaches.length ? html`<div class="grid cards">${home.coaches.slice(0, 6).map(profileCard)}</div>` : rail([], 'Aucun coach référencé pour le moment.'))}
  ${section('Inscriptions ouvertes actuellement', "Ne manquez pas les dates limites.", '/activites?open=1&sort=inscription', rail(home.open, 'Aucune période d\'inscription ouverte actuellement.'), true, 'En ce moment')}
  ${section('Stages et camps à venir', 'Stages intensifs, camps sportifs, nature et culturels.', '/stages', rail(home.camps, 'Aucun stage ou camp à venir pour le moment.'))}
  ${section('Activités pendant les vacances', 'Pour occuper intelligemment les vacances scolaires.', '/activites?holidays=1', rail(home.holidays, 'Aucune activité de vacances annoncée pour le moment.'), true)}
  ${section('Nouvelles annonces', 'Les dernières publications des clubs et coachs.', '/annonces', rail(home.newest))}
  ${section('Activités gratuites ou à petits prix', 'Gratuites ou jusqu\'à 10 000 FCFA.', '/activites?maxprice=10000&sort=prix', rail(home.free, 'Aucune activité gratuite ou à petit prix pour le moment.'), true)}
  ${section('Les activités à découvrir', 'Sport, art, nature, sciences : explorez toutes les familles d\'activités.', '/activites', html`<div class="cat-grid">
    ${discover.map((g) => html`<a class="cat-tile" href="/activites?what=g:${g.slug}" style="background:${g.color}">
      ${g.image ? html`<img src="${photo(g.image, true)}" alt="" loading="lazy">` : ''}
      <span class="ico">${g.icon}</span><b>${g.name}</b><small>${g.categories.slice(0, 3).map((c) => c.name).join(', ')}…</small></a>`)}</div>`)}
  ${home.discover.length ? section('Journées découverte & séances d\'essai', 'Pour tester avant de s\'engager.', '/activites?kind=decouverte,essai,portes-ouvertes', rail(home.discover), true) : ''}
  ${section('Comment fonctionne G-Sports ?', 'Trouver une activité en moins de 30 secondes.', '/comment-ca-marche', html`<div class="steps">
    <div class="step"><h3>Choisissez la ville</h3><p class="muted">Partout au Gabon : Libreville, Oyem, Moanda, Lambaréné…</p></div>
    <div class="step"><h3>Indiquez l'âge</h3><p class="muted">Seules les activités adaptées s'affichent.</p></div>
    <div class="step"><h3>Comparez</h3><p class="muted">Horaires, tarifs, encadrement, dates d'inscription.</p></div>
    <div class="step"><h3>Contactez directement</h3><p class="muted">Appel, WhatsApp ou message : sans intermédiaire, sans frais.</p></div></div>`, true)}
  <section class="section"><div class="container">
    <div class="pro-band">
      <div><span class="eyebrow" style="color:var(--sun)">Espace clubs et professionnels</span>
        <h2>Vous êtes un club, une association, un gymnase, un coach ou un organisateur ?</h2>
        <ul><li>Profil et annonces 100 % gratuits, sans abonnement ni commission</li><li>Publiez activités, stages, camps, portes ouvertes et séances d'essai</li><li>Recevez les demandes des parents directement</li><li>Gérez tout depuis votre téléphone</li></ul>
        <div class="row" style="margin-top:18px"><a class="btn btn-primary btn-lg" href="/inscription-pro">Référencer mon activité gratuitement</a><a class="btn btn-ghost" href="/modeles">Voir les modèles d'annonces</a></div>
      </div>
      <div class="photo"><img src="${photo('football-coach', true)}" alt="Une entraîneuse encadre de jeunes footballeurs" loading="lazy"></div>
    </div>
  </div></section>
  <section class="section alt"><div class="container center">
    <span class="eyebrow">Ensemble, couvrons tout le Gabon</span>
    <h2>Aidez-nous à référencer les activités de votre ville</h2>
    <p class="muted" style="max-width:640px;margin:0 auto 18px">Vous connaissez un club, un coach ou une association près de chez vous ? Invitez-les à rejoindre G-Sports : c'est gratuit pour tout le monde.</p>
    <div class="row" style="justify-content:center"><button class="btn btn-navy" data-action="invite">${icon('share', 18)} Inviter un professionnel</button>
    ${installAvailable() ? html`<button class="btn btn-ghost" data-action="install">${icon('download', 18)} Installer l'application</button>` : ''}</div>
  </div></section>`;
});
form('hero-search', (f, d) => {
  const qs = new URLSearchParams();
  const q = (d.q || '').trim();
  if (q) {
    const n = q.toLowerCase();
    let match = null;
    for (const g of state.meta.groups) {
      if (g.name.toLowerCase() === n) { match = 'g:' + g.slug; break; }
      const c = g.categories.find((x) => x.name.toLowerCase() === n);
      if (c) { match = c.slug; break; }
    }
    if (match) qs.set('what', match); else qs.set('q', q);
  }
  if (d.city) { qs.set('city', d.city); lsSet('gs_city', d.city); }
  if (d.age) qs.set('age', d.age);
  navigate('/activites' + (qs.toString() ? '?' + qs : ''));
});

// ================= EXPLORER / RECHERCHE =================
const PTYPE_FILTERS = [['club', 'Club'], ['coach', 'Coach individuel'], ['gymnase', 'Gymnase'], ['salle', 'Salle de sport'], ['association', 'Association'], ['centre', 'Centre de loisirs'], ['organisateur', 'Organisateur camps/stages'], ['ecole', 'Structure extrascolaire'], ['educateur', 'Éducateur']];
const KIND_FILTERS = [['activite', 'Activité régulière'], ['stage', 'Stage'], ['camp', 'Camp'], ['decouverte', 'Journée découverte'], ['essai', "Séance d'essai"], ['portes-ouvertes', 'Portes ouvertes'], ['inscriptions', 'Inscriptions saison'], ['tournoi', 'Tournoi'], ['programme', 'Programme ados']];

function toApiQuery(f) {
  const q = {};
  for (const k of ['q', 'city', 'province', 'district', 'kind', 'ptype', 'free', 'maxprice', 'level', 'beginner', 'open', 'holidays', 'weekend', 'weekday', 'setting', 'from', 'to', 'sort', 'page', 'lat', 'lng', 'groupkind', 'upcoming']) if (f[k]) q[k] = f[k];
  if (f.what) { if (f.what.startsWith('g:')) q.group = f.what.slice(2); else q.cat = f.what; }
  if (f.age) { if (String(f.age).startsWith('t:')) q.agegroup = f.age.slice(2); else q.age = f.age; }
  return q;
}
function describe(f) {
  const parts = [];
  if (f.what) parts.push(f.what.startsWith('g:') ? groupBySlug(f.what.slice(2))?.name : catBySlug(f.what)?.name);
  if (f.age) parts.push(String(f.age).startsWith('t:') ? AGE_GROUP_LABELS[f.age.slice(2)] : `${f.age} ans`);
  if (f.city) parts.push('à ' + (cityBySlug(f.city)?.name || f.city));
  return parts.filter(Boolean).join(' · ');
}
async function explorePage(ctx, preset = {}) {
  const base = preset.base || '/activites';
  const f = { ...(preset.fixed || {}), ...(preset.defaults || {}), ...ctx.query };
  if (ctx.params.city) { const c = cityBySlug(ctx.params.city); if (c) f.city = c.slug; else f.q = ctx.params.city.replace(/-/g, ' '); }
  if (ctx.params.what) {
    const w = ctx.params.what;
    if (catBySlug(w)) f.what = w; else if (groupBySlug(w)) f.what = 'g:' + w; else if (w === 'vacances') f.holidays = '1'; else f.q = w.replace(/-/g, ' ');
  }
  if (ctx.params.age) f.age = 't:' + ctx.params.age.replace(/-ans$/, '').replace('plus', '+');
  const view = f.view || lsGet('gs_view', 'grid');
  const data = await api('/api/listings?' + new URLSearchParams({ ...toApiQuery(f), limit: 24 }));
  const city = f.city ? cityBySlug(f.city) : null;
  const desc = describe(f);
  const title = preset.title || (desc ? `Activités ${desc}` : 'Explorer les activités');
  setMeta(title, preset.sub || 'Recherchez une activité par ville, âge, catégorie et tarif partout au Gabon.');
  const chk = (name, label, extra = '') => html`<label class="check"><input type="checkbox" name="${name}" value="1" ${f[name] === '1' ? 'checked' : ''} ${raw(extra)}> ${label}</label>`;
  const multi = (name, list) => { const cur = String(f[name] || '').split(','); return list.map(([v, l]) => html`<label class="check"><input type="checkbox" data-multi name="${name}" value="${v}" ${cur.includes(v) ? 'checked' : ''}> ${l}</label>`); };
  const active = [];
  if (f.q) active.push(['q', `« ${f.q} »`]);
  if (f.what) active.push(['what', f.what.startsWith('g:') ? groupBySlug(f.what.slice(2))?.name : catBySlug(f.what)?.name]);
  if (f.city) active.push(['city', city?.name || f.city]);
  if (f.province) active.push(['province', state.meta.provinces.find((p) => p.slug === f.province)?.name]);
  if (f.age) active.push(['age', String(f.age).startsWith('t:') ? AGE_GROUP_LABELS[f.age.slice(2)] : `${f.age} ans`]);
  if (f.free === '1') active.push(['free', 'Gratuit']);
  if (f.open === '1') active.push(['open', 'Inscriptions ouvertes']);
  if (f.holidays === '1' && !preset.fixed?.holidays) active.push(['holidays', 'Vacances']);
  const page = Number(f.page) || 1;

  onMount(() => {
    const fm = $('#filters');
    fm?.addEventListener('change', (e) => { if (window.matchMedia('(min-width: 1000px)').matches || e.target.name === 'sort') applyFilters(); });
    fm?.addEventListener('submit', (e) => { e.preventDefault(); applyFilters(); });
  });
  function applyFilters(extra = {}) {
    const fm = $('#filters');
    const d = {};
    for (const el of fm.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') { if (el.dataset.multi !== undefined) { if (el.checked) d[el.name] = d[el.name] ? d[el.name] + ',' + el.value : el.value; } else if (el.checked) d[el.name] = '1'; }
      else if (el.type === 'radio') { if (el.checked && el.value) d[el.name] = el.value; }
      else if (el.value) d[el.name] = el.value;
    }
    const sort = $('#sort')?.value; if (sort) d.sort = sort;
    if (f.view) d.view = f.view;
    if (d.sort === 'proximite' && f.lat) { d.lat = f.lat; d.lng = f.lng; }
    Object.assign(d, extra);
    for (const k of Object.keys(preset.fixed || {})) delete d[k];
    const qs = new URLSearchParams(d).toString();
    navigate(base + (qs ? '?' + qs : ''), { replace: false });
  }
  exploreApply = applyFilters;

  return html`
  <div class="page-head ${preset.image ? 'has-img' : ''}">${preset.image ? html`<div class="bg" style="background-image:url('${photo(preset.image, true)}')"></div>` : ''}
    <div class="container"><div class="crumbs"><a href="/">Accueil</a> › ${preset.crumb || 'Activités'}</div>
    <h1>${title}</h1><p>${preset.sub || (city ? `${city.name}, province ${city.province_name}.` : 'Sports, loisirs, culture et éducation partout au Gabon.')}</p>
    ${preset.tabs ? html`<div class="chips scroll" style="margin-top:14px">${preset.tabs.map(([q, l]) => html`<a class="chip ${(new URLSearchParams(q).get('tab') || '') === (ctx.query.tab || '') ? 'on' : ''}" href="${base}${q ? '?' + q : ''}" style="${(new URLSearchParams(q).get('tab') || '') === (ctx.query.tab || '') ? '' : 'background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.25)'}">${l}</a>`)}</div>` : ''}
    </div></div>
  <div class="container explore">
    <form class="filters" id="filters" aria-label="Filtres de recherche">
      <div class="row between close-filters"><h2 style="margin:0;font-size:1.2rem">Filtres</h2><button type="button" class="icon-btn" data-action="toggle-filters" aria-label="Fermer les filtres">${icon('close')}</button></div>
      <h3>Recherche</h3><input class="input" name="q" value="${f.q || ''}" placeholder="Mot-clé, club, quartier…" aria-label="Mot-clé">
      <h3>Lieu</h3><div class="stack">${citySelect('city', f.city)}${provinceSelect('province', f.province)}<input class="input" name="district" value="${f.district || ''}" placeholder="Quartier ou zone" aria-label="Quartier ou zone"></div>
      <h3>Activité</h3>${categorySelect('what', f.what)}
      <h3>Âge de l'enfant</h3>${ageSelect('age', f.age)}
      <h3>Disponibilités</h3>${chk('open', 'Inscriptions ouvertes')}${preset.fixed?.holidays ? '' : chk('holidays', 'Pendant les vacances')}${chk('weekend', 'Le week-end')}${chk('weekday', 'En semaine')}
      <div class="cols" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px"><label class="lbl small">Du<input class="input" type="date" name="from" value="${f.from || ''}"></label><label class="lbl small">Au<input class="input" type="date" name="to" value="${f.to || ''}"></label></div>
      <h3>Tarif</h3>${chk('free', 'Gratuit uniquement')}
      <select class="input" name="maxprice" aria-label="Budget maximum"><option value="">Budget maximum</option>${[5000, 10000, 25000, 50000, 100000].map((v) => html`<option value="${v}" ${String(v) === f.maxprice ? 'selected' : ''}>Jusqu'à ${v.toLocaleString('fr-FR')} FCFA</option>`)}</select>
      <h3>Niveau</h3><select class="input" name="level" aria-label="Niveau"><option value="">Tous niveaux</option>${Object.entries(LEVEL_LABELS).map(([k, l]) => html`<option value="${k}" ${f.level === k ? 'selected' : ''}>${l}</option>`)}</select>${chk('beginner', 'Débutants acceptés')}
      <h3>Lieu de pratique</h3><div class="pill-checks">${[['', 'Tous'], ['indoor', 'Indoor'], ['outdoor', 'Outdoor']].map(([v, l]) => html`<label><input type="radio" name="setting" value="${v}" ${(f.setting || '') === v ? 'checked' : ''}><span>${l}</span></label>`)}</div>
      ${preset.fixed?.kind ? '' : html`<h3>Type d'annonce</h3>${multi('kind', KIND_FILTERS)}`}
      <h3>Proposé par</h3>${multi('ptype', PTYPE_FILTERS)}
      <div class="apply-mobile"><button class="btn btn-primary btn-block" type="submit">Afficher les résultats</button></div>
      <button type="button" class="btn btn-ghost btn-block" style="margin-top:14px" data-action="reset-filters" data-base="${base}">Réinitialiser</button>
    </form>
    <div>
      <div class="toolbar">
        <button class="btn btn-ghost btn-sm filters-toggle" data-action="toggle-filters">${icon('filter', 16)} Filtres${active.length ? ` (${active.length})` : ''}</button>
        <span class="count" aria-live="polite">${data.total} résultat${data.total > 1 ? 's' : ''}</span>
        <span class="spacer"></span>
        <select class="input" id="sort" style="width:auto;padding:8px 12px" aria-label="Trier" data-action-change="sort">
          ${[['', 'Nouveautés'], ['inscription', "Date d'inscription"], ['date', 'Date de début'], ['prix', 'Tarif croissant'], ['populaire', 'Popularité'], ['proximite', 'Proximité']].map(([v, l]) => html`<option value="${v}" ${(f.sort || '') === v ? 'selected' : ''}>${l}</option>`)}
        </select>
        <div class="seg" role="group" aria-label="Affichage"><button class="${view === 'grid' ? 'on' : ''}" data-action="view" data-v="grid" aria-label="Affichage cartes">${icon('grid', 16)}</button><button class="${view === 'list' ? 'on' : ''}" data-action="view" data-v="list" aria-label="Affichage liste">${icon('list', 16)}</button></div>
      </div>
      ${active.length ? html`<div class="active-filters">${active.map(([k, l]) => html`<button class="chip" data-action="drop-filter" data-k="${k}">${l} ✕</button>`)}</div>` : ''}
      ${f.sort === 'proximite' && !f.lat ? html`<div class="notice" style="margin-bottom:12px">Pour trier par proximité, autorisez ponctuellement l'accès à votre position. Elle n'est ni enregistrée ni partagée. <button class="link-btn" data-action="near-me">Utiliser ma position</button></div>` : ''}
      ${data.items.some((l) => l.is_demo) ? html`<div class="notice demo" style="margin-bottom:12px">Les annonces « Exemple fictif » servent uniquement d'illustration.</div>` : ''}
      ${data.items.length ? html`<div class="grid cards ${view === 'list' ? 'list-view' : ''}" style="${view === 'list' ? 'grid-template-columns:1fr' : ''}">${data.items.map(listingCard)}</div>`
        : emptyCity(city?.name, { what: preset.what })}
      ${data.pages > 1 ? html`<nav class="pager" aria-label="Pagination">${page > 1 ? html`<button class="btn btn-ghost btn-sm" data-action="page" data-p="${page - 1}">← Précédent</button>` : ''}<span class="btn btn-sm" style="cursor:default">Page ${page} / ${data.pages}</span>${page < data.pages ? html`<button class="btn btn-ghost btn-sm" data-action="page" data-p="${page + 1}">Suivant →</button>` : ''}</nav>` : ''}
    </div>
  </div>`;
}
let exploreApply = () => {};
action('toggle-filters', () => $('#filters')?.classList.toggle('open'));
action('reset-filters', (el) => navigate(el.dataset.base));
action('view', (el) => { lsSet('gs_view', el.dataset.v); render(); });
action('page', (el) => exploreApply({ page: el.dataset.p }));
action('drop-filter', (el) => { const fm = $('#filters'); const inp = fm.elements[el.dataset.k]; if (inp) { if (inp.type === 'checkbox') inp.checked = false; else inp.value = ''; } exploreApply(); });
function nearMe() {
  if (!navigator.geolocation) return toast('Géolocalisation indisponible sur cet appareil.', 'err');
  navigator.geolocation.getCurrentPosition((p) => exploreApply({ sort: 'proximite', lat: p.coords.latitude.toFixed(3), lng: p.coords.longitude.toFixed(3) }),
    () => toast('Position non disponible. Choisissez plutôt une ville.', 'err'), { timeout: 10000, maximumAge: 600000 });
}
action('near-me', nearMe);
document.addEventListener('change', (e) => { if (e.target.id === 'sort') { if (e.target.value === 'proximite') nearMe(); else exploreApply(); } });

addRoute('/activites', (ctx) => explorePage(ctx));
addRoute('/recherche', (ctx) => explorePage(ctx, { title: 'Recherche avancée', crumb: 'Recherche avancée', sub: 'Combinez tous les filtres : lieu, âge, niveau, tarif, dates et disponibilités.', base: '/recherche' }));
addRoute('/activites/:city', (ctx) => explorePage(ctx));
addRoute('/activites/:city/:what', (ctx) => explorePage(ctx));
addRoute('/age/:age', (ctx) => explorePage(ctx));
addRoute('/sports', (ctx) => explorePage(ctx, { title: 'Sports pour enfants et ados', crumb: 'Sports', sub: 'Football, basketball, natation, arts martiaux, tennis, athlétisme…', base: '/sports', fixed: { groupkind: 'sport' }, image: 'football-duel' }));
addRoute('/extrascolaire', (ctx) => explorePage(ctx, { title: 'Activités extrascolaires', crumb: 'Extrascolaire', sub: 'Arts, musique, danse, robotique, échecs, langues, soutien scolaire et nature.', base: '/extrascolaire', fixed: { groupkind: 'educatif' }, image: 'exploration-nature' }));
addRoute('/stages', (ctx) => explorePage(ctx, { title: 'Stages & camps', crumb: 'Stages & camps', sub: 'Stages intensifs, camps, colonies, journées découverte et week-ends sportifs.', base: '/stages', fixed: { kind: 'stage,camp,decouverte' }, what: 'stage ou camp', image: 'camp-nature', defaults: { sort: 'date' } }));
addRoute('/stages/:city/:what', (ctx) => { if (ctx.params.city === 'gabon') delete ctx.params.city; return explorePage(ctx, { title: 'Stages & camps', crumb: 'Stages', base: '/stages', fixed: { kind: 'stage,camp,decouverte' }, image: 'camp-nature' }); });
addRoute('/camps', (ctx) => explorePage(ctx, { title: 'Camps de vacances', crumb: 'Camps', sub: 'Camps sportifs, nature, culturels et multisports : dates, programme, encadrement.', base: '/camps', fixed: { kind: 'camp' }, what: 'camp', image: 'randonnee-foret', defaults: { sort: 'date' } }));
const ANNONCE_TABS = [['', 'Dernières publications'], ['tab=open&open=1&sort=inscription', 'Inscriptions ouvertes'], ['tab=avenir&upcoming=1&sort=date', 'Activités à venir'], ['tab=vacances&holidays=1', 'Vacances'], ['tab=gratuit&free=1', 'Gratuites'], ['tab=proches&sort=proximite', 'Proches de moi'], ['tab=nouveau&sort=', 'Nouveautés']];
addRoute('/annonces', (ctx) => explorePage(ctx, { title: 'Annonces', crumb: 'Annonces', sub: 'Recrutements, inscriptions, stages, camps, portes ouvertes, tournois et séances d\'essai.', base: '/annonces', tabs: ANNONCE_TABS }));

// ================= FICHE ACTIVITÉ =================
let leafletP = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletP) leafletP = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => res(window.L); s.onerror = () => { leafletP = null; rej(new Error('Carte indisponible hors connexion.')); };
    document.head.appendChild(s);
  });
  return leafletP;
}
function miniMap(id, lat, lng, label) {
  onMount(async () => {
    const el = document.getElementById(id);
    if (!el || lat == null) return;
    try {
      const L = await loadLeaflet();
      const map = L.map(el, { scrollWheelZoom: false }).setView([lat, lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
      L.marker([lat, lng], { icon: L.divIcon({ className: 'gs-marker has', iconSize: [30, 30], html: '•' }) }).addTo(map).bindPopup(esc(label));
    } catch (e) { el.innerHTML = `<div class="empty" style="border:0">${esc(e.message)}</div>`; }
  });
}
const row = (k, v) => (v ? html`<div><span class="k">${k}</span><span class="prose">${v}</span></div>` : '');
addRoute('/annonce/:slug', async (ctx) => {
  const id = parseInt(ctx.params.slug, 10);
  const l = await api(`/api/listings/${id}`);
  setMeta(`${l.title} – ${l.city.name}`, String(l.description).slice(0, 155));
  const isCamp = l.kind === 'camp' || l.kind === 'stage';
  const waText = encodeURIComponent(`Bonjour, j'ai vu votre annonce « ${l.title} » sur G-Sports Gabon. Je souhaiterais avoir des informations.`);
  const wa = l.contact.whatsapp ? `https://wa.me/${l.contact.whatsapp.replace(/[^0-9]/g, '')}?text=${waText}` : null;
  miniMap('lmap', l.lat, l.lng, `${l.title} – ${l.city.name}`);
  const demo = l.is_demo;
  const regPeriod = l.reg_start || l.reg_end ? `${l.reg_start ? 'Du ' + fmtDate(l.reg_start, true) : ''}${l.reg_end ? (l.reg_start ? ' au ' : "Jusqu'au ") + fmtDate(l.reg_end, true) : ''}` : null;
  const contactBtns = demo ? html`<div class="notice demo">Exemple fictif : aucune demande ne peut être envoyée.</div>` : html`
    <button class="btn btn-primary btn-block" data-action="contact" data-type="info">${icon('mail', 18)} Contacter ${l.org.type === 'coach' ? 'le coach' : "l'organisateur"}</button>
    <button class="btn btn-navy btn-block" data-action="contact" data-type="inscription">Demander une inscription</button>
    <div class="row" style="gap:8px"><button class="btn btn-ghost" style="flex:1" data-action="contact" data-type="rdv">Prendre rendez-vous</button><button class="btn btn-ghost" style="flex:1" data-action="contact" data-type="essai">Séance découverte</button></div>
    <div class="row" style="gap:8px">${l.contact.phone ? html`<a class="btn btn-ghost" style="flex:1" href="tel:${l.contact.phone.replace(/\s/g, '')}" data-external>${icon('phone', 18)} Appeler</a>` : ''}
    ${wa ? html`<a class="btn btn-wa" style="flex:1" href="${wa}" target="_blank" rel="noopener" data-external>${icon('wa', 18)} WhatsApp</a>` : ''}</div>`;
  currentContact = { listing_id: l.id, title: l.title, org: l.org.name, contact: l.contact };
  return html`
  ${l.preview ? html`<div class="container" style="margin-top:12px"><div class="notice warn"><b>Aperçu :</b> cette annonce n'est pas visible publiquement (statut : ${l.status}).</div></div>` : ''}
  <div class="detail-hero">
    ${l.cover ? html`<img class="cover" src="${l.cover}" alt="">` : html`<div class="ph-cover" style="background:${l.group?.color || '#16B8C5'}">${l.group?.icon || '⭐'}</div>`}
    <div class="overlay"><div class="container">
      <div class="row" style="gap:6px">${badgeList(l, 5)}${l.cover_is_generic && l.cover ? html`<span class="badge soft">Photo d'illustration</span>` : ''}</div>
      <h1>${l.title}</h1>
      <div class="row" style="gap:6px 14px;font-weight:600">${l.kind_label}${l.cat_name ? ' · ' + l.cat_name : ''} <span>${icon('pin', 16)} ${l.city.name}, ${l.province.name}</span></div>
    </div></div>
  </div>
  <div class="container detail">
    <div class="stack" style="--gap:18px">
      ${demo ? html`<div class="notice demo"><b>Exemple fictif.</b> Cette annonce illustre la structure d'une offre sur G-Sports. Elle ne correspond à aucune activité réelle.</div>` : ''}
      <div class="row between"><a class="p-card" href="${l.org.url}" style="padding:10px 14px;box-shadow:none;flex:1;min-width:240px">
        ${l.org.logo ? html`<img class="avatar" src="${l.org.logo}" alt="" style="width:46px;height:46px">` : html`<div class="avatar" style="width:46px;height:46px;font-size:1rem">${initials(l.org.name)}</div>`}
        <div><b>${l.org.name}</b><div class="small muted">${l.org.type_label} · Voir le profil →</div></div></a>
        <div class="row">${favBtn(l.id)}<button class="icon-btn" data-action="share" data-url="${l.url}" data-title="${l.title}" aria-label="Partager l'annonce">${icon('share')}</button></div></div>
      <div class="facts">
        <div class="fact"><small>Âge</small><b>${fmtAge(l.age_min, l.age_max)}</b></div>
        <div class="fact"><small>Niveau</small><b>${l.levels.map((x) => LEVEL_LABELS[x]).join(', ')}</b></div>
        <div class="fact"><small>Débutants</small><b>${l.beginners ? 'Acceptés' : 'Non'}</b></div>
        <div class="fact"><small>Public</small><b>${GENDER_LABELS[l.gender]}</b></div>
        <div class="fact"><small>Tarif</small><b>${fmtPrice(l)}</b></div>
        <div class="fact"><small>Places</small><b>${l.places_status === 'complet' ? 'Complet' : l.places ? `${l.places} places${l.places_status === 'limitees' ? ' (limitées)' : ''}` : l.places_status === 'limitees' ? 'Limitées' : 'Non précisé'}</b></div>
        <div class="fact"><small>Lieu</small><b>${SETTING_LABELS[l.setting]}</b></div>
        <div class="fact"><small>Inscriptions</small><b>${l.reg_state === 'ouvertes' ? 'Ouvertes' : l.reg_state === 'bientot' ? 'Bientôt' : l.reg_state === 'closes' ? 'Closes' : l.reg_state === 'complet' ? 'Complet' : 'Voir modalités'}</b></div>
      </div>
      <div class="card pad"><h2 style="font-size:1.3rem">Description</h2><p class="prose">${l.description}</p>
        ${l.objectives.length ? html`<h3>Objectifs</h3><ul class="tick-list">${l.objectives.map((o) => html`<li>${o}</li>`)}</ul>` : ''}
        ${l.learn ? html`<h3 style="margin-top:16px">Ce que l'enfant va apprendre</h3><p class="prose">${l.learn}</p>` : ''}</div>
      <div class="card pad"><h2 style="font-size:1.3rem">Calendrier & horaires</h2>
        ${l.days.length ? html`<div class="days" style="margin-bottom:12px">${Object.entries(DAY_LABELS).map(([k, d]) => html`<span class="${l.days.includes(k) ? 'on' : ''}">${d}</span>`)}</div>` : ''}
        <div class="info-list">${row('Horaires', l.schedule)}${row('Durée des séances', l.session_duration)}${row('Date de début', l.start_date && fmtDate(l.start_date, true))}${row('Date de fin', l.end_date && fmtDate(l.end_date, true))}
        ${row('Période d\'inscription', regPeriod)}${row('Date limite', l.reg_end && fmtDate(l.reg_end, true))}${isCamp ? row('Arrivée', l.arrival_time) : ''}${isCamp ? row('Départ', l.departure_time) : ''}${row('Durée', l.duration)}</div>
        ${!l.schedule && !l.start_date && !l.days.length ? html`<p class="muted">Horaires non renseignés : contactez l'organisateur.</p>` : ''}</div>
      <div class="card pad"><h2 style="font-size:1.3rem">Tarifs</h2>
        <div class="info-list">${row('Tarif', fmtPrice(l))}${row('Précisions', l.price_amount != null || l.is_free ? l.price_text : null)}${row('Frais supplémentaires', l.extra_fees)}</div>
        ${l.formulas.length ? html`<div class="grid cards" style="margin-top:12px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${l.formulas.map((fo) => html`<div class="fact"><small>${fo.name}</small><b>${fo.price || 'Sur demande'}</b>${fo.details ? html`<div class="small muted">${fo.details}</div>` : ''}</div>`)}</div>` : ''}
        <p class="small muted" style="margin:10px 0 0">Les tarifs sont fixés librement par l'organisateur et réglés directement auprès de lui. G-Sports ne prélève aucun frais.</p></div>
      ${isCamp && (l.program || l.included || l.not_included || l.meals || l.lodging || l.transport) ? html`<div class="card pad"><h2 style="font-size:1.3rem">Programme & organisation</h2>
        <div class="info-list">${row('Programme', l.program)}${row('Inclus dans le prix', l.included)}${row('Non inclus', l.not_included)}${row('Repas', l.meals)}${row('Hébergement', l.lodging)}${row('Transport', l.transport)}</div></div>` : ''}
      ${l.equipment || l.outfit || l.conditions || l.supervision || l.safety || l.registration_info ? html`<div class="card pad"><h2 style="font-size:1.3rem">Informations pratiques</h2>
        <div class="info-list">${row('Matériel à prévoir', l.equipment)}${row('Tenue recommandée', l.outfit)}${row('Conditions de participation', l.conditions)}${row('Encadrement', l.supervision)}${row('Sécurité', l.safety)}${row("Modalités d'inscription", l.registration_info)}</div></div>` : ''}
      ${l.photos.length > 1 ? html`<div class="card pad"><h2 style="font-size:1.3rem">Photos</h2><div class="gallery">${l.photos.map((p) => html`<img src="${p}" alt="" loading="lazy" data-action="zoom" data-src="${p}">`)}</div></div>` : ''}
      <div class="card pad"><h2 style="font-size:1.3rem">Localisation</h2><p>${l.address || ''}${l.district ? (l.address ? ', ' : '') + l.district : ''} ${l.city.name}, ${l.province.name}</p>
        ${l.lat != null ? html`<div class="map-box" id="lmap"></div>${l.approx_location ? html`<p class="small muted" style="margin-top:6px">Position approximative (centre de la ville). Confirmez l'adresse exacte avec l'organisateur.</p>` : ''}` : ''}</div>
      <div class="declared">${icon('shield', 16)} Informations déclarées par l'organisateur sous sa responsabilité. La publication sur G-Sports ne constitue pas une certification de sécurité ou de compétence. Vérifiez les conditions d'encadrement avant l'inscription. <a href="#" data-action="report" data-type="listing" data-id="${l.id}">Signaler cette annonce</a></div>
      ${l.similar.length ? html`<div><h2 style="font-size:1.3rem;margin-top:10px">Activités similaires</h2><div class="grid cards">${l.similar.map(listingCard)}</div></div>` : ''}
    </div>
    <aside><div class="contact-card">
      <div><small class="muted" style="font-weight:700">Tarif</small><div class="price-big">${fmtPrice(l)}</div></div>
      ${l.reg_end && l.reg_state === 'ouvertes' ? html`<div class="notice ok small">Inscriptions ouvertes jusqu'au <b>${fmtDate(l.reg_end, true)}</b></div>` : ''}
      ${contactBtns}
      <p class="small muted" style="margin:0">Mise en relation gratuite. Les échanges se font uniquement avec le parent ou le responsable légal.</p>
      <p class="small muted" style="margin:0">Vue ${l.views} fois · Publiée le ${fmtDate(l.published_at || '')}</p>
    </div></aside>
  </div>
  ${demo ? '' : html`<div class="sticky-cta"><button class="btn btn-primary" data-action="contact" data-type="info">Contacter</button>${wa ? html`<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener" data-external>${icon('wa', 18)} WhatsApp</a>` : html`<button class="btn btn-navy" data-action="contact" data-type="inscription">S'inscrire</button>`}</div>`}`;
});
let currentContact = null;
action('zoom', (el) => openModal(html`<img src="${el.dataset.src}" alt="" style="border-radius:14px;width:100%">`, { label: 'Photo' }));
action('share', async (el) => {
  const url = location.origin + el.dataset.url;
  if (navigator.share) { try { await navigator.share({ title: el.dataset.title, text: `${el.dataset.title} – sur G-Sports Gabon`, url }); return; } catch { return; } }
  openModal(html`<h3>Partager</h3><input class="input" readonly value="${url}" aria-label="Lien"><div class="row" style="margin-top:12px">
    <a class="btn btn-wa" href="https://wa.me/?text=${encodeURIComponent(el.dataset.title + ' ' + url)}" target="_blank" rel="noopener" data-external>${icon('wa', 18)} WhatsApp</a>
    <a class="btn btn-ghost" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener" data-external>Facebook</a>
    <button class="btn btn-ghost" data-action="copy" data-text="${url}">Copier le lien</button></div>`);
});

// ---------- Formulaire de contact (parent -> professionnel) ----------
const REQ_TITLES = { info: "Demander des informations", inscription: "Demande d'inscription", rdv: 'Demander un rendez-vous', essai: 'Demander une séance découverte' };
action('contact', async (el) => {
  const type = el.dataset.type || 'info';
  const c = el.dataset.profile ? { profile_id: Number(el.dataset.profile), title: el.dataset.title, org: el.dataset.org } : currentContact;
  if (!c) return;
  if (state.me && state.me.role !== 'parent') return openModal(html`<h3>Réservé aux parents</h3><p>Les demandes de contact sont réservées aux comptes parents ou aux visiteurs (responsables légaux). Vous êtes connecté avec un compte ${state.me.role === 'pro' ? 'professionnel' : 'administrateur'}.</p>`);
  let children = [];
  if (state.me) { try { children = (await api('/api/me/children')).items; } catch { /* ignore */ } }
  const me = state.me || {};
  const cityName = me.city_id ? state.meta.cities.find((x) => x.id === me.city_id)?.name : '';
  openModal(html`<h2 style="font-size:1.35rem">${REQ_TITLES[type]}</h2><p class="muted small">${c.title ? `${c.title} · ` : ''}${c.org}</p>
    <form class="form" data-form="contact-request" novalidate>
      <input type="hidden" name="type" value="${type}"><input type="hidden" name="listing_id" value="${c.listing_id || ''}"><input type="hidden" name="profile_id" value="${c.profile_id || ''}">
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="cols"><label class="lbl"><span class="req">Nom du parent ou responsable</span><input class="input" name="parent_name" required maxlength="100" value="${me.name || ''}" autocomplete="name"></label>
      <label class="lbl"><span class="req">Email</span><input class="input" type="email" name="email" required maxlength="200" value="${me.email || ''}" autocomplete="email"></label></div>
      <div class="cols"><label class="lbl">Téléphone<input class="input" type="tel" name="phone" maxlength="30" value="${me.phone || ''}" autocomplete="tel"></label>
      <label class="lbl">Ville<input class="input" name="city" maxlength="80" value="${cityName || ''}" list="dl-cities"></label></div>
      <datalist id="dl-cities">${state.meta.cities.map((x) => html`<option value="${x.name}">`)}</datalist>
      <div class="cols"><label class="lbl">Activité recherchée<input class="input" name="activity" maxlength="120" value="${c.title || ''}"></label>
      <label class="lbl">Âge de l'enfant <span class="hint">(âge uniquement, pas de date de naissance)</span>
        ${children.length ? html`<select class="input" name="child_age"><option value="">—</option>${children.map((ch) => html`<option value="${ch.age}">${ch.nickname} (${ch.age} ans)</option>`)}</select>`
          : html`<input class="input" type="number" name="child_age" min="3" max="25" inputmode="numeric">`}</label></div>
      ${type === 'rdv' || type === 'essai' ? html`<label class="lbl">Disponibilités souhaitées<input class="input" name="preferred_date" maxlength="100" placeholder="Ex. : samedi matin, à partir du 15"></label>` : ''}
      <label class="lbl"><span class="req">Message</span><textarea class="input" name="message" required minlength="10" maxlength="2000">${type === 'inscription' ? "Bonjour, je souhaiterais inscrire mon enfant. Pouvez-vous m'indiquer les modalités ?" : type === 'essai' ? "Bonjour, mon enfant aimerait essayer l'activité lors d'une séance découverte." : type === 'rdv' ? 'Bonjour, je souhaiterais convenir d\'un rendez-vous.' : 'Bonjour, je souhaiterais avoir plus d\'informations.'}</textarea></label>
      <label class="check"><input type="checkbox" name="is_guardian" required> Je suis le parent ou le responsable légal de l'enfant.</label>
      <label class="check"><input type="checkbox" name="consent" required> J'accepte que mes coordonnées soient transmises à ce professionnel pour qu'il me réponde.</label>
      <p class="small muted" style="margin:0">Ne communiquez pas d'informations sensibles sur l'enfant. <a href="/confidentialite" target="_blank">Confidentialité</a></p>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-lg" type="submit">Envoyer la demande</button>
    </form>`, { label: REQ_TITLES[type] });
});
form('contact-request', async (f, d) => {
  if (!d.is_guardian || !d.consent) throw new Error('Merci de cocher les deux cases de confirmation.');
  const r = await api('/api/contact-requests', { method: 'POST', body: { ...d, listing_id: d.listing_id || undefined, profile_id: d.profile_id || undefined } });
  const wa = r.contact.whatsapp ? `https://wa.me/${r.contact.whatsapp.replace(/[^0-9]/g, '')}` : null;
  f.closest('.box').innerHTML = String(html`<button class="icon-btn close" data-action="close-modal" aria-label="Fermer">${icon('close')}</button>
    <div class="center"><div style="font-size:3rem">✅</div><h2>Demande envoyée</h2><p class="muted">Le professionnel a reçu votre demande et vous répondra directement. ${state.me ? 'Vous pouvez la suivre dans votre espace parent.' : ''}</p></div>
    ${r.contact.phone || wa || r.contact.email ? html`<div class="card pad" style="background:var(--bg)"><b>Coordonnées du professionnel</b>
      <div class="row" style="margin-top:10px">${r.contact.phone ? html`<a class="btn btn-ghost" href="tel:${r.contact.phone.replace(/\s/g, '')}" data-external>${icon('phone', 18)} ${r.contact.phone}</a>` : ''}
      ${wa ? html`<a class="btn btn-wa" href="${wa}" target="_blank" rel="noopener" data-external>${icon('wa', 18)} WhatsApp</a>` : ''}
      ${r.contact.email ? html`<a class="btn btn-ghost" href="mailto:${r.contact.email}" data-external>${icon('mail', 18)} Email</a>` : ''}</div></div>` : ''}
    <div class="row" style="justify-content:center;margin-top:14px">${state.me ? html`<a class="btn btn-navy" href="/espace-parent?tab=demandes">Mes demandes</a>` : html`<a class="btn btn-navy" href="/inscription">Créer un compte pour suivre mes demandes</a>`}<button class="btn btn-ghost" data-action="close-modal">Fermer</button></div>`);
});

// ---------- Signalement ----------
action('report', (el) => {
  openModal(html`<h2 style="font-size:1.35rem">${icon('flag')} Signaler ${el.dataset.type === 'profile' ? 'ce profil' : 'cette annonce'}</h2>
    <form class="form" data-form="report"><input type="hidden" name="target_type" value="${el.dataset.type}"><input type="hidden" name="target_id" value="${el.dataset.id}">
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="lbl"><span class="req">Motif</span><select class="input" name="reason" required><option value="">Choisir…</option>${state.meta.reportReasons.map((r) => html`<option>${r}</option>`)}</select></label>
      <label class="lbl">Précisions<textarea class="input" name="details" maxlength="2000" placeholder="Décrivez le problème"></textarea></label>
      <label class="lbl">Votre email (facultatif)<input class="input" type="email" name="email" value="${state.me?.email || ''}"></label>
      <p class="small muted" style="margin:0">En cas de danger immédiat pour un enfant, contactez sans attendre les services de police ou de secours.</p>
      <p class="form-error" role="alert"></p><button class="btn btn-danger" type="submit">Envoyer le signalement</button></form>`, { label: 'Signalement' });
});
form('report', async (f, d) => {
  await api('/api/reports', { method: 'POST', body: d });
  closeModal(); toast('Merci : votre signalement a été transmis à la modération.', 'ok');
});

// ================= CLUBS & COACHS =================
async function profilesList(ctx, coach) {
  const q = { ...ctx.query };
  if (ctx.params.city) q.city = ctx.params.city;
  if (ctx.params.what) q.discipline = (catBySlug(ctx.params.what)?.name || ctx.params.what.replace(/-/g, ' '));
  const data = await api('/api/profiles?' + new URLSearchParams({ ...q, coach: coach ? '1' : '0' }));
  const city = q.city ? cityBySlug(q.city) : null;
  const t = coach ? 'Coachs sportifs indépendants' : 'Clubs, salles & structures';
  setMeta(t + (city ? ` à ${city.name}` : ''), coach ? 'Coachs et éducateurs : cours individuels ou en groupe.' : 'Clubs, gymnases, salles, associations et centres de loisirs.');
  return html`<div class="page-head has-img"><div class="bg" style="background-image:url('${photo(coach ? 'natation-dos' : 'basket-dribble', true)}')"></div><div class="container">
    <div class="crumbs"><a href="/">Accueil</a> › ${coach ? 'Coachs' : 'Clubs & salles'}</div><h1>${t}${city ? ` à ${city.name}` : ''}</h1>
    <p>${coach ? 'Séances découverte, individuelles, en groupe, à domicile ou en extérieur. Tarifs fixés librement par chaque coach.' : 'Clubs sportifs, gymnases, salles de sport, associations, centres de loisirs et structures extrascolaires.'}</p></div></div>
  <div class="container" style="padding:20px 16px 40px">
    <form class="card pad form" data-form="profiles-filter" style="margin-bottom:18px"><div class="cols three" style="display:grid;gap:10px">
      <input class="input" name="q" value="${q.q || q.discipline || ''}" placeholder="${coach ? 'Spécialité, nom…' : 'Discipline, nom du club…'}" aria-label="Recherche">
      ${citySelect('city', q.city)}
      ${coach ? html`<select class="input" name="home" aria-label="Lieu des cours"><option value="">Tous lieux de cours</option><option value="1" ${q.home === '1' ? 'selected' : ''}>Cours à domicile</option></select>`
        : html`<select class="input" name="type" aria-label="Type de structure"><option value="">Tous types</option>${Object.entries(state.meta.profileTypes).filter(([k]) => !['coach', 'educateur'].includes(k)).map(([k, l]) => html`<option value="${k}" ${q.type === k ? 'selected' : ''}>${l}</option>`)}</select>`}
    </div><input type="hidden" name="coach" value="${coach ? '1' : ''}"><div class="row"><button class="btn btn-navy" type="submit">${icon('search', 18)} Rechercher</button><span class="muted">${data.total} résultat${data.total > 1 ? 's' : ''}</span></div></form>
    ${data.items.length ? html`<div class="grid cards">${data.items.map(profileCard)}</div>` : emptyCity(city?.name, { what: coach ? 'coach' : 'structure' })}
  </div>`;
}
form('profiles-filter', (f, d) => {
  const coach = d.coach === '1'; delete d.coach;
  const qs = new URLSearchParams(Object.entries(d).filter(([, v]) => v)).toString();
  navigate((coach ? '/coachs' : '/clubs') + (qs ? '?' + qs : ''));
});
addRoute('/clubs', (ctx) => profilesList(ctx, false));
addRoute('/clubs/:city/:what', (ctx) => profilesList(ctx, false));
addRoute('/coachs', (ctx) => profilesList(ctx, true));

async function profilePage(ctx) {
  const p = await api(`/api/profiles/${encodeURIComponent(ctx.params.slug)}`);
  setMeta(`${p.name} – ${p.type_label}`, (p.description || '').slice(0, 155));
  miniMap('pmap', p.lat, p.lng, p.name);
  const wa = p.whatsapp ? `https://wa.me/${p.whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Bonjour, j'ai trouvé votre profil « ${p.name} » sur G-Sports Gabon.`)}` : null;
  const yes = (b, l) => (b ? html`<span class="badge soft">✓ ${l}</span>` : '');
  return html`
  ${p.verification !== 'approved' ? html`<div class="container" style="margin-top:12px"><div class="notice warn"><b>Aperçu :</b> ce profil est en attente de validation et n'est pas encore public.</div></div>` : ''}
  <div class="detail-hero">${p.cover ? html`<img class="cover" src="${p.cover}" alt="">` : html`<div class="ph-cover" style="background:linear-gradient(135deg,var(--navy),var(--turq))">${p.is_coach ? '🏅' : '🏟️'}</div>`}
    <div class="overlay"><div class="container row" style="align-items:flex-end;gap:16px">
      ${p.logo ? html`<img class="avatar ${p.is_coach ? 'round' : ''}" src="${p.logo}" alt="" style="width:84px;height:84px;border:3px solid #fff">` : html`<div class="avatar ${p.is_coach ? 'round' : ''}" style="width:84px;height:84px;border:3px solid #fff">${initials(p.name)}</div>`}
      <div>${p.is_demo ? html`<span class="badge demo">Exemple fictif</span>` : ''}<h1 style="margin:6px 0 2px">${p.name}</h1><div style="font-weight:600">${p.type_label}${p.city ? ` · ${p.city.name}, ${p.province.name}` : ''}</div></div></div></div></div>
  <div class="container detail"><div class="stack">
    ${p.is_demo ? html`<div class="notice demo">Ce profil est un <b>exemple fictif</b> destiné à illustrer la présentation d'une structure.</div>` : ''}
    <div class="row" style="gap:6px">${p.verification === 'approved' && !p.is_demo ? html`<span class="badge ok" title="Le compte a été examiné par la modération G-Sports. Ce n'est pas une certification de sécurité ou de compétence.">Compte validé par la modération</span>` : ''}
      ${p.age_min ? html`<span class="badge soft">${fmtAge(p.age_min, p.age_max || 99)}</span>` : ''}${p.levels.map((x) => html`<span class="badge soft">${LEVEL_LABELS[x]}</span>`)}
      ${yes(p.home_lessons, 'Cours à domicile')}${yes(p.travel, 'Se déplace')}${yes(p.indoor, 'En salle')}${yes(p.outdoor, 'En extérieur')}${yes(p.individual, 'Individuel')}${yes(p.group_lessons, 'En groupe')}</div>
    ${p.description ? html`<div class="card pad"><h2 style="font-size:1.3rem">${p.is_coach ? 'Biographie' : 'Présentation'}</h2><p class="prose">${p.description}</p></div>` : ''}
    <div class="card pad"><h2 style="font-size:1.3rem">Informations</h2><div class="info-list">
      ${row(p.is_coach ? 'Spécialité' : 'Activité principale', p.specialty || p.main_activity)}${row('Disciplines', p.disciplines)}${row('Responsable', p.manager_name)}
      ${row('Horaires', p.hours)}${row('Disponibilités', p.availability)}${row('Durée des séances', p.session_duration)}${row("Zone d'intervention", p.zone)}
      ${row('Diplômes et qualifications (déclarés)', p.qualifications)}${row('Expérience', p.experience)}${row('Équipements', p.equipment)}
      ${row('Tarifs', p.prices_info)}${row("Conditions d'inscription", p.registration_info)}</div>
      ${p.facilities.length ? html`<h3 style="margin-top:14px">Installations</h3><ul class="tick-list">${p.facilities.map((x) => html`<li>${x}</li>`)}</ul>` : ''}</div>
    ${p.formulas.length ? html`<div class="card pad"><h2 style="font-size:1.3rem">Formules</h2><div class="grid cards" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">${p.formulas.map((fo) => html`<div class="fact"><small>${fo.name}</small><b>${fo.price || 'Sur demande'}</b>${fo.details ? html`<div class="small muted">${fo.details}</div>` : ''}</div>`)}</div>
      <p class="small muted" style="margin:10px 0 0">Prix fixés librement par le professionnel. G-Sports ne prélève aucun frais.</p></div>` : ''}
    ${p.photos.length ? html`<div class="card pad"><h2 style="font-size:1.3rem">Photos</h2><div class="gallery">${p.photos.map((x) => html`<img src="${x}" alt="" loading="lazy" data-action="zoom" data-src="${x}">`)}</div></div>` : ''}
    ${p.media_links.length ? html`<div class="card pad"><h2 style="font-size:1.3rem">Vidéos de démonstration</h2><ul>${p.media_links.map((u) => html`<li><a href="${u}" target="_blank" rel="noopener nofollow" data-external>${u}</a></li>`)}</ul></div>` : ''}
    <div><h2 style="font-size:1.3rem">Annonces en cours (${p.listings.length})</h2>${p.listings.length ? html`<div class="grid cards">${p.listings.map(listingCard)}</div>` : html`<div class="empty" style="padding:20px"><p style="margin:0">Aucune annonce active pour le moment.</p></div>`}</div>
    ${p.lat != null ? html`<div class="card pad"><h2 style="font-size:1.3rem">Localisation</h2><p>${p.address || ''} ${p.district || ''} ${p.city?.name || ''}</p><div class="map-box" id="pmap"></div>${p.approx_location ? html`<p class="small muted" style="margin-top:6px">Position approximative (centre de la ville).</p>` : ''}</div>` : ''}
    <div class="declared">${icon('shield', 16)} Informations (dont diplômes et qualifications) déclarées par le professionnel sous sa responsabilité. <a href="#" data-action="report" data-type="profile" data-id="${p.id}">Signaler ce profil</a></div>
  </div>
  <aside><div class="contact-card"><h3 style="margin:0">Contacter ${p.is_coach ? 'le coach' : 'la structure'}</h3>
    ${p.is_demo ? html`<div class="notice demo">Exemple fictif : contact désactivé.</div>` : html`
    <button class="btn btn-primary btn-block" data-action="contact" data-type="info" data-profile="${p.id}" data-org="${p.name}" data-title="">${icon('mail', 18)} Envoyer un message</button>
    <button class="btn btn-navy btn-block" data-action="contact" data-type="${p.is_coach ? 'rdv' : 'inscription'}" data-profile="${p.id}" data-org="${p.name}" data-title="">${p.is_coach ? 'Prendre rendez-vous' : 'Demander une inscription'}</button>
    <button class="btn btn-ghost btn-block" data-action="contact" data-type="essai" data-profile="${p.id}" data-org="${p.name}" data-title="">Séance découverte</button>
    <div class="row" style="gap:8px">${p.phone ? html`<a class="btn btn-ghost" style="flex:1" href="tel:${p.phone.replace(/\s/g, '')}" data-external>${icon('phone', 18)} Appeler</a>` : ''}${wa ? html`<a class="btn btn-wa" style="flex:1" href="${wa}" target="_blank" rel="noopener" data-external>${icon('wa', 18)} WhatsApp</a>` : ''}</div>
    ${p.website ? html`<a href="${p.website}" target="_blank" rel="noopener nofollow" data-external>Site web</a>` : ''}
    ${Object.keys(p.socials).length ? html`<div class="row small">${Object.entries(p.socials).map(([k, u]) => html`<a href="${u}" target="_blank" rel="noopener nofollow" data-external>${k}</a>`)}</div>` : ''}`}
    <button class="btn btn-ghost btn-sm" data-action="share" data-url="${p.url}" data-title="${p.name}">${icon('share', 16)} Partager</button>
  </div></aside></div>`;
}
addRoute('/clubs/:slug', profilePage);
addRoute('/coachs/:slug', profilePage);

// ================= CALENDRIER =================
addRoute('/calendrier', async (ctx) => {
  const month = /^\d{4}-\d{2}$/.test(ctx.query.mois || '') ? ctx.query.mois : todayStr().slice(0, 7);
  const data = await api('/api/calendar?month=' + month);
  const holidays = state.meta.home?.holidays || [];
  setMeta('Calendrier des inscriptions, stages et camps');
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const sel = ctx.query.jour || '';
  const byDay = {};
  for (const e of data.events) (byDay[e.date] ||= []).push(e);
  const inHoliday = (d) => holidays.find((h) => d >= h.start && d <= h.end);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(html`<div class="d out"></div>`);
  for (let d = 1; d <= days; d++) {
    const ds = `${month}-${String(d).padStart(2, '0')}`;
    const ev = byDay[ds] || [];
    const hol = inHoliday(ds);
    cells.push(html`<button class="d ${ds === todayStr() ? 'today' : ''} ${ds === sel ? 'sel' : ''}" data-action="cal-day" data-d="${ds}" style="${hol && ds !== sel ? 'background:var(--sun-soft)' : ''}" aria-label="${d} ${MONTHS_LONG[m - 1]} : ${ev.length} événement(s)">
      <b>${d}</b><span class="dots">${ev.slice(0, 6).map((e) => html`<i class="${e.type}"></i>`)}</span>${ev.length > 6 ? html`<small>+${ev.length - 6}</small>` : ''}</button>`);
  }
  const list = sel ? byDay[sel] || [] : data.events;
  const upcomingHol = holidays.filter((h) => h.end >= todayStr()).slice(0, 4);
  return html`<div class="page-head"><div class="container"><div class="crumbs"><a href="/">Accueil</a> › Calendrier</div><h1>Calendrier</h1><p>Ouvertures et dates limites d'inscription, débuts de stages et de camps.</p></div></div>
  <div class="container" style="padding:20px 16px 40px"><div class="grid" style="gap:20px">
    ${upcomingHol.length ? html`<div class="card pad"><h3>Prochaines vacances scolaires</h3><div class="row">${upcomingHol.map((h) => html`<a class="chip" href="/activites?holidays=1&from=${h.start}&to=${h.end}">🏖️ ${h.name} : ${fmtDate(h.start)} → ${fmtDate(h.end)}</a>`)}</div></div>` : ''}
    <div class="card pad">
      <div class="row between" style="margin-bottom:12px"><a class="btn btn-ghost btn-sm" href="/calendrier?mois=${prev}">←</a><h2 style="margin:0;text-transform:capitalize">${MONTHS_LONG[m - 1]} ${y}</h2><a class="btn btn-ghost btn-sm" href="/calendrier?mois=${next}">→</a></div>
      <div class="cal-grid">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => html`<div class="dow">${d}</div>`)}${cells}</div>
      <div class="legend" style="margin-top:12px"><span><i style="background:var(--ok)"></i>Ouverture inscriptions</span><span><i style="background:var(--danger)"></i>Date limite</span><span><i style="background:var(--sun)"></i>Début / en cours</span>${holidays.length ? html`<span><i style="background:var(--sun-soft);border:1px solid var(--sun)"></i>Vacances scolaires</span>` : ''}</div>
    </div>
    <div><div class="row between"><h2 style="font-size:1.3rem;margin:0">${sel ? `Le ${fmtDate(sel, true)}` : 'Tout le mois'}</h2>${sel ? html`<a class="btn btn-ghost btn-sm" href="/calendrier?mois=${month}">Voir tout le mois</a>` : ''}</div>
      <div class="grid" style="gap:8px;margin-top:12px">${list.length ? list.map((e) => html`<a class="event-row" href="${e.listing.url}"><div class="date">${e.date.slice(8)}<small>${MONTHS_LONG[Number(e.date.slice(5, 7)) - 1].slice(0, 4)}</small></div>
        <div style="flex:1;min-width:0"><span class="badge ${e.type === 'reg_end' ? 'complet' : e.type === 'reg_start' ? 'ouvertes' : 'bientot'}">${e.label}</span> ${e.listing.is_demo ? html`<span class="badge demo">Exemple</span>` : ''}
        <div style="font-weight:700;margin-top:4px">${e.listing.title}</div><div class="small muted">${e.listing.org.name} · ${e.listing.city.name} · ${fmtAge(e.listing.age_min, e.listing.age_max)}</div></div></a>`)
        : html`<div class="empty" style="padding:22px"><p style="margin:0">Aucune date enregistrée ${sel ? 'ce jour-là' : 'ce mois-ci'}.</p></div>`}</div></div>
  </div></div>`;
});
action('cal-day', (el) => { const sp = new URLSearchParams(location.search); sp.set('jour', el.dataset.d); sp.set('mois', el.dataset.d.slice(0, 7)); navigate('/calendrier?' + sp, { replace: true }); });

// ================= CARTE DU GABON =================
addRoute('/carte', async () => {
  const data = await api('/api/map');
  setMeta('Carte des activités au Gabon');
  onMount(async () => {
    const el = $('#gmap');
    try {
      const L = await loadLeaflet();
      const map = L.map(el, { scrollWheelZoom: true }).setView([-0.75, 11.6], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 16, attribution: '© OpenStreetMap' }).addTo(map);
      mapRef = { map, L, cities: data.cities };
      for (const c of data.cities.filter((x) => x.lat != null)) {
        const n = c.total;
        const mk = L.marker([c.lat, c.lng], { title: c.name, icon: L.divIcon({ className: `gs-marker ${n ? 'has' : ''}`, iconSize: n ? [34, 34] : [22, 22], html: n ? String(n) : '' }) }).addTo(map);
        mk.bindPopup(`<b>${esc(c.name)}</b><br><small>${esc(c.province_name)}</small><br>${n ? c.groups.map((g) => `${esc(g.name)} : ${g.n}`).join('<br>') : 'Aucune activité référencée pour le moment.'}<br><a href="/activites/${esc(c.slug)}">${n ? 'Voir les activités →' : 'Voir la page de la ville →'}</a>`);
      }
    } catch (e) { el.innerHTML = `<div class="empty" style="border:0;height:100%;display:grid;place-items:center">${esc(e.message)}</div>`; }
  });
  const provs = state.meta.provinces.map((p) => ({ ...p, cities: data.cities.filter((c) => c.province === p.slug) }));
  return html`<div class="page-head"><div class="container"><div class="crumbs"><a href="/">Accueil</a> › Carte</div><h1>Carte du Gabon</h1><p>Cliquez sur une province ou une ville pour afficher les activités. Les chiffres proviennent uniquement des annonces réellement publiées.</p></div></div>
  <div class="container map-layout"><div class="map-full" id="gmap" role="region" aria-label="Carte interactive du Gabon"></div>
    <div class="prov-list">${provs.map((p) => html`<details><summary><span>${p.name}</span><span class="count-pill ${p.cities.reduce((s, c) => s + c.total, 0) ? '' : 'zero'}">${p.cities.reduce((s, c) => s + c.total, 0)}</span></summary>
      <button class="btn btn-ghost btn-sm" data-action="map-prov" data-p="${p.slug}" style="margin-bottom:6px">Centrer la carte</button> <a class="btn btn-ghost btn-sm" href="/activites?province=${p.slug}">Activités de la province</a>
      ${p.cities.map((c) => html`<div class="c"><a href="/activites/${c.slug}">${c.name}</a><span class="count-pill ${c.total ? '' : 'zero'}">${c.total}</span></div>`)}</details>`)}</div></div>`;
});
let mapRef = null;
action('map-prov', (el) => {
  if (!mapRef) return;
  const pts = mapRef.cities.filter((c) => c.province === el.dataset.p && c.lat != null).map((c) => [c.lat, c.lng]);
  if (pts.length) mapRef.map.fitBounds(pts, { padding: [40, 40], maxZoom: 9 });
  $('#gmap').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ================= FAVORIS =================
addRoute('/favoris', async () => {
  setMeta('Mes favoris');
  let items = [];
  if (state.me) items = (await api('/api/me/favorites')).items;
  else if (state.favs.size) items = (await api('/api/listings?' + new URLSearchParams({ ids: [...state.favs].join(','), limit: 100 }))).items;
  return html`<div class="page-head"><div class="container"><h1>Mes favoris</h1><p>${state.me ? 'Retrouvez les annonces enregistrées sur tous vos appareils.' : 'Vos favoris sont enregistrés sur cet appareil. Créez un compte pour les retrouver partout et recevoir des alertes.'}</p></div></div>
  <div class="container" style="padding:20px 16px 40px">${items.length ? html`<div class="grid cards">${items.map(listingCard)}</div>`
    : html`<div class="empty"><div class="ico">❤️</div><h3>Aucun favori pour le moment</h3><p>Touchez le cœur sur une annonce pour l'enregistrer. Les annonces expirées disparaissent automatiquement.</p><a class="btn btn-primary" href="/activites">Explorer les activités</a></div>`}
  ${!state.me ? html`<p class="center" style="margin-top:18px"><a href="/inscription">Créer un compte parent gratuit</a></p>` : ''}</div>`;
});

// ================= PUBLIER =================
addRoute('/publier', () => {
  if (state.me?.role === 'pro') { navigate('/espace-pro/annonce/nouvelle', { replace: true }); return; }
  setMeta('Publier une annonce gratuitement');
  return html`<div class="page-head has-img"><div class="bg" style="background-image:url('${photo('basket-ciel', true)}')"></div><div class="container"><h1>Publier une annonce, c'est gratuit</h1>
    <p>Activités régulières, inscriptions de saison, stages, camps, portes ouvertes, tournois, séances d'essai : publiez en quelques minutes depuis votre téléphone.</p></div></div>
  <div class="container" style="padding:24px 16px 40px"><div class="grid two">
    <div class="card pad"><h2 style="font-size:1.3rem">Vous êtes un professionnel ?</h2><p>Club, association, gymnase, salle de sport, coach, éducateur, centre de loisirs ou organisateur de camps.</p>
      <ul><li>Aucun abonnement, aucune commission, aucune mise en avant payante</li><li>Annonces illimitées (dans la limite de 100 actives)</li><li>Demandes des parents reçues directement</li></ul>
      <div class="row">${state.me?.role === 'parent' ? html`<p class="notice warn">Vous êtes connecté avec un compte parent. Pour publier, créez un compte professionnel distinct (autre email).</p>` : ''}
      <a class="btn btn-primary" href="/inscription-pro">Créer mon compte professionnel</a>${!state.me ? html`<a class="btn btn-ghost" href="/connexion?retour=/publier">J'ai déjà un compte</a>` : ''}</div></div>
    <div class="card pad"><h2 style="font-size:1.3rem">Comment ça se passe ?</h2><ol><li>Créez votre compte et votre profil (2 minutes).</li><li>La modération vérifie votre compte.</li><li>Publiez vos annonces, éventuellement à partir d'un <a href="/modeles">modèle</a>.</li><li>Les annonces expirent automatiquement à leur date de fin : renouvelez-les en un clic.</li></ol></div>
  </div></div>`;
});
addRoute('/modeles', async () => {
  const t = await api('/api/templates');
  setMeta("Modèles d'annonces");
  return html`<div class="page-head"><div class="container"><h1>Modèles d'annonces</h1><p>Des structures prêtes à l'emploi. Ce sont des modèles : les horaires, tarifs, dates et contacts sont à compléter par chaque professionnel.</p></div></div>
  <div class="container" style="padding:20px 16px 40px"><div class="grid cards">${t.items.map((m) => html`<div class="card pad"><span class="kind-tag">${state.meta.kinds[m.kind] || 'Activité'}</span><h3 style="margin-top:4px">${m.title}</h3>
    <p class="small muted">${m.city_hint ? `Exemple : ${m.city_hint} · ` : ''}${fmtAge(m.age_min, m.age_max)}${m.duration ? ' · ' + m.duration : ''}</p><p class="small">${m.description}</p>
    <ul class="tick-list" style="grid-template-columns:1fr 1fr">${m.objectives.slice(0, 6).map((o) => html`<li>${o}</li>`)}</ul>
    <p class="small muted">Horaires, tarif, inscriptions et contact : à renseigner.</p>
    <a class="btn btn-navy btn-sm" href="/espace-pro/annonce/nouvelle?modele=${m.slug}">Utiliser ce modèle</a></div>`)}</div></div>`;
});

// ================= PAGES D'INFORMATION =================
const page = (title, body, sub) => html`<div class="page-head"><div class="container"><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div></div><div class="content">${body}</div>`;
addRoute('/a-propos', () => { setMeta('À propos'); return page('À propos de G-Sports Gabon', html`
  <p><b>G-Sports</b> est une plateforme nationale, entièrement gratuite, qui répertorie les activités sportives, artistiques, éducatives, de loisirs et extrascolaires accessibles aux enfants et aux jeunes à partir de 5 ans, partout au Gabon.</p>
  <h2>Notre mission</h2><p>Permettre à chaque parent de trouver facilement une activité adaptée à son enfant — selon sa ville, son âge, ses envies, son budget et ses disponibilités — et aider les clubs, coachs et associations à gagner en visibilité.</p>
  <h2>Totalement gratuit</h2><ul><li>Gratuit pour les parents, les enfants et les jeunes</li><li>Gratuit pour les clubs, coachs et structures</li><li>Gratuit pour publier, consulter et contacter</li><li>Aucun abonnement, aucun paiement intégré, aucune commission, aucune mise en avant payante</li></ul>
  <h2>Tout le Gabon</h2><p>Les 9 provinces — Estuaire, Haut-Ogooué, Moyen-Ogooué, Ngounié, Nyanga, Ogooué-Ivindo, Ogooué-Lolo, Ogooué-Maritime et Woleu-Ntem — sont couvertes par la recherche. Lorsqu'aucune activité n'est encore référencée dans une ville, nous l'affichons honnêtement : aucune fausse annonce n'est créée.</p>
  <p><a class="btn btn-primary" href="/activites">Trouver une activité</a></p>`, 'À chaque jeune son activité. À chaque talent son terrain.'); });
addRoute('/comment-ca-marche', () => { setMeta('Comment ça marche'); return page('Comment fonctionne G-Sports ?', html`
  <h2>Pour les parents</h2><ol><li>Ouvrez G-Sports (pas besoin de compte pour consulter).</li><li>Choisissez votre ville.</li><li>Indiquez l'âge de votre enfant : seules les activités adaptées s'affichent.</li><li>Sélectionnez une activité ou explorez les catégories.</li><li>Comparez les annonces : horaires, tarifs, encadrement, dates d'inscription.</li><li>Contactez directement le club ou le coach : appel, WhatsApp ou message.</li><li>Organisez le rendez-vous ou l'inscription directement avec lui.</li></ol>
  <p>Avec un compte parent (gratuit), vous pouvez aussi enregistrer vos favoris, créer des profils enfants (prénom et âge uniquement), recevoir des alertes et suivre vos demandes.</p>
  <h2>Pour les professionnels</h2><ol><li>Créez gratuitement votre compte (club, association, gymnase, salle, coach, organisateur…).</li><li>Complétez votre profil : disciplines, âges, horaires, installations, tarifs.</li><li>Après validation par la modération, publiez vos annonces : activités, stages, camps, portes ouvertes…</li><li>Recevez et gérez les demandes des parents depuis votre tableau de bord.</li></ol>
  <h2>Mise en relation, pas de paiement</h2><p>G-Sports ne gère aucun paiement : les tarifs sont fixés librement par les professionnels et réglés directement auprès d'eux.</p>`); });
addRoute('/securite', () => { setMeta('Sécurité des jeunes'); return page('Sécurité et protection des mineurs', html`
  <p>La sécurité des enfants est notre priorité absolue. G-Sports a été conçu pour limiter au strict nécessaire les informations les concernant.</p>
  <ul><li><b>Aucun profil public d'enfant.</b> Les profils enfants (prénom ou surnom et âge) restent privés dans l'espace parent.</li>
  <li><b>Aucune messagerie privée entre un adulte professionnel et un enfant.</b> Les demandes sont réservées aux parents et responsables légaux.</li>
  <li><b>Pas de date de naissance complète :</b> seul l'âge est demandé.</li>
  <li><b>Photos :</b> les professionnels s'engagent à ne publier des photos d'enfants qu'avec les autorisations nécessaires. La modération peut retirer toute image.</li>
  <li><b>Signalement accessible</b> sur chaque annonce et chaque profil, examiné par la modération.</li>
  <li><b>Informations déclarées :</b> les diplômes, qualifications et conditions d'encadrement sont déclarés par les professionnels. La validation d'un compte par G-Sports n'est pas une certification de sécurité ou de compétence.</li></ul>
  <h2>Conseils aux parents</h2><ul><li>Rencontrez l'encadrant et visitez le lieu avant l'inscription.</li><li>Demandez les qualifications et l'assurance de la structure.</li><li>Vérifiez les conditions de sécurité (piscine : maître-nageur, arts martiaux : encadrement adapté…).</li><li>Signalez tout comportement inapproprié.</li></ul>
  <p><a class="btn btn-danger" href="/signalement">Signaler un contenu</a></p>`); });
addRoute('/faq', () => { setMeta('FAQ'); const q = (t, a) => html`<details><summary>${t}</summary><p>${a}</p></details>`; return page('Questions fréquentes', html`<div class="faq">
  ${q('G-Sports est-il vraiment gratuit ?', "Oui. Consulter, contacter, créer un compte, publier une annonce : tout est gratuit, sans abonnement, sans commission et sans mise en avant payante.")}
  ${q('Dois-je créer un compte pour chercher une activité ?', "Non. Le compte parent est facultatif : il sert à enregistrer vos favoris, vos alertes et à suivre vos demandes.")}
  ${q('Comment inscrire mon enfant ?', "Contactez directement le professionnel depuis l'annonce (appel, WhatsApp ou message). L'inscription et le paiement éventuel se font directement avec lui.")}
  ${q("Il n'y a aucune activité dans ma ville, pourquoi ?", "G-Sports n'affiche que de vraies annonces publiées par des professionnels. Si votre ville n'est pas encore couverte, invitez les clubs et coachs que vous connaissez à s'inscrire.")}
  ${q('Que signifie « Exemple fictif » ?', "Certaines annonces servent uniquement à illustrer la présentation d'une offre. Elles ne correspondent à aucune activité réelle et ne peuvent pas être contactées.")}
  ${q('Les clubs et coachs sont-ils vérifiés ?', "La modération examine chaque compte professionnel avant publication. Les informations (diplômes, encadrement, tarifs) restent déclarées par le professionnel : ce n'est pas une certification. Vérifiez-les lors de votre rencontre.")}
  ${q('Combien de temps une annonce reste-t-elle en ligne ?', "Jusqu'à sa date de fin, ou 120 jours si elle n'a pas de date de fin. Elle est alors retirée automatiquement et peut être renouvelée en un clic.")}
  ${q("Comment installer l'application ?", "G-Sports est une application web installable : sur Android et ordinateur, utilisez « Installer l'application » ; sur iPhone, « Partager » puis « Sur l'écran d'accueil ». Elle fonctionne aussi dans le navigateur.")}
  ${q('Comment supprimer mon compte ?', 'Depuis votre espace, onglet Paramètres : « Supprimer mon compte ». Vos données sont effacées.')}</div>`); });
addRoute('/contact', () => { setMeta('Contact'); return page('Contacter G-Sports', html`
  <p>Une question, une suggestion, un partenariat ? Écrivez-nous. Pour contacter un club ou un coach, utilisez plutôt le bouton « Contacter » de son annonce.</p>
  <form class="form card pad" data-form="site-message"><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="cols"><label class="lbl"><span class="req">Nom</span><input class="input" name="name" required maxlength="100" value="${state.me?.name || ''}"></label><label class="lbl"><span class="req">Email</span><input class="input" type="email" name="email" required value="${state.me?.email || ''}"></label></div>
    <label class="lbl">Objet<input class="input" name="subject" maxlength="150"></label><label class="lbl"><span class="req">Message</span><textarea class="input" name="message" required minlength="10" maxlength="4000"></textarea></label>
    <p class="form-error" role="alert"></p><button class="btn btn-primary" type="submit">Envoyer</button></form>`); });
form('site-message', async (f, d) => { await api('/api/site-messages', { method: 'POST', body: d }); f.reset(); toast('Message envoyé. Merci !', 'ok'); });
addRoute('/signalement', () => { setMeta('Signalement'); return page('Signaler un contenu', html`
  <p>Vous pouvez signaler une annonce ou un profil directement depuis sa page (lien « Signaler »). Vous pouvez aussi utiliser ce formulaire en collant le lien de l'annonce.</p>
  <form class="form card pad" data-form="report-url"><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="lbl"><span class="req">Lien de l'annonce ou du profil</span><input class="input" name="url" required placeholder="${location.origin}/annonce/12-…"></label>
    <label class="lbl"><span class="req">Motif</span><select class="input" name="reason" required><option value="">Choisir…</option>${state.meta.reportReasons.map((r) => html`<option>${r}</option>`)}</select></label>
    <label class="lbl">Précisions<textarea class="input" name="details" maxlength="2000"></textarea></label><label class="lbl">Votre email (facultatif)<input class="input" type="email" name="email"></label>
    <p class="form-error" role="alert"></p><button class="btn btn-danger" type="submit">Envoyer le signalement</button></form>
  <p class="small muted" style="margin-top:12px">En cas de danger immédiat pour un enfant, contactez sans attendre les services de police ou de secours.</p>`); });
form('report-url', async (f, d) => {
  let target_type = 'listing', target_id = null;
  const m1 = /\/annonce\/(\d+)/.exec(d.url);
  const m2 = /\/(clubs|coachs)\/([\w-]+)/.exec(d.url);
  if (m1) target_id = Number(m1[1]);
  else if (m2) { const p = await api('/api/profiles/' + m2[2]); target_type = 'profile'; target_id = p.id; }
  else throw new Error("Lien non reconnu : copiez l'adresse d'une annonce ou d'un profil G-Sports.");
  await api('/api/reports', { method: 'POST', body: { ...d, target_type, target_id } });
  f.reset(); toast('Signalement transmis à la modération. Merci.', 'ok');
});
addRoute('/conditions', () => { setMeta("Conditions d'utilisation"); return page("Conditions d'utilisation", html`
  <p class="muted small">Document de référence à faire valider juridiquement avant le lancement.</p>
  <h2>1. Objet</h2><p>G-Sports Gabon est une plateforme gratuite de découverte et de mise en relation entre familles et professionnels proposant des activités pour les jeunes au Gabon. G-Sports n'est ni organisateur des activités, ni intermédiaire de paiement.</p>
  <h2>2. Gratuité</h2><p>L'utilisation de G-Sports est gratuite pour tous. Aucun paiement, abonnement, commission ou mise en avant payante n'est proposé.</p>
  <h2>3. Comptes</h2><p>Le compte parent est réservé aux adultes (parents ou responsables légaux). Le compte professionnel est réservé aux structures et personnes proposant des activités. Chacun est responsable de la confidentialité de son mot de passe.</p>
  <h2>4. Annonces</h2><p>Les professionnels publient des informations exactes, à jour et dont ils sont responsables (tarifs, dates, encadrement, qualifications). Ils s'engagent à ne publier des photos d'enfants qu'avec les autorisations nécessaires. Les annonces expirent automatiquement à leur date de fin.</p>
  <h2>5. Protection des mineurs</h2><p>Il est interdit de contacter directement un enfant via la plateforme ou d'utiliser les informations obtenues à d'autres fins que la réponse à la demande d'un parent. Tout manquement entraîne la suspension du compte et peut être signalé aux autorités.</p>
  <h2>6. Modération</h2><p>G-Sports peut refuser, suspendre ou supprimer tout contenu ou compte contraire aux présentes conditions, inexact, inapproprié ou signalé. La validation d'un compte n'est pas une certification de sécurité ou de compétence.</p>
  <h2>7. Responsabilité</h2><p>Les activités sont organisées sous la seule responsabilité des professionnels. Les parents sont invités à vérifier les conditions d'encadrement et de sécurité avant toute inscription.</p>`); });
addRoute('/confidentialite', () => { setMeta('Politique de confidentialité'); return page('Politique de confidentialité', html`
  <p class="muted small">Document de référence à faire valider au regard de la réglementation gabonaise sur la protection des données personnelles avant le lancement.</p>
  <h2>Données collectées</h2><ul><li><b>Visiteurs :</b> aucune donnée personnelle n'est nécessaire pour consulter. Vos favoris sont stockés sur votre appareil.</li>
  <li><b>Parents :</b> nom, email, téléphone (facultatif), ville, et pour chaque enfant uniquement un prénom ou surnom et un âge. Aucune date de naissance.</li>
  <li><b>Demandes de contact :</b> nom, email, téléphone facultatif, ville, âge de l'enfant et message — transmis au seul professionnel concerné, avec votre consentement explicite.</li>
  <li><b>Professionnels :</b> informations de la structure, coordonnées professionnelles publiées sur le profil, nom du responsable.</li></ul>
  <h2>Ce que nous ne faisons pas</h2><ul><li>Pas de vente ni de partage commercial de vos données.</li><li>Pas de profil public d'enfant.</li><li>Pas de publicité ciblée.</li><li>Votre position n'est utilisée que ponctuellement, si vous le demandez, pour trier par proximité ; elle n'est pas enregistrée.</li></ul>
  <h2>Sécurité</h2><p>Mots de passe chiffrés (hachage scrypt), sessions sécurisées, limitation des tentatives, protection contre les abus de formulaires, sauvegardes régulières. Les photos envoyées sont redimensionnées sur votre appareil, ce qui retire leurs métadonnées (dont la localisation GPS).</p>
  <h2>Vos droits</h2><p>Vous pouvez consulter et modifier vos informations dans votre espace, et supprimer votre compte à tout moment (Paramètres → Supprimer mon compte). Pour toute question : <a href="/contact">formulaire de contact</a>.</p>
  <h2>Cookies</h2><p>Un seul cookie technique est utilisé pour maintenir votre connexion. Aucun cookie publicitaire ou de mesure d'audience tiers.</p>`); });
