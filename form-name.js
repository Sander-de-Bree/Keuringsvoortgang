/* Adds an optional keuringsformuliernaam without changing the existing dashboard workflow. */
(() => {
  const baseInspectionRow = inspectionRow;
  const baseNormalizeInspections = normalizeInspections;
  const baseMatchesInspection = matchesInspection;
  const baseRender = render;

  // Keep the new field when reading legacy/local and Firebase records.
  normalizeInspections = raw => baseNormalizeInspections(raw).map((item, index) => ({
    ...item,
    formName: String((Array.isArray(raw) ? raw[index]?.formName : '') || item.formName || '')
  }));

  // Include the form name in search while retaining the existing status filter.
  matchesInspection = item => baseMatchesInspection(item) || (
    (activeFilter === 'Alles' || item.status === activeFilter) &&
    Boolean(searchTerm.trim()) &&
    String(item.formName || '').toLocaleLowerCase('nl').includes(searchTerm.trim().toLocaleLowerCase('nl'))
  );

  inspectionRow = item => {
    const title = `<span class="inspection-row-title ${item.status === 'Goedgekeurd' ? 'is-complete' : ''}">${escapeHTML(item.title)}</span>`;
    const row = baseInspectionRow(item).replace(title, `${title}<input class="inspection-form-name" data-form-name-id="${escapeHTML(item.id)}" type="text" maxlength="100" value="${escapeHTML(item.formName || '')}" placeholder="Naam keuringsformulier" aria-label="Keuringsformuliernaam bij ${escapeHTML(item.title)}">`);
    return row;
  };

  // Add an optional field to the existing add-inspection dialog.
  const form = document.getElementById('inspection-form');
  const titleField = form.querySelector('[name="title"]')?.closest('.form-field');
  if (titleField && !form.elements.formName) {
    const label = document.createElement('label');
    label.className = 'form-field';
    label.innerHTML = 'Naam keuringsformulier <span class="optional">(optioneel)</span><input name="formName" maxlength="100" placeholder="Bijv. K-123 inspectieformulier">';
    titleField.insertAdjacentElement('afterend', label);
  }

  // The main script calls this function for adding inspection records.
  addInspection = formData => {
    const section = String(formData.get('section'));
    const subsection = section === 'CDG' ? String(formData.get('subsection')) : '';
    inspections.push({
      id: `k-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: String(formData.get('title')).trim(),
      formName: String(formData.get('formName') || '').trim(),
      section,
      ...(subsection ? { subsection } : {}),
      status: String(formData.get('status')),
      owner: String(formData.get('owner')).trim()
    });
    saveInspections();
    document.getElementById('inspection-form').reset();
    dialog.close();
    expandedSection = section;
    if (subsection) expandedRoom = subsection;
    activeFilter = 'Alles';
    document.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('is-active', chip.dataset.filter === 'Alles'));
    render();
    showToast('Keuring toegevoegd.');
  };

  // Re-render rows after the original render, then protect edited names using the same
  // one-password-per-page authorization flow as every other change.
  render = () => {
    baseRender();
    document.querySelectorAll('[data-form-name-id]').forEach(input => input.addEventListener('change', event => {
      const item = inspections.find(entry => entry.id === event.target.dataset.formNameId);
      if (!item) return;
      const requestedName = event.target.value.trim();
      event.target.value = item.formName || '';
      withChangeAuthorization(() => {
        item.formName = requestedName;
        saveInspections();
        render();
        showToast('Keuringsformuliernaam opgeslagen.');
      });
    }));
  };

  const style = document.createElement('style');
  style.textContent = `.inspection-form-name{min-width:140px;width:min(22vw,260px);max-width:100%;margin-left:10px;padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:var(--surface-soft);color:var(--text);font:inherit;font-size:12px}.inspection-form-name::placeholder{color:var(--muted)}.inspection-row{min-width:0}.inspection-row-title{min-width:0}@media(max-width:700px){.inspection-form-name{width:100%;min-width:0;margin:6px 0 0}.inspection-row{flex-wrap:wrap}}`;
  document.head.append(style);

  // Re-render once the extension is installed so already-loaded records show the field.
  render();
})();
