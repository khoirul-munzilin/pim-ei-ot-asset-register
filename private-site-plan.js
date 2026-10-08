/* Private Site Plan module for PIM EI & OT Asset Register */
(() => {
  const wait = setInterval(async () => {
    if (!window.supabase || !window.APP_CONFIG || !document.querySelector('.nav') || !document.querySelector('.content')) return;
    clearInterval(wait);
    const client = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    let session = (await client.auth.getSession()).data.session;
    let role = 'public';
    let plan = null;
    let markers = [];

    const css = document.createElement('style');
    css.textContent = `.psp-hidden{display:none!important}.psp-plan{position:relative;max-width:1200px;margin:14px auto;background:#eef2f6;border-radius:14px;overflow:hidden}.psp-plan img{width:100%;display:block}.psp-marker{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 9px #0008;cursor:pointer}.psp-info{padding:12px;border:1px solid #d8e2ed;border-radius:10px;background:white;margin-top:12px}`;
    document.head.appendChild(css);

    const btn = document.createElement('button');
    btn.textContent = 'Denah Asset'; btn.dataset.privatePlan = '1'; btn.className = 'psp-hidden';
    document.querySelector('.nav').appendChild(btn);
    const section = document.createElement('section'); section.className = 'page'; section.id = 'privatePlanPage';
    section.innerHTML = `<div class="panel"><div class="panel-head"><h3>Denah Asset Private</h3><span id="pspRole"></span></div><div id="pspMessage" class="notice">Login untuk membuka denah.</div><div id="pspAdmin" class="psp-hidden"><form id="pspUploadForm" class="form"><label>Nama Denah<input name="name" required></label><label>File Denah<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label><div class="full"><button class="btn primary">Upload Denah Private</button></div></form></div><div id="pspBox"></div><div id="pspInfo" class="psp-info">Pilih marker area.</div></div>`;
    document.querySelector('.content').appendChild(section);

    function openPage(){document.querySelectorAll('.page').forEach(x=>x.classList.remove('on','active'));section.classList.add(section.classList.contains('page')&&document.querySelector('.page.on')?'on':'active');document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('on','active'));btn.classList.add('on');loadPlan()}
    btn.onclick = openPage;

    async function getRole(){
      session=(await client.auth.getSession()).data.session;
      if(!session){role='public';btn.classList.add('psp-hidden');return}
      const p=await client.from('user_profiles').select('role,active').eq('id',session.user.id).single();
      role=p.data?.active===false?'pengunjung':(p.data?.role||'pengunjung');
      btn.classList.remove('psp-hidden');
      document.getElementById('pspRole').textContent='Role: '+role;
      document.getElementById('pspAdmin').classList.toggle('psp-hidden',role!=='administrator');
    }

    async function loadPlan(){
      await getRole(); if(!session)return;
      const msg=document.getElementById('pspMessage'),box=document.getElementById('pspBox');
      const p=await client.from('site_plans').select('*').eq('active',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(p.error||!p.data){msg.textContent='Denah belum diunggah oleh Administrator.';box.innerHTML='';return}
      plan=p.data;
      const signed=await client.storage.from('site-plans').createSignedUrl(plan.image_path,600);
      if(signed.error){msg.textContent='Gagal membuka denah: '+signed.error.message;box.innerHTML='';return}
      const m=await client.from('area_markers').select('*').eq('site_plan_id',plan.id);markers=m.data||[];
      msg.textContent=`${plan.name} · URL gambar aktif 10 menit · ${['technician','administrator'].includes(role)?'klik gambar untuk menambah marker':'mode lihat'}`;
      box.innerHTML=`<div class="psp-plan" id="pspPlan"><img src="${signed.data.signedUrl}" alt="Denah private"><div id="pspLayer"></div></div>`;
      const layer=document.getElementById('pspLayer');
      markers.forEach(x=>{const b=document.createElement('button');b.className='psp-marker';b.style.left=x.map_x+'%';b.style.top=x.map_y+'%';b.style.background=x.color||'#286aa6';b.title=x.area_name;b.onclick=e=>{e.stopPropagation();document.getElementById('pspInfo').innerHTML=`<b>${x.area_name}</b><br>Posisi relatif: ${x.map_x}%, ${x.map_y}%`};layer.appendChild(b)});
      if(['technician','administrator'].includes(role))document.getElementById('pspPlan').onclick=async e=>{if(e.target.tagName!=='IMG')return;const r=e.currentTarget.getBoundingClientRect(),x=((e.clientX-r.left)/r.width*100).toFixed(2),y=((e.clientY-r.top)/r.height*100).toFixed(2),name=prompt('Nama area marker:');if(!name)return;const z=await client.from('area_markers').insert({site_plan_id:plan.id,area_name:name,map_x:x,map_y:y});if(z.error)return alert(z.error.message);loadPlan()};
    }

    document.getElementById('pspUploadForm').onsubmit=async e=>{
      e.preventDefault(); if(role!=='administrator')return;
      const f=new FormData(e.target),file=f.get('file');
      if(file.size>5242880)return alert('Ukuran maksimum 5 MB');
      const ext=file.name.split('.').pop().toLowerCase(),path=`main/site-plan-${Date.now()}.${ext}`;
      const up=await client.storage.from('site-plans').upload(path,file,{upsert:false});
      if(up.error)return alert(up.error.message);
      await client.from('site_plans').update({active:false}).eq('active',true);
      const row=await client.from('site_plans').insert({name:f.get('name'),image_path:path,active:true});
      if(row.error)return alert(row.error.message);
      e.target.reset();loadPlan();
    };

    await getRole();
    client.auth.onAuthStateChange((_e,s)=>{session=s;setTimeout(getRole,0)});
  },250);
})();
