/* Mon Hub — écran d'accueil iPhone pour centraliser les projets */
'use strict';

const DATA_URL = 'data/apps.json';
const LS_LAYOUT = 'hub-layout-v2';   // { order: [...], dock: [...] }
const LS_HIDDEN = 'hub-hidden-v1';    // clés masquées (ids + "folder:Nom")

let state = {
  apps: [],
  folders: {},
  order: [],
  dock: [],
  hidden: new Set(),
  editing: false,
};

/* ===== Chargement données ===== */
async function loadData() {
  const res = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
  const data = await res.json();
  state.apps = data.apps;
  state.folders = data.folders || {};

  if (data.meta) {
    document.getElementById('title').textContent = data.meta.title || 'Mon Hub';
    document.getElementById('subtitle').textContent = data.meta.subtitle || '';
  }

  // Layout sauvegardé
  const layout = loadJSON(LS_LAYOUT);
  if (layout && Array.isArray(layout.order)) {
    state.order = layout.order;
    state.dock = Array.isArray(layout.dock) ? layout.dock : [];
  } else {
    state.order = computeDefaultOrder();
    state.dock = defaultDock();
  }

  // Éléments masqués (supprimés)
  state.hidden = new Set(loadJSON(LS_HIDDEN) || []);

  render();
}

function computeDefaultOrder() {
  const items = [];
  const seenFolders = new Set();
  for (const app of state.apps) {
    if (!app.folder) items.push(app.id);
  }
  for (const app of state.apps) {
    if (app.folder && !seenFolders.has(app.folder)) {
      seenFolders.add(app.folder);
      items.push('folder:' + app.folder);
    }
  }
  return items;
}

function defaultDock() {
  return state.apps.filter(a => !a.folder).slice(0, 4).map(a => a.id);
}

function appById(id) { return state.apps.find(a => a.id === id); }
function folderApps(folderName) { return state.apps.filter(a => a.folder === folderName); }
function isHidden(key) { return state.hidden.has(key); }

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function persist() {
  saveJSON(LS_LAYOUT, { order: state.order, dock: state.dock });
  saveJSON(LS_HIDDEN, [...state.hidden]);
}

/* ===== Rendu ===== */
function render() {
  renderGrid();
  renderDock();
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const item of state.order) {
    if (isHidden(item)) continue; // item masqué (app ou dossier supprimé)
    grid.appendChild(buildItem(item));
  }
}

function renderDock() {
  const dock = document.getElementById('dock');
  dock.innerHTML = '';
  for (const id of state.dock) {
    const app = appById(id);
    if (!app || isHidden(id)) continue;
    const el = buildAppIcon(app, 'dock');
    el.addEventListener('click', () => openApp(app));
    dock.appendChild(el);
  }
}

function buildItem(item) {
  if (item.startsWith('folder:')) {
    const name = item.slice(7);
    return buildFolderIcon(name);
  }
  const app = appById(item);
  if (!app) return document.createElement('div');
  const el = buildAppIcon(app, 'grid');
  el.addEventListener('click', () => openApp(app));
  return el;
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

  // Badge suppression (visible en mode édition)
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = '✕';
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDelete(app.id, app.name);
  });

  el.appendChild(icon);
  el.appendChild(label);
  el.appendChild(badge);
  return el;
}

function buildFolderIcon(name) {
  const apps = folderApps(name);
  const def = state.folders[name] || {};
  const el = document.createElement('div');
  el.className = 'app';
  el.dataset.folder = name;
  el.dataset.zone = 'grid';

  const icon = document.createElement('div');
  icon.className = 'icon folder-icon';
  for (let i = 0; i < 9; i++) {
    const m = document.createElement('div');
    m.className = 'mini';
    if (apps[i]) {
      m.style.background = gradientFor(apps[i].color);
      m.textContent = apps[i].emoji || '';
    } else {
      m.classList.add('empty');
    }
    icon.appendChild(m);
  }

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = def.label || name;

  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = '✕';
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDelete('folder:' + name, def.label || name);
  });

  el.appendChild(icon);
  el.appendChild(label);
  el.appendChild(badge);

  el.addEventListener('click', () => openFolder(name));
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

/* ===== Suppression (façon iOS) ===== */
let pendingDelete = null;

function confirmDelete(key, label) {
  pendingDelete = key;
  document.getElementById('confirm-name').textContent = label;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

function applyDelete() {
  if (!pendingDelete) return;
  const key = pendingDelete;
  if (key.startsWith('folder:')) {
    const name = key.slice(7);
    state.hidden.add(key);
    for (const app of folderApps(name)) state.hidden.add(app.id);
  } else {
    state.hidden.add(key);
  }
  // Retire de l'ordre et du dock
  state.order = state.order.filter(i => i !== key);
  state.dock = state.dock.filter(i => i !== key);
  persist();
  closeConfirm();
  render();
  toast('Supprimé ✓ (↺ pour restaurer)');
}

function closeConfirm() {
  pendingDelete = null;
  document.getElementById('confirm-overlay').classList.add('hidden');
}

/* ===== Ouverture app ===== */
function openApp(app) {
  if (state.editing) return;
  toast('Ouverture de ' + app.name + '…');
  setTimeout(() => window.open(app.url, '_blank', 'noopener'), 220);
}

/* ===== Overlay dossier ===== */
function openFolder(name) {
  const apps = folderApps(name);
  const def = state.folders[name] || {};
  document.getElementById('folder-title').textContent = def.label || name;
  const fg = document.getElementById('folder-grid');
  fg.innerHTML = '';
  for (const app of apps) {
    if (isHidden(app.id)) continue;
    const el = buildAppIcon(app, 'folder');
    el.addEventListener('click', () => openApp(app));
    fg.appendChild(el);
  }
  document.getElementById('folder-overlay').classList.remove('hidden');
}

function closeFolder() {
  document.getElementById('folder-overlay').classList.add('hidden');
}

/* ===== Mode édition + drag & drop (Pointer Events) ===== */
function toggleEdit() {
  state.editing = !state.editing;
  document.body.classList.toggle('editing', state.editing);
  document.getElementById('edit-btn').classList.toggle('active', state.editing);
  document.getElementById('reset-btn').classList.toggle('hidden', !state.editing);
  if (!state.editing) persist();
  render();
  if (state.editing) attachDrag();
}

function resetAll() {
  state.hidden.clear();
  state.order = computeDefaultOrder();
  state.dock = defaultDock();
  persist();
  render();
  attachDrag();
  toast('Écran réinitialisé ✓');
}

/* --- Drag & drop tactile --- */
let drag = null;

function attachDrag() {
  const items = document.querySelectorAll('#grid .app, #dock .app');
  items.forEach(el => {
    el.addEventListener('pointerdown', onPointerDown);
  });
}

function onPointerDown(e) {
  if (!state.editing) return;
  if (e.target.closest('.badge')) return; // le badge gère son propre clic
  const el = e.currentTarget;
  drag = {
    el,
    key: el.dataset.appId || ('folder:' + el.dataset.folder),
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

  if (!drag.moved && Math.hypot(dx, dy) < 10) return; // seuil : différencier tap / drag
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
  // évite de retourner le ghost lui-même (déjà pointer-events:none, sécurité)
  if (el && el.classList && el.classList.contains('ghost')) return null;
  return el;
}

function onPointerUp(e) {
  if (!drag) return;
  const wasMoved = drag.moved;
  const x = e.clientX, y = e.clientY;

  if (wasMoved) {
    const target = resolveDrop(x, y);
    applyDrop(target);
  }

  cleanupDrag();
  persist();
  render();
  attachDrag();
}

function onPointerCancel() {
  cleanupDrag();
  render();
  attachDrag();
}

function resolveDrop(x, y) {
  const el = elementAt(x, y);
  if (!el) return null;

  const dockEl = el.closest('#dock');
  if (dockEl) {
    const dockApp = el.closest('#dock .app');
    return { zone: 'dock', beforeKey: dockApp ? dockApp.dataset.appId : null };
  }

  const gridApp = el.closest('#grid .app');
  if (gridApp) {
    const key = gridApp.dataset.appId || ('folder:' + gridApp.dataset.folder);
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

  // Retire de la zone source
  state.order = state.order.filter(i => i !== key);
  state.dock = state.dock.filter(i => i !== key);

  if (target.zone === 'dock') {
    if (key.startsWith('folder:')) {
      state.order.push(key); // un dossier ne va pas dans le dock → fin de grille
      return;
    }
    if (target.beforeKey && target.beforeKey !== key) {
      const idx = state.dock.indexOf(target.beforeKey);
      if (idx !== -1) state.dock.splice(idx, 0, key);
      else state.dock.push(key);
    } else {
      state.dock.push(key);
    }
    return;
  }

  // Drop dans la grille
  if (target.key) {
    const idx = state.order.indexOf(target.key);
    if (idx === -1) { state.order.push(key); return; }
    state.order.splice(target.after ? idx + 1 : idx, 0, key);
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
  toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
}

/* ===== Horloge ===== */
function tickClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/* ===== Service worker ===== */
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('folder-overlay').addEventListener('click', closeFolder);
  document.getElementById('edit-btn').addEventListener('click', toggleEdit);
  document.getElementById('reset-btn').addEventListener('click', resetAll);
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', applyDelete);
  tickClock();
  setInterval(tickClock, 30000);
  registerSW();
  loadData().catch(err => {
    console.error('Chargement apps.json échoué:', err);
    toast('Erreur de chargement des données');
  });
});
