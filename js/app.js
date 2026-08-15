/* Mon Hub — écran d'accueil iPhone pour centraliser les projets */
'use strict';

const DATA_URL = 'data/apps.json';
const LS_LAYOUT = 'hub-layout-v3';   // { folders, appFolder, order, dock, hidden }

let state = {
  apps: [],          // liste depuis apps.json (name, emoji, color, url, desc)
  folders: {},       // folderId -> { name, emoji, color }
  appFolder: {},     // appId -> folderId | null
  order: [],         // items de la grille : appId | "folder:<folderId>"
  dock: [],          // appIds
  hidden: new Set(), // appIds masquées (supprimées)
  editing: false,
};

let currentFolderId = null;

/* ===== Helpers ===== */
function appById(id) { return state.apps.find(a => a.id === id); }
function getAppFolder(id) { return state.appFolder[id] ?? null; }
function folderApps(fid) {
  return state.apps.filter(a => getAppFolder(a.id) === fid && !state.hidden.has(a.id));
}
function isFolderItem(item) { return item.startsWith('folder:'); }
function folderIdOf(item) { return item.slice(7); }

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function persist() {
  saveJSON(LS_LAYOUT, {
    folders: state.folders,
    appFolder: state.appFolder,
    order: state.order,
    dock: state.dock,
    hidden: [...state.hidden],
  });
}

function nextFolderId() {
  let max = 0;
  for (const k of Object.keys(state.folders)) {
    const m = k.match(/^f(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'f' + (max + 1);
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
    state.folders = saved.folders || {};
    state.appFolder = saved.appFolder || {};
    state.order = saved.order;
    state.dock = Array.isArray(saved.dock) ? saved.dock : [];
    state.hidden = new Set(saved.hidden || []);
    mergeNewApps(data);
  } else {
    initFromJson(data);
  }

  render();
}

function initFromJson(data) {
  state.folders = {};
  state.appFolder = {};
  const defFolders = data.folders || {};

  const byName = {};
  for (const app of data.apps) {
    if (app.folder) (byName[app.folder] = byName[app.folder] || []).push(app.id);
    else state.appFolder[app.id] = null;
  }

  state.order = [];
  for (const app of data.apps) if (!app.folder) state.order.push(app.id);

  for (const [name, ids] of Object.entries(byName)) {
    const def = defFolders[name] || {};
    const fid = nextFolderId();
    state.folders[fid] = { name, emoji: def.emoji || '📁', color: def.color || '#8e8e93' };
    for (const id of ids) state.appFolder[id] = fid;
    state.order.push('folder:' + fid);
  }

  state.dock = data.apps.filter(a => !a.folder).slice(0, 4).map(a => a.id);
  state.hidden = new Set();
  persist();
}

function mergeNewApps(data) {
  const defFolders = data.folders || {};
  let changed = false;
  for (const app of data.apps) {
    if (app.id in state.appFolder) continue;
    if (app.folder) {
      let fid = Object.keys(state.folders).find(k => state.folders[k].name === app.folder);
      if (!fid) {
        fid = nextFolderId();
        const def = defFolders[app.folder] || {};
        state.folders[fid] = { name: app.folder, emoji: def.emoji || '📁', color: def.color || '#8e8e93' };
      }
      state.appFolder[app.id] = fid;
      if (!state.order.includes('folder:' + fid)) state.order.push('folder:' + fid);
    } else {
      state.appFolder[app.id] = null;
      if (!state.order.includes(app.id)) state.order.push(app.id);
    }
    changed = true;
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
  for (const item of state.order) {
    const el = buildItem(item);
    if (el) grid.appendChild(el);
  }
}

function buildItem(item) {
  if (isFolderItem(item)) {
    const fid = folderIdOf(item);
    if (!state.folders[fid]) return null;
    if (folderApps(fid).length === 0) return null; // dossier vide → masqué
    return buildFolderIcon(fid);
  }
  const app = appById(item);
  if (!app || state.hidden.has(item)) return null;
  const el = buildAppIcon(app, 'grid');
  el.addEventListener('click', () => openApp(app));
  return el;
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
    confirmDelete(app.id, app.name);
  });

  el.appendChild(icon);
  el.appendChild(label);
  el.appendChild(badge);
  return el;
}

function buildFolderIcon(fid) {
  const folder = state.folders[fid];
  const apps = folderApps(fid);
  const el = document.createElement('div');
  el.className = 'app';
  el.dataset.folder = fid;
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
  label.textContent = folder.name;

  el.appendChild(icon);
  el.appendChild(label);
  el.addEventListener('click', () => openFolder(fid));
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

/* ===== Suppression (masquer) ===== */
let pendingDelete = null;

function confirmDelete(id, name) {
  pendingDelete = id;
  document.getElementById('confirm-name').textContent = name;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

function applyDelete() {
  if (!pendingDelete) return;
  setAppHidden(pendingDelete, true);
  closeConfirm();
  toast('Masquée ✓ (ré-affichable dans ⚙️ Réglages)');
}

function closeConfirm() {
  pendingDelete = null;
  document.getElementById('confirm-overlay').classList.add('hidden');
}

function setAppHidden(id, hide) {
  if (hide) {
    state.hidden.add(id);
    state.order = state.order.filter(i => i !== id);
    state.dock = state.dock.filter(i => i !== id);
  } else {
    state.hidden.delete(id);
    // ré-affiche : dans un dossier ? rien (elle réapparaît dedans), sinon fin de grille
    if (!getAppFolder(id) && !state.order.includes(id)) state.order.push(id);
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

/* ===== Dossiers ===== */
function openFolder(fid) {
  currentFolderId = fid;
  const folder = state.folders[fid];
  const apps = folderApps(fid);

  const titleEl = document.getElementById('folder-title');
  titleEl.textContent = folder.name;
  titleEl.classList.remove('renaming');

  const fg = document.getElementById('folder-grid');
  fg.innerHTML = '';
  for (const app of apps) {
    const el = buildAppIcon(app, 'folder');
    el.addEventListener('click', () => openApp(app));
    fg.appendChild(el);
  }
  document.getElementById('folder-overlay').classList.remove('hidden');
  attachDrag();
}

function closeFolder() {
  currentFolderId = null;
  document.getElementById('folder-overlay').classList.add('hidden');
}

function startRename(fid) {
  const titleEl = document.getElementById('folder-title');
  if (!titleEl || titleEl.classList.contains('renaming')) return;
  titleEl.classList.add('renaming');
  titleEl.textContent = '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'folder-title-input';
  input.maxLength = 30;
  input.value = state.folders[fid].name;
  titleEl.appendChild(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const name = input.value.trim();
    if (name) state.folders[fid].name = name;
    persist();
    openFolder(fid); // reconstruit le titre + contenu
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    else if (e.key === 'Escape') { input.value = state.folders[fid].name; input.blur(); }
  });
}

/* ===== Réglages ===== */
function openSettings() {
  const list = document.getElementById('settings-list');
  list.innerHTML = '';

  // Groupe par dossier pour la lisibilité
  const groups = [];
  const ungrouped = [];
  for (const app of state.apps) {
    const fid = getAppFolder(app.id);
    if (fid) {
      let g = groups.find(x => x.fid === fid);
      if (!g) { g = { fid, name: state.folders[fid]?.name || 'Dossier', apps: [] }; groups.push(g); }
      g.apps.push(app);
    } else {
      ungrouped.push(app);
    }
  }

  for (const g of groups) {
    list.appendChild(buildSettingsHeader(g.name));
    for (const app of g.apps) list.appendChild(buildSettingsRow(app));
  }
  if (ungrouped.length) {
    list.appendChild(buildSettingsHeader('Autres'));
    for (const app of ungrouped) list.appendChild(buildSettingsRow(app));
  }

  document.getElementById('settings-overlay').classList.remove('hidden');
}

function buildSettingsHeader(name) {
  const h = document.createElement('div');
  h.className = 'settings-group';
  h.textContent = name;
  return h;
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
  cb.addEventListener('change', () => {
    setAppHidden(app.id, !cb.checked);
    // rafraîchir l'ordre des dossiers dans la liste sans fermer
    openSettings();
  });
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

/* --- Drag & drop tactile --- */
let drag = null;

function attachDrag() {
  document.querySelectorAll('#grid .app, #dock .app, #folder-grid .app').forEach(el => {
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
    if (target) {
      applyDrop(target);
      if (target.escapeFolder) closeFolder();
    }
    cleanupDrag();
    persist();
    render();
    attachDrag();
  } else {
    // simple tap → laisser le click natif ouvrir l'app/dossier
    cleanupDrag();
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
  // Si l'overlay dossier est ouvert → gérer la sortie d'une app du dossier
  const overlay = document.getElementById('folder-overlay');
  if (!overlay.classList.contains('hidden')) {
    const card = document.getElementById('folder-card').getBoundingClientRect();
    const inside = x >= card.left && x <= card.right && y >= card.top && y <= card.bottom;
    if (inside) return null; // repositionnement intra-dossier non supporté
    return { zone: 'grid', key: null, after: true, escapeFolder: true };
  }

  const el = elementAt(x, y);
  if (!el) return null;

  if (el.closest('#dock')) {
    const dockApp = el.closest('#dock .app');
    return { zone: 'dock', beforeKey: dockApp ? dockApp.dataset.appId : null };
  }

  const gridApp = el.closest('#grid .app');
  if (gridApp) {
    if (gridApp.dataset.folder) {
      return { zone: 'grid', folderTarget: gridApp.dataset.folder };
    }
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
  const isFolder = isFolderItem(key);

  if (isFolder) {
    // Déplacer un dossier → réordonner dans la grille
    state.order = state.order.filter(i => i !== key);
    const refKey = target.folderTarget ? ('folder:' + target.folderTarget) : target.key;
    if (refKey) {
      const idx = state.order.indexOf(refKey);
      if (idx !== -1) state.order.splice(target.after ? idx + 1 : idx, 0, key);
      else state.order.push(key);
    } else {
      state.order.push(key);
    }
    return;
  }

  // C'est une app
  state.order = state.order.filter(i => i !== key);
  state.dock = state.dock.filter(i => i !== key);

  // Entrer dans un dossier ?
  if (target.folderTarget) {
    state.appFolder[key] = target.folderTarget;
    return;
  }

  // Sortir du dossier (si elle y était) ou repositionner
  state.appFolder[key] = null;

  if (target.zone === 'dock') {
    if (target.beforeKey && target.beforeKey !== key) {
      const idx = state.dock.indexOf(target.beforeKey);
      if (idx !== -1) state.dock.splice(idx, 0, key);
      else state.dock.push(key);
    } else {
      state.dock.push(key);
    }
  } else {
    // grille
    if (target.key) {
      const idx = state.order.indexOf(target.key);
      if (idx !== -1) state.order.splice(target.after ? idx + 1 : idx, 0, key);
      else state.order.push(key);
    } else {
      state.order.push(key);
    }
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
  const folderOverlay = document.getElementById('folder-overlay');
  folderOverlay.addEventListener('click', (e) => {
    if (e.target === folderOverlay) closeFolder();
  });

  document.getElementById('folder-title').addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (currentFolderId) startRename(currentFolderId);
  });

  document.getElementById('edit-btn').addEventListener('click', toggleEdit);
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);

  const settingsOverlay = document.getElementById('settings-overlay');
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

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
