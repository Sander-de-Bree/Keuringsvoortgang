const STORAGE_KEY = 'keuringsvoortgang-giga-leopard-v1';
const THEME_KEY = 'keuringsvoortgang-theme';
const AUTH_KEY = 'keuringsvoortgang-change-authorized';
const DELETE_PASSWORD = 'Leopard1';
const statuses = ['Niet gestart', 'Goedgekeurd', 'Afgekeurd'];
const sectionOrder = ['CDG', 'VH1A', 'VH1B', 'VH1C', 'VH1D', 'VH3A', 'VH3B', 'VH3C', 'VH3D', 'VH5A', 'VH5B', 'VH5C', 'VH5D', 'Terreinkeuring'];
const cdgRooms = ['Sectie 1', 'Sectie 3', 'Sectie 5', 'Sectie 7', 'LS-ruimte', 'SCADA-ruimte', 'ATR 1', 'ATR 3', 'ATR 5', 'Overig'];
const standardInspections = ['Roxtec doorvoeringen', 'Buiten kabellabels LS', 'Buiten kabellabels MS', 'Binnen kabellabels LS', 'Binnen kabellabels MS', 'Potentiaal aarding', 'Aanhaalmomenten aarding'];

const firebaseConfig = {
  apiKey: 'AIzaSyCRw4K2LW5btTb_IDHQLGwTCwPO7JCeAMI',
  authDomain: 'giga-leopard.firebaseapp.com',
  databaseURL: 'https://giga-leopard-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'giga-leopard',
  storageBucket: 'giga-leopard.firebasestorage.app',
  messagingSenderId: '189408105137',
  appId: '1:189408105137:web:b6ece6f71e841640f78890'
};

let inspections = [];
let activeFilter = 'Alles';
let searchTerm = '';
let expandedSection = 'CDG';
let expandedRoom = '';
let toastTimer;
let pendingDeleteId = null;
let pendingAction = null;
let database = null;

function roomSlug(room) {
  return room.toLocaleLowerCase('nl').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function defaultInspections() {
  const result = [];
  sectionOrder.filter(section => section !== 'Terreinkeuring').forEach(section => {
    const rooms = section === 'CDG' ? cdgRooms : [''];
    rooms.forEach(room => {
      standardInspections.forEach((title, index) => {
        const item = { id: `default-${section}-${index + 1}${room ? `-${roomSlug(room)}` : ''}`, section, title, status: 'Niet gestart', owner: '' };
        if (room) item.subsection = room;
        result.push(item);
      });
    });
  });
  return result;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function statusClass(status) {
  return ({ 'Niet gestart': 'pending', 'Goedgekeurd': 'approved', 'Afgekeurd': 'rejected' })[status] || 'pending';
}

function sectionProgress(section) {
  const items = inspections.filter(item => item.section === section);
  const approved = items.filter(item => item.status === 'Goedgekeurd').length;
  return { total: items.length, approved, percent: items.length ? Math.round((approved / items.length) * 100) : 0 };
}

function matchesInspection(item) {
  const matchesStatus = activeFilter === 'Alles' || item.status === activeFilter;
  const query = searchTerm.trim().toLocaleLowerCase('nl');
  const matchesSearch = !query || [item.title, item.section, item.subsection, item.owner].some(value => (value || '').toLocaleLowerCase('nl').includes(query));
  return matchesStatus && matchesSearch;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function saveInspections() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inspections));
  if (database) {
    database.ref('keuringsvoortgang/inspections').set(inspections)
      .catch(error => {
        console.error(error);
        showToast('Firebase kon niet schrijven. Controleer Realtime Database-regels.');
      });
  }
}

function normalizeInspections(raw) {
  if (!Array.isArray(raw)) return defaultInspections();
  return raw.map((item, index) => ({
    id: String(item.id || `keuring-${index}`),
    title: String(item.title || 'Naamloze keuring'),
    section: sectionOrder.includes(item.section) ? item.section : 'Terreinkeuring',
    ...(item.section === 'CDG' && cdgRooms.includes(item.subsection) ? { subsection: item.subsection } : {}),
    status: statuses.includes(item.status) ? item.status : 'Niet gestart',
    owner: String(item.owner || '')
  }));
}

function connectFirebase() {
  if (!window.firebase) return;
  try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    const ref = database.ref('keuringsvoortgang/inspections');
    ref.on('value', snapshot => {
      const value = snapshot.val();
      if (value == null) {
        inspections = defaultInspections();
        ref.set(inspections).catch(console.error);
      } else {
        inspections = normalizeInspections(Array.isArray(value) ? value : Object.values(value));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inspections));
      }
      render();
    }, error => {
      console.error(error);
      showToast('Realtime verbinding mislukt. Controleer Firebase-regels.');
      inspections = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || defaultInspections();
      render();
    });
  } catch (error) {
    console.error(error);
  }
}

function isAuthorized() {
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}

function withChangeAuthorization(action) {
  if (isAuthorized()) {
    action();
    return;
  }
  pendingAction = action;
  document.getElementById('change-password').value = '';
  document.getElementById('change-password-error').textContent = '';
  document.getElementById('change-password-dialog').showModal();
  setTimeout(() => document.getElementById('change-password').focus(), 0);
}

function inspectionRow(item) {
  return `<div class="inspection-row">
    <label class="inspection-check"><input type="checkbox" data-check-id="${escapeHTML(item.id)}" ${item.status === 'Goedgekeurd' ? 'checked' : ''} aria-label="Status van ${escapeHTML(item.title)}"><span class="checkmark" aria-hidden="true"></span></label>
    <span class="row-marker marker-${statusClass(item.status)}" aria-hidden="true"></span>
    <span class="inspection-row-title ${item.status === 'Goedgekeurd' ? 'is-complete' : ''}">${escapeHTML(item.title)}</span>
    <span class="owner-cell">${item.owner ? escapeHTML(item.owner) : '<span class="muted">Niet toegewezen</span>'}</span>
    <label class="sr-only" for="status-${escapeHTML(item.id)}">Status van ${escapeHTML(item.title)}</label>
    <select class="status-select status-${statusClass(item.status)}" id="status-${escapeHTML(item.id)}" data-status-id="${escapeHTML(item.id)}">${statuses.map(status => `<option${item.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select>
    <button class="delete-button" type="button" data-delete-id="${escapeHTML(item.id)}" aria-label="Verwijder ${escapeHTML(item.title)}" title="Keuring verwijderen">×</button>
  </div>`;
}

function render() {
  document.getElementById('total-count').textContent = inspections.length;
  document.getElementById('approved-count').textContent = inspections.filter(item => item.status === 'Goedgekeurd').length;
  document.getElementById('attention-count').textContent = inspections.filter(item => item.status === 'Afgekeurd').length;
  document.getElementById('filter-total').textContent = inspections.length;

  const approved = inspections.filter(item => item.status === 'Goedgekeurd').length;
  const percent = inspections.length ? Math.round((approved / inspections.length) * 100) : 0;
  document.getElementById('overall-progress-percent').textContent = `${percent}%`;
  document.getElementById('overall-progress-count').textContent = `${approved} van ${inspections.length} goedgekeurd`;
  document.getElementById('overall-progress-bar').style.width = `${percent}%`;
  document.querySelector('.overall-progress-track').setAttribute('aria-valuenow', String(percent));

  document.getElementById('sections-container').innerHTML = sectionOrder.map(section => {
    const progress = sectionProgress(section);
    const isExpanded = expandedSection === section;
    let content;

    if (section === 'CDG') {
      content = cdgRooms.map(room => {
        const roomItems = inspections.filter(item => item.section === 'CDG' && item.subsection === room && matchesInspection(item));
        const roomApproved = inspections.filter(item => item.section === 'CDG' && item.subsection === room && item.status === 'Goedgekeurd').length;
        const roomTotal = inspections.filter(item => item.section === 'CDG' && item.subsection === room).length;
        const roomPercent = roomTotal ? Math.round(roomApproved / roomTotal * 100) : 0;
        const roomExpanded = expandedRoom === room;
        return `<section class="cdg-room ${roomExpanded ? 'is-open' : ''}">
          <button type="button" class="cdg-room-toggle" data-room="${escapeHTML(room)}" aria-expanded="${roomExpanded}">
            <span class="cdg-room-title">${escapeHTML(room)}</span><span class="cdg-room-count">${roomApproved}/${roomTotal} afgerond</span><strong>${roomPercent}%</strong><span class="cdg-room-chevron" aria-hidden="true">⌄</span>
          </button>
          ${roomExpanded ? `<div class="cdg-room-content"><div class="inspection-list">${roomItems.length ? roomItems.map(inspectionRow).join('') : '<p class="section-empty">Geen keuringen bij deze zoekopdracht of status.</p>'}</div><button class="button button-add-section" type="button" data-add-room="${escapeHTML(room)}"><span aria-hidden="true">＋</span> Keuring toevoegen aan ${escapeHTML(room)}</button></div>` : ''}
        </section>`;
      }).join('');
    } else {
      const items = inspections.filter(item => item.section === section && matchesInspection(item));
      content = `<div class="inspection-list">${items.length ? items.map(inspectionRow).join('') : '<p class="section-empty">Nog geen keuringen toegevoegd.</p>'}</div><button class="button button-add-section" type="button" data-add-section="${escapeHTML(section)}"><span aria-hidden="true">＋</span> Keuring toevoegen aan ${escapeHTML(section)}</button>`;
    }

    return `<article class="section-card ${isExpanded ? 'is-expanded' : ''}"><button class="section-toggle" type="button" data-section="${escapeHTML(section)}" aria-expanded="${isExpanded}"><span class="section-card-main"><span class="section-name">${escapeHTML(section)}</span><span class="section-count">${progress.approved} van ${progress.total} goedgekeurd</span></span><span class="section-card-progress"><strong>${progress.percent}%</strong><span class="progress-track" role="progressbar" aria-label="Voortgang ${escapeHTML(section)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span style="width:${progress.percent}%"></span></span></span><span class="section-chevron" aria-hidden="true">⌄</span></button>${isExpanded ? `<div class="section-content">${content}</div>` : ''}</article>`;
  }).join('');

  document.querySelectorAll('.section-toggle').forEach(button => button.addEventListener('click', () => {
    expandedSection = expandedSection === button.dataset.section ? '' : button.dataset.section;
    if (expandedSection === 'CDG' && !cdgRooms.includes(expandedRoom)) expandedRoom = cdgRooms[0];
    render();
  }));
  document.querySelectorAll('.cdg-room-toggle').forEach(button => button.addEventListener('click', () => {
    expandedRoom = expandedRoom === button.dataset.room ? '' : button.dataset.room;
    render();
  }));
  document.querySelectorAll('[data-check-id]').forEach(input => input.addEventListener('change', event => {
    const item = inspections.find(entry => entry.id === event.target.dataset.checkId);
    if (!item) return;
    const requestedStatus = event.target.checked ? 'Goedgekeurd' : 'Niet gestart';
    const originalStatus = item.status;
    event.target.checked = originalStatus === 'Goedgekeurd';
    withChangeAuthorization(() => {
      item.status = requestedStatus;
      saveInspections();
      render();
      showToast(requestedStatus === 'Goedgekeurd' ? 'Keuring afgevinkt.' : 'Keuring weer opengezet.');
    });
  }));
  document.querySelectorAll('[data-status-id]').forEach(select => select.addEventListener('change', event => {
    const item = inspections.find(entry => entry.id === event.target.dataset.statusId);
    if (!item) return;
    const requestedStatus = event.target.value;
    const originalStatus = item.status;
    event.target.value = originalStatus;
    withChangeAuthorization(() => {
      item.status = requestedStatus;
      saveInspections();
      render();
      showToast('Status bijgewerkt.');
    });
  }));
  document.querySelectorAll('[data-delete-id]').forEach(button => button.addEventListener('click', () => openDeleteDialog(button.dataset.deleteId)));
  document.querySelectorAll('[data-add-section]').forEach(button => button.addEventListener('click', () => openAddDialog(button.dataset.addSection)));
  document.querySelectorAll('[data-add-room]').forEach(button => button.addEventListener('click', () => openAddDialog('CDG', button.dataset.addRoom)));
}

const dialog = document.getElementById('inspection-dialog');
const deleteDialog = document.getElementById('delete-dialog');

function openAddDialog(section = expandedSection || 'CDG', room = '') {
  withChangeAuthorization(() => {
    const form = document.getElementById('inspection-form');
    form.elements.section.value = section;
    form.elements.subsection.value = room || (section === 'CDG' ? (expandedRoom || cdgRooms[0]) : '');
    document.getElementById('cdg-room-field').hidden = section !== 'CDG';
    dialog.showModal();
  });
}

function openDeleteDialog(id) {
  withChangeAuthorization(() => {
    pendingDeleteId = id;
    document.getElementById('delete-password').value = '';
    document.getElementById('delete-error').textContent = '';
    deleteDialog.showModal();
  });
}

function setTheme(theme) {
  const normalized = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = normalized;
  localStorage.setItem(THEME_KEY, normalized);
  const button = document.getElementById('theme-toggle');
  const dark = normalized === 'dark';
  button.setAttribute('aria-label', dark ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus');
  button.innerHTML = dark ? '<span aria-hidden="true">☀</span><span class="theme-label">Licht</span>' : '<span aria-hidden="true">☾</span><span class="theme-label">Donker</span>';
}

document.getElementById('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
setTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

document.getElementById('add-inspection').addEventListener('click', () => openAddDialog());
document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
document.getElementById('cancel-dialog').addEventListener('click', () => dialog.close());
document.getElementById('close-delete-dialog').addEventListener('click', () => deleteDialog.close());
document.getElementById('cancel-delete').addEventListener('click', () => deleteDialog.close());
document.getElementById('cancel-change-password').addEventListener('click', () => {
  pendingAction = null;
  document.getElementById('change-password-dialog').close();
});

dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
deleteDialog.addEventListener('click', event => { if (event.target === deleteDialog) deleteDialog.close(); });

document.getElementById('change-password-form').addEventListener('submit', event => {
  event.preventDefault();
  if (document.getElementById('change-password').value !== DELETE_PASSWORD) {
    document.getElementById('change-password-error').textContent = 'Onjuist wachtwoord.';
    return;
  }
  sessionStorage.setItem(AUTH_KEY, 'true');
  const action = pendingAction;
  pendingAction = null;
  document.getElementById('change-password-dialog').close();
  if (action) action();
});

document.getElementById('delete-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingDeleteId) return;
  inspections = inspections.filter(item => item.id !== pendingDeleteId);
  pendingDeleteId = null;
  deleteDialog.close();
  saveInspections();
  render();
  showToast('Keuring verwijderd.');
});

document.getElementById('search-input').addEventListener('input', event => { searchTerm = event.target.value; render(); });
document.querySelectorAll('.filter-chip').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('is-active', chip === button));
  render();
}));

document.getElementById('inspection-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const section = String(form.get('section'));
  const subsection = section === 'CDG' ? String(form.get('subsection')) : '';
  inspections.push({ id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: String(form.get('title')).trim(), section, ...(subsection ? { subsection } : {}), status: String(form.get('status')), owner: String(form.get('owner')).trim() });
  saveInspections();
  event.currentTarget.reset();
  dialog.close();
  expandedSection = section;
  if (subsection) expandedRoom = subsection;
  activeFilter = 'Alles';
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('is-active', chip.dataset.filter === 'Alles'));
  render();
  showToast('Keuring toegevoegd.');
});

inspections = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || defaultInspections();
render();
connectFirebase();
