const STORAGE_KEY = 'keuringsvoortgang-giga-leopard-v1';
const statuses = ['Niet gestart', 'In uitvoering', 'Goedgekeurd', 'Afgekeurd'];
const sectionOrder = ['CDG', 'VH1A', 'VH1B', 'VH1C', 'VH1D', 'VH3A', 'VH3B', 'VH3C', 'VH3D', 'VH5A', 'VH5B', 'VH5C', 'VH5D', 'Overig'];
const starterInspections = [
  { id: 'k-1', section: 'Overig', title: 'Controle staalconstructie', status: 'Goedgekeurd', owner: 'Team constructie' },
  { id: 'k-2', section: 'Overig', title: 'Lasinspectie hoofdverbindingen', status: 'In uitvoering', owner: 'Team constructie' },
  { id: 'k-3', section: 'Overig', title: 'Controle conservering', status: 'Niet gestart', owner: '' },
  { id: 'k-4', section: 'Overig', title: 'Elektrische installatie — metingen', status: 'In uitvoering', owner: 'Elektro' },
  { id: 'k-5', section: 'Overig', title: 'Controle aarding en potentiaalvereffening', status: 'Niet gestart', owner: '' },
  { id: 'k-6', section: 'Overig', title: 'Inspectie brandwerende doorvoeringen', status: 'Afgekeurd', owner: 'Brandveiligheid' },
  { id: 'k-7', section: 'Overig', title: 'Controle noodverlichting', status: 'Goedgekeurd', owner: 'Elektro' },
  { id: 'k-8', section: 'Overig', title: 'Oplevercontrole technische ruimten', status: 'Niet gestart', owner: '' },
  { id: 'k-9', section: 'Overig', title: 'Druktest leidingwerk', status: 'In uitvoering', owner: 'WTB' }
];

let inspections = loadInspections();
let activeFilter = 'Alles';
let searchTerm = '';
let toastTimer;

function loadInspections() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => item && typeof item === 'object').map((item, index) => ({
          id: String(item.id || `keuring-${index}`),
          title: String(item.title || 'Naamloze keuring'),
          section: sectionOrder.includes(item.section) ? item.section : 'Overig',
          status: statuses.includes(item.status) ? item.status : 'Niet gestart',
          owner: String(item.owner || '')
        }));
      }
    }
  } catch (error) {
    console.warn('Opgeslagen keuringen konden niet worden gelezen.', error);
  }
  return starterInspections.map(item => ({ ...item }));
}

function saveInspections() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inspections));
  } catch (error) {
    showToast('Opslaan is niet gelukt. Controleer de browserinstellingen.');
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function sectionProgress(section) {
  const items = inspections.filter(item => item.section === section);
  const approved = items.filter(item => item.status === 'Goedgekeurd').length;
  return { total: items.length, approved, percent: items.length ? Math.round((approved / items.length) * 100) : 0 };
}

function render() {
  document.getElementById('total-count').textContent = inspections.length;
  document.getElementById('progress-count').textContent = inspections.filter(item => item.status === 'In uitvoering').length;
  document.getElementById('approved-count').textContent = inspections.filter(item => item.status === 'Goedgekeurd').length;
  document.getElementById('attention-count').textContent = inspections.filter(item => item.status === 'Afgekeurd').length;
  document.getElementById('filter-total').textContent = inspections.length;

  const progressContainer = document.getElementById('section-progress');
  progressContainer.innerHTML = sectionOrder.map(section => {
    const progress = sectionProgress(section);
    return `<article class="progress-card">
      <div class="progress-card-heading"><h3>${escapeHTML(section)}</h3><strong>${progress.percent}%</strong></div>
      <div class="progress-track" role="progressbar" aria-label="Voortgang ${escapeHTML(section)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}"><span style="width:${progress.percent}%"></span></div>
      <p>${progress.approved} van ${progress.total} goedgekeurd</p>
    </article>`;
  }).join('');

  const query = searchTerm.trim().toLocaleLowerCase('nl');
  const visible = inspections.filter(item => {
    const matchesStatus = activeFilter === 'Alles' || item.status === activeFilter;
    const matchesSearch = !query || [item.title, item.section, item.owner].some(value => (value || '').toLocaleLowerCase('nl').includes(query));
    return matchesStatus && matchesSearch;
  });
  const container = document.getElementById('sections-container');
  const groups = sectionOrder.map(section => {
    const items = visible.filter(item => item.section === section);
    if (!items.length) return '';
    return `<section class="inspection-group"><div class="group-heading"><h3>${escapeHTML(section)}</h3><span>${items.length} ${items.length === 1 ? 'keuring' : 'keuringen'}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Keuring</th><th>Verantwoordelijke</th><th>Status</th></tr></thead><tbody>
      ${items.map(item => `<tr><td class="inspection-title"><span class="row-marker marker-${statusClass(item.status)}"></span>${escapeHTML(item.title)}</td><td class="owner-cell">${item.owner ? escapeHTML(item.owner) : '<span class="muted">Niet toegewezen</span>'}</td><td><label class="sr-only" for="status-${escapeHTML(item.id)}">Status van ${escapeHTML(item.title)}</label><select class="status-select status-${statusClass(item.status)}" id="status-${escapeHTML(item.id)}" data-id="${escapeHTML(item.id)}">${statuses.map(status => `<option${item.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div></section>`;
  }).join('');
  container.innerHTML = groups || `<div class="empty-state"><span aria-hidden="true">⌕</span><strong>Geen keuringen gevonden</strong><p>Pas je zoekopdracht of statusfilter aan.</p></div>`;
  container.querySelectorAll('.status-select').forEach(select => select.addEventListener('change', updateStatus));
}

function statusClass(status) {
  return ({ 'Niet gestart': 'pending', 'In uitvoering': 'progress', 'Goedgekeurd': 'approved', 'Afgekeurd': 'rejected' })[status] || 'pending';
}

function updateStatus(event) {
  const inspection = inspections.find(item => item.id === event.target.dataset.id);
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
document.getElementById('add-inspection').addEventListener('click', () => dialog.showModal());
document.getElementById('close-dialog').addEventListener('click', closeDialog);
document.getElementById('cancel-dialog').addEventListener('click', closeDialog);
dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
document.getElementById('search-input').addEventListener('input', event => { searchTerm = event.target.value; render(); });
document.querySelectorAll('.filter-chip').forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('is-active', chip === button));
  render();
}));
document.getElementById('inspection-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  inspections.push({
    id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: String(form.get('title')).trim(),
    section: String(form.get('section')),
    status: String(form.get('status')),
    owner: String(form.get('owner')).trim()
  });
  saveInspections();
  event.currentTarget.reset();
  closeDialog();
  activeFilter = 'Alles';
  document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('is-active', chip.dataset.filter === 'Alles'));
  render();
  showToast('Keuring toegevoegd.');
});

render();
