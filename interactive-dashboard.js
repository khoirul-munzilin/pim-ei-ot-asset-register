"use strict";
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const STORAGE_THEME = "pim-ui-theme";

  function icon(name) {
    const paths = {
      moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
      sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      expand:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      up:'<path d="m18 15-6-6-6 6"/>',
      menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
      grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.grid}</svg>`;
  }

  function injectUI() {
    if ($('#uiControlDock')) return;
    const dock = document.createElement('div');
    dock.id = 'uiControlDock';
    dock.className = 'ui-control-dock';
    dock.innerHTML = `
      <button id="commandBtn" class="icon-btn" title="Pencarian cepat (Ctrl+K)">${icon('search')}</button>
      <button id="themeBtn" class="icon-btn" title="Ganti tema">${icon('moon')}</button>`;
    document.body.appendChild(dock);

    const palette = document.createElement('div');
    palette.id = 'commandPalette';
    palette.className = 'command-palette hidden';
    palette.innerHTML = `
      <div class="command-box">
        <div class="command-input-wrap">${icon('search')}<input id="commandInput" placeholder="Cari aset, buka menu, atau pilih area..." autocomplete="off"><kbd>ESC</kbd></div>
        <div id="commandResults" class="command-results"></div>
        <div class="command-help"><span>↑↓ Navigasi</span><span>Enter Pilih</span><span>Ctrl+K Buka</span></div>
      </div>`;
    document.body.appendChild(palette);

    const panel = document.createElement('aside');
    panel.id = 'areaInsightPanel';
    panel.className = 'insight-panel hidden';
    panel.innerHTML = `<div class="insight-head"><div><small>AREA INSIGHT</small><h2 id="insightTitle">Area</h2></div><button id="closeInsight" class="icon-btn">${icon('close')}</button></div><div id="insightBody"></div>`;
    document.body.appendChild(panel);

    const top = document.createElement('button');
    top.id = 'backToTop'; top.className = 'back-to-top'; top.innerHTML = icon('up'); top.title='Kembali ke atas';
    document.body.appendChild(top);

    const map = $('.map');
    if (map && !$('#mapToolbar')) {
      const toolbar = document.createElement('div');
      toolbar.id='mapToolbar'; toolbar.className='map-toolbar';
      toolbar.innerHTML=`<button id="mapFullscreen" class="map-tool">${icon('expand')}<span>Fullscreen</span></button><div class="zoom-tools"><button id="zoomOut">−</button><span id="zoomValue">100%</span><button id="zoomIn">+</button></div>`;
      map.appendChild(toolbar);
    }

    const main = $('main');
    if (main) {
      const progress=document.createElement('div'); progress.id='scrollProgress'; progress.className='scroll-progress'; document.body.appendChild(progress);
    }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme=theme;
    localStorage.setItem(STORAGE_THEME,theme);
    const btn=$('#themeBtn'); if(btn) btn.innerHTML=icon(theme==='dark'?'sun':'moon');
  }

  function animateNumbers() {
    $$('.kpi b').forEach(el => {
      if (el.dataset.animated === el.textContent) return;
      const target=Number(el.textContent.replace(/[^0-9]/g,''));
      if(!Number.isFinite(target)) return;
      el.dataset.animated=el.textContent;
      const start=performance.now(), duration=720;
      const tick=now=>{ const p=Math.min(1,(now-start)/duration), eased=1-Math.pow(1-p,3); el.textContent=Math.round(target*eased).toLocaleString('id-ID'); if(p<1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }

  function activateNav(viewId) {
    $$('[data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===viewId));
  }

  function commandItems() {
    const areas=$$('#areaFilter option').map(o=>o.value).filter(Boolean).slice(0,30);
    return [
      {label:'Buka Dashboard',hint:'Menu',run:()=>window.showView?.('dashboard')},
      {label:'Buka Daftar Aset',hint:'Menu',run:()=>window.showView?.('assets')},
      {label:'Buka Kelola',hint:'Administrator',run:()=>window.showView?.('manage')},
      ...areas.map(a=>({label:a,hint:'Area',run:()=>window.openArea?.(a)}))
    ];
  }

  let selectedIndex=0;
  function renderCommands(keyword='') {
    const box=$('#commandResults'); if(!box) return;
    const q=keyword.toLowerCase();
    const list=commandItems().filter(x=>x.label.toLowerCase().includes(q)).slice(0,12);
    selectedIndex=Math.min(selectedIndex,Math.max(0,list.length-1));
    box._items=list;
    box.innerHTML=list.length?list.map((x,i)=>`<button class="command-item ${i===selectedIndex?'selected':''}" data-index="${i}"><span>${x.label}</span><small>${x.hint}</small></button>`).join(''):'<div class="empty-command">Tidak ada hasil.</div>';
    $$('.command-item',box).forEach(b=>b.onclick=()=>{ list[Number(b.dataset.index)].run(); closeCommands(); });
  }
  function openCommands(){ $('#commandPalette')?.classList.remove('hidden'); selectedIndex=0; renderCommands(); setTimeout(()=>$('#commandInput')?.focus(),30); }
  function closeCommands(){ $('#commandPalette')?.classList.add('hidden'); if($('#commandInput')) $('#commandInput').value=''; }

  function openInsight(area) {
    const panel=$('#areaInsightPanel'), body=$('#insightBody'); if(!panel||!body) return;
    $('#insightTitle').textContent=area;
    const rows=$$('#assetRows tr').filter(tr=>tr.textContent.includes(area)).slice(0,6);
    body.innerHTML=`<div class="insight-stat"><span>Aset terlihat pada halaman</span><b>${rows.length}</b></div><div class="insight-actions"><button onclick="openArea('${area.replace(/'/g,"\\'")}')">Lihat semua aset</button></div><div class="insight-list">${rows.length?rows.map(r=>`<div>${r.children[1]?.textContent||'-'}<small>${r.children[2]?.textContent||''}</small></div>`).join(''):'<p>Pilih area untuk memuat ringkasan aset.</p>'}</div>`;
    panel.classList.remove('hidden');
  }

  function bindMap() {
    let zoom=1;
    const map=$('.map'), img=$('.map img');
    const apply=()=>{ if(img) img.style.transform=`scale(${zoom})`; if($('#zoomValue')) $('#zoomValue').textContent=`${Math.round(zoom*100)}%`; };
    $('#zoomIn')?.addEventListener('click',()=>{zoom=Math.min(2,zoom+.15);apply();});
    $('#zoomOut')?.addEventListener('click',()=>{zoom=Math.max(1,zoom-.15);apply();});
    $('#mapFullscreen')?.addEventListener('click',()=>{ if(!document.fullscreenElement) map?.requestFullscreen?.(); else document.exitFullscreen?.(); });
    map?.addEventListener('wheel',e=>{ if(!e.ctrlKey) return; e.preventDefault(); zoom=Math.max(1,Math.min(2,zoom+(e.deltaY<0?.1:-.1)));apply(); },{passive:false});
  }

  function observerEnhancements() {
    const observer=new MutationObserver(()=>{
      animateNumbers();
      $$('.marker:not([data-ui])').forEach(m=>{m.dataset.ui='1';m.addEventListener('click',()=>openInsight((m.textContent||'').split('·')[0].trim()));});
      $$('.bar-row:not([data-ui])').forEach(b=>{b.dataset.ui='1';b.addEventListener('contextmenu',e=>{e.preventDefault();openInsight(b.dataset.area||b.textContent.trim());});});
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function bind() {
    $('#themeBtn')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
    $('#commandBtn')?.addEventListener('click',openCommands);
    $('#commandPalette')?.addEventListener('click',e=>{if(e.target.id==='commandPalette')closeCommands();});
    $('#commandInput')?.addEventListener('input',e=>{selectedIndex=0;renderCommands(e.target.value);});
    $('#commandInput')?.addEventListener('keydown',e=>{
      const list=$('#commandResults')?._items||[];
      if(e.key==='ArrowDown'){e.preventDefault();selectedIndex=Math.min(list.length-1,selectedIndex+1);renderCommands(e.target.value);}
      if(e.key==='ArrowUp'){e.preventDefault();selectedIndex=Math.max(0,selectedIndex-1);renderCommands(e.target.value);}
      if(e.key==='Enter'&&list[selectedIndex]){list[selectedIndex].run();closeCommands();}
    });
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommands();}if(e.key==='Escape'){closeCommands();$('#areaInsightPanel')?.classList.add('hidden');}});
    $('#closeInsight')?.addEventListener('click',()=>$('#areaInsightPanel').classList.add('hidden'));
    $('#backToTop')?.addEventListener('click',()=>scrollTo({top:0,behavior:'smooth'}));
    window.addEventListener('scroll',()=>{
      const max=document.documentElement.scrollHeight-innerHeight, ratio=max?scrollY/max:0;
      if($('#scrollProgress')) $('#scrollProgress').style.width=`${ratio*100}%`;
      $('#backToTop')?.classList.toggle('visible',scrollY>500);
    },{passive:true});
    $$('[data-view]').forEach(b=>b.addEventListener('click',()=>activateNav(b.dataset.view)));
    $$('.kpi').forEach((k,i)=>k.addEventListener('click',()=>{ if(i===2){window.showView?.('assets');const s=$('#statusFilter');if(s){s.value='Active';s.dispatchEvent(new Event('input'));}} else if(i===3){window.showView?.('assets');const a=$('#areaFilter');if(a){a.value='AREA BELUM DITENTUKAN';a.dispatchEvent(new Event('input'));}} else if(i===0||i===1) window.showView?.('assets'); }));
    bindMap(); observerEnhancements(); animateNumbers(); activateNav('dashboard');
  }

  function init(){injectUI();setTheme(localStorage.getItem(STORAGE_THEME)||'light');bind();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
