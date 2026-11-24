const STORAGE_KEY = 'keuringsvoortgang-giga-leopard-v1';
const THEME_KEY = 'keuringsvoortgang-theme';
const statuses = ['Niet gestart', 'Goedgekeurd', 'Afgekeurd'];
const sectionOrder = ['CDG', 'VH1A', 'VH1B', 'VH1C', 'VH1D', 'VH3A', 'VH3B', 'VH3C', 'VH3D', 'VH5A', 'VH5B', 'VH5C', 'VH5D', 'Terreinkeuring'];
const standardInspections = ['Roxtec doorvoeringen', 'Buiten kabellabels LS', 'Buiten kabellabels MS', 'Binnen kabellabels LS', 'Binnen kabellabels MS', 'Potentiaal aarding', 'Aanhaalmomenten aarding'];

let inspections = loadInspections();
let activeFilter = 'Alles';
let searchTerm = '';
let expandedSection = 'CDG';
let toastTimer;

function defaultInspections() {
  return sectionOrder.filter(section => section !== 'Terreinkeuring').flatMap(section =>
    standardInspections.map((title, index) => ({ id: `default-${section}-${index + 1}`, section, title, status: 'Niet gestart', owner: '' }))
  );
}

function loadInspections() {
  let saved = [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) saved = parsed;
    }
  } catch (error) {
    console.warn('Opgeslagen keuringen konden niet worden gelezen.', error);
  }

  const cleaned = saved
    .filter(item => item && typeof item === 'object')
    .map((item, index) => {
      const savedSection = String(item.section || 'Terreinkeuring');
      const section = savedSection === 'Overig' ? 'Terreinkeuring' : savedSection;
      return {
        id: String(item.id || `keuring-${index}`),
        title: String(item.title || 'Naamloze keuring'),
        section: sectionOrder.includes(section) ? section : 'Terreinkeuring',
        status: item.status === 'In uitvoering' ? 'Niet gestart' : (statuses.includes(item.status) ? item.status : 'Niet gestart'),
        owner: String(item.owner || '')
      };
    });

  const existingIds = new Set(cleaned.map(item => item.id));
  for (const inspection of defaultInspections()) {
    if (!existingIds.has(inspection.id)) cleaned.push(inspection);
  }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned)); } catch (error) { console.warn(error); }
  return cleaned;
}

function saveInspections() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(inspections)); }
  catch (error) { showToast('Opslaan is niet gelukt. Controleer de browserinstellingen.'); }
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
  const matchesSearch = !query || [item.title, item.section, item.owner].some(value => (value || '').toLocaleLowerCase('nl').includes(query));
  return matchesStatus && matchesSearch;
}

function render() {
  document.getElementById('total-count').textContent = inspections.length;
  document.getElementById('approved-count').textContent = inspections.filter(item => item.status === 'Goedgekeurd').length;
  document.getElementById('attention-count').textContent = inspections.filter(item => item.status === 'Afgekeurd').length;
  document.getElementById('filter-total').textContent = inspections.length;

  document.getElementById('sections-container').innerHTML = sectionOrder.map(section => {
    const progress = sectionProgress(section);
    const items = inspections.filter(item => item.section === section && matchesInspection(item));
    const isExpanded = expandedSection === section;
    const list = items.length ? items.map(item => `
      <div class="inspection-row">
        <label class="inspection-check"><input type="checkbox" data-check-id="${escapeHTML(item.id)}" ${item.status === 'Goedgekeurd' ? 'checked' : ''} aria-label="${item.status === 'Goedgekeurd' ? 'Markeer als niet afgerond:' : 'Markeer als afgerond:'} ${escapeHTML(item.title)}"><span class="checkmark" aria-hidden="true"></span></label>
        <span class="row-marker marker-${statusClass(item.status)}" aria-hidden="true"></span>
        <span class="inspection-row-title ${item.status === 'Goedgekeurd' ? 'is-complete' : ''}">${escapeHTML(item.title)}</span>
        <span class="owner-cell">${item.owner ? escapeHTML(item.owner) : '<span class="muted">Niet toegewezen</span>'}</span>
        <label class="sr-only" for="status-${escapeHTML(item.id)}">Status van ${escapeHTML(item.title)}</label>
        <select class="status-select status-${statusClass(item.status)}" id="status-${escapeHTML(item.id)}" data-status-id="${escapeHTML(item.id)}">${statuses.map(status => `<option${item.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select>
      </div>`).join('') : '<p class="section-empty">Geen keuringen bij deze zoekopdracht of status.</p>';

    return `<article class="section-card ${isExpanded ? 'is-expanded' : ''}"><button class="section-toggle" type="button" data-section="${escapeHTML(section)}" aria-expanded="${isExpanded}"><span class="section-card-main"><span class="section-name">${escapeHTML(section)}</span><span class="section-count">${progress.approved} van ${progress.total} goedgekeurd</span></span><span class="section-card-progress"><strong>${progress.percent}%</strong><span class="progress-track" role="progressbar" aria-label="Voortgang ${escapeHTML(section)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span style="width:${progress.percent}%"></span></span></span><span class="section-chevron" aria-hidden="true">⌄</span></button>${isExpanded ? `<div class="section-content"><div class="inspection-list">${list}</div><button class="button button-add-section" type="button" data-add-section="${escapeHTML(section)}"><span aria-hidden="true">＋</span> Keuring toevoegen aan ${escapeHTML(section)}</button></div>` : ''}</article>`;
  }).join('');

  document.querySelectorAll('.section-toggle').forEach(button => button.addEventListener('click', () => { expandedSection = expandedSection === button.dataset.section ? '' : button.dataset.section; render(); }));
  document.querySelectorAll('[data-check-id]').forEach(input => input.addEventListener('change', updateCheck));
  document.querySelectorAll('[data-status-id]').forEach(select => select.addEventListener('change', updateStatus));
  document.querySelectorAll('[data-add-section]').forEach(button => button.addEventListener('click', () => openAddDialog(button.dataset.addSection)));
}

function updateCheck(event) {
  const inspection = inspections.find(item => item.id === event.target.dataset.checkId);
  if (!inspection) return;
  inspection.status = event.target.checked ? 'Goedgekeurd' : 'Niet gestart';
  saveInspections();
  render();
  showToast(event.target.checked ? 'Keuring afgevinkt.' : 'Keuring weer opengezet.');
}

function updateStatus(event) {
  const inspection = inspections.find(item => item.id === event.target.dataset.statusId);
  if (!inspection) return;
  inspection.status = event.target.value;
  saveInspections();
  render();
  showToast('Status bijgewerkt.');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

const dialog = document.getElementById('inspection-dialog');
function closeDialog() { dialog.close(); }
function openAddDialog(section = expandedSection || 'CDG') {
  document.querySelector('#inspection-form [name="section"]').value = section;
  dialog.showModal();
}

function setTheme(theme) {
  const normalizedTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = normalizedTheme;
  try { localStorage.setItem(THEME_KEY, normalizedTheme); } catch (error) { console.warn(error); }
  updateThemeButton();
}

document.getElementById('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  const button = document.getElementById('theme-toggle');
  button.setAttribute('aria-label', dark ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus');
  button.innerHTML = dark ? '<span aria-hidden="true">☀</span><span class="theme-label">Licht</span>' : '<span aria-hidden="true">☾</span><span class="theme-label">Donker</span>';
}
try { setTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'); }
catch (error) { document.documentElement.dataset.theme = 'dark'; updateThemeButton(); }

document.getElementById('add-inspection').addEventListener('click', () => openAddDialog());
document.getElementById('close-dialog').addEventListener('click', closeDialog);
document.getElementById('cancel-dialog').addEventListener('click', closeDialog);
dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
document.getElementById('search-input').addEventListener('input', event => { searchTerm = event.target.value; render(); });
document.querySelectorAll('.filter-chip').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter-chip').forAll;
  render();
}));

document.getElementById('inspection-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const section = String(form.get('section'));
  inspections.push({ id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: String(form.get('title')).trim(), section, status: String(form.get('status')), owner: String(form.get('owner')).trim() });
  saveInspections();
  event.currentTarget.reset();
  closeDialog();
  expandedSection = section;
  activeFilter = 'Alles';
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('is-active', chip.dataset.filter === 'Alles'));
  render();
  showToast('Keuring toegevoegd.');
});

render();
