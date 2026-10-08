/* PIM Asset Register - role and site plan extension */
(() => {
  const wait = setInterval(async () => {
    if (!window.supabase || !window.APP_CONFIG || !document.querySelector('.nav')) return;
    clearInterval(wait);
    const client = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    let role = 'public';

    const style = document.createElement('style');
    style.textContent = `.role-hidden{display:none!important}.plan-wrap{position:relative;max-width:1200px;margin:auto}.plan-wrap img{width:100%;display:block;border-radius:14px}.plan-marker{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px #0007;cursor:pointer}.plan-info{padding:12px;border:1px solid #d8e2ed;border-radius:10px;background:white;margin-top:12px}`;
    document.head.appendChild(style);

    const nav = document.querySelector('.nav');
    const denahButton = document.createElement('button');
    denahButton.textContent = 'Denah Asset';
    denahButton.dataset.p = 'denah';
    denahButton.classList.add('role-hidden');
    nav.appendChild(denahButton);

    const content = document.querySelector('.content');
    const section = document.createElement('section');
    section.id = 'denah'; section.className = 'page';
    section.innerHTML = `<div class="panel"><div class="panelhead"><h3>Denah Asset</h3><span id="roleBadge"></span></div><div id="planMessage" class="notice">Memuat denah...</div><div id="planContainer"></div></div>`;
    content.appendChild(section);

    function originalGo(page) {
      document.querySelectorAll('.page').forEach(x => x.classList.toggle('on', x.id === page));
      document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('on', x.dataset.p === page));
      const title = document.getElementById('title');
      if (title) title.textContent = page === 'denah' ? 'Denah Asset EI & OT' : title.textContent;
    }
    denahButton.onclick = () => { originalGo('denah'); loadPlan(); };

    function controlMenus() {
      const logged = role !== 'public';
      denahButton.classList.toggle('role-hidden', !logged);
      [...nav.querySelectorAll('button')].forEach(btn => {
        const text = btn.textContent.trim();
        if (text === 'Dashboard' || text === 'Denah Asset') return;
        let allowed = false;
        if (role === 'pengunjung') allowed = text === 'Daftar Asset';
        if (role === 'technician') allowed = ['Daftar Asset','Tambah Asset'].includes(text);
        if (role === 'administrator') allowed = true;
        btn.classList.toggle('role-hidden', !allowed);
      });
      const who = document.getElementById('who');
      if (who && logged) who.textContent = `${who.textContent.split(' · ')[0]} · ${role}`;
    }

    async function loadRole(session) {
      if (!session) { role = 'public'; controlMenus(); return; }
      const r = await client.from('user_profiles').select('role,active').eq('id', session.user.id).single();
      role = r.data?.active === false ? 'pengunjung' : (r.data?.role || 'pengunjung');
      controlMenus();
    }

    async function loadPlan() {
      const msg = document.getElementById('planMessage'), box = document.getElementById('planContainer');
      document.getElementById('roleBadge').textContent = `Role: ${role}`;
      const p = await client.from('site_plans').select('*').eq('active', true).limit(1).maybeSingle();
      if (p.error || !p.data) { msg.textContent = 'Denah belum dipasang oleh Administrator.'; box.innerHTML = ''; return; }
      const m = await client.from('area_markers').select('*').eq('site_plan_id', p.data.id);
      if (m.error) { msg.textContent = m.error.message; return; }
      msg.textContent = `${p.data.name} · klik marker untuk melihat nama area.`;
      box.innerHTML = `<div class="plan-wrap"><img src="${p.data.image_url}" alt="Denah asset"><div id="markerLayer"></div></div><div id="markerInfo" class="plan-info">Pilih marker area.</div>`;
      const layer = document.getElementById('markerLayer');
      (m.data || []).forEach(marker => {
        const b = document.createElement('button'); b.className = 'plan-marker'; b.title = marker.area_name;
        b.style.left = marker.map_x + '%'; b.style.top = marker.map_y + '%'; b.style.background = marker.color || '#286aa6';
        b.onclick = () => document.getElementById('markerInfo').innerHTML = `<b>${marker.area_name}</b><br>Posisi marker: ${marker.map_x}%, ${marker.map_y}%`;
        layer.appendChild(b);
      });
    }

    const initial = await client.auth.getSession();
    await loadRole(initial.data.session);
    client.auth.onAuthStateChange((_event, session) => setTimeout(() => loadRole(session), 0));
  }, 250);
})();
