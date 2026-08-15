/* Mon Hub — écran d'accueil iPhone pour centraliser les projets */
'use strict';

const DATA_URL = 'data/apps.json';
const LS_LAYOUT = 'hub-layout-v1';
const LS_DOCK = 'hub-dock-v1';

let state = {
  apps: [],            // toutes les apps (depuis apps.json)
  folders: {},         // définitions de dossiers
  order: [],           // ordre des icônes sur la grille (ids + dossiers)
  dock: [],            // ids des apps dans le dock
  editing: false,
};

/* ===== Chargement données ===== */
async function loadData() {
  const res = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
  const data = await res.json();
  state.apps = data.apps;
  state.folders = data.folders || {};

  // Titre / sous-titre
  if (data.meta) {
    document.getElementById('title').textContent = data.meta.title || 'Mon Hub';
    document.getElementById('subtitle').textContent = data.meta.subtitle || '';
  }

  // Restaure l'ordre depuis localStorage, sinon défaut (ordre du JSON)
  const savedOrder = loadJSON(LS_LAYOUT);
  if (savedOrder && Array.isArray(savedOrder)) {
    state.order = savedOrder;
  } else {
    state.order = computeDefaultOrder();
  }

  const savedDock = loadJSON(LS_DOCK);
  state.dock = (savedDock && Array.isArray(savedDock)) ? savedDock : defaultDock();

  render();
}

function computeDefaultOrder() {
  const items = [];
  const seenFolders = new Set();
  // apps sans dossier d'abord, puis dossiers regroupés
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
  // les 4 premières apps sans dossier = dock par défaut
  return state.apps.filter(a => !a.folder).slice(0, 4).map(a => a.id);
}

function appById(id) { return state.apps.find(a => a.id === id); }
function folderApps(folderName) { return state.apps.filter(a => a.folder === folderName); }

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/* ===== Rendu ===== */
function render() {
  renderGrid();
  renderDock();
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const item of state.order) {
    grid.appendChild(buildItem(item));
  }
}

function renderDock() {
  const dock = document.getElementById('dock');
  dock.innerHTML = '';
  for (const id of state.dock) {
    const app = appById(id);
    if (!app) continue;
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

  const icon = document.createElement('div');
  icon.className = 'icon';
  icon.style.background = gradientFor(app.color);
  icon.textContent = app.emoji || '📱';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = app.name;

  el.appendChild(icon);
  el.appendChild(label);
  return el;
}

function buildFolderIcon(name) {
  const apps = folderApps(name);
  const def = state.folders[name] || {};
  const el = document.createElement('div');
  el.className = 'app';
  el.dataset.folder = name;

  const icon = document.createElement('div');
  icon.className = 'icon folder-icon';

  // mini-grille 3x3 des premières apps
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

  el.appendChild(icon);
  el.appendChild(label);

  if (state.editing) {
    el.addEventListener('click', () => openFolder(name));
  } else {
    el.addEventListener('click', () => openFolder(name));
  }
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
    const el = buildAppIcon(app, 'folder');
    el.addEventListener('click', () => openApp(app));
    fg.appendChild(el);
  }
  const overlay = document.getElementById('folder-overlay');
  overlay.classList.remove('hidden');
}

function closeFolder() {
  document.getElementById('folder-overlay').classList.add('hidden');
}

/* ===== Mode édition (drag & drop) ===== */
function toggleEdit() {
  state.editing = !state.editing;
  document.body.classList.toggle('editing', state.editing);
  document.getElementById('edit-btn').classList.toggle('active', state.editing);
  if (!state.editing) {
    persist();
    toast('Ordre enregistré ✓');
  } else {
    toast('Réorganise : glisse les icônes');
    attachDrag();
  }
  render();
}

function attachDrag() {
  const grid = document.getElementById('grid');
  const items = grid.querySelectorAll('.app');
  items.forEach(el => makeDraggable(el));
}

function makeDraggable(el) {
  el.draggable = true;
  el.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', el.dataset.appId || el.dataset.folder);
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('dragover', e => e.preventDefault());
  el.addEventListener('drop', e => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('text/plain');
    const dstKey = el.dataset.appId || ('folder:' + el.dataset.folder);
    reorder(srcId, dstKey);
  });
}

function reorder(srcId, dstKey) {
  // srcId est un id app (dans le dock ou la grille) ; on le place avant dstKey dans la grille
  const srcItem = state.order.find(i => i === srcId) || state.order.find(i => i === srcId);
  const srcIdx = state.order.indexOf(srcId);
  const dstIdx = state.order.indexOf(dstKey);
  if (srcIdx === -1 || dstIdx === -1) return;
  state.order.splice(srcIdx, 1);
  state.order.splice(state.order.indexOf(dstKey), 0, srcId);
  persist();
  render();
  attachDrag();
}

function persist() {
  saveJSON(LS_LAYOUT, state.order);
  saveJSON(LS_DOCK, state.dock);
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
  tickClock();
  setInterval(tickClock, 30000);
  registerSW();
  loadData().catch(err => {
    console.error('Chargement apps.json échoué:', err);
    toast('Erreur de chargement des données');
  });
});
