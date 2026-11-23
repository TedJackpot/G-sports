// G-Sports – comptes : connexion, inscriptions, espace parent, espace professionnel
import {
  html, raw, esc, $, $$, api, state, addRoute, navigate, setMeta, action, form, onMount, toast, openModal, closeModal, confirmDialog, icon,
  fmtDate, fmtDateTime, fmtPrice, fmtAge, LEVEL_LABELS, DAY_LABELS, todayStr, photo, initials, listingCard, profileCard,
  citySelect, categorySelect, requireLogin, refreshMe, loadFavs, renderLayout, pickAndUpload, spaceLink, render, cityById, formData,
} from './core.js';

const authShell = (title, sub, body) => html`<div class="auth-wrap"><div class="card pad auth-card fade-in">
  <a class="logo" href="/" style="margin-bottom:14px"><span class="wordmark"><b>G</b>-Sports</span></a>
  <h1 style="font-size:1.6rem">${title}</h1>${sub ? html`<p class="muted">${sub}</p>` : ''}${body}</div></div>`;
const pwdHint = html`<span class="hint">8 caractères minimum, avec au moins une lettre et un chiffre.</span>`;
async function afterLogin(retour) {
  await refreshMe(); await loadFavs(); renderLayout();
  navigate(retour && retour.startsWith('/') && !retour.startsWith('//') ? retour : spaceLink() || '/', { replace: true });
}

// ================= CONNEXION =================
addRoute('/connexion', (ctx) => {
  if (state.me) { navigate(spaceLink(), { replace: true }); return; }
  setMeta('Connexion');
  return authShell('Se connecter', 'Parents et professionnels : accédez à votre espace.', html`
    <form class="form" data-form="login" data-retour="${ctx.query.retour || ''}">
      <label class="lbl">Email<input class="input" type="email" name="email" required autocomplete="email"></label>
      <label class="lbl">Mot de passe<input class="input" type="password" name="password" required autocomplete="current-password"></label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-lg" type="submit">Se connecter</button>
    </form>
    <p class="small muted" style="margin-top:14px">Mot de passe oublié ? Contactez-nous via le <a href="/contact">formulaire de contact</a> depuis l'adresse email de votre compte.</p>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <div class="grid two"><a class="btn btn-ghost" href="/inscription">Créer un compte parent</a><a class="btn btn-navy" href="/inscription-pro">Compte professionnel</a></div>`);
});
form('login', async (f, d) => { await api('/api/auth/login', { method: 'POST', body: d }); toast('Bienvenue sur G-Sports', 'ok'); await afterLogin(f.dataset.retour); });

// ================= INSCRIPTION PARENT =================
addRoute('/inscription', () => {
  if (state.me) { navigate(spaceLink(), { replace: true }); return; }
  setMeta('Créer un compte parent');
  return authShell('Créer un compte parent', "Facultatif : il permet d'enregistrer favoris, alertes, profils enfants et demandes.", html`
    <form class="form" data-form="register-parent"><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <label class="lbl"><span class="req">Nom du parent ou responsable</span><input class="input" name="name" required maxlength="100" autocomplete="name"></label>
      <div class="cols"><label class="lbl"><span class="req">Email</span><input class="input" type="email" name="email" required autocomplete="email"></label>
      <label class="lbl">Téléphone<input class="input" type="tel" name="phone" autocomplete="tel"></label></div>
      <label class="lbl">Ville${citySelect('city_id', '', { placeholder: 'Choisir ma ville', byId: true })}</label>
      <label class="lbl"><span class="req">Mot de passe</span><input class="input" type="password" name="password" required minlength="8" autocomplete="new-password">${pwdHint}</label>
      <label class="check"><input type="checkbox" name="is_adult" required> Je suis majeur(e), parent ou responsable légal.</label>
      <label class="check"><input type="checkbox" name="accept" required> J'accepte les <a href="/conditions" target="_blank">conditions d'utilisation</a> et la <a href="/confidentialite" target="_blank">politique de confidentialité</a>.</label>
      <p class="form-error" role="alert"></p><button class="btn btn-primary btn-lg" type="submit">Créer mon compte</button></form>
    <p class="small" style="margin-top:14px">Déjà inscrit ? <a href="/connexion">Se connecter</a> · Professionnel ? <a href="/inscription-pro">Référencer mon activité</a></p>`);
});
form('register-parent', async (f, d) => { await api('/api/auth/register-parent', { method: 'POST', body: d }); toast('Compte créé. Bienvenue !', 'ok'); await afterLogin('/espace-parent?tab=enfants'); });

// ================= INSCRIPTION PROFESSIONNEL =================
let regLogo = null;
addRoute('/inscription-pro', () => {
  if (state.me?.role === 'pro') { navigate('/espace-pro', { replace: true }); return; }
  setMeta('Référencer mon activité');
  regLogo = null;
  const types = Object.entries(state.meta.profileTypes);
  return html`<div class="page-head has-img"><figure class="head-photo"><img src="${photo('basket-dribble')}" alt=""></figure><div class="container">
    <h1>Vous êtes un club, une association, un gymnase, un coach ou un organisateur ?</h1><p>Présentez vos activités aux familles : tarifs, horaires, modalités d'inscription. Les demandes des parents arrivent directement chez vous.</p></div></div>
  <div class="container" style="padding:24px 16px 40px;max-width:860px">
    ${state.me ? html`<div class="notice warn" style="margin-bottom:14px">Vous êtes connecté avec un compte ${state.me.role}. Déconnectez-vous pour créer un compte professionnel avec une autre adresse email.</div>` : ''}
    <form class="form" data-form="register-pro"><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <fieldset><legend>Votre structure</legend><div class="form">
        <div class="lbl"><span class="req">Type de compte</span><div class="pill-checks">${types.map(([k, l], i) => html`<label><input type="radio" name="type" value="${k}" ${i === 0 ? 'checked' : ''}><span>${l}</span></label>`)}</div></div>
        <div class="cols"><label class="lbl"><span class="req">Nom de la structure ou du professionnel</span><input class="input" name="name" required maxlength="120"></label>
        <label class="lbl"><span class="req">Activité principale</span><input class="input" name="main_activity" required maxlength="100" placeholder="Ex. : football, natation, danse…" list="dl-acts2"></label></div>
        <datalist id="dl-acts2">${state.meta.groups.flatMap((g) => g.categories.map((c) => html`<option value="${c.name}">`))}</datalist>
        <label class="lbl">Description<textarea class="input" name="description" maxlength="3000" placeholder="Présentez votre structure, vos valeurs, votre encadrement…"></textarea></label>
        <div class="row"><div class="avatar" id="reg-logo">${icon('plus')}</div><button type="button" class="btn btn-ghost btn-sm" data-action="reg-logo">Ajouter un logo ou une photo</button></div>
      </div></fieldset>
      <fieldset><legend>Localisation et contact</legend><div class="form">
        <div class="cols"><label class="lbl"><span class="req">Ville</span>${citySelect('city_id', '', { placeholder: 'Choisir la ville', byId: true, required: true })}</label>
        <label class="lbl">Adresse ou quartier<input class="input" name="address" maxlength="200"></label></div>
        <div class="cols"><label class="lbl"><span class="req">Nom du responsable</span><input class="input" name="manager_name" required maxlength="100"></label>
        <label class="lbl"><span class="req">Email</span><input class="input" type="email" name="email" required autocomplete="email"></label></div>
        <div class="cols"><label class="lbl"><span class="req">Téléphone</span><input class="input" type="tel" name="phone" required></label>
        <label class="lbl">WhatsApp<input class="input" type="tel" name="whatsapp" placeholder="+241 …"></label></div>
        <label class="lbl"><span class="req">Mot de passe</span><input class="input" type="password" name="password" required minlength="8" autocomplete="new-password">${pwdHint}</label>
      </div></fieldset>
      <label class="check"><input type="checkbox" name="accept" required> J'accepte les <a href="/conditions" target="_blank">conditions d'utilisation</a>.</label>
      <label class="check"><input type="checkbox" name="accept_minors" required> Je m'engage à respecter la <a href="/securite" target="_blank">charte de protection des mineurs</a> : contacts uniquement avec les parents, photos d'enfants seulement avec autorisation, informations exactes.</label>
      <p class="form-error" role="alert"></p>
      <button class="btn btn-primary btn-lg" type="submit">Créer mon compte professionnel</button>
      <p class="small muted">Votre compte sera examiné par la modération. Vous pouvez préparer votre profil et vos annonces immédiatement : elles seront publiées dès la validation.</p>
    </form></div>`;
});
action('reg-logo', async () => { const [u] = await pickAndUpload(); if (u) { regLogo = u; $('#reg-logo').innerHTML = `<img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:18px">`; } });
form('register-pro', async (f, d) => {
  if (state.me) throw new Error('Déconnectez-vous d\'abord pour créer un compte professionnel.');
  await api('/api/auth/register-pro', { method: 'POST', body: { ...d, logo: regLogo } });
  toast('Compte professionnel créé !', 'ok'); await afterLogin('/espace-pro');
});

// ================= PARTAGÉ : tabs, notifications, paramètres =================
function tabs(base, items, current) {
  return html`<nav class="side-tabs" aria-label="Sections">${items.map(([k, l, ic, n]) => html`<a href="${base}?tab=${k}" class="${current === k ? 'on' : ''}" ${current === k ? raw('aria-current="page"') : ''}>${icon(ic, 18)} ${l}${n ? html` <span class="n">${n}</span>` : ''}</a>`)}</nav>`;
}
async function notificationsTab() {
  const r = await api('/api/me/notifications');
  if (r.items.some((n) => !n.read_at)) { api('/api/me/notifications/read', { method: 'POST' }).then(() => { state.unread = 0; renderLayout(); }).catch(() => {}); }
  return html`<h2>Notifications</h2>${r.items.length ? html`<div class="grid" style="gap:8px">${r.items.map((n) => html`<div class="notif ${n.read_at ? '' : 'unread'}"><div style="font-size:1.3rem">${{ alerte: '🔔', demande: '📩', reponse: '💬', validation: '✅', expiration: '⏰', favori: '❤️', deadline: '📅', moderation: '🛡️', signalement: '🚩', info: 'ℹ️' }[n.type] || '•'}</div>
    <div style="flex:1"><b>${n.title}</b>${n.body ? html`<div class="small">${n.body}</div>` : ''}<div class="small muted">${fmtDateTime(n.created_at)}</div></div>${n.link ? html`<a class="btn btn-ghost btn-sm" href="${n.link}">Voir</a>` : ''}</div>`)}</div>`
    : html`<div class="empty"><div class="ico">🔕</div><p>Aucune notification.</p></div>`}`;
}
function settingsTab() {
  const me = state.me;
  return html`<h2>Paramètres</h2>
  <form class="card pad form" data-form="settings"><h3>Mes informations</h3>
    <div class="cols"><label class="lbl">Nom<input class="input" name="name" value="${me.name}" required maxlength="100"></label><label class="lbl">Téléphone<input class="input" name="phone" value="${me.phone || ''}"></label></div>
    <label class="lbl">Ma ville${citySelect('city_id', me.city_id, { placeholder: '—', byId: true })}</label>
    ${me.role === 'parent' ? html`<label class="lbl">Villes préférées <span class="hint">(utilisées pour vos suggestions)</span><select class="input" name="preferred_cities" multiple size="5">${state.meta.cities.map((c) => html`<option value="${c.id}" ${me.preferred_cities.includes(c.id) ? 'selected' : ''}>${c.name}</option>`)}</select></label>` : ''}
    <label class="check"><input type="checkbox" name="email_notifications" ${me.email_notifications ? 'checked' : ''}> Recevoir aussi mes notifications par email</label>
    <p class="form-error" role="alert"></p><button class="btn btn-navy" type="submit">Enregistrer</button></form>
  <form class="card pad form" data-form="change-password" style="margin-top:16px"><h3>Changer de mot de passe</h3>
    <div class="cols"><label class="lbl">Mot de passe actuel<input class="input" type="password" name="current" required autocomplete="current-password"></label><label class="lbl">Nouveau mot de passe<input class="input" type="password" name="password" required minlength="8" autocomplete="new-password">${pwdHint}</label></div>
    <p class="form-error" role="alert"></p><button class="btn btn-ghost" type="submit">Modifier</button></form>
  <div class="card pad" style="margin-top:16px"><h3>Supprimer mon compte</h3><p class="muted small">Toutes vos données (profil, ${me.role === 'pro' ? 'annonces, demandes reçues' : 'profils enfants, favoris, alertes, demandes'}) seront définitivement supprimées.</p>
    <button class="btn btn-danger btn-sm" data-action="delete-account">Supprimer mon compte</button>
    <button class="btn btn-ghost btn-sm" data-action="logout">Se déconnecter</button></div>`;
}
form('settings', async (f, d) => {
  const prefs = f.elements.preferred_cities ? [...f.elements.preferred_cities.selectedOptions].map((o) => Number(o.value)) : [];
  await api('/api/me/settings', { method: 'PUT', body: { ...d, preferred_cities: prefs } });
  await refreshMe(); renderLayout(); toast('Paramètres enregistrés', 'ok');
});
form('change-password', async (f, d) => { await api('/api/auth/change-password', { method: 'POST', body: d }); f.reset(); toast('Mot de passe modifié', 'ok'); });
action('delete-account', () => openModal(html`<h3>Supprimer définitivement mon compte</h3><p>Cette action est irréversible. Confirmez avec votre mot de passe.</p>
  <form class="form" data-form="delete-account"><input class="input" type="password" name="password" required placeholder="Mot de passe" autocomplete="current-password"><p class="form-error" role="alert"></p><button class="btn btn-danger" type="submit">Supprimer mon compte</button></form>`));
form('delete-account', async (f, d) => { await api('/api/account', { method: 'DELETE', body: d }); closeModal(); state.me = null; await loadFavs(); renderLayout(); navigate('/'); toast('Votre compte a été supprimé.'); });

// ================= ESPACE PARENT =================
addRoute('/espace-parent', async (ctx) => {
  if (!requireLogin(['parent'])) return;
  setMeta('Espace parent');
  const tab = ctx.query.tab || 'apercu';
  const T = [['apercu', 'Aperçu', 'home'], ['enfants', 'Mes enfants', 'age'], ['favoris', 'Favoris', 'heart'], ['alertes', 'Alertes', 'bell'], ['demandes', 'Demandes', 'mail'], ['notifications', 'Notifications', 'bell', state.unread], ['parametres', 'Paramètres', 'user']];
  let body;
  if (tab === 'apercu') {
    const [ch, req] = await Promise.all([api('/api/me/children'), api('/api/me/requests')]);
    const city = cityById(state.me.preferred_cities?.[0] || state.me.city_id);
    const sugg = await Promise.all(ch.items.map((c) => api('/api/listings?' + new URLSearchParams({ age: c.age, limit: 4, ...(city ? { city: city.slug } : {}) })).then((r) => ({ c, items: r.items }))));
    body = html`<h2>Bonjour ${state.me.name.split(' ')[0]} 👋</h2>
      <div class="kpis"><div class="kpi accent"><b>${ch.items.length}</b><span>Enfant${ch.items.length > 1 ? 's' : ''}</span></div><div class="kpi"><b>${state.favs.size}</b><span>Favoris</span></div><div class="kpi"><b>${req.items.length}</b><span>Demandes envoyées</span></div><div class="kpi"><b>${req.items.filter((r) => r.reply).length}</b><span>Réponses reçues</span></div></div>
      ${!ch.items.length ? html`<div class="notice" style="margin-top:16px">Ajoutez vos enfants (prénom et âge uniquement) pour recevoir des suggestions adaptées à chacun. <a href="/espace-parent?tab=enfants">Ajouter un enfant</a></div>` : ''}
      ${sugg.map(({ c, items }) => html`<div style="margin-top:22px"><div class="row between"><h3 style="margin:0">Pour ${c.nickname} (${c.age} ans)${city ? ` à ${city.name}` : ''}</h3><a class="btn btn-ghost btn-sm" href="/activites?age=${c.age}${city ? '&city=' + city.slug : ''}">Tout voir</a></div>
        ${items.length ? html`<div class="grid cards" style="margin-top:10px">${items.map(listingCard)}</div>` : html`<p class="muted">Aucune activité référencée pour cet âge${city ? ' dans cette ville' : ''} pour le moment. <a href="/activites?age=${c.age}">Élargir à tout le Gabon</a></p>`}</div>`)}
      <div class="quick" style="margin-top:22px"><a href="/activites">${raw('<span class="ic">🔎</span>')}Trouver une activité</a><a href="/espace-parent?tab=alertes">${raw('<span class="ic">🔔</span>')}Créer une alerte</a><a href="/calendrier">${raw('<span class="ic">📅</span>')}Dates d'inscription</a></div>`;
  } else if (tab === 'enfants') {
    const r = await api('/api/me/children');
    body = html`<h2>Mes enfants</h2><p class="muted">Profils privés, jamais visibles publiquement. Seuls un prénom (ou surnom) et l'âge sont enregistrés.</p>
      <div class="grid" style="gap:10px">${r.items.map((c) => html`<div class="item-row"><div class="avatar round" style="width:48px;height:48px;font-size:1rem">${initials(c.nickname)}</div>
        <div class="grow"><b>${c.nickname}</b><div class="small muted">${c.age} ans${c.interests ? ' · ' + c.interests.split(',').join(', ') : ''}</div></div>
        <div class="acts"><a class="btn btn-ghost btn-sm" href="/activites?age=${c.age}">Activités adaptées</a><button class="btn btn-ghost btn-sm" data-action="edit-child" data-id="${c.id}" data-n="${c.nickname}" data-a="${c.age}" data-i="${c.interests}">Modifier</button><button class="btn btn-ghost btn-sm" data-action="del-child" data-id="${c.id}">Supprimer</button></div></div>`)}</div>
      <form class="card pad form" data-form="child" style="margin-top:16px"><h3 id="child-form-title">Ajouter un enfant</h3><input type="hidden" name="id">
        <div class="cols"><label class="lbl"><span class="req">Prénom ou surnom</span><input class="input" name="nickname" required maxlength="40"></label><label class="lbl"><span class="req">Âge</span><input class="input" type="number" name="age" min="3" max="25" required inputmode="numeric"></label></div>
        <div class="lbl">Centres d'intérêt <span class="hint">(facultatif)</span><div class="pill-checks">${state.meta.groups.map((g) => html`<label><input type="checkbox" data-multi name="interests" value="${g.name}"><span>${g.name}</span></label>`)}</div></div>
        <p class="form-error" role="alert"></p><button class="btn btn-navy" type="submit">Enregistrer</button></form>`;
  } else if (tab === 'favoris') {
    const r = await api('/api/me/favorites');
    body = html`<h2>Mes favoris</h2>${r.items.length ? html`<div class="grid cards">${r.items.map(listingCard)}</div>` : html`<div class="empty"><p>Aucun favori. Les annonces expirées sont retirées automatiquement.</p><a class="btn btn-primary" href="/activites">Explorer</a></div>`}`;
  } else if (tab === 'alertes') {
    const r = await api('/api/me/alerts');
    body = html`<h2>Mes alertes</h2><p class="muted">Recevez une notification dès qu'une nouvelle activité correspond à vos critères (nouvelle activité dans votre ville, pour l'âge de votre enfant, nouveau stage ou camp…).</p>
      <div class="grid" style="gap:8px">${r.items.map((a) => html`<div class="item-row"><div class="grow"><b>${a.grp || 'Toutes activités'}</b><div class="small muted">${a.city || 'Tout le Gabon'}${a.age ? ` · ${a.age} ans` : ''}${a.kinds ? ' · ' + a.kinds.split(',').map((k) => state.meta.kinds[k]).join(', ') : ''}</div></div><button class="btn btn-ghost btn-sm" data-action="del-alert" data-id="${a.id}">Supprimer</button></div>`)}</div>
      <form class="card pad form" data-form="alert" style="margin-top:16px"><h3>Nouvelle alerte</h3>
        <div class="cols three"><label class="lbl">Ville${citySelect('city_id', state.me.city_id, { placeholder: 'Tout le Gabon', byId: true })}</label>
        <label class="lbl">Famille d'activités<select class="input" name="group_id"><option value="">Toutes</option>${state.meta.groups.map((g) => html`<option value="${g.id}">${g.name}</option>`)}</select></label>
        <label class="lbl">Âge du participant<input class="input" type="number" name="age" min="3" max="99" inputmode="numeric"></label></div>
        <div class="lbl">Types d'annonces <span class="hint">(aucun = tous)</span><div class="pill-checks">${[['activite', 'Activités'], ['stage', 'Stages'], ['camp', 'Camps'], ['inscriptions', 'Ouvertures d\'inscriptions'], ['decouverte', 'Journées découverte']].map(([k, l]) => html`<label><input type="checkbox" data-multi name="kinds" value="${k}"><span>${l}</span></label>`)}</div></div>
        <p class="form-error" role="alert"></p><button class="btn btn-navy" type="submit">Créer l'alerte</button></form>`;
  } else if (tab === 'demandes') {
    const r = await api('/api/me/requests');
    const ST = { nouveau: ['Envoyée', 'pending'], lu: ['Lue', 'pending'], repondu: ['Réponse reçue', 'ok'], archive: ['Archivée', 'soft'] };
    body = html`<h2>Mes demandes</h2><p class="muted">Demandes d'informations, de rendez-vous, de séance découverte ou d'inscription envoyées aux professionnels.</p>
      ${r.items.length ? html`<div class="grid" style="gap:10px">${r.items.map((q) => html`<div class="card pad"><div class="row between"><div><span class="badge ${ST[q.status]?.[1]}">${ST[q.status]?.[0]}</span> <b>${q.type_label}</b></div><span class="small muted">${fmtDateTime(q.created_at)}</span></div>
        <p style="margin:8px 0 4px"><a href="${q.org_url}"><b>${q.org_name}</b></a>${q.listing_url ? html` · <a href="${q.listing_url}">${q.ltitle}</a>` : ''}</p>
        <p class="small muted prose">${q.message}</p>${q.reply ? html`<div class="notice ok"><b>Réponse :</b> <span class="prose">${q.reply}</span></div>` : ''}
        <div class="row small">${q.org_phone ? html`<a href="tel:${q.org_phone.replace(/\s/g, '')}" data-external>${icon('phone', 14)} ${q.org_phone}</a>` : ''}${q.org_whatsapp ? html`<a href="https://wa.me/${q.org_whatsapp.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener" data-external>${icon('wa', 14)} WhatsApp</a>` : ''}</div></div>`)}</div>`
        : html`<div class="empty"><p>Aucune demande envoyée.</p><a class="btn btn-primary" href="/activites">Trouver une activité</a></div>`}`;
  } else if (tab === 'notifications') body = await notificationsTab();
  else body = settingsTab();
  return html`<div class="container dash">${tabs('/espace-parent', T, tab)}<div class="fade-in">${body}</div></div>`;
});
form('child', async (f, d) => {
  const body = { nickname: d.nickname, age: d.age, interests: d.interests || [] };
  if (d.id) await api(`/api/me/children/${d.id}`, { method: 'PUT', body }); else await api('/api/me/children', { method: 'POST', body });
  toast('Profil enfant enregistré', 'ok'); render();
});
action('edit-child', (el) => {
  const f = $('form[data-form="child"]');
  f.elements.id.value = el.dataset.id; f.elements.nickname.value = el.dataset.n; f.elements.age.value = el.dataset.a;
  const ints = (el.dataset.i || '').split(',');
  $$('input[name="interests"]', f).forEach((c) => { c.checked = ints.includes(c.value); });
  $('#child-form-title').textContent = 'Modifier le profil'; f.scrollIntoView({ behavior: 'smooth' });
});
action('del-child', async (el) => { if (await confirmDialog('Supprimer ce profil enfant ?', { ok: 'Supprimer', danger: true })) { await api(`/api/me/children/${el.dataset.id}`, { method: 'DELETE' }); render(); } });
form('alert', async (f, d) => { await api('/api/me/alerts', { method: 'POST', body: d }); toast('Alerte créée', 'ok'); render(); });
action('del-alert', async (el) => { await api(`/api/me/alerts/${el.dataset.id}`, { method: 'DELETE' }); render(); });

addRoute('/demandes', () => {
  if (!requireLogin()) return;
  navigate(state.me.role === 'pro' ? '/espace-pro?tab=demandes' : '/espace-parent?tab=demandes', { replace: true });
});

// ================= ESPACE PROFESSIONNEL =================
const STATUS = { published: ['Publiée', 'ok'], pending: ['En attente de validation', 'pending'], draft: ['Brouillon', 'soft'], suspended: ['Suspendue', 'bad'], expired: ['Expirée', 'bad'] };
addRoute('/espace-pro', async (ctx) => {
  if (!requireLogin(['pro'])) return;
  setMeta('Espace professionnel');
  const tab = ctx.query.tab || 'tableau';
  const d = await api('/api/pro/dashboard');
  const p = d.profile;
  const T = [['tableau', 'Tableau de bord', 'home'], ['annonces', 'Mes annonces', 'list'], ['demandes', 'Demandes', 'mail', d.stats.new_requests], ['profil', 'Mon profil', 'user'], ['calendrier', 'Calendrier', 'cal'], ['notifications', 'Notifications', 'bell', state.unread], ['parametres', 'Paramètres', 'shield']];
  const verifNotice = p.verification === 'pending' ? html`<div class="notice warn" style="margin-bottom:16px"><b>Compte en cours de vérification.</b> Préparez votre profil et vos annonces : elles seront publiées automatiquement dès la validation par la modération.</div>`
    : p.verification === 'rejected' ? html`<div class="notice err" style="margin-bottom:16px"><b>Compte non validé.</b> Vos annonces ne sont pas visibles. Complétez votre profil et contactez G-Sports.</div>` : '';
  let body;
  if (tab === 'tableau') {
    const reqs = (await api('/api/pro/requests')).items.slice(0, 5);
    const upcoming = d.listings.filter((l) => l.is_visible && (l.start_date || l.reg_end)).sort((a, b) => (a.start_date || a.reg_end).localeCompare(b.start_date || b.reg_end)).slice(0, 6);
    body = html`<div class="row between"><div><h2 style="margin:0">${p.name}</h2><p class="muted" style="margin:0">${p.type_label}${p.city ? ' · ' + p.city.name : ''}</p></div><a class="btn btn-ghost btn-sm" href="${p.url}">Voir mon profil public</a></div>
      <div class="kpis" style="margin-top:16px"><div class="kpi accent"><b>${d.stats.active}</b><span>Annonces actives</span></div><div class="kpi"><b>${d.stats.requests}</b><span>Demandes reçues${d.stats.new_requests ? ` (${d.stats.new_requests} nouvelles)` : ''}</span></div><div class="kpi"><b>${d.stats.views}</b><span>Vues</span></div><div class="kpi"><b>${d.stats.favorites}</b><span>Favoris enregistrés</span></div></div>
      <div class="kpis" style="margin-top:12px"><div class="kpi"><b>${d.stats.inscriptions}</b><span>Inscriptions en cours</span></div><div class="kpi"><b>${d.stats.pending}</b><span>En attente</span></div><div class="kpi"><b>${d.expiring.length}</b><span>Expirent sous 14 j</span></div><div class="kpi"><b>${d.stats.expired}</b><span>Expirées</span></div></div>
      <h3 style="margin-top:22px">Actions rapides</h3>
      <div class="quick"><a href="/espace-pro/annonce/nouvelle"><span class="ic">📣</span>Publier une annonce</a><a href="/espace-pro/annonce/nouvelle?kind=activite"><span class="ic">⚽</span>Ajouter une activité</a><a href="/espace-pro/annonce/nouvelle?kind=stage"><span class="ic">🏅</span>Ajouter un stage</a>
        <a href="/espace-pro/annonce/nouvelle?kind=camp"><span class="ic">🏕️</span>Ajouter un camp</a><a href="/espace-pro?tab=profil"><span class="ic">✏️</span>Modifier mon profil</a><a href="/espace-pro?tab=demandes"><span class="ic">📩</span>Voir mes contacts</a></div>
      ${d.expiring.length ? html`<h3 style="margin-top:22px">Annonces expirant bientôt</h3><div class="grid" style="gap:8px">${d.expiring.map((l) => html`<div class="item-row"><div class="grow"><b>${l.title}</b><div class="small muted">Expire le ${fmtDate(l.expires_at)}</div></div><a class="btn btn-ghost btn-sm" href="/espace-pro/annonce/${l.id}">Modifier les dates</a></div>`)}</div>` : ''}
      <h3 style="margin-top:22px">Derniers contacts</h3>${reqs.length ? html`<div class="grid" style="gap:8px">${reqs.map((r) => html`<div class="item-row"><div class="grow"><b>${r.parent_name}</b> · ${r.type_label}<div class="small muted">${r.ltitle || r.activity || ''} · ${fmtDateTime(r.created_at)}</div></div>${r.status === 'nouveau' ? html`<span class="badge nouveau">Nouveau</span>` : ''}</div>`)}</div><p><a href="/espace-pro?tab=demandes">Toutes les demandes →</a></p>` : html`<p class="muted">Aucune demande pour le moment.</p>`}
      <h3 style="margin-top:22px">Calendrier des activités</h3>${upcoming.length ? html`<div class="grid" style="gap:8px">${upcoming.map((l) => html`<div class="event-row"><div class="date">${(l.start_date || l.reg_end).slice(8)}<small>${fmtDate(l.start_date || l.reg_end).split(' ')[1]}</small></div><div><b>${l.title}</b><div class="small muted">${l.start_date ? 'Début ' + fmtDate(l.start_date) : ''}${l.reg_end ? ' · Inscriptions jusqu\'au ' + fmtDate(l.reg_end) : ''}</div></div></div>`)}</div>` : html`<p class="muted">Ajoutez des dates à vos annonces pour les voir ici.</p>`}`;
  } else if (tab === 'annonces') {
    const groups = [['published', 'Annonces actives'], ['pending', 'En attente de validation'], ['draft', 'Brouillons'], ['suspended', 'Suspendues'], ['expired', 'Expirées']];
    body = html`<div class="row between"><h2 style="margin:0">Mes annonces</h2><a class="btn btn-primary" href="/espace-pro/annonce/nouvelle">${icon('plus', 18)} Nouvelle annonce</a></div>
      ${d.listings.length ? groups.map(([st, label]) => { const items = d.listings.filter((l) => l.status === st); return items.length ? html`<h3 style="margin-top:20px">${label} (${items.length})</h3><div class="grid" style="gap:10px">${items.map((l) => html`<div class="item-row">
        ${l.cover ? html`<img class="thumb" src="${l.cover}" alt="">` : html`<div class="thumb avatar" style="width:84px;height:64px;border-radius:10px">${l.group?.icon || '⭐'}</div>`}
        <div class="grow"><span class="badge ${STATUS[l.status][1]}">${STATUS[l.status][0]}</span> ${l.is_demo ? html`<span class="badge demo">Exemple</span>` : ''}<div style="font-weight:700;margin-top:4px">${l.title}</div>
          <div class="small muted">${l.kind_label} · ${l.city.name} · ${fmtAge(l.age_min, l.age_max)} · ${l.views} vues · ${l.favorites} favoris · ${l.requests} demandes${l.expires_at ? ' · expire le ' + fmtDate(l.expires_at) : ''}</div>
          ${l.admin_note ? html`<div class="small" style="color:var(--danger)">Modération : ${l.admin_note}</div>` : ''}</div>
        <div class="acts"><a class="btn btn-ghost btn-sm" href="${l.url}">Voir</a><a class="btn btn-ghost btn-sm" href="/espace-pro/annonce/${l.id}">Modifier</a>
          ${l.status === 'published' ? html`<button class="btn btn-ghost btn-sm" data-action="l-act" data-a="suspend" data-id="${l.id}">Suspendre</button>` : ''}
          ${l.status === 'suspended' && !l.admin_note ? html`<button class="btn btn-ghost btn-sm" data-action="l-act" data-a="resume" data-id="${l.id}">Réactiver</button>` : ''}
          ${l.status === 'expired' || (l.status === 'published' && l.expires_at && l.expires_at <= new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)) ? html`<button class="btn btn-turq btn-sm" data-action="l-act" data-a="renew" data-id="${l.id}">Renouveler</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-action="l-act" data-a="duplicate" data-id="${l.id}">Dupliquer</button>
          <button class="btn btn-ghost btn-sm" data-action="l-del" data-id="${l.id}" aria-label="Supprimer">🗑</button></div></div>`)}</div>` : ''; })
        : html`<div class="empty" style="margin-top:16px"><div class="ico">📣</div><h3>Aucune annonce</h3><p>Publiez votre première annonce, ou partez d'un modèle.</p><div class="row" style="justify-content:center"><a class="btn btn-primary" href="/espace-pro/annonce/nouvelle">Publier une annonce</a><a class="btn btn-ghost" href="/modeles">Modèles</a></div></div>`}`;
  } else if (tab === 'demandes') {
    const r = await api('/api/pro/requests');
    const ST = { nouveau: 'Nouveau', lu: 'Lu', repondu: 'Répondu', archive: 'Archivé' };
    body = html`<h2>Demandes de contact</h2><p class="muted">Les demandes proviennent uniquement de parents ou responsables légaux. Merci de répondre rapidement et de ne jamais contacter directement un enfant.</p>
      ${r.items.length ? html`<div class="grid" style="gap:10px">${r.items.map((q) => html`<div class="card pad">
        <div class="row between"><div><span class="badge ${q.status === 'nouveau' ? 'nouveau' : q.status === 'repondu' ? 'ok' : 'soft'}">${ST[q.status]}</span> <b>${q.type_label}</b></div><span class="small muted">${fmtDateTime(q.created_at)}</span></div>
        <div class="info-list" style="margin-top:8px">
          <div><span class="k">Parent</span><span>${q.parent_name}</span></div><div><span class="k">Contact</span><span><a href="mailto:${q.email}" data-external>${q.email}</a>${q.phone ? html` · <a href="tel:${q.phone.replace(/\s/g, '')}" data-external>${q.phone}</a>` : ''}</span></div>
          ${q.city ? html`<div><span class="k">Ville</span><span>${q.city}</span></div>` : ''}<div><span class="k">Activité</span><span>${q.listing_url ? html`<a href="${q.listing_url}">${q.ltitle}</a>` : q.activity || '—'}</span></div>
          ${q.child_age ? html`<div><span class="k">Âge du participant</span><span>${q.child_age} ans</span></div>` : ''}${q.preferred_date ? html`<div><span class="k">Disponibilités</span><span>${q.preferred_date}</span></div>` : ''}
          <div><span class="k">Message</span><span class="prose">${q.message}</span></div>${q.reply ? html`<div><span class="k">Votre réponse</span><span class="prose">${q.reply}</span></div>` : ''}</div>
        <div class="row" style="margin-top:10px">${q.phone ? html`<a class="btn btn-wa btn-sm" href="https://wa.me/${q.phone.replace(/[^0-9]/g, '')}" target="_blank" rel="noopener" data-external>${icon('wa', 16)} WhatsApp</a>` : ''}
          <button class="btn btn-navy btn-sm" data-action="reply" data-id="${q.id}">Répondre</button>
          ${q.status === 'nouveau' ? html`<button class="btn btn-ghost btn-sm" data-action="req-status" data-id="${q.id}" data-s="lu">Marquer comme lu</button>` : ''}
          ${q.status !== 'archive' ? html`<button class="btn btn-ghost btn-sm" data-action="req-status" data-id="${q.id}" data-s="archive">Archiver</button>` : ''}</div></div>`)}</div>`
        : html`<div class="empty"><div class="ico">📩</div><p>Aucune demande pour le moment. Complétez votre profil et publiez des annonces détaillées pour être contacté.</p></div>`}`;
  } else if (tab === 'profil') body = profileEditor(p);
  else if (tab === 'calendrier') {
    const evs = [];
    for (const l of d.listings.filter((x) => ['published', 'pending', 'draft'].includes(x.status))) {
      if (l.reg_start) evs.push([l.reg_start, 'Ouverture des inscriptions', l]); if (l.reg_end) evs.push([l.reg_end, "Date limite d'inscription", l]);
      if (l.start_date) evs.push([l.start_date, 'Début', l]); if (l.end_date) evs.push([l.end_date, 'Fin', l]);
    }
    evs.sort((a, b) => a[0].localeCompare(b[0]));
    const future = evs.filter((e) => e[0] >= todayStr());
    body = html`<h2>Calendrier de mes activités</h2>${future.length ? html`<div class="grid" style="gap:8px">${future.map(([dt, lab, l]) => html`<a class="event-row" href="/espace-pro/annonce/${l.id}"><div class="date">${dt.slice(8)}<small>${fmtDate(dt).split(' ')[1]}</small></div><div><span class="small muted">${lab}</span><div style="font-weight:700">${l.title}</div></div></a>`)}</div>` : html`<div class="empty"><p>Aucune date à venir. Renseignez les dates de début, de fin et d'inscription dans vos annonces.</p></div>`}`;
  } else if (tab === 'notifications') body = await notificationsTab();
  else body = settingsTab();
  return html`<div class="container dash">${tabs('/espace-pro', T, tab)}<div class="fade-in">${verifNotice}${body}</div></div>`;
});
action('l-act', async (el) => {
  const a = el.dataset.a;
  try {
    const r = await api(`/api/pro/listings/${el.dataset.id}/${a}`, { method: 'POST' });
    toast({ renew: 'Annonce renouvelée', suspend: 'Annonce suspendue', resume: 'Annonce réactivée', duplicate: 'Copie créée en brouillon' }[a], 'ok');
    if (a === 'duplicate') navigate(`/espace-pro/annonce/${r.id}`); else render();
  } catch (e) { toast(e.message, 'err'); }
});
action('l-del', async (el) => { if (await confirmDialog('Supprimer définitivement cette annonce ?', { ok: 'Supprimer', danger: true })) { await api(`/api/pro/listings/${el.dataset.id}`, { method: 'DELETE' }); toast('Annonce supprimée'); render(); } });
action('req-status', async (el) => { await api(`/api/pro/requests/${el.dataset.id}`, { method: 'PUT', body: { status: el.dataset.s } }); render(); });
action('reply', (el) => openModal(html`<h3>Répondre au parent</h3><p class="small muted">La réponse est envoyée au parent (notification dans son espace et email). Indiquez vos disponibilités, les modalités et vos coordonnées.</p>
  <form class="form" data-form="reply" data-id="${el.dataset.id}"><textarea class="input" name="reply" required maxlength="2000" rows="6"></textarea><p class="form-error" role="alert"></p><button class="btn btn-navy" type="submit">Envoyer la réponse</button></form>`));
form('reply', async (f, d) => { await api(`/api/pro/requests/${f.dataset.id}`, { method: 'PUT', body: d }); closeModal(); toast('Réponse envoyée', 'ok'); render(); });

// ---------- Éditeur de profil professionnel ----------
let profPhotos = [], profLogo = null, profCover = null, profFormulas = [];
function formulasBlock(list) {
  return html`<div id="formulas" class="grid" style="gap:8px">${list.map((fo, i) => html`<div class="formula-row" data-i="${i}">
    <label class="lbl small">Nom<input class="input" data-f="name" value="${fo.name}" maxlength="80" placeholder="Séance découverte"></label>
    <label class="lbl small">Prix<input class="input" data-f="price" value="${fo.price}" maxlength="60" placeholder="5 000 FCFA"></label>
    <label class="lbl small">Détails<input class="input" data-f="details" value="${fo.details}" maxlength="300" placeholder="Durée, contenu…"></label>
    <button type="button" class="btn btn-ghost btn-sm" data-action="del-formula" data-i="${i}" aria-label="Retirer">✕</button></div>`)}</div>
    <div class="row" style="margin-top:8px"><button type="button" class="btn btn-ghost btn-sm" data-action="add-formula">${icon('plus', 16)} Ajouter une formule</button>
    <span class="small muted">Suggestions :</span>${['Séance découverte', 'Séance individuelle', 'Pack 4 séances', 'Pack 8 séances', 'Coaching mensuel', 'Coaching en groupe', 'Stage intensif', 'Programme vacances'].map((n) => html`<button type="button" class="chip" style="font-size:.78rem;padding:4px 10px" data-action="add-formula" data-n="${n}">${n}</button>`)}</div>`;
}
function readFormulas() {
  return $$('#formulas .formula-row').map((r) => ({ name: $('[data-f=name]', r).value.trim(), price: $('[data-f=price]', r).value.trim(), details: $('[data-f=details]', r).value.trim() })).filter((x) => x.name);
}
action('add-formula', (el) => { profFormulas = readFormulas(); profFormulas.push({ name: el.dataset.n || '', price: '', details: '' }); $('#formulas-wrap').innerHTML = String(formulasBlock(profFormulas)); });
action('del-formula', (el) => { profFormulas = readFormulas().filter((_, i) => i !== Number(el.dataset.i)); $('#formulas-wrap').innerHTML = String(formulasBlock(profFormulas)); });
function photosBlock(id, list, max) {
  return html`<div class="photo-grid" id="${id}">${list.map((u, i) => html`<div class="ph"><img src="${u}" alt=""><button type="button" data-action="del-photo" data-g="${id}" data-i="${i}" aria-label="Retirer la photo">✕</button></div>`)}
    ${list.length < max ? html`<button type="button" class="add" data-action="add-photo" data-g="${id}">${icon('plus')}<br>Ajouter</button>` : ''}</div>`;
}
const photoStores = { 'prof-photos': () => profPhotos, 'lst-photos': () => editorPhotos };
const photoMax = { 'prof-photos': 10, 'lst-photos': 8 };
function redrawPhotos(id) { $('#' + id).outerHTML = String(photosBlock(id, photoStores[id](), photoMax[id])); }
action('add-photo', async (el) => { const arr = photoStores[el.dataset.g](); const urls = await pickAndUpload({ multiple: true }); arr.push(...urls.slice(0, photoMax[el.dataset.g] - arr.length)); redrawPhotos(el.dataset.g); });
action('del-photo', (el) => { photoStores[el.dataset.g]().splice(Number(el.dataset.i), 1); redrawPhotos(el.dataset.g); });
action('prof-img', async (el) => {
  const [u] = await pickAndUpload(); if (!u) return;
  if (el.dataset.k === 'logo') profLogo = u; else profCover = u;
  $(`#prof-${el.dataset.k}`).innerHTML = `<img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover">`;
});
function profileEditor(p) {
  profPhotos = [...p.photos]; profLogo = p.logo; profCover = p.cover && !p.photos.includes(p.cover) ? p.cover : (p.cover || null); profFormulas = [...p.formulas];
  const coach = p.is_coach;
  const yn = (name, label) => html`<label class="check"><input type="checkbox" name="${name}" ${p[name] ? 'checked' : ''}> ${label}</label>`;
  return html`<h2>Mon profil ${coach ? 'de coach' : 'professionnel'}</h2><p class="muted">Ces informations sont publiques sur votre fiche. Elles sont déclarées sous votre responsabilité.</p>
  <form class="form" data-form="profile">
    <fieldset><legend>Identité</legend><div class="form">
      <div class="cols"><label class="lbl"><span class="req">Nom${coach ? ' ou nom professionnel' : ' du club / de la structure'}</span><input class="input" name="name" value="${p.name}" required maxlength="120"></label>
      <label class="lbl">Type de compte<select class="input" name="type">${Object.entries(state.meta.profileTypes).map(([k, l]) => html`<option value="${k}" ${p.type === k ? 'selected' : ''}>${l}</option>`)}</select></label></div>
      <div class="row" style="gap:18px;align-items:flex-start">
        <div><div class="small" style="font-weight:700;margin-bottom:6px">${coach ? 'Photo professionnelle' : 'Logo'}</div><button type="button" class="avatar ${coach ? 'round' : ''}" id="prof-logo" data-action="prof-img" data-k="logo" style="width:90px;height:90px;border:0;cursor:pointer;overflow:hidden" aria-label="Changer l'image">${p.logo ? html`<img src="${p.logo}" alt="" style="width:100%;height:100%;object-fit:cover">` : icon('plus')}</button></div>
        <div style="flex:1;min-width:200px"><div class="small" style="font-weight:700;margin-bottom:6px">Photo de couverture</div><button type="button" id="prof-cover" data-action="prof-img" data-k="cover" style="width:100%;aspect-ratio:21/8;border-radius:14px;border:2px dashed var(--line-2);background:var(--bg);cursor:pointer;overflow:hidden" aria-label="Changer la couverture">${p.cover ? html`<img src="${p.cover}" alt="" style="width:100%;height:100%;object-fit:cover">` : 'Ajouter une couverture'}</button></div></div>
      <label class="lbl">${coach ? 'Biographie' : 'Description'}<textarea class="input" name="description" rows="6" maxlength="5000">${p.description || ''}</textarea></label>
      <div class="cols"><label class="lbl">${coach ? 'Spécialité' : 'Activité principale'}<input class="input" name="${coach ? 'specialty' : 'main_activity'}" value="${coach ? p.specialty || '' : p.main_activity || ''}" maxlength="120"></label>
      <label class="lbl">Disciplines proposées<input class="input" name="disciplines" value="${p.disciplines || ''}" maxlength="500" placeholder="Football, futsal, préparation physique…"></label></div>
      ${coach ? html`<input type="hidden" name="main_activity" value="${p.main_activity || ''}">` : html`<input type="hidden" name="specialty" value="${p.specialty || ''}">`}
      <div class="cols three"><label class="lbl">Âge minimum<input class="input" type="number" name="age_min" min="3" max="99" value="${p.age_min ?? ''}"></label><label class="lbl">Âge maximum<input class="input" type="number" name="age_max" min="3" max="99" value="${p.age_max ?? ''}"></label>
      <label class="lbl">Responsable<input class="input" name="manager_name" value="${p.manager_name || ''}" maxlength="100"></label></div>
      <div class="lbl">Niveaux<div class="pill-checks">${Object.entries(LEVEL_LABELS).map(([k, l]) => html`<label><input type="checkbox" data-multi name="levels" value="${k}" ${p.levels.includes(k) ? 'checked' : ''}><span>${l}</span></label>`)}</div></div>
    </div></fieldset>
    ${coach ? html`<fieldset><legend>Coaching</legend><div class="form">
      <label class="lbl">Diplômes et qualifications <span class="hint">(déclarés, affichés comme tels)</span><textarea class="input" name="qualifications" maxlength="1500">${p.qualifications || ''}</textarea></label>
      <label class="lbl">Expérience<textarea class="input" name="experience" maxlength="1500">${p.experience || ''}</textarea></label>
      <div class="cols"><label class="lbl">Zone d'intervention<input class="input" name="zone" value="${p.zone || ''}" maxlength="300" placeholder="Libreville nord, Akanda…"></label><label class="lbl">Durée des séances<input class="input" name="session_duration" value="${p.session_duration || ''}" maxlength="60" placeholder="1 h"></label></div>
      <div>${yn('travel', 'Déplacement possible')}${yn('home_lessons', 'Cours à domicile')}${yn('indoor', 'Cours en salle')}${yn('outdoor', 'Cours en extérieur')}${yn('individual', 'Coaching individuel')}${yn('group_lessons', 'Coaching en groupe')}</div>
      <label class="lbl">Disponibilités<textarea class="input" name="availability" maxlength="600" placeholder="Lundi au vendredi 16h–19h, samedi matin…">${p.availability || ''}</textarea></label>
      <label class="lbl">Matériel nécessaire<input class="input" name="equipment" value="${p.equipment || ''}" maxlength="800"></label>
      <label class="lbl">Liens vidéos de démonstration <span class="hint">(un par ligne : YouTube, Facebook…)</span><textarea class="input" name="media_links" rows="3">${p.media_links.join('\n')}</textarea></label>
    </div></fieldset>` : html`<fieldset><legend>Installations & fonctionnement</legend><div class="form">
      <div class="lbl">Installations<div class="pill-checks">${state.meta.facilities.map((f) => html`<label><input type="checkbox" data-multi name="facilities" value="${f}" ${p.facilities.includes(f) ? 'checked' : ''}><span>${f}</span></label>`)}</div></div>
      <label class="lbl">Équipements<textarea class="input" name="equipment" maxlength="800">${p.equipment || ''}</textarea></label>
      <label class="lbl">Horaires d'ouverture<textarea class="input" name="hours" maxlength="600">${p.hours || ''}</textarea></label>
      <label class="lbl">Conditions d'inscription<textarea class="input" name="registration_info" maxlength="1000">${p.registration_info || ''}</textarea></label>
      <input type="hidden" name="media_links" value="${p.media_links.join('\n')}">
    </div></fieldset>`}
    <fieldset><legend>Tarifs ${coach ? '& formules' : ''}</legend><div class="form">
      <label class="lbl">Informations tarifaires<textarea class="input" name="prices_info" maxlength="1000" placeholder="Cotisation, licence, réductions fratrie…">${p.prices_info || ''}</textarea></label>
      <div class="lbl">Formules <span class="hint">Prix librement fixés par vous ; G-Sports ne prélève aucun frais.</span></div><div id="formulas-wrap">${formulasBlock(profFormulas)}</div>
    </div></fieldset>
    <fieldset><legend>Localisation & contact</legend><div class="form">
      <div class="cols"><label class="lbl"><span class="req">Ville</span>${citySelect('city_id', p.city_id, { placeholder: 'Choisir', byId: true, required: true })}</label><label class="lbl">Quartier<input class="input" name="district" value="${p.district || ''}" maxlength="100"></label></div>
      <label class="lbl">Adresse<input class="input" name="address" value="${p.address || ''}" maxlength="200"></label>
      <div class="cols"><label class="lbl">Latitude <span class="hint">(facultatif)</span><input class="input" name="lat" value="${p.approx_location ? '' : p.lat ?? ''}" inputmode="decimal"></label><label class="lbl">Longitude<input class="input" name="lng" value="${p.approx_location ? '' : p.lng ?? ''}" inputmode="decimal"></label></div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="gps" style="justify-self:start">${icon('pin', 16)} Utiliser ma position actuelle (sur place)</button>
      <div class="cols"><label class="lbl">Téléphone<input class="input" name="phone" value="${p.phone || ''}"></label><label class="lbl">WhatsApp<input class="input" name="whatsapp" value="${p.whatsapp || ''}"></label></div>
      <div class="cols"><label class="lbl">Email officiel<input class="input" type="email" name="email" value="${p.email || ''}"></label><label class="lbl">Site web<input class="input" name="website" value="${p.website || ''}"></label></div>
      <div class="cols"><label class="lbl">Facebook<input class="input" name="s_facebook" value="${p.socials.facebook || ''}"></label><label class="lbl">Instagram<input class="input" name="s_instagram" value="${p.socials.instagram || ''}"></label></div>
      <div class="cols"><label class="lbl">TikTok<input class="input" name="s_tiktok" value="${p.socials.tiktok || ''}"></label><label class="lbl">YouTube<input class="input" name="s_youtube" value="${p.socials.youtube || ''}"></label></div>
    </div></fieldset>
    <fieldset><legend>Photos</legend><p class="small muted">Photos d'enfants uniquement avec l'autorisation de leurs parents. Les photos sont compressées sur votre appareil (métadonnées et position GPS retirées).</p>${photosBlock('prof-photos', profPhotos, 10)}</fieldset>
    <p class="form-error" role="alert"></p>
    <div class="row"><button class="btn btn-primary btn-lg" type="submit">Enregistrer mon profil</button><a class="btn btn-ghost" href="${p.url}">Voir mon profil public</a></div>
  </form>`;
}
action('gps', (el) => {
  const f = el.closest('form');
  if (!navigator.geolocation) return toast('Géolocalisation indisponible', 'err');
  navigator.geolocation.getCurrentPosition((pos) => { f.elements.lat.value = pos.coords.latitude.toFixed(5); f.elements.lng.value = pos.coords.longitude.toFixed(5); toast('Position ajoutée', 'ok'); }, () => toast('Position non disponible', 'err'), { enableHighAccuracy: true, timeout: 15000 });
});
form('profile', async (f, d) => {
  const socials = { facebook: d.s_facebook, instagram: d.s_instagram, tiktok: d.s_tiktok, youtube: d.s_youtube };
  await api('/api/pro/profile', { method: 'PUT', body: { ...d, socials, photos: profPhotos, logo: profLogo, cover: profCover, formulas: readFormulas() } });
  toast('Profil enregistré', 'ok'); render();
});

// ---------- Éditeur d'annonce ----------
let editorPhotos = [];
let editorFormulas = [];
addRoute('/espace-pro/annonce/:id', async (ctx) => {
  if (!requireLogin(['pro'])) return;
  const isNew = ctx.params.id === 'nouvelle';
  const [dash, tpls] = await Promise.all([api('/api/pro/dashboard'), api('/api/templates')]);
  const p = dash.profile;
  let l = isNew ? null : await api(`/api/pro/listings/${Number(ctx.params.id)}`);
  const tpl = ctx.query.modele ? tpls.items.find((t) => t.slug === ctx.query.modele) : null;
  if (isNew) {
    const cat = tpl?.activity ? state.meta.groups.flatMap((g) => g.categories).find((c) => c.name === tpl.activity) : null;
    l = { kind: ctx.query.kind || tpl?.kind || 'activite', title: tpl?.title || '', category_id: cat?.id || '', activity: tpl?.activity || '', description: tpl?.description || '', objectives: tpl?.objectives || [],
      city_id: p.city_id, age_min: tpl?.age_min ?? '', age_max: tpl?.age_max ?? '', levels: (tpl?.level || 'debutant').split(','), beginners: true, gender: 'mixte', days: [], setting: 'mixte',
      formulas: [], photos: [], duration: tpl?.duration || '', is_free: false, holidays: ['stage', 'camp'].includes(ctx.query.kind || tpl?.kind), contact: {}, places_status: '' };
  }
  editorPhotos = [...(l.photos || [])]; editorFormulas = [...(l.formulas || [])]; profFormulas = editorFormulas;
  setMeta(isNew ? 'Nouvelle annonce' : 'Modifier l\'annonce');
  const v = (x) => x ?? '';
  const kinds = Object.entries(state.meta.kinds);
  onMount(() => {
    const f = $('form[data-form="listing"]');
    const sync = () => {
      const k = f.elements.kind.value; $('#camp-block').classList.toggle('hidden', !['stage', 'camp'].includes(k));
      const free = f.elements.is_free.checked; $('#price-fields').classList.toggle('hidden', free);
    };
    f.addEventListener('change', sync); sync();
  });
  return html`<div class="container" style="padding:20px 16px 50px;max-width:920px">
    <a href="/espace-pro?tab=annonces" class="small">← Mes annonces</a>
    <h1 style="font-size:1.8rem;margin-top:8px">${isNew ? 'Publier une annonce' : 'Modifier l\'annonce'}</h1>
    ${isNew ? html`<div class="row small" style="margin-bottom:12px"><span class="muted">Partir d'un modèle :</span>${tpls.items.map((t) => html`<a class="chip" style="font-size:.8rem;padding:5px 10px" href="/espace-pro/annonce/nouvelle?modele=${t.slug}">${t.title}</a>`)}</div>` : ''}
    ${tpl ? html`<div class="notice" style="margin-bottom:12px">Modèle « ${tpl.title} » chargé : complétez <b>horaires, tarifs, dates, lieu et contact</b> avec vos vraies informations avant de publier.</div>` : ''}
    ${p.verification !== 'approved' ? html`<div class="notice warn" style="margin-bottom:12px">Votre compte est en attente de validation : l'annonce sera publiée automatiquement après validation.</div>` : ''}
    ${l.admin_note ? html`<div class="notice err" style="margin-bottom:12px">Note de la modération : ${l.admin_note}</div>` : ''}
    <form class="form" data-form="listing" data-id="${isNew ? '' : l.id}">
      <fieldset><legend>1. L'annonce</legend><div class="form">
        <label class="lbl"><span class="req">Type d'annonce</span><select class="input" name="kind">${kinds.map(([k, lab]) => html`<option value="${k}" ${l.kind === k ? 'selected' : ''}>${lab}</option>`)}</select></label>
        <label class="lbl"><span class="req">Titre</span><input class="input" name="title" value="${l.title}" required minlength="5" maxlength="120" placeholder="Ex. : Football U12 – Initiation, ou Remise en forme adultes"></label>
        <div class="cols"><label class="lbl"><span class="req">Catégorie</span>${categorySelect('category_id', l.category_id, { placeholder: 'Choisir…', byId: true, required: true, groupsSelectable: false })}</label>
        <label class="lbl">Activité précise<input class="input" name="activity" value="${v(l.activity)}" maxlength="80" placeholder="Ex. : Football à 7"></label></div>
        <label class="lbl"><span class="req">Description détaillée</span><textarea class="input" name="description" required minlength="30" maxlength="6000" rows="7">${l.description}</textarea></label>
        <label class="lbl">Objectifs / programme <span class="hint">(un par ligne)</span><textarea class="input" name="objectives" rows="5">${(l.objectives || []).join('\n')}</textarea></label>
        <label class="lbl">Ce que le participant va apprendre<textarea class="input" name="learn" maxlength="2000">${v(l.learn)}</textarea></label>
      </div></fieldset>
      <fieldset><legend>2. Public</legend><div class="form">
        <div class="cols three"><label class="lbl"><span class="req">Âge minimum</span><input class="input" type="number" name="age_min" min="3" max="99" value="${v(l.age_min)}" required></label>
        <label class="lbl"><span class="req">Âge maximum</span><span class="hint">99 = sans limite (adultes)</span><input class="input" type="number" name="age_max" min="3" max="99" value="${v(l.age_max)}" required></label>
        <label class="lbl">Public<select class="input" name="gender">${[['mixte', 'Mixte'], ['filles', 'Filles'], ['garcons', 'Garçons']].map(([k, lab]) => html`<option value="${k}" ${l.gender === k ? 'selected' : ''}>${lab}</option>`)}</select></label></div>
        <div class="lbl">Niveau requis<div class="pill-checks">${Object.entries(LEVEL_LABELS).map(([k, lab]) => html`<label><input type="checkbox" data-multi name="levels" value="${k}" ${l.levels.includes(k) ? 'checked' : ''}><span>${lab}</span></label>`)}</div></div>
        <label class="check"><input type="checkbox" name="beginners" ${l.beginners ? 'checked' : ''}> Débutants acceptés</label>
      </div></fieldset>
      <fieldset><legend>3. Lieu</legend><div class="form">
        <div class="cols"><label class="lbl"><span class="req">Ville</span>${citySelect('city_id', l.city_id, { placeholder: 'Choisir', byId: true, required: true })}</label><label class="lbl">Quartier ou zone<input class="input" name="district" value="${v(l.district)}" maxlength="100"></label></div>
        <label class="lbl">Adresse<input class="input" name="address" value="${v(l.address)}" maxlength="200"></label>
        <div class="cols three"><label class="lbl">Cadre<select class="input" name="setting">${[['mixte', 'Intérieur & extérieur'], ['indoor', 'Intérieur (indoor)'], ['outdoor', 'Extérieur (outdoor)']].map(([k, lab]) => html`<option value="${k}" ${l.setting === k ? 'selected' : ''}>${lab}</option>`)}</select></label>
        <label class="lbl">Latitude <span class="hint">(facultatif)</span><input class="input" name="lat" value="${l.approx_location ? '' : v(l.lat)}" inputmode="decimal"></label><label class="lbl">Longitude<input class="input" name="lng" value="${l.approx_location ? '' : v(l.lng)}" inputmode="decimal"></label></div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="gps" style="justify-self:start">${icon('pin', 16)} Utiliser ma position actuelle (sur place)</button>
      </div></fieldset>
      <fieldset><legend>4. Calendrier</legend><div class="form">
        <div class="lbl">Jours de pratique<div class="pill-checks">${Object.entries(DAY_LABELS).map(([k, lab]) => html`<label><input type="checkbox" data-multi name="days" value="${k}" ${l.days.includes(k) ? 'checked' : ''}><span>${lab}</span></label>`)}</div></div>
        <div class="cols"><label class="lbl">Horaires<input class="input" name="schedule" value="${v(l.schedule)}" maxlength="300" placeholder="Mercredi 15h–17h, samedi 9h–11h"></label><label class="lbl">Durée des séances<input class="input" name="session_duration" value="${v(l.session_duration)}" maxlength="60" placeholder="1 h 30"></label></div>
        <div class="cols"><label class="lbl">Date de début<input class="input" type="date" name="start_date" value="${v(l.start_date)}"></label><label class="lbl">Date de fin <span class="hint">(l'annonce expire à cette date)</span><input class="input" type="date" name="end_date" value="${v(l.end_date)}"></label></div>
        <div class="cols"><label class="lbl">Ouverture des inscriptions<input class="input" type="date" name="reg_start" value="${v(l.reg_start)}"></label><label class="lbl">Date limite d'inscription<input class="input" type="date" name="reg_end" value="${v(l.reg_end)}"></label></div>
        <div class="cols"><label class="lbl">Places disponibles <span class="hint">(si connu)</span><input class="input" type="number" name="places" min="1" value="${v(l.places)}"></label>
        <label class="lbl">État des places<select class="input" name="places_status"><option value="">Non précisé</option><option value="limitees" ${l.places_status === 'limitees' ? 'selected' : ''}>Places limitées (confirmé)</option><option value="complet" ${l.places_status === 'complet' ? 'selected' : ''}>Complet (confirmé)</option></select></label></div>
        <label class="check"><input type="checkbox" name="holidays" ${l.holidays ? 'checked' : ''}> Activité proposée pendant les vacances scolaires</label>
      </div></fieldset>
      <fieldset><legend>5. Tarifs</legend><div class="form">
        <label class="check"><input type="checkbox" name="is_free" ${l.is_free ? 'checked' : ''}> Activité gratuite</label>
        <div id="price-fields" class="form"><div class="cols"><label class="lbl">Tarif (FCFA)<input class="input" type="number" name="price_amount" min="0" value="${v(l.price_amount)}" inputmode="numeric"></label>
          <label class="lbl">Par<select class="input" name="price_period">${[['', '—'], ['seance', 'séance'], ['semaine', 'semaine'], ['mois', 'mois'], ['trimestre', 'trimestre'], ['annee', 'an'], ['stage', 'stage / camp'], ['total', 'total']].map(([k, lab]) => html`<option value="${k}" ${l.price_period === k ? 'selected' : ''}>${lab}</option>`)}</select></label></div></div>
        <label class="lbl">Précisions sur le tarif<input class="input" name="price_text" value="${v(l.price_text)}" maxlength="200" placeholder="Réduction fratrie, licence incluse…"></label>
        <label class="lbl">Frais supplémentaires éventuels<input class="input" name="extra_fees" value="${v(l.extra_fees)}" maxlength="500" placeholder="Licence, tenue, assurance…"></label>
        <div class="lbl">Formules <span class="hint">(facultatif)</span></div><div id="formulas-wrap">${formulasBlock(editorFormulas)}</div>
      </div></fieldset>
      <fieldset id="camp-block"><legend>6. Stage / camp</legend><div class="form">
        <div class="cols three"><label class="lbl">Heure d'arrivée<input class="input" name="arrival_time" value="${v(l.arrival_time)}" maxlength="20" placeholder="8h00"></label><label class="lbl">Heure de départ<input class="input" name="departure_time" value="${v(l.departure_time)}" maxlength="20" placeholder="16h00"></label><label class="lbl">Durée<input class="input" name="duration" value="${v(l.duration)}" maxlength="60" placeholder="5 jours"></label></div>
        <label class="lbl">Programme<textarea class="input" name="program" maxlength="3000">${v(l.program)}</textarea></label>
        <div class="cols"><label class="lbl">Inclus dans le prix<textarea class="input" name="included" maxlength="1000">${v(l.included)}</textarea></label><label class="lbl">Non inclus<textarea class="input" name="not_included" maxlength="1000">${v(l.not_included)}</textarea></label></div>
        <div class="cols three"><label class="lbl">Repas<input class="input" name="meals" value="${v(l.meals)}" maxlength="300"></label><label class="lbl">Hébergement<input class="input" name="lodging" value="${v(l.lodging)}" maxlength="300"></label><label class="lbl">Transport<input class="input" name="transport" value="${v(l.transport)}" maxlength="300"></label></div>
      </div></fieldset>
      <fieldset><legend>7. Informations pratiques</legend><div class="form">
        <div class="cols"><label class="lbl">Matériel à prévoir<textarea class="input" name="equipment" maxlength="800">${v(l.equipment)}</textarea></label><label class="lbl">Tenue recommandée<textarea class="input" name="outfit" maxlength="300">${v(l.outfit)}</textarea></label></div>
        <label class="lbl">Conditions de participation<textarea class="input" name="conditions" maxlength="1000" placeholder="Certificat médical, autorisation parentale…">${v(l.conditions)}</textarea></label>
        <div class="cols"><label class="lbl">Encadrement<textarea class="input" name="supervision" maxlength="1000" placeholder="Nombre d'encadrants, qualifications déclarées…">${v(l.supervision)}</textarea></label><label class="lbl">Informations de sécurité<textarea class="input" name="safety" maxlength="1000" placeholder="Premiers secours, maître-nageur, assurance…">${v(l.safety)}</textarea></label></div>
        <label class="lbl">Modalités d'inscription<textarea class="input" name="registration_info" maxlength="1500">${v(l.registration_info)}</textarea></label>
      </div></fieldset>
      <fieldset><legend>8. Photos</legend><p class="small muted">La première photo sert de couverture. Les photos sont compressées sur votre appareil (métadonnées et position GPS retirées).</p>
        ${photosBlock('lst-photos', editorPhotos, 8)}
        <label class="check" style="margin-top:10px"><input type="checkbox" name="photo_consent" ${l.photo_consent ? 'checked' : ''}> Je dispose des droits et autorisations nécessaires pour ces photos (dont l'accord des parents si des enfants sont reconnaissables).</label></fieldset>
      <fieldset><legend>9. Contact pour cette annonce</legend><p class="small muted">Laissez vide pour utiliser les coordonnées de votre profil (${p.phone || 'non renseigné'}).</p><div class="form">
        <div class="cols three"><label class="lbl">Téléphone<input class="input" name="contact_phone" value="${v(l.contact?.phone && l.contact.phone !== p.phone ? l.contact.phone : '')}"></label><label class="lbl">WhatsApp<input class="input" name="contact_whatsapp" value="${v(l.contact?.whatsapp && l.contact.whatsapp !== p.whatsapp ? l.contact.whatsapp : '')}"></label><label class="lbl">Email<input class="input" type="email" name="contact_email" value="${v(l.contact?.email)}"></label></div></div></fieldset>
      <p class="form-error" role="alert"></p>
      <div class="row" style="position:sticky;bottom:70px;background:var(--bg);padding:10px 0;z-index:5"><button class="btn btn-primary btn-lg" type="submit" name="publish">${isNew || ['draft', 'expired'].includes(l.status) ? 'Publier l\'annonce' : 'Enregistrer les modifications'}</button>
        ${isNew || l.status === 'draft' ? html`<button class="btn btn-ghost" type="button" data-action="save-draft">Enregistrer en brouillon</button>` : ''}
        ${!isNew ? html`<a class="btn btn-ghost" href="${l.url}">Aperçu</a>` : ''}</div>
    </form></div>`;
});
async function saveListing(f, draft) {
  const d = formData(f);
  const body = { ...d, objectives: d.objectives, photos: editorPhotos, formulas: readFormulas(), draft };
  const id = f.dataset.id;
  const r = id ? await api(`/api/pro/listings/${id}`, { method: 'PUT', body }) : await api('/api/pro/listings', { method: 'POST', body });
  toast(draft ? 'Brouillon enregistré' : r.status === 'published' ? 'Annonce publiée !' : r.status === 'pending' ? 'Annonce enregistrée : publication après validation de votre compte' : 'Annonce enregistrée', 'ok');
  navigate('/espace-pro?tab=annonces');
}
form('listing', (f) => saveListing(f, false));
action('save-draft', async (el) => {
  const f = el.closest('form'); const err = f.querySelector('.form-error'); err.textContent = '';
  try { await saveListing(f, true); } catch (e) { err.textContent = e.message; }
});
