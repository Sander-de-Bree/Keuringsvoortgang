/* Replaces the inspection template for all VH sections with the requested checks. */
(() => {
  const vhSections = sectionOrder.filter(section => section.startsWith('VH'));
  const vhInspectionTemplates = [
    { title: 'Aarding', formName: 'AAR' },
    { title: 'Controle bovengronds kabeltracé', formName: 'KTB-02' },
    { title: 'Roxtec doorvoeringen', formName: 'KTO-03' },
    { title: 'Afhandeling FAT-restpunten MS-verdeler', formName: 'MSV-01' },
    { title: 'Gecombineerde keuringen MS-verdeler', formName: 'MSV' },
    { title: "Controle afhandeling FAT-restpunten trafo's", formName: 'TR-01' },
    { title: "Keuringen trafo's", formName: 'TR' },
    { title: 'Controle aanleg kabels op kabelblokken MS-kabels', formName: 'MSK-09' },
    { title: 'Controle testen MS-kabels', formName: 'MSK-10' },
    { title: 'Controle eindsluitingen MS-kabelcircuit', formName: 'MSK-11' }
  ];
  const migrationIdPrefix = 'vh-template-v2-';

  function createVHInspections(existing) {
    const retained = existing.filter(item => !vhSections.includes(item.section));
    vhSections.forEach(section => {
      vhInspectionTemplates.forEach((template, index) => {
        retained.push({
          id: `${migrationIdPrefix}${section}-${index + 1}`,
          section,
          title: template.title,
          formName: template.formName,
          status: 'Niet gestart',
          owner: ''
        });
      });
    });
    return retained;
  }

  // New/empty databases get the requested VH inspections as their defaults too.
  const originalDefaultInspections = defaultInspections;
  defaultInspections = () => createVHInspections(originalDefaultInspections());

  // Migrate existing Firebase data once. Presence of the stable IDs means the
  // migration has already been applied; later user edits/deletions are preserved.
  const originalNormalizeInspections = normalizeInspections;
  normalizeInspections = raw => {
    const normalized = originalNormalizeInspections(raw);
    if (normalized.some(item => String(item.id).startsWith(migrationIdPrefix))) return normalized;

    const migrated = createVHInspections(normalized);
    if (database) {
      database.ref('keuringsvoortgang/inspections').set(migrated).catch(error => {
        console.error(error);
        showToast('De nieuwe VH-keuringen konden niet naar Firebase worden opgeslagen.');
      });
    }
    return migrated;
  };
})();
