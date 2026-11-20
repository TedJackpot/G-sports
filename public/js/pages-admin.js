// G-Sports Gabon – panneau d'administration
import {
  html, raw, $, $$, api, state, addRoute, navigate, setMeta, action, form, toast, openModal, closeModal, confirmDialog, icon,
  fmtDate, fmtDateTime, fmtAge, requireLogin, render, pickAndUpload, refreshMe, renderLayout,
} from './core.js';

const TABS = [
  ['stats', 'Statistiques', 'grid'], ['pros', 'Professionnels', 'shield'], ['annonces', 'Annonces', 'list'], ['signalements', 'Signalements', 'flag'],
  ['photos', 'Photos', 'grid'], ['categories', 'Catégories', 'list'], ['villes', 'Provinces & villes', 'map'], ['comptes', 'Comptes', 'user'],
  ['contenus', 'Contenus & accueil', 'home'], ['messages', 'Messages', 'mail'], ['notifications', 'Notifications', 'bell'],
];
const LST = { published: ['Publiée', 'ok'], pending: ['En attente', 'pending'], draft: ['Brouillon', 'soft'], suspended: ['Suspendue', 'bad'], expired: ['Expirée', 'bad'] };
const VER = { pending: ['À valider', 'pending'], approved: ['Validé', 'ok'], rejected: ['Refusé', 'bad'] };

addRoute('/admin', async (ctx) => {
  if (!requireLogin(['admin'])) return;
  setMeta('Administration');
  const tab = ctx.query.tab || 'stats';
  const s = await api('/api/admin/stats');
  const counts = { pros: s.profiles.pending, annonces: s.listings.pending || 0, signalements: s.reports, messages: s.messages, notifications: state.unread };
  let body = '';
  if (tab === 'stats') {
    const max = Math.max(1, ...s.byCity.map((x) => x.n));
    const maxG = Math.max(1, ...s.byGroup.map((x) => x.n));
    body = html`<h2>Statistiques globales</h2>
      <div class="kpis"><div class="kpi accent"><b>${s.listings.published || 0}</b><span>Annonces publiées</span></div><div class="kpi"><b>${s.listings.pending || 0}</b><span>Annonces en attente</span></div><div class="kpi"><b>${s.profiles.approved}</b><span>Pros validés</span></div><div class="kpi"><b>${s.profiles.pending}</b><span>Pros à valider</span></div></div>
      <div class="kpis" style="margin-top:12px"><div class="kpi"><b>${s.users.parents}</b><span>Comptes parents</span></div><div class="kpi"><b>${s.requests}</b><span>Demandes de contact</span></div><div class="kpi"><b>${s.views}</b><span>Vues d'annonces</span></div><div class="kpi"><b>${s.favorites}</b><span>Favoris</span></div></div>
      <div class="kpis" style="margin-top:12px"><div class="kpi"><b>${s.reports}</b><span>Signalements ouverts</span></div><div class="kpi"><b>${s.listings.expired || 0}</b><span>Annonces expirées</span></div><div class="kpi"><b>${s.listings.suspended || 0}</b><span>Suspendues</span></div><div class="kpi"><b>${s.messages}</b><span>Messages non traités</span></div></div>
      ${s.demo ? html`<div class="notice demo" style="margin-top:16px"><b>${s.demo} élément(s) d'exemple fictif</b> sont en ligne. Supprimez-les dès l'arrivée des premières vraies annonces. <button class="btn btn-danger btn-sm" data-action="purge-demo" style="margin-left:8px">Supprimer les exemples</button></div>` : ''}
      <div class="grid two" style="margin-top:20px"><div class="card pad"><h3>Annonces publiées par ville</h3>${s.byCity.length ? html`<div class="bar-chart">${s.byCity.map((x) => html`<div class="b"><span>${x.name}</span><i style="width:${Math.round((x.n / max) * 100)}%"></i><b>${x.n}</b></div>`)}</div>` : html`<p class="muted">Aucune donnée.</p>`}</div>
      <div class="card pad"><h3>Par famille d'activités</h3>${s.byGroup.length ? html`<div class="bar-chart">${s.byGroup.map((x) => html`<div class="b"><span>${x.name}</span><i style="width:${Math.round((x.n / maxG) * 100)}%;background:var(--sun)"></i><b>${x.n}</b></div>`)}</div>` : html`<p class="muted">Aucune donnée.</p>`}</div></div>`;
  } else if (tab === 'pros') {
    const v = ctx.query.v ?? 'pending';
    const r = await api('/api/admin/profiles?verification=' + v);
    body = html`<h2>Professionnels</h2><p class="muted">Vérifiez les informations déclarées (existence de la structure, coordonnées, cohérence). La validation n'est pas une certification de sécurité ou de compétence.</p>
      <div class="chips" style="margin-bottom:14px">${[['pending', 'À valider'], ['approved', 'Validés'], ['rejected', 'Refusés'], ['', 'Tous']].map(([k, l]) => html`<a class="chip ${v === k ? 'on' : ''}" href="/admin?tab=pros&v=${k}">${l}</a>`)}</div>
      ${r.items.length ? html`<div class="grid" style="gap:10px">${r.items.map((p) => html`<div class="card pad"><div class="row between"><div class="row">${p.logo ? html`<img class="avatar" src="${p.logo}" alt="" style="width:52px;height:52px">` : html`<div class="avatar" style="width:52px;height:52px;font-size:1rem">${p.name[0]}</div>`}
        <div><b>${p.name}</b> ${p.is_demo ? html`<span class="badge demo">Exemple</span>` : ''}<div class="small muted">${p.type_label} · ${p.city?.name || '—'} · inscrit le ${fmtDate(p.created_at)}</div></div></div><span class="badge ${VER[p.verification][1]}">${VER[p.verification][0]}</span></div>
        <div class="info-list small" style="margin-top:10px"><div><span class="k">Compte</span><span>${p.user_email} ${p.user_status === 'suspended' ? html`<span class="badge bad">suspendu</span>` : ''}</span></div><div><span class="k">Responsable</span><span>${p.manager_name || '—'}</span></div>
          <div><span class="k">Téléphone / WhatsApp</span><span>${p.phone || '—'} / ${p.whatsapp || '—'}</span></div><div><span class="k">Activité</span><span>${p.main_activity || p.specialty || '—'}</span></div>
          <div><span class="k">Adresse</span><span>${p.address || '—'} ${p.district || ''}</span></div>${p.qualifications ? html`<div><span class="k">Qualifications déclarées</span><span class="prose">${p.qualifications}</span></div>` : ''}
          <div><span class="k">Description</span><span class="prose">${(p.description || '—').slice(0, 600)}</span></div>${p.admin_note ? html`<div><span class="k">Note</span><span>${p.admin_note}</span></div>` : ''}</div>
        <div class="row" style="margin-top:10px"><a class="btn btn-ghost btn-sm" href="${p.url}">Voir la fiche</a>
          ${p.verification !== 'approved' ? html`<button class="btn btn-turq btn-sm" data-action="verify" data-id="${p.id}" data-v="approved">Valider</button>` : ''}
          ${p.verification !== 'rejected' ? html`<button class="btn btn-ghost btn-sm" data-action="verify" data-id="${p.id}" data-v="rejected">Refuser</button>` : ''}
          ${p.verification !== 'pending' ? html`<button class="btn btn-ghost btn-sm" data-action="verify" data-id="${p.id}" data-v="pending">Remettre en attente</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-action="user-status" data-id="${p.user_id}" data-s="${p.user_status === 'suspended' ? 'active' : 'suspended'}">${p.user_status === 'suspended' ? 'Réactiver le compte' : 'Suspendre le compte'}</button></div></div>`)}</div>`
        : html`<div class="empty"><p>Aucun professionnel dans cette catégorie.</p></div>`}`;
  } else if (tab === 'annonces') {
    const st = ctx.query.s ?? 'pending';
    const r = await api('/api/admin/listings?' + new URLSearchParams({ status: st, q: ctx.query.q || '' }));
    body = html`<h2>Annonces</h2>
      <div class="chips" style="margin-bottom:10px">${[['pending', 'En attente'], ['published', 'Publiées'], ['suspended', 'Suspendues'], ['expired', 'Expirées'], ['draft', 'Brouillons'], ['', 'Toutes']].map(([k, l]) => html`<a class="chip ${st === k ? 'on' : ''}" href="/admin?tab=annonces&s=${k}">${l}</a>`)}</div>
      <form class="row" data-form="admin-search" style="margin-bottom:14px"><input class="input" name="q" value="${ctx.query.q || ''}" placeholder="Rechercher une annonce" style="max-width:320px"><input type="hidden" name="s" value="${st}"><button class="btn btn-ghost btn-sm" type="submit">Rechercher</button></form>
      ${r.items.length ? html`<div class="grid" style="gap:10px">${r.items.map((l) => html`<div class="item-row">${l.cover ? html`<img class="thumb" src="${l.cover}" alt="">` : ''}
        <div class="grow"><span class="badge ${LST[l.status][1]}">${LST[l.status][0]}</span> ${l.is_demo ? html`<span class="badge demo">Exemple</span>` : ''} ${l.org_verification !== 'approved' ? html`<span class="badge pending">Pro non validé</span>` : ''}
          <div style="font-weight:700;margin-top:4px"><a href="${l.url}">${l.title}</a></div><div class="small muted">${l.org.name} · ${l.kind_label} · ${l.city.name} · ${fmtAge(l.age_min, l.age_max)} · ${l.views} vues${l.expires_at ? ' · expire le ' + fmtDate(l.expires_at) : ''}</div>
          ${l.admin_note ? html`<div class="small" style="color:var(--danger)">Note : ${l.admin_note}</div>` : ''}</div>
        <div class="acts">${l.status !== 'published' ? html`<button class="btn btn-turq btn-sm" data-action="mod-listing" data-id="${l.id}" data-s="published">Publier</button>` : ''}
          ${l.status !== 'suspended' ? html`<button class="btn btn-ghost btn-sm" data-action="mod-listing" data-id="${l.id}" data-s="suspended">Suspendre</button>` : ''}
          ${l.status === 'published' ? html`<button class="btn btn-ghost btn-sm" data-action="mod-listing" data-id="${l.id}" data-s="expired">Marquer expirée</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-action="del-listing" data-id="${l.id}">Supprimer</button></div></div>`)}</div>` : html`<div class="empty"><p>Aucune annonce.</p></div>`}`;
  } else if (tab === 'signalements') {
    const r = await api('/api/admin/reports');
    body = html`<h2>Signalements</h2>${r.items.length ? html`<div class="grid" style="gap:10px">${r.items.map((x) => html`<div class="card pad"><div class="row between"><div><span class="badge ${x.status === 'ouvert' ? 'complet' : 'soft'}">${x.status}</span> <b>${x.reason}</b></div><span class="small muted">${fmtDateTime(x.created_at)}</span></div>
      <p style="margin:8px 0">${x.target_type === 'profile' ? 'Profil' : 'Annonce'} : ${x.target_url ? html`<a href="${x.target_url}">${x.target?.title}</a>` : html`<i>contenu supprimé</i>`}</p>
      ${x.details ? html`<p class="small prose">${x.details}</p>` : ''}${x.reporter_email ? html`<p class="small muted">Signalé par : ${x.reporter_email}</p>` : ''}${x.admin_note ? html`<p class="small">Note : ${x.admin_note}</p>` : ''}
      <div class="row">${x.target && x.target_type === 'listing' ? html`<button class="btn btn-ghost btn-sm" data-action="mod-listing" data-id="${x.target_id}" data-s="suspended">Suspendre l'annonce</button>` : ''}
        ${x.status === 'ouvert' ? html`<button class="btn btn-turq btn-sm" data-action="report-status" data-id="${x.id}" data-s="traite">Marquer traité</button><button class="btn btn-ghost btn-sm" data-action="report-status" data-id="${x.id}" data-s="rejete">Rejeter</button>` : html`<button class="btn btn-ghost btn-sm" data-action="report-status" data-id="${x.id}" data-s="ouvert">Rouvrir</button>`}</div></div>`)}</div>`
      : html`<div class="empty"><p>Aucun signalement.</p></div>`}`;
  } else if (tab === 'photos') {
    const r = await api('/api/admin/listings?status=');
    const pr = await api('/api/admin/profiles?verification=');
    const items = [...r.items.flatMap((l) => l.photos.map((u) => ({ u, type: 'listing', id: l.id, label: l.title, link: l.url }))), ...pr.items.flatMap((p) => [...p.photos, ...(p.logo ? [p.logo] : [])].map((u) => ({ u, type: 'profile', id: p.id, label: p.name, link: p.url })))];
    body = html`<h2>Photos publiées</h2><p class="muted">Retirez toute photo inappropriée ou publiée sans autorisation (notamment des enfants identifiables).</p>
      ${items.length ? html`<div class="photo-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${items.map((p) => html`<div><div class="ph"><img src="${p.u}" alt="" loading="lazy"><button data-action="del-admin-photo" data-t="${p.type}" data-id="${p.id}" data-u="${p.u}" aria-label="Retirer">✕</button></div><a class="small" href="${p.link}">${p.label.slice(0, 40)}</a></div>`)}</div>` : html`<div class="empty"><p>Aucune photo.</p></div>`}`;
  } else if (tab === 'categories') {
    const r = await api('/api/admin/categories');
    body = html`<h2>Catégories d'activités</h2>
      ${r.groups.map((g) => html`<div class="card pad" style="margin-bottom:12px"><form class="row" data-form="group" data-id="${g.id}">
        <input class="input" name="icon" value="${g.icon}" style="width:64px" aria-label="Icône"><input class="input" name="name" value="${g.name}" style="flex:1;min-width:180px" aria-label="Nom">
        <input class="input" name="color" type="color" value="${g.color}" style="width:56px;padding:4px" aria-label="Couleur"><select class="input" name="kind" style="width:auto">${['sport', 'loisir', 'educatif'].map((k) => html`<option ${g.kind === k ? 'selected' : ''}>${k}</option>`)}</select>
        <input class="input" type="number" name="sort" value="${g.sort}" style="width:72px" aria-label="Ordre"><label class="check"><input type="checkbox" name="active" ${g.active ? 'checked' : ''}> Actif</label><button class="btn btn-ghost btn-sm" type="submit">Enregistrer</button></form>
        <div class="chips" style="margin-top:10px">${r.items.filter((c) => c.group_id === g.id).map((c) => html`<span class="chip ${c.active ? '' : 'muted'}" style="${c.active ? '' : 'opacity:.5'}">${c.name} <small class="muted">(${c.n})</small>
          <button class="link-btn" data-action="edit-cat" data-id="${c.id}" data-n="${c.name}" data-a="${c.active}" aria-label="Modifier">✎</button>${c.n ? '' : html`<button class="link-btn" data-action="del-cat" data-id="${c.id}" aria-label="Supprimer" style="color:var(--danger)">✕</button>`}</span>`)}</div>
        <form class="row" data-form="cat-add" style="margin-top:10px"><input type="hidden" name="group_id" value="${g.id}"><input class="input" name="name" placeholder="Nouvelle activité" style="max-width:260px" required><button class="btn btn-ghost btn-sm" type="submit">${icon('plus', 16)} Ajouter</button></form></div>`)}
      <form class="card pad row" data-form="group-add"><input class="input" name="icon" placeholder="🎯" style="width:64px"><input class="input" name="name" placeholder="Nouvelle famille d'activités" required style="flex:1"><select class="input" name="kind" style="width:auto"><option>sport</option><option>loisir</option><option>educatif</option></select><button class="btn btn-navy btn-sm" type="submit">Créer</button></form>`;
  } else if (tab === 'villes') {
    const r = await api('/api/admin/cities');
    body = html`<h2>Provinces & villes</h2><p class="muted">Ajoutez les communes et localités manquantes. Les coordonnées servent à la carte (facultatives).</p>
      <form class="card pad form" data-form="city-add" style="margin-bottom:16px"><h3>Ajouter une ville ou localité</h3><div class="cols three" style="display:grid;gap:10px">
        <input class="input" name="name" placeholder="Nom" required><select class="input" name="province_id" required><option value="">Province</option>${r.provinces.map((p) => html`<option value="${p.id}">${p.name}</option>`)}</select>
        <label class="check"><input type="checkbox" name="featured"> Ville principale</label><input class="input" name="lat" placeholder="Latitude (ex. 0.39)"><input class="input" name="lng" placeholder="Longitude (ex. 9.45)"></div><p class="form-error"></p><button class="btn btn-navy btn-sm" type="submit">Ajouter</button></form>
      ${r.provinces.map((p) => html`<details class="card pad" style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:800">${p.name} <span class="muted small">(${r.items.filter((c) => c.province_id === p.id).length} villes · chef-lieu : ${p.capital || '—'})</span></summary>
        <form class="row" data-form="province" data-id="${p.id}" style="margin:10px 0"><input class="input" name="name" value="${p.name}" style="max-width:220px"><input class="input" name="capital" value="${p.capital || ''}" style="max-width:220px" placeholder="Chef-lieu"><button class="btn btn-ghost btn-sm">Enregistrer</button></form>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Ville</th><th>Lat.</th><th>Long.</th><th>Principale</th><th>Active</th><th></th></tr></thead><tbody>
        ${r.items.filter((c) => c.province_id === p.id).map((c) => html`<tr><td colspan="6"><form class="row" data-form="city" data-id="${c.id}" style="gap:6px"><input type="hidden" name="province_id" value="${c.province_id}">
          <input class="input" name="name" value="${c.name}" style="max-width:180px;padding:6px 8px"><input class="input" name="lat" value="${c.lat ?? ''}" style="width:90px;padding:6px 8px" aria-label="Latitude"><input class="input" name="lng" value="${c.lng ?? ''}" style="width:90px;padding:6px 8px" aria-label="Longitude">
          <label class="check"><input type="checkbox" name="featured" ${c.featured ? 'checked' : ''}> Principale</label><label class="check"><input type="checkbox" name="active" ${c.active ? 'checked' : ''}> Active</label><button class="btn btn-ghost btn-sm">OK</button></form></td></tr>`)}
        </tbody></table></div></details>`)}`;
  } else if (tab === 'comptes') {
    const r = await api('/api/admin/users?' + new URLSearchParams({ q: ctx.query.q || '' }));
    body = html`<h2>Comptes</h2><form class="row" data-form="user-search" style="margin-bottom:12px"><input class="input" name="q" value="${ctx.query.q || ''}" placeholder="Email ou nom" style="max-width:300px"><button class="btn btn-ghost btn-sm">Rechercher</button></form>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Inscrit</th><th>Dernière connexion</th><th>Statut</th><th></th></tr></thead><tbody>
      ${r.items.map((u) => html`<tr><td>${u.name}${u.role === 'parent' && u.children ? html` <span class="small muted">(${u.children} enfant${u.children > 1 ? 's' : ''})</span>` : ''}</td><td>${u.email}</td><td>${u.role}</td><td>${fmtDate(u.created_at)}</td><td>${u.last_login ? fmtDate(u.last_login) : '—'}</td>
        <td><span class="badge ${u.status === 'active' ? 'ok' : 'bad'}">${u.status === 'active' ? 'Actif' : 'Suspendu'}</span></td>
        <td>${u.id !== state.me.id ? html`<button class="btn btn-ghost btn-sm" data-action="user-status" data-id="${u.id}" data-s="${u.status === 'active' ? 'suspended' : 'active'}">${u.status === 'active' ? 'Suspendre' : 'Réactiver'}</button>` : ''}</td></tr>`)}</tbody></table></div>
      <p class="small muted" style="margin-top:10px">Les profils enfants ne sont jamais affichés ici : seul leur nombre est visible.</p>`;
  } else if (tab === 'contenus') {
    const h = state.meta.home || {};
    const posts = await api('/api/admin/posts');
    const photos = ['basket-joie', 'basket-ciel', 'basket-filles', 'football-duel', 'football-jonglage', 'multisport', 'natation-groupe', 'camp-nature', 'exploration-nature', 'basket-ecole'];
    body = html`<h2>Contenus de la page d'accueil</h2>
      <form class="card pad form" data-form="home-settings"><div class="cols"><label class="lbl">Titre principal<input class="input" name="heroTitle" value="${h.heroTitle || ''}" maxlength="140" required></label><label class="lbl">Sous-titre<input class="input" name="heroSubtitle" value="${h.heroSubtitle || ''}" maxlength="240"></label></div>
        <div class="cols"><label class="lbl">Slogan<input class="input" name="slogan" value="${h.slogan || ''}" maxlength="140"></label><label class="lbl">Image du hero<select class="input" name="heroImage">${photos.map((p) => html`<option ${h.heroImage === p ? 'selected' : ''}>${p}</option>`)}</select></label></div>
        <label class="lbl">Bandeau d'information <span class="hint">(facultatif, affiché sous le hero)</span><input class="input" name="banner" value="${h.banner || ''}" maxlength="300"></label>
        <div class="lbl">Vacances scolaires <span class="hint">Saisissez uniquement les dates officielles (affichées dans le calendrier).</span></div>
        <div id="hol-rows" class="grid" style="gap:8px">${[...(h.holidays || []), { name: '', start: '', end: '' }].map((x) => html`<div class="row hol-row" style="gap:6px"><input class="input" data-h="name" value="${x.name}" placeholder="Nom (ex. Vacances de Noël)" style="flex:1;min-width:160px"><input class="input" type="date" data-h="start" value="${x.start}" style="width:auto"><input class="input" type="date" data-h="end" value="${x.end}" style="width:auto"></div>`)}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-action="add-hol" style="justify-self:start">${icon('plus', 16)} Ajouter une période</button>
        <p class="form-error"></p><button class="btn btn-navy" type="submit">Enregistrer</button></form>
      <h2 style="margin-top:24px">Annonces éditoriales</h2><p class="muted">Messages d'information publiés par G-Sports sur l'accueil (ex. : lancement dans une nouvelle ville). Jamais des offres d'activités.</p>
      <div class="grid" style="gap:8px">${posts.items.map((p) => html`<div class="item-row"><div class="grow"><b>${p.title}</b><div class="small muted">${fmtDate(p.created_at)} · ${p.published ? 'publié' : 'masqué'}</div><div class="small">${p.body.slice(0, 160)}</div></div><button class="btn btn-ghost btn-sm" data-action="del-post" data-id="${p.id}">Supprimer</button></div>`)}</div>
      <form class="card pad form" data-form="post" style="margin-top:12px"><label class="lbl">Titre<input class="input" name="title" required maxlength="140"></label><label class="lbl">Texte<textarea class="input" name="body" required maxlength="4000"></textarea></label><label class="lbl">Lien (facultatif)<input class="input" name="link" placeholder="/activites/oyem"></label><p class="form-error"></p><button class="btn btn-navy btn-sm" type="submit">Publier</button></form>
      <h2 style="margin-top:24px">Notification d'information</h2>
      <form class="card pad form" data-form="broadcast"><div class="cols"><label class="lbl">Destinataires<select class="input" name="audience"><option value="all">Tous les comptes</option><option value="parent">Parents</option><option value="pro">Professionnels</option></select></label><label class="lbl">Titre<input class="input" name="title" required maxlength="120"></label></div>
        <label class="lbl">Message<textarea class="input" name="body" maxlength="1000"></textarea></label><p class="small muted">À utiliser avec parcimonie : aucune notification intrusive.</p><p class="form-error"></p><button class="btn btn-navy btn-sm" type="submit">Envoyer</button></form>`;
  } else if (tab === 'messages') {
    const r = await api('/api/admin/messages');
    body = html`<h2>Messages reçus</h2>${r.items.length ? html`<div class="grid" style="gap:10px">${r.items.map((m) => html`<div class="card pad"><div class="row between"><b>${m.subject || '(sans objet)'}</b><span class="small muted">${fmtDateTime(m.created_at)}</span></div><p class="small muted">${m.name} · <a href="mailto:${m.email}" data-external>${m.email}</a></p><p class="prose">${m.message}</p>
      ${m.status === 'nouveau' ? html`<button class="btn btn-ghost btn-sm" data-action="msg-done" data-id="${m.id}">Marquer traité</button>` : html`<span class="badge soft">Traité</span>`}</div>`)}</div>` : html`<div class="empty"><p>Aucun message.</p></div>`}`;
  } else if (tab === 'notifications') {
    const r = await api('/api/me/notifications');
    if (r.items.some((n) => !n.read_at)) api('/api/me/notifications/read', { method: 'POST' }).then(() => { state.unread = 0; renderLayout(); }).catch(() => {});
    body = html`<h2>Notifications</h2>${r.items.map((n) => html`<div class="notif ${n.read_at ? '' : 'unread'}" style="margin-bottom:8px"><div style="flex:1"><b>${n.title}</b><div class="small">${n.body || ''}</div><div class="small muted">${fmtDateTime(n.created_at)}</div></div>${n.link ? html`<a class="btn btn-ghost btn-sm" href="${n.link}">Voir</a>` : ''}</div>`)}`;
  }
  return html`<div class="container dash"><nav class="side-tabs" aria-label="Administration">${TABS.map(([k, l, ic]) => html`<a href="/admin?tab=${k}" class="${tab === k ? 'on' : ''}">${icon(ic, 18)} ${l}${counts[k] ? html` <span class="n">${counts[k]}</span>` : ''}</a>`)}</nav><div class="fade-in">${body}</div></div>`;
});

const run = (fn, msg) => async (...a) => { try { await fn(...a); if (msg) toast(msg, 'ok'); render(); } catch (e) { toast(e.message, 'err'); } };
action('verify', (el) => {
  if (el.dataset.v === 'approved') return run(() => api(`/api/admin/profiles/${el.dataset.id}`, { method: 'PUT', body: { verification: 'approved' } }), 'Professionnel validé')();
  openModal(html`<h3>${el.dataset.v === 'rejected' ? 'Refuser ce professionnel' : 'Remettre en attente'}</h3><form class="form" data-form="verify-note" data-id="${el.dataset.id}" data-v="${el.dataset.v}">
    <label class="lbl">Motif (transmis au professionnel)<textarea class="input" name="admin_note" maxlength="1000"></textarea></label><button class="btn btn-navy" type="submit">Confirmer</button></form>`);
});
form('verify-note', async (f, d) => { await api(`/api/admin/profiles/${f.dataset.id}`, { method: 'PUT', body: { verification: f.dataset.v, admin_note: d.admin_note } }); closeModal(); toast('Statut mis à jour', 'ok'); render(); });
action('mod-listing', (el) => {
  if (el.dataset.s === 'published') return run(() => api(`/api/admin/listings/${el.dataset.id}`, { method: 'PUT', body: { status: 'published' } }), 'Annonce publiée')();
  openModal(html`<h3>${el.dataset.s === 'suspended' ? 'Suspendre l\'annonce' : 'Marquer comme expirée'}</h3><form class="form" data-form="mod-note" data-id="${el.dataset.id}" data-s="${el.dataset.s}">
    <label class="lbl">Motif (transmis au professionnel)<textarea class="input" name="admin_note" maxlength="1000"></textarea></label><button class="btn btn-navy" type="submit">Confirmer</button></form>`);
});
form('mod-note', async (f, d) => { await api(`/api/admin/listings/${f.dataset.id}`, { method: 'PUT', body: { status: f.dataset.s, admin_note: d.admin_note } }); closeModal(); toast('Annonce mise à jour', 'ok'); render(); });
action('del-listing', async (el) => { if (await confirmDialog('Supprimer définitivement cette annonce ?', { ok: 'Supprimer', danger: true })) run(() => api(`/api/admin/listings/${el.dataset.id}`, { method: 'DELETE' }), 'Annonce supprimée')(); });
action('report-status', (el) => run(() => api(`/api/admin/reports/${el.dataset.id}`, { method: 'PUT', body: { status: el.dataset.s } }), 'Signalement mis à jour')());
action('user-status', async (el) => { if (el.dataset.s === 'active' || await confirmDialog('Suspendre ce compte ? La personne sera déconnectée.', { ok: 'Suspendre', danger: true })) run(() => api(`/api/admin/users/${el.dataset.id}`, { method: 'PUT', body: { status: el.dataset.s } }), 'Compte mis à jour')(); });
action('del-admin-photo', async (el) => { if (await confirmDialog('Retirer cette photo ?', { ok: 'Retirer', danger: true })) run(() => api('/api/admin/photo', { method: 'DELETE', body: { target_type: el.dataset.t, target_id: el.dataset.id, url: el.dataset.u } }), 'Photo retirée')(); });
action('purge-demo', async () => { if (await confirmDialog('Supprimer tous les exemples fictifs ?', { ok: 'Supprimer', danger: true })) run(async () => { const r = await api('/api/admin/demo', { method: 'DELETE' }); toast(`${r.removed} élément(s) supprimé(s)`, 'ok'); })(); });
form('group', async (f, d) => { await api(`/api/admin/groups/${f.dataset.id}`, { method: 'PUT', body: d }); toast('Enregistré', 'ok'); await reloadMeta(); });
form('group-add', async (f, d) => { await api('/api/admin/groups', { method: 'POST', body: d }); await reloadMeta(); render(); });
form('cat-add', async (f, d) => { await api('/api/admin/categories', { method: 'POST', body: d }); await reloadMeta(); render(); });
action('edit-cat', (el) => openModal(html`<h3>Modifier l'activité</h3><form class="form" data-form="cat-edit" data-id="${el.dataset.id}"><input class="input" name="name" value="${el.dataset.n}" required><label class="check"><input type="checkbox" name="active" ${el.dataset.a === '1' ? 'checked' : ''}> Active</label><button class="btn btn-navy" type="submit">Enregistrer</button></form>`));
form('cat-edit', async (f, d) => { await api(`/api/admin/categories/${f.dataset.id}`, { method: 'PUT', body: d }); closeModal(); await reloadMeta(); render(); });
action('del-cat', async (el) => { if (await confirmDialog('Supprimer cette activité ?', { ok: 'Supprimer', danger: true })) run(async () => { await api(`/api/admin/categories/${el.dataset.id}`, { method: 'DELETE' }); await reloadMeta(); })(); });
form('city-add', async (f, d) => { await api('/api/admin/cities', { method: 'POST', body: d }); toast('Ville ajoutée', 'ok'); await reloadMeta(); render(); });
form('city', async (f, d) => { await api(`/api/admin/cities/${f.dataset.id}`, { method: 'PUT', body: d }); toast('Ville enregistrée', 'ok'); await reloadMeta(); });
form('province', async (f, d) => { await api(`/api/admin/provinces/${f.dataset.id}`, { method: 'PUT', body: d }); toast('Province enregistrée', 'ok'); await reloadMeta(); });
form('user-search', (f, d) => navigate('/admin?tab=comptes&q=' + encodeURIComponent(d.q)));
form('admin-search', (f, d) => navigate(`/admin?tab=annonces&s=${d.s}&q=${encodeURIComponent(d.q)}`));
action('add-hol', () => { $('#hol-rows').insertAdjacentHTML('beforeend', String(html`<div class="row hol-row" style="gap:6px"><input class="input" data-h="name" placeholder="Nom" style="flex:1;min-width:160px"><input class="input" type="date" data-h="start" style="width:auto"><input class="input" type="date" data-h="end" style="width:auto"></div>`)); });
form('home-settings', async (f, d) => {
  const holidays = $$('.hol-row').map((r) => ({ name: $('[data-h=name]', r).value.trim(), start: $('[data-h=start]', r).value, end: $('[data-h=end]', r).value })).filter((h) => h.name && h.start && h.end);
  await api('/api/admin/settings/home', { method: 'PUT', body: { ...d, holidays } }); await reloadMeta(); toast('Accueil mis à jour', 'ok'); render();
});
form('post', async (f, d) => { await api('/api/admin/posts', { method: 'POST', body: d }); toast('Publié', 'ok'); render(); });
action('del-post', (el) => run(() => api(`/api/admin/posts/${el.dataset.id}`, { method: 'DELETE' }), 'Supprimé')());
form('broadcast', async (f, d) => { const r = await api('/api/admin/broadcast', { method: 'POST', body: d }); f.reset(); toast(`Notification envoyée à ${r.sent} compte(s)`, 'ok'); });
action('msg-done', (el) => run(() => api(`/api/admin/messages/${el.dataset.id}`, { method: 'PUT', body: { status: 'traite' } }))());
async function reloadMeta() { state.meta = await api('/api/meta'); }
