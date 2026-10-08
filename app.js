"use strict";

/* ============================================================
   PIM EI & OT ASSET REGISTER
   Clean online application controller
   Requires: config.js, Supabase JS v2, XLSX (for Excel import)
   ============================================================ */

const APP = window.APP_CONFIG || {};
const supabaseClient = window.supabase?.createClient(
  APP.SUPABASE_URL,
  APP.SUPABASE_ANON_KEY
);

const ADMIN_EMAIL = String(APP.ADMIN_EMAIL || "smartworkreport@gmail.com").toLowerCase();
const PHOTO_BUCKET = "asset-photos";
const PHOTO_MAX_SIZE = 5 * 1024 * 1024;
const PAGE_SIZE = 50;

const state = {
  assets: [],
  photos: [],
  user: null,
  role: "viewer",
  page: 1,
  selectedAssetId: null,
  selectedPhotoFile: null,
  selectedPhotoPreview: "",
  currentPhotoId: null,
  loading: false
};

const $ = (id) => document.getElementById(id);
const q = (selector, root = document) => root.querySelector(selector);
const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
const value = (id) => $(id)?.value?.trim?.() || "";
const setValue = (id, val = "") => { if ($(id)) $(id).value = val ?? ""; };
const show = (id, visible = true) => $(id)?.classList.toggle("hidden", !visible);
const escapeHtml = (input) => String(input ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
const normalize = (text) => String(text ?? "").trim();
const upper = (text) => normalize(text).toUpperCase();
const isAdmin = () => state.role === "administrator";
const isTechnician = () => state.role === "technician";
const canDocument = () => isAdmin() || isTechnician();

function notify(message, type = "info") {
  let box = $("appToast");
  if (!box) {
    box = document.createElement("div");
    box.id = "appToast";
    box.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:9999;max-width:420px;padding:12px 16px;border-radius:10px;color:#fff;font:600 14px Segoe UI,Arial;box-shadow:0 8px 30px #0004;transition:.25s";
    document.body.appendChild(box);
  }
  box.style.background = type === "error" ? "#b42318" : type === "success" ? "#176b55" : "#245b78";
  box.textContent = message;
  box.hidden = false;
  clearTimeout(box._timer);
  box._timer = setTimeout(() => { box.hidden = true; }, 4500);
}

function setBusy(active, message = "Memproses...") {
  state.loading = active;
  let overlay = $("appBusy");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "appBusy";
    overlay.style.cssText = "position:fixed;inset:0;z-index:9998;display:grid;place-items:center;background:#09241f88;color:#fff;font:700 16px Segoe UI,Arial";
    document.body.appendChild(overlay);
  }
  overlay.textContent = message;
  overlay.hidden = !active;
}

/* ======================== ROLE & LOGIN ======================== */

async function resolveRole(user) {
  if (!user) return "viewer";
  if (String(user.email || "").toLowerCase() === ADMIN_EMAIL) return "administrator";
  if (!supabaseClient) return "technician";
  const { data } = await supabaseClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "administrator" ? "administrator" : "technician";
}

async function applySession(session) {
  state.user = session?.user || null;
  state.role = await resolveRole(state.user);
  updateAccessUI();
}

function updateAccessUI() {
  if ($("roleBadge")) $("roleBadge").textContent = state.role.toUpperCase();
  show("loginBtn", !state.user);
  show("logoutBtn", !!state.user);
  show("manageBtn", isAdmin());
  show("addBtn", isAdmin());
  qa("[data-admin-only]").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
  qa("[data-document-only]").forEach((el) => el.classList.toggle("hidden", !canDocument()));
  renderAssetTable();
}

async function login(event) {
  event?.preventDefault();
  if (!supabaseClient) return notify("Konfigurasi Supabase belum tersedia.", "error");
  const email = value("email");
  const password = value("password");
  if (!email || !password) return notify("Email dan password wajib diisi.", "error");
  setBusy(true, "Login...");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  setBusy(false);
  if (error) {
    if ($("loginError")) $("loginError").textContent = error.message;
    return notify(`Login gagal: ${error.message}`, "error");
  }
  await applySession(data.session);
  closeModal("loginModal");
  notify(`Login berhasil sebagai ${state.role}.`, "success");
}

async function logout() {
  await supabaseClient?.auth.signOut();
  await applySession(null);
  showView("dashboard");
  notify("Logout berhasil.", "success");
}

/* ======================== AREA MAPPING ======================== */

function classifyArea(functionalLocation = "", plantArea = "", tagname = "") {
  const text = upper(`${plantArea} ${functionalLocation} ${tagname}`);
  const rules = [
    ["RDS A", /RDY01|RDS\s*A\b|RDSA/],
    ["RDS B", /RDY02|RDS\s*B\b|RDSB/],
    ["HMP A", /HML01|HMP\s*A\b|HMPA/],
    ["HMP B", /HML02|HMP\s*B\b|HMPB/],
    ["PACKING A", /PCK01|PACK(?:ING)?\s*A\b/],
    ["PACKING B", /PCK02|PACK(?:ING)?\s*B\b/],
    ["PELLETIZING", /PELLET/],
    ["ENGINEERING", /ENG01|ENGINEER|WORKSHOP/],
    ["OFFICE", /OFFICE|ADMIN/],
    ["OPERATIONAL", /OPERATIONAL|OPERASIONAL/],
    ["WAREHOUSE", /WAREHOUSE|GUDANG|\bWH\b/],
    ["UTILITY", /UTILITY|\bUTY\b|GEN01/],
    ["LABORATORY", /LABORATORY|\bLAB\b/],
    ["SECURITY", /SECURITY|SATPAM/],
    ["MESS", /\bMESS\b/],
    ["WWTP", /WWTP|WASTE/],
    ["SILO", /SILO/],
    ["GOH", /\bGOH\b/],
    ["GAD", /\bGAD\b/]
  ];
  return rules.find(([, regex]) => regex.test(text))?.[0] || upper(plantArea) || "AREA BELUM DITENTUKAN";
}

function stableAssetUid(asset) {
  const source = upper([
    asset.category,
    asset.functional_location,
    asset.equipment_no,
    asset.tagname
  ].join("|"));
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `A-${(hash >>> 0).toString(16).toUpperCase()}-${btoa(unescape(encodeURIComponent(source))).replace(/\W/g, "").slice(0, 11)}`;
}

/* ======================== DATA LOADING ======================== */

async function fetchAllRows(table, orderColumn = null) {
  if (!supabaseClient) return [];
  const all = [];
  let from = 0;
  while (true) {
    let request = supabaseClient.from(table).select("*").range(from, from + 999);
    if (orderColumn) request = request.order(orderColumn, { ascending: false });
    const { data, error } = await request;
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function loadFallbackAssets() {
  try {
    const response = await fetch("assets/assets.json", { cache: "no-store" });
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

async function loadAssets() {
  setBusy(true, "Memuat database aset...");
  try {
    const online = await fetchAllRows("assets");
    state.assets = online.length ? online : await loadFallbackAssets();
    state.assets = state.assets.map((asset) => ({
      ...asset,
      equipment_no: asset.equipment_no || asset.equipment_number || "",
      equipment_number: asset.equipment_number || asset.equipment_no || "",
      remark: asset.remark || asset.remarks || "",
      remarks: asset.remarks || asset.remark || "",
      status: asset.status || "Active",
      condition: asset.condition || "Unknown",
      area_group: asset.area_group || asset.map_group || classifyArea(asset.functional_location, asset.plant_area, asset.tagname),
      asset_uid: asset.asset_uid || stableAssetUid(asset)
    }));
    refreshAll();
  } catch (error) {
    console.error(error);
    state.assets = await loadFallbackAssets();
    refreshAll();
    notify(`Data online gagal dimuat. Menampilkan data lokal: ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function loadPhotos(assetId = null) {
  if (!supabaseClient) return [];
  let request = supabaseClient.from("asset_photos").select("*").eq("is_active", true).order("uploaded_at", { ascending: false });
  if (assetId) request = request.eq("asset_id", assetId);
  const { data, error } = await request;
  if (error) throw error;
  if (!assetId) state.photos = data || [];
  return data || [];
}

/* ======================== DASHBOARD ======================== */

function getAreaCounts() {
  return state.assets.reduce((result, asset) => {
    const area = asset.area_group || "AREA BELUM DITENTUKAN";
    result[area] = (result[area] || 0) + 1;
    return result;
  }, {});
}

function renderDashboard() {
  const areaCounts = getAreaCounts();
  const categoryCount = new Set(state.assets.map((a) => a.category).filter(Boolean)).size;
  const activeCount = state.assets.filter((a) => (a.status || "Active") === "Active").length;
  const unknownCount = state.assets.filter((a) => a.area_group === "AREA BELUM DITENTUKAN").length;
  if ($("kpis")) {
    $("kpis").innerHTML = [
      ["Total Aset", state.assets.length],
      ["Kategori", categoryCount],
      ["Aset Aktif", activeCount],
      ["Perlu Mapping", unknownCount]
    ].map(([label, number]) => `<div class="kpi"><span>${label}</span><b>${Number(number).toLocaleString("id-ID")}</b></div>`).join("");
  }
  const sortedAreas = Object.entries(areaCounts).sort((a, b) => b[1] - a[1]);
  const maximum = sortedAreas[0]?.[1] || 1;
  if ($("areaChart")) {
    $("areaChart").innerHTML = sortedAreas.map(([area, count]) => `
      <button class="bar-row" type="button" data-area="${escapeHtml(area)}">
        <span class="bar-label"><span>${escapeHtml(area)}</span><b>${count}</b></span>
        <span class="bar"><i style="width:${(count / maximum) * 100}%"></i></span>
      </button>`).join("");
    qa("[data-area]", $("areaChart")).forEach((button) => button.addEventListener("click", () => openArea(button.dataset.area)));
  }
  if ($("recent")) {
    const recent = [...state.assets].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 8);
    $("recent").innerHTML = `<div class="mini-list">${recent.map((a) => `
      <button type="button" class="mini" data-detail-id="${escapeHtml(a.id)}">
        <b>${escapeHtml(a.tagname || "-")}</b>
        <span>${escapeHtml(a.functional_location || "-")}</span>
        <span>${escapeHtml(a.area_group || "-")}</span>
      </button>`).join("")}</div>`;
    qa("[data-detail-id]", $("recent")).forEach((button) => button.addEventListener("click", () => openAssetDetail(button.dataset.detailId)));
  }
}

/* ======================== FILTER & TABLE ======================== */

function uniqueValues(key) {
  return [...new Set(state.assets.map((row) => normalize(row[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function fillSelect(id, firstLabel, values) {
  const select = $(id);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${firstLabel}</option>${values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}`;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function refreshFilters() {
  fillSelect("areaFilter", "Semua Area", uniqueValues("area_group"));
  fillSelect("categoryFilter", "Semua Category", uniqueValues("category"));
  fillSelect("mapArea", "Pilih area...", uniqueValues("area_group"));
  const areaEditor = $("fArea");
  if (areaEditor) {
    const current = areaEditor.value;
    areaEditor.innerHTML = uniqueValues("area_group").concat(["AREA BELUM DITENTUKAN"]).filter((v, i, arr) => arr.indexOf(v) === i).sort().map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    if ([...areaEditor.options].some((option) => option.value === current)) areaEditor.value = current;
  }
}

function filteredAssets() {
  const search = value("search").toLowerCase();
  const area = value("areaFilter");
  const category = value("categoryFilter");
  const status = value("statusFilter");
  return state.assets.filter((asset) => {
    const matchesSearch = !search || Object.values(asset).some((item) => String(item ?? "").toLowerCase().includes(search));
    return matchesSearch && (!area || asset.area_group === area) && (!category || asset.category === category) && (!status || asset.status === status);
  });
}

function renderAssetTable() {
  const body = $("assetRows");
  if (!body) return;
  const records = filteredAssets();
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);
  const rows = records.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  if ($("assetCount")) $("assetCount").textContent = `${records.length.toLocaleString("id-ID")} aset ditemukan`;
  body.innerHTML = rows.map((asset) => `
    <tr>
      <td>${escapeHtml(asset.category || "-")}</td>
      <td><b>${escapeHtml(asset.tagname || "-")}</b></td>
      <td class="wrap">${escapeHtml(asset.functional_location || "-")}</td>
      <td>${escapeHtml(asset.equipment_no || "-")}</td>
      <td>${escapeHtml(asset.plant_area || "-")}</td>
      <td>${escapeHtml(asset.area_group || "-")}</td>
      <td><span class="status">${escapeHtml(asset.status || "Active")}</span></td>
      <td class="row-actions">
        <button type="button" data-detail="${escapeHtml(asset.id)}">Detail</button>
        ${canDocument() ? `<button type="button" data-photo="${escapeHtml(asset.id)}">Foto</button>` : ""}
        ${canDocument() ? `<button type="button" data-edit="${escapeHtml(asset.id)}">Edit</button>` : ""}
        ${isAdmin() ? `<button type="button" class="danger" data-delete="${escapeHtml(asset.id)}">Hapus</button>` : ""}
      </td>
    </tr>`).join("");
  qa("[data-detail]", body).forEach((button) => button.addEventListener("click", () => openAssetDetail(button.dataset.detail)));
  qa("[data-photo]", body).forEach((button) => button.addEventListener("click", () => openPhotoManager(button.dataset.photo)));
  qa("[data-edit]", body).forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.edit)));
  qa("[data-delete]", body).forEach((button) => button.addEventListener("click", () => deleteAsset(button.dataset.delete)));
  if ($("pager")) {
    $("pager").innerHTML = `<button id="prevPage" ${state.page <= 1 ? "disabled" : ""}>‹</button><span>${state.page} / ${pages}</span><button id="nextPage" ${state.page >= pages ? "disabled" : ""}>›</button>`;
    $("prevPage")?.addEventListener("click", () => { state.page -= 1; renderAssetTable(); });
    $("nextPage")?.addEventListener("click", () => { state.page += 1; renderAssetTable(); });
  }
}

function openArea(area) {
  setValue("areaFilter", area);
  setValue("search", "");
  state.page = 1;
  showView("assets");
  renderAssetTable();
}

/* ======================== ASSET CRUD ======================== */

function getAssetFormData(existing = {}) {
  const asset = {
    ...existing,
    category: value("fCategory"),
    tagname: value("fTagname"),
    functional_location: value("fFunloc"),
    equipment_no: value("fEquipment"),
    equipment_number: value("fEquipment"),
    plant_area: value("fPlant"),
    area_group: value("fArea") || classifyArea(value("fFunloc"), value("fPlant"), value("fTagname")),
    brand: value("fBrand"),
    model: value("fModel"),
    status: value("fStatus") || "Active",
    condition: value("fCondition") || "Unknown",
    remark: value("fRemark"),
    remarks: value("fRemark"),
    updated_at: new Date().toISOString()
  };
  asset.asset_uid = existing.asset_uid || stableAssetUid(asset);
  asset.id = existing.id || crypto.randomUUID();
  return asset;
}

function openEditor(assetId = null) {
  if (!canDocument()) return notify("Silakan login terlebih dahulu.", "error");
  if (!assetId && !isAdmin()) return notify("Hanya Administrator yang dapat menambah aset.", "error");
  const asset = state.assets.find((row) => row.id === assetId) || {};
  state.selectedAssetId = asset.id || null;
  setValue("assetId", asset.id);
  setValue("fCategory", asset.category);
  setValue("fTagname", asset.tagname);
  setValue("fFunloc", asset.functional_location);
  setValue("fEquipment", asset.equipment_no);
  setValue("fPlant", asset.plant_area);
  setValue("fArea", asset.area_group || classifyArea(asset.functional_location, asset.plant_area, asset.tagname));
  setValue("fBrand", asset.brand);
  setValue("fModel", asset.model);
  setValue("fStatus", asset.status || "Active");
  setValue("fCondition", asset.condition || "Unknown");
  setValue("fRemark", asset.remark);
  if ($("editTitle")) $("editTitle").textContent = assetId ? "Edit Aset" : "Tambah Aset";
  const masterFields = ["fCategory", "fTagname", "fFunloc", "fEquipment", "fPlant", "fArea", "fBrand", "fModel"];
  masterFields.forEach((id) => { if ($(id)) $(id).disabled = !isAdmin(); });
  show("editModal", true);
}

async function saveAsset(event) {
  event?.preventDefault();
  if (!canDocument()) return notify("Tidak memiliki akses menyimpan data.", "error");
  const existing = state.assets.find((row) => row.id === value("assetId")) || {};
  const asset = getAssetFormData(existing);
  if (!asset.tagname && !asset.functional_location && !asset.equipment_no) return notify("Isi minimal Tagname, Functional Location, atau Equipment Number.", "error");
  setBusy(true, "Menyimpan aset...");
  try {
    const { error } = await supabaseClient.from("assets").upsert(asset);
    if (error) throw error;
    const index = state.assets.findIndex((row) => row.id === asset.id);
    if (index < 0) state.assets.push(asset); else state.assets[index] = asset;
    closeModal("editModal");
    refreshAll();
    notify("Data aset berhasil disimpan.", "success");
  } catch (error) {
    console.error(error);
    if ($("saveError")) $("saveError").textContent = error.message;
    notify(`Gagal menyimpan aset: ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function deleteAsset(assetId) {
  if (!isAdmin()) return notify("Hanya Administrator yang dapat menghapus aset.", "error");
  const asset = state.assets.find((row) => row.id === assetId);
  if (!confirm(`Hapus aset ${asset?.tagname || assetId} beserta dokumentasinya?`)) return;
  setBusy(true, "Menghapus aset...");
  try {
    const photos = await loadPhotos(assetId);
    const paths = photos.map((photo) => photo.photo_path).filter(Boolean);
    if (paths.length) await supabaseClient.storage.from(PHOTO_BUCKET).remove(paths);
    const { error } = await supabaseClient.from("assets").delete().eq("id", assetId);
    if (error) throw error;
    state.assets = state.assets.filter((row) => row.id !== assetId);
    refreshAll();
    notify("Aset berhasil dihapus.", "success");
  } catch (error) {
    notify(`Gagal menghapus aset: ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

/* ======================== PHOTO DOCUMENTATION ======================== */

function ensurePhotoModal() {
  if ($("photoModal")) return;
  const wrapper = document.createElement("div");
  wrapper.id = "photoModal";
  wrapper.className = "modal hidden";
  wrapper.innerHTML = `
    <div class="dialog wide photo-manager-dialog">
      <button type="button" class="close" data-close-photo>×</button>
      <h2>Dokumentasi Foto Aset</h2>
      <div id="photoAssetIdentity"></div>
      <div id="photoGallery" class="photo-gallery"></div>
      <hr>
      <form id="photoForm">
        <input id="photoId" type="hidden">
        <div class="form-grid">
          <label>Jenis Dokumentasi
            <select id="photoType">
              <option>Asset Photo</option><option>Nameplate</option><option>Panel Overview</option>
              <option>Internal Panel</option><option>Wiring</option><option>Motor</option>
              <option>Instrument</option><option>Inspection</option><option>Maintenance</option>
              <option>Finding</option><option>After Repair</option><option>Other</option>
            </select>
          </label>
          <label>Condition
            <select id="photoCondition"><option>Good</option><option>Warning</option><option>Bad</option><option>Unknown</option></select>
          </label>
          <label class="full">Deskripsi Foto
            <textarea id="photoDescription" required placeholder="Jelaskan objek, posisi, kondisi, atau temuan pada foto..."></textarea>
          </label>
          <label>Tanggal Foto<input id="photoTakenAt" type="datetime-local"></label>
          <label class="check-label"><input id="photoPrimary" type="checkbox"> Jadikan foto utama</label>
        </div>
        <div class="photo-upload-actions">
          <button type="button" id="cameraPhotoBtn">📷 Ambil Foto</button>
          <button type="button" id="galleryPhotoBtn">🖼 Pilih Galeri</button>
          <input id="cameraPhotoInput" class="hidden" type="file" accept="image/*" capture="environment">
          <input id="galleryPhotoInput" class="hidden" type="file" accept="image/jpeg,image/png,image/webp">
        </div>
        <div id="photoPreviewWrap" class="photo-preview-wrap"><span>Belum ada foto dipilih</span><img id="photoPreview" class="hidden" alt="Preview dokumentasi"></div>
        <div class="dialog-actions"><button type="button" data-close-photo>Batal</button><button type="submit" class="primary">Simpan Dokumentasi</button></div>
      </form>
    </div>`;
  document.body.appendChild(wrapper);
  injectPhotoStyles();
  qa("[data-close-photo]", wrapper).forEach((button) => button.addEventListener("click", () => closePhotoManager()));
  $("cameraPhotoBtn").addEventListener("click", () => $("cameraPhotoInput").click());
  $("galleryPhotoBtn").addEventListener("click", () => $("galleryPhotoInput").click());
  $("cameraPhotoInput").addEventListener("change", selectPhotoFile);
  $("galleryPhotoInput").addEventListener("change", selectPhotoFile);
  $("photoForm").addEventListener("submit", savePhotoDocumentation);
}

function injectPhotoStyles() {
  if ($("photoManagerStyles")) return;
  const style = document.createElement("style");
  style.id = "photoManagerStyles";
  style.textContent = `
    .photo-manager-dialog{max-width:980px}.photo-identity{padding:12px;border-radius:10px;background:#eef6f3;margin-bottom:14px;display:grid;gap:5px}.photo-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;max-height:360px;overflow:auto;margin:12px 0}.photo-card{border:1px solid #d7e4e0;border-radius:12px;overflow:hidden;background:#fff}.photo-card img{width:100%;height:150px;object-fit:cover;background:#edf3f1}.photo-card-body{padding:10px;font-size:12px}.photo-card-body p{margin:5px 0}.photo-card-actions{display:flex;gap:6px;padding:0 10px 10px}.photo-card.primary-photo{outline:3px solid #17805f}.photo-upload-actions{display:flex;gap:8px;margin:10px 0}.photo-preview-wrap{min-height:220px;display:grid;place-items:center;border:2px dashed #bad0ca;border-radius:12px;background:#f5faf8;overflow:hidden;margin-bottom:14px}.photo-preview-wrap img{width:100%;max-height:420px;object-fit:contain}.check-label{display:flex!important;align-items:center;gap:8px}.check-label input{width:auto}.funloc-group{margin:18px 0}.funloc-group h3{background:#154b70;color:#fff;padding:10px;border-radius:8px;margin:0 0 10px}.detail-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.detail-grid div{padding:8px;background:#f5f8f7;border-radius:7px}@media(max-width:650px){.photo-gallery,.detail-grid{grid-template-columns:1fr}.photo-upload-actions{display:grid;grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(style);
}

async function openPhotoManager(assetId) {
  if (!canDocument()) return notify("Login diperlukan untuk menambah dokumentasi.", "error");
  ensurePhotoModal();
  state.selectedAssetId = assetId;
  resetPhotoForm();
  const asset = state.assets.find((row) => row.id === assetId);
  $("photoAssetIdentity").innerHTML = `<div class="photo-identity"><b>${escapeHtml(asset?.tagname || "Tanpa Tagname")}</b><span>Functional Location: ${escapeHtml(asset?.functional_location || "-")}</span><span>Equipment: ${escapeHtml(asset?.equipment_no || "-")} · Area: ${escapeHtml(asset?.area_group || "-")}</span></div>`;
  show("photoModal", true);
  await renderPhotoGallery(assetId);
}

function closePhotoManager() {
  resetPhotoForm();
  closeModal("photoModal");
}

function resetPhotoForm() {
  state.selectedPhotoFile = null;
  state.currentPhotoId = null;
  if (state.selectedPhotoPreview?.startsWith("blob:")) URL.revokeObjectURL(state.selectedPhotoPreview);
  state.selectedPhotoPreview = "";
  setValue("photoId", "");
  setValue("photoType", "Asset Photo");
  setValue("photoCondition", "Unknown");
  setValue("photoDescription", "");
  setValue("photoTakenAt", new Date().toISOString().slice(0, 16));
  if ($("photoPrimary")) $("photoPrimary").checked = false;
  if ($("cameraPhotoInput")) $("cameraPhotoInput").value = "";
  if ($("galleryPhotoInput")) $("galleryPhotoInput").value = "";
  if ($("photoPreview")) { $("photoPreview").src = ""; $("photoPreview").classList.add("hidden"); }
  q("#photoPreviewWrap span")?.classList.remove("hidden");
}

function selectPhotoFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return notify("Format harus JPG, PNG, atau WebP.", "error");
  if (file.size > PHOTO_MAX_SIZE) return notify("Ukuran foto maksimal 5 MB.", "error");
  if (state.selectedPhotoPreview?.startsWith("blob:")) URL.revokeObjectURL(state.selectedPhotoPreview);
  state.selectedPhotoFile = file;
  state.selectedPhotoPreview = URL.createObjectURL(file);
  $("photoPreview").src = state.selectedPhotoPreview;
  $("photoPreview").classList.remove("hidden");
  q("#photoPreviewWrap span")?.classList.add("hidden");
}

function safePhotoName(file) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  return `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}.${extension}`;
}

async function savePhotoDocumentation(event) {
  event.preventDefault();
  if (!canDocument()) return notify("Tidak memiliki akses dokumentasi.", "error");
  const asset = state.assets.find((row) => row.id === state.selectedAssetId);
  if (!asset) return notify("Aset tidak ditemukan.", "error");
  const description = value("photoDescription");
  if (!description) return notify("Deskripsi foto wajib diisi.", "error");
  if (!state.selectedPhotoFile && !state.currentPhotoId) return notify("Pilih atau ambil foto terlebih dahulu.", "error");
  setBusy(true, "Mengunggah dokumentasi foto...");
  try {
    let photoUrl = "";
    let photoPath = "";
    if (state.selectedPhotoFile) {
      photoPath = `${asset.id}/${safePhotoName(state.selectedPhotoFile)}`;
      const { error: uploadError } = await supabaseClient.storage.from(PHOTO_BUCKET).upload(photoPath, state.selectedPhotoFile, {
        cacheControl: "3600", upsert: false, contentType: state.selectedPhotoFile.type
      });
      if (uploadError) throw uploadError;
      photoUrl = supabaseClient.storage.from(PHOTO_BUCKET).getPublicUrl(photoPath).data.publicUrl;
    }
    const isPrimary = $("photoPrimary")?.checked || false;
    if (isPrimary) await supabaseClient.from("asset_photos").update({ is_primary: false }).eq("asset_id", asset.id);
    const payload = {
      asset_id: asset.id,
      functional_location: asset.functional_location || "",
      equipment_no: asset.equipment_no || "",
      tagname: asset.tagname || "",
      area_group: asset.area_group || "",
      photo_type: value("photoType") || "Asset Photo",
      description,
      condition: value("photoCondition") || "Unknown",
      taken_at: $("photoTakenAt")?.value ? new Date($("photoTakenAt").value).toISOString() : new Date().toISOString(),
      uploaded_at: new Date().toISOString(),
      uploaded_by: state.user?.id || null,
      uploaded_by_name: state.user?.user_metadata?.full_name || state.user?.email || "",
      is_primary: isPrimary,
      is_active: true
    };
    if (photoUrl) Object.assign(payload, { photo_url: photoUrl, photo_path: photoPath });
    let query;
    if (state.currentPhotoId) query = supabaseClient.from("asset_photos").update(payload).eq("id", state.currentPhotoId);
    else query = supabaseClient.from("asset_photos").insert(payload);
    const { error } = await query;
    if (error) throw error;
    resetPhotoForm();
    await renderPhotoGallery(asset.id);
    notify("Dokumentasi foto berhasil disimpan.", "success");
  } catch (error) {
    console.error(error);
    notify(`Upload foto gagal: ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

async function renderPhotoGallery(assetId) {
  const gallery = $("photoGallery");
  if (!gallery) return;
  gallery.innerHTML = "Memuat foto...";
  try {
    const photos = await loadPhotos(assetId);
    if (!photos.length) {
      gallery.innerHTML = "<p>Belum ada dokumentasi foto untuk aset ini.</p>";
      return;
    }
    gallery.innerHTML = photos.map((photo) => `
      <article class="photo-card ${photo.is_primary ? "primary-photo" : ""}">
        <img src="${escapeHtml(photo.photo_url)}" alt="${escapeHtml(photo.photo_type)}" loading="lazy">
        <div class="photo-card-body">
          <b>${escapeHtml(photo.photo_type)}${photo.is_primary ? " · Utama" : ""}</b>
          <p>${escapeHtml(photo.description || "Tanpa deskripsi")}</p>
          <small>${escapeHtml(photo.condition || "Unknown")} · ${new Date(photo.taken_at || photo.uploaded_at).toLocaleString("id-ID")}</small>
        </div>
        <div class="photo-card-actions">
          <button type="button" data-edit-photo="${photo.id}">Edit</button>
          ${isAdmin() ? `<button type="button" class="danger" data-delete-photo="${photo.id}">Hapus</button>` : ""}
        </div>
      </article>`).join("");
    qa("[data-edit-photo]", gallery).forEach((button) => button.addEventListener("click", () => editPhoto(button.dataset.editPhoto, photos)));
    qa("[data-delete-photo]", gallery).forEach((button) => button.addEventListener("click", () => deletePhoto(button.dataset.deletePhoto, photos)));
  } catch (error) {
    gallery.innerHTML = `<p>Gagal memuat foto: ${escapeHtml(error.message)}</p>`;
  }
}

function editPhoto(photoId, photos) {
  const photo = photos.find((row) => row.id === photoId);
  if (!photo) return;
  state.currentPhotoId = photo.id;
  setValue("photoId", photo.id);
  setValue("photoType", photo.photo_type);
  setValue("photoCondition", photo.condition);
  setValue("photoDescription", photo.description);
  setValue("photoTakenAt", new Date(photo.taken_at || photo.uploaded_at).toISOString().slice(0, 16));
  if ($("photoPrimary")) $("photoPrimary").checked = !!photo.is_primary;
  $("photoPreview").src = photo.photo_url;
  $("photoPreview").classList.remove("hidden");
  q("#photoPreviewWrap span")?.classList.add("hidden");
  $("photoForm").scrollIntoView({ behavior: "smooth" });
}

async function deletePhoto(photoId, photos) {
  if (!isAdmin()) return notify("Hanya Administrator yang dapat menghapus foto.", "error");
  const photo = photos.find((row) => row.id === photoId);
  if (!confirm("Hapus dokumentasi foto ini?")) return;
  setBusy(true, "Menghapus foto...");
  try {
    if (photo?.photo_path) await supabaseClient.storage.from(PHOTO_BUCKET).remove([photo.photo_path]);
    const { error } = await supabaseClient.from("asset_photos").delete().eq("id", photoId);
    if (error) throw error;
    await renderPhotoGallery(state.selectedAssetId);
    notify("Foto berhasil dihapus.", "success");
  } catch (error) {
    notify(`Gagal menghapus foto: ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

/* ======================== DETAIL & REPORT DATA ======================== */

async function openAssetDetail(assetId) {
  const asset = state.assets.find((row) => row.id === assetId);
  if (!asset) return;
  ensureDetailModal();
  $("detailTitle").textContent = asset.tagname || "Detail Aset";
  $("detailInfo").innerHTML = `<div class="detail-grid">
    <div><b>Category</b><br>${escapeHtml(asset.category || "-")}</div>
    <div><b>Equipment No.</b><br>${escapeHtml(asset.equipment_no || "-")}</div>
    <div><b>Functional Location</b><br>${escapeHtml(asset.functional_location || "-")}</div>
    <div><b>Area</b><br>${escapeHtml(asset.area_group || "-")}</div>
    <div><b>Brand / Model</b><br>${escapeHtml([asset.brand, asset.model].filter(Boolean).join(" / ") || "-")}</div>
    <div><b>Condition / Status</b><br>${escapeHtml(`${asset.condition || "Unknown"} / ${asset.status || "Active"}`)}</div>
  </div>`;
  show("detailModal", true);
  const photos = await loadPhotos(assetId).catch(() => []);
  $("detailPhotos").innerHTML = photos.length ? `<div class="photo-gallery">${photos.map((photo) => `<article class="photo-card ${photo.is_primary ? "primary-photo" : ""}"><img src="${escapeHtml(photo.photo_url)}" alt="Dokumentasi"><div class="photo-card-body"><b>${escapeHtml(photo.photo_type)}</b><p>${escapeHtml(photo.description)}</p><small>${escapeHtml(photo.condition)} · ${new Date(photo.taken_at || photo.uploaded_at).toLocaleString("id-ID")}</small></div></article>`).join("")}</div>` : "<p>Foto belum tersedia.</p>";
}

function ensureDetailModal() {
  if ($("detailModal")) return;
  const modal = document.createElement("div");
  modal.id = "detailModal";
  modal.className = "modal hidden";
  modal.innerHTML = `<div class="dialog wide"><button class="close" type="button" data-close-detail>×</button><h2 id="detailTitle">Detail Aset</h2><div id="detailInfo"></div><h3>Dokumentasi Foto</h3><div id="detailPhotos"></div></div>`;
  document.body.appendChild(modal);
  qa("[data-close-detail]", modal).forEach((button) => button.addEventListener("click", () => closeModal("detailModal")));
}

async function getPhotoReportData(filters = {}) {
  const photos = await fetchAllRows("asset_photos", "uploaded_at");
  const active = photos.filter((photo) => photo.is_active !== false);
  const joined = active.map((photo) => ({ ...photo, asset: state.assets.find((asset) => asset.id === photo.asset_id) || {} }));
  return joined.filter((row) =>
    (!filters.functional_location || row.asset.functional_location === filters.functional_location) &&
    (!filters.area_group || row.asset.area_group === filters.area_group) &&
    (!filters.category || row.asset.category === filters.category)
  ).reduce((groups, row) => {
    const funloc = row.asset.functional_location || row.functional_location || "FUNCTIONAL LOCATION BELUM DITENTUKAN";
    (groups[funloc] ||= []).push(row);
    return groups;
  }, {});
}
window.getPhotoReportData = getPhotoReportData;

/* ======================== EXCEL IMPORT ======================== */

async function importExcel() {
  if (!isAdmin()) return notify("Hanya Administrator yang dapat mengimpor Excel.", "error");
  const file = $("excelFile")?.files?.[0];
  if (!file) return notify("Pilih file Excel terlebih dahulu.", "error");
  if (!window.XLSX) return notify("Library XLSX belum dimuat.", "error");
  setBusy(true, "Membaca dan menyinkronkan Excel...");
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const incoming = [];
    for (const sheetName of workbook.SheetNames) {
      if (["SUMMARY", "EQUIPMENTS SAP", "CC"].includes(upper(sheetName))) continue;
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
      const headerIndex = rows.findIndex((row) => row.some((cell) => upper(cell) === "TAGNAME"));
      if (headerIndex < 0) continue;
      const headers = rows[headerIndex].map((cell) => normalize(cell).toLowerCase().replace(/[^a-z0-9]+/g, " "));
      const col = (...keys) => {
        for (const key of keys) {
          const index = headers.findIndex((header) => header.includes(key));
          if (index >= 0) return index;
        }
        return -1;
      };
      const indexes = {
        tagname: col("tagname"), functional_location: col("function location", "functional location"),
        equipment_no: col("equipment no"), object_type: col("object type"),
        plant_area: col("plant area", "plant location"), brand: col("brand"), model: col("model"), remark: col("remark")
      };
      for (const row of rows.slice(headerIndex + 1)) {
        const read = (key) => indexes[key] >= 0 ? normalize(row[indexes[key]]) : "";
        if (!read("tagname") && !read("functional_location") && !read("equipment_no")) continue;
        const candidate = {
          category: sheetName,
          tagname: read("tagname"), functional_location: read("functional_location"), equipment_no: read("equipment_no"), equipment_number: read("equipment_no"),
          object_type: read("object_type"), plant_area: read("plant_area"), brand: read("brand"), model: read("model"), remark: read("remark"), remarks: read("remark"),
          area_group: classifyArea(read("functional_location"), read("plant_area"), read("tagname")),
          status: "Active", condition: "Unknown", updated_at: new Date().toISOString()
        };
        candidate.asset_uid = stableAssetUid(candidate);
        const old = state.assets.find((asset) =>
          asset.asset_uid === candidate.asset_uid ||
          (asset.category === candidate.category &&
           asset.functional_location === candidate.functional_location &&
           (asset.equipment_no || asset.equipment_number || "") === candidate.equipment_no &&
           asset.tagname === candidate.tagname)
        );
        candidate.id = old?.id || crypto.randomUUID();
        incoming.push({
          ...candidate,
          status: old?.status || candidate.status,
          condition: old?.condition || candidate.condition,
          remark: candidate.remark || old?.remark || old?.remarks || "",
          remarks: candidate.remark || old?.remarks || old?.remark || ""
        });
      }
    }
    for (let index = 0; index < incoming.length; index += 500) {
      const { error } = await supabaseClient.from("assets").upsert(incoming.slice(index, index + 500));
      if (error) throw error;
    }
    const merged = new Map(state.assets.map((asset) => [asset.id, asset]));
    incoming.forEach((asset) => merged.set(asset.id, asset));
    state.assets = [...merged.values()];
    refreshAll();
    if ($("importStatus")) $("importStatus").textContent = `${incoming.length} baris selesai diproses. Dokumentasi foto tetap aman.`;
    notify(`Import selesai: ${incoming.length} aset diproses.`, "success");
  } catch (error) {
    if ($("importStatus")) $("importStatus").textContent = `Gagal: ${error.message}`;
    notify(`Import gagal: ${error.message}`, "error");
  } finally {
    setBusy(false);
  }
}

/* ======================== EXPORT ======================== */

function exportCSV() {
  const columns = ["category", "tagname", "functional_location", "equipment_no", "object_type", "plant_area", "area_group", "brand", "model", "condition", "status", "remark"];
  const quote = (input) => `"${String(input ?? "").replace(/"/g, '""')}"`;
  const csv = "\ufeff" + [columns, ...filteredAssets().map((asset) => columns.map((key) => asset[key]))].map((row) => row.map(quote).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `PIM-Asset-Register-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ======================== NAVIGATION & INIT ======================== */

function closeModal(id) { show(id, false); }
function showView(id) {
  if (id === "manage" && !isAdmin()) return;
  qa(".view").forEach((view) => view.classList.toggle("hidden", view.id !== id));
  if (id === "assets") renderAssetTable();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function refreshAll() {
  refreshFilters();
  renderDashboard();
  renderAssetTable();
}

function bindEvents() {
  qa("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
  $("loginBtn")?.addEventListener("click", () => show("loginModal", true));
  $("logoutBtn")?.addEventListener("click", logout);
  $("loginForm")?.addEventListener("submit", login);
  $("editForm")?.addEventListener("submit", saveAsset);
  $("addBtn")?.addEventListener("click", () => openEditor());
  ["search", "areaFilter", "categoryFilter", "statusFilter"].forEach((id) => $(id)?.addEventListener("input", () => { state.page = 1; renderAssetTable(); }));
  $("mapArea")?.addEventListener("change", () => openArea(value("mapArea")));
  $("globalSearch")?.addEventListener("input", (event) => setValue("search", event.target.value));
  qa(".modal").forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(modal.id); }));
}

async function initializeApp() {
  if (!supabaseClient) {
    notify("Konfigurasi Supabase tidak ditemukan. Periksa config.js.", "error");
    state.assets = await loadFallbackAssets();
    bindEvents();
    refreshAll();
    return;
  }
  const { data: { session } } = await supabaseClient.auth.getSession();
  await applySession(session);
  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => applySession(nextSession));
  bindEvents();
  ensurePhotoModal();
  await loadAssets();
}

window.showView = showView;
window.closeModal = closeModal;
window.openEditor = openEditor;
window.openArea = openArea;
window.openAssetDetail = openAssetDetail;
window.openPhotoManager = openPhotoManager;
window.deleteAsset = deleteAsset;
window.importExcel = importExcel;
window.exportCSV = exportCSV;

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeApp);
else initializeApp();
