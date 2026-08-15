/* Mon Hub — écran d'accueil pour centraliser les projets (sans dossiers) */
'use strict';

const DATA_URL = 'data/apps.json';
const LS_LAYOUT = 'hub-layout-v5';   // { order, dock, hidden } — clé neuve (purge dossiers v4)

let state = {
  apps: [],
  order: [],          // ordre des apps sur la grille
  dock: [],           // apps épinglées dans le dock
  hidden: new Set(),  // apps masquées
  editing: false,
};

/* ===== Helpers ===== */
function appById(id) { return state.apps.find(a => a.id === id); }

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function persist() {
  saveJSON(LS_LAYOUT, { order: state.order, dock: state.dock, hidden: [...state.hidden] });
}

/* ===== Chargement ===== */
async function loadData() {
  const res = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
  const data = await res.json();
  state.apps = data.apps;

  if (data.meta) {
    document.getElementById('title').textContent = data.meta.title || 'Mon Hub';
    document.getElementById('subtitle').textContent = data.meta.subtitle || '';
  }

  const saved = loadJSON(LS_LAYOUT);
  if (saved && Array.isArray(saved.order)) {
    state.order = saved.order;
    state.dock = Array.isArray(saved.dock) ? saved.dock : [];
    state.hidden = new Set(saved.hidden || []);
    mergeNewApps(data);
  } else {
    state.order = data.apps.map(a => a.id);
    state.dock = data.apps.slice(0, 4).map(a => a.id);
    state.hidden = new Set();
  }

  persist();
  render();
}

function mergeNewApps(data) {
  let changed = false;
  for (const app of data.apps) {
    if (!state.order.includes(app.id)) {
      state.order.push(app.id);
      changed = true;
    }
  }
  if (changed) persist();
}

/* ===== Rendu ===== */
function render() {
  renderGrid();
  renderDock();
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const id of state.order) {
    const app = appById(id);
    if (!app || state.hidden.has(id)) continue;
    const el = buildAppIcon(app, 'grid');
    el.addEventListener('click', () => openApp(app));
    grid.appendChild(el);
  }
}

function renderDock() {
  const dock = document.getElementById('dock');
  dock.innerHTML = '';
  for (const id of state.dock) {
    const app = appById(id);
    if (!app || state.hidden.has(id)) continue;
    const el = buildAppIcon(app, 'dock');
    el.addEventListener('click', () => openApp(app));
    dock.appendChild(el);
  }
}

function buildAppIcon(app, zone) {
  const el = document.createElement('div');
  el.className = 'app';
  el.dataset.appId = app.id;
  el.dataset.zone = zone;

  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.style.background = gradientFor(app.color);
  icon.textContent = app.emoji || '📱';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = app.name;

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = '✕';
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmHide(app.id, app.name);
  });

  el.appendChild(icon);
  el.appendChild(label);
  el.appendChild(badge);
  return el;
}

function gradientFor(color) {
  return `linear-gradient(145deg, ${color} 0%, ${shade(color, -25)} 100%)`;
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
  r = Math.round(r + (t - r) * p);
  g = Math.round(g + (t - g) * p);
  b = Math.round(b + (t - b) * p);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ===== Masquer (façon iOS) ===== */
let pendingHide = null;

function confirmHide(id, name) {
  pendingHide = id;
  document.getElementById('confirm-name').textContent = name;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

function applyHide() {
  if (!pendingHide) return;
  setAppHidden(pendingHide, true);
  closeConfirm();
  toast('Masquée ✓ (ré-affichable dans ⚙️ Réglages)');
}

function closeConfirm() {
  pendingHide = null;
  document.getElementById('confirm-overlay').classList.add('hidden');
}

function setAppHidden(id, hide) {
  if (hide) {
    state.hidden.add(id);
    state.order = state.order.filter(i => i !== id);
    state.dock = state.dock.filter(i => i !== id);
  } else {
    state.hidden.delete(id);
    if (!state.order.includes(id)) state.order.push(id);
  }
  persist();
  render();
  attachDrag();
}

/* ===== Ouverture app ===== */
function openApp(app) {
  if (state.editing) return;
  toast('Ouverture de ' + app.name + '…');
  setTimeout(() => window.open(app.url, '_blank', 'noopener'), 220);
}

/* ===== Réglages ===== */
function openSettings() {
  const list = document.getElementById('settings-list');
  list.innerHTML = '';
  for (const app of state.apps) {
    list.appendChild(buildSettingsRow(app));
  }
  document.getElementById('settings-overlay').classList.remove('hidden');
}

function buildSettingsRow(app) {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const info = document.createElement('div');
  info.className = 'settings-info';
  const emoji = document.createElement('span');
  emoji.className = 'settings-emoji';
  emoji.textContent = app.emoji || '📱';
  const name = document.createElement('span');
  name.textContent = app.name;
  info.appendChild(emoji);
  info.appendChild(name);

  const label = document.createElement('label');
  label.className = 'switch';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !state.hidden.has(app.id);
  cb.addEventListener('change', () => setAppHidden(app.id, !cb.checked));
  const slider = document.createElement('span');
  slider.className = 'slider';
  label.appendChild(cb);
  label.appendChild(slider);

  row.appendChild(info);
  row.appendChild(label);
  return row;
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
}

/* ===== Mode édition + drag & drop (Pointer Events) ===== */
function toggleEdit() {
  state.editing = !state.editing;
  document.body.classList.toggle('editing', state.editing);
  document.getElementById('edit-btn').classList.toggle('active', state.editing);
  if (!state.editing) persist();
  render();
  if (state.editing) attachDrag();
}

let drag = null;

function attachDrag() {
  document.querySelectorAll('#grid .app, #dock .app').forEach(el => {
    if (el.dataset.dragAttached) return;
    el.dataset.dragAttached = '1';
    el.addEventListener('pointerdown', onPointerDown);
  });
}

function onPointerDown(e) {
  if (!state.editing) return;
  if (e.target.closest('.badge')) return;
  const el = e.currentTarget;
  drag = {
    el,
    key: el.dataset.appId,
    zone: el.dataset.zone || 'grid',
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    ghost: null,
  };
  try { el.setPointerCapture(e.pointerId); } catch {}
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp, { once: true });
  el.addEventListener('pointercancel', onPointerCancel, { once: true });
}

function onPointerMove(e) {
  if (!drag || drag.el !== e.currentTarget) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;

  if (!drag.moved && Math.hypot(dx, dy) < 10) return;
  if (!drag.moved) {
    drag.moved = true;
    startGhost();
  }

  moveGhost(e.clientX, e.clientY);
  highlightDropTarget(e.clientX, e.clientY);
}

function startGhost() {
  const src = drag.el;
  src.classList.add('dragging');
  drag.ghost = document.createElement('div');
  drag.ghost.className = 'app ghost';
  drag.ghost.style.width = src.offsetWidth + 'px';
  drag.ghost.innerHTML = src.innerHTML;
  document.body.appendChild(drag.ghost);
}

function moveGhost(x, y) {
  if (!drag.ghost) return;
  const w = drag.ghost.offsetWidth, h = drag.ghost.offsetHeight;
  drag.ghost.style.left = (x - w / 2) + 'px';
  drag.ghost.style.top = (y - h / 2) + 'px';
}

function highlightDropTarget(x, y) {
  document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
  const el = elementAt(x, y);
  if (!el) return;
  const target = el.closest('#grid .app, #dock');
  if (target) target.classList.add('drop-target');
}

function elementAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (el && el.classList && el.classList.contains('ghost')) return null;
  return el;
}

function onPointerUp(e) {
  if (!drag) return;
  const wasMoved = drag.moved;
  const x = e.clientX, y = e.clientY;

  if (wasMoved) {
    suppressNextClick();
    const target = resolveDrop(x, y);
    if (target) applyDrop(target);
    cleanupDrag();
    persist();
    render();
    attachDrag();
  } else {
    cleanupDrag(); // simple tap → click natif ouvre l'app
  }
}

function onPointerCancel() {
  if (!drag) return;
  const wasMoved = drag.moved;
  cleanupDrag();
  if (wasMoved) {
    persist();
    render();
    attachDrag();
  }
}

function suppressNextClick() {
  const handler = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    document.removeEventListener('click', handler, true);
    clearTimeout(handler._t);
  };
  handler._t = setTimeout(() => document.removeEventListener('click', handler, true), 120);
  document.addEventListener('click', handler, true);
}

function resolveDrop(x, y) {
  const el = elementAt(x, y);
  if (!el) return null;

  if (el.closest('#dock')) {
    const dockApp = el.closest('#dock .app');
    return { zone: 'dock', beforeKey: dockApp ? dockApp.dataset.appId : null };
  }

  const gridApp = el.closest('#grid .app');
  if (gridApp) {
    const key = gridApp.dataset.appId;
    const rect = gridApp.getBoundingClientRect();
    const after = y > rect.top + rect.height / 2;
    return { zone: 'grid', key, after };
  }

  if (el.closest('#grid')) return { zone: 'grid', key: null, after: true };

  return null;
}

function applyDrop(target) {
  if (!target || !drag) return;
  const key = drag.key;

  state.order = state.order.filter(i => i !== key);
  state.dock = state.dock.filter(i => i !== key);

  if (target.zone === 'dock') {
    if (target.beforeKey && target.beforeKey !== key) {
      const idx = state.dock.indexOf(target.beforeKey);
      if (idx !== -1) state.dock.splice(idx, 0, key);
      else state.dock.push(key);
    } else {
      state.dock.push(key);
    }
    return;
  }

  if (target.key) {
    const idx = state.order.indexOf(target.key);
    if (idx !== -1) state.order.splice(target.after ? idx + 1 : idx, 0, key);
    else state.order.push(key);
  } else {
    state.order.push(key);
  }
}

function cleanupDrag() {
  if (drag && drag.ghost) drag.ghost.remove();
  if (drag && drag.el) drag.el.classList.remove('dragging');
  document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
  drag = null;
}

/* ===== Toast ===== */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1900);
}

/* ===== Horloge ===== */
function tickClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ===== Service worker ===== */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js')
    .then(reg => reg.update())
    .catch(() => {});
  // Recharge une fois quand une nouvelle version du SW prend le contrôle
  let refreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshed) return;
    refreshed = true;
    window.location.reload();
  });
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('edit-btn').addEventListener('click', toggleEdit);
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);

  const settingsOverlay = document.getElementById('settings-overlay');
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', applyHide);

  tickClock();
  setInterval(tickClock, 30000);
  registerSW();
  loadData().catch(err => {
    console.error('Chargement apps.json échoué:', err);
    toast('Erreur de chargement des données');
  });
});
