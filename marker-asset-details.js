/*
 PIM Asset Register - Marker Asset Detail Module
 - Marker area uses area_markers.area_name
 - Asset matching uses assets.plant_area
 - pengunjung: read-only
 - technician/administrator: edit asset and add marker
*/
(() => {
  const WAIT_MS = 250;
  const PUBLIC_ROLES = ['pengunjung', 'technician', 'administrator'];
  let client = null;
  let session = null;
  let role = 'public';
  let allAssets = [];
  let observer = null;

  const clean = value => String(value ?? '').trim();
  const norm = value => clean(value).toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');
  const escapeHtml = value => clean(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function notify(message) {
    const existingToast = document.getElementById('toast');
    if (existingToast) {
      existingToast.textContent = message;
      existingToast.style.display = 'block';
      setTimeout(() => existingToast.style.display = 'none', 3000);
      return;
    }
    alert(message);
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .mad-panel{margin-top:14px;padding:16px;background:#fff;border:1px solid #d8e2ed;border-radius:13px}
      .mad-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .mad-head h3{margin:0}.mad-summary{color:#64748b;font-size:12px}
      .mad-search{width:100%;max-width:430px;padding:10px 12px;border:1px solid #d8e2ed;border-radius:9px;margin-bottom:11px}
      .mad-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;max-height:430px;overflow:auto}
      .mad-item{padding:11px;border:1px solid #e3eaf2;border-radius:10px;background:#f9fbfd;cursor:pointer;text-align:left}
      .mad-item:hover{border-color:#79a9cf;background:#eef7fd}.mad-item b{display:block;color:#155f92}.mad-item small{color:#64748b}
      .mad-empty{padding:20px;text-align:center;color:#64748b;border:1px dashed #b5c7d9;border-radius:10px}
      .mad-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.mad-field{padding:10px;border:1px solid #e3eaf2;border-radius:9px;background:#f8fafc}
      .mad-field small{display:block;color:#64748b;margin-bottom:4px}.mad-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .mad-modal{display:none;position:fixed;inset:0;z-index:60;background:#07172db5;place-items:center;padding:15px}.mad-modal.open{display:grid}
      .mad-dialog{width:min(820px,100%);max-height:92vh;overflow:auto;background:white;border-radius:16px;padding:20px}.mad-close{float:right;border:0;width:36px;height:36px;border-radius:50%;cursor:pointer}
      .mad-form{display:grid;grid-template-columns:1fr 1fr;gap:11px}.mad-form label{font-size:12px;color:#64748b}.mad-form input,.mad-form select,.mad-form textarea{display:block;width:100%;margin-top:5px;padding:10px;border:1px solid #d8e2ed;border-radius:9px}.mad-full{grid-column:1/-1}
      .mad-marker-dialog{width:min(460px,100%)}
      @media(max-width:700px){.mad-list,.mad-detail-grid,.mad-form{grid-template-columns:1fr}.mad-full{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function addModals() {
    if (!document.getElementById('madAssetModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="mad-modal" id="madAssetModal">
          <div class="mad-dialog">
            <button class="mad-close" id="madCloseAsset">×</button>
            <h3 id="madAssetTitle">Detail Asset</h3>
            <div id="madAssetBody"></div>
          </div>
        </div>
        <div class="mad-modal" id="madMarkerModal">
          <div class="mad-dialog mad-marker-dialog">
            <button class="mad-close" id="madCloseMarker">×</button>
            <h3>Tambah Marker Area</h3>
            <form id="madMarkerForm" class="mad-form" style="grid-template-columns:1fr">
              <label>Pilih Plant/Area
                <select name="area_name" id="madAreaSelect" required></select>
              </label>
              <input type="hidden" name="map_x"><input type="hidden" name="map_y"><input type="hidden" name="site_plan_id">
              <button type="submit" class="btn primary">Simpan Marker</button>
            </form>
          </div>
        </div>
      `);
      document.getElementById('madCloseAsset').onclick = () => document.getElementById('madAssetModal').classList.remove('open');
      document.getElementById('madCloseMarker').onclick = () => document.getElementById('madMarkerModal').classList.remove('open');
      document.getElementById('madAssetModal').onclick = event => { if (event.target.id === 'madAssetModal') event.currentTarget.classList.remove('open'); };
      document.getElementById('madMarkerModal').onclick = event => { if (event.target.id === 'madMarkerModal') event.currentTarget.classList.remove('open'); };
      document.getElementById('madMarkerForm').onsubmit = saveMarker;
    }
  }

  async function fetchAllAssets() {
    if (!session) { allAssets = []; return; }
    const records = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await client.from('assets').select('*').order('created_at', { ascending: false }).range(start, start + 999);
      if (error) throw error;
      records.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
    allAssets = records;
  }

  async function loadRole() {
    const result = await client.auth.getSession();
    session = result.data.session;
    role = 'public';
    if (session) {
      const profile = await client.from('user_profiles').select('role,active').eq('id', session.user.id).single();
      role = profile.data?.active === false ? 'pengunjung' : (profile.data?.role || 'pengunjung');
      if (!PUBLIC_ROLES.includes(role)) role = 'pengunjung';
    }
    await fetchAllAssets();
  }

  function assetsForArea(areaName) {
    return allAssets.filter(asset => norm(asset.plant_area) === norm(areaName));
  }

  function ensureAreaPanel() {
    const mapBox = document.getElementById('planBox') || document.getElementById('pspBox');
    if (!mapBox) return null;
    let panel = document.getElementById('madAreaAssets');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'madAreaAssets'; panel.className = 'mad-panel';
      panel.innerHTML = '<div class="mad-empty">Klik marker area untuk melihat daftar asset.</div>';
      mapBox.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function showAreaAssets(areaName) {
    const panel = ensureAreaPanel();
    if (!panel) return;
    const matched = assetsForArea(areaName);
    panel.innerHTML = `
      <div class="mad-head">
        <div><h3>${escapeHtml(areaName)}</h3><div class="mad-summary">${matched.length.toLocaleString('id-ID')} asset ditemukan berdasarkan Plant/Area</div></div>
      </div>
      <input class="mad-search" id="madAreaSearch" placeholder="Cari Tagname, kategori, Functional Location, Equipment Number">
      <div class="mad-list" id="madAssetList"></div>
    `;
    const draw = query => {
      const q = norm(query);
      const filtered = matched.filter(asset => !q || norm([asset.tagname, asset.category, asset.functional_location, asset.equipment_number, asset.object_type, asset.brand, asset.model].join(' ')).includes(q));
      document.getElementById('madAssetList').innerHTML = filtered.length ? filtered.map(asset => `
        <button class="mad-item" data-asset-id="${asset.id}">
          <b>${escapeHtml(asset.tagname)}</b>
          <small>${escapeHtml(asset.category)} · ${escapeHtml(asset.condition || 'Belum Diverifikasi')}</small>
        </button>
      `).join('') : '<div class="mad-empty">Asset tidak ditemukan.</div>';
      document.querySelectorAll('[data-asset-id]').forEach(button => button.onclick = () => showAsset(button.dataset.assetId));
    };
    draw('');
    document.getElementById('madAreaSearch').oninput = event => draw(event.target.value);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function detailField(label, value) {
    return `<div class="mad-field"><small>${label}</small><b>${escapeHtml(value) || '-'}</b></div>`;
  }

  function showAsset(id) {
    const asset = allAssets.find(item => item.id === id);
    if (!asset) return;
    const editable = ['technician', 'administrator'].includes(role);
    document.getElementById('madAssetTitle').textContent = editable ? 'Detail / Edit Asset' : 'Detail Asset';
    document.getElementById('madAssetBody').innerHTML = editable ? `
      <form id="madEditForm" class="mad-form">
        <label>Kategori<input name="category" value="${escapeHtml(asset.category)}" required></label>
        <label>Tagname<input name="tagname" value="${escapeHtml(asset.tagname)}" required></label>
        <label class="mad-full">Functional Location<input name="functional_location" value="${escapeHtml(asset.functional_location)}"></label>
        <label>Equipment Number<input name="equipment_number" value="${escapeHtml(asset.equipment_number)}"></label>
        <label>Object Type<input name="object_type" value="${escapeHtml(asset.object_type)}"></label>
        <label>Plant/Area<input name="plant_area" value="${escapeHtml(asset.plant_area)}"></label>
        <label>Brand<input name="brand" value="${escapeHtml(asset.brand)}"></label>
        <label>Model<input name="model" value="${escapeHtml(asset.model)}"></label>
        <label>Serial Number<input name="serial_number" value="${escapeHtml(asset.serial_number)}"></label>
        <label>Condition<select name="condition"><option>Belum Diverifikasi</option><option>Good</option><option>Need Attention</option><option>Bad</option></select></label>
        <label class="mad-full">Remark<textarea name="remarks">${escapeHtml(asset.remarks)}</textarea></label>
        <div class="mad-full mad-actions"><button class="btn primary">Simpan Perubahan</button></div>
      </form>
    ` : `
      <div class="mad-detail-grid">
        ${detailField('Tagname', asset.tagname)}${detailField('Kategori', asset.category)}
        ${detailField('Functional Location', asset.functional_location)}${detailField('Equipment Number', asset.equipment_number)}
        ${detailField('Object Type', asset.object_type)}${detailField('Plant/Area', asset.plant_area)}
        ${detailField('Brand', asset.brand)}${detailField('Model', asset.model)}
        ${detailField('Serial Number', asset.serial_number)}${detailField('Condition', asset.condition)}
        <div class="mad-full">${detailField('Remark', asset.remarks)}</div>
      </div>
    `;
    document.getElementById('madAssetModal').classList.add('open');
    const form = document.getElementById('madEditForm');
    if (form) {
      form.querySelector('[name=condition]').value = asset.condition || 'Belum Diverifikasi';
      form.onsubmit = async event => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(form).entries());
        Object.keys(payload).forEach(key => payload[key] = clean(payload[key]) || null);
        payload.updated_at = new Date().toISOString();
        const result = await client.from('assets').update(payload).eq('id', id);
        if (result.error) return notify(result.error.message);
        await fetchAllAssets();
        document.getElementById('madAssetModal').classList.remove('open');
        showAreaAssets(payload.plant_area || asset.plant_area);
        notify('Asset berhasil diperbarui.');
      };
    }
  }

  async function openMarkerDialog(event, planElement) {
    if (!['technician', 'administrator'].includes(role) || event.target.tagName !== 'IMG') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const rect = planElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width * 100).toFixed(2);
    const y = ((event.clientY - rect.top) / rect.height * 100).toFixed(2);
    const planResult = await client.from('site_plans').select('id').eq('active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (planResult.error || !planResult.data) return notify('Denah aktif tidak ditemukan.');
    const areas = [...new Set(allAssets.map(asset => clean(asset.plant_area)).filter(Boolean))].sort();
    const select = document.getElementById('madAreaSelect');
    select.innerHTML = '<option value="">Pilih area...</option>' + areas.map(area => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join('');
    const form = document.getElementById('madMarkerForm');
    form.map_x.value = x; form.map_y.value = y; form.site_plan_id.value = planResult.data.id;
    document.getElementById('madMarkerModal').classList.add('open');
  }

  async function saveMarker(event) {
    event.preventDefault();
    if (!['technician', 'administrator'].includes(role)) return notify('Role tidak diizinkan membuat marker.');
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const result = await client.from('area_markers').insert(payload);
    if (result.error) return notify(result.error.message);
    document.getElementById('madMarkerModal').classList.remove('open');
    notify('Marker area berhasil disimpan. Buka ulang menu Denah Asset untuk melihat marker.');
  }

  function connectMap() {
    const plan = document.getElementById('plan') || document.getElementById('pspPlan');
    if (plan && !plan.dataset.madConnected) {
      plan.dataset.madConnected = '1';
      plan.addEventListener('click', event => openMarkerDialog(event, plan), true);
    }
    const markerButtons = document.querySelectorAll('.marker,.psp-marker');
    markerButtons.forEach(marker => {
      if (marker.dataset.madConnected) return;
      marker.dataset.madConnected = '1';
      marker.addEventListener('click', event => {
        event.preventDefault(); event.stopImmediatePropagation();
        const areaName = clean(marker.title) || clean(marker.dataset.areaName);
        if (areaName) showAreaAssets(areaName);
      }, true);
    });
    ensureAreaPanel();
  }

  async function initialize() {
    if (!window.supabase || !window.APP_CONFIG?.SUPABASE_URL || !window.APP_CONFIG?.SUPABASE_ANON_KEY) return false;
    client = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    addStyles(); addModals(); await loadRole();
    observer = new MutationObserver(connectMap);
    observer.observe(document.body, { childList: true, subtree: true });
    connectMap();
    client.auth.onAuthStateChange(async (_event, newSession) => {
      session = newSession;
      await loadRole();
      connectMap();
    });
    return true;
  }

  const timer = setInterval(async () => {
    if (await initialize()) clearInterval(timer);
  }, WAIT_MS);
})();
