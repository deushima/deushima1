(() => {
  'use strict';

  const META = {
    neuronCount: 139255,
    edgeCount: 2698236,
    source: 'FlyWire FAFB v783',
    binaryUrl: 'https://raw.githubusercontent.com/snedea/flybrain/main/data/connectome.bin.gz',
    groups: [
      [0,'VIS_R1R6','sensory',11487],[1,'VIS_R7R8','sensory',0],[2,'VIS_ME','sensory',82318],[3,'VIS_LO','sensory',1793],[4,'VIS_LC','sensory',0],[5,'VIS_LPTC','sensory',1907],[6,'OLF_ORN_FOOD','sensory',1851],[7,'OLF_ORN_DANGER','sensory',430],[8,'OLF_LN','sensory',453],[9,'OLF_PN','sensory',699],[10,'MECH_BRISTLE','sensory',1927],[11,'MECH_JO','sensory',879],[12,'MECH_CHORD','sensory',0],[13,'ANTENNAL_MECH','sensory',0],[14,'THERMO_WARM','sensory',49],[15,'THERMO_COOL','sensory',54],[16,'NOCI','sensory',0],
      [17,'MB_KC','central',5177],[18,'MB_APL','central',0],[19,'MB_MBON_APP','central',96],[20,'MB_MBON_AV','central',0],[21,'MB_DAN_REW','central',335],[22,'MB_DAN_PUN','central',0],[23,'LH_APP','central',559],[24,'LH_AV','central',0],[25,'CX_EPG','central',428],[26,'CX_PFN','central',1244],[27,'CX_FC','central',822],[28,'CX_HDELTA','central',611],[29,'SEZ_FEED','central',34],[30,'SEZ_GROOM','central',0],[31,'SEZ_WATER','central',0],[32,'GUS_GRN_SWEET','central',214],[33,'GUS_GRN_BITTER','central',65],[34,'GUS_GRN_WATER','central',131],[35,'GNG_DESC','central',3581],[36,'CLOCK_DN','central',0],
      [37,'DRIVE_HUNGER','drives',46],[38,'DRIVE_FEAR','drives',0],[39,'DRIVE_FATIGUE','drives',34],[40,'DRIVE_CURIOSITY','drives',0],[41,'DRIVE_GROOM','drives',0],
      [42,'DN_WALK','motor',0],[43,'DN_FLIGHT','motor',0],[44,'DN_TURN','motor',0],[45,'DN_BACKUP','motor',0],[46,'DN_STARTLE','motor',0],[47,'VNC_CPG','motor',4],[48,'MN_LEG_L1','motor',0],[49,'MN_LEG_R1','motor',0],[50,'MN_LEG_L2','motor',0],[51,'MN_LEG_R2','motor',0],[52,'MN_LEG_L3','motor',0],[53,'MN_LEG_R3','motor',0],[54,'MN_WING_L','motor',0],[55,'MN_WING_R','motor',0],[56,'MN_PROBOSCIS','motor',24],[57,'MN_HEAD','motor',40],[58,'MN_ABDOMEN','motor',8],
      [59,'GENERIC_SENSORY','sensory',0],[60,'GENERIC_CENTRAL','central',21955],[61,'GENERIC_DRIVES','drives',0],[62,'GENERIC_MOTOR','motor',0]
    ].map(([id,name,region,count]) => ({id,name,region,count}))
  };

  const palette = {
    sensory: [104,217,255],
    central: [215,204,255],
    drives: [255,212,107],
    motor: [255,111,120]
  };

  const canvas = document.getElementById('brain');
  const ctx = canvas.getContext('2d', { alpha: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  const ui = {
    search: document.getElementById('search'),
    results: document.getElementById('searchResults'),
    selectedName: document.querySelector('[data-selected-name]'),
    selectedRegion: document.querySelector('[data-selected-region]'),
    selectedCount: document.querySelector('[data-selected-count]'),
    selectedOut: document.querySelector('[data-selected-out]'),
    selectedIn: document.querySelector('[data-selected-in]'),
    stimulate: document.querySelector('[data-stimulate]'),
    visible: document.querySelector('[data-visible]'),
    edgeCount: document.querySelector('[data-edge-count]'),
    edgeCopy: document.querySelector('[data-edge-copy]'),
    hint: document.querySelector('[data-hint]'),
    load: document.querySelector('[data-load-real]'),
    loadLabel: document.querySelector('[data-load-label]'),
    loadMeter: document.querySelector('[data-load-meter]'),
    loadCopy: document.querySelector('[data-load-copy]'),
    loadNote: document.querySelector('[data-load-note]'),
    statusPill: document.querySelector('[data-status-pill]'),
    liveState: document.querySelector('[data-live-state]'),
    liveCopy: document.querySelector('[data-live-copy]')
  };

  const state = {
    width: innerWidth,
    height: innerHeight,
    yaw: -0.18,
    pitch: 0.08,
    zoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
    selected: null,
    hovered: null,
    mode: 'map',
    showEdges: true,
    showLabels: true,
    autoRotate: true,
    enabledRegions: new Set(['sensory','central','drives','motor']),
    realLoaded: false,
    realLoading: false,
    groupMatrix: null,
    signal: new Float32Array(META.groups.length),
    signalNext: new Float32Array(META.groups.length),
    signalPulse: 0,
    mouseX: -9999,
    mouseY: -9999,
    projectedGroups: []
  };

  const groupById = new Map(META.groups.map(g => [g.id, g]));
  const groupsWithNeurons = META.groups.filter(g => g.count > 0);
  const groupTotals = { sensory:0, central:0, drives:0, motor:0 };
  META.groups.forEach(g => groupTotals[g.region] += g.count);

  Object.entries(groupTotals).forEach(([region, count]) => {
    const node = document.querySelector(`[data-region-count="${region}"]`);
    if (node) node.textContent = count.toLocaleString('en-US');
  });

  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const rng = mulberry32(7832024);

  function createGroupLayout() {
    const regionBase = {
      sensory: [-1.1, .06, .04],
      central: [0, 0, 0],
      drives: [0, -.82, .12],
      motor: [1.04, -.05, .02]
    };
    const regionLists = {};
    for (const region of Object.keys(regionBase)) regionLists[region] = META.groups.filter(g => g.region === region && g.count > 0);

    for (const [region, list] of Object.entries(regionLists)) {
      list.forEach((g, i) => {
        const angle = (i / Math.max(1, list.length)) * Math.PI * 2 + (region === 'central' ? .4 : 0);
        const radius = region === 'central' ? .72 : .52;
        const base = regionBase[region];
        const wobble = (rng() - .5) * .26;
        g.pos = [
          base[0] + Math.cos(angle) * radius + wobble,
          base[1] + Math.sin(angle * 1.17) * (radius * .62) + (rng()-.5)*.18,
          base[2] + Math.sin(angle) * .62 + (rng()-.5)*.3
        ];
      });
    }

    META.groups.filter(g => !g.pos).forEach(g => g.pos = regionBase[g.region].slice());
  }

  createGroupLayout();

  const particles = [];
  const maxParticles = 1600;
  const total = META.neuronCount;
  groupsWithNeurons.forEach(g => {
    const allocation = Math.max(2, Math.round(maxParticles * (g.count / total)));
    const rgb = palette[g.region];
    for (let i = 0; i < allocation; i++) {
      const r = Math.pow(rng(), .55) * (.15 + Math.min(.42, Math.log10(g.count + 1) * .07));
      const a = rng() * Math.PI * 2;
      const b = Math.acos(2*rng()-1);
      particles.push({
        group: g.id,
        region: g.region,
        x: g.pos[0] + Math.sin(b)*Math.cos(a)*r,
        y: g.pos[1] + Math.cos(b)*r*.78,
        z: g.pos[2] + Math.sin(b)*Math.sin(a)*r,
        phase: rng()*Math.PI*2,
        size: .5 + rng()*1.35,
        rgb
      });
    }
  });

  ui.visible.textContent = particles.length.toLocaleString('en-US');

  function resize() {
    state.width = innerWidth;
    state.height = innerHeight;
    canvas.width = Math.floor(state.width * dpr);
    canvas.height = Math.floor(state.height * dpr);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize, { passive:true });
  resize();

  function rotatePoint(x,y,z) {
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const x1 = x*cy - z*sy;
    const z1 = x*sy + z*cy;
    const y1 = y*cp - z1*sp;
    const z2 = y*sp + z1*cp;
    return [x1,y1,z2];
  }

  function project(x,y,z) {
    const [rx,ry,rz] = rotatePoint(x,y,z);
    const perspective = 3.6;
    const scale = Math.min(state.width, state.height) * .205 * state.zoom * (perspective / (perspective + rz));
    const cx = state.width * .5;
    const cy = state.height * .49;
    return [cx + rx*scale, cy + ry*scale, rz, scale];
  }

  function rgba(rgb,a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`; }

  function buildFallbackMatrix() {
    const n = META.groups.length;
    const matrix = Array.from({length:n}, () => new Float64Array(n));
    const active = groupsWithNeurons;
    for (const a of active) {
      for (const b of active) {
        if (a.id === b.id) continue;
        const dx=a.pos[0]-b.pos[0], dy=a.pos[1]-b.pos[1], dz=a.pos[2]-b.pos[2];
        const dist = Math.sqrt(dx*dx+dy*dy+dz*dz);
        const regionBias = a.region === b.region ? 1.7 : 1;
        const value = (Math.sqrt(a.count*b.count) / (1 + dist*4)) * regionBias * (0.2 + rng());
        if (value > 650) matrix[a.id][b.id] = value;
      }
    }
    return matrix;
  }

  state.groupMatrix = buildFallbackMatrix();

  function matrixStats(id) {
    if (id == null || !state.groupMatrix) return {out:0,inflow:0};
    let out=0, inflow=0;
    const n=META.groups.length;
    for(let i=0;i<n;i++) { out += state.groupMatrix[id][i]||0; inflow += state.groupMatrix[i][id]||0; }
    return {out,inflow};
  }

  function topEdges(limit=85) {
    const edges=[];
    const n=META.groups.length;
    const selected = state.selected;
    for(let a=0;a<n;a++) {
      const ga=groupById.get(a);
      if(!ga || !state.enabledRegions.has(ga.region) || ga.count<=0) continue;
      for(let b=0;b<n;b++) {
        if(a===b) continue;
        const gb=groupById.get(b);
        if(!gb || !state.enabledRegions.has(gb.region) || gb.count<=0) continue;
        const w=state.groupMatrix?.[a]?.[b]||0;
        if(w<=0) continue;
        if(selected!=null && a!==selected && b!==selected) continue;
        edges.push([a,b,w]);
      }
    }
    edges.sort((x,y)=>y[2]-x[2]);
    return edges.slice(0, selected == null ? limit : 55);
  }

  function render(now) {
    const t=now*.001;
    if(state.autoRotate && !state.dragging) state.yaw += .00055;

    ctx.clearRect(0,0,state.width,state.height);

    const vignette=ctx.createRadialGradient(state.width*.5,state.height*.48,20,state.width*.5,state.height*.48,Math.max(state.width,state.height)*.58);
    vignette.addColorStop(0,'rgba(38,40,50,.055)');
    vignette.addColorStop(.5,'rgba(5,5,6,.01)');
    vignette.addColorStop(1,'rgba(0,0,0,.28)');
    ctx.fillStyle=vignette; ctx.fillRect(0,0,state.width,state.height);

    state.projectedGroups=[];
    for(const g of groupsWithNeurons) {
      const p=project(...g.pos);
      state.projectedGroups.push({id:g.id,x:p[0],y:p[1],z:p[2],scale:p[3],group:g});
    }

    if(state.showEdges) {
      const edges=topEdges();
      ctx.save();
      ctx.lineCap='round';
      for(const [a,b,w] of edges) {
        const ga=groupById.get(a), gb=groupById.get(b);
        const pa=project(...ga.pos), pb=project(...gb.pos);
        const sig=Math.max(state.signal[a],state.signal[b]);
        const alpha=state.realLoaded ? Math.min(.42,.045+Math.log10(w+1)*.046) : Math.min(.16,.025+Math.log10(w+1)*.018);
        ctx.strokeStyle = sig>.05 ? `rgba(255,255,255,${Math.min(.82,alpha+sig*.62)})` : `rgba(214,220,255,${alpha})`;
        ctx.lineWidth = Math.min(1.5,.25+Math.log10(w+1)*.17) + sig*1.7;
        ctx.beginPath(); ctx.moveTo(pa[0],pa[1]);
        const mx=(pa[0]+pb[0])*.5 + (pb[1]-pa[1])*.035;
        const my=(pa[1]+pb[1])*.5 - (pb[0]-pa[0])*.035;
        ctx.quadraticCurveTo(mx,my,pb[0],pb[1]); ctx.stroke();
      }
      ctx.restore();
    }

    const projectedParticles=[];
    for(const p of particles) {
      if(!state.enabledRegions.has(p.region)) continue;
      if(state.selected!=null && state.mode==='data' && p.group!==state.selected) continue;
      const pp=project(p.x,p.y,p.z);
      projectedParticles.push([p,pp]);
    }
    projectedParticles.sort((a,b)=>a[1][2]-b[1][2]);

    for(const [p,pp] of projectedParticles) {
      const sig=state.signal[p.group]||0;
      const selected=state.selected===p.group;
      const dim=state.selected==null || selected ? 1 : .22;
      const pulse=.72+.28*Math.sin(t*2.2+p.phase);
      const radius=Math.max(.45,p.size*(pp[3]/145)*(.72+sig*1.9));
      const alpha=Math.min(.92,(.24+pulse*.22+sig*.6)*dim);
      ctx.fillStyle=rgba(p.rgb,alpha);
      ctx.beginPath(); ctx.arc(pp[0],pp[1],radius,0,Math.PI*2); ctx.fill();
      if(sig>.15) {
        ctx.strokeStyle=`rgba(255,255,255,${sig*.25})`;
        ctx.lineWidth=.6;
        ctx.beginPath(); ctx.arc(pp[0],pp[1],radius+sig*2.3,0,Math.PI*2); ctx.stroke();
      }
    }

    const projected=state.projectedGroups.slice().sort((a,b)=>a.z-b.z);
    for(const item of projected) {
      const {group:g,x,y}=item;
      if(!state.enabledRegions.has(g.region)) continue;
      const selected=state.selected===g.id;
      const hover=state.hovered===g.id;
      const sig=state.signal[g.id]||0;
      const rgb=palette[g.region];
      const r=selected?7:hover?5:Math.max(2.2,Math.log10(g.count+1)*.8);
      ctx.fillStyle=rgba(rgb,selected?.96:hover?.82:.5+sig*.45);
      ctx.beginPath();ctx.arc(x,y,r+sig*4,0,Math.PI*2);ctx.fill();
      if(selected||hover) {
        ctx.strokeStyle=rgba(rgb,.5);ctx.lineWidth=1;
        ctx.beginPath();ctx.arc(x,y,r+7+Math.sin(t*3)*1.5,0,Math.PI*2);ctx.stroke();
      }
      if(state.showLabels && (selected||hover||g.count>3000)) {
        ctx.font=`${selected?'600':'500'} 9px Inter, sans-serif`;
        ctx.fillStyle=selected?'rgba(255,255,255,.95)':'rgba(255,255,255,.52)';
        ctx.fillText(g.name,x+r+8,y+3);
      }
    }

    if(state.signalPulse>0) state.signalPulse=Math.max(0,state.signalPulse-.016);
    updateSignal();
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  let lastSignalUpdate=0;
  function updateSignal() {
    const now=performance.now();
    if(now-lastSignalUpdate<85) return;
    lastSignalUpdate=now;
    const n=META.groups.length;
    state.signalNext.fill(0);
    for(let a=0;a<n;a++) {
      const current=state.signal[a];
      if(current<.003) continue;
      state.signalNext[a]=Math.max(state.signalNext[a],current*.83);
      let total=0;
      for(let b=0;b<n;b++) total += state.groupMatrix?.[a]?.[b]||0;
      if(total<=0) continue;
      for(let b=0;b<n;b++) {
        const w=state.groupMatrix[a][b]||0;
        if(!w) continue;
        const contribution=current*(w/total)*2.55;
        if(contribution>.005) state.signalNext[b]=Math.min(1,state.signalNext[b]+contribution);
      }
    }
    const tmp=state.signal; state.signal=state.signalNext; state.signalNext=tmp;
  }

  function pickGroup(x,y) {
    let best=null, dist=24;
    for(const p of state.projectedGroups) {
      if(!state.enabledRegions.has(p.group.region)) continue;
      const d=Math.hypot(x-p.x,y-p.y);
      if(d<dist) { dist=d; best=p.id; }
    }
    return best;
  }

  canvas.addEventListener('pointerdown',e=>{
    state.dragging=true; state.lastX=e.clientX; state.lastY=e.clientY; canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    state.mouseX=e.clientX; state.mouseY=e.clientY;
    if(state.dragging) {
      const dx=e.clientX-state.lastX, dy=e.clientY-state.lastY;
      state.yaw += dx*.0052; state.pitch=Math.max(-1.1,Math.min(1.1,state.pitch+dy*.004));
      state.lastX=e.clientX; state.lastY=e.clientY;
    } else {
      state.hovered=pickGroup(e.clientX,e.clientY);
    }
  });
  canvas.addEventListener('pointerup',e=>{
    const id=pickGroup(e.clientX,e.clientY);
    state.dragging=false;
    if(id!=null) selectGroup(id);
  });
  canvas.addEventListener('pointerleave',()=>{ state.dragging=false; state.hovered=null; });
  canvas.addEventListener('wheel',e=>{
    e.preventDefault(); state.zoom=Math.max(.55,Math.min(2.2,state.zoom*(1-e.deltaY*.00075)));
  },{passive:false});

  function selectGroup(id) {
    const g=groupById.get(id);
    if(!g) return;
    state.selected=id;
    ui.selectedName.textContent=g.name;
    ui.selectedRegion.textContent=g.region.toUpperCase();
    ui.selectedCount.textContent=g.count.toLocaleString('en-US');
    const stats=matrixStats(id);
    ui.selectedOut.textContent=state.realLoaded ? Math.round(stats.out).toLocaleString('en-US') : 'EST.';
    ui.selectedIn.textContent=state.realLoaded ? Math.round(stats.inflow).toLocaleString('en-US') : 'EST.';
    ui.stimulate.disabled=false;
    ui.search.value=g.name;
    ui.results.innerHTML='';
    ui.hint.textContent='SELECTED '+g.name+' · STIMULATE TO TRACE SIGNAL';
  }

  function clearSelection() {
    state.selected=null;
    ui.selectedName.textContent='WHOLE BRAIN';
    ui.selectedRegion.textContent='ALL';
    ui.selectedCount.textContent=META.neuronCount.toLocaleString('en-US');
    ui.selectedOut.textContent='—'; ui.selectedIn.textContent='—';
    ui.stimulate.disabled=true;
    ui.hint.textContent='DRAG TO ORBIT · WHEEL TO ZOOM · CLICK A CLUSTER';
  }

  ui.search.addEventListener('input',()=>{
    const q=ui.search.value.trim().toUpperCase();
    if(!q) { ui.results.innerHTML=''; return; }
    const matches=META.groups.filter(g=>g.name.includes(q)&&g.count>0).slice(0,8);
    ui.results.innerHTML=matches.map(g=>`<button class="search-result" type="button" data-search-id="${g.id}"><span>${g.name}</span><small>${g.count.toLocaleString('en-US')}</small></button>`).join('');
  });
  ui.results.addEventListener('click',e=>{
    const btn=e.target.closest('[data-search-id]'); if(!btn) return; selectGroup(Number(btn.dataset.searchId));
  });
  ui.search.addEventListener('keydown',e=>{ if(e.key==='Escape'){ui.search.value='';ui.results.innerHTML='';clearSelection();} });

  document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('is-active',b===btn));
    state.mode=btn.dataset.mode;
    if(state.mode==='signal') ui.hint.textContent=state.selected!=null?'PRESS STIMULATE TO PROPAGATE ACTIVITY':'SELECT A NEURAL GROUP FIRST';
    if(state.mode==='data') ui.hint.textContent='DATA VIEW · SELECTED CLUSTER ISOLATION';
    if(state.mode==='map') ui.hint.textContent='DRAG TO ORBIT · WHEEL TO ZOOM · CLICK A CLUSTER';
  }));

  ui.stimulate.addEventListener('click',()=>{
    if(state.selected==null) return;
    state.signal[state.selected]=1;
    state.signalPulse=1;
    ui.stimulate.classList.add('is-firing');
    setTimeout(()=>ui.stimulate.classList.remove('is-firing'),260);
    document.querySelector('[data-mode="signal"]')?.click();
  });

  document.querySelectorAll('[data-region]').forEach(input=>input.addEventListener('change',()=>{
    input.checked?state.enabledRegions.add(input.dataset.region):state.enabledRegions.delete(input.dataset.region);
  }));
  document.querySelector('[data-toggle="edges"]').addEventListener('change',e=>state.showEdges=e.target.checked);
  document.querySelector('[data-toggle="labels"]').addEventListener('change',e=>state.showLabels=e.target.checked);
  document.querySelector('[data-toggle="rotate"]').addEventListener('change',e=>state.autoRotate=e.target.checked);

  async function fetchWithProgress(url,onProgress) {
    const res=await fetch(url,{cache:'force-cache'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const total=Number(res.headers.get('content-length'))||0;
    if(!res.body) return res.arrayBuffer();
    const reader=res.body.getReader();
    const chunks=[]; let loaded=0;
    while(true) {
      const {done,value}=await reader.read(); if(done) break;
      chunks.push(value); loaded+=value.byteLength; onProgress(loaded,total);
    }
    const out=new Uint8Array(loaded); let offset=0;
    chunks.forEach(c=>{out.set(c,offset);offset+=c.byteLength;});
    return out.buffer;
  }

  async function gunzip(buffer) {
    if(typeof DecompressionStream==='undefined') throw new Error('DecompressionStream not supported');
    const ds=new DecompressionStream('gzip');
    const stream=new Blob([buffer]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer();
  }

  function parseRealConnectome(buffer) {
    const view=new DataView(buffer);
    const neuronCount=view.getUint32(0,true);
    const edgeCount=view.getUint32(4,true);
    const edgeOffset=8;
    const metaOffset=edgeOffset+edgeCount*12;
    if(metaOffset+neuronCount*3>buffer.byteLength) throw new Error('Unexpected binary size');
    const groupIds=new Uint16Array(neuronCount);
    for(let i=0;i<neuronCount;i++) groupIds[i]=view.getUint16(metaOffset+i*3+1,true);
    const n=META.groups.length;
    const matrix=Array.from({length:n},()=>new Float64Array(n));
    for(let e=0;e<edgeCount;e++) {
      const base=edgeOffset+e*12;
      const pre=view.getUint32(base,true), post=view.getUint32(base+4,true);
      const weight=Math.abs(view.getFloat32(base+8,true));
      const a=groupIds[pre], b=groupIds[post];
      if(a<n&&b<n) matrix[a][b]+=Math.max(.001,weight);
    }
    return {neuronCount,edgeCount,matrix};
  }

  ui.load.addEventListener('click', async()=>{
    if(state.realLoaded||state.realLoading) return;
    state.realLoading=true; ui.load.disabled=true;
    ui.statusPill.textContent='DOWNLOADING'; ui.loadLabel.textContent='LOADING CONNECTOME';
    ui.loadCopy.textContent='Descargando topología comprimida y reconstruyendo una matriz de conectividad entre grupos neuronales.';
    try {
      const compressed=await fetchWithProgress(META.binaryUrl,(loaded,total)=>{
        const pct=total?Math.min(82,(loaded/total)*82):Math.min(82,loaded/(12.4*1024*1024)*82);
        ui.loadMeter.style.width=`${pct}%`;
        ui.loadNote.textContent=`${(loaded/1048576).toFixed(1)} MB${total?` / ${(total/1048576).toFixed(1)} MB`:''}`;
      });
      ui.statusPill.textContent='DECOMPRESSING'; ui.loadMeter.style.width='88%';
      const raw=await gunzip(compressed);
      ui.statusPill.textContent='MAPPING'; ui.loadMeter.style.width='94%';
      await new Promise(r=>setTimeout(r,40));
      const parsed=parseRealConnectome(raw);
      state.groupMatrix=parsed.matrix; state.realLoaded=true; state.realLoading=false;
      ui.loadMeter.style.width='100%'; ui.loadLabel.textContent='REAL CONNECTOME LOADED';
      ui.statusPill.textContent='LIVE DATA'; ui.statusPill.classList.add('is-live');
      ui.liveState.classList.add('is-live'); ui.liveCopy.textContent='REAL TOPOLOGY ACTIVE';
      ui.edgeCount.textContent=(parsed.edgeCount/1e6).toFixed(2)+'M'; ui.edgeCopy.textContent='weighted edges loaded';
      ui.loadCopy.textContent=`Topología real activa: ${parsed.neuronCount.toLocaleString('en-US')} neuronas y ${parsed.edgeCount.toLocaleString('en-US')} conexiones procesadas localmente.`;
      ui.loadNote.textContent='FlyWire FAFB v783 · visualización agregada por grupos';
      if(state.selected!=null) selectGroup(state.selected);
    } catch(err) {
      console.error(err);
      state.realLoading=false; ui.load.disabled=false;
      ui.statusPill.textContent='LOAD FAILED'; ui.statusPill.classList.add('is-error');
      ui.loadLabel.textContent='RETRY REAL CONNECTOME'; ui.loadMeter.style.width='0%';
      ui.loadCopy.textContent='No pude cargar el binario remoto. La proyección sigue funcionando con las proporciones reales del dataset.';
      ui.loadNote.textContent=String(err.message||err);
    }
  });

  document.querySelectorAll('[data-internal-link]').forEach(link=>link.addEventListener('click',e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    e.preventDefault();
    try { sessionStorage.setItem('deushimaShutterTransition','pending'); } catch {}
    document.body.classList.add('is-leaving');
    setTimeout(()=>{ location.href=link.href; },740);
  }));

  if(document.documentElement.classList.contains('is-shutter-entering')) {
    setTimeout(()=>document.documentElement.classList.remove('is-shutter-entering'),1050);
  }
})();
