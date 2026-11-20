// G-Sports Gabon – démarrage de l'application
import { state, api, render, renderLayout, refreshMe, loadFavs, errorView, $ } from './core.js';
import './pages-public.js';
import './pages-account.js';
import './pages-admin.js';

async function boot() {
  try {
    const [meta] = await Promise.all([api('/api/meta'), refreshMe()]);
    state.meta = meta;
  } catch (e) {
    renderLayout();
    $('#app').innerHTML = String(errorView(e));
    return;
  }
  await loadFavs();
  renderLayout();
  await render();
}
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA indisponible : le site reste utilisable */ }));
}
