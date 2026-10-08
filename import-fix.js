/* PIM Asset Register - robust Excel importer fix */
(() => {
  let fixedRows = [];
  const $ = (id) => document.getElementById(id);
  const clean = (v) => String(v ?? '').trim();
  const norm = (v) => clean(v).toLowerCase().replace(/[._-]/g, ' ').replace(/\s+/g, ' ');
  const html = (v) => clean(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const client = window.supabase.createClient(
    window.APP_CONFIG.SUPABASE_URL,
    window.APP_CONFIG.SUPABASE_ANON_KEY
  );

  function notify(message) {
    const el = $('importMessage');
    if (el) el.textContent = message;
  }

  function findHeader(matrix) {
    const limit = Math.min(matrix.length, 25);
    for (let i = 0; i < limit; i++) {
      const row = (matrix[i] || []).map(norm);
      if (row.some(v => v === 'tagname' || v === 'tag name')) return i;
    }
    return -1;
  }

  function valueByHeader(row, headerMap, aliases) {
    for (const alias of aliases) {
      const idx = headerMap[norm(alias)];
      if (idx !== undefined) return clean(row[idx]);
    }
    return '';
  }

  async function previewFixed() {
    const file = $('excelFile')?.files?.[0];
    if (!file) return notify('Pilih file Excel terlebih dahulu.');

    fixedRows = [];
    $('runImport').disabled = true;
    notify('Membaca file dan mencari header pada setiap sheet...');

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const skipped = [];

      for (const sheetName of workbook.SheetNames) {
        if (['summary', 'equipments sap', 'cc'].includes(norm(sheetName))) continue;

        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
          raw: false,
          blankrows: false
        });

        const headerIndex = findHeader(matrix);
        if (headerIndex < 0) {
          skipped.push(sheetName);
          continue;
        }

        const headers = matrix[headerIndex].map(norm);
        const headerMap = {};
        headers.forEach((h, i) => { if (h && headerMap[h] === undefined) headerMap[h] = i; });

        for (let i = headerIndex + 1; i < matrix.length; i++) {
          const row = matrix[i] || [];
          const tag = valueByHeader(row, headerMap, ['Tagname', 'Tag Name']);
          if (!tag) continue;

          const floc = valueByHeader(row, headerMap, ['Function Location', 'Functional Location']);
          const equipment = valueByHeader(row, headerMap, ['Equipment No.', 'Equipment No', 'Equipment Number']);

          // Abaikan baris template berupa nomor urut tanpa data aset.
          if (/^\d+$/.test(tag) && !floc && !equipment) continue;

          fixedRows.push({
            category: sheetName,
            tagname: tag,
            functional_location: floc,
            equipment_number: equipment,
            object_type: valueByHeader(row, headerMap, ['Object Type']),
            plant_area: valueByHeader(row, headerMap, ['Plant/Area', 'Plant/Location']),
            brand: valueByHeader(row, headerMap, ['Brand']),
            model: valueByHeader(row, headerMap, ['Model']),
            remarks: valueByHeader(row, headerMap, ['Remark', 'Remarks']),
            source_sheet: sheetName
          });
        }
      }

      $('previewRows').innerHTML = fixedRows.slice(0, 100).map(r => `
        <tr>
          <td>${html(r.category)}</td>
          <td>${html(r.tagname)}</td>
          <td>${html(r.functional_location)}</td>
          <td>${html(r.equipment_number)}</td>
          <td>${html(r.object_type)}</td>
        </tr>`).join('');

      $('runImport').disabled = fixedRows.length === 0;
      notify(`${fixedRows.length.toLocaleString('id-ID')} baris valid ditemukan. Preview maksimum 100 baris.${skipped.length ? ' Sheet tanpa header dilewati: ' + skipped.join(', ') : ''}`);
    } catch (error) {
      console.error(error);
      notify(`Gagal membaca Excel: ${error.message}`);
    }
  }

  async function importFixed() {
    if (!fixedRows.length) return notify('Klik Preview terlebih dahulu.');
    const button = $('runImport');
    button.disabled = true;
    let success = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < fixedRows.length; i += 100) {
      const batch = fixedRows.slice(i, i + 100);
      notify(`Mengimpor ${Math.min(i + batch.length, fixedRows.length).toLocaleString('id-ID')} dari ${fixedRows.length.toLocaleString('id-ID')} baris...`);
      const { error } = await client.from('assets').insert(batch);
      if (error) {
        failed += batch.length;
        errors.push(error.message);
        console.error('Import batch gagal:', error);
      } else {
        success += batch.length;
      }
    }

    notify(`Import selesai. Berhasil: ${success.toLocaleString('id-ID')}, gagal: ${failed.toLocaleString('id-ID')}${errors.length ? '. Error: ' + errors[0] : ''}`);
    button.disabled = false;
    if (success) setTimeout(() => location.reload(), 1800);
  }

  function installFix() {
    const preview = $('previewImport');
    const run = $('runImport');
    if (!preview || !run) return setTimeout(installFix, 300);
    preview.onclick = previewFixed;
    run.onclick = importFixed;
    console.log('PIM robust Excel importer fix aktif.');
  }

  installFix();
})();
